//! Capacitor. Open circuit in DC, so `load` stamps nothing. In AC it adds
//! `C` in the resistor pattern to the reactive matrix. In a transient step it
//! stores `q = C v`, integrates it and stamps the companion conductance and
//! current (ngspice `capload.c`).

use super::{Device, LoadContext, volt};
use crate::analysis::integrate::integrate;
use crate::error::Error;
use crate::mna::RealSystem;

#[derive(Debug)]
pub struct Capacitor {
    name: String,
    p: Option<usize>,
    n: Option<usize>,
    capacitance: f64,
    ic: Option<f64>,
}

impl Capacitor {
    pub fn new(name: String, p: Option<usize>, n: Option<usize>, capacitance: f64) -> Self {
        Self {
            name,
            p,
            n,
            capacitance,
            ic: None,
        }
    }

    /// Sets the initial voltage used by a transient with `uic`.
    pub fn with_ic(mut self, ic: Option<f64>) -> Self {
        self.ic = ic;
        self
    }
}

impl Device for Capacitor {
    fn name(&self) -> &str {
        &self.name
    }

    fn state_len(&self) -> usize {
        2
    }

    fn charge_slots(&self) -> &'static [usize] {
        &[0]
    }

    fn load(&self, x: &[f64], state: &mut [f64], ctx: &LoadContext, sys: &mut RealSystem) -> bool {
        let Some(tran) = &ctx.tran else {
            return false;
        };
        let cap = self.capacitance;
        match state.first_mut() {
            Some(q) => *q = cap * (volt(x, self.p) - volt(x, self.n)),
            None => {
                sys.fault(Error::Internal(format!("{}: empty state", self.name)));
                return false;
            }
        }
        match integrate(&tran.coeffs, state, tran.hist, 0, cap) {
            Ok((geq, ceq)) => {
                sys.add_a(self.p, self.p, geq);
                sys.add_a(self.p, self.n, -geq);
                sys.add_a(self.n, self.p, -geq);
                sys.add_a(self.n, self.n, geq);
                sys.add_b(self.p, -ceq);
                sys.add_b(self.n, ceq);
            }
            Err(e) => sys.fault(e),
        }
        false
    }

    fn init_charges(&self, x: &[f64], state: &mut [f64], uic: bool) {
        let v = if uic {
            self.ic.unwrap_or(0.0)
        } else {
            volt(x, self.p) - volt(x, self.n)
        };
        if let [q, i, ..] = state {
            *q = self.capacitance * v;
            *i = 0.0;
        }
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
    use crate::analysis::integrate::{Coeffs, integrate};
    use crate::devices::{LoadMode, TranLoad};
    use crate::error::Error;
    use crate::ir::Method;

    fn tran_ctx<'a>(coeffs: Coeffs, hist: [&'a [f64]; 3]) -> LoadContext<'a> {
        LoadContext {
            tran: Some(TranLoad {
                time: 1e-6,
                coeffs,
                hist,
            }),
            ..LoadContext::new(LoadMode::Float)
        }
    }

    fn check_stamp(method: Method, order: usize, h: [f64; 2]) -> Result<(), Error> {
        let (cap, v) = (2e-6, 1.7);
        let hist0 = [cap * 1.3, 0.25];
        let hist1 = [cap * 1.1, 0.2];
        let z = [0.0; 2];
        let coeffs = Coeffs::new(method, order, h)?;
        let c = Capacitor::new("C1".into(), Some(0), Some(1), cap);
        let ctx = tran_ctx(coeffs, [&hist0, &hist1, &z]);
        let mut sys = RealSystem::new(2);
        let mut state = [0.0; 2];
        assert!(!c.load(&[v, 0.5], &mut state, &ctx, &mut sys));
        let mut want = [0.0; 2];
        want[0] = cap * (v - 0.5);
        let (geq, ceq) = integrate(&coeffs, &mut want, [&hist0, &hist1, &z], 0, cap)?;
        assert_eq!(state, want);
        assert_eq!(sys.a.get(0, 0), geq);
        assert_eq!(sys.a.get(0, 1), -geq);
        assert_eq!(sys.a.get(1, 0), -geq);
        assert_eq!(sys.a.get(1, 1), geq);
        assert_eq!(sys.b, [-ceq, ceq]);
        assert!(sys.fault.is_none());
        Ok(())
    }

    #[test]
    fn tran_trap_stamp() -> Result<(), Error> {
        check_stamp(Method::Trap, 2, [1e-6, 1e-6])?;
        // mna.md section 3: G = 2C/h, I = -(2C/h v_n + i_n).
        let (cap, h, v_n, i_n) = (2e-6, 1e-6, 1.3, 0.25);
        let hist0 = [cap * v_n, i_n];
        let z = [0.0; 2];
        let ctx = tran_ctx(Coeffs::new(Method::Trap, 2, [h, h])?, [&hist0, &z, &z]);
        let c = Capacitor::new("C1".into(), Some(0), None, cap);
        let mut sys = RealSystem::new(1);
        c.load(&[1.7], &mut [0.0; 2], &ctx, &mut sys);
        let g = 2.0 * cap / h;
        assert!((sys.a.get(0, 0) - g).abs() < 1e-12 * g);
        let ieq = -(g * v_n + i_n);
        assert!((sys.b[0] + ieq).abs() < 1e-12 * ieq.abs());
        Ok(())
    }

    #[test]
    fn tran_gear_stamp() -> Result<(), Error> {
        check_stamp(Method::Gear, 2, [1e-6, 0.5e-6])?;
        check_stamp(Method::Gear, 1, [1e-6, 1e-6])
    }

    #[test]
    fn short_state_faults_instead_of_panicking() -> Result<(), Error> {
        let z = [0.0; 2];
        let ctx = tran_ctx(Coeffs::new(Method::Trap, 2, [1e-6, 1e-6])?, [&z, &z, &z]);
        let c = Capacitor::new("C1".into(), Some(0), None, 1e-6);
        let mut sys = RealSystem::new(1);
        c.load(&[1.0], &mut [0.0; 1], &ctx, &mut sys);
        assert!(matches!(sys.fault, Some(Error::Internal(_))));
        Ok(())
    }

    #[test]
    fn no_tran_is_open() {
        let c = Capacitor::new("C1".into(), Some(0), None, 1e-6);
        let mut sys = RealSystem::new(1);
        c.load(
            &[1.0],
            &mut [0.0; 2],
            &LoadContext::new(LoadMode::Float),
            &mut sys,
        );
        assert_eq!(sys.a.get(0, 0), 0.0);
        assert_eq!(c.charge_slots(), &[0]);
        assert_eq!(c.state_len(), 2);
    }

    #[test]
    fn uic_init_uses_ic() {
        let c = Capacitor::new("C1".into(), Some(0), Some(1), 2e-6).with_ic(Some(3.0));
        let mut state = [9.0; 2];
        c.init_charges(&[10.0, 1.0], &mut state, true);
        assert_eq!(state, [6e-6, 0.0]);
        c.init_charges(&[10.0, 1.0], &mut state, false);
        assert_eq!(state, [2e-6 * 9.0, 0.0]);
        let unset = Capacitor::new("C2".into(), Some(0), None, 2e-6);
        unset.init_charges(&[10.0], &mut state, true);
        assert_eq!(state, [0.0, 0.0]);
    }

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
