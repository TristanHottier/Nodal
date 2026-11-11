//! MNA system assembly. Stamps follow docs/reference/mna.md.

use crate::linalg::DenseMatrix;

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
}
