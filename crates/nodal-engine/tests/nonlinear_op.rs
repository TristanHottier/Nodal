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
        other => Err(format!("expected an op result, got {other:?}").into()),
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
        r#"{},{},{{"kind":"M","name":"M1","nodes":["d","g","0","0"],"model":"MM",{MOS_W_L}}}"#,
        r#"{"kind":"V","name":"VG","nodes":["g","0"],"dc":3}"#,
        r#"{"kind":"V","name":"VD","nodes":["d","0"],"dc":-0.5}"#,
    );
    let r = run(&mos_netlist(&els, "NMOS", 0.02))?;
    // devices.md section 3 with drain and source swapped: the swapped source
    // is the d node (-0.5 V), so vgs = 3.5, vds = 0.5, vbs = 0 - (-0.5) = 0.5.
    let (vto, gamma, phi, lambda, beta) = (0.7, 0.4, 0.65_f64, 0.02, 1e-4 * 100e-6 / 10e-6);
    let (vgs, vds, vbs) = (3.5, 0.5, 0.5);
    // vbs > 0 branch of s(Vbs).
    let s = (phi.sqrt() - vbs / (2.0 * phi.sqrt())).max(0.0);
    let vth = vto + gamma * (s - phi.sqrt());
    let vov = vgs - vth;
    assert!(vov > vds, "triode expected, vov = {vov}");
    let id = beta * (vov - vds / 2.0) * vds * (1.0 + lambda * vds);
    // Current into the physical drain is -id. The bulk-drain junction is
    // forward biased (Vbd = 0.5 V) and injects its current into the drain
    // node, IS (exp(Vbd / Vt) - 1) + gmin Vbd, which VD also supplies. VD
    // supplies the negative of the current that the device takes from node d.
    let vbd = 0.5;
    let want = id + 1e-14 * ((vbd / VT).exp() - 1.0) + 1e-12 * vbd;
    let got = r.branch_currents["VD"];
    assert!(close(got, want, 1e-13), "I(VD) = {got}, want {want}");
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

/// Cross-coupled NPN latch. The nodeset picks the state, as in ngspice where
/// the nodeset is held through the first converged iterations (cktload.c,
/// niiter.c). Reference values are ngspice-42 results for the exported deck
/// (`export-spice`, then `run; print v(c1) v(c2)`).
fn latch(nodeset: &str) -> Result<OpResult, Box<dyn Error>> {
    run(&format!(
        r#"{{"irVersion":1,"elements":[
        {{"kind":"V","name":"VCC","nodes":["vcc","0"],"dc":5}},
        {{"kind":"R","name":"RC1","nodes":["vcc","c1"],"value":1000}},
        {{"kind":"R","name":"RC2","nodes":["vcc","c2"],"value":1000}},
        {{"kind":"R","name":"RB1","nodes":["c2","b1"],"value":10000}},
        {{"kind":"R","name":"RB2","nodes":["c1","b2"],"value":10000}},
        {{"kind":"Q","name":"Q1","nodes":["c1","b1","0"],"model":"QN"}},
        {{"kind":"Q","name":"Q2","nodes":["c2","b2","0"],"model":"QN"}}],
        "models":[{{"name":"QN","type":"NPN","params":{{"IS":1e-15,"BF":100}}}}],
        "nodeset":{nodeset},
        "analyses":[{{"type":"op"}}],
        "options":{{"reltol":1e-6,"vntol":1e-9,"abstol":1e-15}}}}"#
    ))
}

#[test]
fn nodeset_selects_latch_state_like_ngspice() -> TestResult {
    let low = 7.319658e-2;
    let high = 4.614470;
    let a = latch(r#"{"c1":0.1,"c2":5}"#)?;
    assert!(close(a.node_voltages["c1"], low, 1e-8), "{a:?}");
    assert!(close(a.node_voltages["c2"], high, 1e-8), "{a:?}");
    let b = latch(r#"{"c1":5,"c2":0.1}"#)?;
    assert!(close(b.node_voltages["c1"], high, 1e-8), "{b:?}");
    assert!(close(b.node_voltages["c2"], low, 1e-8), "{b:?}");
    Ok(())
}

/// A PNP held off through 1 GOhm resistors: only gmin matters. ngspice puts
/// the PNP substrate junction (gmin) from the base to ground (lateral
/// substrate, the PNP default), so V(b) sits below the supply by the drop
/// across RB. Pinned ngspice-42 results for the exported deck: V(b) =
/// 4.995015, V(c) = 4.999995 (a collector-to-ground gmin would give V(b)
/// close to 5 and V(c) near 4.995).
#[test]
fn pnp_substrate_gmin_goes_base_to_ground() -> TestResult {
    let r = run(r#"{"irVersion":1,"elements":[
        {"kind":"V","name":"V1","nodes":["e","0"],"dc":5},
        {"kind":"R","name":"RB","nodes":["e","b"],"value":1e9},
        {"kind":"R","name":"RC","nodes":["e","c"],"value":1e9},
        {"kind":"Q","name":"Q1","nodes":["c","b","e"],"model":"QP"}],
        "models":[{"name":"QP","type":"PNP","params":{"IS":1e-16,"BF":100}}],
        "analyses":[{"type":"op"}],
        "options":{"reltol":1e-6,"vntol":1e-9,"abstol":1e-15}}"#)?;
    let (vb, vc) = (r.node_voltages["b"], r.node_voltages["c"]);
    assert!(close(vb, 4.995015, 1e-8), "V(b) = {vb}");
    assert!(close(vc, 4.999995, 1e-8), "V(c) = {vc}");
    Ok(())
}

/// Source driven to -0.65 V (NMOS) with gate, drain and bulk at ground: the
/// bulk-source junction is forward biased (Vbs = 0.65) and the channel is off,
/// so the supply carries the junction current only. The drain junction sees
/// Vbd = 0 and carries nothing. `VS` has its positive terminal at ground and
/// its negative terminal on the source node, so the junction current flowing
/// into the source node leaves the positive terminal: I(VS) is negative.
fn forward_bulk_current(kind: &str, vs: f64) -> Result<f64, Box<dyn Error>> {
    let els = format!(
        r#"{{"kind":"V","name":"VS","nodes":["0","s"],"dc":{vs}}},{{"kind":"M","name":"M1","nodes":["0","0","s","0"],"model":"MM","w":100e-6,"l":10e-6}}"#
    );
    let text = format!(
        r#"{{"irVersion":1,"elements":[{els}],"models":[{{"name":"MM","type":"{kind}","params":{{"VTO":{vto},"KP":1e-4}}}}],"analyses":[{{"type":"op"}}]}}"#,
        vto = if kind == "PMOS" { -1 } else { 1 },
    );
    Ok(run(&text)?.branch_currents["VS"])
}

#[test]
fn nmos_forward_bulk_current() -> TestResult {
    let (is, gmin, v) = (1e-14, 1e-12, 0.65);
    // Bulk-source diode current flows bulk to source; VS (source node +)
    // sources the negative of it.
    let want = -(is * ((v / VT).exp() - 1.0) + gmin * v);
    let got = forward_bulk_current("NMOS", v)?;
    assert!(close(got, want, 1e-13), "I(VS) = {got}, want {want}");
    Ok(())
}

#[test]
fn pmos_forward_bulk_current() -> TestResult {
    let (is, gmin, v) = (1e-14, 1e-12, 0.65);
    let want = is * ((v / VT).exp() - 1.0) + gmin * v;
    let got = forward_bulk_current("PMOS", -v)?;
    assert!(close(got, want, 1e-13), "I(VS) = {got}, want {want}");
    Ok(())
}

/// 12 CMOS inverters in a chain, input at 0 V. Plain Newton hits a singular
/// matrix at the second iterate (every stage sits at mid-rail with
/// gm/gmin ~ 1e9 per stage), so the engine must fall back to gmin stepping
/// as ngspice's `CKTop` does. Reference values: `ngspice -b` (ngspice-42) on
/// `nodal-cli export-spice validation/perf/inverter-chain.json`, `.op`.
#[test]
fn inverter_chain_op_converges() -> TestResult {
    let text = include_str!("../../../validation/perf/inverter-chain.json");
    let r = run(text)?;
    for k in 1..=12 {
        let want = if k % 2 == 1 { 3.3 } else { 1.273077e-9 };
        let got = r.node_voltages[&format!("o{k}")];
        assert!((got - want).abs() <= 1e-3, "V(o{k}) = {got}, want {want}");
    }
    Ok(())
}

/// Two current sources in series with nothing else at the middle node: the
/// topology check reports the floating node before any Newton iteration, so
/// this does not exercise the singular-iterate fallback. It only shows that
/// such a circuit still ends in an error, not a made-up solution.
#[test]
fn structurally_singular_still_reported() -> TestResult {
    let text = r#"{"irVersion":1,"elements":[
        {"kind":"I","name":"I1","nodes":["0","a"],"dc":1e-3},
        {"kind":"I","name":"I2","nodes":["a","b"],"dc":2e-3},
        {"kind":"R","name":"R1","nodes":["b","0"],"value":1000}],
        "analyses":[{"type":"op"}]}"#;
    let n = parse_netlist(text)?;
    let err = simulate(&n).err().ok_or("expected an error")?;
    // The topology check reports it before any Newton iteration runs.
    assert!(
        matches!(&err, nodal_engine::Error::Floating { nodes, .. } if nodes == &["a".to_string()]),
        "{err:?}"
    );
    Ok(())
}
