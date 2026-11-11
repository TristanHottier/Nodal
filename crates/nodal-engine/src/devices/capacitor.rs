//! Capacitor. Open circuit in DC, so it stamps nothing.

use super::Device;
use crate::mna::RealSystem;

#[derive(Debug)]
pub struct Capacitor {
    name: String,
}

impl Capacitor {
    pub fn new(name: String) -> Self {
        Self { name }
    }
}

impl Device for Capacitor {
    fn name(&self) -> &str {
        &self.name
    }

    fn load(&self, _x: &[f64], _sys: &mut RealSystem) {}
}
