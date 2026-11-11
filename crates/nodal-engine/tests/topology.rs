//! Circuit indexing and topology checks.
//!
//! Tests return `Result` instead of unwrapping, so the workspace
//! `unwrap_used` and `expect_used` lints hold in test code too.

use std::error::Error;

use nodal_engine::circuit::Circuit;
use nodal_engine::{Error as EngineError, parse_netlist};

type TestResult = Result<(), Box<dyn Error>>;

fn el(kind: &str, name: &str, nodes: [&str; 2], value: f64) -> String {
    let field = match kind {
        "V" | "I" => "dc",
        _ => "value",
    };
    format!(
        r#"{{"kind":"{kind}","name":"{name}","nodes":["{}","{}"],"{field}":{value}}}"#,
        nodes[0], nodes[1]
    )
}

fn netlist(elements: &[String]) -> String {
    format!(
        r#"{{"irVersion":1,"elements":[{}],"analyses":[{{"type":"op"}}]}}"#,
        elements.join(",")
    )
}

fn build(elements: &[String]) -> Result<Circuit, Box<dyn Error>> {
    let n = parse_netlist(&netlist(elements))?;
    Ok(Circuit::build(&n)?)
}

fn err_of(elements: &[String]) -> Result<EngineError, Box<dyn Error>> {
    match build(elements) {
        Ok(_) => Err("expected an error".into()),
        Err(e) => e
            .downcast::<EngineError>()
            .map(|b| *b)
            .map_err(|_| "not an engine error".into()),
    }
}

fn names(v: &[&str]) -> Vec<String> {
    v.iter().map(|s| s.to_string()).collect()
}

fn floating(nodes: &[&str], elements: &[&str]) -> EngineError {
    EngineError::Floating {
        nodes: names(nodes),
        elements: names(elements),
    }
}

fn loop_of(elements: &[&str]) -> EngineError {
    EngineError::SourceLoop {
        elements: names(elements),
    }
}

#[test]
fn floating_through_capacitor() -> TestResult {
    let e = err_of(&[
        el("V", "V1", ["in", "0"], 1.0),
        el("R", "R1", ["in", "a"], 1e3),
        el("C", "C1", ["a", "b"], 1e-6),
        el("R", "R2", ["b", "c"], 1e3),
    ])?;
    assert_eq!(e, floating(&["b", "c"], &["C1", "R2"]));
    Ok(())
}

#[test]
fn floating_behind_current_source() -> TestResult {
    let e = err_of(&[
        el("I", "I1", ["0", "a"], 1e-3),
        el("R", "R1", ["a", "b"], 1e3),
        el("R", "R2", ["c", "0"], 1e3),
    ])?;
    assert_eq!(e, floating(&["a", "b"], &["I1", "R1"]));
    Ok(())
}

#[test]
fn no_ground() -> TestResult {
    let e = err_of(&[
        el("V", "V1", ["a", "b"], 1.0),
        el("R", "R1", ["a", "b"], 1e3),
    ])?;
    assert_eq!(e, floating(&["a", "b"], &["R1", "V1"]));
    Ok(())
}

#[test]
fn vsource_loop() -> TestResult {
    let e = err_of(&[
        el("V", "V1", ["a", "0"], 1.0),
        el("V", "V2", ["a", "0"], 2.0),
        el("R", "R1", ["a", "0"], 1e3),
    ])?;
    assert_eq!(e, loop_of(&["V1", "V2"]));
    Ok(())
}

#[test]
fn inductor_vsource_loop() -> TestResult {
    let e = err_of(&[
        el("V", "V1", ["a", "0"], 1.0),
        el("L", "L1", ["a", "0"], 1e-3),
    ])?;
    assert_eq!(e, loop_of(&["L1", "V1"]));
    Ok(())
}

#[test]
fn vcvs_ccvs_loop() -> TestResult {
    let e1 = r#"{"kind":"E","name":"E1","nodes":["a","0"],"controlNodes":["in","0"],"gain":2}"#;
    let h1 = r#"{"kind":"H","name":"H1","nodes":["a","0"],"controlSource":"V1","gain":1000}"#;
    let e = err_of(&[
        el("V", "V1", ["in", "0"], 1.0),
        el("R", "R1", ["in", "0"], 1e3),
        e1.to_string(),
        h1.to_string(),
    ])?;
    assert_eq!(e, loop_of(&["E1", "H1"]));
    Ok(())
}

#[test]
fn loop_reports_only_members() -> TestResult {
    let e = err_of(&[
        el("V", "V1", ["a", "0"], 1.0),
        el("V", "V2", ["b", "a"], 1.0),
        el("V", "V3", ["b", "0"], 2.0),
        el("V", "V4", ["c", "b"], 1.0),
        el("R", "R1", ["c", "0"], 1e3),
    ])?;
    assert_eq!(e, loop_of(&["V1", "V2", "V3"]));
    Ok(())
}

#[test]
fn indexing_order() -> TestResult {
    let c = build(&[
        el("V", "V1", ["in", "0"], 1.0),
        el("R", "R1", ["in", "out"], 1e3),
        el("L", "L1", ["out", "0"], 1e-3),
    ])?;
    assert_eq!(c.node_names, names(&["in", "out"]));
    assert_eq!(c.branch_names, names(&["V1", "L1"]));
    assert_eq!(c.unknown_count(), 4);
    assert_eq!(c.node("in"), Some(0));
    assert_eq!(c.node("out"), Some(1));
    assert_eq!(c.node("0"), None);
    assert_eq!(c.node("nope"), None);
    assert_eq!(c.branch("V1"), Some(0));
    assert_eq!(c.branch("L1"), Some(1));
    assert_eq!(c.branch("R1"), None);
    assert_eq!(c.unknown_label(0), "V(in)");
    assert_eq!(c.unknown_label(1), "V(out)");
    assert_eq!(c.unknown_label(2), "I(V1)");
    assert_eq!(c.unknown_label(3), "I(L1)");
    Ok(())
}

#[test]
fn control_nodes_follow_terminals_per_element() -> TestResult {
    let g1 = r#"{"kind":"G","name":"G1","nodes":["o","0"],"controlNodes":["p","q"],"gain":0.01}"#;
    let c = build(&[
        el("V", "V1", ["p", "0"], 1.0),
        el("R", "R1", ["q", "0"], 1e3),
        g1.to_string(),
        el("R", "R2", ["o", "0"], 1e3),
    ])?;
    assert_eq!(c.node_names, names(&["p", "q", "o"]));
    Ok(())
}

#[test]
fn display_names_culprits() -> TestResult {
    let f = floating(&["b", "c"], &["C1", "R2"]);
    assert_eq!(
        f.to_string(),
        "floating nodes with no DC path to ground: b, c (connected elements: C1, R2)"
    );
    let l = loop_of(&["V1", "V2"]);
    assert_eq!(
        l.to_string(),
        "loop of voltage sources and inductors: V1, V2"
    );
    Ok(())
}
