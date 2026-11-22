//! Single-analysis entry point and its progress reports, on the reference
//! circuits of `validation/circuits/`.

use std::error::Error;
use std::fs;
use std::path::PathBuf;

use nodal_engine::ir::Netlist;
use nodal_engine::{parse_netlist, simulate, simulate_analysis};

type TestResult = Result<(), Box<dyn Error>>;

const IDS: [&str; 4] = ["L1", "N1", "A1", "T1-trap"];

fn load(id: &str) -> Result<Netlist, Box<dyn Error>> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../validation/circuits")
        .join(format!("{id}.json"));
    Ok(parse_netlist(&fs::read_to_string(path)?)?)
}

#[test]
fn progress_reaches_one_for_each_analysis() -> TestResult {
    for id in IDS {
        let netlist = load(id)?;
        let mut reports = Vec::new();
        simulate_analysis(&netlist, 0, &mut |p| reports.push(p))?;
        assert_eq!(reports.last(), Some(&1.0), "{id}: last report");
        assert!(
            reports.iter().all(|p| (0.0..=1.0).contains(p)),
            "{id}: out of range"
        );
        assert!(
            reports.windows(2).all(|w| w[0] <= w[1]),
            "{id}: not non-decreasing"
        );
        if id == "T1-trap" {
            assert!(reports.len() > 10, "{id}: only {} reports", reports.len());
        }
        if id == "L1" {
            assert_eq!(reports, vec![1.0]);
        }
    }
    Ok(())
}

#[test]
fn single_analysis_matches_simulate() -> TestResult {
    for id in IDS {
        let netlist = load(id)?;
        let all = simulate(&netlist)?;
        let one = simulate_analysis(&netlist, 0, &mut |_| {})?;
        assert_eq!(one, all[0], "{id}");
    }
    Ok(())
}

#[test]
fn index_out_of_range_is_invalid() -> TestResult {
    let netlist = load("L1")?;
    match simulate_analysis(&netlist, 3, &mut |_| {}) {
        Err(nodal_engine::Error::Invalid(msg)) => {
            assert_eq!(msg, "analysis index 3 out of range (1 analyses)");
            Ok(())
        }
        other => Err(format!("expected Invalid, got {other:?}").into()),
    }
}
