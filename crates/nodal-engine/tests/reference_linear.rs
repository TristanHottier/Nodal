//! Reference circuits L1-L5 (`validation/circuits/`) against closed-form values.
//!
//! Tolerance: |x - xref| <= 1e-5*|xref| + a, a = 1e-8 for V, 1e-13 for I.

use std::error::Error;
use std::fs;
use std::path::PathBuf;

use nodal_engine::analysis::{AnalysisResult, OpResult};
use nodal_engine::ir::{Element, Netlist};
use nodal_engine::{parse_netlist, simulate};

type TestResult = Result<(), Box<dyn Error>>;

fn load(id: &str) -> Result<Netlist, Box<dyn Error>> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../validation/circuits")
        .join(format!("{id}.json"));
    Ok(parse_netlist(&fs::read_to_string(path)?)?)
}

fn op(n: &Netlist) -> Result<OpResult, Box<dyn Error>> {
    let mut out = simulate(n)?;
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

fn v(r: &OpResult, name: &str, want: f64) -> TestResult {
    let got = *r
        .node_voltages
        .get(name)
        .ok_or_else(|| format!("no V({name})"))?;
    near(got, want, 1e-8).map_err(|e| format!("V({name}): {e}").into())
}

fn i(r: &OpResult, name: &str, want: f64) -> TestResult {
    let got = *r
        .branch_currents
        .get(name)
        .ok_or_else(|| format!("no I({name})"))?;
    near(got, want, 1e-13).map_err(|e| format!("I({name}): {e}").into())
}

#[test]
fn l1_divider() -> TestResult {
    let r = op(&load("L1")?)?;
    v(&r, "in", 10.0)?;
    v(&r, "out", 7.5)?;
    i(&r, "V1", -2.5e-3)
}

#[test]
fn l2_wheatstone() -> TestResult {
    let r = op(&load("L2")?)?;
    v(&r, "a", 480.0 / 77.0)?;
    v(&r, "b", 230.0 / 77.0)?;
    i(&r, "V1", -47.0 / 7700.0)
}

#[test]
fn l3_controlled_sources() -> TestResult {
    let r = op(&load("L3")?)?;
    v(&r, "e", 2.0)?;
    v(&r, "g", -2.0)?;
    v(&r, "h", -1.0)?;
    v(&r, "f", 2.0)?;
    i(&r, "V1", -1e-3)?;
    i(&r, "E1", -2e-3)?;
    i(&r, "H1", 1e-3)
}

#[test]
fn l4_all_codes() -> TestResult {
    let mut n = load("L4")?;
    for code in 0u32..256 {
        for el in &mut n.elements {
            if let Element::V { name, dc, .. } = el
                && let Some(k) = name.strip_prefix("VB").and_then(|s| s.parse::<u32>().ok())
            {
                *dc = f64::from((code >> k) & 1);
            }
        }
        let r = op(&n)?;
        v(&r, "n7", f64::from(code) / 256.0).map_err(|e| format!("code {code}: {e}"))?;
    }
    Ok(())
}

#[test]
fn l5_current_source_with_l_and_c() -> TestResult {
    // At DC the inductor is a short and the capacitor is open:
    // V(a) = 2 mA * (3k || 3k) = 3 V, V(b) = V(c) = 2 V, I(L1) = 1 mA.
    let r = op(&load("L5")?)?;
    v(&r, "a", 3.0)?;
    v(&r, "b", 2.0)?;
    v(&r, "c", 2.0)?;
    i(&r, "L1", 1e-3)
}
