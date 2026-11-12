//! Analyses and their results.

mod dc;
mod newton;
mod op;

use serde::{Deserialize, Serialize};

pub use dc::{DcResult, solve_dc_sweep};
pub use op::{OpResult, solve_op};

/// The result of one analysis, tagged by `type` in JSON.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum AnalysisResult {
    Op(OpResult),
    Dc(DcResult),
}
