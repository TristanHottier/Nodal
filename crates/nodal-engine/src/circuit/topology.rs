//! Topology checks that run before solving (docs/reference/mna.md section 6).

use std::collections::{BTreeSet, VecDeque};

use super::Circuit;
use crate::error::Error;
use crate::ir::{Element, Netlist};

/// Disjoint sets with path halving.
struct UnionFind {
    parent: Vec<usize>,
}

impl UnionFind {
    fn new(n: usize) -> Self {
        UnionFind {
            parent: (0..n).collect(),
        }
    }

    fn find(&mut self, mut x: usize) -> usize {
        while self.parent[x] != x {
            self.parent[x] = self.parent[self.parent[x]];
            x = self.parent[x];
        }
        x
    }

    fn union(&mut self, a: usize, b: usize) {
        let (ra, rb) = (self.find(a), self.find(b));
        if ra != rb {
            self.parent[ra] = rb;
        }
    }
}

/// Index of a node in the union-find. Ground is `node_count`.
fn index(name: &str, circuit: &Circuit) -> usize {
    circuit.node(name).unwrap_or(circuit.node_names.len())
}

/// Every node must reach ground through the DC edges of `Element::dc_edges`.
pub(super) fn check_floating(netlist: &Netlist, circuit: &Circuit) -> Result<(), Error> {
    let ground = circuit.node_names.len();
    let mut sets = UnionFind::new(ground + 1);
    for element in &netlist.elements {
        for (a, b) in element.dc_edges() {
            sets.union(index(a, circuit), index(b, circuit));
        }
    }
    let ground_root = sets.find(ground);
    let unreachable: Vec<usize> = (0..ground)
        .filter(|&i| sets.find(i) != ground_root)
        .collect();
    if unreachable.is_empty() {
        return Ok(());
    }
    let nodes: BTreeSet<&str> = unreachable
        .iter()
        .map(|&i| circuit.node_names[i].as_str())
        .collect();
    let elements: BTreeSet<&str> = netlist
        .elements
        .iter()
        .filter(|e| {
            e.nodes()
                .iter()
                .chain(e.control_nodes())
                .any(|n| nodes.contains(n.as_str()))
        })
        .map(Element::name)
        .collect();
    Err(Error::Floating {
        nodes: nodes.into_iter().map(String::from).collect(),
        elements: elements.into_iter().map(String::from).collect(),
    })
}

/// V, E, H and L output edges must not close a loop.
pub(super) fn check_source_loops(netlist: &Netlist, circuit: &Circuit) -> Result<(), Error> {
    let total = circuit.node_names.len() + 1;
    let mut sets = UnionFind::new(total);
    // Adjacency over the edges added so far: (neighbor, element name).
    let mut adjacency: Vec<Vec<(usize, &str)>> = vec![Vec::new(); total];
    for element in &netlist.elements {
        if !element.has_branch() {
            continue;
        }
        let nodes = element.nodes();
        let (a, b) = (index(&nodes[0], circuit), index(&nodes[1], circuit));
        if sets.find(a) == sets.find(b) {
            let mut members: BTreeSet<&str> = path_elements(&adjacency, a, b).into_iter().collect();
            members.insert(element.name());
            return Err(Error::SourceLoop {
                elements: members.into_iter().map(String::from).collect(),
            });
        }
        sets.union(a, b);
        adjacency[a].push((b, element.name()));
        adjacency[b].push((a, element.name()));
    }
    Ok(())
}

/// Elements on a path from `from` to `to`, found by BFS.
fn path_elements<'a>(adjacency: &[Vec<(usize, &'a str)>], from: usize, to: usize) -> Vec<&'a str> {
    let mut came_from: Vec<Option<(usize, &'a str)>> = vec![None; adjacency.len()];
    let mut seen = vec![false; adjacency.len()];
    let mut queue = VecDeque::new();
    seen[from] = true;
    queue.push_back(from);
    while let Some(u) = queue.pop_front() {
        if u == to {
            break;
        }
        for &(v, name) in &adjacency[u] {
            if !seen[v] {
                seen[v] = true;
                came_from[v] = Some((u, name));
                queue.push_back(v);
            }
        }
    }
    let mut path = Vec::new();
    let mut at = to;
    while let Some((prev, name)) = came_from[at] {
        path.push(name);
        at = prev;
    }
    path
}
