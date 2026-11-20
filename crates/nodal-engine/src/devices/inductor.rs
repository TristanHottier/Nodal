//! Inductor. Short circuit in DC: branch row `v(n+) - v(n-) = 0`. In AC the
//! branch row becomes `v(n+) - v(n-) - j omega L i = 0`.

use super::{Device, LoadContext, stamp_branch_kcl};
use crate::mna::RealSystem;

#[derive(Debug)]
pub struct Inductor {
    name: String,
    p: Option<usize>,
    n: Option<usize>,
    k: usize,
    inductance: f64,
}

impl Inductor {
    pub fn new(
        name: String,
        p: Option<usize>,
        n: Option<usize>,
        k: usize,
        inductance: f64,
    ) -> Self {
        Self {
            name,
            p,
            n,
            k,
            inductance,
        }
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

    /// Port of `indacld.c`: the branch row carries `-j omega L` on its
    /// diagonal, so the reactive matrix gets `-L` there.
    fn load_reactive(&self, _x: &[f64], _state: &[f64], _ctx: &LoadContext, c: &mut RealSystem) {
        c.add_a(Some(self.k), Some(self.k), -self.inductance);
    }
}
