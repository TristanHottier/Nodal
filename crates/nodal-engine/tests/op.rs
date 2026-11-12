//! DC operating point: one analytic test per linear device.
//!
//! Tolerance: |x - xref| <= 1e-5*|xref| + a, a = 1e-8 for V, 1e-13 for I.

use std::error::Error;

use nodal_engine::analysis::AnalysisResult;
use nodal_engine::{Error as EngineError, parse_netlist, simulate};

type TestResult = Result<(), Box<dyn Error>>;

fn netlist(elements: &str) -> String {
    format!(r#"{{"irVersion":1,"elements":[{elements}],"analyses":[{{"type":"op"}}]}}"#)
}

fn two(kind: &str, name: &str, a: &str, b: &str, field: &str, v: f64) -> String {
    format!(r#"{{"kind":"{kind}","name":"{name}","nodes":["{a}","{b}"],"{field}":{v}}}"#)
}

fn ctrl_v(kind: &str, name: &str, a: &str, b: &str, c: &str, d: &str, gain: f64) -> String {
    format!(
        r#"{{"kind":"{kind}","name":"{name}","nodes":["{a}","{b}"],"controlNodes":["{c}","{d}"],"gain":{gain}}}"#
    )
}

fn ctrl_i(kind: &str, name: &str, a: &str, b: &str, src: &str, gain: f64) -> String {
    format!(
        r#"{{"kind":"{kind}","name":"{name}","nodes":["{a}","{b}"],"controlSource":"{src}","gain":{gain}}}"#
    )
}

fn run(elements: &[String]) -> Result<nodal_engine::analysis::OpResult, Box<dyn Error>> {
    let n = parse_netlist(&netlist(&elements.join(",")))?;
    let mut out = simulate(&n)?;
    match out.pop() {
        Some(AnalysisResult::Op(r)) => Ok(r),
        other => Err(format!("expected an op result, got {other:?}").into()),
    }
}

fn near(got: f64, want: f64, abs: f64) -> TestResult {
    if (got - want).abs() <= 1e-5 * want.abs() + abs {
        Ok(())
    } else {
        Err(format!("got {got}, want {want}").into())
    }
}

fn v(r: &nodal_engine::analysis::OpResult, name: &str, want: f64) -> TestResult {
    let got = *r
        .node_voltages
        .get(name)
        .ok_or_else(|| format!("no V({name})"))?;
    near(got, want, 1e-8)
}

fn i(r: &nodal_engine::analysis::OpResult, name: &str, want: f64) -> TestResult {
    let got = *r
        .branch_currents
        .get(name)
        .ok_or_else(|| format!("no I({name})"))?;
    near(got, want, 1e-13)
}

#[test]
fn resistor() -> TestResult {
    let r = run(&[
        two("V", "V1", "a", "0", "dc", 2.0),
        two("R", "R1", "a", "0", "value", 4.0),
    ])?;
    v(&r, "a", 2.0)?;
    i(&r, "V1", -0.5)
}

#[test]
fn vsource_sign() -> TestResult {
    let r = run(&[
        two("V", "V1", "a", "0", "dc", 1.0),
        two("R", "R1", "a", "0", "value", 1e3),
    ])?;
    v(&r, "a", 1.0)?;
    i(&r, "V1", -1e-3)?;
    if r.node_voltages.contains_key("0") {
        return Err("ground reported".into());
    }
    Ok(())
}

#[test]
fn isource() -> TestResult {
    let r = run(&[
        two("I", "I1", "0", "a", "dc", 1e-3),
        two("R", "R1", "a", "0", "value", 1e3),
    ])?;
    v(&r, "a", 1.0)?;
    if !r.branch_currents.is_empty() {
        return Err("I source must not report a branch current".into());
    }
    Ok(())
}

#[test]
fn capacitor_open() -> TestResult {
    let r = run(&[
        two("V", "V1", "a", "0", "dc", 1.0),
        two("R", "R1", "a", "b", "value", 1e3),
        two("C", "C1", "b", "0", "value", 1e-6),
    ])?;
    v(&r, "b", 1.0)
}

#[test]
fn inductor_short() -> TestResult {
    let r = run(&[
        two("V", "V1", "a", "0", "dc", 1.0),
        two("R", "R1", "a", "b", "value", 1e3),
        two("L", "L1", "b", "0", "value", 1e-3),
    ])?;
    v(&r, "b", 0.0)?;
    i(&r, "L1", 1e-3)
}

#[test]
fn vcvs() -> TestResult {
    let r = run(&[
        two("V", "V1", "in", "0", "dc", 1.0),
        two("R", "R1", "in", "0", "value", 1e3),
        ctrl_v("E", "E1", "e", "0", "in", "0", 2.0),
        two("R", "R2", "e", "0", "value", 1e3),
    ])?;
    v(&r, "e", 2.0)?;
    i(&r, "E1", -2e-3)
}

#[test]
fn vccs() -> TestResult {
    let r = run(&[
        two("V", "V1", "in", "0", "dc", 1.0),
        two("R", "R1", "in", "0", "value", 1e3),
        ctrl_v("G", "G1", "g", "0", "in", "0", 1e-3),
        two("R", "R2", "g", "0", "value", 1e3),
    ])?;
    v(&r, "g", -1.0)
}

#[test]
fn ccvs() -> TestResult {
    let r = run(&[
        two("V", "V1", "in", "0", "dc", 1.0),
        two("R", "R1", "in", "0", "value", 1e3),
        ctrl_i("H", "H1", "h", "0", "V1", 1000.0),
        two("R", "R2", "h", "0", "value", 1e3),
    ])?;
    v(&r, "h", -1.0)?;
    i(&r, "H1", 1e-3)
}

#[test]
fn cccs() -> TestResult {
    let r = run(&[
        two("V", "V1", "in", "0", "dc", 1.0),
        two("R", "R1", "in", "0", "value", 1e3),
        ctrl_i("F", "F1", "f", "0", "V1", 2.0),
        two("R", "R2", "f", "0", "value", 1e3),
    ])?;
    v(&r, "f", 2.0)
}

#[test]
fn singular_vcvs_reports_unknown() -> TestResult {
    let n = parse_netlist(&netlist(
        &[
            two("R", "R1", "a", "0", "value", 1e3),
            ctrl_v("E", "E1", "a", "0", "a", "0", 1.0),
        ]
        .join(","),
    ))?;
    match simulate(&n) {
        Err(EngineError::Singular { unknown }) => {
            if unknown == "V(a)" || unknown == "I(E1)" {
                let msg = EngineError::Singular { unknown }.to_string();
                if msg.starts_with("singular system: no unique solution for ") {
                    return Ok(());
                }
                return Err(format!("bad message {msg}").into());
            }
            Err(format!("unexpected unknown {unknown}").into())
        }
        other => Err(format!("expected Singular, got {other:?}").into()),
    }
}

#[test]
fn wide_range_across_subcircuits_solves() -> TestResult {
    let r = run(&[
        two("I", "I1", "0", "a", "dc", 1e-13),
        two("R", "R1", "a", "0", "value", 1e13),
        two("V", "V1", "b", "0", "dc", 1.0),
        two("R", "R2", "b", "0", "value", 1e-3),
    ])?;
    v(&r, "a", 1.0)?;
    v(&r, "b", 1.0)?;
    i(&r, "V1", -1e3)
}

#[test]
fn one_result_per_analysis() -> TestResult {
    let json = r#"{"irVersion":1,"elements":[
        {"kind":"V","name":"V1","nodes":["a","0"],"dc":1},
        {"kind":"R","name":"R1","nodes":["a","0"],"value":1}],
        "analyses":[{"type":"op"},{"type":"op"}]}"#;
    let out = simulate(&parse_netlist(json)?)?;
    if out.len() != 2 {
        return Err("expected 2 results".into());
    }
    let s = serde_json::to_string(&out[0])?;
    if !(s.contains(r#""type":"op""#) && s.contains("nodeVoltages") && s.contains("branchCurrents"))
    {
        return Err(format!("bad json {s}").into());
    }
    Ok(())
}
