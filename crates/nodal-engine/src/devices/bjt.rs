//! Bipolar transistor, Gummel-Poon transport subset (docs/reference/
//! devices.md section 2).
//!
//! Loading follows ngspice `bjtload.c`; the convergence test follows
//! `bjtconv.c`, with the deliberate difference noted on `Device::converged`.
//! Only the terminal nodes exist: `RB = RC = RE = 0`, there is no
//! quasi-saturation, and the substrate node is ground (the default vertical
//! device for NPN, lateral for PNP), so the only substrate term is `gmin`
//! from the collector (NPN) or the base (PNP) to ground.

use super::constants::VT;
use super::diode::{depletion, junction};
use super::limit::pnjlim;
use super::{Device, LoadContext, LoadMode, volt};
use crate::analysis::integrate::integrate;
use crate::error::Error;
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
    /// Zero-bias base-emitter depletion capacitance `CJE` in farads.
    pub cje: f64,
    /// Base-emitter junction potential `VJE` in volts.
    pub vje: f64,
    /// Base-emitter grading coefficient `MJE`.
    pub mje: f64,
    /// Zero-bias base-collector depletion capacitance `CJC` in farads.
    pub cjc: f64,
    /// Base-collector junction potential `VJC` in volts.
    pub vjc: f64,
    /// Base-collector grading coefficient `MJC`.
    pub mjc: f64,
    /// Forward transit time `TF` in seconds.
    pub tf: f64,
    /// Reverse transit time `TR` in seconds.
    pub tr: f64,
    /// Forward-bias depletion capacitance coefficient `FC`.
    pub fc: f64,
}

impl BjtParams {
    /// Reads the DC parameters from a model, with the table defaults.
    pub fn from_model(model: &Model) -> Result<Self, Error> {
        Ok(Self {
            is: param(model, "IS")?,
            bf: param(model, "BF")?,
            br: param(model, "BR")?,
            nf: param(model, "NF")?,
            nr: param(model, "NR")?,
            vaf: param(model, "VAF")?,
            cje: param(model, "CJE")?,
            vje: param(model, "VJE")?,
            mje: param(model, "MJE")?,
            cjc: param(model, "CJC")?,
            vjc: param(model, "VJC")?,
            mjc: param(model, "MJC")?,
            tf: param(model, "TF")?,
            tr: param(model, "TR")?,
            fc: param(model, "FC")?,
        })
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

/// Junction charges and their partials, NPN orientation.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BjtCharges {
    /// Base-emitter charge.
    pub qbe: f64,
    /// Base-collector charge.
    pub qbc: f64,
    /// `dQbe/dvbe` (`capbe`).
    pub cbe: f64,
    /// `dQbe/dvbc`, the transcapacitance (`geqcb`).
    pub cbe_vbc: f64,
    /// `dQbc/dvbc` (`capbc`).
    pub cbc: f64,
}

/// NPN charges and capacitances at `(vbe, vbc)` (`bjtload.c`, charge block,
/// with `XTF = 0`, `XCJC = 1` so `czbx = 0`, `CJS = 0`, `PTF = 0`).
///
/// The junction currents and conductances exclude `gmin`, as `cbe`, `gbe`,
/// `cbc`, `gbc` do there. When `TF != 0` and `vbe > 0` the diffusion charge
/// is `TF cbe / qb`, with `gbe / qb` for the capacitance (`dqb/dvbe = 0`
/// because `VAR` is infinite) and the transcapacitance
/// `geqcb = -TF cbe (dqb/dvbc) / qb^2`. Otherwise the diffusion charge is
/// `TF cbe` and `geqcb = 0`. The base-collector diffusion charge is `TR cbc`.
pub fn charges(vbe: f64, vbc: f64, p: &BjtParams) -> BjtCharges {
    let (cbe, gbe) = junction(vbe, p.is, p.vtf());
    let (cbc, gbc) = junction(vbc, p.is, p.vtr());
    let qb = 1.0 / (1.0 - vbc / p.vaf);
    let dqbdvc = qb * qb / p.vaf;
    let (cbe, gbe, geqcb) = if p.tf != 0.0 && vbe > 0.0 {
        let cbe = cbe / qb;
        (cbe, gbe / qb, p.tf * (-cbe * dqbdvc) / qb)
    } else {
        (cbe, gbe, 0.0)
    };
    let (dq_be, dc_be) = depletion(vbe, p.cje, p.vje, p.mje, p.fc);
    let (dq_bc, dc_bc) = depletion(vbc, p.cjc, p.vjc, p.mjc, p.fc);
    BjtCharges {
        qbe: p.tf * cbe + dq_be,
        qbc: p.tr * cbc + dq_bc,
        cbe: p.tf * gbe + dc_be,
        cbe_vbc: geqcb,
        cbc: p.tr * gbc + dc_bc,
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
/// `dic/dvbe`, `dic/dvbc`, `dib/dvbe`, `dib/dvbc` (the DC values, charge
/// currents not included), then the NPN-oriented charges `Q_be` and `Q_bc`,
/// each followed by its current.
const S_VBE: usize = 0;
const S_VBC: usize = 1;
const S_QBE: usize = 8;
const S_QBC: usize = 10;
const STATE_LEN: usize = 12;

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
        STATE_LEN
    }

    fn charge_slots(&self) -> &'static [usize] {
        &[S_QBE, S_QBC]
    }

    /// Stores `Q_be` and `Q_bc` (NPN orientation, so a PNP keeps the sign of
    /// its capacitances) at the junction voltages of `x`. A BJT has no
    /// device `ic`, so `uic` changes nothing.
    fn init_charges(&self, x: &[f64], state: &mut [f64], _uic: bool) {
        let (vbe, vbc) = self.junction_voltages(x);
        let q = charges(self.sign * vbe, self.sign * vbc, &self.params);
        if let Some([qbe, ibe, qbc, ibc]) = state.get_mut(S_QBE..S_QBE + 4) {
            *qbe = q.qbe;
            *qbc = q.qbc;
            *ibe = 0.0;
            *ibc = 0.0;
        }
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
    // The substrate junction is gmin from the substrate connection node to
    // ground (gdsub = gmin, cdsub = gmin vsub with vsub = type (0 - Vsc)); it
    // is linear, so ceqsub = 0 and only the conductance is stamped. ngspice
    // defaults an NPN to the vertical substrate (connection at the
    // collector) and a PNP to the lateral one (connection at the base).
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
            // bjtacld.c reads the junction voltages stored by the last load.
            LoadMode::SmallSignal => (
                (
                    state.get(S_VBE).copied().unwrap_or(0.0),
                    state.get(S_VBC).copied().unwrap_or(0.0),
                ),
                false,
            ),
        };
        let mut e = eval_signed(s, vbe, vbc, p, ctx.gmin);
        if ctx.mode.writes_state()
            && let Some(slots) = state.first_chunk_mut::<8>()
        {
            *slots = [
                vbe, vbc, e.ic, e.ib, e.dic_dvbe, e.dic_dvbc, e.dib_dvbe, e.dib_dvbc,
            ];
        }
        // Transient charge block of bjtload.c (XCJC = 1, CJS = 0, PTF = 0):
        // integrate Qbe and Qbc at the limited voltages, then
        //   gpi += geq_be, gmu += geq_bc, geqcb *= ag[0],
        //   cb += cq_be + cq_bc, cc -= cq_bc.
        // The base row gains dIb/dvbe += geq_be and dIb/dvbc += geq_bc + geqcb,
        // the collector row dIc/dvbc -= geq_bc, as the matrix loads of
        // bjtload.c imply. The charges are NPN-oriented, so the physical
        // currents carry the factor `sign` like Ic and Ib, while the partials
        // (two sign flips) do not. The MODEINITTRAN first-iteration copy of
        // state0 into state1 has no counterpart: the driver seeds the history
        // from `init_charges`.
        if let Some(tran) = &ctx.tran {
            let q = charges(s * vbe, s * vbc, p);
            match state.get_mut(S_QBE..S_QBE + 4) {
                Some([qbe, _, qbc, _]) => {
                    *qbe = q.qbe;
                    *qbc = q.qbc;
                }
                _ => {
                    sys.fault(Error::Internal(format!("{}: short state", self.name)));
                    return false;
                }
            }
            let be = integrate(&tran.coeffs, state, tran.hist, S_QBE, q.cbe);
            let bc = integrate(&tran.coeffs, state, tran.hist, S_QBC, q.cbc);
            match (be, bc) {
                (Ok((geq_be, _)), Ok((geq_bc, _))) => {
                    let cq_be = state.get(S_QBE + 1).copied().unwrap_or(0.0);
                    let cq_bc = state.get(S_QBC + 1).copied().unwrap_or(0.0);
                    let geqcb = q.cbe_vbc * tran.coeffs.ag()[0];
                    e.ib += s * (cq_be + cq_bc);
                    e.ic -= s * cq_bc;
                    e.dib_dvbe += geq_be;
                    e.dib_dvbc += geq_bc + geqcb;
                    e.dic_dvbc -= geq_bc;
                }
                (Err(err), _) | (_, Err(err)) => {
                    sys.fault(err);
                    return false;
                }
            }
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
        // Substrate gmin to ground, from the collector (NPN, vertical) or the
        // base (PNP, lateral).
        let sub = if s > 0.0 { c } else { b };
        sys.add_a(sub, sub, ctx.gmin);
        limited
    }

    /// Stamps the junction capacitances and the transcapacitance in the
    /// pattern of `bjtacld.c` (`xcpi`, `xcmu`, `xcmcb`), at the junction
    /// voltages stored by the last Newton load. A PNP is evaluated at the
    /// negated voltages; the capacitances keep their sign.
    fn load_reactive(&self, _x: &[f64], state: &[f64], _ctx: &LoadContext, c: &mut RealSystem) {
        let s = self.sign;
        let vbe = state.get(S_VBE).copied().unwrap_or(0.0);
        let vbc = state.get(S_VBC).copied().unwrap_or(0.0);
        let q = charges(s * vbe, s * vbc, &self.params);
        let (cpi, cmu, cmcb) = (q.cbe, q.cbc, q.cbe_vbc);
        let (col, b, e) = (self.collector, self.base, self.emitter);
        c.add_a(b, b, cpi + cmu + cmcb);
        c.add_a(b, col, -cmu - cmcb);
        c.add_a(b, e, -cpi);
        c.add_a(col, col, cmu);
        c.add_a(col, b, -cmu);
        c.add_a(e, e, cpi);
        c.add_a(e, col, cmcb);
        c.add_a(e, b, -cpi - cmcb);
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
