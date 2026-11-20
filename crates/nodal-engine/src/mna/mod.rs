//! MNA system assembly. Stamps follow docs/reference/mna.md.

use crate::linalg::{C64, DenseMatrix};

/// The real-valued system `A x = b`.
#[derive(Debug, Clone, PartialEq)]
pub struct RealSystem {
    pub a: DenseMatrix,
    pub b: Vec<f64>,
    /// The first stamp that fell outside the system, as `(row, column)`.
    /// `add_b` records `(row, usize::MAX)`. A device bug, never a netlist one.
    pub out_of_range: Option<(usize, usize)>,
}

impl RealSystem {
    /// A zeroed system with `n` unknowns.
    pub fn new(n: usize) -> Self {
        Self {
            a: DenseMatrix::zeros(n),
            b: vec![0.0; n],
            out_of_range: None,
        }
    }

    /// Adds `v` to `A[row, col]`. `None` is ground and is skipped.
    pub fn add_a(&mut self, row: Option<usize>, col: Option<usize>, v: f64) {
        if let (Some(r), Some(c)) = (row, col)
            && !self.a.add(r, c, v)
        {
            self.out_of_range.get_or_insert((r, c));
        }
    }

    /// Adds `v` to `b[row]`. `None` is ground and is skipped.
    pub fn add_b(&mut self, row: Option<usize>, v: f64) {
        if let Some(r) = row {
            match self.b.get_mut(r) {
                Some(slot) => *slot += v,
                None => {
                    self.out_of_range.get_or_insert((r, usize::MAX));
                }
            }
        }
    }
}

/// The right-hand side of the complex small-signal system.
#[derive(Debug, Clone, PartialEq)]
pub struct AcExcitation {
    pub b: Vec<C64>,
    /// The first row index that fell outside the system. A device bug, never
    /// a netlist one.
    pub out_of_range: Option<usize>,
}

impl AcExcitation {
    /// A zeroed excitation with `n` unknowns.
    pub fn new(n: usize) -> Self {
        Self {
            b: vec![C64::new(0.0, 0.0); n],
            out_of_range: None,
        }
    }

    /// Adds `v` to `b[row]`. `None` is ground and is skipped.
    pub fn add(&mut self, row: Option<usize>, v: C64) {
        if let Some(r) = row {
            match self.b.get_mut(r) {
                Some(slot) => *slot += v,
                None => {
                    self.out_of_range.get_or_insert(r);
                }
            }
        }
    }
}

/// The complex matrix `G + j omega C`.
pub fn assemble_ac(g: &DenseMatrix, c: &DenseMatrix, omega: f64) -> DenseMatrix<C64> {
    let n = g.n();
    let mut a = DenseMatrix::<C64>::zeros(n);
    for r in 0..n {
        for col in 0..n {
            a.add(r, col, C64::new(g.get(r, col), omega * c.get(r, col)));
        }
    }
    a
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn out_of_range_stamp_is_recorded() {
        let mut sys = RealSystem::new(2);
        sys.add_a(Some(0), Some(1), 1.0);
        sys.add_b(Some(1), 1.0);
        assert_eq!(sys.out_of_range, None);
        sys.add_a(Some(2), Some(0), 1.0);
        sys.add_a(Some(0), Some(5), 1.0);
        assert_eq!(sys.out_of_range, Some((2, 0)));
        let mut sys = RealSystem::new(2);
        sys.add_b(Some(7), 1.0);
        assert_eq!(sys.out_of_range, Some((7, usize::MAX)));
    }

    #[test]
    fn assemble_ac_combines() {
        let mut g = DenseMatrix::zeros(2);
        let mut c = DenseMatrix::zeros(2);
        g.add(0, 0, 2.0);
        g.add(0, 1, -1.0);
        c.add(0, 0, 3.0);
        c.add(1, 1, 5.0);
        let a = assemble_ac(&g, &c, 10.0);
        assert_eq!(a.n(), 2);
        assert_eq!(a.get(0, 0), C64::new(2.0, 30.0));
        assert_eq!(a.get(0, 1), C64::new(-1.0, 0.0));
        assert_eq!(a.get(1, 0), C64::new(0.0, 0.0));
        assert_eq!(a.get(1, 1), C64::new(0.0, 50.0));
    }

    #[test]
    fn ac_excitation_out_of_range() {
        let mut e = AcExcitation::new(2);
        e.add(Some(1), C64::new(1.0, 2.0));
        e.add(None, C64::new(9.0, 9.0));
        e.add(Some(1), C64::new(0.5, 0.0));
        assert_eq!(e.out_of_range, None);
        assert_eq!(e.b, vec![C64::new(0.0, 0.0), C64::new(1.5, 2.0)]);
        e.add(Some(4), C64::new(1.0, 0.0));
        e.add(Some(7), C64::new(1.0, 0.0));
        assert_eq!(e.out_of_range, Some(4));
    }
}
