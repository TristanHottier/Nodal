//! Current-controlled voltage source (H).

use super::{Device, stamp_branch_kcl};
use crate::mna::RealSystem;

#[derive(Debug)]
pub struct Ccvs {
    name: String,
    p: Option<usize>,
    n: Option<usize>,
    k: usize,
    control: usize,
    r: f64,
}

impl Ccvs {
    pub fn new(
        name: String,
        p: Option<usize>,
        n: Option<usize>,
        k: usize,
        control: usize,
        r: f64,
    ) -> Self {
        Self {
            name,
            p,
            n,
            k,
            control,
            r,
        }
    }
}

impl Device for Ccvs {
    fn name(&self) -> &str {
        &self.name
    }

    fn load(&self, _x: &[f64], sys: &mut RealSystem) {
        stamp_branch_kcl(sys, self.p, self.n, self.k);
        let row = Some(self.k);
        sys.add_a(row, self.p, 1.0);
        sys.add_a(row, self.n, -1.0);
        sys.add_a(row, Some(self.control), -self.r);
    }
}
