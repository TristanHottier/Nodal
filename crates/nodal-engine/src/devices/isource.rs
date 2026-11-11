//! Independent current source, flowing from `n+` through the source to `n-`.

use super::Device;
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

    fn load(&self, _x: &[f64], sys: &mut RealSystem) {
        sys.add_b(self.p, -self.dc);
        sys.add_b(self.n, self.dc);
    }
}
