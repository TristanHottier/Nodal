//! DC operating point.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::circuit::Circuit;
use crate::error::Error;
use crate::linalg::{DenseLu, LinearSolver, SolveError};
use crate::mna::RealSystem;

/// Node voltages and branch currents at the operating point, keyed by bare
/// name. Branch currents exist for V, E, H and L only. Ground is not reported.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpResult {
    pub node_voltages: BTreeMap<String, f64>,
    pub branch_currents: BTreeMap<String, f64>,
}

fn singular(circuit: &Circuit, index: usize) -> Error {
    Error::Singular {
        unknown: circuit.unknown_label(index),
    }
}

/// Assembles and solves the DC system for `circuit`.
pub fn solve_op(circuit: &Circuit) -> Result<OpResult, Error> {
    let n = circuit.unknown_count();
    let x0 = vec![0.0; n];
    let mut sys = RealSystem::new(n);
    for device in &circuit.devices {
        device.load(&x0, &mut sys);
    }
    let mut solver = DenseLu::new();
    let map_err = |e: SolveError| match e {
        SolveError::SingularPivot { index } => singular(circuit, index),
        other => Error::Invalid(other.to_string()),
    };
    solver.factor(&sys.a).map_err(map_err)?;
    let mut x = sys.b;
    solver.solve(&mut x).map_err(map_err)?;

    let nodes = circuit.node_names.len();
    let node_voltages = circuit
        .node_names
        .iter()
        .zip(&x)
        .map(|(name, v)| (name.clone(), *v))
        .collect();
    let branch_currents = circuit
        .branch_names
        .iter()
        .zip(x.iter().skip(nodes))
        .map(|(name, i)| (name.clone(), *i))
        .collect();
    Ok(OpResult {
        node_voltages,
        branch_currents,
    })
}
