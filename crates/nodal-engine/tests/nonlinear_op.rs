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

fn bjt_netlist(elements: &str) -> String {
    format!(
        r#"{{"irVersion":1,"elements":[{elements}],"models":[{{"name":"QM","type":"NPN","params":{{"IS":1e-16,"BF":100,"BR":1}}}}],"analyses":[{{"type":"op"}}]}}"#
    )
}

/// NPN currents with VAF infinite, gmin on both junctions (bjtload.c).
fn npn_currents(vbe: f64, vbc: f64) -> (f64, f64) {
    let (is, bf, br, gmin) = (1e-16, 100.0, 1.0, 1e-12);
    let cbe = is * ((vbe / VT).exp() - 1.0);
    let cbc = is * ((vbc / VT).exp() - 1.0);
    let ic = cbe - cbc - cbc / br - gmin * vbc;
    let ib = cbe / bf + gmin * vbe + cbc / br + gmin * vbc;
    (ic, ib)
}

fn bisect(f: impl Fn(f64) -> f64) -> f64 {
    let (mut lo, mut hi) = (0.0_f64, 1.0_f64);
    for _ in 0..200 {
        let mid = 0.5 * (lo + hi);
        if f(mid) > 0.0 {
            hi = mid;
        } else {
            lo = mid;
        }
    }
    lo
}

#[test]
fn npn_forced_ib() -> TestResult {
    let i1 = r#"{"kind":"I","name":"I1","nodes":["0","b"],"dc":10e-6}"#;
    let v1 = r#"{"kind":"V","name":"V1","nodes":["c","0"],"dc":5}"#;
    let q1 = r#"{"kind":"Q","name":"Q1","nodes":["c","b","0"],"model":"QM"}"#;
    let r = run(&bjt_netlist(&format!("{i1},{v1},{q1}")))?;
    let vbe = bisect(|v| npn_currents(v, v - 5.0).1 - 10e-6);
    let (ic, _) = npn_currents(vbe, vbe - 5.0);
    // The substrate gmin (collector to ground) also loads V1.
    let want = -(ic + 1e-12 * 5.0);
    let got = r.branch_currents["V1"];
    assert!(close(got, want, 1e-13), "I(V1) = {got}, want {want}");
    let vb = r.node_voltages["b"];
    assert!(close(vb, vbe, 1e-8), "V(b) = {vb}, want {vbe}");
    Ok(())
}

#[test]
fn diode_connected_npn() -> TestResult {
    let i1 = r#"{"kind":"I","name":"I1","nodes":["0","a"],"dc":1e-4}"#;
    let q1 = r#"{"kind":"Q","name":"Q1","nodes":["a","a","0"],"model":"QM"}"#;
    let r = run(&bjt_netlist(&format!("{i1},{q1}")))?;
    // Base and collector tie to a, so vbc = 0 and
    // 1e-4 = IF (1 + 1/BF) + 2 gmin V (base gmin plus substrate gmin).
    let f = |v: f64| {
        let (ic, ib) = npn_currents(v, 0.0);
        ic + ib + 1e-12 * v - 1e-4
    };
    let want = bisect(f);
    let got = r.node_voltages["a"];
    assert!(close(got, want, 1e-8), "V(a) = {got}, want {want}");
    Ok(())
}

#[test]
fn pnp_circuit_mirrors_npn() -> TestResult {
    let npn = run(&bjt_netlist(&format!(
        "{},{},{}",
        r#"{"kind":"I","name":"I1","nodes":["0","b"],"dc":10e-6}"#,
        r#"{"kind":"V","name":"V1","nodes":["c","0"],"dc":5}"#,
        r#"{"kind":"Q","name":"Q1","nodes":["c","b","0"],"model":"QM"}"#
    )))?;
    let pnp_text = bjt_netlist(&format!(
        "{},{},{}",
        r#"{"kind":"I","name":"I1","nodes":["b","0"],"dc":10e-6}"#,
        r#"{"kind":"V","name":"V1","nodes":["c","0"],"dc":-5}"#,
        r#"{"kind":"Q","name":"Q1","nodes":["c","b","0"],"model":"QM"}"#
    ))
    .replace(r#""type":"NPN""#, r#""type":"PNP""#);
    let pnp = run(&pnp_text)?;
    assert!(close(pnp.node_voltages["b"], -npn.node_voltages["b"], 1e-8));
    assert!(close(
        pnp.branch_currents["V1"],
        -npn.branch_currents["V1"],
        1e-13
    ));
    Ok(())
}

fn mos_netlist(elements: &str, kind: &str, lambda: f64) -> String {
    format!(
        r#"{{"irVersion":1,"elements":[{elements}],"models":[{{"name":"MM","type":"{kind}","params":{{"VTO":{vto},"KP":1e-4,"GAMMA":0.4,"PHI":0.65,"LAMBDA":{lambda}}}}}],"analyses":[{{"type":"op"}}]}}"#,
        vto = if kind == "PMOS" { -0.7 } else { 0.7 },
    )
}

const MOS_W_L: &str = r#""w":100e-6,"l":10e-6"#;

#[test]
fn nmos_saturation_analytic() -> TestResult {
    let els = format!(
        r#"{},{},{{"kind":"M","name":"M1","nodes":["d","g","0","0"],"model":"MM",{MOS_W_L}}}"#,
        r#"{"kind":"V","name":"V1","nodes":["g","0"],"dc":2}"#,
        r#"{"kind":"V","name":"V2","nodes":["d","0"],"dc":3}"#,
    );
    let r = run(&mos_netlist(&els, "NMOS", 0.02))?;
    let beta = 1e-3;
    // gmin is stamped drain to source, so V2 also supplies gmin * 3.
    let want = -(beta / 2.0 * 1.3 * 1.3 * (1.0 + 0.02 * 3.0) + 1e-12 * 3.0);
    let got = r.branch_currents["V2"];
    assert!(close(got, want, 1e-13), "I(V2) = {got}, want {want}");
    assert!(close(r.branch_currents["V1"], 0.0, 1e-13));
    Ok(())
}

#[test]
fn diode_connected_nmos() -> TestResult {
    let els = format!(
        r#"{},{{"kind":"M","name":"M1","nodes":["a","a","0","0"],"model":"MM",{MOS_W_L}}}"#,
        r#"{"kind":"I","name":"I1","nodes":["0","a"],"dc":1e-4}"#,
    );
    let r = run(&mos_netlist(&els, "NMOS", 0.0))?;
    // 1e-4 = beta/2 (V - VTO)^2 + gmin V, solved by bisection above VTO.
    let f = |v: f64| 1e-3 / 2.0 * (v - 0.7) * (v - 0.7) + 1e-12 * v - 1e-4;
    let (mut lo, mut hi) = (0.7_f64, 3.0_f64);
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
    assert!(
        (lo - (0.7 + (2.0_f64 * 1e-4 / 1e-3).sqrt())).abs() < 1e-6,
        "gmin only shifts the closed form slightly"
    );
    Ok(())
}

#[test]
fn pmos_circuit_mirrors_nmos() -> TestResult {
    let nmos = format!(
        r#"{},{},{{"kind":"M","name":"M1","nodes":["d","g","0","0"],"model":"MM",{MOS_W_L}}}"#,
        r#"{"kind":"V","name":"V1","nodes":["g","0"],"dc":2}"#,
        r#"{"kind":"V","name":"V2","nodes":["d","0"],"dc":1}"#,
    );
    let pmos = nmos
        .replace(r#""dc":2"#, r#""dc":-2"#)
        .replace(r#""dc":1}"#, r#""dc":-1}"#);
    let n = run(&mos_netlist(&nmos, "NMOS", 0.02))?;
    let p = run(&mos_netlist(&pmos, "PMOS", 0.02))?;
    assert!(close(
        p.branch_currents["V2"],
        -n.branch_currents["V2"],
        1e-13
    ));
    Ok(())
}

#[test]
fn nmos_reverse_conduction() -> TestResult {
    // Drain below source: the device conducts from source to drain, and the
    // body effect uses the (now source-side) drain voltage.
    let els = format!(
        r#"{},{},{{"kind":"M","name":"M1","nodes":["d","g","s","0"],"model":"MM",{MOS_W_L}}}"#,
        r#"{"kind":"V","name":"V1","nodes":["g","0"],"dc":2}"#,
        r#"{"kind":"V","name":"V2","nodes":["d","0"],"dc":0}"#,
    ) + r#",{"kind":"V","name":"V3","nodes":["s","0"],"dc":0.5}"#;
    let r = run(&mos_netlist(&els, "NMOS", 0.02))?;
    let i = r.branch_currents["V2"];
    // Current leaves the "source" node s and enters the "drain" d: V2 absorbs it.
    assert!(i > 0.0, "I(V2) = {i}");
    Ok(())
}

fn switch_netlist(vc: f64, model: &str, options: &str) -> String {
    format!(
        r#"{{"irVersion":1,"elements":[
{{"kind":"V","name":"VC","nodes":["c","0"],"dc":{vc}}},
{{"kind":"V","name":"V1","nodes":["in","0"],"dc":10}},
{{"kind":"R","name":"R1","nodes":["in","out"],"value":1000}},
{{"kind":"S","name":"S1","nodes":["out","0"],"controlNodes":["c","0"],"model":"SM"}}],
"models":[{{"name":"SM","type":"SW","params":{{{model}}}}}],{options}"analyses":[{{"type":"op"}}]}}"#
    )
}

#[test]
fn switch_on() -> TestResult {
    let r = run(&switch_netlist(2.0, r#""VT":1,"RON":10,"ROFF":1e9"#, ""))?;
    // Divider: 1000 ohm over RON = 10 ohm.
    let want = 10.0 * 10.0 / 1010.0;
    let got = r.node_voltages["out"];
    assert!(close(got, want, 1e-8), "V(out) = {got}, want {want}");
    Ok(())
}

#[test]
fn switch_off() -> TestResult {
    let r = run(&switch_netlist(0.5, r#""VT":1,"RON":10,"ROFF":1e9"#, ""))?;
    let want = 10.0 * 1e9 / (1e9 + 1000.0);
    let got = r.node_voltages["out"];
    assert!(close(got, want, 1e-8), "V(out) = {got}, want {want}");
    Ok(())
}

#[test]
fn switch_in_band_starts_off() -> TestResult {
    let r = run(&switch_netlist(
        1.2,
        r#""VT":1,"VH":0.5,"RON":10,"ROFF":1e9"#,
        "",
    ))?;
    let want = 10.0 * 1e9 / (1e9 + 1000.0);
    let got = r.node_voltages["out"];
    assert!(close(got, want, 1e-8), "V(out) = {got}, want {want}");
    Ok(())
}

#[test]
fn switch_roff_follows_gmin() -> TestResult {
    // gmin = 1e-3 S makes ROFF = 1000 ohm, equal to the series resistor.
    let r = run(&switch_netlist(
        0.0,
        r#""VT":1,"RON":10"#,
        r#""options":{"gmin":1e-3},"#,
    ))?;
    let got = r.node_voltages["out"];
    assert!(close(got, 5.0, 1e-8), "V(out) = {got}, want 5");
    // Default gmin gives ROFF = 1e12: the switch is effectively open.
    let r = run(&switch_netlist(0.0, r#""VT":1,"RON":10"#, ""))?;
    let got = r.node_voltages["out"];
    assert!(close(got, 10.0, 1e-8), "V(out) = {got}, want 10");
    Ok(())
}
