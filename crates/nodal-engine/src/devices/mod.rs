//! Circuit devices. Each device stamps itself into the MNA system.

mod capacitor;
mod cccs;
mod ccvs;
pub mod constants;
pub mod diode;
mod inductor;
mod isource;
pub mod limit;
mod resistor;
mod vccs;
mod vcvs;
mod vsource;

use crate::circuit::Circuit;
use crate::error::Error;
use crate::ir::{Element, Model, ModelKind};
use crate::mna::RealSystem;

pub use capacitor::Capacitor;
pub use cccs::Cccs;
pub use ccvs::Ccvs;
pub use diode::{Diode, DiodeParams};
pub use inductor::Inductor;
pub use isource::CurrentSource;
pub use resistor::Resistor;
pub use vccs::Vccs;
pub use vcvs::Vcvs;
pub use vsource::VoltageSource;

/// How a device evaluates its junction voltages in `load`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LoadMode {
    /// Ignore `x` and use the ngspice `MODEINITJCT` voltages (diode `Vcrit`;
    /// BJT `Vbe = Vcrit`, `Vbc = 0`; MOSFET `Vbs = -1`, `Vgs = VTO`
    /// type-adjusted, `Vds = 0`).
    InitJunction,
    /// Read voltages from `x`, limit them against `state`, and store the
    /// limited voltages, currents and conductances in `state`.
    Float,
    /// Evaluate at `x` without limiting and without touching `state`. Used
    /// for residuals and stamp tests.
    Exact,
}

/// Per-load settings shared by every device.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LoadContext {
    pub mode: LoadMode,
    /// Conductance across every pn junction.
    pub gmin: f64,
    /// Factor applied to independent source values (source stepping).
    pub source_factor: f64,
    /// Relative tolerance for `Device::converged`.
    pub reltol: f64,
    /// Absolute current tolerance for `Device::converged`.
    pub abstol: f64,
}

impl LoadContext {
    /// Default options (ngspice defaults) in the given mode, sources at full value.
    pub fn new(mode: LoadMode) -> Self {
        Self {
            mode,
            gmin: crate::ir::DEFAULT_GMIN,
            source_factor: 1.0,
            reltol: 1e-3,
            abstol: 1e-12,
        }
    }
}

/// A circuit element that stamps itself into the system.
///
/// Limiting happens inside `load`, as in SPICE: there is no separate limit
/// method.
pub trait Device: std::fmt::Debug {
    /// The element name, for example `R1`.
    fn name(&self) -> &str;

    /// Number of `f64` slots of per-device state (limited voltages, currents,
    /// conductances). The circuit hands `load` exactly this many.
    fn state_len(&self) -> usize {
        0
    }

    /// Adds the DC stamp for the iterate `x`. Returns true if limiting
    /// changed a junction voltage.
    fn load(&self, x: &[f64], state: &mut [f64], ctx: &LoadContext, sys: &mut RealSystem) -> bool;

    /// True if the device's own convergence test holds at `x_new`, given the
    /// state stored by the last `load`.
    fn converged(&self, _x_new: &[f64], _state: &[f64], _ctx: &LoadContext) -> bool {
        true
    }

    /// Sets the DC value of an independent source. Returns false for any
    /// other device.
    fn set_dc(&mut self, _value: f64) -> bool {
        false
    }
}

/// Voltage of unknown `i` in `x`. Ground (`None`) is 0 V.
pub(crate) fn volt(x: &[f64], i: Option<usize>) -> f64 {
    i.and_then(|i| x.get(i)).copied().unwrap_or(0.0)
}

/// Stamps `+1` / `-1` of branch column `k` into the KCL rows of `p` and `n`.
pub(crate) fn stamp_branch_kcl(sys: &mut RealSystem, p: Option<usize>, n: Option<usize>, k: usize) {
    sys.add_a(p, Some(k), 1.0);
    sys.add_a(n, Some(k), -1.0);
}

fn node(circuit: &Circuit, name: &str) -> Option<usize> {
    circuit.node(name)
}

fn branch(circuit: &Circuit, name: &str) -> Result<usize, Error> {
    circuit
        .branch_unknown(name)
        .ok_or_else(|| Error::Invalid(format!("element {name} has no branch current")))
}

fn control_branch(circuit: &Circuit, element: &str, source: &str) -> Result<usize, Error> {
    circuit.branch_unknown(source).ok_or_else(|| {
        Error::Invalid(format!(
            "{element}: control source {source} has no branch current"
        ))
    })
}

/// Builds the device for one element, resolving node and branch indices.
pub(crate) fn instantiate(
    circuit: &Circuit,
    element: &Element,
    models: &[Model],
) -> Result<Box<dyn Device>, Error> {
    if let Element::Q { .. } | Element::M { .. } | Element::S { .. } = element {
        return Err(Error::Invalid(format!(
            "{} elements are not simulated yet",
            element.kind_letter()
        )));
    }
    let (p, n) = match element.nodes() {
        [p, n, ..] => (node(circuit, p), node(circuit, n)),
        _ => return Err(Error::Internal("element has fewer than two nodes".into())),
    };
    let name = element.name().to_string();
    Ok(match element {
        Element::D { model, .. } => {
            let model = models
                .iter()
                .find(|m| m.name == *model && m.kind == ModelKind::D)
                .ok_or_else(|| Error::Invalid(format!("{name}: unknown diode model {model}")))?;
            Box::new(Diode::new(
                name.clone(),
                p,
                circuit.internal(&name),
                n,
                DiodeParams::from_model(model),
            ))
        }
        Element::R { value, .. } => Box::new(Resistor::new(name, p, n, *value)),
        Element::C { .. } => Box::new(Capacitor::new(name)),
        Element::L { .. } => Box::new(Inductor::new(name.clone(), p, n, branch(circuit, &name)?)),
        Element::V { dc, .. } => Box::new(VoltageSource::new(
            name.clone(),
            p,
            n,
            branch(circuit, &name)?,
            *dc,
        )),
        Element::I { dc, .. } => Box::new(CurrentSource::new(name, p, n, *dc)),
        Element::E {
            control_nodes,
            gain,
            ..
        } => Box::new(Vcvs::new(
            name.clone(),
            p,
            n,
            node(circuit, &control_nodes[0]),
            node(circuit, &control_nodes[1]),
            branch(circuit, &name)?,
            *gain,
        )),
        Element::G {
            control_nodes,
            gain,
            ..
        } => Box::new(Vccs::new(
            name,
            p,
            n,
            node(circuit, &control_nodes[0]),
            node(circuit, &control_nodes[1]),
            *gain,
        )),
        Element::H {
            control_source,
            gain,
            ..
        } => Box::new(Ccvs::new(
            name.clone(),
            p,
            n,
            branch(circuit, &name)?,
            control_branch(circuit, &name, control_source)?,
            *gain,
        )),
        Element::F {
            control_source,
            gain,
            ..
        } => {
            let c = control_branch(circuit, &name, control_source)?;
            Box::new(Cccs::new(name, p, n, c, *gain))
        }
        Element::Q { .. } | Element::M { .. } | Element::S { .. } => {
            return Err(Error::Internal("nonlinear element was not rejected".into()));
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::devices::diode::{DiodeParams, eval};

    #[test]
    fn diode_stamp_matches_eval() {
        let p = DiodeParams {
            is: 1e-14,
            n: 1.0,
            rs: 0.0,
        };
        let d = Diode::new("D1".into(), Some(0), None, Some(1), p);
        let x = [0.7, 0.0];
        let mut sys = RealSystem::new(2);
        let mut state = [0.0; 3];
        let ctx = LoadContext::new(LoadMode::Exact);
        assert!(!d.load(&x, &mut state, &ctx, &mut sys));
        assert_eq!(state, [0.0; 3], "Exact mode leaves state alone");
        let (i, g) = eval(0.7, &p, ctx.gmin);
        let ieq = i - g * 0.7;
        assert_eq!(sys.a.get(0, 0), g);
        assert_eq!(sys.a.get(0, 1), -g);
        assert_eq!(sys.a.get(1, 0), -g);
        assert_eq!(sys.a.get(1, 1), g);
        assert_eq!(sys.b, [-ieq, ieq]);
    }

    #[test]
    fn float_mode_limits_and_stores_state() {
        let p = DiodeParams {
            is: 1e-14,
            n: 1.0,
            rs: 0.0,
        };
        let d = Diode::new("D1".into(), Some(0), None, None, p);
        let mut sys = RealSystem::new(1);
        let mut state = [0.0; 3];
        let ctx = LoadContext::new(LoadMode::Float);
        assert!(d.load(&[5.0], &mut state, &ctx, &mut sys));
        assert!(state[0] < 1.0 && state[0] > 0.0);
        let (i, g) = eval(state[0], &p, ctx.gmin);
        assert_eq!((state[1], state[2]), (i, g));
    }
}
