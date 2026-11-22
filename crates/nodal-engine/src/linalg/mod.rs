//! Linear solves behind a backend-neutral trait (ADR 0003).
//!
//! The trait is generic over the scalar type: `f64` for DC and transient
//! analyses, `C64` for AC analysis. No backend types appear in the signature,
//! so the analyses use `SparseLu` while `DenseLu` stays as the test oracle.

mod dense;
mod sparse;

pub use dense::{DenseLu, DenseMatrix};
pub use faer::c64 as C64;
pub use sparse::SparseLu;

mod sealed {
    pub trait Sealed {}
    impl Sealed for f64 {}
    impl Sealed for super::C64 {}
}

/// The scalar types the dense solver supports: `f64` and `C64`.
pub trait Scalar:
    Copy + Default + std::ops::AddAssign + faer::traits::ComplexField + sealed::Sealed
{
    /// Absolute value for reals, complex modulus for `C64`.
    fn modulus(self) -> f64;
    /// `true` when no component is NaN or infinite.
    fn is_finite(self) -> bool;
}

impl Scalar for f64 {
    fn modulus(self) -> f64 {
        self.abs()
    }
    fn is_finite(self) -> bool {
        f64::is_finite(self)
    }
}

impl Scalar for C64 {
    fn modulus(self) -> f64 {
        self.re.hypot(self.im)
    }
    fn is_finite(self) -> bool {
        self.re.is_finite() && self.im.is_finite()
    }
}

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
pub trait LinearSolver<T: Scalar = f64> {
    /// Factors `a`, replacing any previous factorization.
    fn factor(&mut self, a: &DenseMatrix<T>) -> Result<(), SolveError>;

    /// Solves `A x = b` in place: on return `b` holds `x`.
    fn solve(&self, b: &mut [T]) -> Result<(), SolveError>;
}
