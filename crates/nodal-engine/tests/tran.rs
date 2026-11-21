//! Transient analysis against closed forms, with the golden-run options
//! (reltol 1e-6, vntol 1e-9, abstol 1e-15, chgtol 1e-18) and both methods.

use std::error::Error;

use nodal_engine::analysis::{AnalysisResult, TranResult};
use nodal_engine::ir::Waveform;
use nodal_engine::waveform::next_breakpoint;
use nodal_engine::{parse_netlist, simulate};

type TestResult = Result<(), Box<dyn Error>>;

const METHODS: [&str; 2] = ["trap", "gear"];
const OPTIONS: &str = r#""reltol":1e-6,"vntol":1e-9,"abstol":1e-15,"chgtol":1e-18"#;
const PULSE: &str = r#"{"type":"pulse","v1":0,"v2":1,"td":0,"tr":1e-9,"tf":1e-9,"pw":1,"per":2}"#;

fn run_tran(text: &str) -> Result<TranResult, Box<dyn Error>> {
    let netlist = parse_netlist(text)?;
    match simulate(&netlist)?.pop() {
        Some(AnalysisResult::Tran(r)) => Ok(r),
        other => Err(format!("expected a tran result, got {other:?}").into()),
    }
}

fn series<'a>(r: &'a TranResult, node: &str) -> Result<&'a Vec<f64>, Box<dyn Error>> {
    r.node_voltages
        .get(node)
        .ok_or_else(|| format!("no node {node}").into())
}

fn rc(method: &str, analysis: &str, wave: &str) -> String {
    format!(
        r#"{{"irVersion":1,"elements":[
        {{"kind":"V","name":"V1","nodes":["in","0"],"dc":0,"tran":{wave}}},
        {{"kind":"R","name":"R1","nodes":["in","out"],"value":1000}},
        {{"kind":"C","name":"C1","nodes":["out","0"],"value":1e-6}}],
        "analyses":[{analysis}],
        "options":{{{OPTIONS},"method":"{method}"}}}}"#
    )
}

fn rlc(method: &str, analysis: &str, wave: &str, ic: &str) -> String {
    let (c_ic, l_ic) = if ic.is_empty() {
        (String::new(), String::new())
    } else {
        (r#","ic":1"#.to_string(), r#","ic":1e-3"#.to_string())
    };
    format!(
        r#"{{"irVersion":1,"elements":[
        {{"kind":"V","name":"V1","nodes":["in","0"],"dc":0,"tran":{wave}}},
        {{"kind":"R","name":"R1","nodes":["in","a"],"value":10}},
        {{"kind":"L","name":"L1","nodes":["a","b"],"value":1e-3{l_ic}}},
        {{"kind":"C","name":"C1","nodes":["b","0"],"value":1e-6{c_ic}}}],
        "analyses":[{analysis}],
        "options":{{{OPTIONS},"method":"{method}"}}}}"#
    )
}

/// RC response to a unit input that ramps over `tr` and then holds.
fn rc_ramp(t: f64, tau: f64, tr: f64) -> f64 {
    // Response to a unit ramp starting at 0: (t - tau (1 - e^{-t/tau})) / tr.
    let ramp = |t: f64| {
        if t <= 0.0 {
            0.0
        } else {
            (t + tau * (-t / tau).exp_m1()) / tr
        }
    };
    ramp(t) - ramp(t - tr)
}

#[test]
fn t1_rc_matches_closed_form() -> TestResult {
    for method in METHODS {
        let r = run_tran(&rc(
            method,
            r#"{"type":"tran","tstep":1e-5,"tstop":5e-3}"#,
            PULSE,
        ))?;
        let out = series(&r, "out")?;
        let mut worst: f64 = 0.0;
        for (t, v) in r.time.iter().zip(out) {
            worst = worst.max((v - rc_ramp(*t, 1e-3, 1e-9)).abs());
        }
        eprintln!(
            "T1 {method}: {} points, worst error {worst:e}",
            r.time.len()
        );
        assert!(worst <= 1e-3, "{method}: worst error {worst}");
    }
    Ok(())
}

/// Underdamped series RLC step response across C.
fn rlc_step(t: f64) -> f64 {
    let (r, l, c) = (10.0_f64, 1e-3_f64, 1e-6_f64);
    let w0 = 1.0 / (l * c).sqrt();
    let zeta = r / 2.0 * (c / l).sqrt();
    let wd = w0 * (1.0 - zeta * zeta).sqrt();
    1.0 - (-zeta * w0 * t).exp()
        * ((wd * t).cos() + zeta / (1.0 - zeta * zeta).sqrt() * (wd * t).sin())
}

#[test]
fn t2_rlc_matches_closed_form() -> TestResult {
    for method in METHODS {
        let r = run_tran(&rlc(
            method,
            r#"{"type":"tran","tstep":1e-6,"tstop":2e-3}"#,
            PULSE,
            "",
        ))?;
        let out = series(&r, "b")?;
        let mut worst: f64 = 0.0;
        for (t, v) in r.time.iter().zip(out) {
            worst = worst.max((v - rlc_step(*t)).abs());
        }
        eprintln!(
            "T2 {method}: {} points, worst error {worst:e}",
            r.time.len()
        );
        assert!(worst <= 1e-3 * 2.0, "{method}: worst error {worst}");
    }
    Ok(())
}

#[test]
fn uic_rlc_starts_from_ic() -> TestResult {
    let (r, l, c) = (10.0_f64, 1e-3_f64, 1e-6_f64);
    let alpha = r / (2.0 * l);
    let w0 = 1.0 / (l * c).sqrt();
    let wd = (w0 * w0 - alpha * alpha).sqrt();
    let (v0, i0) = (1.0, 1e-3);
    let want = |t: f64| {
        let b = (i0 / c + alpha * v0) / wd;
        (-alpha * t).exp() * (v0 * (wd * t).cos() + b * (wd * t).sin())
    };
    for method in METHODS {
        let r = run_tran(&rlc(
            method,
            r#"{"type":"tran","tstep":1e-6,"tstop":2e-3,"uic":true}"#,
            r#"{"type":"pwl","points":[[0,0],[1,0]]}"#,
            "ic",
        ))?;
        let out = series(&r, "b")?;
        assert_eq!(r.time[0], 0.0);
        assert!((out[0] - 1.0).abs() <= 1e-6, "{method}: v(C) = {}", out[0]);
        let il = r.branch_currents.get("L1").ok_or("no I(L1)")?;
        assert!((il[0] - 1e-3).abs() <= 1e-8, "{method}: I(L) = {}", il[0]);
        let mut worst: f64 = 0.0;
        for (t, v) in r.time.iter().zip(out) {
            worst = worst.max((v - want(*t)).abs());
        }
        eprintln!("UIC {method}: worst error {worst:e}");
        assert!(worst <= 1e-3, "{method}: worst error {worst}");
    }
    Ok(())
}

#[test]
fn breakpoint_within_hmin_is_reached() -> TestResult {
    let wave = r#"{"type":"pwl","points":[[0,0],[1e-4,0],[1.00000000000001e-4,1],[1,1]]}"#;
    // 1e-4 + 1e-20 is the next double above 1e-4 for this purpose.
    let near = f64::from_bits(1e-4_f64.to_bits() + 1);
    let wave = wave.replace("1.00000000000001e-4", &format!("{near:e}"));
    assert!(near > 1e-4 && near - 1e-4 < 1e-18);
    for method in METHODS {
        let r = run_tran(&rc(
            method,
            r#"{"type":"tran","tstep":1e-5,"tstop":5e-4}"#,
            &wave,
        ))?;
        // hmin = 1e-11 * tmax = 1e-16.
        assert!(
            r.time.iter().any(|t| (t - 1e-4).abs() <= 1e-16),
            "{method}: no point at 1e-4"
        );
        assert_eq!(r.time.last().copied(), Some(5e-4));
    }
    Ok(())
}

#[test]
fn last_point_is_tstop() -> TestResult {
    for method in METHODS {
        let r = run_tran(&rc(
            method,
            r#"{"type":"tran","tstep":1e-5,"tstop":3.3e-3}"#,
            PULSE,
        ))?;
        assert_eq!(r.time.first().copied(), Some(0.0));
        assert_eq!(r.time.last().copied(), Some(3.3e-3));
        assert!(r.time.windows(2).all(|w| w[1] > w[0]));
        for v in r.node_voltages.values().chain(r.branch_currents.values()) {
            assert_eq!(v.len(), r.time.len());
        }
    }
    Ok(())
}

#[test]
fn points_land_on_pulse_corners() -> TestResult {
    let wave =
        r#"{"type":"pulse","v1":0,"v2":1,"td":1e-4,"tr":1e-5,"tf":2e-5,"pw":2e-4,"per":1e-3}"#;
    let w = Waveform::Pulse {
        v1: 0.0,
        v2: 1.0,
        td: 1e-4,
        tr: 1e-5,
        tf: 2e-5,
        pw: 2e-4,
        per: 1e-3,
    };
    let tstop = 2.5e-3;
    let mut corners = Vec::new();
    let mut t = 0.0;
    while let Some(c) = next_breakpoint(&w, t) {
        if c >= tstop {
            break;
        }
        corners.push(c);
        t = c;
    }
    assert!(corners.len() >= 8, "{corners:?}");
    for method in METHODS {
        let r = run_tran(&rc(
            method,
            &format!(r#"{{"type":"tran","tstep":2e-5,"tstop":{tstop:e}}}"#),
            wave,
        ))?;
        for c in &corners {
            assert!(r.time.contains(c), "{method}: no point at {c:e}");
        }
    }
    Ok(())
}

#[test]
fn tstart_drops_early_points() -> TestResult {
    for method in METHODS {
        let r = run_tran(&rc(
            method,
            r#"{"type":"tran","tstep":1e-5,"tstop":3e-3,"tstart":1e-3}"#,
            PULSE,
        ))?;
        assert!(
            r.time.first().is_some_and(|t| *t >= 1e-3),
            "{:?}",
            r.time.first()
        );
        assert_eq!(r.time.last().copied(), Some(3e-3));
        let out = series(&r, "out")?;
        for (t, v) in r.time.iter().zip(out) {
            assert!((v - rc_ramp(*t, 1e-3, 1e-9)).abs() <= 1e-3);
        }
    }
    Ok(())
}

#[test]
fn operating_point_uses_waveform_value_at_zero() -> TestResult {
    // A source whose waveform starts at 1 V with dc 0: the initial point is 1 V.
    let wave = r#"{"type":"pulse","v1":1,"v2":2,"td":1e-3,"tr":1e-6,"tf":1e-6,"pw":1,"per":2}"#;
    for method in METHODS {
        let r = run_tran(&rc(
            method,
            r#"{"type":"tran","tstep":1e-5,"tstop":5e-4}"#,
            wave,
        ))?;
        let out = series(&r, "out")?;
        assert_eq!(out[0], 1.0, "{method}");
        assert!(out.iter().all(|v| (v - 1.0).abs() <= 1e-6), "{method}");
    }
    Ok(())
}
