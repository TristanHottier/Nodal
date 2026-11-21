//! Numerical integration of charge and flux states, and the truncation-error
//! step proposal (numerical-methods.md sections 2 and 3).
//!
//! Ports of ngspice `maths/ni/nicomcof.c` (`NIcomCof`), `maths/ni/niinteg.c`
//! (`NIintegrate`) and `spicelib/analysis/cktterr.c` (`CKTterr`; identical in ngspice-42 for orders 1 and 2).
//!
//! Index mapping. ngspice keeps `CKTstates[k]` with `state0` the iterate at
//! t_{n+1} and `state1`, `state2`, ... the accepted levels at t_n, t_{n-1}, ....
//! Here `state` is the device slice for t_{n+1} (`state0`), `hist[j]` is the
//! accepted level at t_{n-j} (`state(j+1)` in ngspice), and for the truncation
//! error `levels[0]` is the new state and `levels[k]` equals `hist[k-1]`. The
//! charge at slot `q` is followed by its current at slot `q + 1`, as in ngspice
//! (`ccap = qcap + 1`). ngspice's `CKTdeltaOld[i]` is the step ending at t_{n+1-i},
//! so `h[i]` here is `CKTdeltaOld[i]`, and `CKTdelta` is `h[0]`.

use crate::error::Error;
use crate::ir::Method;

fn slot(level: &[f64], idx: usize, who: &str) -> Result<f64, Error> {
    level.get(idx).copied().ok_or_else(|| {
        Error::Internal(format!(
            "{who}: charge slot {idx} outside a state of length {}",
            level.len()
        ))
    })
}

/// Number of machine epsilons of relative error assumed in a junction charge.
const CHARGE_NOISE: f64 = 32.0;

/// Rounding allowance of a charge current `a0 (q - q_n) - ...` (see
/// `Diode::converged`): `a0` times the rounding of the charges, enlarged by
/// the evaluation of the junction exponential.
pub(crate) fn charge_rounding(c: &Coeffs, q: f64, q_n: f64) -> f64 {
    CHARGE_NOISE * f64::EPSILON * c.ag()[0].abs() * (q.abs() + q_n.abs())
}

/// Integration coefficients: `i_{n+1} = ag[0] q_{n+1} + ag[1] q_n + ag[2] q_{n-1}`
/// (trapezoidal order 2 adds the `-ag[1] i_n` term instead, see [`integrate`]).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Coeffs {
    method: Method,
    order: usize,
    ag: [f64; 3],
}

/// Trapezoidal weight, ngspice `CKTxmu` default.
const XMU: f64 = 0.5;

impl Coeffs {
    /// Port of `NIcomCof` for orders 1 and 2. `h = [h_n, h_{n-1}]` where
    /// `h_n = t_{n+1} - t_n`. An order outside 1..=2 is an error (ngspice `E_ORDER`).
    pub fn new(method: Method, order: usize, h: [f64; 2]) -> Result<Coeffs, Error> {
        if !(1..=2).contains(&order) {
            return Err(Error::Internal(format!(
                "Coeffs::new: illegal integration order {order}"
            )));
        }
        let mut ag = [0.0; 3];
        match method {
            Method::Trap => {
                if order == 1 {
                    ag[0] = 1.0 / h[0];
                    ag[1] = -1.0 / h[0];
                } else {
                    ag[0] = 1.0 / h[0] / (1.0 - XMU);
                    ag[1] = XMU / (1.0 - XMU);
                }
            }
            Method::Gear => {
                // Solve sum_i ag[i] t_i^j = rhs_j with t_i = (h_{n}+...+h_{n-i+1})/h_n,
                // rhs = (0, -1/h_n, 0): the Vandermonde system of nicomcof.c.
                let mut mat = [[0.0_f64; 3]; 3];
                ag[1] = -1.0 / h[0];
                for entry in mat[0].iter_mut().take(order + 1) {
                    *entry = 1.0;
                }
                let mut arg = 0.0;
                for i in 1..=order {
                    arg += h[i - 1];
                    let mut arg1 = 1.0;
                    for row in mat.iter_mut().take(order + 1).skip(1) {
                        arg1 *= arg / h[0];
                        row[i] = arg1;
                    }
                }
                // LU decomposition (column 0 is the special case 1, 0, 0).
                for i in 1..=order {
                    for j in (i + 1)..=order {
                        mat[j][i] /= mat[i][i];
                        for k in (i + 1)..=order {
                            mat[j][k] -= mat[j][i] * mat[i][k];
                        }
                    }
                }
                // Forward substitution.
                for i in 1..=order {
                    for j in (i + 1)..=order {
                        ag[j] -= mat[j][i] * ag[i];
                    }
                }
                // Backward substitution.
                ag[order] /= mat[order][order];
                for i in (0..order).rev() {
                    for j in (i + 1)..=order {
                        ag[i] -= mat[i][j] * ag[j];
                    }
                    ag[i] /= mat[i][i];
                }
            }
        }
        Ok(Coeffs { method, order, ag })
    }

    pub fn method(&self) -> Method {
        self.method
    }

    pub fn order(&self) -> usize {
        self.order
    }

    pub fn ag(&self) -> [f64; 3] {
        self.ag
    }
}

/// Port of `NIintegrate`. Reads `state[q]` (`q_{n+1}`), `hist[j][q]` (`q_{n-j}`)
/// and, for trapezoidal order 2, `hist[0][q + 1]` (`i_n`). Writes
/// `state[q + 1] = i_{n+1}` and returns `(geq, ceq)` for a capacitance `cap`.
/// A state or history slice too short for the slots it needs is an
/// `Error::Internal`.
pub(crate) fn integrate(
    c: &Coeffs,
    state: &mut [f64],
    hist: [&[f64]; 3],
    q: usize,
    cap: f64,
) -> Result<(f64, f64), Error> {
    const WHO: &str = "integrate";
    let q0 = slot(state, q, WHO)?;
    slot(state, q + 1, WHO)?;
    let i_new = match (c.method, c.order) {
        (Method::Trap, 1) | (Method::Gear, 1) => c.ag[0] * q0 + c.ag[1] * slot(hist[0], q, WHO)?,
        (Method::Trap, _) => {
            -slot(hist[0], q + 1, WHO)? * c.ag[1] + c.ag[0] * (q0 - slot(hist[0], q, WHO)?)
        }
        (Method::Gear, _) => {
            c.ag[0] * q0 + c.ag[1] * slot(hist[0], q, WHO)? + c.ag[2] * slot(hist[1], q, WHO)?
        }
    };
    state[q + 1] = i_new;
    Ok((c.ag[0] * cap, i_new - c.ag[0] * q0))
}

/// Tolerances for [`truncation`].
#[derive(Debug, Clone, Copy)]
pub struct TruncOpts {
    pub reltol: f64,
    pub abstol: f64,
    pub chgtol: f64,
    pub trtol: f64,
}

const GEAR_COEFF: [f64; 2] = [0.5, 0.2222222222];
const TRAP_COEFF: [f64; 2] = [0.5, 0.08333333333];

/// Port of `CKTterr` for one charge slot `q`: the largest step the local
/// truncation error allows. `levels[0]` is the new state, `levels[1..=3]` the
/// accepted levels at t_n, t_{n-1}, t_{n-2}; `h = [h_n, h_{n-1}, h_{n-2}]`.
/// The caller takes the minimum with the current step, as ngspice does.
/// A level too short for the slots it needs is an `Error::Internal`.
pub(crate) fn truncation(
    c: &Coeffs,
    q: usize,
    levels: [&[f64]; 4],
    h: [f64; 3],
    o: &TruncOpts,
) -> Result<f64, Error> {
    const WHO: &str = "truncation";
    let at = |k: usize, idx: usize| slot(levels[k], idx, WHO);
    let order = c.order;
    let volttol = o.abstol + o.reltol * at(0, q + 1)?.abs().max(at(1, q + 1)?.abs());
    let chargetol = at(0, q)?.abs().max(at(1, q)?.abs());
    let chargetol = o.reltol * chargetol.max(o.chgtol) / h[0];
    let tol = volttol.max(chargetol);

    // Divided differences, exactly as cktterr.c.
    let mut diff = [0.0_f64; 4];
    for (i, d) in diff.iter_mut().enumerate().take(order + 2) {
        *d = at(i, q)?;
    }
    let mut deltmp = [0.0_f64; 3];
    deltmp[..=order].copy_from_slice(&h[..=order]);
    let mut j = order as isize;
    loop {
        for i in 0..=(j as usize) {
            diff[i] = (diff[i] - diff[i + 1]) / deltmp[i];
        }
        j -= 1;
        if j < 0 {
            break;
        }
        for i in 0..=(j as usize) {
            deltmp[i] = deltmp[i + 1] + h[i];
        }
    }
    let factor = match c.method {
        Method::Gear => GEAR_COEFF[order - 1],
        Method::Trap => TRAP_COEFF[order - 1],
    };
    let del = o.trtol * tol / o.abstol.max(factor * diff[0].abs());
    Ok(if order == 2 { del.sqrt() } else { del })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn close(a: f64, b: f64, rel: f64) -> bool {
        (a - b).abs() <= rel * a.abs().max(b.abs())
    }

    #[test]
    fn bdf2_constant_step() -> Result<(), Error> {
        let h = 3e-7;
        let c = Coeffs::new(Method::Gear, 2, [h, h])?;
        let want = [1.5 / h, -2.0 / h, 0.5 / h];
        for (k, w) in want.iter().enumerate() {
            assert!(
                close(c.ag()[k], *w, 1e-15),
                "ag[{k}]={} want {w}",
                c.ag()[k]
            );
        }
        Ok(())
    }

    #[test]
    fn bdf2_variable_step() -> Result<(), Error> {
        for rho in [0.5_f64, 3.0] {
            let hp = 1e-6;
            let h = rho * hp;
            let c = Coeffs::new(Method::Gear, 2, [h, hp])?;
            let (q1, q0, qm) = (0.7, 0.4, -0.2);
            let mut state = [q1, 0.0];
            let h0 = [q0, 0.0];
            let h1 = [qm, 0.0];
            let h2 = [0.0, 0.0];
            let (geq, ceq) = integrate(&c, &mut state, [&h0, &h1, &h2], 0, 5.0)?;
            let want = ((1.0 + 2.0 * rho) / (1.0 + rho) * q1 - (1.0 + rho) * q0
                + rho * rho / (1.0 + rho) * qm)
                / h;
            assert!(
                close(state[1], want, 1e-12),
                "rho={rho}: {} vs {want}",
                state[1]
            );
            let ag0 = (1.0 + 2.0 * rho) / ((1.0 + rho) * h);
            assert!(close(geq, ag0 * 5.0, 1e-12));
            assert!(close(ceq, want - ag0 * q1, 1e-9));
        }
        Ok(())
    }

    #[test]
    fn trap_matches_mna_closed_form() -> Result<(), Error> {
        let (cap, h) = (2e-6, 1e-6);
        let c = Coeffs::new(Method::Trap, 2, [h, h])?;
        let (v_n, i_n, v_new) = (1.3, 0.25, 1.7);
        let mut state = [cap * v_new, 0.0];
        let hist0 = [cap * v_n, i_n];
        let z = [0.0, 0.0];
        let (geq, ceq) = integrate(&c, &mut state, [&hist0, &z, &z], 0, cap)?;
        assert!(close(geq, 2.0 * cap / h, 1e-14));
        // mna.md section 3: ceq = -(2C/h v_n + i_n) is the source at v = 0;
        // the integrator's ceq is relative to the iterate: i_{n+1} - geq v_{n+1}.
        let want_at_zero = -(2.0 * cap / h * v_n + i_n);
        assert!(close(ceq, want_at_zero, 1e-12), "{ceq} vs {want_at_zero}");
        Ok(())
    }

    #[test]
    fn backward_euler_order_one() -> Result<(), Error> {
        let (cap, h, v_n) = (2e-6, 1e-6, 1.3);
        for m in [Method::Trap, Method::Gear] {
            let c = Coeffs::new(m, 1, [h, h])?;
            let mut state = [cap * 0.0, 0.0];
            let hist0 = [cap * v_n, 0.0];
            let z = [0.0, 0.0];
            let (geq, ceq) = integrate(&c, &mut state, [&hist0, &z, &z], 0, cap)?;
            assert!(close(geq, cap / h, 1e-14));
            assert!(close(ceq, -cap / h * v_n, 1e-12));
        }
        Ok(())
    }

    fn opts() -> TruncOpts {
        TruncOpts {
            reltol: 1e-3,
            abstol: 1e-12,
            chgtol: 1e-14,
            trtol: 7.0,
        }
    }

    #[test]
    fn truncation_exact_on_cubic() -> Result<(), Error> {
        let t: [f64; 4] = [5.0e-6, 3.5e-6, 2.0e-6, 1.1e-6]; // t_{n+1}, t_n, t_{n-1}, t_{n-2}
        let h = [t[0] - t[1], t[1] - t[2], t[2] - t[3]];
        let i_new: f64 = 2.0e-3;
        let i_old: f64 = 1.5e-3;
        let l0 = [t[0].powi(3), i_new];
        let l1 = [t[1].powi(3), i_old];
        let l2 = [t[2].powi(3), 0.0];
        let l3 = [t[3].powi(3), 0.0];
        let c = Coeffs::new(Method::Trap, 2, [h[0], h[1]])?;
        let o = opts();
        let got = truncation(&c, 0, [&l0, &l1, &l2, &l3], h, &o)?;
        let volttol = o.abstol + o.reltol * i_new.max(i_old);
        let chargetol = o.reltol * l0[0].abs().max(l1[0].abs()).max(o.chgtol) / h[0];
        let tol = volttol.max(chargetol);
        let want = (o.trtol * tol / o.abstol.max(1.0 / 12.0 * 1.0)).sqrt();
        assert!(close(got, want, 1e-6), "{got} vs {want}");
        Ok(())
    }

    #[test]
    fn truncation_large_for_constant_charge() -> Result<(), Error> {
        let h = [1e-6, 1e-6, 1e-6];
        // q = 1.0 C: for a tiny charge abstol caps the proposal, so the
        // 1e10*h bound only holds when the charge tolerance dominates.
        let l = [1.0, 0.0];
        let c = Coeffs::new(Method::Trap, 2, [h[0], h[1]])?;
        let got = truncation(&c, 0, [&l, &l, &l, &l], h, &opts())?;
        assert!(got >= 1e10 * h[0], "{got}");
        Ok(())
    }

    #[test]
    fn illegal_order_is_an_error() {
        for order in [0, 3] {
            assert!(matches!(
                Coeffs::new(Method::Trap, order, [1e-6, 1e-6]),
                Err(Error::Internal(_))
            ));
        }
    }

    #[test]
    fn short_slices_are_errors() -> Result<(), Error> {
        let h = [1e-6; 3];
        let c = Coeffs::new(Method::Trap, 2, [h[0], h[1]])?;
        let z = [0.0, 0.0];
        let mut short = [0.0];
        let r = integrate(&c, &mut short, [&z, &z, &z], 0, 1.0);
        assert!(
            matches!(&r, Err(Error::Internal(m)) if m.contains("charge slot 1 outside a state of length 1"))
        );
        let mut state = [0.0, 0.0];
        let r = integrate(&c, &mut state, [&[0.0], &z, &z], 0, 1.0);
        assert!(matches!(r, Err(Error::Internal(_))));
        let r = truncation(&c, 0, [&z, &z, &z, &[]], h, &opts());
        assert!(matches!(&r, Err(Error::Internal(m)) if m.contains("truncation")));
        Ok(())
    }
}
