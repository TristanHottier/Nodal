//! Inductor. Short circuit in DC: branch row `v(n+) - v(n-) = 0`. In AC the
//! branch row becomes `v(n+) - v(n-) - j omega L i = 0`. In a transient step
//! the flux `L i` is integrated and the branch row becomes
//! `v(n+) - v(n-) - geq i = ceq` (ngspice `indload.c`).

use super::{Device, LoadContext, stamp_branch_kcl, volt};
use crate::analysis::integrate::integrate;
use crate::error::Error;
use crate::mna::RealSystem;

#[derive(Debug)]
pub struct Inductor {
    name: String,
    p: Option<usize>,
    n: Option<usize>,
    k: usize,
    inductance: f64,
    ic: Option<f64>,
}

impl Inductor {
    pub fn new(
        name: String,
        p: Option<usize>,
        n: Option<usize>,
        k: usize,
        inductance: f64,
    ) -> Self {
        Self {
            name,
            p,
            n,
            k,
            inductance,
            ic: None,
        }
    }

    /// Sets the initial current used by a transient with `uic`.
    pub fn with_ic(mut self, ic: Option<f64>) -> Self {
        self.ic = ic;
        self
    }
}

impl Device for Inductor {
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
        stamp_branch_kcl(sys, self.p, self.n, self.k);
        sys.add_a(Some(self.k), self.p, 1.0);
        sys.add_a(Some(self.k), self.n, -1.0);
        let Some(tran) = &ctx.tran else {
            return false;
        };
        let l = self.inductance;
        match state.first_mut() {
            Some(flux) => *flux = l * volt(x, Some(self.k)),
            None => {
                sys.fault(Error::Internal(format!("{}: empty state", self.name)));
                return false;
            }
        }
        match integrate(&tran.coeffs, state, tran.hist, 0, l) {
            Ok((geq, ceq)) => {
                sys.add_a(Some(self.k), Some(self.k), -geq);
                sys.add_b(Some(self.k), ceq);
            }
            Err(e) => sys.fault(e),
        }
        false
    }

    fn init_charges(&self, x: &[f64], state: &mut [f64], uic: bool) {
        let i = if uic {
            self.ic.unwrap_or(0.0)
        } else {
            volt(x, Some(self.k))
        };
        if let [flux, v, ..] = state {
            *flux = self.inductance * i;
            *v = 0.0;
        }
    }

    /// Port of `indacld.c`: the branch row carries `-j omega L` on its
    /// diagonal, so the reactive matrix gets `-L` there.
    fn load_reactive(&self, _x: &[f64], _state: &[f64], _ctx: &LoadContext, c: &mut RealSystem) {
        c.add_a(Some(self.k), Some(self.k), -self.inductance);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analysis::integrate::Coeffs;
    use crate::devices::{LoadMode, TranLoad};
    use crate::error::Error;
    use crate::ir::Method;

    #[test]
    fn tran_branch_row() -> Result<(), Error> {
        // mna.md section 3, trapezoidal:
        // v+ - v- - (2L/h) i = -(2L/h) i_n - v_n.
        let (l, h, i_n, v_n) = (1e-3, 1e-6, 0.4, 0.9);
        let hist0 = [l * i_n, v_n];
        let z = [0.0; 2];
        let ctx = LoadContext {
            tran: Some(TranLoad {
                time: h,
                coeffs: Coeffs::new(Method::Trap, 2, [h, h])?,
                hist: [&hist0, &z, &z],
            }),
            ..LoadContext::new(LoadMode::Float)
        };
        let ind = Inductor::new("L1".into(), Some(0), Some(1), 2, l);
        let mut sys = RealSystem::new(3);
        let mut state = [0.0; 2];
        // x: v+ = 1, v- = 0.5, i_k = 0.7
        ind.load(&[1.0, 0.5, 0.7], &mut state, &ctx, &mut sys);
        let g = 2.0 * l / h;
        let close = |a: f64, b: f64| (a - b).abs() <= 1e-12 * b.abs().max(1.0);
        assert_eq!(sys.a.get(0, 2), 1.0);
        assert_eq!(sys.a.get(1, 2), -1.0);
        assert_eq!(sys.a.get(2, 0), 1.0);
        assert_eq!(sys.a.get(2, 1), -1.0);
        assert!(close(sys.a.get(2, 2), -g));
        assert!(close(sys.b[2], -g * i_n - v_n), "{}", sys.b[2]);
        assert_eq!(state[0], l * 0.7);
        assert!(sys.fault.is_none());
        Ok(())
    }

    #[test]
    fn dc_row_unchanged_without_tran() {
        let ind = Inductor::new("L1".into(), Some(0), None, 1, 1e-3);
        let mut sys = RealSystem::new(2);
        ind.load(
            &[0.0; 2],
            &mut [0.0; 2],
            &LoadContext::new(LoadMode::Float),
            &mut sys,
        );
        assert_eq!(sys.a.get(1, 1), 0.0);
        assert_eq!(sys.b, [0.0, 0.0]);
        assert_eq!(ind.charge_slots(), &[0]);
        assert_eq!(ind.state_len(), 2);
    }

    #[test]
    fn uic_init_uses_ic() {
        let ind = Inductor::new("L1".into(), Some(0), None, 1, 2e-3).with_ic(Some(0.5));
        let mut state = [9.0; 2];
        ind.init_charges(&[0.0, 7.0], &mut state, true);
        assert_eq!(state, [1e-3, 0.0]);
        ind.init_charges(&[0.0, 7.0], &mut state, false);
        assert_eq!(state, [2e-3 * 7.0, 0.0]);
    }
}
