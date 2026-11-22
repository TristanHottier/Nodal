//! The performance fixtures (`validation/perf/`, written by
//! `validation/scripts/gen-perf.mjs`) must keep their documented shape. Timing
//! is measured in the browser bench page, not here.

use std::error::Error;

use nodal_engine::analysis::AnalysisResult;
use nodal_engine::{parse_netlist, simulate};

type TestResult = Result<(), Box<dyn Error>>;

#[test]
fn tran50_has_50_nodes_and_10k_points() -> TestResult {
    let text = include_str!("../../../validation/perf/tran50.json");
    let results = simulate(&parse_netlist(text)?)?;
    let Some(AnalysisResult::Tran(r)) = results.into_iter().next() else {
        return Err("expected a tran result".into());
    };
    assert_eq!(r.node_voltages.len(), 50);
    assert!(r.time.len() >= 10_000, "only {} accepted points", r.time.len());
    Ok(())
}

#[test]
fn ac50_has_1001_frequencies() -> TestResult {
    let text = include_str!("../../../validation/perf/ac50.json");
    let results = simulate(&parse_netlist(text)?)?;
    let Some(AnalysisResult::Ac(r)) = results.into_iter().next() else {
        return Err("expected an ac result".into());
    };
    assert_eq!(r.frequencies.len(), 1001);
    assert_eq!(r.node_voltages.len(), 50);
    Ok(())
}
