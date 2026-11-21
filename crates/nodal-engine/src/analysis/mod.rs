//! Analyses and their results.

mod ac;
mod dc;
pub mod integrate;
mod newton;
mod op;
mod tran;

use serde::{Deserialize, Serialize};

pub use ac::{AcResult, ComplexSeries, solve_ac};
pub use dc::{DcResult, solve_dc_sweep};
pub use op::{OpResult, solve_op};
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
