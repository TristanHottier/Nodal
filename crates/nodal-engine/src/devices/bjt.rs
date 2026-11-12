//! Bipolar transistor, Gummel-Poon transport subset (docs/reference/
//! devices.md section 2).
//!
//! Loading follows ngspice `bjtload.c`; the convergence test follows
//! `bjtconv.c`, with the deliberate difference noted on `Device::converged`.
//! Only the terminal nodes exist: `RB = RC = RE = 0`, there is no
//! quasi-saturation, and the substrate node is ground (the default vertical
//! device), so the only substrate term is `gmin` from collector to ground.

use std::f64::consts::E;

use super::constants::VT;
use super::limit::pnjlim;
use super::{Device, LoadContext, LoadMode, volt};
use crate::ir::{Model, param};
use crate::mna::RealSystem;

/// DC parameters of a BJT model.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BjtParams {
    /// Transport saturation current `IS` in amperes.
    pub is: f64,
    /// Ideal forward beta `BF`.
    pub bf: f64,
    /// Ideal reverse beta `BR`.
    pub br: f64,
    /// Forward emission coefficient `NF`.
    pub nf: f64,
    /// Reverse emission coefficient `NR`.
    pub nr: f64,
    /// Forward Early voltage `VAF` in volts (infinite when absent).
    pub vaf: f64,
}

impl BjtParams {
    /// Reads the DC parameters from a model, with the table defaults.
    pub fn from_model(model: &Model) -> Self {
        Self {
            is: param(model, "IS"),
            bf: param(model, "BF"),
            br: param(model, "BR"),
            nf: param(model, "NF"),
            nr: param(model, "NR"),
            vaf: param(model, "VAF"),
        }
    }

    /// `NF * VT`.
    fn vtf(&self) -> f64 {
        self.nf * VT
    }

    /// `NR * VT`.
    fn vtr(&self) -> f64 {
        self.nr * VT
    }

    /// Voltage above which pnjlim limits the base-emitter junction.
    pub fn vcrit_be(&self) -> f64 {
        vcrit(self.vtf(), self.is)
    }

    /// Voltage above which pnjlim limits the base-collector junction.
    pub fn vcrit_bc(&self) -> f64 {
        vcrit(self.vtr(), self.is)
    }
}

/// `vt ln(vt / (sqrt(2) IS))`.
fn vcrit(vt: f64, is: f64) -> f64 {
    vt * (vt / (std::f64::consts::SQRT_2 * is)).ln()
}

/// Terminal currents into the collector and base, and their partials with
/// respect to the junction voltages.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BjtEval {
    pub ic: f64,
    pub ib: f64,
    pub dic_dvbe: f64,
    pub dic_dvbc: f64,
    pub dib_dvbe: f64,
    pub dib_dvbc: f64,
}

/// One junction current and conductance, both regions (`bjtload.c`): the
/// exponential for `v >= -3 vt`, the cubic `-IS (1 + arg)` form below.
fn junction(v: f64, is: f64, vt: f64) -> (f64, f64) {
    if v >= -3.0 * vt {
        let ev = (v / vt).exp();
        (is * (ev - 1.0), is * ev / vt)
    } else {
        let arg = 3.0 * vt / (v * E);
        let arg = arg * arg * arg;
        (-is * (1.0 + arg), is * 3.0 * arg / v)
    }
}

/// NPN currents and Jacobian at `(vbe, vbc)`, `gmin` included.
///
/// With `qb = 1 / (1 - vbc / VAF)` (so `dqb/dvbc = qb^2 / VAF`, `dqb/dvbe = 0`)
/// and `cbe`, `cbc` the junction currents with conductances `gbe`, `gbc`:
///
/// ```text
/// Ic = (cbe - cbc) / qb - cbc / BR - gmin vbc
/// Ib = cbe / BF + gmin vbe + cbc / BR + gmin vbc
/// dIc/dvbe = gbe / qb
/// dIc/dvbc = -go - (gbc / BR + gmin),  go = (gbc + (cbe - cbc) dqb/dvbc / qb) / qb
/// dIb/dvbe = gbe / BF + gmin
/// dIb/dvbc = gbc / BR + gmin
/// ```
///
/// These are the `gm`, `go`, `gpi`, `gmu` of `bjtload.c`
/// (`dIc/dvbe = gm + go`, `dIc/dvbc = -(go + gmu)`).
pub fn eval(vbe: f64, vbc: f64, p: &BjtParams, gmin: f64) -> BjtEval {
    let (cbe, gbe) = junction(vbe, p.is, p.vtf());
    let (cbc, gbc) = junction(vbc, p.is, p.vtr());
    let qb = 1.0 / (1.0 - vbc / p.vaf);
    let dqbdvc = qb * qb / p.vaf;
    let cex = cbe - cbc;
    let go = (gbc + cex * dqbdvc / qb) / qb;
    let gmu = gbc / p.br + gmin;
    BjtEval {
        ic: cex / qb - cbc / p.br - gmin * vbc,
        ib: cbe / p.bf + gmin * vbe + cbc / p.br + gmin * vbc,
        dic_dvbe: gbe / qb,
        dic_dvbc: -go - gmu,
        dib_dvbe: gbe / p.bf + gmin,
        dib_dvbc: gmu,
    }
}

/// Evaluates at the physical junction voltages `vbe = Vb - Ve`,
/// `vbc = Vb - Vc` of a device with polarity `sign` (+1 NPN, -1 PNP) and
/// returns the terminal currents. A PNP is the NPN evaluated at
/// `(-vbe, -vbc)` with the currents negated; the partials keep their sign
/// (two sign flips cancel).
pub fn eval_signed(sign: f64, vbe: f64, vbc: f64, p: &BjtParams, gmin: f64) -> BjtEval {
    let e = eval(sign * vbe, sign * vbc, p, gmin);
    BjtEval {
        ic: sign * e.ic,
        ib: sign * e.ib,
        ..e
    }
}

/// State layout: physical `vbe`, `vbc`, terminal currents `ic`, `ib`, then
/// `dic/dvbe`, `dic/dvbc`, `dib/dvbe`, `dib/dvbc`.
const S_VBE: usize = 0;
const S_VBC: usize = 1;

#[derive(Debug)]
pub struct Bjt {
    name: String,
    collector: Option<usize>,
    base: Option<usize>,
    emitter: Option<usize>,
    /// +1 for NPN, -1 for PNP.
    sign: f64,
    params: BjtParams,
}

impl Bjt {
    pub fn new(name: String, nodes: [Option<usize>; 3], pnp: bool, params: BjtParams) -> Self {
        let [collector, base, emitter] = nodes;
        Self {
            name,
            collector,
            base,
            emitter,
            sign: if pnp { -1.0 } else { 1.0 },
            params,
        }
    }

    fn junction_voltages(&self, x: &[f64]) -> (f64, f64) {
        let vb = volt(x, self.base);
        (vb - volt(x, self.emitter), vb - volt(x, self.collector))
    }
}

impl Device for Bjt {
    fn name(&self) -> &str {
        &self.name
    }

    fn state_len(&self) -> usize {
        8
    }

    // Stamp derivation. Terminal currents into the device are Ic, Ib and
    // Ie = -(Ic + Ib), functions of vbe = Vb - Ve and vbc = Vb - Vc. With
    // partials (a, b) = (dIc/dvbe, dIc/dvbc) and (c, d) = (dIb/dvbe, dIb/dvbc):
    //   dIc/dVc = -b      dIc/dVb = a + b      dIc/dVe = -a
    //   dIb/dVc = -d      dIb/dVb = c + d      dIb/dVe = -c
    //   dIe/dV  = -(dIc/dV + dIb/dV)
    // Linearising about (vbe0, vbc0) gives the constants
    //   Ic_eq = Ic - a vbe0 - b vbc0,   Ib_eq = Ib - c vbe0 - d vbc0
    // which move to the right-hand side: b[C] -= Ic_eq, b[B] -= Ib_eq,
    // b[E] += Ic_eq + Ib_eq. This equals the ceqbe/ceqbc loading of bjtload.c.
    // The substrate junction of the default vertical device is gmin from the
    // collector to ground (gdsub = gmin, cdsub = gmin vsub with
    // vsub = type (0 - Vc)); it is linear, so ceqsub = 0 and only the
    // conductance is stamped.
    fn load(&self, x: &[f64], state: &mut [f64], ctx: &LoadContext, sys: &mut RealSystem) -> bool {
        let p = &self.params;
        let s = self.sign;
        let (raw_be, raw_bc) = self.junction_voltages(x);
        let ((vbe, vbc), limited) = match ctx.mode {
            // bjtload.c MODEINITJCT, device not OFF: vbe = tVcrit, vbc = 0.
            LoadMode::InitJunction => ((s * p.vcrit_be(), 0.0), false),
            LoadMode::Float => {
                let old_be = state.get(S_VBE).copied().unwrap_or(0.0);
                let old_bc = state.get(S_VBC).copied().unwrap_or(0.0);
                // Limiting works on NPN-oriented voltages, as in bjtload.c.
                let (be, lim_be) = pnjlim(s * raw_be, s * old_be, p.vtf(), p.vcrit_be());
                let (bc, lim_bc) = pnjlim(s * raw_bc, s * old_bc, p.vtr(), p.vcrit_bc());
                ((s * be, s * bc), lim_be || lim_bc)
            }
            LoadMode::Exact => ((raw_be, raw_bc), false),
        };
        let e = eval_signed(s, vbe, vbc, p, ctx.gmin);
        if ctx.mode != LoadMode::Exact
            && let Some(slots) = state.first_chunk_mut::<8>()
        {
            *slots = [
                vbe, vbc, e.ic, e.ib, e.dic_dvbe, e.dic_dvbc, e.dib_dvbe, e.dib_dvbc,
            ];
        }
        let ic_eq = e.ic - e.dic_dvbe * vbe - e.dic_dvbc * vbc;
        let ib_eq = e.ib - e.dib_dvbe * vbe - e.dib_dvbc * vbc;
        let (c, b, em) = (self.collector, self.base, self.emitter);
        // Rows: collector, base, emitter. Columns: Vc, Vb, Ve.
        let ic_row = [-e.dic_dvbc, e.dic_dvbe + e.dic_dvbc, -e.dic_dvbe];
        let ib_row = [-e.dib_dvbc, e.dib_dvbe + e.dib_dvbc, -e.dib_dvbe];
        let cols = [c, b, em];
        for (k, &col) in cols.iter().enumerate() {
            sys.add_a(c, col, ic_row[k]);
            sys.add_a(b, col, ib_row[k]);
            sys.add_a(em, col, -(ic_row[k] + ib_row[k]));
        }
        sys.add_b(c, -ic_eq);
        sys.add_b(b, -ib_eq);
        sys.add_b(em, ic_eq + ib_eq);
        // Substrate gmin, collector to ground.
        sys.add_a(c, c, ctx.gmin);
        limited
    }

    /// Deliberately differs from `bjtconv.c`, which compares the linear
    /// prediction of `Ic` and `Ib` with the stored currents. Here the
    /// prediction is compared with the currents recomputed at the new
    /// junction voltages, as docs/reference/numerical-methods.md section 1.2
    /// rules, exactly as the diode does. Do not change it back.
    fn converged(&self, x: &[f64], state: &[f64], ctx: &LoadContext) -> bool {
        let Some(&[vbe, vbc, ic, ib, dic_dvbe, dic_dvbc, dib_dvbe, dib_dvbc]) =
            state.first_chunk::<8>()
        else {
            return true;
        };
        let (new_be, new_bc) = self.junction_voltages(x);
        let (dbe, dbc) = (new_be - vbe, new_bc - vbc);
        let cc_hat = ic + dic_dvbe * dbe + dic_dvbc * dbc;
        let cb_hat = ib + dib_dvbe * dbe + dib_dvbc * dbc;
        let e = eval_signed(self.sign, new_be, new_bc, &self.params, ctx.gmin);
        let tol_c = ctx.reltol * cc_hat.abs().max(e.ic.abs()) + ctx.abstol;
        let tol_b = ctx.reltol * cb_hat.abs().max(e.ib.abs()) + ctx.abstol;
        (cc_hat - e.ic).abs() <= tol_c && (cb_hat - e.ib).abs() <= tol_b
    }
}
