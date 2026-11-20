//! AC small-signal analysis (docs/reference/mna.md section 4).
//!
//! The circuit is linearised once about its DC operating point: every device
//! loads in `SmallSignal` mode into `G`, the reactive parts go into `C`, and
//! the independent sources give the excitation `b`. Each frequency then
//! solves `(G + j omega C) x = b`, as `ACan` in ngspice `acan.c` does.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::op::solve_op_with_state;
use crate::circuit::Circuit;
use crate::devices::{LoadContext, LoadMode};
use crate::error::Error;
use crate::linalg::{C64, DenseLu, LinearSolver, SolveError};
use crate::mna::{AcExcitation, RealSystem, assemble_ac};

/// One complex signal over the frequency grid, as parallel real and
/// imaginary parts.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ComplexSeries {
    pub re: Vec<f64>,
    pub im: Vec<f64>,
}

impl ComplexSeries {
    fn with_capacity(n: usize) -> Self {
        Self {
            re: Vec::with_capacity(n),
            im: Vec::with_capacity(n),
        }
    }

    fn push(&mut self, v: C64) {
        self.re.push(v.re);
        self.im.push(v.im);
    }
}

/// Complex node voltages and branch currents at every frequency, keyed by
/// bare name. Internal nodes are never reported.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcResult {
    pub frequencies: Vec<f64>,
    pub node_voltages: BTreeMap<String, ComplexSeries>,
    pub branch_currents: BTreeMap<String, ComplexSeries>,
}

/// Solves the small-signal response of `circuit` at each of `frequencies`
/// (hertz).
pub fn solve_ac(circuit: &Circuit, frequencies: &[f64]) -> Result<AcResult, Error> {
    let (x, state) = solve_op_with_state(circuit)?;
    let n = circuit.unknown_count();
    let opts = circuit.options;
    let ctx = LoadContext {
        mode: LoadMode::SmallSignal,
        gmin: opts.gmin,
        source_factor: 1.0,
        reltol: opts.reltol,
        abstol: opts.abstol,
    };
    // SmallSignal never writes state, but loading on a copy keeps the
    // operating-point state intact whatever a device does.
    let mut scratch = state.clone();
    let mut g = RealSystem::new(n);
    let mut c = RealSystem::new(n);
    let mut excitation = AcExcitation::new(n);
    for (device, &offset) in circuit.devices.iter().zip(&circuit.state_offsets) {
        let end = offset + device.state_len();
        device.load(&x, &mut scratch[offset..end], &ctx, &mut g);
        device.load_reactive(&x, &state[offset..end], &ctx, &mut c);
        device.load_ac_excitation(&mut excitation);
    }
    if let Some((row, col)) = g.out_of_range.or(c.out_of_range) {
        return Err(Error::Internal(format!(
            "stamp out of range at row {row}, column {col}"
        )));
    }
    if let Some(row) = excitation.out_of_range {
        return Err(Error::Internal(format!(
            "ac excitation out of range at row {row}"
        )));
    }
    let nodes = circuit.node_names.len();
    let voltages = circuit.voltage_count();
    let empty = |names: &[String]| -> BTreeMap<String, ComplexSeries> {
        names
            .iter()
            .map(|name| {
                (
                    name.clone(),
                    ComplexSeries::with_capacity(frequencies.len()),
                )
            })
            .collect()
    };
    let mut node_voltages = empty(&circuit.node_names);
    let mut branch_currents = empty(&circuit.branch_names);
    let mut solver = DenseLu::<C64>::new();
    for &frequency in frequencies {
        let at = |cause: Error| Error::AcPoint {
            frequency,
            cause: Box::new(cause),
        };
        let omega = 2.0 * std::f64::consts::PI * frequency;
        let a = assemble_ac(&g.a, &c.a, omega);
        let mut solution = excitation.b.clone();
        solver
            .factor(&a)
            .and_then(|()| solver.solve(&mut solution))
            .map_err(|e| {
                at(match e {
                    SolveError::SingularPivot { index } => Error::Singular {
                        unknown: circuit.unknown_label(index),
                    },
                    other => Error::Internal(other.to_string()),
                })
            })?;
        for (name, &v) in circuit.node_names.iter().zip(&solution[..nodes]) {
            if let Some(series) = node_voltages.get_mut(name) {
                series.push(v);
            }
        }
        for (name, &i) in circuit.branch_names.iter().zip(&solution[voltages..]) {
            if let Some(series) = branch_currents.get_mut(name) {
                series.push(i);
            }
        }
    }
    Ok(AcResult {
        frequencies: frequencies.to_vec(),
        node_voltages,
        branch_currents,
    })
}
