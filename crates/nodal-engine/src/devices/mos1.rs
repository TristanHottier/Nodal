//! MOSFET Level 1, Shichman-Hodges (docs/reference/devices.md section 3).
//!
//! Loading follows ngspice `mos1load.c`; the convergence test follows
//! `mos1conv.c`, with the deliberate difference noted on `Device::converged`.
//! There are no bulk junction diodes (docs/reference/devices.md section 5), so
//! only the `gmin` part of the bulk junctions is kept: a conductance from
//! drain to bulk and from source to bulk. There is no `pnjlim` on the bulk
//! voltages. There is no series resistance, so the
//! drain and source nodes are the terminals.

use super::limit::{fetlim, limvds};
use super::{Device, LoadContext, LoadMode, volt};
use crate::ir::{Model, param};
use crate::mna::RealSystem;

/// DC parameters of a MOSFET model. `vto` is the value as written in the
/// model card (negative for an ordinary PMOS).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Mos1Params {
    /// Zero-bias threshold `VTO` in volts.
    pub vto: f64,
    /// Body-effect coefficient `GAMMA` in sqrt(V).
    pub gamma: f64,
    /// Surface potential `PHI` in volts.
    pub phi: f64,
    /// Channel-length modulation `LAMBDA` in 1/V.
    pub lambda: f64,
}

impl Mos1Params {
    /// Reads the DC parameters from a model, with the table defaults.
    pub fn from_model(model: &Model) -> Self {
        Self {
            vto: param(model, "VTO"),
            gamma: param(model, "GAMMA"),
            phi: param(model, "PHI"),
            lambda: param(model, "LAMBDA"),
        }
    }
}

/// Drain current and conductances, in the orientation of the call.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MosEval {
    /// Drain current (into the drain terminal).
    pub id: f64,
    /// `dId/dVgs`.
    pub gm: f64,
    /// `dId/dVds`.
    pub gds: f64,
    /// `dId/dVbs`.
    pub gmbs: f64,
}

/// `sarg` of `mos1load.c` and the derivative `d sarg / d vbx`, for the
/// source-referenced (or, in reverse mode, drain-referenced) bulk voltage.
fn sarg(vbx: f64, p: &Mos1Params) -> (f64, f64) {
    if vbx <= 0.0 {
        let s = (p.phi - vbx).sqrt();
        (s, -0.5 / s)
    } else {
        let sp = p.phi.sqrt();
        let s = sp - vbx / (sp + sp);
        if s > 0.0 { (s, -0.5 / sp) } else { (0.0, 0.0) }
    }
}

/// Threshold voltage `Vth = VTO + gamma (sarg - sqrt(PHI))`, which is
/// `von` of `mos1load.c`, for the NMOS-oriented `vbx`.
pub fn threshold(vbx: f64, p: &Mos1Params) -> f64 {
    p.vto + p.gamma * (sarg(vbx, p).0 - p.phi.sqrt())
}

/// NMOS drain current and conductances for `vds >= 0`, without `gmin`.
///
/// `beta = KP W / L`. Regions and equations are those of `mos1load.c`.
///
/// `gmbs` is the exact derivative `dId/dVbs`, `gm * gamma * (-d sarg / d vbs)`.
/// `mos1load.c` uses `gm * gamma / (2 sarg)` in every branch, which differs
/// for `vbs > 0` (there `d sarg / d vbs = -1 / (2 sqrt(PHI))`); the
/// Jacobian test requires the exact value, and it only changes the Newton
/// matrix, never the solution.
pub fn eval(vgs: f64, vds: f64, vbs: f64, p: &Mos1Params, beta: f64) -> MosEval {
    let (s, ds) = sarg(vbs, p);
    let vgst = vgs - (p.vto + p.gamma * (s - p.phi.sqrt()));
    if vgst <= 0.0 {
        return MosEval {
            id: 0.0,
            gm: 0.0,
            gds: 0.0,
            gmbs: 0.0,
        };
    }
    let betap = beta * (1.0 + p.lambda * vds);
    let (id, gm, gds) = if vgst <= vds {
        // Saturation.
        (
            betap * vgst * vgst * 0.5,
            betap * vgst,
            p.lambda * beta * vgst * vgst * 0.5,
        )
    } else {
        // Triode.
        (
            betap * vds * (vgst - 0.5 * vds),
            betap * vds,
            betap * (vgst - vds) + p.lambda * beta * vds * (vgst - 0.5 * vds),
        )
    };
    MosEval {
        id,
        gm,
        gds,
        gmbs: -gm * p.gamma * ds,
    }
}

/// NMOS-oriented evaluation for either sign of `vds`. For `vds < 0` the
/// drain and source swap (`mos1load.c`, `MOS1mode = -1`): evaluate with
/// `(vgd, -vds, vbd)` and map back. Returns the drain current and its
/// partials with respect to `vgs`, `vds` and `vbs`.
pub fn eval_oriented(vgs: f64, vds: f64, vbs: f64, p: &Mos1Params, beta: f64) -> MosEval {
    if vds >= 0.0 {
        return eval(vgs, vds, vbs, p, beta);
    }
    let r = eval(vgs - vds, -vds, vbs - vds, p, beta);
    MosEval {
        id: -r.id,
        gm: -r.gm,
        gds: r.gm + r.gds + r.gmbs,
        gmbs: -r.gmbs,
    }
}

/// Drain current into the drain terminal of a device with polarity `sign`
/// (+1 NMOS, -1 PMOS) at the physical source-referenced voltages `vgs`,
/// `vds`, `vbs`, with the partials with respect to those voltages. A PMOS
/// is the NMOS evaluated at the negated voltages with `VTO` negated and the
/// current negated; the partials keep their sign (two flips cancel).
pub fn terminal(sign: f64, vgs: f64, vds: f64, vbs: f64, p: &Mos1Params, beta: f64) -> MosEval {
    let q = Mos1Params {
        vto: sign * p.vto,
        ..*p
    };
    let e = eval_oriented(sign * vgs, sign * vds, sign * vbs, &q, beta);
    MosEval {
        id: sign * e.id,
        ..e
    }
}

/// State layout, NMOS-oriented: limited `vgs`, `vds`, `vbs`, the threshold
/// `von`, the drain current, then `dId/dvgs`, `dId/dvds`, `dId/dvbs`.
const S_VGS: usize = 0;
const S_VDS: usize = 1;
const S_VON: usize = 3;
const STATE_LEN: usize = 8;

#[derive(Debug)]
pub struct Mos1 {
    name: String,
    drain: Option<usize>,
    gate: Option<usize>,
    source: Option<usize>,
    bulk: Option<usize>,
    /// +1 NMOS, -1 PMOS.
    sign: f64,
    /// Parameters with `vto` already oriented (`sign * VTO`).
    params: Mos1Params,
    beta: f64,
}

impl Mos1 {
    /// `nodes` is drain, gate, source, bulk; `beta = KP W / L`.
    pub fn new(
        name: String,
        nodes: [Option<usize>; 4],
        pmos: bool,
        params: Mos1Params,
        beta: f64,
    ) -> Self {
        let [drain, gate, source, bulk] = nodes;
        let sign = if pmos { -1.0 } else { 1.0 };
        Self {
            name,
            drain,
            gate,
            source,
            bulk,
            sign,
            params: Mos1Params {
                vto: sign * params.vto,
                ..params
            },
            beta,
        }
    }

    /// NMOS-oriented `(vgs, vds, vbs)` at `x`.
    fn oriented(&self, x: &[f64]) -> (f64, f64, f64) {
        let vs = volt(x, self.source);
        (
            self.sign * (volt(x, self.gate) - vs),
            self.sign * (volt(x, self.drain) - vs),
            self.sign * (volt(x, self.bulk) - vs),
        )
    }

    fn threshold_at(&self, vds: f64, vbs: f64) -> f64 {
        threshold(if vds >= 0.0 { vbs } else { vbs - vds }, &self.params)
    }
}

impl Device for Mos1 {
    fn name(&self) -> &str {
        &self.name
    }

    fn state_len(&self) -> usize {
        STATE_LEN
    }

    // Stamp derivation. The physical drain current is Id = sign * f(vgs, vds,
    // vbs) of the oriented voltages, and its partials A, B, C with respect to
    // the physical source-referenced voltages equal those of f (the signs
    // cancel). With vgs = Vg - Vs, vds = Vd - Vs, vbs = Vb - Vs:
    //   dId/dVd = B   dId/dVg = A   dId/dVb = C   dId/dVs = -(A + B + C)
    // and the constant Id_eq = Id - A vgs - B vds - C vbs moves to the right
    // side: b[D] -= Id_eq, b[S] += Id_eq. The current leaves the source node
    // through the same branch, so the source row is the negated drain row.
    // gmin is stamped drain-bulk and source-bulk (devices.md section 5).
    fn load(&self, x: &[f64], state: &mut [f64], ctx: &LoadContext, sys: &mut RealSystem) -> bool {
        let p = &self.params;
        let (raw_gs, raw_ds, raw_bs) = self.oriented(x);
        let ((vgs, vds, vbs), limited) = match ctx.mode {
            // mos1load.c MODEINITJCT, device not OFF, no ICs.
            LoadMode::InitJunction => ((p.vto, 0.0, -1.0), false),
            LoadMode::Float => {
                let old_gs = state.get(S_VGS).copied().unwrap_or(0.0);
                let old_ds = state.get(S_VDS).copied().unwrap_or(0.0);
                let von = state.get(S_VON).copied().unwrap_or(0.0);
                let raw_gd = raw_gs - raw_ds;
                // devsup.c DEVfetlim / DEVlimvds, in the order of mos1load.c.
                // The unlimited component is kept bit-exact so that
                // "limited" is not set by rounding in vgs - vgd.
                let (gs, ds, lim) = if old_ds >= 0.0 {
                    let gs = fetlim(raw_gs, old_gs, von);
                    let ds_in = if gs == raw_gs { raw_ds } else { gs - raw_gd };
                    let ds = limvds(ds_in, old_ds);
                    (gs, ds, gs != raw_gs || ds != raw_ds)
                } else {
                    let old_gd = old_gs - old_ds;
                    let gd = fetlim(raw_gd, old_gd, von);
                    let ds_in = if gd == raw_gd { raw_ds } else { raw_gs - gd };
                    let ds = -limvds(-ds_in, -old_ds);
                    let gs = if gd == raw_gd && ds == raw_ds {
                        raw_gs
                    } else {
                        gd + ds
                    };
                    (gs, ds, gd != raw_gd || ds != raw_ds)
                };
                // No pnjlim: the bulk voltage keeps its raw source (or drain)
                // referenced value, so vbd - vbs follows the limited vds.
                let bs = if lim && ds < 0.0 {
                    raw_bs - raw_ds + ds
                } else {
                    raw_bs
                };
                ((gs, ds, bs), lim)
            }
            LoadMode::Exact => ((raw_gs, raw_ds, raw_bs), false),
        };
        let e = eval_oriented(vgs, vds, vbs, p, self.beta);
        if ctx.mode != LoadMode::Exact
            && let Some(slots) = state.first_chunk_mut::<STATE_LEN>()
        {
            *slots = [
                vgs,
                vds,
                vbs,
                self.threshold_at(vds, vbs),
                e.id,
                e.gm,
                e.gds,
                e.gmbs,
            ];
        }
        let s = self.sign;
        let id = s * e.id;
        let id_eq = id - e.gm * s * vgs - e.gds * s * vds - e.gmbs * s * vbs;
        let (d, g, src, b) = (self.drain, self.gate, self.source, self.bulk);
        let cols = [
            (d, e.gds),
            (g, e.gm),
            (b, e.gmbs),
            (src, -(e.gm + e.gds + e.gmbs)),
        ];
        for (col, v) in cols {
            sys.add_a(d, col, v);
            sys.add_a(src, col, -v);
        }
        sys.add_b(d, -id_eq);
        sys.add_b(src, id_eq);
        // mos1load.c adds gmin to each bulk junction conductance (gbd, gbs):
        // gmin goes drain-bulk and source-bulk, not drain-source.
        for t in [d, src] {
            sys.add_a(t, t, ctx.gmin);
            sys.add_a(b, b, ctx.gmin);
            sys.add_a(t, b, -ctx.gmin);
            sys.add_a(b, t, -ctx.gmin);
        }
        limited
    }

    /// `mos1conv.c` compares the linear prediction `cdhat` of the drain
    /// current with the stored `cd`, and then the same for the bulk diode
    /// currents. Here the prediction is compared with the drain current
    /// recomputed at the new voltages, as docs/reference/numerical-methods.md
    /// section 1.2 rules, exactly as the diode and BJT do. There is no bulk
    /// diode test because there are no bulk diodes. Do not change it back.
    fn converged(&self, x: &[f64], state: &[f64], ctx: &LoadContext) -> bool {
        let Some(&[vgs, vds, vbs, _, id, gm, gds, gmbs]) = state.first_chunk::<STATE_LEN>() else {
            return true;
        };
        let (ngs, nds, nbs) = self.oriented(x);
        let id_hat = id + gm * (ngs - vgs) + gds * (nds - vds) + gmbs * (nbs - vbs);
        let e = eval_oriented(ngs, nds, nbs, &self.params, self.beta);
        let tol = ctx.reltol * id_hat.abs().max(e.id.abs()) + ctx.abstol;
        (id_hat - e.id).abs() <= tol
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn params() -> Mos1Params {
        Mos1Params {
            vto: 0.7,
            gamma: 0.4,
            phi: 0.65,
            lambda: 0.02,
        }
    }

    /// The stamp in Exact mode equals the Jacobian rows of `terminal`, and
    /// each column sums to zero (the drain and source rows are opposite).
    #[test]
    fn exact_stamp_matches_terminal() {
        // Unknowns: 0 drain, 1 gate, 2 source, 3 bulk.
        let m = Mos1::new(
            "M1".into(),
            [Some(0), Some(1), Some(2), Some(3)],
            false,
            params(),
            1e-3,
        );
        for x in [[1.0, 2.0, 0.5, 0.0], [0.0, 2.0, 0.5, 0.0]] {
            let mut sys = RealSystem::new(4);
            let mut state = [0.0; STATE_LEN];
            let mut ctx = LoadContext::new(LoadMode::Exact);
            ctx.gmin = 0.0;
            assert!(!m.load(&x, &mut state, &ctx, &mut sys));
            assert_eq!(state, [0.0; STATE_LEN]);
            let (vgs, vds, vbs) = (x[1] - x[2], x[0] - x[2], x[3] - x[2]);
            let e = terminal(1.0, vgs, vds, vbs, &params(), 1e-3);
            assert!((sys.a.get(0, 0) - e.gds).abs() < 1e-18);
            assert!((sys.a.get(0, 1) - e.gm).abs() < 1e-18);
            assert!((sys.a.get(0, 3) - e.gmbs).abs() < 1e-18);
            for c in 0..4 {
                assert!((sys.a.get(0, c) + sys.a.get(2, c)).abs() < 1e-18);
            }
            let ieq = e.id - e.gm * vgs - e.gds * vds - e.gmbs * vbs;
            assert!((sys.b[0] + ieq).abs() < 1e-18 && (sys.b[2] - ieq).abs() < 1e-18);
        }
    }

    /// gmin goes drain-bulk and source-bulk, never drain-source.
    #[test]
    fn gmin_is_stamped_on_bulk_junctions() {
        let m = Mos1::new(
            "M1".into(),
            [Some(0), Some(1), Some(2), Some(3)],
            false,
            params(),
            1e-3,
        );
        let mut ctx = LoadContext::new(LoadMode::Exact);
        let mut with = RealSystem::new(4);
        let mut without = RealSystem::new(4);
        let x = [0.0, 0.0, 0.0, 0.0];
        let mut state = [0.0; STATE_LEN];
        assert!(!m.load(&x, &mut state, &ctx, &mut with));
        ctx.gmin = 0.0;
        assert!(!m.load(&x, &mut state, &ctx, &mut without));
        let g = LoadContext::new(LoadMode::Exact).gmin;
        let diff = |r: usize, c: usize| with.a.get(r, c) - without.a.get(r, c);
        assert!((diff(0, 0) - g).abs() < 1e-20 && (diff(0, 3) + g).abs() < 1e-20);
        assert!((diff(2, 2) - g).abs() < 1e-20 && (diff(2, 3) + g).abs() < 1e-20);
        assert!((diff(3, 3) - 2.0 * g).abs() < 1e-20);
        assert!(diff(0, 2).abs() < 1e-20 && diff(2, 0).abs() < 1e-20);
    }

    #[test]
    fn float_limiting_sets_flag_only_when_limited() {
        let m = Mos1::new(
            "M1".into(),
            [Some(0), Some(1), None, None],
            false,
            params(),
            1e-3,
        );
        let ctx = LoadContext::new(LoadMode::Float);
        let mut state = [0.0; STATE_LEN];
        state[S_VON] = 0.7;
        let mut sys = RealSystem::new(2);
        assert!(!m.load(&[0.1, 0.2], &mut state, &ctx, &mut sys));
        let mut state = [0.0; STATE_LEN];
        state[S_VON] = 0.7;
        let mut sys = RealSystem::new(2);
        assert!(m.load(&[9.0, 9.0], &mut state, &ctx, &mut sys));
        assert!(state[S_VDS] <= 4.0);
    }
}
