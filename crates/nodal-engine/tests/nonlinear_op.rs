//! Nonlinear DC operating points with analytic references.
//!
//! Tolerance: |x - xref| <= 1e-5*|xref| + a, a = 1e-8 for V, 1e-13 for I.

use std::error::Error;

use nodal_engine::analysis::{AnalysisResult, OpResult};
use nodal_engine::devices::constants::{BOLTZMANN, CHARGE, T_NOMINAL, VT};
use nodal_engine::{parse_netlist, simulate};

type TestResult = Result<(), Box<dyn Error>>;

fn netlist(elements: &str, model: &str, extra: &str) -> String {
    format!(
        r#"{{"irVersion":1,"elements":[{elements}],"models":[{{"name":"DM","type":"D","params":{{{model}}}}}],{extra}"analyses":[{{"type":"op"}}]}}"#
    )
}

fn run(text: &str) -> Result<OpResult, Box<dyn Error>> {
    let n = parse_netlist(text)?;
    match simulate(&n)?.pop() {
        Some(AnalysisResult::Op(r)) => Ok(r),
        None => Err("no result".into()),
    }
}

fn close(got: f64, want: f64, abs: f64) -> bool {
    (got - want).abs() <= 1e-5 * want.abs() + abs
}

const I1: &str = r#"{"kind":"I","name":"I1","nodes":["0","a"],"dc":1e-3}"#;
const D1: &str = r#"{"kind":"D","name":"D1","nodes":["a","0"],"model":"DM"}"#;

#[test]
fn vt_value() {
    let want = 1.38064852e-23 * 300.15 / 1.6021766208e-19;
    assert_eq!(BOLTZMANN, 1.38064852e-23);
    assert_eq!(CHARGE, 1.6021766208e-19);
    assert_eq!(T_NOMINAL, 300.15);
    assert!(((VT - want) / want).abs() <= 1e-12);
    // CODATA 2014 gives 0.025864917007...; the SPICE2 constants gave 0.0258641864.
    assert!((VT - 0.025864917007).abs() < 1e-12);
}

#[test]
fn diode_current_source_analytic() -> TestResult {
    let r = run(&netlist(&format!("{I1},{D1}"), "", ""))?;
    // 1e-3 = IS (exp(V/VT) - 1) + gmin V, solved by bisection.
    let f = |v: f64| 1e-14 * ((v / VT).exp() - 1.0) + 1e-12 * v - 1e-3;
    let (mut lo, mut hi) = (0.0_f64, 1.0_f64);
    for _ in 0..200 {
        let mid = 0.5 * (lo + hi);
        if f(mid) > 0.0 {
            hi = mid;
        } else {
            lo = mid;
        }
    }
    let got = r.node_voltages["a"];
    assert!(close(got, lo, 1e-8), "V(a) = {got}, want {lo}");
    Ok(())
}

#[test]
fn diode_series_resistor_matches_rs() -> TestResult {
    let v1 = r#"{"kind":"V","name":"V1","nodes":["in","0"],"dc":5}"#;
    let r1 = r#"{"kind":"R","name":"R1","nodes":["in","a"],"value":1000}"#;
    let with_rs = run(&netlist(&format!("{v1},{r1},{D1}"), r#""RS":100"#, ""))?;
    let r2 = r#"{"kind":"R","name":"R2","nodes":["a","b"],"value":100}"#;
    let d2 = r#"{"kind":"D","name":"D1","nodes":["b","0"],"model":"DM"}"#;
    let explicit = run(&netlist(&format!("{v1},{r1},{r2},{d2}"), "", ""))?;
    let rel = |a: f64, b: f64| (a - b).abs() / b.abs();
    assert!(rel(with_rs.node_voltages["in"], explicit.node_voltages["in"]) <= 1e-12);
    assert!(
        rel(
            with_rs.branch_currents["V1"],
            explicit.branch_currents["V1"]
        ) <= 1e-12
    );
    let names: Vec<_> = with_rs.node_voltages.keys().cloned().collect();
    assert_eq!(names, ["a", "in"]);
    Ok(())
}

#[test]
fn nodeset_changes_start_not_answer() -> TestResult {
    let plain = run(&netlist(&format!("{I1},{D1}"), "", ""))?;
    let seeded = run(&netlist(
        &format!("{I1},{D1}"),
        "",
        r#""nodeset":{"a":0.65},"#,
    ))?;
    let (a, b) = (plain.node_voltages["a"], seeded.node_voltages["a"]);
    assert!(close(b, a, 1e-8), "{a} vs {b}");
    Ok(())
}
