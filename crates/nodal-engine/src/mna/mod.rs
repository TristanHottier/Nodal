//! MNA system assembly. Stamps follow docs/reference/mna.md.

use crate::linalg::DenseMatrix;

/// The real-valued system `A x = b`.
#[derive(Debug, Clone, PartialEq)]
pub struct RealSystem {
    pub a: DenseMatrix,
    pub b: Vec<f64>,
}

impl RealSystem {
    /// A zeroed system with `n` unknowns.
    pub fn new(n: usize) -> Self {
        Self {
            a: DenseMatrix::zeros(n),
            b: vec![0.0; n],
        }
    }

    /// Adds `v` to `A[row, col]`. `None` is ground and is skipped.
    pub fn add_a(&mut self, row: Option<usize>, col: Option<usize>, v: f64) {
        if let (Some(r), Some(c)) = (row, col) {
            self.a.add(r, c, v);
        }
    }

    /// Adds `v` to `b[row]`. `None` is ground and is skipped.
    pub fn add_b(&mut self, row: Option<usize>, v: f64) {
        if let Some(slot) = row.and_then(|r| self.b.get_mut(r)) {
            *slot += v;
        }
    }
}
