//! Newton-Raphson driver (docs/reference/numerical-methods.md section 1).
//!
//! Companion form as in SPICE: every iteration loads all devices at the
//! previous iterate and solves `A x = b` for the next. The convergence test
//! follows ngspice `niconv.c` plus each device's own test (`dioconv.c`, ...).

use crate::circuit::Circuit;
use crate::devices::{LoadContext, LoadMode};
use crate::error::Error;
use crate::linalg::{DenseLu, LinearSolver, SolveError};
use crate::mna::RealSystem;

/// Settings for one Newton run.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct NewtonConfig {
    /// Conductance added to every node and internal-node diagonal.
    pub diag_gmin: f64,
    /// Factor applied to independent sources.
    pub source_factor: f64,
    /// Load the first iteration in `InitJunction` mode. With a nodeset in the
    /// circuit this also starts the nodeset hold (see `newton_counted`).
    pub init_junction: bool,
    pub max_iter: usize,
}

/// Conductance of the nodeset hold, cktload.c.
const NODESET_CONDUCTANCE: f64 = 1.0e10;

/// `itl1`: Newton iteration limit for DC.
pub(crate) const ITL1: usize = 100;

impl Default for NewtonConfig {
    fn default() -> Self {
        Self {
            diag_gmin: 0.0,
            source_factor: 1.0,
            init_junction: true,
            max_iter: ITL1,
        }
    }
}

/// A run that did not converge, or hit a fatal error.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct NewtonFailure {
    /// The last iterate.
    pub last_x: Vec<f64>,
    /// `x_new - x_old` of the last iteration.
    pub last_update: Vec<f64>,
    /// Set for a singular matrix or an engine bug. Callers propagate it
    /// instead of trying a fallback.
    pub error: Option<Error>,
}

fn fatal(x: &[f64], error: Error) -> NewtonFailure {
    NewtonFailure {
        last_x: x.to_vec(),
        last_update: vec![0.0; x.len()],
        error: Some(error),
    }
}

/// Runs Newton from `x0`. `state` is the device state vector
/// (`circuit.state_len()` long); it is updated in place.
#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn newton(
    circuit: &Circuit,
    x0: &[f64],
    state: &mut [f64],
    cfg: &NewtonConfig,
) -> Result<Vec<f64>, NewtonFailure> {
    newton_counted(circuit, x0, state, cfg).0
}

/// Like `newton`, also returning the number of iterations performed.
pub(crate) fn newton_counted(
    circuit: &Circuit,
    x0: &[f64],
    state: &mut [f64],
    cfg: &NewtonConfig,
) -> (Result<Vec<f64>, NewtonFailure>, usize) {
    let n = circuit.unknown_count();
    let voltages = circuit.voltage_count();
    let opts = circuit.options;
    let mut x = x0.to_vec();
    if x.len() != n || state.len() != circuit.state_len() {
        let e = Error::Internal("newton: vector length mismatch".into());
        return (Err(fatal(&x, e)), 0);
    }
    let mut solver = DenseLu::new();
    let mut last_update = vec![0.0; n];
    // Nodeset hold, ported from cktload.c (nodesets are enforced during
    // MODEINITJCT and MODEINITFIX) and niiter.c (MODEINITFIX lasts until an
    // iteration converges, then MODEINITFLOAT starts with `ipass` set, which
    // forces one more non-converged iteration). `holding` covers ngspice's
    // INITJCT and INITFIX phases; `released` is the `ipass` flag.
    let mut holding = cfg.init_junction && !circuit.nodeset.is_empty();
    let mut released = false;
    for iter in 1..=cfg.max_iter {
        let mode = if iter == 1 && cfg.init_junction {
            LoadMode::InitJunction
        } else {
            LoadMode::Float
        };
        let ctx = LoadContext {
            mode,
            gmin: opts.gmin,
            source_factor: cfg.source_factor,
            reltol: opts.reltol,
            abstol: opts.abstol,
        };
        let mut sys = RealSystem::new(n);
        let mut limited = false;
        for (device, &offset) in circuit.devices.iter().zip(&circuit.state_offsets) {
            let slice = &mut state[offset..offset + device.state_len()];
            limited |= device.load(&x, slice, &ctx, &mut sys);
        }
        if holding {
            // cktload.c, "original CIDER fix" form: 1e10 S from the node to
            // ground and 1e10 * value * srcFact on the right-hand side.
            for &(i, value) in &circuit.nodeset {
                sys.add_a(Some(i), Some(i), NODESET_CONDUCTANCE);
                sys.add_b(Some(i), NODESET_CONDUCTANCE * value * cfg.source_factor);
            }
        }
        if cfg.diag_gmin != 0.0 {
            for i in 0..voltages {
                sys.add_a(Some(i), Some(i), cfg.diag_gmin);
            }
        }
        if let Some((row, col)) = sys.out_of_range {
            let e = Error::Internal(format!("stamp out of range at row {row}, column {col}"));
            return (Err(fatal(&x, e)), iter);
        }
        let map_err = |e: SolveError| match e {
            SolveError::SingularPivot { index } => Error::Singular {
                unknown: circuit.unknown_label(index),
            },
            other => Error::Internal(other.to_string()),
        };
        let mut x_new = std::mem::take(&mut sys.b);
        if let Err(e) = solver
            .factor(&sys.a)
            .and_then(|()| solver.solve(&mut x_new))
        {
            return (Err(fatal(&x, map_err(e))), iter);
        }
        for ((u, new), old) in last_update.iter_mut().zip(&x_new).zip(&x) {
            *u = new - old;
        }
        let settled = x_new.iter().zip(&x).enumerate().all(|(j, (new, old))| {
            let tol = if j < voltages {
                opts.vntol
            } else {
                opts.abstol
            };
            (new - old).abs() <= opts.reltol * new.abs().max(old.abs()) + tol
        });
        let converged = iter >= 2
            && !limited
            && settled
            && circuit
                .devices
                .iter()
                .zip(&circuit.state_offsets)
                .all(|(device, &offset)| {
                    let slice = &state[offset..offset + device.state_len()];
                    device.converged(&x_new, slice, &ctx)
                });
        x = x_new;
        if holding {
            // niiter.c MODEINITJCT / MODEINITFIX: never accept while held.
            // The first iteration that converges ends the hold.
            if converged {
                holding = false;
                released = true;
            }
        } else if released {
            // niiter.c: `if (ipass) CKTnoncon = ipass`, the first iteration
            // after the hold is not accepted.
            released = false;
        } else if converged {
            return (Ok(x), iter);
        }
    }
    (
        Err(NewtonFailure {
            last_x: x,
            last_update,
            error: None,
        }),
        cfg.max_iter,
    )
}

/// Which DC stages `solve_dc` may run.
#[cfg_attr(not(test), allow(dead_code))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Strategy {
    /// Plain Newton, then gmin stepping, then source stepping.
    All,
    /// gmin stepping only (tests).
    GminOnly,
    /// Source stepping only (tests).
    SourceOnly,
}

/// What the fallback stages tried, for tests.
#[derive(Debug, Clone, Default, PartialEq)]
pub(crate) struct Trace {
    /// `diag_gmin` of every gmin-stepping Newton run, in order.
    pub gmin: Vec<f64>,
    /// `source_factor` of every source-stepping Newton run, in order.
    pub alpha: Vec<f64>,
}

/// Upper bound on source-stepping increments, so a pathological circuit
/// cannot crawl forever at the smallest step.
const MAX_SOURCE_STEPS: usize = 10_000;

/// Outcome of one stage: the solution, or the failure that ended it.
type Stage = Result<Vec<f64>, Box<StageFailure>>;

/// The last failed Newton run and the settings it ran with.
struct StageFailure {
    failure: NewtonFailure,
    diag_gmin: f64,
    source_factor: f64,
}

/// One Newton run for a stepping stage. On failure, `state` is restored to
/// what it was before the run (ngspice keeps `OldCKTstate0` for this).
fn attempt(
    circuit: &Circuit,
    x: &[f64],
    state: &mut [f64],
    cfg: &NewtonConfig,
    iters: &mut usize,
) -> Result<Vec<f64>, Box<StageFailure>> {
    let saved = state.to_vec();
    let (outcome, n) = newton_counted(circuit, x, state, cfg);
    *iters += n;
    outcome.map_err(|failure| {
        state.copy_from_slice(&saved);
        Box::new(StageFailure {
            failure,
            diag_gmin: cfg.diag_gmin,
            source_factor: cfg.source_factor,
        })
    })
}

/// gmin stepping, adapted from ngspice `cktop.c` `dynamic_gmin`: solve with a
/// large conductance from every node to ground, then shrink it toward
/// `options.gmin`, reusing each solution as the next start. Starts at 1e-2 S
/// (numerical-methods.md section 1.4); ngspice starts at 1e-2 / factor.
fn gmin_stepping(
    circuit: &Circuit,
    x0: &[f64],
    state: &mut [f64],
    trace: &mut Trace,
    iters: &mut usize,
) -> Stage {
    let target = circuit.options.gmin;
    let mut x = x0.to_vec();
    let mut have_good = false;
    let mut factor: f64 = 10.0;
    let mut g: f64 = 1e-2;
    let mut last_good_g = g * factor;
    loop {
        trace.gmin.push(g);
        let cfg = NewtonConfig {
            diag_gmin: g,
            source_factor: 1.0,
            init_junction: !have_good,
            max_iter: ITL1,
        };
        let before = *iters;
        match attempt(circuit, &x, state, &cfg, iters) {
            Ok(new_x) => {
                x = new_x;
                have_good = true;
                last_good_g = g;
                if g <= target {
                    break;
                }
                if *iters - before <= ITL1 / 4 {
                    factor = (factor * factor.sqrt()).min(10.0);
                }
                g = (g / factor).max(target);
            }
            Err(f) => {
                if f.failure.error.is_some() {
                    return Err(f);
                }
                factor = factor.sqrt().sqrt();
                if factor < 1.00005 {
                    return Err(f);
                }
                g = last_good_g / factor;
            }
        }
    }
    trace.gmin.push(0.0);
    let cfg = NewtonConfig {
        init_junction: false,
        ..NewtonConfig::default()
    };
    attempt(circuit, &x, state, &cfg, iters)
}

/// Source stepping, adapted from ngspice `cktop.c` `gillespie_src`: solve with
/// all independent sources at `alpha = 0`, then ramp `alpha` to 1.
fn source_stepping(
    circuit: &Circuit,
    state: &mut [f64],
    trace: &mut Trace,
    iters: &mut usize,
) -> Stage {
    let mut alpha = 0.0;
    trace.alpha.push(alpha);
    let cfg = NewtonConfig {
        source_factor: 0.0,
        init_junction: true,
        ..NewtonConfig::default()
    };
    let zeros = vec![0.0; circuit.unknown_count()];
    let mut x = attempt(circuit, &zeros, state, &cfg, iters)?;
    let mut raise = 0.001;
    for _ in 0..MAX_SOURCE_STEPS {
        let next = (alpha + raise).min(1.0);
        trace.alpha.push(next);
        let cfg = NewtonConfig {
            source_factor: next,
            init_junction: false,
            ..NewtonConfig::default()
        };
        let before = *iters;
        match attempt(circuit, &x, state, &cfg, iters) {
            Ok(new_x) => {
                x = new_x;
                alpha = next;
                if alpha >= 1.0 {
                    return Ok(x);
                }
                if *iters - before <= ITL1 / 4 {
                    raise *= 1.5;
                }
            }
            Err(f) => {
                if f.failure.error.is_some() {
                    return Err(f);
                }
                raise /= 10.0;
                if raise < 1e-7 {
                    return Err(f);
                }
            }
        }
    }
    Err(Box::new(StageFailure {
        failure: NewtonFailure {
            last_x: x,
            last_update: vec![0.0; circuit.unknown_count()],
            error: None,
        },
        diag_gmin: 0.0,
        source_factor: alpha,
    }))
}

/// Indices of the (up to) five largest `|v|`, largest first. NaN sorts last.
fn top_five(values: impl Iterator<Item = (usize, f64)>) -> Vec<(usize, f64)> {
    let mut all: Vec<(usize, f64)> = values.collect();
    all.sort_by(|a, b| {
        let (ka, kb) = (a.1.abs(), b.1.abs());
        kb.partial_cmp(&ka)
            .unwrap_or_else(|| ka.is_nan().cmp(&kb.is_nan()))
    });
    all.truncate(5);
    all
}

/// Builds `Error::NoConvergence` from the last failed run. The residual is
/// `A(x) x - b(x)` with every device loaded in `Exact` mode at the last
/// iterate, with the failing run's `diag_gmin` and `source_factor`.
fn no_convergence(circuit: &Circuit, state: &[f64], f: &StageFailure) -> Error {
    let n = circuit.unknown_count();
    let voltages = circuit.voltage_count();
    let opts = circuit.options;
    let x = &f.failure.last_x;
    let ctx = LoadContext {
        mode: LoadMode::Exact,
        gmin: opts.gmin,
        source_factor: f.source_factor,
        reltol: opts.reltol,
        abstol: opts.abstol,
    };
    let mut sys = RealSystem::new(n);
    let mut scratch = state.to_vec();
    for (device, &offset) in circuit.devices.iter().zip(&circuit.state_offsets) {
        let slice = &mut scratch[offset..offset + device.state_len()];
        device.load(x, slice, &ctx, &mut sys);
    }
    for i in 0..voltages {
        sys.add_a(Some(i), Some(i), f.diag_gmin);
    }
    let residual = |i: usize| -> f64 {
        let ax: f64 = (0..n).map(|j| sys.a.get(i, j) * x[j]).sum();
        ax - sys.b[i]
    };
    let updates = top_five(f.failure.last_update.iter().copied().enumerate())
        .into_iter()
        .map(|(i, v)| (circuit.unknown_label(i), v))
        .collect();
    let residuals = top_five((0..voltages.min(n)).map(|i| (i, residual(i))))
        .into_iter()
        .map(|(i, v)| (node_name(circuit, i), v))
        .collect();
    Error::NoConvergence { updates, residuals }
}

fn node_name(circuit: &Circuit, i: usize) -> String {
    let nodes = circuit.node_names.len();
    if i < nodes {
        circuit.node_names[i].clone()
    } else {
        circuit.internal_names[i - nodes].clone()
    }
}

/// DC solve with fallbacks: plain Newton, gmin stepping, source stepping
/// (numerical-methods.md section 1.4). `state` carries over between stages.
#[cfg(test)]
pub(crate) fn solve_dc(
    circuit: &Circuit,
    x0: &[f64],
    state: &mut [f64],
    strategy: Strategy,
) -> Result<Vec<f64>, Error> {
    solve_dc_traced(circuit, x0, state, strategy, &mut Trace::default())
}

/// `solve_dc`, recording the fallback steps in `trace`.
#[cfg(test)]
pub(crate) fn solve_dc_traced(
    circuit: &Circuit,
    x0: &[f64],
    state: &mut [f64],
    strategy: Strategy,
    trace: &mut Trace,
) -> Result<Vec<f64>, Error> {
    solve_dc_counted(circuit, x0, state, strategy, trace).0
}

/// Like `solve_dc_traced`, also returning the total Newton iterations.
pub(crate) fn solve_dc_counted(
    circuit: &Circuit,
    x0: &[f64],
    state: &mut [f64],
    strategy: Strategy,
    trace: &mut Trace,
) -> (Result<Vec<f64>, Error>, usize) {
    let mut iters = 0;
    let mut last: Option<Box<StageFailure>> = None;
    if strategy == Strategy::All {
        let cfg = NewtonConfig::default();
        match attempt(circuit, x0, state, &cfg, &mut iters) {
            Ok(x) => return (Ok(x), iters),
            Err(f) => match f.failure.error {
                Some(e) => return (Err(e), iters),
                None => last = Some(f),
            },
        }
    }
    if matches!(strategy, Strategy::All | Strategy::GminOnly) {
        match gmin_stepping(circuit, x0, state, trace, &mut iters) {
            Ok(x) => return (Ok(x), iters),
            Err(f) => match f.failure.error {
                Some(e) => return (Err(e), iters),
                None => last = Some(f),
            },
        }
    }
    if matches!(strategy, Strategy::All | Strategy::SourceOnly) {
        match source_stepping(circuit, state, trace, &mut iters) {
            Ok(x) => return (Ok(x), iters),
            Err(f) => match f.failure.error {
                Some(e) => return (Err(e), iters),
                None => last = Some(f),
            },
        }
    }
    let err = match last {
        Some(f) => no_convergence(circuit, state, &f),
        None => Error::Internal("solve_dc ran no stage".into()),
    };
    (Err(err), iters)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ir::parse_netlist;

    type TestResult = Result<(), Box<dyn std::error::Error>>;

    const DIODE: &str = r#"{"irVersion":1,"elements":[
        {"kind":"I","name":"I1","nodes":["0","a"],"dc":1e-3},
        {"kind":"D","name":"D1","nodes":["a","0"],"model":"DM"}],
        "models":[{"name":"DM","type":"D"}],
        "analyses":[{"type":"op"}]}"#;

    #[test]
    fn iteration_limit_reports_failure_without_error() -> TestResult {
        let circuit = Circuit::build(&parse_netlist(DIODE)?)?;
        let mut state = vec![0.0; circuit.state_len()];
        let cfg = NewtonConfig {
            max_iter: 2,
            ..NewtonConfig::default()
        };
        let x0 = vec![0.0; circuit.unknown_count()];
        match newton(&circuit, &x0, &mut state, &cfg) {
            Err(f) => {
                assert_eq!(f.error, None);
                assert_eq!(f.last_x.len(), 1);
                assert!(f.last_update[0] != 0.0);
                Ok(())
            }
            Ok(x) => Err(format!("converged unexpectedly: {x:?}").into()),
        }
    }

    #[test]
    fn diode_converges_with_default_config() -> TestResult {
        let circuit = Circuit::build(&parse_netlist(DIODE)?)?;
        let mut state = vec![0.0; circuit.state_len()];
        let x0 = vec![0.0; circuit.unknown_count()];
        let x = newton(&circuit, &x0, &mut state, &NewtonConfig::default())
            .map_err(|f| format!("{f:?}"))?;
        assert!(x[0] > 0.6 && x[0] < 0.8, "V(a) = {}", x[0]);
        Ok(())
    }

    #[test]
    fn diag_gmin_is_added_to_node_diagonals() -> TestResult {
        // 1 mA into a node with only diag_gmin and the diode: a huge diag_gmin
        // dominates, so the node sits near 1 mA / diag_gmin.
        let circuit = Circuit::build(&parse_netlist(DIODE)?)?;
        let mut state = vec![0.0; circuit.state_len()];
        let x0 = vec![0.0; circuit.unknown_count()];
        let cfg = NewtonConfig {
            diag_gmin: 1.0,
            ..NewtonConfig::default()
        };
        let x = newton(&circuit, &x0, &mut state, &cfg).map_err(|f| format!("{f:?}"))?;
        assert!(x[0] < 1e-3 && x[0] > 4e-4, "V(a) = {}", x[0]);
        Ok(())
    }

    /// 100 V through 1 ohm into 10 default diodes in series.
    fn n5_like() -> Result<Circuit, Box<dyn std::error::Error>> {
        let mut elements = vec![
            r#"{"kind":"V","name":"V1","nodes":["in","0"],"dc":100}"#.to_string(),
            r#"{"kind":"R","name":"R1","nodes":["in","n0"],"value":1}"#.to_string(),
        ];
        for k in 0..10 {
            let to = if k == 9 {
                "0".to_string()
            } else {
                format!("n{}", k + 1)
            };
            elements.push(format!(
                r#"{{"kind":"D","name":"D{k}","nodes":["n{k}","{to}"],"model":"DM"}}"#
            ));
        }
        let text = format!(
            r#"{{"irVersion":1,"elements":[{}],"models":[{{"name":"DM","type":"D"}}],"analyses":[{{"type":"op"}}]}}"#,
            elements.join(",")
        );
        Ok(Circuit::build(&parse_netlist(&text)?)?)
    }

    fn run(circuit: &Circuit, strategy: Strategy) -> Result<Vec<f64>, Error> {
        let mut state = vec![0.0; circuit.state_len()];
        let x0 = vec![0.0; circuit.unknown_count()];
        solve_dc(circuit, &x0, &mut state, strategy)
    }

    #[test]
    fn n5_like_converges_each_way() -> TestResult {
        let circuit = n5_like()?;
        let all = run(&circuit, Strategy::All)?;
        for strategy in [Strategy::GminOnly, Strategy::SourceOnly] {
            let x = run(&circuit, strategy)?;
            for (j, (a, b)) in x.iter().zip(&all).enumerate() {
                let abs = if j < circuit.voltage_count() {
                    1e-8
                } else {
                    1e-13
                };
                assert!(
                    (a - b).abs() <= 1e-5 * b.abs() + abs,
                    "{strategy:?} unknown {j}: {a} vs {b}"
                );
            }
        }
        Ok(())
    }

    #[test]
    fn gmin_stepping_reaches_target() -> TestResult {
        let circuit = n5_like()?;
        let mut state = vec![0.0; circuit.state_len()];
        let x0 = vec![0.0; circuit.unknown_count()];
        let mut trace = Trace::default();
        solve_dc_traced(&circuit, &x0, &mut state, Strategy::GminOnly, &mut trace)?;
        let g = &trace.gmin;
        assert!(g.len() >= 3, "{g:?}");
        assert_eq!(g[0], 1e-2);
        assert_eq!(g[g.len() - 2], circuit.options.gmin);
        assert_eq!(g[g.len() - 1], 0.0);
        Ok(())
    }

    #[test]
    fn no_convergence_names_unknowns() -> TestResult {
        let mut circuit = Circuit::build(&parse_netlist(DIODE)?)?;
        circuit.state_offsets.push(circuit.state_len());
        circuit
            .devices
            .push(Box::new(crate::devices::NeverConverges { node: Some(0) }));
        match run(&circuit, Strategy::All) {
            Err(e @ Error::NoConvergence { .. }) => {
                let Error::NoConvergence { updates, residuals } = &e else {
                    return Err("unreachable".into());
                };
                assert!(!updates.is_empty() && updates.len() <= 5);
                assert!(!residuals.is_empty() && residuals.len() <= 5);
                assert!(
                    updates
                        .iter()
                        .all(|(n, _)| n.starts_with("V(") || n.starts_with("I("))
                );
                assert!(residuals.iter().all(|(n, _)| n == "a"));
                assert!(updates.windows(2).all(|w| w[0].1.abs() >= w[1].1.abs()));
                let text = e.to_string();
                assert!(text.starts_with(
                    "DC operating point did not converge after gmin and source stepping; largest updates: V(a)="
                ), "{text}");
                assert!(text.contains("; largest KCL residuals: a="), "{text}");
                Ok(())
            }
            other => Err(format!("expected NoConvergence, got {other:?}").into()),
        }
    }

    #[test]
    fn fatal_error_is_not_a_fallback_trigger() -> TestResult {
        let text = r#"{"irVersion":1,"elements":[
            {"kind":"R","name":"R1","nodes":["a","0"],"value":1000},
            {"kind":"E","name":"E1","nodes":["a","0"],"controlNodes":["a","0"],"gain":1}],
            "analyses":[{"type":"op"}]}"#;
        let circuit = Circuit::build(&parse_netlist(text)?)?;
        assert!(matches!(
            run(&circuit, Strategy::All),
            Err(Error::Singular { .. })
        ));
        Ok(())
    }
}
