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
            Error::Internal(msg) => write!(f, "internal error: {msg}"),
        }
    }
}

impl std::error::Error for Error {}
