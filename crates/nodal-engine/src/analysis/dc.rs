//! DC sweep of one independent source.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::newton::{NewtonConfig, Strategy, Trace, newton_counted, solve_dc_counted};
use super::op::report;
use crate::circuit::Circuit;
use crate::error::Error;

/// Node voltages and branch currents at every sweep point, keyed by bare
/// name. Each vector has one entry per point of `sweep`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DcResult {
    pub source: String,
    pub sweep: Vec<f64>,
    pub node_voltages: BTreeMap<String, Vec<f64>>,
    pub branch_currents: BTreeMap<String, Vec<f64>>,
}

/// Sweeps the DC value of `source` over `values`. The source keeps its
/// original value afterwards, also when a point fails.
pub fn solve_dc_sweep(
    circuit: &mut Circuit,
    source: &str,
    values: &[f64],
) -> Result<DcResult, Error> {
    sweep_with(circuit, source, values, |_| true)
}

/// Restores the source's DC value when dropped, on every exit path.
struct Restore<'a> {
    circuit: &'a mut Circuit,
    source: &'a str,
    original: f64,
}

impl Drop for Restore<'_> {
    fn drop(&mut self) {
        if let Some(device) = self.circuit.device_mut(self.source) {
            device.set_dc(self.original);
        }
    }
}

/// `solve_dc_sweep` with a hook for tests: when `plain_allowed(i)` is false,
/// point `i` skips every plain Newton run and starts with gmin stepping.
pub(crate) fn sweep_with(
    circuit: &mut Circuit,
    source: &str,
    values: &[f64],
    plain_allowed: impl Fn(usize) -> bool,
) -> Result<DcResult, Error> {
    if values.is_empty() {
        return Err(Error::Invalid(format!(
            "dc sweep of {source} has no points"
        )));
    }
    let original = circuit
        .device_mut(source)
        .and_then(|d| d.dc_value())
        .ok_or_else(|| {
            Error::Invalid(format!("dc sweep: {source} is not an independent source"))
        })?;
    let guard = Restore {
        circuit,
        source,
        original,
    };
    let mut result = DcResult {
        source: source.to_string(),
        sweep: Vec::with_capacity(values.len()),
        node_voltages: BTreeMap::new(),
        branch_currents: BTreeMap::new(),
    };
    let mut previous: Option<(Vec<f64>, Vec<f64>)> = None;
    for (index, &value) in values.iter().enumerate() {
        let wrap = |cause: Error| Error::SweepPoint {
            source: source.to_string(),
            value,
            cause: Box::new(cause),
        };
        let set = guard
            .circuit
            .device_mut(source)
            .is_some_and(|device| device.set_dc(value));
        if !set {
            return Err(wrap(Error::Internal("cannot set the source value".into())));
        }
        let circuit: &Circuit = guard.circuit;
        let (x, state) =
            solve_point(circuit, previous.as_ref(), plain_allowed(index)).map_err(wrap)?;
        let point = report(circuit, &x);
        result.sweep.push(value);
        for (name, v) in point.node_voltages {
            result.node_voltages.entry(name).or_default().push(v);
        }
        for (name, i) in point.branch_currents {
            result.branch_currents.entry(name).or_default().push(i);
        }
        previous = Some((x, state));
    }
    Ok(result)
}

/// Solves one sweep point. Later points first try plain Newton warm from the
/// previous solution (no `InitJunction`), then the full cold chain.
fn solve_point(
    circuit: &Circuit,
    previous: Option<&(Vec<f64>, Vec<f64>)>,
    plain_allowed: bool,
) -> Result<(Vec<f64>, Vec<f64>), Error> {
    if let (Some((x_prev, state_prev)), true) = (previous, plain_allowed) {
        let mut state = state_prev.clone();
        let cfg = NewtonConfig {
            init_junction: false,
            ..NewtonConfig::default()
        };
        match newton_counted(circuit, x_prev, &mut state, &cfg).0 {
            Ok(x) => return Ok((x, state)),
            Err(failure) => {
                if let Some(error) = failure.error {
                    return Err(error);
                }
            }
        }
    }
    let x0 = vec![0.0; circuit.unknown_count()];
    let mut state = vec![0.0; circuit.state_len()];
    let strategy = if plain_allowed {
        Strategy::All
    } else {
        Strategy::GminOnly
    };
    let (outcome, _) = solve_dc_counted(circuit, &x0, &mut state, strategy, &mut Trace::default());
    outcome.map(|x| (x, state))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ir::{parse_netlist, sweep_values};

    type TestResult = Result<(), Box<dyn std::error::Error>>;

    /// N1: diode with series resistance behind a resistor, swept -5 V to 5 V.
    const N1: &str = r#"{"irVersion":1,"elements":[
        {"kind":"V","name":"V1","nodes":["in","0"],"dc":0},
        {"kind":"R","name":"R1","nodes":["in","a"],"value":1000},
        {"kind":"D","name":"D1","nodes":["a","0"],"model":"DM"}],
        "models":[{"name":"DM","type":"D","params":{"IS":1e-14,"RS":10}}],
        "analyses":[{"type":"dc","source":"V1","start":-5,"stop":5,"step":0.1}]}"#;

    #[test]
    fn sweep_point_uses_fallbacks() -> TestResult {
        let mut circuit = Circuit::build(&parse_netlist(N1)?)?;
        let values = sweep_values(-5.0, 5.0, 0.1);
        let normal = solve_dc_sweep(&mut circuit, "V1", &values)?;
        let forced = sweep_with(&mut circuit, "V1", &values, |i| i != 3)?;
        assert_eq!(forced.sweep, normal.sweep);
        assert_eq!(normal.sweep.len(), 101);
        for (name, series) in &normal.node_voltages {
            for (k, (a, b)) in series.iter().zip(&forced.node_voltages[name]).enumerate() {
                assert!((a - b).abs() <= 1e-5 * b.abs() + 1e-8, "V({name}) @ {k}");
            }
        }
        for (name, series) in &normal.branch_currents {
            for (k, (a, b)) in series.iter().zip(&forced.branch_currents[name]).enumerate() {
                assert!((a - b).abs() <= 1e-5 * b.abs() + 1e-13, "I({name}) @ {k}");
            }
        }
        Ok(())
    }

    #[test]
    fn failing_point_names_the_value_and_restores_the_source() -> TestResult {
        let mut circuit = Circuit::build(&parse_netlist(N1)?)?;
        // Not an independent source.
        assert!(matches!(
            solve_dc_sweep(&mut circuit, "R1", &[0.0]),
            Err(Error::Invalid(_))
        ));
        // A NaN value cannot converge.
        let err = solve_dc_sweep(&mut circuit, "V1", &[0.0, f64::NAN]);
        match err {
            Err(Error::SweepPoint { source, value, .. }) => {
                assert_eq!(source, "V1");
                assert!(value.is_nan());
            }
            other => return Err(format!("expected SweepPoint, got {other:?}").into()),
        }
        let restored = circuit.device_mut("V1").and_then(|d| d.dc_value());
        assert_eq!(restored, Some(0.0));
        Ok(())
    }
}
