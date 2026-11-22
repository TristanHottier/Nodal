//! Sparse LU backend: faer's simplicial left-looking LU with partial
//! pivoting behind the same `LinearSolver` trait as `DenseLu`.
//!
//! The nonzero pattern of the input is collected column by column. When the
//! pattern equals the previous one, the cached fill-reducing column
//! permutation (COLAMD, from faer's symbolic LU) is reused and only the
//! numeric factorization runs. Transient and AC loops refactor the same
//! pattern thousands of times, so the symbolic step is paid once.
//!
//! The singular rule is the dense one: the pivot of original column `k` must
//! exceed `n * eps * max |A[:, k]|`. The simplicial factorization visits
//! columns in the permuted order, so the pivot of original column `k` is
//! `U[j, j]` with `perm[j] == k`.

use super::{DenseLu, DenseMatrix, LinearSolver, Scalar, SolveError};
use faer::dyn_stack::{MemBuffer, MemStack};
use faer::perm::PermRef;
use faer::sparse::linalg::lu::{LuSymbolicParams, SymbolicLu, factorize_symbolic_lu, simplicial};
use faer::sparse::{SparseColMatRef, SymbolicSparseColMatRef};
use faer::{Conj, MatMut, Par};
use std::cell::RefCell;

/// Column-compressed nonzero pattern with its cached symbolic analysis.
struct Pattern {
    col_ptr: Vec<usize>,
    row_idx: Vec<usize>,
    symbolic: SymbolicLu<usize>,
}

/// Sparse LU with a cached symbolic analysis.
pub struct SparseLu<T: Scalar = f64> {
    n: usize,
    pattern: Option<Pattern>,
    // Scratch buffers for pattern collection, reused across factorizations.
    col_ptr: Vec<usize>,
    row_idx: Vec<usize>,
    values: Vec<T>,
    trip: Vec<(usize, usize, T)>,
    next: Vec<usize>,
    numeric: simplicial::SimplicialLu<usize, T>,
    row_perm: Vec<usize>,
    row_perm_inv: Vec<usize>,
    factored: bool,
    // Dimension the scratch buffers were sized for.
    mem_n: usize,
    factor_mem: MemBuffer,
    solve_mem: RefCell<MemBuffer>,
}

impl<T: Scalar> std::fmt::Debug for SparseLu<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SparseLu")
            .field("n", &self.n)
            .field("factored", &self.factored)
            .finish_non_exhaustive()
    }
}

impl<T: Scalar> Default for SparseLu<T> {
    fn default() -> Self {
        Self {
            n: 0,
            pattern: None,
            col_ptr: Vec::new(),
            row_idx: Vec::new(),
            values: Vec::new(),
            trip: Vec::new(),
            next: Vec::new(),
            numeric: simplicial::SimplicialLu::new(),
            row_perm: Vec::new(),
            row_perm_inv: Vec::new(),
            factored: false,
            mem_n: 0,
            factor_mem: MemBuffer::new(faer::dyn_stack::StackReq::empty()),
            solve_mem: RefCell::new(MemBuffer::new(faer::dyn_stack::StackReq::empty())),
        }
    }
}

impl<T: Scalar> SparseLu<T> {
    pub fn new() -> Self {
        Self::default()
    }

    /// Fills `col_ptr`, `row_idx` and `values` with the nonzeros of `a`
    /// (row indices ascending within each column). Returns the largest
    /// modulus of each column, or the first column holding a non-finite entry.
    ///
    /// One pass over the dense storage gathers the nonzeros as triplets in
    /// row-major order; a counting sort by column then yields the compressed
    /// form without a second scan.
    fn collect(&mut self, a: &DenseMatrix<T>) -> Result<Vec<f64>, SolveError> {
        let n = a.n();
        let mut col_max = vec![0.0_f64; n];
        self.col_ptr.clear();
        self.col_ptr.resize(n + 1, 0);
        self.trip.clear();
        for (r, row) in a.as_row_major().chunks_exact(n).enumerate() {
            for (c, &v) in row.iter().enumerate() {
                let m = v.modulus();
                if m == 0.0 {
                    continue;
                }
                if !v.is_finite() {
                    return Err(SolveError::SingularPivot { index: c });
                }
                if m > col_max[c] {
                    col_max[c] = m;
                }
                self.col_ptr[c + 1] += 1;
                self.trip.push((r, c, v));
            }
        }
        for c in 0..n {
            self.col_ptr[c + 1] += self.col_ptr[c];
        }
        let nnz = self.trip.len();
        self.row_idx.clear();
        self.row_idx.resize(nnz, 0);
        self.values.clear();
        self.values.resize(nnz, T::default());
        self.next.clear();
        self.next.extend_from_slice(&self.col_ptr[..n]);
        for &(r, c, v) in &self.trip {
            let slot = self.next[c];
            self.row_idx[slot] = r;
            self.values[slot] = v;
            self.next[c] = slot + 1;
        }
        Ok(col_max)
    }

    /// The error label for a failed factorization. The dense backend's rule
    /// reports the smallest failing original column; reproduce it so error
    /// labels do not depend on the backend. Failure is the rare path.
    fn dense_label(a: &DenseMatrix<T>, fallback: usize) -> SolveError {
        match DenseLu::<T>::new().factor(a) {
            Err(e) => e,
            Ok(()) => SolveError::SingularPivot { index: fallback },
        }
    }
}

impl<T: Scalar> LinearSolver<T> for SparseLu<T> {
    fn factor(&mut self, a: &DenseMatrix<T>) -> Result<(), SolveError> {
        self.factored = false;
        let n = a.n();
        self.n = n;
        if n == 0 {
            return Ok(());
        }
        let col_max = self.collect(a)?;
        let same = self
            .pattern
            .as_ref()
            .is_some_and(|p| p.col_ptr == self.col_ptr && p.row_idx == self.row_idx);
        if !same {
            let sym =
                SymbolicSparseColMatRef::new_checked(n, n, &self.col_ptr, None, &self.row_idx);
            match factorize_symbolic_lu(sym, LuSymbolicParams::default()) {
                Ok(symbolic) => {
                    self.pattern = Some(Pattern {
                        col_ptr: self.col_ptr.clone(),
                        row_idx: self.row_idx.clone(),
                        symbolic,
                    });
                }
                Err(_) => {
                    self.pattern = None;
                    return Err(Self::dense_label(a, 0));
                }
            }
        }
        let Some(pattern) = &self.pattern else {
            return Err(SolveError::NotFactored);
        };
        let sym =
            SymbolicSparseColMatRef::new_checked(n, n, &pattern.col_ptr, None, &pattern.row_idx);
        let mat = SparseColMatRef::new(sym, &self.values);
        let col_perm = pattern.symbolic.col_perm();
        self.row_perm.resize(n, 0);
        self.row_perm_inv.resize(n, 0);
        if self.mem_n != n {
            self.mem_n = n;
            self.factor_mem =
                MemBuffer::new(simplicial::factorize_simplicial_numeric_lu_scratch::<
                    usize,
                    T,
                >(n, n));
            *self.solve_mem.get_mut() = MemBuffer::new(simplicial::solve_in_place_scratch::<
                usize,
                T,
            >(n, 1, Par::Seq));
        }
        let res = simplicial::factorize_simplicial_numeric_lu(
            &mut self.row_perm,
            &mut self.row_perm_inv,
            &mut self.numeric,
            mat,
            col_perm,
            MemStack::new(&mut self.factor_mem),
        );
        if let Err(e) = res {
            let fallback = match e {
                faer::sparse::linalg::LuError::SymbolicSingular { index } => {
                    col_perm.arrays().0.get(index).copied().unwrap_or(0)
                }
                _ => 0,
            };
            return Err(Self::dense_label(a, fallback));
        }
        // The pivot of permuted column j is the last entry of column j of U.
        let u = self.numeric.u_factor_unsorted();
        let perm = col_perm.arrays().0;
        let mut bad: Option<usize> = None;
        for (j, &k) in perm.iter().enumerate() {
            let pivot = u.val_of_col(j).last().map_or(0.0, |v| v.modulus());
            let threshold = n as f64 * f64::EPSILON * col_max[k];
            if (pivot.is_nan() || pivot <= threshold) && bad.is_none_or(|b| k < b) {
                bad = Some(k);
            }
        }
        if let Some(k) = bad {
            return Err(Self::dense_label(a, k));
        }
        self.factored = true;
        Ok(())
    }

    fn solve(&self, b: &mut [T]) -> Result<(), SolveError> {
        if self.n == 0 {
            return if b.is_empty() {
                Ok(())
            } else {
                Err(SolveError::NotFactored)
            };
        }
        let (true, Some(pattern)) = (self.factored, &self.pattern) else {
            return Err(SolveError::NotFactored);
        };
        let n = self.n;
        if b.len() != n {
            return Err(SolveError::DimensionMismatch);
        }
        let row_perm = PermRef::new_checked(&self.row_perm, &self.row_perm_inv, n);
        let mut mem = self.solve_mem.borrow_mut();
        self.numeric.solve_in_place_with_conj(
            row_perm,
            pattern.symbolic.col_perm(),
            Conj::No,
            MatMut::from_column_major_slice_mut(b, n, 1),
            Par::Seq,
            MemStack::new(&mut mem),
        );
        match b.iter().position(|v| !v.is_finite()) {
            Some(index) => Err(SolveError::SingularPivot { index }),
            None => Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::linalg::C64;
    use std::error::Error;

    /// Small deterministic generator (xorshift64*), so tests need no crate.
    struct Rng(u64);

    impl Rng {
        fn next(&mut self) -> f64 {
            self.0 ^= self.0 >> 12;
            self.0 ^= self.0 << 25;
            self.0 ^= self.0 >> 27;
            let v = self.0.wrapping_mul(0x2545_F491_4F6C_DD1D);
            (v >> 11) as f64 / (1u64 << 53) as f64
        }
    }

    fn random_system<T: Scalar>(
        rng: &mut Rng,
        n: usize,
        make: &dyn Fn(f64, f64) -> T,
    ) -> (DenseMatrix<T>, Vec<T>) {
        let mut m = DenseMatrix::<T>::zeros(n);
        for r in 0..n {
            for c in 0..n {
                if r != c && rng.next() < 0.1 {
                    m.add(r, c, make(rng.next() - 0.5, rng.next() - 0.5));
                }
            }
        }
        // Diagonal dominance: each diagonal exceeds its row's absolute sum.
        for r in 0..n {
            let off: f64 = (0..n)
                .filter(|&c| c != r)
                .map(|c| m.get(r, c).modulus())
                .sum();
            m.add(r, r, make(off + 1.0 + rng.next(), 0.5 * rng.next()));
        }
        let b = (0..n)
            .map(|_| make(rng.next() - 0.5, rng.next() - 0.5))
            .collect();
        (m, b)
    }

    fn max_rel_diff<T: Scalar + std::ops::Sub<Output = T>>(x: &[T], y: &[T]) -> f64 {
        let num = x
            .iter()
            .zip(y)
            .map(|(&a, &b)| (a - b).modulus())
            .fold(0.0, f64::max);
        let den = y.iter().map(|v| v.modulus()).fold(0.0, f64::max);
        num / den
    }

    fn agree<T>(a: &DenseMatrix<T>, b: &[T]) -> Result<f64, Box<dyn Error>>
    where
        T: Scalar + std::ops::Sub<Output = T>,
    {
        let mut dense = b.to_vec();
        let mut d = DenseLu::<T>::new();
        d.factor(a)?;
        d.solve(&mut dense)?;
        let mut sparse = b.to_vec();
        let mut s = SparseLu::<T>::new();
        s.factor(a)?;
        s.solve(&mut sparse)?;
        Ok(max_rel_diff(&sparse, &dense))
    }

    #[test]
    fn matches_dense_on_random_sparse() -> Result<(), Box<dyn Error>> {
        let mut rng = Rng(0x9E37_79B9_7F4A_7C15);
        for _ in 0..20 {
            let (a, b) = random_system::<f64>(&mut rng, 30, &|re, _| re);
            let d = agree(&a, &b)?;
            assert!(d <= 1e-12, "real relative difference {d:e}");
            let (a, b) = random_system::<C64>(&mut rng, 30, &|re, im| C64::new(re, im));
            let d = agree(&a, &b)?;
            assert!(d <= 1e-12, "complex relative difference {d:e}");
        }
        Ok(())
    }

    #[test]
    fn singular_column_reports_original_index() {
        let mut rng = Rng(7);
        let (mut a, _) = random_system::<f64>(&mut rng, 5, &|re, _| re);
        let mut z = DenseMatrix::<f64>::zeros(5);
        for r in 0..5 {
            for c in 0..5 {
                if c != 3 {
                    z.add(r, c, a.get(r, c));
                }
            }
        }
        a = z;
        let r = SparseLu::<f64>::new().factor(&a);
        assert_eq!(r, Err(SolveError::SingularPivot { index: 3 }));
    }

    #[test]
    fn pattern_change_refactors() -> Result<(), Box<dyn Error>> {
        let mut rng = Rng(42);
        let (a, b) = random_system::<f64>(&mut rng, 30, &|re, _| re);
        let mut s = SparseLu::<f64>::new();
        s.factor(&a)?;
        // Zero one stored off-diagonal entry and create a new one.
        let mut changed = DenseMatrix::<f64>::zeros(30);
        let mut removed = false;
        for r in 0..30 {
            for c in 0..30 {
                let v = a.get(r, c);
                if !removed && r != c && v != 0.0 {
                    removed = true;
                } else {
                    changed.add(r, c, v);
                }
            }
        }
        let spot = (0..30)
            .flat_map(|r| (0..30).map(move |c| (r, c)))
            .find(|&(r, c)| r != c && changed.get(r, c) == 0.0)
            .ok_or("no empty slot")?;
        changed.add(spot.0, spot.1, 0.25);
        s.factor(&changed)?;
        let mut x = b.clone();
        s.solve(&mut x)?;
        let mut want = b.clone();
        let mut d = DenseLu::<f64>::new();
        d.factor(&changed)?;
        d.solve(&mut want)?;
        assert!(max_rel_diff(&x, &want) <= 1e-12);
        // Same pattern, new values: the cached symbolic analysis is reused.
        let mut scaled = DenseMatrix::<f64>::zeros(30);
        for r in 0..30 {
            for c in 0..30 {
                scaled.add(r, c, 2.0 * changed.get(r, c));
            }
        }
        s.factor(&scaled)?;
        let mut x2 = b.clone();
        s.solve(&mut x2)?;
        for (a, b) in x2.iter().zip(&want) {
            assert!((a - b / 2.0).abs() <= 1e-12 * (1.0 + b.abs()));
        }
        Ok(())
    }

    #[test]
    fn rejects_non_finite() {
        let mut m = DenseMatrix::<f64>::zeros(3);
        m.add(0, 0, 1.0);
        m.add(1, 1, f64::NAN);
        m.add(2, 2, 1.0);
        assert_eq!(
            SparseLu::<f64>::new().factor(&m),
            Err(SolveError::SingularPivot { index: 1 })
        );
        let mut c = DenseMatrix::<C64>::zeros(1);
        c.add(0, 0, C64::new(f64::INFINITY, 0.0));
        assert_eq!(
            SparseLu::<C64>::new().factor(&c),
            Err(SolveError::SingularPivot { index: 0 })
        );
    }

    #[test]
    fn solve_before_factor_and_dimension() -> Result<(), Box<dyn Error>> {
        let s = SparseLu::<f64>::new();
        assert_eq!(s.solve(&mut [1.0]), Err(SolveError::NotFactored));
        let mut m = DenseMatrix::<f64>::zeros(2);
        m.add(0, 0, 1.0);
        m.add(1, 1, 1.0);
        let mut s = SparseLu::<f64>::new();
        s.factor(&m)?;
        assert_eq!(s.solve(&mut [1.0]), Err(SolveError::DimensionMismatch));
        Ok(())
    }
}
