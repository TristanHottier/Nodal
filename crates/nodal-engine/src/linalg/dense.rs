//! Dense matrix and the faer partial-pivot LU backend.

use super::{LinearSolver, SolveError};

/// Square matrix of `f64`, stored row-major.
#[derive(Debug, Clone, PartialEq)]
pub struct DenseMatrix {
    n: usize,
    data: Vec<f64>,
}

impl DenseMatrix {
    /// An `n` by `n` matrix of zeros.
    pub fn zeros(n: usize) -> Self {
        Self {
            n,
            data: vec![0.0; n * n],
        }
    }

    /// The matrix dimension.
    pub fn n(&self) -> usize {
        self.n
    }

    /// Entry at row `r`, column `c`. Out-of-range indices return 0.
    pub fn get(&self, r: usize, c: usize) -> f64 {
        if r < self.n && c < self.n {
            self.data[r * self.n + c]
        } else {
            0.0
        }
    }

    /// Adds `v` to the entry at row `r`, column `c` (the stamping operation).
    /// Out-of-range indices are ignored.
    pub fn add(&mut self, r: usize, c: usize, v: f64) {
        if r < self.n && c < self.n {
            self.data[r * self.n + c] += v;
        }
    }
}

/// Dense LU with partial pivoting, from faer.
#[derive(Debug, Default)]
pub struct DenseLu {
    lu: Option<faer::linalg::solvers::PartialPivLu<f64>>,
}

impl DenseLu {
    pub fn new() -> Self {
        Self::default()
    }
}

impl LinearSolver for DenseLu {
    fn factor(&mut self, a: &DenseMatrix) -> Result<(), SolveError> {
        self.lu = None;
        let n = a.n();
        if n == 0 {
            return Ok(());
        }
        // Largest magnitude in each column of the original matrix. A
        // non-finite entry rejects the system (f64::max would skip NaN).
        let mut col_max = vec![0.0_f64; n];
        for r in 0..n {
            for (c, cm) in col_max.iter_mut().enumerate() {
                let v = a.data[r * n + c];
                if !v.is_finite() {
                    return Err(SolveError::SingularPivot { index: c });
                }
                if v.abs() > *cm {
                    *cm = v.abs();
                }
            }
        }
        let m = faer::Mat::<f64>::from_fn(n, n, |r, c| a.data[r * n + c]);
        let lu = faer::linalg::solvers::PartialPivLu::new(m.as_ref());
        let u = lu.U();
        // Row pivoting leaves U's column order unchanged, so U[k, k] is the
        // pivot of column k of A. Each pivot is compared with its own
        // column of A, so unrelated scales elsewhere do not cause rejection.
        for k in 0..n {
            let pivot = u[(k, k)];
            let threshold = n as f64 * f64::EPSILON * col_max[k];
            if pivot.is_nan() || pivot.abs() <= threshold {
                return Err(SolveError::SingularPivot { index: k });
            }
        }
        self.lu = Some(lu);
        Ok(())
    }

    fn solve(&self, b: &mut [f64]) -> Result<(), SolveError> {
        use faer::linalg::solvers::{ShapeCore, Solve};
        let Some(lu) = &self.lu else {
            // An empty system factors to nothing and solves trivially.
            return if b.is_empty() {
                Ok(())
            } else {
                Err(SolveError::NotFactored)
            };
        };
        let n = lu.nrows();
        if b.len() != n {
            return Err(SolveError::DimensionMismatch);
        }
        lu.solve_in_place(faer::MatMut::from_column_major_slice_mut(b, n, 1));
        match b.iter().position(|v| !v.is_finite()) {
            Some(index) => Err(SolveError::SingularPivot { index }),
            None => Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::error::Error;

    fn matrix(rows: &[&[f64]]) -> DenseMatrix {
        let mut m = DenseMatrix::zeros(rows.len());
        for (r, row) in rows.iter().enumerate() {
            for (c, v) in row.iter().enumerate() {
                m.add(r, c, *v);
            }
        }
        m
    }

    #[test]
    fn solves_2x2() -> Result<(), Box<dyn Error>> {
        let mut lu = DenseLu::new();
        lu.factor(&matrix(&[&[2.0, 1.0], &[1.0, 3.0]]))?;
        let mut b = [3.0, 5.0];
        lu.solve(&mut b)?;
        assert!((b[0] - 0.8).abs() <= 1e-15, "x0 = {}", b[0]);
        assert!((b[1] - 1.4).abs() <= 1e-15, "x1 = {}", b[1]);
        Ok(())
    }

    #[test]
    fn needs_pivoting() -> Result<(), Box<dyn Error>> {
        let mut lu = DenseLu::new();
        lu.factor(&matrix(&[&[0.0, 1.0], &[1.0, 0.0]]))?;
        let mut b = [2.0, 3.0];
        lu.solve(&mut b)?;
        assert_eq!(b, [3.0, 2.0]);
        Ok(())
    }

    #[test]
    fn rank_deficient_is_singular() {
        let mut lu = DenseLu::new();
        let r = lu.factor(&matrix(&[&[1.0, 2.0], &[2.0, 4.0]]));
        assert_eq!(r, Err(SolveError::SingularPivot { index: 1 }));
    }

    #[test]
    fn all_zero_is_singular_at_index_0() {
        let mut lu = DenseLu::new();
        let r = lu.factor(&DenseMatrix::zeros(3));
        assert_eq!(r, Err(SolveError::SingularPivot { index: 0 }));
    }

    #[test]
    fn wide_dynamic_range_is_not_singular() -> Result<(), Box<dyn Error>> {
        // Unknowns [V(a), V(b), I(V1)]. V1: a to ground, 1 V.
        // R1 = 1 mOhm between a and b, R2 = 1 GOhm from b to ground.
        let g1 = 1.0 / 1e-3;
        let g2 = 1.0 / 1e9;
        let mut m = DenseMatrix::zeros(3);
        m.add(0, 0, g1);
        m.add(0, 1, -g1);
        m.add(1, 0, -g1);
        m.add(1, 1, g1 + g2);
        // Branch current flows from n+ (a) through V1 to n- (ground).
        m.add(0, 2, 1.0);
        m.add(2, 0, 1.0);
        let mut lu = DenseLu::new();
        lu.factor(&m)?;
        let mut b = [0.0, 0.0, 1.0];
        lu.solve(&mut b)?;
        let i_ref = -1.0 / (1e9 + 1e-3);
        assert!(
            (b[2] - i_ref).abs() <= 1e-5 * i_ref.abs() + 1e-13,
            "I(V1) = {}, expected {i_ref}",
            b[2]
        );
        Ok(())
    }

    #[test]
    fn milliohm_and_teraohm_class_matrix_is_not_singular() -> Result<(), Box<dyn Error>> {
        // I1 0 a 1e-13; R1 a 0 1e13; V1 b 0 1; R2 b 0 1e-3.
        // Unknowns [V(a), V(b), I(V1)].
        let mut m = DenseMatrix::zeros(3);
        m.add(0, 0, 1.0 / 1e13);
        m.add(1, 1, 1.0 / 1e-3);
        m.add(1, 2, 1.0);
        m.add(2, 1, 1.0);
        let mut lu = DenseLu::new();
        lu.factor(&m)?;
        let mut b = [1e-13, 0.0, 1.0];
        lu.solve(&mut b)?;
        assert!((b[0] - 1.0).abs() <= 1e-5 + 1e-8, "V(a) = {}", b[0]);
        assert!((b[1] - 1.0).abs() <= 1e-5 + 1e-8, "V(b) = {}", b[1]);
        assert!((b[2] + 1e3).abs() <= 1e-5 * 1e3 + 1e-13, "I(V1) = {}", b[2]);
        Ok(())
    }

    #[test]
    fn nan_entry_is_rejected() {
        let mut lu = DenseLu::new();
        let r = lu.factor(&matrix(&[&[1.0, 0.0], &[0.0, f64::NAN]]));
        assert_eq!(r, Err(SolveError::SingularPivot { index: 1 }));
    }

    #[test]
    fn solve_before_factor() {
        let lu = DenseLu::new();
        let mut b = [1.0];
        assert_eq!(lu.solve(&mut b), Err(SolveError::NotFactored));
    }

    #[test]
    fn solve_checks_dimension() -> Result<(), Box<dyn Error>> {
        let mut lu = DenseLu::new();
        lu.factor(&matrix(&[&[1.0, 0.0], &[0.0, 1.0]]))?;
        let mut b = [1.0];
        assert_eq!(lu.solve(&mut b), Err(SolveError::DimensionMismatch));
        Ok(())
    }
}
