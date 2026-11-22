//! Analyses and their results.

mod ac;
mod dc;
pub mod integrate;
mod newton;
mod op;
mod tran;

use serde::{Deserialize, Serialize};

pub(crate) use ac::solve_ac_with_progress;
pub use ac::{AcResult, ComplexSeries, solve_ac};
pub(crate) use dc::solve_dc_sweep_with_progress;
pub use dc::{DcResult, solve_dc_sweep};
pub use op::{OpResult, solve_op};
pub(crate) use tran::solve_tran_with_progress;
pub use tran::{DEFAULT_CHGTOL, DEFAULT_TRTOL, TranResult, TranSpec, solve_tran};

/// The result of one analysis, tagged by `type` in JSON.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum AnalysisResult {
    Op(OpResult),
    Dc(DcResult),
    Ac(AcResult),
    Tran(TranResult),
}
