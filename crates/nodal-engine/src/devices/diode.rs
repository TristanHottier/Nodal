//! Junction diode (docs/reference/devices.md section 1).
//!
//! Loading follows ngspice `dioload.c`; the convergence test follows
//! `dioconv.c`. With `RS > 0` the junction sits between an internal node and
//! the cathode, and `1/RS` is stamped between the anode and the internal node.

use std::f64::consts::E;

use super::constants::VT;
use super::limit::pnjlim;
use super::{Device, LoadContext, LoadMode, volt};
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
}

impl DiodeParams {
    /// Reads `IS`, `N` and `RS` from a model, with the table defaults.
    pub fn from_model(model: &Model) -> Self {
        Self {
            is: param(model, "IS"),
            n: param(model, "N"),
            rs: param(model, "RS"),
        }
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

/// Junction current and conductance at `vd`, both regions of devices.md
/// section 1, `gmin` included (`dioload.c`).
pub fn eval(vd: f64, p: &DiodeParams, gmin: f64) -> (f64, f64) {
    let vte = p.vte();
    let (cdb, gdb) = if vd >= -3.0 * vte {
        let evd = (vd / vte).exp();
        (p.is * (evd - 1.0), p.is * evd / vte)
    } else {
        let arg = 3.0 * vte / (vd * E);
        let arg = arg * arg * arg;
        (-p.is * (1.0 + arg), p.is * 3.0 * arg / vd)
    };
    (cdb + gmin * vd, gdb + gmin)
}

/// State layout: junction voltage, current, conductance.
const STATE_V: usize = 0;
const STATE_I: usize = 1;
const STATE_G: usize = 2;

#[derive(Debug)]
pub struct Diode {
    name: String,
    anode: Option<usize>,
    /// Anode, or the internal node when `RS > 0`.
    prime: Option<usize>,
    cathode: Option<usize>,
    params: DiodeParams,
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
        }
    }
}

impl Device for Diode {
    fn name(&self) -> &str {
        &self.name
    }

    fn state_len(&self) -> usize {
        3
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
        };
        let (id, gd) = eval(vd, p, ctx.gmin);
        if ctx.mode != LoadMode::Exact
            && let [v, i, g, ..] = state
        {
            *v = vd;
            *i = id;
            *g = gd;
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
