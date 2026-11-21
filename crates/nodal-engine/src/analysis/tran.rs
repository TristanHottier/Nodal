//! Transient analysis (numerical-methods.md sections 1.3, 2 and 3).
//!
//! The step control is a port of ngspice `spicelib/analysis/dctran.c`: the
//! first and post-breakpoint step sizes, breakpoint landing and equalising,
//! the divide-by-eight retry after a Newton failure, the accept or reject
//! decision from the truncation error (`CKTtrunc`, here
//! [`truncation`](super::integrate::truncation)), and the order raise from 1
//! to 2. ngspice keeps its breakpoints in a table; here every independent
//! source is asked for its next corner and `tstop` always ends the list.
//!
//! One departure from ngspice: with `uic` the initial point is a consistent
//! solution at t = 0 (a backward Euler step of length `hmin` from the initial
//! conditions), so the first reported point shows the initial voltages and
//! currents. ngspice does not report t = 0 in that case.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::integrate::{Coeffs, TruncOpts, truncation};
use super::newton::{History, NewtonConfig, newton_counted};
use super::op::{report, solve_op_with_state};
use crate::circuit::Circuit;
use crate::error::Error;
use crate::ir::Method;

/// `itl4`: Newton iteration limit per transient time point.
const ITL4: usize = 10;
/// Default `trtol`, as in ngspice.
pub const DEFAULT_TRTOL: f64 = 7.0;
/// Default `chgtol`, as in ngspice.
pub const DEFAULT_CHGTOL: f64 = 1e-14;
/// Highest integration order (`CKTmaxOrder`).
const MAX_ORDER: usize = 2;

/// Everything a transient run needs besides the circuit.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TranSpec {
    pub tstep: f64,
    pub tstop: f64,
    pub tstart: f64,
    pub tmax: Option<f64>,
    pub uic: bool,
    pub method: Method,
    pub trtol: f64,
    pub chgtol: f64,
}

/// The accepted time points and the signals at each of them. Node voltages
/// and branch currents are keyed like [`DcResult`](super::DcResult).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranResult {
    pub time: Vec<f64>,
    pub node_voltages: BTreeMap<String, Vec<f64>>,
    pub branch_currents: BTreeMap<String, Vec<f64>>,
}

impl TranResult {
    fn push(&mut self, circuit: &Circuit, t: f64, x: &[f64]) {
        let point = report(circuit, x);
        self.time.push(t);
        for (name, v) in point.node_voltages {
            self.node_voltages.entry(name).or_default().push(v);
        }
        for (name, i) in point.branch_currents {
            self.branch_currents.entry(name).or_default().push(i);
        }
    }
}

/// What made the last attempt fail, for the error message.
#[derive(Debug, Clone, Default)]
struct Blame(String);

/// The first breakpoint strictly after `t`: a source corner, an extra
/// breakpoint, or `tstop`.
fn next_break(circuit: &Circuit, extra: &[f64], tstop: f64, t: f64) -> f64 {
    let mut best = if tstop > t { tstop } else { f64::INFINITY };
    for c in circuit.devices.iter().filter_map(|d| d.next_breakpoint(t)) {
        best = best.min(c);
    }
    for &c in extra {
        if c > t {
            best = best.min(c);
        }
    }
    best
}

/// The first breakpoint more than `hmin` after `t` (ngspice treats closer
/// ones as already reached).
fn break_beyond(circuit: &Circuit, extra: &[f64], tstop: f64, t: f64, hmin: f64) -> f64 {
    let mut c = t;
    loop {
        let n = next_break(circuit, extra, tstop, c);
        if n - t > hmin || !n.is_finite() {
            return n;
        }
        c = n;
    }
}

/// Initialises the charges of every device in its own slice of `state`. A
/// slice of the wrong size is an engine bug.
fn init_history(circuit: &Circuit, x: &[f64], state: &mut [f64], uic: bool) -> Result<(), Error> {
    if state.len() != circuit.state_len() {
        return Err(Error::Internal("tran: state length mismatch".into()));
    }
    for (device, &offset) in circuit.devices.iter().zip(&circuit.state_offsets) {
        let slice = state
            .get_mut(offset..offset + device.state_len())
            .ok_or_else(|| {
                Error::Internal(format!("tran: {} state slice out of range", device.name()))
            })?;
        device.init_charges(x, slice, uic);
    }
    Ok(())
}

fn slice_of<'a>(
    level: &'a [f64],
    range: std::ops::Range<usize>,
    who: &str,
) -> Result<&'a [f64], Error> {
    level
        .get(range)
        .ok_or_else(|| Error::Internal(format!("tran: {who} state slice out of range")))
}

/// The largest step every charge slot allows, and the device that allows the
/// least. `levels[0]` is the new state; the others are the accepted levels.
fn truncate_all<'a>(
    circuit: &Circuit,
    coeffs: &Coeffs,
    state: &'a [f64],
    history: &'a History,
    h: [f64; 3],
    opts: &TruncOpts,
) -> Result<(f64, Option<String>), Error> {
    let mut best = f64::INFINITY;
    let mut who = None;
    for (device, &offset) in circuit.devices.iter().zip(&circuit.state_offsets) {
        let slots = device.charge_slots();
        if slots.is_empty() {
            continue;
        }
        let range = offset..offset + device.state_len();
        let cut = |level: &'a [f64]| slice_of(level, range.clone(), device.name());
        let levels = [
            cut(state)?,
            cut(&history.levels[0])?,
            cut(&history.levels[1])?,
            cut(&history.levels[2])?,
        ];
        for &q in slots {
            let proposal = truncation(coeffs, q, levels, h, opts)?;
            if proposal < best {
                best = proposal;
                who = Some(device.name().to_string());
            }
        }
    }
    Ok((best, who))
}

/// Runs a transient analysis. Source DC values are restored before returning.
pub fn solve_tran(circuit: &mut Circuit, spec: &TranSpec) -> Result<TranResult, Error> {
    let (x0, state0) = initial_point(circuit, spec)?;
    run(circuit, spec, x0, state0)
}

/// The starting point: the operating point (with sources at their t = 0
/// waveform values, as `vsrcload.c` loads them in `MODETRANOP`), or the
/// initial conditions with `uic`. Returns the unknowns and the state with the
/// charges initialised.
fn initial_point(circuit: &mut Circuit, spec: &TranSpec) -> Result<(Vec<f64>, Vec<f64>), Error> {
    let n = circuit.unknown_count();
    if spec.uic {
        let mut state = vec![0.0; circuit.state_len()];
        init_history(circuit, &vec![0.0; n], &mut state, true)?;
        return Ok((vec![0.0; n], state));
    }
    // Put every waveform source at its t = 0 value for the operating point.
    let mut saved = Vec::new();
    for device in circuit.devices.iter_mut() {
        if let (Some(dc), Some(v0)) = (device.dc_value(), device.tran_value(0.0))
            && device.set_dc(v0)
        {
            saved.push((device.name().to_string(), dc));
        }
    }
    let op = solve_op_with_state(circuit);
    for (name, dc) in saved {
        if let Some(device) = circuit.device_mut(&name) {
            device.set_dc(dc);
        }
    }
    let (x, mut state) = op?;
    init_history(circuit, &x, &mut state, false)?;
    Ok((x, state))
}

fn run(
    circuit: &Circuit,
    spec: &TranSpec,
    mut x: Vec<f64>,
    mut state: Vec<f64>,
) -> Result<TranResult, Error> {
    let TranSpec {
        tstep,
        tstop,
        tstart,
        uic,
        ..
    } = *spec;
    if !(tstep > 0.0 && tstop > tstart && tstart >= 0.0 && tstop.is_finite()) {
        return Err(Error::Invalid(
            "tran analysis: need tstep > 0 and 0 <= tstart < tstop".into(),
        ));
    }
    let tmax = spec
        .tmax
        .unwrap_or_else(|| tstep.min((tstop - tstart) / 50.0));
    if tmax.partial_cmp(&0.0) != Some(std::cmp::Ordering::Greater) {
        return Err(Error::Invalid(
            "tran analysis: tmax must be positive".into(),
        ));
    }
    // ngspice delmin, numerical-methods.md section 3.2.
    let hmin = 1e-11 * tmax;
    let opts = TruncOpts {
        reltol: circuit.options.reltol,
        abstol: circuit.options.abstol,
        chgtol: spec.chgtol,
        trtol: spec.trtol,
    };
    let mut result = TranResult {
        time: Vec::new(),
        node_voltages: BTreeMap::new(),
        branch_currents: BTreeMap::new(),
    };
    let mut history = History {
        levels: [state.clone(), state.clone(), state.clone()],
    };
    if uic {
        // Consistent point at t = 0: backward Euler over `hmin` from the
        // initial charges. Failure keeps the zero start, as ngspice does.
        let coeffs = Coeffs::new(spec.method, 1, [hmin, hmin])?;
        let cfg = NewtonConfig {
            init_junction: false,
            max_iter: ITL4,
            tran: Some((0.0, coeffs)),
            ..NewtonConfig::default()
        };
        let mut trial = state.clone();
        match newton_counted(circuit, &x, &mut trial, &cfg, Some(&history)).0 {
            Ok(x_new) => {
                x = x_new;
                init_history(circuit, &x, &mut trial, true)?;
                state = trial;
                history = History {
                    levels: [state.clone(), state.clone(), state.clone()],
                };
            }
            Err(f) => {
                if let Some(e) = f.error {
                    return Err(e);
                }
            }
        }
    }
    if tstart <= 0.0 {
        result.push(circuit, 0.0, &x);
    }

    // dctran.c: first step and bookkeeping.
    let extra: Vec<f64> = if uic { vec![tstep] } else { Vec::new() };
    let mut t = 0.0_f64;
    let mut delta = (tstop / 100.0).min(tstep) / 10.0;
    let mut save_delta = tstop / 50.0;
    let mut delta_old = [tmax; 3];
    let mut order = 1_usize;
    let mut first = true;
    let mut reached = true; // breaks[0] = 0 at the start
    let mut blame = Blame::default();

    loop {
        delta = delta.min(tmax);
        let next = next_break(circuit, &extra, tstop, t);
        let mut landing = None;
        if reached || next - t <= hmin {
            // First point after a breakpoint: order 1 and a short step.
            order = 1;
            let beyond = break_beyond(circuit, &extra, tstop, t, hmin);
            delta = delta.min(0.1 * save_delta.min(beyond - t));
            if first {
                delta /= 10.0;
            }
            delta = delta.max(hmin * 2.0);
        } else if t + delta >= next {
            // Force the breakpoint.
            save_delta = delta;
            delta = next - t;
            landing = Some(delta);
        } else if t + 1.9 * delta > next {
            // Equalise the last two steps before the breakpoint.
            save_delta = delta;
            delta = (next - t) / 2.0;
        }
        delta_old = [delta, delta_old[0], delta_old[1]];

        // dctran.c label 600: attempts at this point.
        let accepted = loop {
            let olddelta = delta;
            delta_old[0] = delta;
            let hit = landing == Some(delta);
            let time = if hit { next } else { t + delta };
            let coeffs = Coeffs::new(spec.method, order, [delta_old[0], delta_old[1]])?;
            let cfg = NewtonConfig {
                init_junction: false,
                max_iter: ITL4,
                tran: Some((time, coeffs)),
                ..NewtonConfig::default()
            };
            let mut trial = history.levels[0].clone();
            match newton_counted(circuit, &x, &mut trial, &cfg, Some(&history)).0 {
                Err(f) => {
                    if let Some(e) = f.error {
                        return Err(e);
                    }
                    blame = Blame(blame_unknown(circuit, &f.last_update));
                    delta /= 8.0;
                    order = 1;
                }
                Ok(x_new) if first => {
                    break (time, hit, x_new, trial);
                }
                Ok(x_new) => {
                    let h = [delta_old[0], delta_old[1], delta_old[2]];
                    let (cut, who) = truncate_all(circuit, &coeffs, &trial, &history, h, &opts)?;
                    let mut newdelta = (2.0 * delta).min(cut);
                    if newdelta > 0.9 * delta {
                        // Do not raise the order out of backward Euler
                        // unless order 2 also allows a larger step.
                        if order == 1 && MAX_ORDER > 1 {
                            let c2 = Coeffs::new(spec.method, 2, [delta_old[0], delta_old[1]])?;
                            let (cut2, _) = truncate_all(circuit, &c2, &trial, &history, h, &opts)?;
                            newdelta = (2.0 * delta).min(cut2);
                            order = if newdelta <= 1.05 * delta { 1 } else { 2 };
                        }
                        delta = newdelta;
                        break (time, hit, x_new, trial);
                    }
                    if let Some(w) = who {
                        blame = Blame(w);
                    }
                    delta = newdelta;
                }
            }
            // dctran.c: below delmin once is allowed, twice is an error.
            if delta <= hmin {
                if olddelta > hmin {
                    delta = hmin;
                } else {
                    return Err(Error::TimestepTooSmall {
                        time: t,
                        device: blame.0,
                    });
                }
            }
        };

        let (time, hit, x_new, state_new) = accepted;
        history.levels = [
            state_new,
            std::mem::take(&mut history.levels[0]),
            std::mem::take(&mut history.levels[1]),
        ];
        x = x_new;
        t = time;
        reached = hit;
        first = false;
        if t >= tstart {
            result.push(circuit, t, &x);
        }
        if t >= tstop {
            break;
        }
    }
    Ok(result)
}

/// The unknown with the largest Newton update, as the culprit of a failure.
fn blame_unknown(circuit: &Circuit, update: &[f64]) -> String {
    update
        .iter()
        .enumerate()
        .max_by(|a, b| a.1.abs().total_cmp(&b.1.abs()))
        .map_or_else(String::new, |(i, _)| circuit.unknown_label(i))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::devices::NeverConverges;
    use crate::ir::parse_netlist;

    type TestResult = Result<(), Box<dyn std::error::Error>>;

    fn spec(uic: bool) -> TranSpec {
        TranSpec {
            tstep: 1e-6,
            tstop: 1e-4,
            tstart: 0.0,
            tmax: None,
            uic,
            method: Method::Trap,
            trtol: DEFAULT_TRTOL,
            chgtol: DEFAULT_CHGTOL,
        }
    }

    fn rc_circuit() -> Result<Circuit, Box<dyn std::error::Error>> {
        let text = r#"{"irVersion":1,"elements":[
            {"kind":"V","name":"V1","nodes":["in","0"],"dc":1},
            {"kind":"R","name":"R1","nodes":["in","a"],"value":1000},
            {"kind":"C","name":"C1","nodes":["a","0"],"value":1e-6}],
            "analyses":[{"type":"tran","tstep":1e-6,"tstop":1e-4}]}"#;
        Ok(Circuit::build(&parse_netlist(text)?)?)
    }

    #[test]
    fn timestep_too_small_names_a_culprit() -> TestResult {
        let mut circuit = rc_circuit()?;
        let node = circuit.node("a");
        circuit.state_offsets.push(circuit.state_len());
        circuit.devices.push(Box::new(NeverConverges { node }));
        match solve_tran(&mut circuit, &spec(true)) {
            Err(Error::TimestepTooSmall { time, device }) => {
                assert_eq!(time, 0.0);
                assert!(!device.is_empty());
                Ok(())
            }
            other => Err(format!("expected TimestepTooSmall, got {other:?}").into()),
        }
    }

    #[test]
    fn source_dc_values_are_restored() -> TestResult {
        let mut circuit = rc_circuit()?;
        solve_tran(&mut circuit, &spec(false))?;
        let dc = circuit.device_mut("V1").and_then(|d| d.dc_value());
        assert_eq!(dc, Some(1.0));
        Ok(())
    }
}
