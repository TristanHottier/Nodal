//! Finite-difference Jacobian tests (docs/VALIDATION.md section 5).
//!
//! Central differences with step `h`. A case passes when the relative error
//! is at most 1e-5 or the absolute error is at most 1e-15 S.

use nodal_engine::devices::constants::VT;
use nodal_engine::devices::diode::{DiodeParams, eval};

const GMIN: f64 = 1e-12;

fn check(f: impl Fn(f64) -> f64, analytic: f64, v: f64, h: f64) {
    let numeric = (f(v + h) - f(v - h)) / (2.0 * h);
    let abs = (numeric - analytic).abs();
    let rel = abs / numeric.abs().max(analytic.abs());
    assert!(
        rel <= 1e-5 || abs <= 1e-15,
        "v = {v}: analytic {analytic:e}, numeric {numeric:e}, rel {rel:e}, abs {abs:e}"
    );
}

fn params(n: f64) -> DiodeParams {
    DiodeParams {
        is: 1e-14,
        n,
        rs: 0.0,
    }
}

fn diode_case(n: f64, v: f64) {
    let p = params(n);
    let (_, g) = eval(v, &p, GMIN);
    check(|x| eval(x, &p, GMIN).0, g, v, 1e-6 * VT);
}

#[test]
fn diode_reverse() {
    diode_case(1.0, -1.0);
}

#[test]
fn diode_boundary_below() {
    diode_case(1.0, -3.0 * VT - 1e-4);
}

#[test]
fn diode_boundary_above() {
    diode_case(1.0, -3.0 * VT + 1e-4);
}

#[test]
fn diode_weak_forward() {
    diode_case(1.0, 0.3);
}

#[test]
fn diode_strong_forward() {
    diode_case(1.0, 0.8);
}

#[test]
fn diode_n2_forward() {
    diode_case(2.0, 0.9);
}

#[test]
fn diode_current_is_continuous_at_boundary() {
    let p = params(1.0);
    let b = -3.0 * VT;
    let below = eval(b - 1e-12, &p, GMIN).0;
    let above = eval(b + 1e-12, &p, GMIN).0;
    assert!((below - above).abs() <= 1e-20, "{below:e} vs {above:e}");
}

// BJT: all four partials of (ic, ib) against central differences.

use nodal_engine::devices::bjt::{BjtParams, eval as bjt_eval, eval_signed};

fn bjt_params(vaf: f64) -> BjtParams {
    BjtParams {
        is: 1e-16,
        bf: 100.0,
        br: 1.0,
        nf: 1.0,
        nr: 1.0,
        vaf,
    }
}

/// `h_scale` multiplies `VT` to give the step. The brief's 1e-6 suits every
/// case but two: when one junction is strongly on (|I| ~ 5e-5 A) and the
/// partial taken is only gmin-sized (VAF infinite, or the off junction),
/// rounding noise `eps |I| / h` is about 2e-13 S, above the 1e-15 S floor.
/// There the step is 1e-3 VT; truncation error (h/VT)^2/6 stays below 2e-7,
/// well inside the 1e-5 relative tolerance.
fn bjt_case(vbe: f64, vbc: f64, vaf: f64, h_scale: f64) {
    let p = bjt_params(vaf);
    let e = bjt_eval(vbe, vbc, &p, GMIN);
    let h = h_scale * VT;
    check(|x| bjt_eval(x, vbc, &p, GMIN).ic, e.dic_dvbe, vbe, h);
    check(|x| bjt_eval(x, vbc, &p, GMIN).ib, e.dib_dvbe, vbe, h);
    check(|x| bjt_eval(vbe, x, &p, GMIN).ic, e.dic_dvbc, vbc, h);
    check(|x| bjt_eval(vbe, x, &p, GMIN).ib, e.dib_dvbc, vbc, h);
}

#[test]
fn bjt_cutoff() {
    bjt_case(-0.5, -5.0, 50.0, 1e-6);
}

#[test]
fn bjt_active() {
    bjt_case(0.7, -3.0, 50.0, 1e-6);
}

#[test]
fn bjt_saturation() {
    bjt_case(0.75, 0.6, 50.0, 1e-6);
}

#[test]
fn bjt_reverse() {
    bjt_case(-3.0, 0.7, 50.0, 1e-3);
}

#[test]
fn bjt_active_no_early() {
    bjt_case(0.7, -3.0, f64::INFINITY, 1e-3);
}

#[test]
fn pnp_mirrors_npn() {
    let p = bjt_params(50.0);
    let n = bjt_eval(0.7, -3.0, &p, GMIN);
    let q = eval_signed(-1.0, -0.7, 3.0, &p, GMIN);
    assert_eq!(q.ic, -n.ic);
    assert_eq!(q.ib, -n.ib);
    assert_eq!(q.dic_dvbe, n.dic_dvbe);
    assert_eq!(q.dic_dvbc, n.dic_dvbc);
    assert_eq!(q.dib_dvbe, n.dib_dvbe);
    assert_eq!(q.dib_dvbc, n.dib_dvbc);
}
