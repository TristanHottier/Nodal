//! AC small-signal analysis of linear devices against closed forms.
//!
//! Tolerances (docs/VALIDATION.md section 3): magnitude
//! `|got - want| <= 1e-4 |want| + 1e-12`, phase 0.01 degrees after wrapping
//! into (-180, 180].

use std::error::Error;
use std::f64::consts::PI;

use nodal_engine::analysis::{AcResult, AnalysisResult, ComplexSeries};
use nodal_engine::devices::bjt::{BjtParams, charges, eval as bjt_eval};
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

/// Golden-run tolerances again, for the same stored-voltage reason as the
/// diode tests. `i_dc` is the base bias current, `pnp` mirrors the circuit.
fn bjt_ac_netlist(model_type: &str, pnp: bool) -> String {
    let (bias, vc) = if pnp {
        (r#"["b","0"]"#, -5.0)
    } else {
        (r#"["0","b"]"#, 5.0)
    };
    format!(
        r#"{{"irVersion":1,"elements":[
{{"kind":"I","name":"I1","nodes":{bias},"dc":1e-5}},
{{"kind":"I","name":"I2","nodes":["0","b"],"ac":{{"mag":1e-9}}}},
{{"kind":"V","name":"VC","nodes":["c","0"],"dc":{vc}}},
{{"kind":"Q","name":"Q1","nodes":["c","b","0"],"model":"QM"}}],
"models":[{{"name":"QM","type":"{model_type}","params":{{"IS":1e-16,"BF":100,"TF":3e-10,"CJE":1e-12}}}}],
"options":{{"reltol":1e-6,"vntol":1e-9,"abstol":1e-15}},
"analyses":[{{"type":"ac","sweep":"dec","points":5,"fstart":1e3,"fstop":1e9}}]}}"#
    )
}

fn bjt_ac_params() -> BjtParams {
    BjtParams {
        is: 1e-16,
        bf: 100.0,
        br: 1.0,
        nf: 1.0,
        nr: 1.0,
        vaf: f64::INFINITY,
        cje: 1e-12,
        vje: 0.75,
        mje: 0.33,
        cjc: 0.0,
        vjc: 0.75,
        mjc: 0.33,
        tf: 3e-10,
        tr: 0.0,
        fc: 0.5,
    }
}

#[test]
fn bjt_hybrid_pi_analytic() -> TestResult {
    let r = run_ac(&bjt_ac_netlist("NPN", false))?;
    let p = bjt_ac_params();
    let gmin = 1e-12;
    // Operating point: Ib(vbe, vbe - 5) = 1e-5 by bisection (vc = 5, ve = 0).
    let f = |v: f64| bjt_eval(v, v - 5.0, &p, gmin).ib - 1e-5;
    let (mut lo, mut hi) = (0.0_f64, 1.0_f64);
    for _ in 0..200 {
        let mid = 0.5 * (lo + hi);
        if f(mid) > 0.0 {
            hi = mid;
        } else {
            lo = mid;
        }
    }
    let e = bjt_eval(lo, lo - 5.0, &p, gmin);
    let c = charges(lo, lo - 5.0, &p);
    // The collector is an AC ground, so vbc = vbe = vb. The source branch
    // current I(VC) flows from the + terminal through the source, so it is
    // -ic. Closed form: ic / ib = gm / (g_pi + j w C_pi) with the exact
    // partials (gm = dIc/dvbe + dIc/dvbc, g_pi = dIb/dvbe + dIb/dvbc).
    let gm = e.dic_dvbe + e.dic_dvbc;
    let gpi = e.dib_dvbe + e.dib_dvbc;
    let cpi = c.cbe + c.cbc + c.cbe_vbc;
    assert_ac(&r, "I(VC)", |freq| {
        let y = add(real(gpi), mul(jw(freq), real(cpi)));
        div(real(-gm * 1e-9), y)
    })
}

/// Common-emitter stage with emitter and collector resistors, a finite Early
/// voltage and large transit times, so the transcapacitance is large and all
/// four `xcmcb` entries matter. `pnp` mirrors every DC source and the bias.
fn bjt_stage_netlist(model_type: &str, pnp: bool) -> String {
    let (bias, vcc) = if pnp {
        (r#"["b","0"]"#, -10.0)
    } else {
        (r#"["0","b"]"#, 10.0)
    };
    format!(
        r#"{{"irVersion":1,"elements":[
{{"kind":"V","name":"VCC","nodes":["v","0"],"dc":{vcc}}},
{{"kind":"R","name":"RC","nodes":["v","c"],"value":1000}},
{{"kind":"R","name":"RE","nodes":["e","0"],"value":100}},
{{"kind":"I","name":"I1","nodes":{bias},"dc":1e-5}},
{{"kind":"I","name":"I2","nodes":["0","b"],"ac":{{"mag":1e-6}}}},
{{"kind":"Q","name":"Q1","nodes":["c","b","e"],"model":"QM"}}],
"models":[{{"name":"QM","type":"{model_type}","params":{{"IS":1e-16,"BF":100,"VAF":5,"TF":1e-8,"TR":1e-9,"CJE":1e-12,"CJC":5e-13}}}}],
"options":{{"reltol":1e-6,"vntol":1e-9,"abstol":1e-15}},
"analyses":[{{"type":"ac","sweep":"dec","points":5,"fstart":1e3,"fstop":1e9}}]}}"#
    )
}

fn bjt_stage_params() -> BjtParams {
    BjtParams {
        vaf: 5.0,
        cjc: 5e-13,
        tf: 1e-8,
        tr: 1e-9,
        ..bjt_ac_params()
    }
}

/// 3x3 complex determinant.
fn det3(m: [[C64; 3]; 3]) -> C64 {
    let minor = |a: usize, b: usize, c: usize, d: usize| {
        add(
            mul(m[1][a], m[2][b]),
            mul(real(-1.0), mul(m[1][c], m[2][d])),
        )
    };
    let t0 = mul(m[0][0], minor(1, 2, 2, 1));
    let t1 = mul(m[0][1], minor(0, 2, 2, 0));
    let t2 = mul(m[0][2], minor(0, 1, 1, 0));
    add(add(t0, mul(real(-1.0), t1)), t2)
}

#[test]
fn bjt_finite_early_transcap_analytic() -> TestResult {
    let r = run_ac(&bjt_stage_netlist("NPN", false))?;
    let p = bjt_stage_params();
    let (gmin, rc, re) = (1e-12, 1000.0, 100.0);
    // Operating point by bisection on vbe: ve = RE (Ib + Ic), vc = 10 - RC Ic
    // (with the substrate gmin to ground at the collector), Ib = 1e-5.
    let solve_vbe = |vbe: f64| -> (f64, f64, f64) {
        // Inner fixed-point on (ve, vc): both are monotone contractions here.
        let (mut ve, mut vc) = (0.0_f64, 5.0_f64);
        for _ in 0..500 {
            let e = bjt_eval(vbe, vbe + ve - vc, &p, gmin);
            ve = re * (e.ib + e.ic);
            vc = (10.0 - rc * e.ic) / (1.0 + rc * gmin);
        }
        (ve, vc, bjt_eval(vbe, vbe + ve - vc, &p, gmin).ib)
    };
    let (mut lo, mut hi) = (0.3_f64, 0.8_f64);
    for _ in 0..100 {
        let mid = 0.5 * (lo + hi);
        if solve_vbe(mid).2 > 1e-5 {
            hi = mid;
        } else {
            lo = mid;
        }
    }
    let vbe = 0.5 * (lo + hi);
    let (ve, vc, _) = solve_vbe(vbe);
    let vbc = vbe + ve - vc;
    let e = bjt_eval(vbe, vbc, &p, gmin);
    // Capacitances from finite differences of the charges.
    let h = 1e-6 * VT;
    let q = |x: f64, y: f64| charges(x, y, &p);
    let cbe = (q(vbe + h, vbc).qbe - q(vbe - h, vbc).qbe) / (2.0 * h);
    let cx = (q(vbe, vbc + h).qbe - q(vbe, vbc - h).qbe) / (2.0 * h);
    let cbc = (q(vbe, vbc + h).qbc - q(vbe, vbc - h).qbc) / (2.0 * h);
    assert!(cx.abs() > 1e-14, "transcapacitance {cx:e} should be large");
    // Phasor KCL at b, c, e from the physical definitions: base current into
    // the device is Ib = g.v + jw (dQbe + dQbc), collector current is
    // Ic = g.v - jw dQbc, Ie = -(Ib + Ic), with vbe = vb - ve, vbc = vb - vc.
    let solve = |f: f64| {
        let w = 2.0 * PI * f;
        // Row coefficients on (vb, vc, ve) of the device currents.
        let (ybe, ybc) = (
            C64::new(e.dib_dvbe, w * cbe),
            C64::new(e.dib_dvbc, w * (cx + cbc)),
        );
        let (zbe, zbc) = (C64::new(e.dic_dvbe, 0.0), C64::new(e.dic_dvbc, -w * cbc));
        let ib = [add(ybe, ybc), mul(real(-1.0), ybc), mul(real(-1.0), ybe)];
        let ic = [add(zbe, zbc), mul(real(-1.0), zbc), mul(real(-1.0), zbe)];
        let mut m = [[real(0.0); 3]; 3];
        for k in 0..3 {
            m[0][k] = ib[k];
            m[1][k] = ic[k];
            m[2][k] = mul(real(-1.0), add(ib[k], ic[k]));
        }
        m[1][1] = add(m[1][1], real(1.0 / rc + gmin));
        m[2][2] = add(m[2][2], real(1.0 / re));
        let rhs = [real(1e-6), real(0.0), real(0.0)];
        let d = det3(m);
        let mut x = [real(0.0); 3];
        for (k, xk) in x.iter_mut().enumerate() {
            let mut mk = m;
            for row in 0..3 {
                mk[row][k] = rhs[row];
            }
            *xk = div(det3(mk), d);
        }
        x
    };
    assert_ac(&r, "V(b)", |f| solve(f)[0])?;
    assert_ac(&r, "V(c)", |f| solve(f)[1])?;
    assert_ac(&r, "V(e)", |f| solve(f)[2])
}

/// A PNP biased as the mirror of the NPN has the same small-signal circuit,
/// here with a finite Early voltage and a large transcapacitance.
#[test]
fn pnp_ac_matches_mirrored_npn() -> TestResult {
    let n = run_ac(&bjt_stage_netlist("NPN", false))?;
    let q = run_ac(&bjt_stage_netlist("PNP", true))?;
    for signal in ["V(b)", "V(c)", "V(e)"] {
        let (x, y) = (series(&n, signal)?, series(&q, signal)?);
        assert_eq!(x.re.len(), y.re.len());
        for k in 0..x.re.len() {
            let diff = (x.re[k] - y.re[k]).hypot(x.im[k] - y.im[k]);
            assert!(
                diff <= 1e-6 * x.re[k].hypot(x.im[k]),
                "{signal} point {k}: ({}, {}) vs ({}, {})",
                x.re[k],
                x.im[k],
                y.re[k],
                y.im[k]
            );
        }
    }
    Ok(())
}
