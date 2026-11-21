//! Junction diode (docs/reference/devices.md section 1).
//!
//! Loading follows ngspice `dioload.c`; the convergence test follows
//! `dioconv.c`. With `RS > 0` the junction sits between an internal node and
//! the cathode, and `1/RS` is stamped between the anode and the internal node.

use std::f64::consts::E;

use super::constants::VT;
use super::limit::pnjlim;
use super::{Device, LoadContext, LoadMode, volt};
use crate::analysis::integrate::integrate;
use crate::error::Error;
use crate::ir::{Model, param};
use crate::mna::RealSystem;

/// DC parameters of a diode model.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DiodeParams {
    /// Saturation current `IS` in amperes.
    pub is: f64,
    /// Emission coefficient `N`.
    pub n: f64,
    /// Series resistance `RS` in ohms.
    pub rs: f64,
    /// Zero-bias junction capacitance `CJO` in farads.
    pub cjo: f64,
    /// Junction potential `VJ` in volts.
    pub vj: f64,
    /// Grading coefficient `M`.
    pub m: f64,
    /// Forward-bias depletion capacitance coefficient `FC`.
    pub fc: f64,
    /// Transit time `TT` in seconds.
    pub tt: f64,
}

impl DiodeParams {
    /// Reads `IS`, `N` and `RS` from a model, with the table defaults.
    pub fn from_model(model: &Model) -> Result<Self, Error> {
        Ok(Self {
            is: param(model, "IS")?,
            n: param(model, "N")?,
            rs: param(model, "RS")?,
            cjo: param(model, "CJO")?,
            vj: param(model, "VJ")?,
            m: param(model, "M")?,
            fc: param(model, "FC")?,
            tt: param(model, "TT")?,
        })
    }

    /// `N * VT`, the junction thermal voltage.
    pub fn vte(&self) -> f64 {
        self.n * VT
    }

    /// The voltage above which pnjlim limits: `vt ln(vt / (sqrt(2) IS))`.
    pub fn vcrit(&self) -> f64 {
        let vt = self.vte();
        vt * (vt / (std::f64::consts::SQRT_2 * self.is)).ln()
    }
}

/// Current and conductance of one junction with saturation current `is` and
/// `nvt = N * VT`, both regions of devices.md section 1, without `gmin`
/// (`dioload.c`, `bjtload.c`): the exponential for `v >= -3 nvt`, the cubic
/// `-IS (1 + arg)` form below.
pub(crate) fn junction(v: f64, is: f64, nvt: f64) -> (f64, f64) {
    if v >= -3.0 * nvt {
        let ev = (v / nvt).exp();
        (is * (ev - 1.0), is * ev / nvt)
    } else {
        let arg = 3.0 * nvt / (v * E);
        let arg = arg * arg * arg;
        (-is * (1.0 + arg), is * 3.0 * arg / v)
    }
}

/// Junction current and conductance at `vd`, `gmin` included (`dioload.c`).
pub fn eval(vd: f64, p: &DiodeParams, gmin: f64) -> (f64, f64) {
    let (cdb, gdb) = junction(vd, p.is, p.vte());
    (cdb + gmin * vd, gdb + gmin)
}

/// Charge and capacitance at junction voltage `vd`: depletion plus
/// diffusion (`dioload.c`, charge block; `DIOtF1`, `DIOtF2`, `DIOtF3` and
/// `DIOtDepCap` from `diotemp.c`). The diffusion terms are `TT * cd` and
/// `TT * gd`, with `cd` and `gd` including the `gmin` term as in `dioload.c`.
/// Returns `(Q, C)`.
pub fn charge(vd: f64, p: &DiodeParams, gmin: f64) -> (f64, f64) {
    let (depl_charge, depl_cap) = depletion(vd, p.cjo, p.vj, p.m, p.fc);
    let (cd, gd) = eval(vd, p, gmin);
    (p.tt * cd + depl_charge, p.tt * gd + depl_cap)
}

/// Depletion charge and capacitance of one junction with zero-bias
/// capacitance `cj`, potential `vj`, grading `m` and coefficient `fc`:
/// the power law below `fc vj` and its linear continuation above
/// (`dioload.c`, `bjtload.c`; `f1`, `f2`, `f3` and the `fc vj` breakpoint from
/// `diotemp.c`, `bjttemp.c`). Returns `(Q, C)`.
pub(crate) fn depletion(v: f64, cj: f64, vj: f64, m: f64, fc: f64) -> (f64, f64) {
    let xfc = (1.0 - fc).ln();
    let f1 = vj * (1.0 - ((1.0 - m) * xfc).exp()) / (1.0 - m);
    let f2 = ((1.0 + m) * xfc).exp();
    let f3 = 1.0 - fc * (1.0 + m);
    let dep_cap = fc * vj;
    if v < dep_cap {
        let arg = 1.0 - v / vj;
        let sarg = (-m * arg.ln()).exp();
        (vj * cj * (1.0 - arg * sarg) / (1.0 - m), cj * sarg)
    } else {
        let czof2 = cj / f2;
        (
            cj * f1 + czof2 * (f3 * (v - dep_cap) + (m / (vj + vj)) * (v * v - dep_cap * dep_cap)),
            czof2 * (f3 + m * v / vj),
        )
    }
}

/// State layout: junction voltage, current, conductance (the DC values, the
/// charge current is not included), then the charge `Q_d` and its current.
const STATE_V: usize = 0;
const STATE_I: usize = 1;
const STATE_G: usize = 2;
const STATE_Q: usize = 3;
const STATE_LEN: usize = 5;

#[derive(Debug)]
pub struct Diode {
    name: String,
    anode: Option<usize>,
    /// Anode, or the internal node when `RS > 0`.
    prime: Option<usize>,
    cathode: Option<usize>,
    params: DiodeParams,
    /// `gmin` used by `init_charges`, which has no `LoadContext`. `load` uses
    /// the context's value.
    gmin: f64,
}

impl Diode {
    pub fn new(
        name: String,
        anode: Option<usize>,
        internal: Option<usize>,
        cathode: Option<usize>,
        params: DiodeParams,
    ) -> Self {
        Self {
            name,
            anode,
            prime: internal.or(anode),
            cathode,
            params,
            gmin: crate::ir::DEFAULT_GMIN,
        }
    }

    /// Sets the `gmin` that `init_charges` adds to the diffusion charge, the
    /// circuit's option value.
    pub fn with_gmin(mut self, gmin: f64) -> Self {
        self.gmin = gmin;
        self
    }
}

impl Device for Diode {
    fn name(&self) -> &str {
        &self.name
    }

    fn state_len(&self) -> usize {
        STATE_LEN
    }

    fn charge_slots(&self) -> &'static [usize] {
        &[STATE_Q]
    }

    /// Stores `Q_d` at the junction voltage of the solution `x`. A diode has
    /// no device `ic`, so `uic` changes nothing.
    fn init_charges(&self, x: &[f64], state: &mut [f64], _uic: bool) {
        let vd = volt(x, self.prime) - volt(x, self.cathode);
        let (q, _) = charge(vd, &self.params, self.gmin);
        if let Some([q_slot, i_slot]) = state.get_mut(STATE_Q..STATE_Q + 2) {
            *q_slot = q;
            *i_slot = 0.0;
        }
    }

    fn load(&self, x: &[f64], state: &mut [f64], ctx: &LoadContext, sys: &mut RealSystem) -> bool {
        let p = &self.params;
        let vnew = volt(x, self.prime) - volt(x, self.cathode);
        let (vd, limited) = match ctx.mode {
            LoadMode::InitJunction => (p.vcrit(), false),
            LoadMode::Float => {
                let vold = state.get(STATE_V).copied().unwrap_or(0.0);
                pnjlim(vnew, vold, p.vte(), p.vcrit())
            }
            LoadMode::Exact => (vnew, false),
            // dioacld.c reads the junction voltage stored by the last load.
            LoadMode::SmallSignal => (state.get(STATE_V).copied().unwrap_or(0.0), false),
        };
        let (mut id, mut gd) = eval(vd, p, ctx.gmin);
        if ctx.mode.writes_state()
            && let [v, i, g, ..] = state
        {
            *v = vd;
            *i = id;
            *g = gd;
        }
        // Transient charge block of dioload.c: Q_d at the limited voltage,
        // integrated, with `gd += geq` and `cd += i_q`. The first-iteration
        // MODEINITTRAN special case (state1 = state0, so no charge current)
        // has no counterpart here: the driver seeds the history from
        // `init_charges` (Q_d at the operating point), which gives the same
        // first step.
        if let Some(tran) = &ctx.tran {
            let (q, cap) = charge(vd, p, ctx.gmin);
            match state.get_mut(STATE_Q) {
                Some(slot) => *slot = q,
                None => {
                    sys.fault(Error::Internal(format!("{}: empty state", self.name)));
                    return false;
                }
            }
            match integrate(&tran.coeffs, state, tran.hist, STATE_Q, cap) {
                Ok((geq, _)) => {
                    gd += geq;
                    id += state.get(STATE_Q + 1).copied().unwrap_or(0.0);
                }
                Err(e) => {
                    sys.fault(e);
                    return false;
                }
            }
        }
        if p.rs > 0.0 {
            let grs = 1.0 / p.rs;
            sys.add_a(self.anode, self.anode, grs);
            sys.add_a(self.anode, self.prime, -grs);
            sys.add_a(self.prime, self.anode, -grs);
            sys.add_a(self.prime, self.prime, grs);
        }
        let ieq = id - gd * vd;
        sys.add_a(self.prime, self.prime, gd);
        sys.add_a(self.prime, self.cathode, -gd);
        sys.add_a(self.cathode, self.prime, -gd);
        sys.add_a(self.cathode, self.cathode, gd);
        sys.add_b(self.prime, -ieq);
        sys.add_b(self.cathode, ieq);
        limited
    }

    /// Stamps the junction capacitance between the junction node and the
    /// cathode (`dioacld.c`), at the voltage stored by the last Newton load.
    fn load_reactive(&self, _x: &[f64], state: &[f64], ctx: &LoadContext, c: &mut RealSystem) {
        let vd = state.get(STATE_V).copied().unwrap_or(0.0);
        let (_, cap) = charge(vd, &self.params, ctx.gmin);
        c.add_a(self.prime, self.prime, cap);
        c.add_a(self.prime, self.cathode, -cap);
        c.add_a(self.cathode, self.prime, -cap);
        c.add_a(self.cathode, self.cathode, cap);
    }

    /// Deliberately differs from `dioconv.c`, which compares the prediction
    /// with the stored current. Here the prediction is compared with the
    /// current recomputed at the new junction voltage, as docs/reference/
    /// numerical-methods.md section 1.2 rules. Do not change it back.
    fn converged(&self, x: &[f64], state: &[f64], ctx: &LoadContext) -> bool {
        let (Some(&vd), Some(&id), Some(&gd)) =
            (state.get(STATE_V), state.get(STATE_I), state.get(STATE_G))
        else {
            return true;
        };
        let vnew = volt(x, self.prime) - volt(x, self.cathode);
        let predicted = id + gd * (vnew - vd);
        let (recomputed, _) = eval(vnew, &self.params, ctx.gmin);
        let tol = ctx.reltol * predicted.abs().max(recomputed.abs()) + ctx.abstol;
        (predicted - recomputed).abs() <= tol
    }
}
