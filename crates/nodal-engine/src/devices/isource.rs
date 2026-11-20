//! Independent current source, flowing from `n+` through the source to `n-`.

use super::{Device, LoadContext};
use crate::ir::AcSpec;
use crate::linalg::C64;
use crate::mna::{AcExcitation, RealSystem};

#[derive(Debug)]
pub struct CurrentSource {
    name: String,
    p: Option<usize>,
    n: Option<usize>,
    dc: f64,
    ac: Option<AcSpec>,
}

impl CurrentSource {
    pub fn new(
        name: String,
        p: Option<usize>,
        n: Option<usize>,
        dc: f64,
        ac: Option<AcSpec>,
    ) -> Self {
        Self { name, p, n, dc, ac }
    }
}

impl Device for CurrentSource {
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
        let value = self.dc * ctx.source_factor;
        sys.add_b(self.p, -value);
        sys.add_b(self.n, value);
        false
    }

    /// Port of `isrcacld.c`: `b[n+] -= I`, `b[n-] += I`, phase in degrees.
    fn load_ac_excitation(&self, b: &mut AcExcitation) {
        if let Some(ac) = self.ac {
            let phase = ac.phase.to_radians();
            let value = C64::new(ac.mag * phase.cos(), ac.mag * phase.sin());
            b.add(self.p, C64::new(-value.re, -value.im));
            b.add(self.n, value);
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
