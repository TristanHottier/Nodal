//! Validation rules V1 to V21 (see the Task 2 briefs; the model rules V10
//! and V12 live in `models.rs`). The TypeScript
//! validator in `@nodal/schema` implements the same rules.

use std::collections::{BTreeMap, BTreeSet};

use super::{
    AcSweep, Analysis, DEFAULT_RELTOL, Element, MAX_AC_POINTS, ModelKind, Netlist, Options,
    Waveform, ac_frequencies, models,
};
use crate::error::Error;

/// Largest allowed number of points in a DC sweep.
const MAX_SWEEP_POINTS: f64 = 1_000_000.0;

fn invalid<T>(msg: String) -> Result<T, Error> {
    Err(Error::Invalid(msg))
}

fn ascii_word(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

fn valid_element_name(name: &str) -> bool {
    let mut chars = name.chars();
    matches!(chars.next(), Some(c) if "RLCVIEGHFDQMS".contains(c))
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
    // V10 and V12
    models::validate_models(n)?;
    for e in &n.elements {
        let name = e.name();
        // V3
        if !valid_element_name(name) {
            return invalid(format!(
                "element name {name:?} must match ^[RLCVIEGHFDQMS][A-Za-z0-9_]*$"
            ));
        }
        if !name.starts_with(e.kind_letter()) {
            return invalid(format!(
                "element name {name} must start with its kind letter {}",
                e.kind_letter()
            ));
        }
        // V4
        for node in e.nodes().iter().chain(e.control_nodes()) {
            if !ascii_word(node) {
                return invalid(format!(
                    "element {name}: node {node:?} must match ^[A-Za-z0-9_]+$"
                ));
            }
            if node.eq_ignore_ascii_case("gnd") {
                return invalid(format!(
                    "element {name}: node {node:?} is reserved: ngspice treats gnd as ground; use \"0\""
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
            e.nodes()
                .iter()
                .chain(e.control_nodes())
                .map(String::as_str)
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
            // V16
            Element::V { ac: Some(ac), .. } | Element::I { ac: Some(ac), .. }
                if !(ac.mag.is_finite() && ac.phase.is_finite()) =>
            {
                return invalid(format!("element {name}: ac mag and phase must be finite"));
            }
            // V18
            Element::V {
                tran: Some(wave), ..
            }
            | Element::I {
                tran: Some(wave), ..
            } => validate_waveform(name, wave)?,
            // V19
            Element::L { ic: Some(ic), .. } | Element::C { ic: Some(ic), .. }
                if !ic.is_finite() =>
            {
                return invalid(format!("element {name}: ic must be finite"));
            }
            Element::E { gain, .. }
            | Element::G { gain, .. }
            | Element::H { gain, .. }
            | Element::F { gain, .. }
                if !gain.is_finite() =>
            {
                return invalid(format!("element {name}: gain must be finite"));
            }
            Element::M { w, l, .. } => {
                for (key, v) in [("w", w), ("l", l)] {
                    if let Some(v) = v
                        && !(v.is_finite() && *v > 0.0)
                    {
                        return invalid(format!(
                            "element {name}: {key} must be finite and > 0, got {v}"
                        ));
                    }
                }
            }
            _ => {}
        }
        // V8: Q and M may share terminals.
        if let [a, b] = e.nodes()
            && a == b
        {
            return invalid(format!("element {name}: both terminals are node {a}"));
        }
        // V13
        if let Some(model) = e.model() {
            validate_model_ref(n, name, e, model)?;
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
    // V14
    for a in &n.analyses {
        if let Analysis::Dc {
            source,
            start,
            stop,
            step,
        } = a
        {
            validate_dc(n, source, *start, *stop, *step)?;
        }
    }
    // V15
    if let Some(set) = &n.nodeset {
        for (node, value) in set {
            let known = n
                .elements
                .iter()
                .any(|e| e.nodes().iter().chain(e.control_nodes()).any(|x| x == node));
            if node == "0" || !known {
                return invalid(format!("nodeset: unknown node {node}"));
            }
            if !value.is_finite() {
                return invalid(format!("nodeset: value for node {node} must be finite"));
            }
        }
    }
    // V11
    if let Some(o) = &n.options {
        validate_options(o)?;
    }
    // V17
    let reltol = n
        .options
        .as_ref()
        .and_then(|o| o.reltol)
        .unwrap_or(DEFAULT_RELTOL);
    for a in &n.analyses {
        if let Analysis::Ac {
            sweep,
            points,
            fstart,
            fstop,
        } = a
        {
            validate_ac(*sweep, *points, *fstart, *fstop, reltol)?;
        }
    }
    // V20
    for a in &n.analyses {
        if let Analysis::Tran {
            tstep,
            tstop,
            tstart,
            tmax,
            ..
        } = a
        {
            validate_tran(*tstep, *tstop, *tstart, *tmax)?;
        }
    }
    Ok(())
}

/// V18.
fn validate_waveform(name: &str, wave: &Waveform) -> Result<(), Error> {
    let check = |kind: &str, key: &str, v: f64, ok: bool, rel: &str| -> Result<(), Error> {
        if v.is_finite() && ok {
            Ok(())
        } else {
            invalid(format!(
                "element {name}: {kind} {key} must be finite and {rel}, got {v}"
            ))
        }
    };
    match wave {
        Waveform::Pulse {
            v1,
            v2,
            td,
            tr,
            tf,
            pw,
            per,
        } => {
            check("pulse", "v1", *v1, true, "any")?;
            check("pulse", "v2", *v2, true, "any")?;
            check("pulse", "td", *td, *td >= 0.0, ">= 0")?;
            check("pulse", "tr", *tr, *tr > 0.0, "> 0")?;
            check("pulse", "tf", *tf, *tf > 0.0, "> 0")?;
            check("pulse", "pw", *pw, *pw >= 0.0, ">= 0")?;
            check("pulse", "per", *per, *per > 0.0, "> 0")
        }
        Waveform::Sin {
            vo,
            va,
            freq,
            td,
            theta,
            phase,
        } => {
            check("sin", "vo", *vo, true, "any")?;
            check("sin", "va", *va, true, "any")?;
            check("sin", "freq", *freq, *freq > 0.0, "> 0")?;
            check("sin", "td", *td, *td >= 0.0, ">= 0")?;
            check("sin", "theta", *theta, *theta >= 0.0, ">= 0")?;
            check("sin", "phase", *phase, true, "any")
        }
        Waveform::Pwl { points } => {
            if points.is_empty() {
                return invalid(format!("element {name}: pwl needs at least one point"));
            }
            let mut last = f64::NEG_INFINITY;
            for [t, v] in points {
                if !(t.is_finite() && v.is_finite()) {
                    return invalid(format!("element {name}: pwl points must be finite"));
                }
                if *t < 0.0 {
                    return invalid(format!("element {name}: pwl times must be >= 0, got {t}"));
                }
                if *t <= last {
                    return invalid(format!(
                        "element {name}: pwl times must be strictly increasing"
                    ));
                }
                last = *t;
            }
            Ok(())
        }
    }
}

/// V20.
fn validate_tran(tstep: f64, tstop: f64, tstart: f64, tmax: Option<f64>) -> Result<(), Error> {
    if !(tstep.is_finite() && tstep > 0.0) {
        return invalid(format!(
            "analysis tran: tstep must be finite and > 0, got {tstep}"
        ));
    }
    if !(tstart.is_finite() && tstart >= 0.0) {
        return invalid(format!(
            "analysis tran: tstart must be finite and >= 0, got {tstart}"
        ));
    }
    if !(tstop.is_finite() && tstop > tstart) {
        return invalid(format!(
            "analysis tran: tstop {tstop} must be above tstart {tstart}"
        ));
    }
    if let Some(m) = tmax
        && !(m.is_finite() && m > 0.0)
    {
        return invalid(format!(
            "analysis tran: tmax must be finite and > 0, got {m}"
        ));
    }
    Ok(())
}

fn validate_model_ref(n: &Netlist, name: &str, e: &Element, model: &str) -> Result<(), Error> {
    let Some(m) = n.models.iter().find(|m| m.name == model) else {
        return invalid(format!("element {name}: unknown model {model}"));
    };
    let (ok, expected) = match e {
        Element::D { .. } => (m.kind == ModelKind::D, "D"),
        Element::Q { .. } => (
            matches!(m.kind, ModelKind::NPN | ModelKind::PNP),
            "NPN or PNP",
        ),
        Element::M { .. } => (
            matches!(m.kind, ModelKind::NMOS | ModelKind::PMOS),
            "NMOS or PMOS",
        ),
        _ => (m.kind == ModelKind::SW, "SW"),
    };
    if !ok {
        return invalid(format!(
            "element {name}: model {model} has type {}, expected {expected}",
            m.kind.as_str()
        ));
    }
    Ok(())
}

fn validate_ac(
    sweep: AcSweep,
    points: u32,
    fstart: f64,
    fstop: f64,
    reltol: f64,
) -> Result<(), Error> {
    if !(fstart.is_finite() && fstop.is_finite()) {
        return invalid("analysis ac: fstart and fstop must be finite".into());
    }
    if points < 1 {
        return invalid("analysis ac: points must be at least 1".into());
    }
    if fstop < fstart {
        return invalid(format!(
            "analysis ac: fstop {fstop} is below fstart {fstart}"
        ));
    }
    let kind = sweep.as_str();
    if sweep == AcSweep::Lin {
        if fstart < 0.0 {
            return invalid(format!(
                "analysis ac: fstart must be >= 0 for {kind}, got {fstart}"
            ));
        }
        if points == 1 && fstart != fstop {
            return invalid("analysis ac: lin with one point needs fstart equal to fstop".into());
        }
    } else if fstart <= 0.0 {
        return invalid(format!(
            "analysis ac: fstart must be > 0 for {kind}, got {fstart}"
        ));
    }
    if ac_frequencies(sweep, points, fstart, fstop, reltol, MAX_AC_POINTS).is_none() {
        return invalid(format!(
            "analysis ac: sweep has more than {MAX_AC_POINTS} points"
        ));
    }
    Ok(())
}

fn validate_dc(n: &Netlist, source: &str, start: f64, stop: f64, step: f64) -> Result<(), Error> {
    match n.elements.iter().find(|x| x.name() == source) {
        None => return invalid(format!("analysis dc: unknown source {source}")),
        Some(Element::V { .. } | Element::I { .. }) => {}
        Some(_) => {
            return invalid(format!(
                "analysis dc: source {source} is not an independent source"
            ));
        }
    }
    if !(start.is_finite() && stop.is_finite() && step.is_finite()) {
        return invalid("analysis dc: start, stop and step must be finite".into());
    }
    if step == 0.0 {
        return invalid("analysis dc: step must not be zero".into());
    }
    let k = (stop - start) / step;
    if !k.is_finite() || k.round() + 1.0 > MAX_SWEEP_POINTS {
        return invalid(format!(
            "analysis dc: sweep has more than {MAX_SWEEP_POINTS} points"
        ));
    }
    if k < 0.0 || (k - k.round()).abs() > 1e-9 * k.abs().max(1.0) {
        return invalid(format!(
            "analysis dc: step {step} does not reach stop {stop} from start {start}"
        ));
    }
    Ok(())
}

fn validate_options(o: &Options) -> Result<(), Error> {
    if let Some(t) = o.temp {
        if !t.is_finite() {
            return invalid(format!("option temp must be finite, got {t}"));
        }
        if t != 27.0 {
            return invalid("option temp must be 27 (temperature is fixed in v1)".into());
        }
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
    // V21
    if let Some(v) = o.trtol
        && !(v.is_finite() && v > 0.0)
    {
        return invalid(format!("option trtol must be finite and > 0, got {v}"));
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
                    ac: None,
                    tran: None,
                },
                extra,
            ],
            models: vec![],
            nodeset: None,
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
                tran: None,
                ac: None,
            };
            let msg = message(&base(i))?;
            assert!(msg.contains("element I1: dc must be finite"), "{msg}");
        }
        Ok(())
    }

    #[test]
    fn non_finite_ac_is_rejected() -> TestResult {
        for (mag, phase) in [(f64::INFINITY, 0.0), (1.0, f64::NAN)] {
            let i = Element::I {
                name: "I1".into(),
                nodes: nodes("in", "0"),
                dc: 0.0,
                ac: Some(crate::ir::AcSpec { mag, phase }),
                tran: None,
            };
            let msg = message(&base(i))?;
            assert!(
                msg.contains("element I1: ac mag and phase must be finite"),
                "{msg}"
            );
        }
        Ok(())
    }

    #[test]
    fn non_finite_ic_is_rejected() -> TestResult {
        for ic in [f64::INFINITY, f64::NAN] {
            let c = Element::C {
                name: "C1".into(),
                nodes: nodes("in", "0"),
                value: 1e-6,
                ic: Some(ic),
            };
            let msg = message(&base(c))?;
            assert!(msg.contains("element C1: ic must be finite"), "{msg}");
            let l = Element::L {
                name: "L1".into(),
                nodes: nodes("in", "0"),
                value: 1e-3,
                ic: Some(ic),
            };
            let msg = message(&base(l))?;
            assert!(msg.contains("element L1: ic must be finite"), "{msg}");
        }
        Ok(())
    }

    fn source(wave: Waveform) -> Element {
        Element::I {
            name: "I1".into(),
            nodes: nodes("in", "0"),
            dc: 0.0,
            ac: None,
            tran: Some(wave),
        }
    }

    #[test]
    fn waveform_rules() -> TestResult {
        let pulse = |td, tr, tf, pw, per| Waveform::Pulse {
            v1: 0.0,
            v2: 1.0,
            td,
            tr,
            tf,
            pw,
            per,
        };
        validate(&base(source(pulse(0.0, 1e-9, 1e-9, 0.0, 1e-3))))?;
        for (wave, needle) in [
            (pulse(-1.0, 1e-9, 1e-9, 1e-3, 1e-3), "pulse td must be"),
            (pulse(0.0, 1e-9, 0.0, 1e-3, 1e-3), "pulse tf must be"),
            (pulse(0.0, 1e-9, 1e-9, -1.0, 1e-3), "pulse pw must be"),
            (pulse(0.0, 1e-9, 1e-9, 1e-3, 0.0), "pulse per must be"),
            (pulse(f64::NAN, 1e-9, 1e-9, 1e-3, 1e-3), "pulse td must be"),
            (
                Waveform::Sin {
                    vo: 0.0,
                    va: 1.0,
                    freq: 1.0,
                    td: 0.0,
                    theta: -1.0,
                    phase: 0.0,
                },
                "sin theta must be",
            ),
            (
                Waveform::Pwl {
                    points: vec![[-1.0, 0.0]],
                },
                "pwl times must be >= 0",
            ),
            (
                Waveform::Pwl {
                    points: vec![[0.0, 0.0], [0.0, 1.0]],
                },
                "strictly increasing",
            ),
            (
                Waveform::Pwl {
                    points: vec![[0.0, f64::INFINITY]],
                },
                "pwl points must be finite",
            ),
        ] {
            let msg = message(&base(source(wave)))?;
            assert!(msg.contains(needle), "{needle}: {msg}");
        }
        Ok(())
    }

    #[test]
    fn tran_rules() -> TestResult {
        let tran = |tstep, tstop, tstart, tmax| {
            let mut n = base(resistor(1.0));
            n.analyses = vec![Analysis::Tran {
                tstep,
                tstop,
                tstart,
                tmax,
                uic: false,
            }];
            n
        };
        validate(&tran(1e-6, 1e-3, 0.0, Some(1e-6)))?;
        for (n, needle) in [
            (tran(f64::NAN, 1e-3, 0.0, None), "tstep must be"),
            (tran(1e-6, 1e-3, -1.0, None), "tstart must be"),
            (tran(1e-6, 1e-3, 1e-3, None), "tstop 0.001 must be above"),
            (tran(1e-6, f64::INFINITY, 0.0, None), "must be above"),
            (tran(1e-6, 1e-3, 0.0, Some(0.0)), "tmax must be"),
        ] {
            let msg = message(&n)?;
            assert!(msg.contains(needle), "{needle}: {msg}");
        }
        Ok(())
    }

    #[test]
    fn non_finite_trtol_is_rejected() -> TestResult {
        let mut n = base(resistor(1.0));
        n.options = Some(Options {
            trtol: Some(f64::NAN),
            ..Options::default()
        });
        let msg = message(&n)?;
        assert!(msg.contains("option trtol must be finite and > 0"), "{msg}");
        Ok(())
    }

    fn ac_netlist(sweep: AcSweep, points: u32, fstart: f64, fstop: f64) -> Netlist {
        let mut n = base(resistor(1.0));
        n.analyses = vec![Analysis::Ac {
            sweep,
            points,
            fstart,
            fstop,
        }];
        n
    }

    #[test]
    fn ac_point_limit_follows_option_reltol() -> TestResult {
        // 111111 points per decade over 9 decades: 999999 steps, so the
        // last grid point is fstop. With the default reltol the tolerance
        // (1e-3 * fstop) also admits the next point, giving one more point
        // than the limit; with reltol 1e-6 it does not.
        let mut n = ac_netlist(AcSweep::Dec, 111_111, 1.0, 1e9);
        let msg = message(&n)?;
        assert!(msg.contains("more than 1000000 points"), "{msg}");
        n.options = Some(Options {
            reltol: Some(1e-6),
            ..Options::default()
        });
        validate(&n)?;
        Ok(())
    }

    #[test]
    fn bad_reltol_reports_the_option_before_the_ac_sweep() -> TestResult {
        let mut n = ac_netlist(AcSweep::Dec, 111_111, 1.0, 1e9);
        n.options = Some(Options {
            reltol: Some(0.0),
            ..Options::default()
        });
        let msg = message(&n)?;
        assert!(
            msg.contains("option reltol must be finite and > 0"),
            "{msg}"
        );
        Ok(())
    }

    #[test]
    fn ac_start_frequency_rules_per_sweep() -> TestResult {
        let msg = message(&ac_netlist(AcSweep::Oct, 4, 0.0, 100.0))?;
        assert!(
            msg.contains("analysis ac: fstart must be > 0 for oct"),
            "{msg}"
        );
        let msg = message(&ac_netlist(AcSweep::Lin, 4, -1.0, 100.0))?;
        assert!(
            msg.contains("analysis ac: fstart must be >= 0 for lin"),
            "{msg}"
        );
        validate(&ac_netlist(AcSweep::Lin, 4, 0.0, 100.0))?;
        Ok(())
    }

    #[test]
    fn nodeset_is_checked_before_options() -> TestResult {
        // Same order as the TypeScript validator: V14, V15, V11, V17.
        let mut n = base(resistor(1.0));
        n.nodeset = Some([("nowhere".to_string(), 1.0)].into_iter().collect());
        n.options = Some(Options {
            reltol: Some(0.0),
            ..Options::default()
        });
        let msg = message(&n)?;
        assert!(msg.contains("nodeset: unknown node nowhere"), "{msg}");
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
