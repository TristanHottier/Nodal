//! AC small-signal analysis of linear devices against closed forms.
//!
//! Tolerances (docs/VALIDATION.md section 3): magnitude
//! `|got - want| <= 1e-4 |want| + 1e-12`, phase 0.01 degrees after wrapping
//! into (-180, 180].

use std::error::Error;
use std::f64::consts::PI;

use nodal_engine::analysis::{AcResult, AnalysisResult, ComplexSeries};
use nodal_engine::devices::constants::VT;
use nodal_engine::devices::diode::{DiodeParams, charge, eval};
use nodal_engine::linalg::C64;
use nodal_engine::{parse_netlist, simulate};

type TestResult = Result<(), Box<dyn Error>>;

fn run_ac(text: &str) -> Result<AcResult, Box<dyn Error>> {
    let n = parse_netlist(text)?;
    let mut out = simulate(&n)?;
    match out.pop() {
        Some(AnalysisResult::Ac(r)) => Ok(r),
        other => Err(format!("expected an ac result, got {other:?}").into()),
    }
}

fn series<'a>(result: &'a AcResult, signal: &str) -> Result<&'a ComplexSeries, Box<dyn Error>> {
    let found = if let Some(name) = signal.strip_prefix("V(") {
        result.node_voltages.get(name.trim_end_matches(')'))
    } else if let Some(name) = signal.strip_prefix("I(") {
        result.branch_currents.get(name.trim_end_matches(')'))
    } else {
        None
    };
    found.ok_or_else(|| format!("no signal {signal}").into())
}

/// Wraps an angle in degrees into (-180, 180].
fn wrap(deg: f64) -> f64 {
    let mut d = (deg + 180.0).rem_euclid(360.0) - 180.0;
    if d <= -180.0 {
        d += 360.0;
    }
    d
}

/// Checks magnitude and phase of `signal` at every frequency.
fn assert_ac(result: &AcResult, signal: &str, expected: impl Fn(f64) -> C64) -> TestResult {
    let s = series(result, signal)?;
    assert_eq!(s.re.len(), result.frequencies.len());
    assert_eq!(s.im.len(), result.frequencies.len());
    for (k, &f) in result.frequencies.iter().enumerate() {
        let want = expected(f);
        let (wm, gm) = (want.re.hypot(want.im), s.re[k].hypot(s.im[k]));
        if (gm - wm).abs() > 1e-4 * wm + 1e-12 {
            return Err(format!("{signal} at {f} Hz: |got| {gm}, |want| {wm}").into());
        }
        if wm > 1e-12 {
            let dp =
                wrap(s.im[k].atan2(s.re[k]).to_degrees() - want.im.atan2(want.re).to_degrees());
            if dp.abs() > 0.01 {
                return Err(format!("{signal} at {f} Hz: phase off by {dp} deg").into());
            }
        }
    }
    Ok(())
}

fn jw(f: f64) -> C64 {
    C64::new(0.0, 2.0 * PI * f)
}

fn div(a: C64, b: C64) -> C64 {
    let d = b.re * b.re + b.im * b.im;
    C64::new(
        (a.re * b.re + a.im * b.im) / d,
        (a.im * b.re - a.re * b.im) / d,
    )
}

fn mul(a: C64, b: C64) -> C64 {
    C64::new(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re)
}

fn add(a: C64, b: C64) -> C64 {
    C64::new(a.re + b.re, a.im + b.im)
}

fn real(x: f64) -> C64 {
    C64::new(x, 0.0)
}

const RC: &str = r#"{"irVersion":1,"elements":[
{"kind":"V","name":"V1","nodes":["in","0"],"ac":{"mag":1}},
{"kind":"R","name":"R1","nodes":["in","out"],"value":1000},
{"kind":"C","name":"C1","nodes":["out","0"],"value":1e-6}],
"analyses":[{"type":"ac","sweep":"dec","points":10,"fstart":1,"fstop":1e7}]}"#;

#[test]
fn rc_lowpass_analytic() -> TestResult {
    let r = run_ac(RC)?;
    assert_eq!(r.frequencies.len(), 71);
    let vout = |f: f64| div(real(1.0), add(real(1.0), mul(jw(f), real(1000.0 * 1e-6))));
    assert_ac(&r, "V(out)", vout)?;
    assert_ac(&r, "V(in)", |_| real(1.0))?;
    assert_ac(&r, "I(V1)", |f| {
        let d = add(real(1.0), mul(real(-1.0), vout(f)));
        mul(real(-1.0 / 1000.0), d)
    })
}

#[test]
fn series_rlc_bandpass_analytic() -> TestResult {
    let r = run_ac(
        r#"{"irVersion":1,"elements":[
{"kind":"V","name":"V1","nodes":["in","0"],"ac":{"mag":1}},
{"kind":"L","name":"L1","nodes":["in","a"],"value":10e-3},
{"kind":"C","name":"C1","nodes":["a","out"],"value":1e-6},
{"kind":"R","name":"R1","nodes":["out","0"],"value":10}],
"analyses":[{"type":"ac","sweep":"dec","points":100,"fstart":100,"fstop":1e4}]}"#,
    )?;
    assert_eq!(r.frequencies.len(), 201);
    let vout = |f: f64| {
        let zl = mul(jw(f), real(10e-3));
        let zc = div(real(1.0), mul(jw(f), real(1e-6)));
        div(real(10.0), add(add(real(10.0), zl), zc))
    };
    assert_ac(&r, "V(out)", vout)?;
    assert_ac(&r, "I(L1)", |f| mul(vout(f), real(0.1)))
}

#[test]
fn current_source_ac_phase() -> TestResult {
    let r = run_ac(
        r#"{"irVersion":1,"elements":[
{"kind":"I","name":"I1","nodes":["0","a"],"ac":{"mag":1e-3,"phase":90}},
{"kind":"R","name":"R1","nodes":["a","0"],"value":1000}],
"analyses":[{"type":"ac","sweep":"lin","points":3,"fstart":1,"fstop":3}]}"#,
    )?;
    assert_eq!(r.frequencies, vec![1.0, 2.0, 3.0]);
    assert_ac(&r, "V(a)", |_| C64::new(0.0, 1.0))
}

#[test]
fn supply_node_has_zero_response() -> TestResult {
    let r = run_ac(
        r#"{"irVersion":1,"elements":[
{"kind":"V","name":"V1","nodes":["in","0"],"ac":{"mag":1}},
{"kind":"R","name":"R1","nodes":["in","out"],"value":1000},
{"kind":"V","name":"VCC","nodes":["vcc","0"],"dc":5},
{"kind":"R","name":"R2","nodes":["vcc","out"],"value":1000}],
"analyses":[{"type":"ac","sweep":"lin","points":3,"fstart":10,"fstop":1000}]}"#,
    )?;
    let vcc = series(&r, "V(vcc)")?;
    assert!(vcc.re.iter().chain(&vcc.im).all(|&v| v == 0.0), "{vcc:?}");
    assert_ac(&r, "V(out)", |_| real(0.5))
}

#[test]
fn vcvs_and_inductor_ac() -> TestResult {
    let r = run_ac(
        r#"{"irVersion":1,"elements":[
{"kind":"V","name":"V1","nodes":["in","0"],"ac":{"mag":0.5,"phase":30}},
{"kind":"E","name":"E1","nodes":["e","0"],"controlNodes":["in","0"],"gain":2},
{"kind":"L","name":"L1","nodes":["e","out"],"value":1e-3},
{"kind":"R","name":"R1","nodes":["out","0"],"value":10}],
"analyses":[{"type":"ac","sweep":"lin","points":5,"fstart":1e3,"fstop":1e5}]}"#,
    )?;
    let vin = C64::new(
        0.5 * 30f64.to_radians().cos(),
        0.5 * 30f64.to_radians().sin(),
    );
    let vout = |f: f64| {
        let den = add(real(10.0), mul(jw(f), real(1e-3)));
        div(mul(real(20.0), vin), den)
    };
    assert_ac(&r, "V(out)", vout)?;
    assert_ac(&r, "I(L1)", |f| mul(vout(f), real(0.1)))?;
    assert_ac(&r, "V(e)", |_| mul(real(2.0), vin))
}

fn switch_netlist(vc: f64) -> String {
    format!(
        r#"{{"irVersion":1,"elements":[
{{"kind":"V","name":"VC","nodes":["c","0"],"dc":{vc}}},
{{"kind":"V","name":"V1","nodes":["in","0"],"dc":10,"ac":{{"mag":1}}}},
{{"kind":"R","name":"R1","nodes":["in","out"],"value":1000}},
{{"kind":"S","name":"S1","nodes":["out","0"],"controlNodes":["c","0"],"model":"SM"}}],
"models":[{{"name":"SM","type":"SW","params":{{"VT":1,"RON":10,"ROFF":1e5}}}}],
"analyses":[{{"type":"ac","sweep":"dec","points":2,"fstart":1,"fstop":1e4}}]}}"#
    )
}

#[test]
fn switch_ac_uses_op_state() -> TestResult {
    // On at the operating point: RON divider. Off: ROFF divider.
    let on = run_ac(&switch_netlist(2.0))?;
    assert_ac(&on, "V(out)", |_| real(10.0 / 1010.0))?;
    let off = run_ac(&switch_netlist(0.0))?;
    assert_ac(&off, "V(out)", |_| real(1e5 / (1e5 + 1000.0)))
}

#[test]
fn failing_frequency_is_reported() -> TestResult {
    // L = 1 H and C = 0.25 F resonate at 1/pi Hz, where node a has no
    // admittance left. The DC topology checks pass (the inductor shorts a to in).
    let text = r#"{"irVersion":1,"elements":[
{"kind":"V","name":"V1","nodes":["in","0"],"ac":{"mag":1}},
{"kind":"L","name":"L1","nodes":["in","a"],"value":1},
{"kind":"C","name":"C1","nodes":["a","0"],"value":0.25}],
"analyses":[{"type":"ac","sweep":"lin","points":1,"fstart":0.3183098861837907,"fstop":0.3183098861837907}]}"#;
    match simulate(&parse_netlist(text)?) {
        Err(nodal_engine::Error::AcPoint { frequency, cause }) => {
            assert_eq!(frequency, std::f64::consts::FRAC_1_PI);
            assert!(
                matches!(*cause, nodal_engine::Error::Singular { .. }),
                "{cause:?}"
            );
            Ok(())
        }
        other => Err(format!("expected AcPoint, got {other:?}").into()),
    }
}

#[test]
fn grid_uses_the_circuit_reltol() -> TestResult {
    // dec, 1 point per decade, 1 to 9 Hz: the point at 10 Hz is accepted
    // only when delta * fstop * reltol >= 1, which needs reltol > 0.0111.
    let netlist = |options: &str| {
        format!(
            r#"{{"irVersion":1,"elements":[
{{"kind":"V","name":"V1","nodes":["in","0"],"ac":{{"mag":1}}}},
{{"kind":"R","name":"R1","nodes":["in","0"],"value":1000}}],{options}
"analyses":[{{"type":"ac","sweep":"dec","points":1,"fstart":1,"fstop":9}}]}}"#
        )
    };
    assert_eq!(run_ac(&netlist(""))?.frequencies, vec![1.0]);
    let wide = run_ac(&netlist(r#""options":{"reltol":0.02},"#))?;
    assert_eq!(wide.frequencies.len(), 2);
    Ok(())
}

#[test]
fn source_without_ac_is_zero_excitation() -> TestResult {
    let r = run_ac(
        r#"{"irVersion":1,"elements":[
{"kind":"V","name":"V1","nodes":["in","0"],"dc":5},
{"kind":"R","name":"R1","nodes":["in","out"],"value":1000},
{"kind":"R","name":"R2","nodes":["out","0"],"value":1000}],
"analyses":[{"type":"ac","sweep":"lin","points":2,"fstart":1,"fstop":2}]}"#,
    )?;
    let out = series(&r, "V(out)")?;
    assert!(out.re.iter().chain(&out.im).all(|&v| v == 0.0));
    Ok(())
}

#[test]
fn ac_json_shape() -> TestResult {
    let r = run_ac(RC)?;
    let json = serde_json::to_value(AnalysisResult::Ac(r))?;
    assert_eq!(json["type"], "ac");
    assert_eq!(json["frequencies"].as_array().map(Vec::len), Some(71));
    assert_eq!(
        json["nodeVoltages"]["out"]["re"].as_array().map(Vec::len),
        Some(71)
    );
    assert!(json["branchCurrents"]["V1"]["im"].is_array());
    Ok(())
}

/// Uses the golden-run tolerances (docs/VALIDATION.md section 3): the small-signal
/// point is the junction voltage stored by the last Newton load, which lags
/// the converged solution by up to one iteration, so the default `reltol`
/// would leave a visible gap to the closed form.
fn diode_ac_netlist(model_params: &str, elements: &str) -> String {
    format!(
        r#"{{"irVersion":1,"elements":[
{{"kind":"I","name":"I1","nodes":["0","a"],"dc":1e-3}},
{{"kind":"I","name":"I2","nodes":["0","a"],"ac":{{"mag":1e-6}}}},
{elements}],
"models":[{{"name":"DM","type":"D","params":{{"IS":1e-14,"CJO":2e-12,"TT":1e-8{model_params}}}}}],
"options":{{"reltol":1e-6,"vntol":1e-9,"abstol":1e-15}},
"analyses":[{{"type":"ac","sweep":"dec","points":5,"fstart":1e3,"fstop":1e9}}]}}"#
    )
}

#[test]
fn diode_small_signal_analytic() -> TestResult {
    let r = run_ac(&diode_ac_netlist(
        "",
        r#"{"kind":"D","name":"D1","nodes":["a","0"],"model":"DM"}"#,
    ))?;
    let p = DiodeParams {
        is: 1e-14,
        n: 1.0,
        rs: 0.0,
        cjo: 2e-12,
        vj: 1.0,
        m: 0.5,
        fc: 0.5,
        tt: 1e-8,
    };
    let gmin = 1e-12;
    // Operating voltage: 1e-3 = Id(v), by bisection.
    let f = |v: f64| 1e-14 * ((v / VT).exp() - 1.0) + gmin * v - 1e-3;
    let (mut lo, mut hi) = (0.0_f64, 1.0_f64);
    for _ in 0..200 {
        let mid = 0.5 * (lo + hi);
        if f(mid) > 0.0 {
            hi = mid;
        } else {
            lo = mid;
        }
    }
    let (_, gd) = eval(lo, &p, gmin);
    let (_, cap) = charge(lo, &p, gmin);
    assert_ac(&r, "V(a)", |freq| {
        div(real(1e-6), add(real(gd), mul(jw(freq), real(cap))))
    })
}

#[test]
fn diode_rs_ac_matches_explicit_resistor() -> TestResult {
    let with_rs = run_ac(&diode_ac_netlist(
        r#","RS":100"#,
        r#"{"kind":"D","name":"D1","nodes":["a","0"],"model":"DM"}"#,
    ))?;
    let explicit = run_ac(&diode_ac_netlist(
        "",
        r#"{"kind":"R","name":"R1","nodes":["a","b"],"value":100},
{"kind":"D","name":"D1","nodes":["b","0"],"model":"DM"}"#,
    ))?;
    let (x, y) = (series(&with_rs, "V(a)")?, series(&explicit, "V(a)")?);
    assert_eq!(x.re.len(), y.re.len());
    for k in 0..x.re.len() {
        let (a, b) = (C64::new(x.re[k], x.im[k]), C64::new(y.re[k], y.im[k]));
        let diff = (a.re - b.re).hypot(a.im - b.im);
        assert!(
            diff <= 1e-12 * b.re.hypot(b.im),
            "point {k}: {a:?} vs {b:?}"
        );
    }
    Ok(())
}
