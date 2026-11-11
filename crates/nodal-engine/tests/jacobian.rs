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
