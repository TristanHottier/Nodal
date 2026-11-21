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

#[test]
fn breakpoint_just_before_tstop_does_not_overshoot() -> TestResult {
    // hmin = 1e-11 * 1e-6 = 1e-17; the corner sits 5e-18 below tstop, so the
    // post-breakpoint floor of 2 hmin would step past tstop.
    let near = 1e-4 - 5e-18;
    assert!(near < 1e-4 && 1e-4 - near < 1e-17);
    let wave = format!(r#"{{"type":"pwl","points":[[0,0],[{near:e},1],[1,1]]}}"#);
    for method in METHODS {
        let r = run_tran(&rc(
            method,
            r#"{"type":"tran","tstep":1e-6,"tstop":1e-4}"#,
            &wave,
        ))?;
        assert_eq!(r.time.last().copied(), Some(1e-4), "{method}");
        assert!(r.time.iter().all(|t| *t <= 1e-4), "{method}");
        assert!(r.time.windows(2).all(|w| w[1] > w[0]), "{method}");
    }
    Ok(())
}

/// Net charge of the V1 branch current over `[t0, t1]` (trapezoid over the
/// output points, linearly interpolated at the window edges, which are not on
/// the output grid) and the peak current.
fn period_charge(r: &TranResult, t0: f64, t1: f64) -> Result<(f64, f64), Box<dyn Error>> {
    let i = r
        .branch_currents
        .get("V1")
        .ok_or("no branch current of V1")?;
    let at = |t: f64| -> Option<f64> {
        let k = r.time.iter().position(|&x| x >= t)?;
        let (ta, tb) = (*r.time.get(k.checked_sub(1)?)?, r.time[k]);
        let (ia, ib) = (i[k - 1], i[k]);
        Some(ia + (ib - ia) * (t - ta) / (tb - ta))
    };
    let (i0, i1) = (
        at(t0).ok_or("no point before t0")?,
        at(t1).ok_or("no point at t1")?,
    );
    let mut pts = vec![(t0, i0)];
    pts.extend(
        r.time
            .iter()
            .zip(i)
            .filter(|(t, _)| **t > t0 && **t < t1)
            .map(|(t, v)| (*t, *v)),
    );
    pts.push((t1, i1));
    let charge = pts
        .windows(2)
        .map(|w| 0.5 * (w[0].1 + w[1].1) * (w[1].0 - w[0].0))
        .sum();
    let peak = i.iter().fold(0.0_f64, |m, v| m.max(v.abs()));
    Ok((charge, peak))
}

/// A reverse-biased diode with `CJO` only (`TT = 0`) is a nonlinear
/// capacitor, so over one period of the periodic steady state the net
/// charge through V1 is zero. Amplitude 2 V, five periods of settling.
#[test]
fn diode_reverse_charge_balance() -> TestResult {
    let (cjo, va, freq) = (1e-11, 2.0, 1e6);
    for method in METHODS {
        let text = format!(
            r#"{{"irVersion":1,"elements":[
            {{"kind":"V","name":"V1","nodes":["in","0"],"dc":-3,
              "tran":{{"type":"sin","vo":-3,"va":{va},"freq":{freq:e}}}}},
            {{"kind":"R","name":"R1","nodes":["in","d"],"value":1000}},
            {{"kind":"D","name":"D1","nodes":["d","0"],"model":"DM"}}],
            "models":[{{"name":"DM","type":"D","params":{{"IS":1e-14,"CJO":{cjo:e},"VJ":0.8,"M":0.5,"TT":0}}}}],
            "analyses":[{{"type":"tran","tstep":5e-9,"tstop":6e-6}}],
            "options":{{{OPTIONS},"method":"{method}"}}}}"#
        );
        let r = run_tran(&text)?;
        let (charge, peak) = period_charge(&r, 5.0 / freq, 6.0 / freq)?;
        // The swing of the capacitor charge is of order CJO va; the net
        // charge over a period must be a thousandth of it at most.
        assert!(
            charge.abs() < 1e-3 * cjo * va,
            "{method}: net charge {charge:e} C over one period"
        );
        // The current itself is not negligible: the peak exceeds the bound
        // by far, so the integral is not trivially small.
        assert!(peak * 1e-9 > 1e-3 * cjo * va, "{method}: peak {peak:e}");
    }
    Ok(())
}

/// A MOSFET with the channel off and only overlap capacitances is a linear
/// capacitor `(CGSO + CGDO) W + CGBO L` from the gate to ground, so the gate
/// follows the RC closed form, for both polarities.
#[test]
fn mos_overlap_capacitance_charges_gate() -> TestResult {
    let (w, l) = (1e-3, 1e-6);
    let c = 2e-9 * w + 1e-9 * w + 1e-9 * l;
    let tau = 1e6 * c;
    for (kind, vto, sign) in [("NMOS", 5.0, 1.0), ("PMOS", -5.0, -1.0)] {
        for method in METHODS {
            let text = format!(
                r#"{{"irVersion":1,"elements":[
                {{"kind":"V","name":"V1","nodes":["in","0"],"dc":0,"tran":{{"type":"pulse","v1":0,"v2":{sign},"td":0,"tr":1e-9,"tf":1e-9,"pw":1,"per":2}}}},
                {{"kind":"R","name":"R1","nodes":["in","g"],"value":1e6}},
                {{"kind":"M","name":"M1","nodes":["0","g","0","0"],"model":"MM","w":{w:e},"l":{l:e}}}],
                "models":[{{"name":"MM","type":"{kind}","params":{{"VTO":{vto},"KP":1e-4,"CGSO":2e-9,"CGDO":1e-9,"CGBO":1e-9}}}}],
                "analyses":[{{"type":"tran","tstep":1e-7,"tstop":8e-6}}],
                "options":{{{OPTIONS},"method":"{method}"}}}}"#
            );
            let r = run_tran(&text)?;
            let g = series(&r, "g")?;
            for (t, v) in r.time.iter().zip(g) {
                let want = sign * rc_ramp(*t, tau, 1e-9);
                assert!(
                    (v - want).abs() <= 2e-3,
                    "{kind} {method} t={t:e}: {v} vs {want}"
                );
            }
        }
    }
    Ok(())
}

/// A reverse-biased BJT (collector and emitter grounded, base driven through
/// 1 kOhm) with `CJE`, `CJC` and `TF`, `TR` has no DC current, so the
/// periodic steady state again has zero net charge through V1, for NPN and
/// PNP.
#[test]
fn bjt_reverse_charge_balance() -> TestResult {
    let (cj, va, freq) = (1e-11, 2.0, 1e6);
    for (kind, sign) in [("NPN", -1.0), ("PNP", 1.0)] {
        for method in METHODS {
            let text = format!(
                r#"{{"irVersion":1,"elements":[
                {{"kind":"V","name":"V1","nodes":["in","0"],"dc":0,
                  "tran":{{"type":"sin","vo":{vo},"va":{va},"freq":{freq:e}}}}},
                {{"kind":"R","name":"R1","nodes":["in","b"],"value":1000}},
                {{"kind":"Q","name":"Q1","nodes":["0","b","0"],"model":"QM"}}],
                "models":[{{"name":"QM","type":"{kind}","params":{{"IS":1e-16,"BF":100,"BR":1,"VAF":50,"CJE":{cj:e},"CJC":{cj:e},"VJE":0.8,"VJC":0.8,"MJE":0.4,"MJC":0.4,"TF":1e-10,"TR":1e-9}}}}],
                "analyses":[{{"type":"tran","tstep":5e-9,"tstop":6e-6}}],
                "options":{{{OPTIONS},"method":"{method}"}}}}"#,
                vo = 3.0 * sign
            );
            let r = run_tran(&text)?;
            let (charge, peak) = period_charge(&r, 5.0 / freq, 6.0 / freq)?;
            assert!(
                charge.abs() < 1e-3 * 2.0 * cj * va,
                "{kind} {method}: net charge {charge:e} C over one period"
            );
            assert!(
                peak * 1e-9 > 1e-3 * cj * va,
                "{kind} {method}: peak {peak:e}"
            );
        }
    }
    Ok(())
}

#[test]
fn no_equalising_step_before_a_breakpoint() -> TestResult {
    // A quiet circuit takes steps of tmax = tstop / 50 = 8e-6. ngspice-42 lands on the
    // vertex with a single shortened step and never halves the remainder.
    for method in METHODS {
        for k in 1..=9 {
            let vertex = 2.3e-4 + f64::from(k) * 1e-6;
            let wave = format!(
                r#"{{"type":"pwl","points":[[0,0],[{vertex:e},0],[{:e},1],[1,1]]}}"#,
                vertex + 5e-5
            );
            let r = run_tran(&rc(
                method,
                r#"{"type":"tran","tstep":1e-5,"tstop":4e-4}"#,
                &wave,
            ))?;
            let i = r
                .time
                .iter()
                .position(|t| *t == vertex)
                .ok_or("no point at the vertex")?;
            let steps: Vec<f64> = r.time.windows(2).map(|w| w[1] - w[0]).collect();
            // Steps from t = 1e-4 up to the one before the landing step.
            let from = r.time.iter().position(|t| *t >= 1e-4).ok_or("early")?;
            for h in &steps[from..i - 1] {
                assert!(
                    (h - 8e-6).abs() <= 1e-12,
                    "{method} vertex {vertex:e}: step {h:e}"
                );
            }
            assert!(steps[i - 1] <= 8e-6 + 1e-12);
        }
    }
    Ok(())
}

/// A saturating NPN switch driven through 10 kOhm by a 5 V edge of 10 ns at
/// 1 us. The edge forces steps of a few 1e-13 s, where the charge current
/// `a0 (q - q_n)` is only known to within the rounding of the charges times
/// `a0`; the convergence test of the junction devices must allow for that
/// or Newton never converges ("time step too small").
#[test]
fn bjt_switch_edge_runs_to_tstop() -> TestResult {
    for method in METHODS {
        let text = format!(
            r#"{{"irVersion":1,"elements":[
            {{"kind":"V","name":"VIN","nodes":["in","0"],"dc":0,"tran":{{"type":"pwl","points":[[0,0],[1e-6,0],[1.01e-6,5],[5e-6,5],[5.01e-6,0],[1e-5,0]]}}}},
            {{"kind":"R","name":"RB","nodes":["in","b"],"value":10000}},
            {{"kind":"Q","name":"Q1","nodes":["c","b","0"],"model":"QN"}},
            {{"kind":"R","name":"RC","nodes":["vcc","c"],"value":1000}},
            {{"kind":"V","name":"VCC","nodes":["vcc","0"],"dc":5}}],
            "models":[{{"name":"QN","type":"NPN","params":{{"BF":100,"TF":3e-10,"TR":1e-8,"CJE":2e-12,"CJC":1e-12}}}}],
            "analyses":[{{"type":"tran","tstep":1e-8,"tstop":1e-5}}],
            "options":{{"temp":27,{OPTIONS},"method":"{method}"}}}}"#
        );
        let r = run_tran(&text)?;
        assert_eq!(r.time.last().copied(), Some(1e-5), "{method}");
        // Saturated while the input is high, cut off after the falling edge.
        let at = |t: f64| -> Result<f64, Box<dyn Error>> {
            let k = r.time.iter().position(|&x| x >= t).ok_or("no point")?;
            Ok(series(&r, "c")?[k])
        };
        assert!(at(4e-6)? < 0.3, "{method}: collector {}", at(4e-6)?);
        assert!(at(9e-6)? > 4.9, "{method}: collector {}", at(9e-6)?);
    }
    Ok(())
}

/// A 10 V source behind 1 kohm into a switch (RON 1, ROFF 1e9) whose control
/// node follows `wave`. `V(out)` is near 10 V while the switch is off and
/// near 10 mV while it is on.
fn switch_netlist(wave: &str, analysis: &str) -> String {
    format!(
        r#"{{"irVersion":1,"elements":[
        {{"kind":"V","name":"VC","nodes":["c","0"],"dc":0,"tran":{wave}}},
        {{"kind":"V","name":"V1","nodes":["in","0"],"dc":10}},
        {{"kind":"R","name":"R1","nodes":["in","out"],"value":1000}},
        {{"kind":"S","name":"S1","nodes":["out","0"],"controlNodes":["c","0"],"model":"SM"}}],
        "models":[{{"name":"SM","type":"SW","params":{{"VT":2.5,"VH":0.5,"RON":1,"ROFF":1e9}}}}],
        "analyses":[{analysis}],
        "options":{{"reltol":1e-3,"vntol":1e-9,"abstol":1e-15,"chgtol":1e-18}}}}"#
    )
}

/// The times at which the switch output changes state, as (time, now_on).
fn switch_changes(r: &TranResult) -> Result<Vec<(f64, bool)>, Box<dyn Error>> {
    let out = series(r, "out")?;
    let mut changes = Vec::new();
    let mut on = out[0] < 5.0;
    for (t, v) in r.time.iter().zip(out).skip(1) {
        if (*v < 5.0) != on {
            on = *v < 5.0;
            changes.push((*t, on));
        }
    }
    Ok(changes)
}

#[test]
fn switch_turns_on_within_reltol() -> TestResult {
    let wave = r#"{"type":"pwl","points":[[0,0],[1e-3,5],[1,5]]}"#;
    let r = run_tran(&switch_netlist(
        wave,
        r#"{"type":"tran","tstep":1e-5,"tstop":1e-3}"#,
    ))?;
    let changes = switch_changes(&r)?;
    assert_eq!(changes.len(), 1, "{changes:?}");
    let (t_on, on) = changes[0];
    // Crossing of VT + VH = 3 V on a 5 V/ms ramp; reltol 1e-3 of a step of at
    // most tstep = 1e-5.
    let crossing = 0.6e-3;
    assert!(on);
    assert!(
        t_on >= crossing && t_on - crossing <= 1e-3 * 1e-5,
        "first on point at {t_on:e}, crossing at {crossing:e}"
    );
    Ok(())
}

#[test]
fn switch_hysteresis_band() -> TestResult {
    let wave = r#"{"type":"pwl","points":[[0,0],[1e-3,5],[2e-3,0],[1,0]]}"#;
    let r = run_tran(&switch_netlist(
        wave,
        r#"{"type":"tran","tstep":1e-5,"tstop":2e-3}"#,
    ))?;
    let changes = switch_changes(&r)?;
    assert_eq!(changes.len(), 2, "{changes:?}");
    // On at 3 V (0.6 ms on the way up), off at 2 V (1.6 ms on the way down).
    let tol = 1e-3 * 1e-5;
    let (t_on, on) = changes[0];
    assert!(on && t_on >= 0.6e-3 && t_on - 0.6e-3 <= tol, "{t_on:e}");
    let (t_off, on) = changes[1];
    assert!(!on && t_off >= 1.6e-3 && t_off - 1.6e-3 <= tol, "{t_off:e}");
    Ok(())
}

#[test]
fn fast_edge_through_band() -> TestResult {
    let wave = r#"{"type":"pwl","points":[[0,0],[1e-4,0],[1.00001e-4,5],[1,5]]}"#;
    let r = run_tran(&switch_netlist(
        wave,
        r#"{"type":"tran","tstep":1e-5,"tstop":2e-4}"#,
    ))?;
    let changes = switch_changes(&r)?;
    assert_eq!(changes.len(), 1, "{changes:?}");
    let (t_on, on) = changes[0];
    // 3 V is reached 0.6 of the way up a 1 ns edge.
    let crossing = 1e-4 + 0.6e-9;
    assert!(on);
    assert!(
        t_on >= crossing && t_on - crossing <= 1e-3 * 1e-9,
        "first on point at {t_on:e}, crossing at {crossing:e}"
    );
    Ok(())
}
