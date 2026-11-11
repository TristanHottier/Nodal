//! Resistor.

use super::Device;
use crate::mna::RealSystem;

#[derive(Debug)]
pub struct Resistor {
    name: String,
    p: Option<usize>,
    n: Option<usize>,
    g: f64,
}

impl Resistor {
    pub fn new(name: String, p: Option<usize>, n: Option<usize>, resistance: f64) -> Self {
        Self {
            name,
            p,
            n,
            g: 1.0 / resistance,
        }
    }
}

impl Device for Resistor {
    fn name(&self) -> &str {
        &self.name
    }

    fn load(&self, _x: &[f64], sys: &mut RealSystem) {
        sys.add_a(self.p, self.p, self.g);
        sys.add_a(self.p, self.n, -self.g);
        sys.add_a(self.n, self.p, -self.g);
        sys.add_a(self.n, self.n, self.g);
    }
}
