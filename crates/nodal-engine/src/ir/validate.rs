//! Validation rules V1 to V11 (see the Task 2 brief). The TypeScript
//! validator in `@nodal/schema` implements the same rules.

use std::collections::{BTreeMap, BTreeSet};

use super::{Element, Netlist, Options};
use crate::error::Error;

fn invalid<T>(msg: String) -> Result<T, Error> {
    Err(Error::Invalid(msg))
}

fn ascii_word(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

fn valid_element_name(name: &str) -> bool {
    let mut chars = name.chars();
    matches!(chars.next(), Some(c) if "RLCVIEGHF".contains(c))
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// Finds the first group of names that are equal ignoring ASCII case (an
/// exact repeat counts too). Returns that group's names sorted ascending and
/// joined with ", ", or `None` when every name is distinct.
fn case_collision<'a>(names: impl Iterator<Item = &'a str>) -> Option<String> {
    let mut groups: BTreeMap<String, Vec<&str>> = BTreeMap::new();
    for n in names {
        groups.entry(n.to_ascii_lowercase()).or_default().push(n);
    }
    groups.into_values().find(|g| g.len() > 1).map(|mut g| {
        g.sort_unstable();
        g.join(", ")
    })
}

pub(super) fn validate(n: &Netlist) -> Result<(), Error> {
    // V1
    if n.ir_version != 1 {
        return invalid(format!("irVersion must be 1, got {}", n.ir_version));
    }
    // V2
    if n.elements.is_empty() {
        return invalid("elements must not be empty".into());
    }
    if n.analyses.is_empty() {
        return invalid("analyses must not be empty".into());
    }
    // V10
    if !n.models.is_empty() {
        return invalid("models must be empty".into());
    }
    for e in &n.elements {
        let name = e.name();
        // V3
        if !valid_element_name(name) {
            return invalid(format!(
                "element name {name:?} must match ^[RLCVIEGHF][A-Za-z0-9_]*$"
            ));
        }
        if !name.starts_with(e.kind_letter()) {
            return invalid(format!(
                "element name {name} must start with its kind letter {}",
                e.kind_letter()
            ));
        }
        // V4
        let control_nodes: &[String] = match e {
            Element::E { control_nodes, .. } | Element::G { control_nodes, .. } => control_nodes,
            _ => &[],
        };
        for node in e.nodes().iter().chain(control_nodes) {
            if !ascii_word(node) {
                return invalid(format!(
                    "element {name}: node {node:?} must match ^[A-Za-z0-9_]+$"
                ));
            }
        }
    }
    // V5
    if let Some(names) = case_collision(n.elements.iter().map(Element::name)) {
        return invalid(format!(
            "element names must be unique ignoring case: {names}"
        ));
    }
    // V6
    let nodes: BTreeSet<&str> = n
        .elements
        .iter()
        .flat_map(|e| {
            let control: &[String] = match e {
                Element::E { control_nodes, .. } | Element::G { control_nodes, .. } => {
                    control_nodes
                }
                _ => &[],
            };
            e.nodes().iter().chain(control).map(String::as_str)
        })
        .collect();
    if let Some(names) = case_collision(nodes.into_iter()) {
        return invalid(format!("node names must differ by more than case: {names}"));
    }
    for e in &n.elements {
        let name = e.name();
        // V7
        match e {
            Element::R { value, .. } | Element::L { value, .. } | Element::C { value, .. }
                if !(value.is_finite() && *value > 0.0) =>
            {
                return invalid(format!(
                    "element {name}: value must be finite and > 0, got {value}"
                ));
            }
            Element::V { dc, .. } | Element::I { dc, .. } if !dc.is_finite() => {
                return invalid(format!("element {name}: dc must be finite"));
            }
            Element::E { gain, .. }
            | Element::G { gain, .. }
            | Element::H { gain, .. }
            | Element::F { gain, .. }
                if !gain.is_finite() =>
            {
                return invalid(format!("element {name}: gain must be finite"));
            }
            _ => {}
        }
        // V8
        let [a, b] = e.nodes();
        if a == b {
            return invalid(format!("element {name}: both terminals are node {a}"));
        }
        // V9
        if let Element::H { control_source, .. } | Element::F { control_source, .. } = e {
            match n.elements.iter().find(|x| x.name() == control_source) {
                None => {
                    return invalid(format!(
                        "element {name}: unknown controlling source {control_source}"
                    ));
                }
                Some(Element::V { .. }) => {}
                Some(_) => {
                    return invalid(format!(
                        "element {name}: controlling source {control_source} is not a voltage source"
                    ));
                }
            }
        }
    }
    // V11
    if let Some(o) = &n.options {
        validate_options(o)?;
    }
    Ok(())
}

fn validate_options(o: &Options) -> Result<(), Error> {
    if let Some(t) = o.temp
        && !(t.is_finite() && t > -273.15)
    {
        return invalid(format!("option temp must be finite and > -273.15, got {t}"));
    }
    let positive = [
        ("reltol", o.reltol),
        ("vntol", o.vntol),
        ("abstol", o.abstol),
        ("chgtol", o.chgtol),
        ("gmin", o.gmin),
    ];
    for (key, value) in positive {
        if let Some(v) = value
            && !(v.is_finite() && v > 0.0)
        {
            return invalid(format!("option {key} must be finite and > 0, got {v}"));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ir::Analysis;

    type TestResult = Result<(), Box<dyn std::error::Error>>;

    fn nodes(a: &str, b: &str) -> [String; 2] {
        [a.to_string(), b.to_string()]
    }

    fn base(extra: Element) -> Netlist {
        Netlist {
            ir_version: 1,
            title: None,
            elements: vec![
                Element::V {
                    name: "V1".into(),
                    nodes: nodes("in", "0"),
                    dc: 1.0,
                },
                extra,
            ],
            models: vec![],
            analyses: vec![Analysis::Op {}],
            options: None,
        }
    }

    fn message(n: &Netlist) -> Result<String, Box<dyn std::error::Error>> {
        match validate(n) {
            Ok(()) => Err("netlist was accepted".into()),
            Err(e) => Ok(e.to_string()),
        }
    }

    fn resistor(value: f64) -> Element {
        Element::R {
            name: "R1".into(),
            nodes: nodes("in", "0"),
            value,
        }
    }

    #[test]
    fn non_finite_values_are_rejected() -> TestResult {
        for v in [f64::INFINITY, f64::NAN] {
            let msg = message(&base(resistor(v)))?;
            assert!(msg.contains("element R1: value must be finite"), "{msg}");
        }
        Ok(())
    }

    #[test]
    fn non_finite_gain_is_rejected() -> TestResult {
        for v in [f64::INFINITY, f64::NAN] {
            let g = Element::G {
                name: "G1".into(),
                nodes: nodes("a", "0"),
                control_nodes: nodes("in", "0"),
                gain: v,
            };
            let msg = message(&base(g))?;
            assert!(msg.contains("element G1: gain must be finite"), "{msg}");
        }
        Ok(())
    }

    #[test]
    fn non_finite_dc_is_rejected() -> TestResult {
        for v in [f64::INFINITY, f64::NAN] {
            let i = Element::I {
                name: "I1".into(),
                nodes: nodes("in", "0"),
                dc: v,
            };
            let msg = message(&base(i))?;
            assert!(msg.contains("element I1: dc must be finite"), "{msg}");
        }
        Ok(())
    }

    #[test]
    fn non_finite_options_are_rejected() -> TestResult {
        for v in [f64::INFINITY, f64::NAN] {
            let mut n = base(resistor(1.0));
            n.options = Some(Options {
                temp: Some(v),
                ..Options::default()
            });
            let msg = message(&n)?;
            assert!(msg.contains("option temp must be finite"), "{msg}");

            n.options = Some(Options {
                gmin: Some(v),
                ..Options::default()
            });
            let msg = message(&n)?;
            assert!(msg.contains("option gmin must be finite"), "{msg}");
        }
        Ok(())
    }
}
