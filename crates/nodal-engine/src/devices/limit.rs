//! Newton voltage limiting, ported from ngspice `src/spicelib/devices/devsup.c`
//! (`DEVpnjlim`, `DEVfetlim`, `DEVlimvds`).

/// `DEVpnjlim`: limits a pn-junction voltage step. Returns the limited
/// voltage and whether it differs from `vnew`.
pub fn pnjlim(vnew: f64, vold: f64, vt: f64, vcrit: f64) -> (f64, bool) {
    if vnew > vcrit && (vnew - vold).abs() > vt + vt {
        let limited = if vold > 0.0 {
            let arg = (vnew - vold) / vt;
            if arg > 0.0 {
                vold + vt * (2.0 + (arg - 2.0).ln())
            } else {
                vold - vt * (2.0 + (2.0 - arg).ln())
            }
        } else {
            vt * (vnew / vt).ln()
        };
        (limited, true)
    } else if vnew < 0.0 {
        let floor = if vold > 0.0 {
            -vold - 1.0
        } else {
            2.0 * vold - 1.0
        };
        if vnew < floor {
            (floor, true)
        } else {
            (vnew, false)
        }
    } else {
        (vnew, false)
    }
}

/// `DEVfetlim`: limits a MOSFET gate voltage step around the threshold `vto`.
///
/// Two ngspice branches cannot trigger, the only readers of `vtstlo`. With
/// `vtstlo = |vold - vto| + 1`: on and going off needs `vnew < vto - 1` while
/// `vnew >= vto + 3.5`; off and rising needs `vnew > vto + 1` while
/// `vnew <= vto + 0.5`. They are ported anyway, to stay faithful.
pub fn fetlim(vnew: f64, vold: f64, vto: f64) -> f64 {
    let vtsthi = (2.0 * (vold - vto)).abs() + 2.0;
    let vtstlo = (vold - vto).abs() + 1.0;
    let vtox = vto + 3.5;
    let delv = vnew - vold;
    if vold >= vto {
        if vold >= vtox {
            if delv <= 0.0 {
                // going off
                if vnew >= vtox {
                    if -delv > vtstlo {
                        return vold - vtstlo;
                    }
                } else {
                    return vnew.max(vto + 2.0);
                }
            } else if delv >= vtsthi {
                // staying on
                return vold + vtsthi;
            }
        } else if delv <= 0.0 {
            // middle region, decreasing
            return vnew.max(vto - 0.5);
        } else {
            // middle region, increasing
            return vnew.min(vto + 4.0);
        }
    } else if delv <= 0.0 {
        // off, decreasing
        if -delv > vtsthi {
            return vold - vtsthi;
        }
    } else {
        // off, increasing
        let vtemp = vto + 0.5;
        if vnew <= vtemp {
            if delv > vtstlo {
                return vold + vtstlo;
            }
        } else {
            return vtemp;
        }
    }
    vnew
}

/// `DEVlimvds`: limits a MOSFET drain-source voltage step.
pub fn limvds(vnew: f64, vold: f64) -> f64 {
    if vold >= 3.5 {
        if vnew > vold {
            vnew.min(3.0 * vold + 2.0)
        } else if vnew < 3.5 {
            vnew.max(2.0)
        } else {
            vnew
        }
    } else if vnew > vold {
        vnew.min(4.0)
    } else {
        vnew.max(-0.5)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::devices::constants::VT;

    const VCRIT: f64 = 0.6;

    fn near(a: f64, b: f64) -> bool {
        (a - b).abs() <= 1e-12 * b.abs().max(1.0)
    }

    #[test]
    fn pnjlim_large_forward_step() {
        let (v, limited) = pnjlim(5.0, 0.6, VT, VCRIT);
        let a = (5.0 - 0.6) / VT;
        assert!(limited);
        assert!(near(v, 0.6 + VT * (2.0 + (a - 2.0).ln())));
    }

    #[test]
    fn pnjlim_large_backward_step_from_forward() {
        // vnew > vcrit, vold > 0, a < 0 is impossible with vnew > vold - 2 vt
        // unless vold is far above: vold 5, vnew 0.7.
        let (v, limited) = pnjlim(0.7, 5.0, VT, VCRIT);
        let a = (0.7 - 5.0) / VT;
        assert!(limited);
        assert!(near(v, 5.0 - VT * (2.0 + (2.0 - a).ln())));
    }

    #[test]
    fn pnjlim_from_reverse() {
        let (v, limited) = pnjlim(2.0, -1.0, VT, VCRIT);
        assert!(limited);
        assert!(near(v, VT * (2.0 / VT).ln()));
    }

    #[test]
    fn pnjlim_no_change_small_step() {
        assert_eq!(pnjlim(0.65, 0.64, VT, VCRIT), (0.65, false));
        assert_eq!(pnjlim(0.3, 0.1, VT, VCRIT), (0.3, false));
    }

    #[test]
    fn pnjlim_negative_floor() {
        // vold > 0: floor = -vold - 1
        assert_eq!(pnjlim(-10.0, 0.5, VT, VCRIT), (-1.5, true));
        // vold <= 0: floor = 2 vold - 1
        assert_eq!(pnjlim(-10.0, -1.0, VT, VCRIT), (-3.0, true));
        // above the floor: unchanged
        assert_eq!(pnjlim(-2.0, -1.0, VT, VCRIT), (-2.0, false));
    }

    // fetlim with vto = 1, so vtox = 4.5.

    #[test]
    fn fetlim_on_going_off() {
        // vold 10, vnew 5 >= vtox: the drop is small, unchanged.
        assert_eq!(fetlim(5.0, 10.0, 1.0), 5.0);
        // vold 10, vnew -5 < vtox: clamped to vto + 2.
        assert_eq!(fetlim(-5.0, 10.0, 1.0), 3.0);
        // vnew 3.5 < vtox but above vto + 2: unchanged.
        assert_eq!(fetlim(3.5, 10.0, 1.0), 3.5);
    }

    #[test]
    fn fetlim_on_staying_on_big_rise() {
        // vold 5: vtsthi = 10. vnew 20, delv 15 >= 10: vold + vtsthi.
        assert_eq!(fetlim(20.0, 5.0, 1.0), 15.0);
        // small rise unchanged
        assert_eq!(fetlim(6.0, 5.0, 1.0), 6.0);
    }

    #[test]
    fn fetlim_middle_region() {
        // vold 3 (between vto = 1 and vtox = 4.5)
        assert_eq!(fetlim(-4.0, 3.0, 1.0), 0.5); // decreasing: max(vnew, vto - 0.5)
        assert_eq!(fetlim(2.0, 3.0, 1.0), 2.0);
        assert_eq!(fetlim(9.0, 3.0, 1.0), 5.0); // increasing: min(vnew, vto + 4)
        assert_eq!(fetlim(4.0, 3.0, 1.0), 4.0);
    }

    #[test]
    fn fetlim_off_region() {
        // vold -2, vto 1: vtsthi = 2*3 + 2 = 8, vtstlo = 4.
        assert_eq!(fetlim(-20.0, -2.0, 1.0), -10.0); // decreasing past vtsthi
        assert_eq!(fetlim(-5.0, -2.0, 1.0), -5.0);
        assert_eq!(fetlim(0.5, -2.0, 1.0), 0.5); // increasing, small
        assert_eq!(fetlim(1.5, -2.0, 1.0), 1.5); // vnew == vto + 0.5 boundary below
        assert_eq!(fetlim(5.0, -2.0, 1.0), 1.5); // above vto + 0.5: clamped
    }

    #[test]
    fn limvds_cases() {
        // vold >= 3.5, rising: min(vnew, 3 vold + 2)
        assert_eq!(limvds(20.0, 4.0), 14.0);
        assert_eq!(limvds(10.0, 4.0), 10.0);
        // vold >= 3.5, falling below 3.5: max(vnew, 2)
        assert_eq!(limvds(-1.0, 4.0), 2.0);
        assert_eq!(limvds(3.0, 4.0), 3.0);
        // vold >= 3.5, falling but still >= 3.5: unchanged
        assert_eq!(limvds(3.6, 4.0), 3.6);
        // vold < 3.5, rising: min(vnew, 4)
        assert_eq!(limvds(9.0, 1.0), 4.0);
        assert_eq!(limvds(2.0, 1.0), 2.0);
        // vold < 3.5, falling: max(vnew, -0.5)
        assert_eq!(limvds(-3.0, 1.0), -0.5);
        assert_eq!(limvds(0.0, 1.0), 0.0);
    }
}
