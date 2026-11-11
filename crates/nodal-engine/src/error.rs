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
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Parse(msg) => write!(f, "parse error: {msg}"),
            Error::Invalid(msg) => write!(f, "invalid netlist: {msg}"),
            Error::Floating { nodes, elements } => write!(
                f,
                "floating node(s) with no DC path to ground: {} (elements: {})",
                nodes.join(", "),
                elements.join(", ")
            ),
            Error::SourceLoop { elements } => write!(
                f,
                "loop of voltage sources and/or inductors: {}",
                elements.join(", ")
            ),
            Error::Singular { unknown } => write!(f, "singular matrix at unknown {unknown}"),
        }
    }
}

impl std::error::Error for Error {}
