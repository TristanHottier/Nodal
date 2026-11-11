//! Inductor. Short circuit in DC: branch row `v(n+) - v(n-) = 0`.

use super::{Device, LoadContext, stamp_branch_kcl};
use crate::mna::RealSystem;

#[derive(Debug)]
pub struct Inductor {
    name: String,
    p: Option<usize>,
    n: Option<usize>,
    k: usize,
}

impl Inductor {
    pub fn new(name: String, p: Option<usize>, n: Option<usize>, k: usize) -> Self {
        Self { name, p, n, k }
    }
}

impl Device for Inductor {
    fn name(&self) -> &str {
        &self.name
    }

    fn load(
        &self,
        _x: &[f64],
        _state: &mut [f64],
        _ctx: &LoadContext,
        sys: &mut RealSystem,
    ) -> bool {
        stamp_branch_kcl(sys, self.p, self.n, self.k);
        sys.add_a(Some(self.k), self.p, 1.0);
        sys.add_a(Some(self.k), self.n, -1.0);
        false
    }
}
