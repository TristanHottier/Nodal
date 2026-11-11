//! Independent voltage source.

use super::{Device, LoadContext, stamp_branch_kcl};
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

    fn load(
        &self,
        _x: &[f64],
        _state: &mut [f64],
        ctx: &LoadContext,
        sys: &mut RealSystem,
    ) -> bool {
        stamp_branch_kcl(sys, self.p, self.n, self.k);
        sys.add_a(Some(self.k), self.p, 1.0);
        sys.add_a(Some(self.k), self.n, -1.0);
        sys.add_b(Some(self.k), self.dc * ctx.source_factor);
        false
    }

    fn set_dc(&mut self, value: f64) -> bool {
        self.dc = value;
        true
    }
}
