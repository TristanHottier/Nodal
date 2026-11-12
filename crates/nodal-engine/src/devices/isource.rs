//! Independent current source, flowing from `n+` through the source to `n-`.

use super::{Device, LoadContext};
use crate::mna::RealSystem;

#[derive(Debug)]
pub struct CurrentSource {
    name: String,
    p: Option<usize>,
    n: Option<usize>,
    dc: f64,
}

impl CurrentSource {
    pub fn new(name: String, p: Option<usize>, n: Option<usize>, dc: f64) -> Self {
        Self { name, p, n, dc }
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

    fn set_dc(&mut self, value: f64) -> bool {
        self.dc = value;
        true
    }

    fn dc_value(&self) -> Option<f64> {
        Some(self.dc)
    }
}
