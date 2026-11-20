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
        /// Small-signal value for the `ac` analysis.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        ac: Option<AcSpec>,
    },
    I {
        name: String,
        nodes: [String; 2],
        #[serde(default)]
        dc: f64,
        /// Small-signal value for the `ac` analysis.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        ac: Option<AcSpec>,
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
        match self {
            Element::R { nodes, .. }
            | Element::L { nodes, .. }
            | Element::V { nodes, .. }
            | Element::E { nodes, .. }
            | Element::H { nodes, .. }
            | Element::D { nodes, .. }
            | Element::S { nodes, .. } => {
                let [a, b] = nodes;
                vec![(a.as_str(), b.as_str())]
            }
            // base-emitter and base-collector junctions
            Element::Q { nodes, .. } => {
                let [c, b, e] = nodes;
                vec![(b.as_str(), e.as_str()), (b.as_str(), c.as_str())]
            }
            // drain-source channel
            Element::M { nodes, .. } => {
                let [d, _, s, _] = nodes;
                vec![(d.as_str(), s.as_str())]
            }
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

/// Small-signal value of an independent source: magnitude in volts or
/// amperes, phase in degrees.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AcSpec {
    pub mag: f64,
    #[serde(default)]
    pub phase: f64,
}

/// Frequency spacing of an `ac` analysis.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AcSweep {
    Lin,
    Dec,
    Oct,
}

impl AcSweep {
    /// The SPICE keyword, for example `dec`.
    pub fn as_str(self) -> &'static str {
        match self {
            AcSweep::Lin => "lin",
            AcSweep::Dec => "dec",
            AcSweep::Oct => "oct",
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
    /// Small-signal frequency sweep. `points` is the count per decade or
    /// octave for `dec` and `oct`, and the total count for `lin`.
    Ac {
        sweep: AcSweep,
        points: u32,
        fstart: f64,
        fstop: f64,
    },
}

/// Default relative tolerance, as in ngspice.
pub const DEFAULT_RELTOL: f64 = 1e-3;

/// Largest allowed number of frequencies in an `ac` analysis.
pub const MAX_AC_POINTS: usize = 1_000_000;

/// The frequencies of an `ac` analysis, or `None` when there would be more
/// than `limit` of them or the arguments do not describe a sweep.
///
/// Port of the grid setup and loop of `ACan` in ngspice
/// `src/spicelib/analysis/acan.c`. One deviation: ngspice treats `lin` with
/// two points as a single point (its step is set to 0 unless
/// `points - 1 > 1`); here two points give `fstart` and `fstop`.
pub fn ac_frequencies(
    sweep: AcSweep,
    points: u32,
    fstart: f64,
    fstop: f64,
    reltol: f64,
    limit: usize,
) -> Option<Vec<f64>> {
    if points < 1 || !fstart.is_finite() || !fstop.is_finite() || !reltol.is_finite() {
        return None;
    }
    let n = f64::from(points);
    let delta = match sweep {
        AcSweep::Lin => {
            if points == 1 {
                return Some(vec![fstart]);
            }
            let count = usize::try_from(points).ok()?;
            if count > limit {
                return None;
            }
            let step = (fstop - fstart) / (n - 1.0);
            return Some((0..count).map(|i| fstart + i as f64 * step).collect());
        }
        AcSweep::Dec => {
            if fstart <= 0.0 || fstop <= 0.0 {
                return None;
            }
            if fstop / 10.0 < fstart {
                if fstop == fstart {
                    1.0
                } else {
                    (10.0_f64.ln() / n).exp()
                }
            } else {
                let steps = ((fstop / fstart).log10().abs() * n).floor();
                ((fstop / fstart).ln() / steps).exp()
            }
        }
        AcSweep::Oct => {
            if fstart <= 0.0 {
                return None;
            }
            (2.0_f64.ln() / n).exp()
        }
    };
    if !delta.is_finite() {
        return None;
    }
    let tol = delta * fstop * reltol;
    let mut out = Vec::new();
    let mut f = fstart;
    while f <= fstop + tol {
        if out.len() >= limit {
            return None;
        }
        out.push(f);
        if delta == 1.0 {
            break;
        }
        f *= delta;
    }
    Some(out)
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
    let mut values: Vec<f64> = (0..n).map(|i| start + i as f64 * step).collect();
    // Accumulated rounding must not leave the last point beside `stop`.
    if let Some(last) = values.last_mut() {
        *last = stop;
    }
    values
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
    use super::{AcSweep, MAX_AC_POINTS, ac_frequencies, sweep_values};

    #[test]
    fn sweep_values_hit_stop() {
        let v = sweep_values(-5.0, 5.0, 0.1);
        assert_eq!(v.len(), 101);
        assert!((v[100] - 5.0).abs() < 1e-12);
        assert_eq!(v[0], -5.0);
    }

    #[test]
    fn sweep_values_end_exactly_at_stop() {
        let v = sweep_values(3.3, 0.0, -0.1);
        assert_eq!(v.len(), 34);
        assert_eq!(v.last().copied(), Some(0.0));
        assert_eq!(v[0], 3.3);
    }

    #[test]
    fn sweep_values_descend() {
        assert_eq!(sweep_values(1.0, 0.0, -0.25), [1.0, 0.75, 0.5, 0.25, 0.0]);
    }

    fn close(a: f64, b: f64) -> bool {
        (a - b).abs() <= 1e-12 * b.abs()
    }

    #[test]
    fn ac_frequencies_dec_whole_decades() {
        let f = ac_frequencies(AcSweep::Dec, 10, 1.0, 1e7, 1e-3, MAX_AC_POINTS).unwrap_or_default();
        assert_eq!(f.len(), 71);
        assert_eq!(f[0], 1.0);
        assert!(close(f[70], 1e7), "{}", f[70]);
    }

    #[test]
    fn ac_frequencies_dec_partial_decade_count() {
        // m = floor(log10(5e6) * 10) = 66, so 67 points.
        let f = ac_frequencies(AcSweep::Dec, 10, 1.0, 5e6, 1e-3, MAX_AC_POINTS).unwrap_or_default();
        assert_eq!(f.len(), 67);
        assert!(close(f[66], 5e6), "{}", f[66]);
    }

    #[test]
    fn ac_frequencies_dec_less_than_decade() {
        let f =
            ac_frequencies(AcSweep::Dec, 10, 100.0, 500.0, 1e-3, MAX_AC_POINTS).unwrap_or_default();
        let delta = 10.0_f64.powf(0.1);
        let tol = delta * 500.0 * 1e-3;
        let mut expected = 0;
        while 100.0 * delta.powi(expected) <= 500.0 + tol {
            expected += 1;
        }
        assert_eq!(f.len(), usize::try_from(expected).unwrap_or(0));
        assert!(close(f[1] / f[0], delta));
        assert!(f.last().copied().unwrap_or(f64::INFINITY) <= 500.0 + tol);
    }

    #[test]
    fn ac_frequencies_dec_single() {
        let f = ac_frequencies(AcSweep::Dec, 10, 1e3, 1e3, 1e-3, MAX_AC_POINTS);
        assert_eq!(f, Some(vec![1e3]));
    }

    #[test]
    fn ac_frequencies_oct() {
        let f = ac_frequencies(AcSweep::Oct, 4, 1.0, 16.0, 1e-3, MAX_AC_POINTS).unwrap_or_default();
        assert_eq!(f.len(), 17);
        assert!(close(f[16], 16.0), "{}", f[16]);
    }

    #[test]
    fn ac_frequencies_lin() {
        let f =
            ac_frequencies(AcSweep::Lin, 11, 0.0, 100.0, 1e-3, MAX_AC_POINTS).unwrap_or_default();
        assert_eq!(f.len(), 11);
        for (i, v) in f.iter().enumerate() {
            assert!(close(*v, 10.0 * i as f64) || (i == 0 && *v == 0.0), "{f:?}");
        }
    }

    #[test]
    fn ac_frequencies_lin_two_points() {
        let f = ac_frequencies(AcSweep::Lin, 2, 1.0, 2.0, 1e-3, MAX_AC_POINTS);
        assert_eq!(f, Some(vec![1.0, 2.0]));
    }

    #[test]
    fn ac_frequencies_limit() {
        assert!(ac_frequencies(AcSweep::Dec, 1000, 1.0, 1e9, 1e-3, 5000).is_none());
        assert!(ac_frequencies(AcSweep::Lin, 100, 0.0, 1.0, 1e-3, 99).is_none());
        assert!(ac_frequencies(AcSweep::Lin, 100, 0.0, 1.0, 1e-3, 100).is_some());
    }
}
