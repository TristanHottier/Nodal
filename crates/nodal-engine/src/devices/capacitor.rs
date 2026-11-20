//! Capacitor. Open circuit in DC, so `load` stamps nothing. In AC it adds
//! `C` in the resistor pattern to the reactive matrix.

use super::{Device, LoadContext};
use crate::mna::RealSystem;

#[derive(Debug)]
pub struct Capacitor {
    name: String,
    p: Option<usize>,
    n: Option<usize>,
    capacitance: f64,
}

impl Capacitor {
    pub fn new(name: String, p: Option<usize>, n: Option<usize>, capacitance: f64) -> Self {
        Self {
            name,
            p,
            n,
            capacitance,
        }
    }
}

impl Device for Capacitor {
    fn name(&self) -> &str {
        &self.name
    }

    fn load(
        &self,
        _x: &[f64],
        _state: &mut [f64],
        _ctx: &LoadContext,
        _sys: &mut RealSystem,
    ) -> bool {
        false
    }

    fn load_reactive(&self, _x: &[f64], _state: &[f64], _ctx: &LoadContext, c: &mut RealSystem) {
        let cap = self.capacitance;
        c.add_a(self.p, self.p, cap);
        c.add_a(self.p, self.n, -cap);
        c.add_a(self.n, self.p, -cap);
        c.add_a(self.n, self.n, cap);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::devices::LoadMode;

    #[test]
    fn reactive_stamp_is_resistor_pattern() {
        let cap = Capacitor::new("C1".into(), Some(0), Some(1), 2e-6);
        let mut c = RealSystem::new(2);
        cap.load_reactive(
            &[0.0; 2],
            &[],
            &LoadContext::new(LoadMode::SmallSignal),
            &mut c,
        );
        assert_eq!(c.a.get(0, 0), 2e-6);
        assert_eq!(c.a.get(0, 1), -2e-6);
        assert_eq!(c.a.get(1, 0), -2e-6);
        assert_eq!(c.a.get(1, 1), 2e-6);
        assert_eq!(c.b, [0.0, 0.0]);
    }
}
