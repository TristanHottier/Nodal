//! Time-domain source waveforms and their breakpoints.
//!
//! `value` ports the `PULSE`, `SINE` and `PWL` cases of ngspice
//! `spicelib/devices/vsrc/vsrcload.c`. `next_breakpoint` follows the corner
//! logic of `spicelib/devices/vsrc/vsrcacct.c`, restated as a search for the
//! smallest corner strictly after `t` so the transient driver can ask for it
//! without keeping per-source state.

use crate::ir::Waveform;

/// Value of the waveform at time `t` (seconds).
pub fn value(w: &Waveform, t: f64) -> f64 {
    match w {
        Waveform::Pulse {
            v1,
            v2,
            td,
            tr,
            tf,
            pw,
            per,
        } => {
            // vsrcload.c, case PULSE (the ngspice PHASE and pulse-count
            // extensions are not part of the IR).
            let mut time = t - td;
            if time > *per {
                time -= per * (time / per).floor();
            }
            if time <= 0.0 || time >= tr + pw + tf {
                *v1
            } else if time >= *tr && time <= tr + pw {
                *v2
            } else if time < *tr {
                v1 + (v2 - v1) * time / tr
            } else {
                v2 + (v1 - v2) * (time - (tr + pw)) / tf
            }
        }
        Waveform::Sin {
            vo,
            va,
            freq,
            td,
            theta,
            phase,
        } => {
            // vsrcload.c, case SINE. For t <= td ngspice returns
            // vo + va*sin(phase), not vo; the source wins over the plain
            // "vo before the delay" reading.
            let phase = phase * std::f64::consts::PI / 180.0;
            let time = t - td;
            if time <= 0.0 {
                vo + va * phase.sin()
            } else {
                vo + va
                    * (freq * time * 2.0 * std::f64::consts::PI + phase).sin()
                    * (-time * theta).exp()
            }
        }
        Waveform::Pwl { points } => {
            // vsrcload.c, case PWL, without the repeat and delay options.
            let (Some(first), Some(last)) = (points.first(), points.last()) else {
                return 0.0;
            };
            if t <= first[0] {
                return first[1];
            }
            if t > last[0] {
                return last[1];
            }
            for pair in points.windows(2) {
                let (a, b) = (pair[0], pair[1]);
                if b[0] >= t {
                    return a[1] + (t - a[0]) / (b[0] - a[0]) * (b[1] - a[1]);
                }
            }
            last[1]
        }
    }
}

/// The smallest corner of the waveform strictly greater than `t`, or `None`.
///
/// Pulse work is bounded: only the periods around `t` are examined. A corner
/// is always computed with the same expression, so asking again at a returned
/// corner yields a strictly later one.
pub fn next_breakpoint(w: &Waveform, t: f64) -> Option<f64> {
    match w {
        Waveform::Pulse {
            td,
            tr,
            tf,
            pw,
            per,
            ..
        } => {
            let offsets = [0.0, *tr, tr + pw, tr + pw + tf];
            let k = ((t - td) / per).floor();
            let k0 = if k.is_finite() {
                (k - 1.0).max(0.0)
            } else {
                0.0
            };
            let mut best: Option<f64> = None;
            for j in 0..4 {
                let base = td + (k0 + f64::from(j)) * per;
                for off in offsets {
                    let c = base + off;
                    if c > t && best.is_none_or(|b| c < b) {
                        best = Some(c);
                    }
                }
            }
            best
        }
        Waveform::Sin { td, .. } => (*td > t).then_some(*td),
        Waveform::Pwl { points } => points.iter().map(|p| p[0]).find(|&c| c > t),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pulse() -> Waveform {
        Waveform::Pulse {
            v1: 0.0,
            v2: 5.0,
            td: 1.0,
            tr: 0.1,
            tf: 0.2,
            pw: 0.5,
            per: 2.0,
        }
    }

    #[test]
    fn pulse_values() {
        let w = pulse();
        assert_eq!(value(&w, 0.5), 0.0);
        assert!((value(&w, 1.05) - 2.5).abs() < 1e-12);
        assert_eq!(value(&w, 1.3), 5.0);
        assert!((value(&w, 1.7) - 2.5).abs() < 1e-12);
        assert_eq!(value(&w, 1.9), 0.0);
        // second period starts at td + per = 3
        assert!((value(&w, 3.05) - 2.5).abs() < 1e-12);
        assert_eq!(value(&w, 3.3), 5.0);
    }

    #[test]
    fn pulse_breakpoints_repeat() -> Result<(), &'static str> {
        let w = pulse();
        // Period 2 starts at td + 2*per = 5; third corner is 5 + 0.6.
        let third = 5.0 + 0.1 + 0.5;
        let next = next_breakpoint(&w, third + 1e-9).ok_or("none")?;
        assert!((next - (5.0 + 0.1 + 0.5 + 0.2)).abs() < 1e-12);
        assert_eq!(next_breakpoint(&w, 0.0), Some(1.0));
        Ok(())
    }

    #[test]
    fn pulse_breakpoints_advance_from_each_corner() -> Result<(), &'static str> {
        let w = pulse();
        let mut t = -1.0;
        for _ in 0..400 {
            let n = next_breakpoint(&w, t).ok_or("none")?;
            assert!(n > t, "{n} not after {t}");
            t = n;
        }
        assert!(t > 190.0);
        // an inexact period must not stall either
        let w = Waveform::Pulse {
            v1: 0.0,
            v2: 1.0,
            td: 0.1,
            tr: 1e-9,
            tf: 1e-9,
            pw: 3e-8,
            per: 1e-7 / 3.0,
        };
        let mut t = 0.0;
        for _ in 0..2000 {
            let n = next_breakpoint(&w, t).ok_or("none")?;
            assert!(n > t);
            t = n;
        }
        Ok(())
    }

    #[test]
    fn sin_before_delay_and_damped() {
        let w = Waveform::Sin {
            vo: 1.0,
            va: 2.0,
            freq: 50.0,
            td: 0.01,
            theta: 30.0,
            phase: 0.0,
        };
        assert_eq!(value(&w, 0.005), 1.0);
        let t = 0.0137;
        let s = t - 0.01;
        let want = 1.0 + 2.0 * (50.0 * s * 2.0 * std::f64::consts::PI).sin() * (-s * 30.0).exp();
        assert!((value(&w, t) - want).abs() <= 1e-15 * want.abs());
        assert_eq!(next_breakpoint(&w, 0.0), Some(0.01));
        assert_eq!(next_breakpoint(&w, 0.01), None);
    }

    #[test]
    fn sin_phase_in_degrees() {
        let w = Waveform::Sin {
            vo: 0.0,
            va: 1.0,
            freq: 1.0,
            td: 0.0,
            theta: 0.0,
            phase: 90.0,
        };
        assert!((value(&w, 0.0) - 1.0).abs() < 1e-15);
        assert!((value(&w, 0.5) + 1.0).abs() < 1e-15);
    }

    fn pwl() -> Waveform {
        Waveform::Pwl {
            points: vec![[1.0, 2.0], [2.0, 4.0], [4.0, 0.0]],
        }
    }

    #[test]
    fn pwl_holds_ends() {
        let w = pwl();
        assert_eq!(value(&w, 0.0), 2.0);
        assert_eq!(value(&w, 1.0), 2.0);
        assert!((value(&w, 1.5) - 3.0).abs() < 1e-15);
        assert!((value(&w, 3.0) - 2.0).abs() < 1e-15);
        assert_eq!(value(&w, 9.0), 0.0);
    }

    #[test]
    fn pwl_breakpoints() {
        let w = pwl();
        assert_eq!(next_breakpoint(&w, 0.0), Some(1.0));
        assert_eq!(next_breakpoint(&w, 1.0), Some(2.0));
        assert_eq!(next_breakpoint(&w, 3.0), Some(4.0));
    }

    #[test]
    fn breakpoint_none_after_last_pwl_point() {
        assert_eq!(next_breakpoint(&pwl(), 4.0), None);
        assert_eq!(next_breakpoint(&pwl(), 5.0), None);
    }
}
