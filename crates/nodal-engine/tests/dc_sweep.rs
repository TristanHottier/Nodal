//! DC sweep: analytic checks through `simulate`.

use std::error::Error;

use nodal_engine::analysis::{AnalysisResult, DcResult, OpResult};
use nodal_engine::{parse_netlist, simulate};

type TestResult = Result<(), Box<dyn Error>>;

const L1_SWEEP: &str = r#"{"irVersion":1,"elements":[
    {"kind":"V","name":"V1","nodes":["in","0"],"dc":10},
    {"kind":"R","name":"R1","nodes":["in","out"],"value":1000},
    {"kind":"R","name":"R2","nodes":["out","0"],"value":3000}],
    "analyses":[{"type":"dc","source":"V1","start":0,"stop":10,"step":1},{"type":"op"}]}"#;

fn split(text: &str) -> Result<(DcResult, OpResult), Box<dyn Error>> {
    let mut out = simulate(&parse_netlist(text)?)?;
    let op = match out.pop() {
        Some(AnalysisResult::Op(r)) => r,
        other => return Err(format!("expected op, got {other:?}").into()),
    };
    match out.pop() {
        Some(AnalysisResult::Dc(r)) => Ok((r, op)),
        other => Err(format!("expected dc, got {other:?}").into()),
    }
}

#[test]
fn sweep_linear_divider() -> TestResult {
    let (dc, _) = split(L1_SWEEP)?;
    assert_eq!(dc.source, "V1");
    assert_eq!(dc.sweep.len(), 11);
    for (k, v1) in dc.sweep.iter().enumerate() {
        assert!((v1 - k as f64).abs() < 1e-12);
        let out = dc.node_voltages["out"][k];
        assert!((out - 0.75 * v1).abs() <= 1e-9, "point {k}: {out}");
        let i = dc.branch_currents["V1"][k];
        assert!((i + v1 / 4000.0).abs() <= 1e-12, "point {k}: {i}");
    }
    Ok(())
}

#[test]
fn sweep_restores_source() -> TestResult {
    let (_, op) = split(L1_SWEEP)?;
    assert!((op.node_voltages["out"] - 7.5).abs() < 1e-9);
    Ok(())
}

#[test]
fn sweep_current_source() -> TestResult {
    let text = r#"{"irVersion":1,"elements":[
        {"kind":"I","name":"I1","nodes":["0","a"],"dc":1e-3},
        {"kind":"R","name":"R1","nodes":["a","0"],"value":2000}],
        "analyses":[{"type":"dc","source":"I1","start":0,"stop":4e-3,"step":1e-3},{"type":"op"}]}"#;
    let (dc, op) = split(text)?;
    assert_eq!(dc.sweep.len(), 5);
    for (k, i1) in dc.sweep.iter().enumerate() {
        let a = dc.node_voltages["a"][k];
        assert!((a - 2000.0 * i1).abs() <= 1e-8, "point {k}: {a}");
    }
    assert!((op.node_voltages["a"] - 2.0).abs() < 1e-8);
    Ok(())
}
