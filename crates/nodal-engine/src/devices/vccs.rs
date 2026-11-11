//! Voltage-controlled current source (G).

use super::{Device, LoadContext};
use crate::mna::RealSystem;

#[derive(Debug)]
pub struct Vccs {
    name: String,
    p: Option<usize>,
    n: Option<usize>,
    cp: Option<usize>,
    cn: Option<usize>,
    gm: f64,
}

impl Vccs {
    pub fn new(
        name: String,
        p: Option<usize>,
        n: Option<usize>,
        cp: Option<usize>,
        cn: Option<usize>,
        gm: f64,
    ) -> Self {
        Self {
            name,
            p,
            n,
            cp,
            cn,
            gm,
        }
    }
}

impl Device for Vccs {
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
        sys.add_a(self.p, self.cp, self.gm);
        sys.add_a(self.p, self.cn, -self.gm);
        sys.add_a(self.n, self.cp, -self.gm);
        sys.add_a(self.n, self.cn, self.gm);
        false
    }
}
