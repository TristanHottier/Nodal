//! Independent voltage source.

use super::{Device, stamp_branch_kcl};
use crate::mna::RealSystem;

#[derive(Debug)]
pub struct VoltageSource {
    name: String,
    p: Option<usize>,
    n: Option<usize>,
    k: usize,
    dc: f64,
}

impl VoltageSource {
    pub fn new(name: String, p: Option<usize>, n: Option<usize>, k: usize, dc: f64) -> Self {
        Self { name, p, n, k, dc }
    }
}

impl Device for VoltageSource {
    fn name(&self) -> &str {
        &self.name
    }

    fn load(&self, _x: &[f64], sys: &mut RealSystem) {
        stamp_branch_kcl(sys, self.p, self.n, self.k);
        sys.add_a(Some(self.k), self.p, 1.0);
        sys.add_a(Some(self.k), self.n, -1.0);
        sys.add_b(Some(self.k), self.dc);
    }
}
