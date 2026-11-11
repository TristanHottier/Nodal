//! Circuit indexing: node and branch numbering for the MNA system.

mod topology;

use std::collections::HashMap;

use crate::devices::{self, Device};
use crate::error::Error;
use crate::ir::{DEFAULT_GMIN, Element, ModelKind, Netlist, param};

/// Name of the ground node. It has no unknown.
pub const GROUND: &str = "0";

/// Solver tolerances, filled from the netlist options.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SolverOptions {
    pub reltol: f64,
    /// Absolute voltage tolerance in volts.
    pub vntol: f64,
    /// Absolute current tolerance in amperes.
    pub abstol: f64,
    /// Conductance across every pn junction.
    pub gmin: f64,
}

impl Default for SolverOptions {
    fn default() -> Self {
        Self {
            reltol: 1e-3,
            vntol: 1e-6,
            abstol: 1e-12,
            gmin: DEFAULT_GMIN,
        }
    }
}

/// A validated circuit with unknown numbering.
///
/// Unknown `i < node_count` is `V(node_names[i])`. The next
/// `internal_names.len()` unknowns are internal nodes, labelled
/// `V(D1#internal)` and never reported in results. After those come the
/// branch currents: unknown `node_count + internal_count + j` is
/// `I(branch_names[j])`.
#[derive(Debug)]
pub struct Circuit {
    /// Non-ground nodes in order of first appearance, scanning elements in
    /// order and `nodes` before `controlNodes`.
    pub node_names: Vec<String>,
    /// Internal nodes (a diode with `RS > 0`), labelled `<element>#internal`,
    /// in element order. Unknowns `node_count ..`.
    pub internal_names: Vec<String>,
    /// Elements that carry a branch-current unknown (V, E, H, L), in element order.
    pub branch_names: Vec<String>,
    /// Device instances, in element order.
    pub devices: Vec<Box<dyn Device>>,
    /// Start of each device's slice of the state vector, in device order.
    pub state_offsets: Vec<usize>,
    /// Tolerances and gmin from the netlist options.
    pub options: SolverOptions,
    /// Initial guesses from `nodeset`, as (unknown index, volts).
    pub nodeset: Vec<(usize, f64)>,
    node_index: HashMap<String, usize>,
    branch_index: HashMap<String, usize>,
    internal_index: HashMap<String, usize>,
    state_len: usize,
}

impl Circuit {
    /// Index the netlist, then run the floating-node check and the
    /// source-loop check, in that order. Returns the first failure.
    pub fn build(netlist: &Netlist) -> Result<Circuit, Error> {
        let mut circuit = Circuit {
            node_names: Vec::new(),
            internal_names: Vec::new(),
            branch_names: Vec::new(),
            devices: Vec::new(),
            state_offsets: Vec::new(),
            options: solver_options(netlist),
            nodeset: Vec::new(),
            node_index: HashMap::new(),
            branch_index: HashMap::new(),
            internal_index: HashMap::new(),
            state_len: 0,
        };
        for element in &netlist.elements {
            for node in element.nodes().iter().chain(element.control_nodes()) {
                circuit.add_node(node);
            }
            if element.has_branch() {
                circuit
                    .branch_index
                    .insert(element.name().to_string(), circuit.branch_names.len());
                circuit.branch_names.push(element.name().to_string());
            }
        }
        // Internal nodes are allocated before any device is built, so branch
        // unknowns, which follow them, do not move.
        for element in &netlist.elements {
            if let Element::D { name, model, .. } = element
                && diode_rs(netlist, model) > 0.0
            {
                circuit
                    .internal_index
                    .insert(name.clone(), circuit.internal_names.len());
                circuit.internal_names.push(format!("{name}#internal"));
            }
        }
        topology::check_floating(netlist, &circuit)?;
        topology::check_source_loops(netlist, &circuit)?;
        let mut devices = Vec::with_capacity(netlist.elements.len());
        for element in &netlist.elements {
            devices.push(devices::instantiate(&circuit, element, &netlist.models)?);
        }
        let mut offset = 0;
        for device in &devices {
            circuit.state_offsets.push(offset);
            offset += device.state_len();
        }
        circuit.state_len = offset;
        circuit.devices = devices;
        if let Some(nodeset) = &netlist.nodeset {
            let seeds = nodeset
                .iter()
                .filter_map(|(name, v)| circuit.node(name).map(|i| (i, *v)))
                .collect();
            circuit.nodeset = seeds;
        }
        Ok(circuit)
    }

    fn add_node(&mut self, name: &str) {
        if name == GROUND || self.node_index.contains_key(name) {
            return;
        }
        self.node_index
            .insert(name.to_string(), self.node_names.len());
        self.node_names.push(name.to_string());
    }

    /// Unknown index of a node voltage. `None` for ground and unknown names.
    pub fn node(&self, name: &str) -> Option<usize> {
        self.node_index.get(name).copied()
    }

    /// Index into `branch_names` for an element. See `branch_unknown` for
    /// the unknown index.
    pub fn branch(&self, element: &str) -> Option<usize> {
        self.branch_index.get(element).copied()
    }

    /// MNA unknown index of an element's branch current: `node_names.len()`
    /// plus `internal_names.len()` plus the `branch()` index.
    pub fn branch_unknown(&self, element: &str) -> Option<usize> {
        self.branch(element)
            .map(|j| self.node_names.len() + self.internal_names.len() + j)
    }

    /// Unknown index of an element's internal node, if it has one.
    pub fn internal(&self, element: &str) -> Option<usize> {
        self.internal_index
            .get(element)
            .map(|j| self.node_names.len() + j)
    }

    /// Number of node and internal-node voltage unknowns.
    pub fn voltage_count(&self) -> usize {
        self.node_names.len() + self.internal_names.len()
    }

    /// Total number of unknowns: node voltages, internal nodes and branch currents.
    pub fn unknown_count(&self) -> usize {
        self.voltage_count() + self.branch_names.len()
    }

    /// Total length of the device state vector.
    pub fn state_len(&self) -> usize {
        self.state_len
    }

    /// The device named `name`, mutably (for example to sweep a source).
    pub fn device_mut(&mut self, name: &str) -> Option<&mut Box<dyn Device>> {
        self.devices.iter_mut().find(|d| d.name() == name)
    }

    /// Label of an unknown, `V(node)` or `I(element)`. Out-of-range indices
    /// give `?`.
    pub fn unknown_label(&self, index: usize) -> String {
        let n = self.node_names.len();
        let m = self.voltage_count();
        if index < n {
            format!("V({})", self.node_names[index])
        } else if index < m {
            format!("V({})", self.internal_names[index - n])
        } else if let Some(name) = self.branch_names.get(index - m) {
            format!("I({name})")
        } else {
            "?".to_string()
        }
    }
}

fn solver_options(netlist: &Netlist) -> SolverOptions {
    let d = SolverOptions::default();
    let o = netlist.options.as_ref();
    SolverOptions {
        reltol: o.and_then(|o| o.reltol).unwrap_or(d.reltol),
        vntol: o.and_then(|o| o.vntol).unwrap_or(d.vntol),
        abstol: o.and_then(|o| o.abstol).unwrap_or(d.abstol),
        gmin: o.and_then(|o| o.gmin).unwrap_or(d.gmin),
    }
}

/// `RS` of the diode model `model`; 0 if the model is missing (instantiation
/// reports that).
fn diode_rs(netlist: &Netlist, model: &str) -> f64 {
    netlist
        .models
        .iter()
        .find(|m| m.name == model && m.kind == ModelKind::D)
        .map_or(0.0, |m| param(m, "RS"))
}
