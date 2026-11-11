//! Circuit devices. Each device stamps itself into the MNA system.

mod capacitor;
mod cccs;
mod ccvs;
mod inductor;
mod isource;
mod resistor;
mod vccs;
mod vcvs;
mod vsource;

use crate::circuit::Circuit;
use crate::error::Error;
use crate::ir::Element;
use crate::mna::RealSystem;

pub use capacitor::Capacitor;
pub use cccs::Cccs;
pub use ccvs::Ccvs;
pub use inductor::Inductor;
pub use isource::CurrentSource;
pub use resistor::Resistor;
pub use vccs::Vccs;
pub use vcvs::Vcvs;
pub use vsource::VoltageSource;

/// A circuit element that stamps itself into the system.
pub trait Device: std::fmt::Debug {
    /// The element name, for example `R1`.
    fn name(&self) -> &str;

    /// Adds the DC stamp for the current iterate `x`. Linear devices ignore `x`.
    fn load(&self, x: &[f64], sys: &mut RealSystem);
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
pub(crate) fn instantiate(circuit: &Circuit, element: &Element) -> Result<Box<dyn Device>, Error> {
    if let Element::D { .. } | Element::Q { .. } | Element::M { .. } | Element::S { .. } = element {
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
        Element::D { .. } | Element::Q { .. } | Element::M { .. } | Element::S { .. } => {
            return Err(Error::Internal("nonlinear element was not rejected".into()));
        }
    })
}
