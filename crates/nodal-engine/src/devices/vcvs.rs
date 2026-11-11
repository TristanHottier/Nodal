//! Voltage-controlled voltage source (E).

use super::{Device, LoadContext, stamp_branch_kcl};
use crate::mna::RealSystem;

#[derive(Debug)]
pub struct Vcvs {
    name: String,
    p: Option<usize>,
    n: Option<usize>,
    cp: Option<usize>,
    cn: Option<usize>,
    k: usize,
    mu: f64,
}

impl Vcvs {
    pub fn new(
        name: String,
        p: Option<usize>,
        n: Option<usize>,
        cp: Option<usize>,
        cn: Option<usize>,
        k: usize,
        mu: f64,
    ) -> Self {
        Self {
            name,
            p,
            n,
            cp,
            cn,
            k,
            mu,
        }
    }
}

impl Device for Vcvs {
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
        let row = Some(self.k);
        sys.add_a(row, self.p, 1.0);
        sys.add_a(row, self.n, -1.0);
        sys.add_a(row, self.cp, -self.mu);
        sys.add_a(row, self.cn, self.mu);
        false
    }
}
