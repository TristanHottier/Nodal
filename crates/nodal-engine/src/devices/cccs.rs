//! Current-controlled current source (F).

use super::Device;
use crate::mna::RealSystem;

#[derive(Debug)]
pub struct Cccs {
    name: String,
    p: Option<usize>,
    n: Option<usize>,
    control: usize,
    beta: f64,
}

impl Cccs {
    pub fn new(
        name: String,
        p: Option<usize>,
        n: Option<usize>,
        control: usize,
        beta: f64,
    ) -> Self {
        Self {
            name,
            p,
            n,
            control,
            beta,
        }
    }
}

impl Device for Cccs {
    fn name(&self) -> &str {
        &self.name
    }

    fn load(&self, _x: &[f64], sys: &mut RealSystem) {
        sys.add_a(self.p, Some(self.control), self.beta);
        sys.add_a(self.n, Some(self.control), -self.beta);
    }
}
