//! Device models: the parameter tables of docs/reference/devices.md
//! sections 1 to 4, and the model rules V10 and V12.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::Netlist;
use crate::error::Error;

/// Default MOSFET channel width and length in metres (ngspice defaults).
pub const MOS_DEFAULT_SIZE: f64 = 100e-6;

/// Default `gmin` in siemens, used when `options.gmin` is unset.
pub const DEFAULT_GMIN: f64 = 1e-12;

/// The device type a model describes.
#[allow(clippy::upper_case_acronyms)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ModelKind {
    D,
    NPN,
    PNP,
    NMOS,
    PMOS,
    SW,
}

impl ModelKind {
    /// The type name as written in JSON and in SPICE `.model` cards.
    pub fn as_str(self) -> &'static str {
        match self {
            ModelKind::D => "D",
            ModelKind::NPN => "NPN",
            ModelKind::PNP => "PNP",
            ModelKind::NMOS => "NMOS",
            ModelKind::PMOS => "PMOS",
            ModelKind::SW => "SW",
        }
    }
}

/// A named set of device parameters. Unset parameters take the defaults
/// from `param_spec`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Model {
    pub name: String,
    #[serde(rename = "type")]
    pub kind: ModelKind,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub params: BTreeMap<String, f64>,
}

/// The values a parameter may take.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Range {
    Any,
    Positive,
    NonNegative,
    /// `[0, 1)`
    UnitInterval,
}

impl Range {
    fn contains(self, v: f64) -> bool {
        v.is_finite()
            && match self {
                Range::Any => true,
                Range::Positive => v > 0.0,
                Range::NonNegative => v >= 0.0,
                Range::UnitInterval => (0.0..1.0).contains(&v),
            }
    }

    fn describe(self) -> &'static str {
        match self {
            Range::Any => "finite",
            Range::Positive => "finite and > 0",
            Range::NonNegative => "finite and >= 0",
            Range::UnitInterval => "in [0, 1)",
        }
    }
}

/// One supported parameter of a model type.
#[derive(Debug, Clone, Copy)]
pub struct ParamSpec {
    pub key: &'static str,
    pub default: f64,
    pub rule: Range,
}

const fn p(key: &'static str, default: f64, rule: Range) -> ParamSpec {
    ParamSpec { key, default, rule }
}

use Range::{Any, NonNegative as NonNeg, Positive as Pos, UnitInterval as Unit};

const DIODE: &[ParamSpec] = &[
    p("IS", 1e-14, Pos),
    p("N", 1.0, Pos),
    p("RS", 0.0, NonNeg),
    p("CJO", 0.0, NonNeg),
    p("VJ", 1.0, Pos),
    p("M", 0.5, Unit),
    p("FC", 0.5, Unit),
    p("TT", 0.0, NonNeg),
];

const BJT: &[ParamSpec] = &[
    p("IS", 1e-16, Pos),
    p("BF", 100.0, Pos),
    p("BR", 1.0, Pos),
    p("NF", 1.0, Pos),
    p("NR", 1.0, Pos),
    p("VAF", f64::INFINITY, Pos),
    p("CJE", 0.0, NonNeg),
    p("VJE", 0.75, Pos),
    p("MJE", 0.33, Unit),
    p("CJC", 0.0, NonNeg),
    p("VJC", 0.75, Pos),
    p("MJC", 0.33, Unit),
    p("TF", 0.0, NonNeg),
    p("TR", 0.0, NonNeg),
    p("FC", 0.5, Unit),
];

const MOSFET: &[ParamSpec] = &[
    p("VTO", 0.0, Any),
    p("KP", 2e-5, Pos),
    p("GAMMA", 0.0, NonNeg),
    p("PHI", 0.6, Pos),
    p("LAMBDA", 0.0, NonNeg),
    p("CGSO", 0.0, NonNeg),
    p("CGDO", 0.0, NonNeg),
    p("CGBO", 0.0, NonNeg),
];

/// `ROFF` defaults to NaN, meaning `1/gmin`; the switch resolves it when
/// the circuit is built.
const SWITCH: &[ParamSpec] = &[
    p("VT", 0.0, Any),
    p("VH", 0.0, NonNeg),
    p("RON", 1.0, Pos),
    p("ROFF", f64::NAN, Pos),
];

/// The supported parameters of a model type, with defaults and ranges.
pub fn param_spec(kind: ModelKind) -> &'static [ParamSpec] {
    match kind {
        ModelKind::D => DIODE,
        ModelKind::NPN | ModelKind::PNP => BJT,
        ModelKind::NMOS | ModelKind::PMOS => MOSFET,
        ModelKind::SW => SWITCH,
    }
}

/// The value of parameter `key`: the model's own, else the default. A key
/// that the model type does not support gives NaN.
pub fn param(model: &Model, key: &str) -> f64 {
    model.params.get(key).copied().unwrap_or_else(|| {
        param_spec(model.kind)
            .iter()
            .find(|s| s.key == key)
            .map_or(f64::NAN, |s| s.default)
    })
}

/// V10 and V12: model names and parameters.
pub(super) fn validate_models(n: &Netlist) -> Result<(), Error> {
    // V10
    let mut groups: BTreeMap<String, Vec<&str>> = BTreeMap::new();
    for m in &n.models {
        let mut chars = m.name.chars();
        let valid = matches!(chars.next(), Some(c) if c.is_ascii_alphabetic())
            && chars.all(|c| c.is_ascii_alphanumeric() || c == '_');
        if !valid {
            return Err(Error::Invalid(format!(
                "model name {:?} must match ^[A-Za-z][A-Za-z0-9_]*$",
                m.name
            )));
        }
        groups
            .entry(m.name.to_ascii_lowercase())
            .or_default()
            .push(&m.name);
    }
    if let Some(mut names) = groups.into_values().find(|g| g.len() > 1) {
        names.sort_unstable();
        return Err(Error::Invalid(format!(
            "model names must be unique ignoring case: {}",
            names.join(", ")
        )));
    }
    // V12
    for m in &n.models {
        let spec = param_spec(m.kind);
        for (key, value) in &m.params {
            let Some(s) = spec.iter().find(|s| s.key == key) else {
                return Err(Error::Invalid(format!(
                    "unsupported parameter {key} for model {} ({})",
                    m.name,
                    m.kind.as_str()
                )));
            };
            if !s.rule.contains(*value) {
                return Err(Error::Invalid(format!(
                    "parameter {key} of model {} must be {}, got {value}",
                    m.name,
                    s.rule.describe()
                )));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    type TestResult = Result<(), Box<dyn std::error::Error>>;

    /// One entry of packages/schema/fixtures/param-specs.json. A default
    /// that is not a finite number is `null` plus `defaultKind`: "inf" for
    /// Infinity, "1/gmin" for NaN.
    #[derive(Debug, PartialEq, Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    struct Entry {
        key: String,
        default: Option<f64>,
        #[serde(default)]
        default_kind: Option<String>,
        range: String,
    }

    fn range_name(r: Range) -> &'static str {
        match r {
            Range::Any => "any",
            Range::Positive => "positive",
            Range::NonNegative => "nonNegative",
            Range::UnitInterval => "unitInterval",
        }
    }

    fn encoded(kind: ModelKind) -> Vec<Entry> {
        param_spec(kind)
            .iter()
            .map(|s| {
                let (default, default_kind) = if s.default.is_nan() {
                    (None, Some("1/gmin".to_string()))
                } else if s.default.is_infinite() {
                    (None, Some("inf".to_string()))
                } else {
                    (Some(s.default), None)
                };
                Entry {
                    key: s.key.to_string(),
                    default,
                    default_kind,
                    range: range_name(s.rule).to_string(),
                }
            })
            .collect()
    }

    /// Compares the committed JSON table of `@nodal/schema` with `param_spec`.
    /// It only reads: regenerate the file from `encodeParamSpecs()` in
    /// packages/schema/src/models.ts when the table changes on purpose.
    #[test]
    fn spec_matches_ts() -> TestResult {
        let text = include_str!("../../../../packages/schema/fixtures/param-specs.json");
        let file: BTreeMap<String, Vec<Entry>> = serde_json::from_str(text)?;
        let kinds = [
            ModelKind::D,
            ModelKind::NPN,
            ModelKind::PNP,
            ModelKind::NMOS,
            ModelKind::PMOS,
            ModelKind::SW,
        ];
        assert_eq!(file.len(), kinds.len(), "model type count differs");
        for kind in kinds {
            let theirs = file
                .get(kind.as_str())
                .ok_or_else(|| format!("missing {}", kind.as_str()))?;
            assert_eq!(
                theirs,
                &encoded(kind),
                "table for {} differs",
                kind.as_str()
            );
        }
        Ok(())
    }
}
