//! Nonlinear elements in the IR: DC edges, topology and the placeholder
//! error until the device tasks land.
//!
//! Tests return `Result` instead of unwrapping, so the workspace
//! `unwrap_used` and `expect_used` lints hold in test code too.

use std::error::Error;

use nodal_engine::circuit::Circuit;
use nodal_engine::{Error as EngineError, parse_netlist};

type TestResult = Result<(), Box<dyn Error>>;

const MODELS: &str = r#""models":[{"name":"DM","type":"D"},{"name":"QM","type":"NPN"},{"name":"MM","type":"NMOS"},{"name":"SM","type":"SW"}]"#;

fn netlist(elements: &str) -> String {
    format!(r#"{{"irVersion":1,"elements":[{elements}],{MODELS},"analyses":[{{"type":"op"}}]}}"#)
}

fn v(name: &str, node: &str) -> String {
    format!(r#"{{"kind":"V","name":"{name}","nodes":["{node}","0"],"dc":1}}"#)
}

#[test]
fn dc_edges_per_kind() -> TestResult {
    let text = netlist(&format!(
        "{},{},{},{},{}",
        r#"{"kind":"D","name":"D1","nodes":["a","c"],"model":"DM"}"#,
        r#"{"kind":"Q","name":"Q1","nodes":["c","b","e"],"model":"QM"}"#,
        r#"{"kind":"M","name":"M1","nodes":["d","g","s","bk"],"model":"MM"}"#,
        r#"{"kind":"S","name":"S1","nodes":["p","n"],"controlNodes":["cp","cn"],"model":"SM"}"#,
        r#"{"kind":"G","name":"G1","nodes":["o","0"],"controlNodes":["x","y"],"gain":1}"#,
    ));
    let n = parse_netlist(&text)?;
    let edges: Vec<Vec<(&str, &str)>> = n.elements.iter().map(|e| e.dc_edges()).collect();
    assert_eq!(edges[0], [("a", "c")]);
    assert_eq!(edges[1], [("b", "e"), ("b", "c")]);
    assert_eq!(edges[2], [("d", "s")]);
    assert_eq!(edges[3], [("p", "n")]);
    assert!(edges[4].is_empty());
    assert_eq!(n.elements[3].control_nodes(), ["cp", "cn"]);
    assert_eq!(n.elements[2].model(), Some("MM"));
    Ok(())
}

#[test]
fn mosfet_gate_alone_is_floating() -> TestResult {
    let text = netlist(&format!(
        "{},{}",
        v("V1", "d"),
        r#"{"kind":"M","name":"M1","nodes":["d","g","0","0"],"model":"MM"}"#
    ));
    match Circuit::build(&parse_netlist(&text)?) {
        Err(EngineError::Floating { nodes, elements }) => {
            assert_eq!(nodes, ["g"]);
            assert_eq!(elements, ["M1"]);
            Ok(())
        }
        other => Err(format!("expected Floating, got {other:?}").into()),
    }
}

#[test]
fn bjt_builds() -> TestResult {
    let text = netlist(&format!(
        "{},{}",
        v("V1", "a"),
        r#"{"kind":"Q","name":"Q1","nodes":["a","a","0"],"model":"QM"}"#
    ));
    Circuit::build(&parse_netlist(&text)?)?;
    Ok(())
}
