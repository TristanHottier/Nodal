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
    /// Load the first iteration in `InitJunction` mode.
    pub init_junction: bool,
    pub max_iter: usize,
}

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

/// Runs Newton from `x0`. The gmin and source stepping fallbacks call this. `state` is the device state vector
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
        if converged {
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
}
