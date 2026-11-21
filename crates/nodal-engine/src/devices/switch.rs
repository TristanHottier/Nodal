//! Voltage-controlled switch (docs/reference/devices.md section 4).
//!
//! The state decision follows ngspice `swload.c`, restricted to DC and to a
//! non-negative `VH`. State slot 0 holds the on/off state (1.0 on, 0.0 off).

use super::{Device, LoadContext, LoadMode, volt};
use crate::error::Error;
use crate::ir::{Model, param};
use crate::mna::RealSystem;

/// Parameters of a switch model, with `ROFF` already resolved.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SwitchParams {
    /// Threshold voltage `VT`.
    pub vt: f64,
    /// Hysteresis half-width `VH`.
    pub vh: f64,
    /// On conductance, `1/RON`.
    pub g_on: f64,
    /// Off conductance, `1/ROFF`, or `gmin` when `ROFF` is unset.
    pub g_off: f64,
}

impl SwitchParams {
    /// Reads a model. An unset `ROFF` (NaN) means `1/gmin`.
    pub fn from_model(model: &Model, gmin: f64) -> Result<Self, Error> {
        let roff = param(model, "ROFF")?;
        Ok(Self {
            vt: param(model, "VT")?,
            vh: param(model, "VH")?,
            g_on: 1.0 / param(model, "RON")?,
            g_off: if roff.is_nan() { gmin } else { 1.0 / roff },
        })
    }
}

#[derive(Debug)]
pub struct Switch {
    name: String,
    p: Option<usize>,
    n: Option<usize>,
    cp: Option<usize>,
    cn: Option<usize>,
    params: SwitchParams,
}

impl Switch {
    pub fn new(
        name: String,
        output: [Option<usize>; 2],
        control: [Option<usize>; 2],
        params: SwitchParams,
    ) -> Self {
        Self {
            name,
            p: output[0],
            n: output[1],
            cp: control[0],
            cn: control[1],
            params,
        }
    }
}

impl Device for Switch {
    fn name(&self) -> &str {
        &self.name
    }

    fn state_len(&self) -> usize {
        1
    }

    fn load(&self, x: &[f64], state: &mut [f64], ctx: &LoadContext, sys: &mut RealSystem) -> bool {
        let stored = state.first().copied().unwrap_or(0.0);
        let mut limited = false;
        let on = match ctx.mode {
            // swload.c: MODEINITJCT without the ON flag gives an off switch.
            LoadMode::InitJunction => false,
            LoadMode::Float => {
                let vc = volt(x, self.cp) - volt(x, self.cn);
                let on = if vc > self.params.vt + self.params.vh {
                    true
                } else if vc < self.params.vt - self.params.vh {
                    false
                } else {
                    stored != 0.0
                };
                // swload.c: a state change forces one more iteration.
                limited = on != (stored != 0.0);
                on
            }
            // AC: the switch keeps the state the operating point left.
            LoadMode::Exact | LoadMode::SmallSignal => stored != 0.0,
        };
        if ctx.mode.writes_state()
            && let Some(s) = state.first_mut()
        {
            *s = if on { 1.0 } else { 0.0 };
        }
        let g = if on {
            self.params.g_on
        } else {
            self.params.g_off
        };
        sys.add_a(self.p, self.p, g);
        sys.add_a(self.p, self.n, -g);
        sys.add_a(self.n, self.p, -g);
        sys.add_a(self.n, self.n, g);
        limited
    }

    /// Linear interpolation of `v_c` to the threshold it crossed: `VT + VH`
    /// going on, `VT - VH` going off.
    fn crossing(
        &self,
        x_prev: &[f64],
        x_new: &[f64],
        state_prev: &[f64],
        state_new: &[f64],
    ) -> Option<f64> {
        let was_on = state_prev.first().copied().unwrap_or(0.0) != 0.0;
        let is_on = state_new.first().copied().unwrap_or(0.0) != 0.0;
        if was_on == is_on {
            return None;
        }
        let threshold = if is_on {
            self.params.vt + self.params.vh
        } else {
            self.params.vt - self.params.vh
        };
        let v0 = volt(x_prev, self.cp) - volt(x_prev, self.cn);
        let v1 = volt(x_new, self.cp) - volt(x_new, self.cn);
        let span = v1 - v0;
        if span == 0.0 {
            return Some(1.0);
        }
        Some(((threshold - v0) / span).clamp(0.0, 1.0))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn switch_jacobian_on_off() {
        let params = SwitchParams {
            vt: 1.0,
            vh: 0.0,
            g_on: 0.1,
            g_off: 1e-9,
        };
        let s = Switch::new("S1".into(), [Some(0), None], [Some(1), None], params);
        let ctx = LoadContext::new(LoadMode::Exact);
        // Current into the switch at output voltage v, from the stamp.
        let current = |state: f64, v: f64| {
            let mut sys = RealSystem::new(2);
            let mut st = [state];
            s.load(&[v, 5.0], &mut st, &ctx, &mut sys);
            assert_eq!(st, [state], "Exact mode leaves state alone");
            sys.a.get(0, 0) * v - sys.b[0]
        };
        for (state, g) in [(1.0, 0.1), (0.0, 1e-9)] {
            let h = 1e-3;
            let fd = (current(state, 2.0 + h) - current(state, 2.0 - h)) / (2.0 * h);
            let mut sys = RealSystem::new(2);
            s.load(&[2.0, 5.0], &mut [state], &ctx, &mut sys);
            let stamped = sys.a.get(0, 0);
            assert_eq!(stamped, g);
            assert!(
                (fd - stamped).abs() <= 1e-5 * stamped.abs() + 1e-15,
                "fd {fd} vs {stamped}"
            );
        }
    }

    #[test]
    fn crossing_interpolates_the_crossed_threshold() {
        let params = SwitchParams {
            vt: 1.0,
            vh: 0.5,
            g_on: 1.0,
            g_off: 1e-12,
        };
        let s = Switch::new("S1".into(), [Some(0), None], [Some(1), None], params);
        let at = |vc: f64| [0.0, vc];
        // Off to on crosses 1.5 V: from 0 V to 3 V that is halfway.
        let up = s.crossing(&at(0.0), &at(3.0), &[0.0], &[1.0]);
        assert_eq!(up, Some(0.5));
        // On to off crosses 0.5 V: from 2 V to -1 V that is half.
        let down = s.crossing(&at(2.0), &at(-1.0), &[1.0], &[0.0]);
        assert_eq!(down, Some(0.5));
        assert_eq!(s.crossing(&at(0.0), &at(3.0), &[0.0], &[0.0]), None);
    }

    #[test]
    fn float_changes_state_and_reports_limited() {
        let params = SwitchParams {
            vt: 1.0,
            vh: 0.5,
            g_on: 1.0,
            g_off: 1e-12,
        };
        let s = Switch::new("S1".into(), [Some(0), None], [Some(1), None], params);
        let ctx = LoadContext::new(LoadMode::Float);
        let mut state = [0.0];
        let run =
            |vc: f64, state: &mut [f64]| s.load(&[0.0, vc], state, &ctx, &mut RealSystem::new(2));
        assert!(!run(1.2, &mut state), "in band keeps off");
        assert!(run(2.0, &mut state), "off to on is limited");
        assert_eq!(state, [1.0]);
        assert!(!run(1.2, &mut state), "in band keeps on");
        assert!(run(0.0, &mut state));
        assert_eq!(state, [0.0]);
    }
}
