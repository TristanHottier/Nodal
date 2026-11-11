//! Circuit indexing: node and branch numbering for the MNA system.

mod topology;

use std::collections::HashMap;

use crate::devices::{self, Device};
use crate::error::Error;
use crate::ir::{Element, Netlist};

/// Name of the ground node. It has no unknown.
pub const GROUND: &str = "0";

/// A validated circuit with unknown numbering.
///
/// Unknown `i < node_count` is `V(node_names[i])`. Unknown `node_count + j`
/// is `I(branch_names[j])`.
#[derive(Debug)]
pub struct Circuit {
    /// Non-ground nodes in order of first appearance, scanning elements in
    /// order and `nodes` before `controlNodes`.
    pub node_names: Vec<String>,
    /// Elements that carry a branch-current unknown (V, E, H, L), in element order.
    pub branch_names: Vec<String>,
    /// Device instances, in element order.
    pub devices: Vec<Box<dyn Device>>,
    node_index: HashMap<String, usize>,
    branch_index: HashMap<String, usize>,
}

impl Circuit {
    /// Index the netlist, then run the floating-node check and the
    /// source-loop check, in that order. Returns the first failure.
    pub fn build(netlist: &Netlist) -> Result<Circuit, Error> {
        let mut circuit = Circuit {
            node_names: Vec::new(),
            branch_names: Vec::new(),
            devices: Vec::new(),
            node_index: HashMap::new(),
            branch_index: HashMap::new(),
        };
        for element in &netlist.elements {
            for node in element.nodes().iter().chain(control_nodes(element)) {
                circuit.add_node(node);
            }
            if has_branch(element) {
                circuit
                    .branch_index
                    .insert(element.name().to_string(), circuit.branch_names.len());
                circuit.branch_names.push(element.name().to_string());
            }
        }
        topology::check_floating(netlist, &circuit)?;
        topology::check_source_loops(netlist, &circuit)?;
        let mut devices = Vec::with_capacity(netlist.elements.len());
        for element in &netlist.elements {
            devices.push(devices::instantiate(&circuit, element)?);
        }
        circuit.devices = devices;
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
    /// plus the `branch()` index.
    pub fn branch_unknown(&self, element: &str) -> Option<usize> {
        self.branch(element).map(|j| self.node_names.len() + j)
    }

    /// Total number of unknowns: node voltages plus branch currents.
    pub fn unknown_count(&self) -> usize {
        self.node_names.len() + self.branch_names.len()
    }

    /// Label of an unknown, `V(node)` or `I(element)`. Out-of-range indices
    /// give `?`.
    pub fn unknown_label(&self, index: usize) -> String {
        let n = self.node_names.len();
        if index < n {
            format!("V({})", self.node_names[index])
        } else if let Some(name) = self.branch_names.get(index - n) {
            format!("I({name})")
        } else {
            "?".to_string()
        }
    }
}

fn control_nodes(element: &Element) -> &[String] {
    match element {
        Element::E { control_nodes, .. } | Element::G { control_nodes, .. } => control_nodes,
        _ => &[],
    }
}

fn has_branch(element: &Element) -> bool {
    matches!(
        element,
        Element::V { .. } | Element::E { .. } | Element::H { .. } | Element::L { .. }
    )
}
