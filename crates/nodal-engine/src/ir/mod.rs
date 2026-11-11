//! Netlist IR: serde types for the JSON netlist, plus validation.

mod models;
mod validate;

pub use models::{
    DEFAULT_GMIN, MOS_DEFAULT_SIZE, Model, ModelKind, ParamSpec, Range, param, param_spec,
};

use std::collections::BTreeMap;

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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub models: Vec<Model>,
    /// Initial guesses for node voltages, keyed by node name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub nodeset: Option<BTreeMap<String, f64>>,
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
    /// Diode: anode, cathode.
    D {
        name: String,
        nodes: [String; 2],
        model: String,
    },
    /// Bipolar transistor: collector, base, emitter.
    Q {
        name: String,
        nodes: [String; 3],
        model: String,
    },
    /// MOSFET: drain, gate, source, bulk. `w` and `l` default to 100 um.
    M {
        name: String,
        nodes: [String; 4],
        model: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        w: Option<f64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        l: Option<f64>,
    },
    /// Voltage-controlled switch: output pair, then control pair.
    S {
        name: String,
        nodes: [String; 2],
        control_nodes: [String; 2],
        model: String,
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
            | Element::F { name, .. }
            | Element::D { name, .. }
            | Element::Q { name, .. }
            | Element::M { name, .. }
            | Element::S { name, .. } => name,
        }
    }

    /// The terminal nodes: two for most elements, three for Q (C, B, E)
    /// and four for M (D, G, S, B). For S, the output pair.
    pub fn nodes(&self) -> &[String] {
        match self {
            Element::R { nodes, .. }
            | Element::L { nodes, .. }
            | Element::C { nodes, .. }
            | Element::V { nodes, .. }
            | Element::I { nodes, .. }
            | Element::E { nodes, .. }
            | Element::G { nodes, .. }
            | Element::H { nodes, .. }
            | Element::F { nodes, .. }
            | Element::D { nodes, .. }
            | Element::S { nodes, .. } => nodes,
            Element::Q { nodes, .. } => nodes,
            Element::M { nodes, .. } => nodes,
        }
    }

    /// The controlling node pair of E, G and S; empty for other kinds.
    pub fn control_nodes(&self) -> &[String] {
        match self {
            Element::E { control_nodes, .. }
            | Element::G { control_nodes, .. }
            | Element::S { control_nodes, .. } => control_nodes,
            _ => &[],
        }
    }

    /// The model name of D, Q, M and S.
    pub fn model(&self) -> Option<&str> {
        match self {
            Element::D { model, .. }
            | Element::Q { model, .. }
            | Element::M { model, .. }
            | Element::S { model, .. } => Some(model),
            _ => None,
        }
    }

    /// True for elements that carry a branch-current unknown: V, E, H, L.
    pub fn has_branch(&self) -> bool {
        matches!(
            self,
            Element::V { .. } | Element::E { .. } | Element::H { .. } | Element::L { .. }
        )
    }

    /// Node pairs that conduct at DC, used by the floating-node check.
    /// Control ports, MOSFET gate and bulk, and current sources add none.
    pub fn dc_edges(&self) -> Vec<(&str, &str)> {
        let n = self.nodes();
        match self {
            Element::R { .. }
            | Element::L { .. }
            | Element::V { .. }
            | Element::E { .. }
            | Element::H { .. }
            | Element::D { .. }
            | Element::S { .. } => vec![(n[0].as_str(), n[1].as_str())],
            // base-emitter and base-collector junctions
            Element::Q { .. } => vec![
                (n[1].as_str(), n[2].as_str()),
                (n[1].as_str(), n[0].as_str()),
            ],
            // drain-source channel
            Element::M { .. } => vec![(n[0].as_str(), n[2].as_str())],
            Element::C { .. } | Element::I { .. } | Element::G { .. } | Element::F { .. } => {
                Vec::new()
            }
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
            Element::D { .. } => 'D',
            Element::Q { .. } => 'Q',
            Element::M { .. } => 'M',
            Element::S { .. } => 'S',
        }
    }
}

/// An analysis to run.
///
/// `Op` is a struct variant (`Analysis::Op {}`) so that serde enforces
/// `deny_unknown_fields` on it; a unit variant would ignore extra keys.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase", deny_unknown_fields)]
pub enum Analysis {
    Op {},
    /// Sweep the DC value of an independent source from `start` to `stop`.
    Dc {
        source: String,
        start: f64,
        stop: f64,
        step: f64,
    },
}

/// The values of a DC sweep: `start + i * step` for `i` in `0..n`, where
/// `n = round((stop - start) / step) + 1`. Returns an empty list when the
/// arguments do not describe a sweep (zero step, wrong sign, non-finite);
/// validation rejects those before this is called.
pub fn sweep_values(start: f64, stop: f64, step: f64) -> Vec<f64> {
    let k = ((stop - start) / step).round();
    if !(0.0..1e9).contains(&k) {
        return Vec::new();
    }
    // k is an integer in [0, 1e9), so the cast is exact.
    let n = k as usize + 1;
    (0..n).map(|i| start + i as f64 * step).collect()
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

#[cfg(test)]
mod tests {
    use super::sweep_values;

    #[test]
    fn sweep_values_hit_stop() {
        let v = sweep_values(-5.0, 5.0, 0.1);
        assert_eq!(v.len(), 101);
        assert!((v[100] - 5.0).abs() < 1e-12);
        assert_eq!(v[0], -5.0);
    }

    #[test]
    fn sweep_values_descend() {
        assert_eq!(sweep_values(1.0, 0.0, -0.25), [1.0, 0.75, 0.5, 0.25, 0.0]);
    }
}
