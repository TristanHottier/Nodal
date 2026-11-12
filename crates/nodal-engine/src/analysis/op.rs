//! DC operating point.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::newton::{Strategy, Trace, solve_dc_counted};
use crate::circuit::Circuit;
use crate::error::Error;

/// Node voltages and branch currents at the operating point, keyed by bare
/// name. Branch currents exist for V, E, H and L only. Ground is not reported.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpResult {
    pub node_voltages: BTreeMap<String, f64>,
    pub branch_currents: BTreeMap<String, f64>,
}

/// Solves the DC operating point of `circuit`: Newton from zero (or from
/// the nodeset), then gmin stepping, then source stepping.
pub fn solve_op(circuit: &Circuit) -> Result<OpResult, Error> {
    let (result, _) = solve_op_counted(circuit);
    result
}

/// `solve_op` plus the Newton iteration count of the run.
pub(crate) fn solve_op_counted(circuit: &Circuit) -> (Result<OpResult, Error>, usize) {
    let mut x0 = vec![0.0; circuit.unknown_count()];
    for &(i, v) in &circuit.nodeset {
        x0[i] = v;
    }
    let mut state = vec![0.0; circuit.state_len()];
    let (outcome, iterations) = solve_dc_counted(
        circuit,
        &x0,
        &mut state,
        Strategy::All,
        &mut Trace::default(),
    );
    let result = outcome.map(|x| report(circuit, &x));
    (result, iterations)
}

pub(super) fn report(circuit: &Circuit, x: &[f64]) -> OpResult {
    let node_voltages = circuit
        .node_names
        .iter()
        .zip(x)
        .map(|(name, v)| (name.clone(), *v))
        .collect();
    let branch_currents = circuit
        .branch_names
        .iter()
        .zip(x.iter().skip(circuit.voltage_count()))
        .map(|(name, i)| (name.clone(), *i))
        .collect();
    OpResult {
        node_voltages,
        branch_currents,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::devices::{Device, LoadContext};
    use crate::ir::parse_netlist;
    use crate::mna::RealSystem;

    type TestResult = Result<(), Box<dyn std::error::Error>>;

    const L1: &str = r#"{"irVersion":1,"elements":[
        {"kind":"V","name":"V1","nodes":["in","0"],"dc":10},
        {"kind":"R","name":"R1","nodes":["in","out"],"value":1000},
        {"kind":"R","name":"R2","nodes":["out","0"],"value":3000}],
        "analyses":[{"type":"op"}]}"#;

    #[test]
    fn linear_circuits_converge_in_two_iterations() -> TestResult {
        let circuit = Circuit::build(&parse_netlist(L1)?)?;
        let (result, iterations) = solve_op_counted(&circuit);
        let op = result?;
        assert_eq!(iterations, 2);
        assert!((op.node_voltages["out"] - 7.5).abs() < 1e-9);
        Ok(())
    }

    /// A device whose stamp lies outside the system.
    #[derive(Debug)]
    struct Stray;

    impl Device for Stray {
        fn name(&self) -> &str {
            "X1"
        }

        fn load(&self, _: &[f64], _: &mut [f64], _: &LoadContext, sys: &mut RealSystem) -> bool {
            sys.add_a(Some(99), Some(0), 1.0);
            false
        }
    }

    #[test]
    fn out_of_range_stamp_is_an_internal_error() -> TestResult {
        let mut circuit = Circuit::build(&parse_netlist(L1)?)?;
        circuit.state_offsets.push(circuit.state_len());
        circuit.devices.push(Box::new(Stray));
        match solve_op(&circuit) {
            Err(Error::Internal(msg)) => {
                assert!(msg.contains("stamp out of range"), "{msg}");
                Ok(())
            }
            other => Err(format!("expected Internal, got {other:?}").into()),
        }
    }

    #[test]
    fn diode_circuit_converges_and_hides_internal_node() -> TestResult {
        let text = r#"{"irVersion":1,"elements":[
            {"kind":"V","name":"V1","nodes":["in","0"],"dc":5},
            {"kind":"R","name":"R1","nodes":["in","a"],"value":1000},
            {"kind":"D","name":"D1","nodes":["a","0"],"model":"DM"}],
            "models":[{"name":"DM","type":"D","params":{"RS":10}}],
            "analyses":[{"type":"op"}]}"#;
        let circuit = Circuit::build(&parse_netlist(text)?)?;
        assert_eq!(circuit.internal_names, ["D1#internal"]);
        assert_eq!(circuit.unknown_label(2), "V(D1#internal)");
        assert_eq!(circuit.unknown_label(3), "I(V1)");
        let (result, iterations) = solve_op_counted(&circuit);
        let op = result?;
        assert!(iterations < 30, "{iterations} iterations");
        assert_eq!(op.node_voltages.len(), 2);
        assert_eq!(op.branch_currents.len(), 1);
        Ok(())
    }
}
