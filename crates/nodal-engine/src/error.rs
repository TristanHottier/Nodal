//! Typed errors. Library code returns these instead of panicking.

use std::fmt;

/// Everything the engine can report. Name lists are sorted ascending ASCII.
#[derive(Debug, Clone, PartialEq)]
pub enum Error {
    /// The JSON text could not be read as a netlist.
    Parse(String),
    /// The netlist parsed but breaks a validation rule.
    Invalid(String),
    /// Nodes with no DC path to ground.
    Floating {
        nodes: Vec<String>,
        elements: Vec<String>,
    },
    /// A loop of voltage sources and/or inductors.
    SourceLoop { elements: Vec<String> },
    /// The MNA matrix is singular at this unknown.
    Singular { unknown: String },
    /// Newton failed at every DC stage. Both lists hold at most five entries,
    /// sorted by magnitude descending: an exception to the ascending-name rule,
    /// because the worst offender comes first.
    NoConvergence {
        /// Unknown label (`V(a)`, `I(V1)`) and its last Newton update.
        updates: Vec<(String, f64)>,
        /// Node name and its KCL residual at the last iterate.
        residuals: Vec<(String, f64)>,
    },
    /// A DC sweep failed at one point. `cause` is the original error.
    SweepPoint {
        source: String,
        value: f64,
        cause: Box<Error>,
    },
    /// A bug in the engine, not a problem with the netlist.
    Internal(String),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Parse(msg) => write!(f, "parse error: {msg}"),
            Error::Invalid(msg) => write!(f, "invalid netlist: {msg}"),
            Error::Floating { nodes, elements } => write!(
                f,
                "floating nodes with no DC path to ground: {} (connected elements: {})",
                nodes.join(", "),
                elements.join(", ")
            ),
            Error::SourceLoop { elements } => write!(
                f,
                "loop of voltage sources and inductors: {}",
                elements.join(", ")
            ),
            Error::Singular { unknown } => {
                write!(f, "singular system: no unique solution for {unknown}")
            }
            Error::NoConvergence { updates, residuals } => {
                let list = |items: &[(String, f64)]| {
                    items
                        .iter()
                        .map(|(name, v)| format!("{name}={v:.3e}"))
                        .collect::<Vec<_>>()
                        .join(", ")
                };
                write!(
                    f,
                    "DC operating point did not converge after gmin and source stepping; \
                     largest updates: {}; largest KCL residuals: {}",
                    list(updates),
                    list(residuals)
                )
            }
            Error::SweepPoint {
                source,
                value,
                cause,
            } => write!(f, "dc sweep of {source} failed at {value:e}: {cause}"),
            Error::Internal(msg) => write!(f, "internal error: {msg}"),
        }
    }
}

impl std::error::Error for Error {}
