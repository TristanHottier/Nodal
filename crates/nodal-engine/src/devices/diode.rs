//! Junction diode (docs/reference/devices.md section 1).
//!
//! Loading follows ngspice `dioload.c`; the convergence test follows
//! `dioconv.c`. With `RS > 0` the junction sits between an internal node and
//! the cathode, and `1/RS` is stamped between the anode and the internal node.

use std::f64::consts::E;

use super::constants::VT;
use super::limit::pnjlim;
use super::{Device, LoadContext, LoadMode, volt};
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
    let xfc = (1.0 - p.fc).ln();
    let f1 = p.vj * (1.0 - ((1.0 - p.m) * xfc).exp()) / (1.0 - p.m);
    let f2 = ((1.0 + p.m) * xfc).exp();
    let f3 = 1.0 - p.fc * (1.0 + p.m);
    let dep_cap = p.fc * p.vj;
    let (depl_charge, depl_cap) = if vd < dep_cap {
        let arg = 1.0 - vd / p.vj;
        let sarg = (-p.m * arg.ln()).exp();
        (
            p.vj * p.cjo * (1.0 - arg * sarg) / (1.0 - p.m),
            p.cjo * sarg,
        )
    } else {
        let czof2 = p.cjo / f2;
        (
            p.cjo * f1
                + czof2
                    * (f3 * (vd - dep_cap) + (p.m / (p.vj + p.vj)) * (vd * vd - dep_cap * dep_cap)),
            czof2 * (f3 + p.m * vd / p.vj),
        )
    };
    let (cd, gd) = eval(vd, p, gmin);
    (p.tt * cd + depl_charge, p.tt * gd + depl_cap)
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
            // dioacld.c reads the junction voltage stored by the last load.
            LoadMode::SmallSignal => (state.get(STATE_V).copied().unwrap_or(0.0), false),
        };
        let (id, gd) = eval(vd, p, ctx.gmin);
        if ctx.mode.writes_state()
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
