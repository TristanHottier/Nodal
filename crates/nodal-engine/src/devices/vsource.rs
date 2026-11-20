//! Independent voltage source.

use super::{Device, LoadContext, stamp_branch_kcl};
use crate::ir::AcSpec;
use crate::linalg::C64;
use crate::mna::{AcExcitation, RealSystem};

#[derive(Debug)]
pub struct VoltageSource {
    name: String,
    p: Option<usize>,
    n: Option<usize>,
    k: usize,
    dc: f64,
    ac: Option<AcSpec>,
}

impl VoltageSource {
    pub fn new(
        name: String,
        p: Option<usize>,
        n: Option<usize>,
        k: usize,
        dc: f64,
        ac: Option<AcSpec>,
    ) -> Self {
        Self {
            name,
            p,
            n,
            k,
            dc,
            ac,
        }
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

    /// Port of `vsrcacld.c`: `b[k] += mag e^(j phase)`, phase in degrees.
    fn load_ac_excitation(&self, b: &mut AcExcitation) {
        if let Some(ac) = self.ac {
            let phase = ac.phase.to_radians();
            b.add(
                Some(self.k),
                C64::new(ac.mag * phase.cos(), ac.mag * phase.sin()),
            );
        }
    }

    fn set_dc(&mut self, value: f64) -> bool {
        self.dc = value;
        true
    }

    fn dc_value(&self) -> Option<f64> {
        Some(self.dc)
    }
}
