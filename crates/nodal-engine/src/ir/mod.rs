//! Netlist IR: serde types for the JSON netlist, plus validation.

mod validate;

use serde::{Deserialize, Serialize};

use crate::error::Error;

/// A complete netlist (IR version 1).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Netlist {
    pub ir_version: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub elements: Vec<Element>,
    /// Device models. Must be empty until models are supported.
    #[serde(default)]
    pub models: Vec<serde_json::Value>,
    pub analyses: Vec<Analysis>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub options: Option<Options>,
}

/// One circuit element, tagged in JSON by its SPICE letter in `kind`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all_fields = "camelCase", deny_unknown_fields)]
pub enum Element {
    R {
        name: String,
        nodes: [String; 2],
        value: f64,
    },
    L {
        name: String,
        nodes: [String; 2],
        value: f64,
    },
    C {
        name: String,
        nodes: [String; 2],
        value: f64,
    },
    V {
        name: String,
        nodes: [String; 2],
        #[serde(default)]
        dc: f64,
    },
    I {
        name: String,
        nodes: [String; 2],
        #[serde(default)]
        dc: f64,
    },
    E {
        name: String,
        nodes: [String; 2],
        control_nodes: [String; 2],
        gain: f64,
    },
    G {
        name: String,
        nodes: [String; 2],
        control_nodes: [String; 2],
        gain: f64,
    },
    H {
        name: String,
        nodes: [String; 2],
        control_source: String,
        gain: f64,
    },
    F {
        name: String,
        nodes: [String; 2],
        control_source: String,
        gain: f64,
    },
}

impl Element {
    /// The element name, for example `R1`.
    pub fn name(&self) -> &str {
        match self {
            Element::R { name, .. }
            | Element::L { name, .. }
            | Element::C { name, .. }
            | Element::V { name, .. }
            | Element::I { name, .. }
            | Element::E { name, .. }
            | Element::G { name, .. }
            | Element::H { name, .. }
            | Element::F { name, .. } => name,
        }
    }

    /// The two terminal nodes.
    pub fn nodes(&self) -> &[String; 2] {
        match self {
            Element::R { nodes, .. }
            | Element::L { nodes, .. }
            | Element::C { nodes, .. }
            | Element::V { nodes, .. }
            | Element::I { nodes, .. }
            | Element::E { nodes, .. }
            | Element::G { nodes, .. }
            | Element::H { nodes, .. }
            | Element::F { nodes, .. } => nodes,
        }
    }

    /// The SPICE letter matching the JSON `kind`.
    pub fn kind_letter(&self) -> char {
        match self {
            Element::R { .. } => 'R',
            Element::L { .. } => 'L',
            Element::C { .. } => 'C',
            Element::V { .. } => 'V',
            Element::I { .. } => 'I',
            Element::E { .. } => 'E',
            Element::G { .. } => 'G',
            Element::H { .. } => 'H',
            Element::F { .. } => 'F',
        }
    }
}

/// An analysis to run. Only the operating point exists in M1.
///
/// `Op` is a struct variant (`Analysis::Op {}`) so that serde enforces
/// `deny_unknown_fields` on it; a unit variant would ignore extra keys.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase", deny_unknown_fields)]
pub enum Analysis {
    Op {},
}

/// Simulator options. Unset fields take the defaults in the architecture doc.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Options {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub temp: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reltol: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vntol: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub abstol: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chgtol: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gmin: Option<f64>,
}

/// Parse a JSON netlist and validate it.
pub fn parse_netlist(json: &str) -> Result<Netlist, Error> {
    let netlist: Netlist = serde_json::from_str(json).map_err(|e| Error::Parse(e.to_string()))?;
    validate::validate(&netlist)?;
    Ok(netlist)
}
