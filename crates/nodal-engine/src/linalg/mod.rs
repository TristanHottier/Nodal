//! Linear solves behind a backend-neutral trait (ADR 0003).
//!
//! The trait is real-valued in M1. M3 generalizes it over the scalar type for
//! AC analysis. No backend types appear in the signature, so a sparse backend
//! can be added without touching the analyses.

mod dense;

pub use dense::{DenseLu, DenseMatrix};

/// Failure of a factorization or a solve.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SolveError {
    /// The pivot in column `index` is zero or negligible, or a solve produced
    /// a non-finite value.
    SingularPivot { index: usize },
    /// `solve` was called before a successful `factor`.
    NotFactored,
    /// The right-hand side length differs from the factored matrix size.
    DimensionMismatch,
}

impl std::fmt::Display for SolveError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::SingularPivot { index } => {
                write!(f, "singular matrix: negligible pivot in column {index}")
            }
            Self::NotFactored => write!(f, "solve called before factor"),
            Self::DimensionMismatch => {
                write!(f, "right-hand side length does not match matrix size")
            }
        }
    }
}

impl std::error::Error for SolveError {}

/// A linear solver: factor a matrix, then solve against it.
///
/// Refactor whenever the matrix values change.
pub trait LinearSolver {
    /// Factors `a`, replacing any previous factorization.
    fn factor(&mut self, a: &DenseMatrix) -> Result<(), SolveError>;

    /// Solves `A x = b` in place: on return `b` holds `x`.
    fn solve(&self, b: &mut [f64]) -> Result<(), SolveError>;
}
