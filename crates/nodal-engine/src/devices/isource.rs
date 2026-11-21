//! Independent current source, flowing from `n+` through the source to `n-`.

use super::{Device, LoadContext};
use crate::ir::{AcSpec, Waveform};
use crate::linalg::C64;
use crate::mna::{AcExcitation, RealSystem};
use crate::waveform;

#[derive(Debug)]
pub struct CurrentSource {
    name: String,
    p: Option<usize>,
    n: Option<usize>,
    dc: f64,
    ac: Option<AcSpec>,
    tran: Option<Waveform>,
}

impl CurrentSource {
    pub fn new(
        name: String,
        p: Option<usize>,
        n: Option<usize>,
        dc: f64,
        ac: Option<AcSpec>,
    ) -> Self {
        Self {
            name,
            p,
            n,
            dc,
            ac,
            tran: None,
        }
    }

    /// Sets the waveform used in a transient step.
    pub fn with_waveform(mut self, tran: Option<Waveform>) -> Self {
        self.tran = tran;
        self
    }
}

impl Device for CurrentSource {
    fn name(&self) -> &str {
        &self.name
    }

    fn load(
        &self,
        _x: &[f64],
        _state: &mut [f64],
        ctx: &LoadContext,
        sys: &mut RealSystem,
    ) -> bool {
        // isrcload.c: the DC value in a DC analysis, the waveform at the
        // current time in a transient step.
        let value = match (&ctx.tran, &self.tran) {
            (Some(t), Some(w)) => waveform::value(w, t.time),
            (Some(_), None) => self.dc,
            (None, _) => self.dc * ctx.source_factor,
        };
        sys.add_b(self.p, -value);
        sys.add_b(self.n, value);
        false
    }

    fn tran_value(&self, t: f64) -> Option<f64> {
        Some(
            self.tran
                .as_ref()
                .map_or(self.dc, |w| waveform::value(w, t)),
        )
    }

    fn next_breakpoint(&self, t: f64) -> Option<f64> {
        self.tran
            .as_ref()
            .and_then(|w| waveform::next_breakpoint(w, t))
    }

    /// Port of `isrcacld.c`: `b[n+] -= I`, `b[n-] += I`, phase in degrees.
    fn load_ac_excitation(&self, b: &mut AcExcitation) {
        if let Some(ac) = self.ac {
            let phase = ac.phase.to_radians();
            let value = C64::new(ac.mag * phase.cos(), ac.mag * phase.sin());
            b.add(self.p, C64::new(-value.re, -value.im));
            b.add(self.n, value);
        }
    }

    fn set_dc(&mut self, value: f64) -> bool {
        self.dc = value;
        true
    }

    fn dc_value(&self) -> Option<f64> {
        Some(self.dc)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analysis::integrate::Coeffs;
    use crate::devices::{LoadMode, TranLoad};
    use crate::error::Error;
    use crate::ir::{Method, Waveform};

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
    fn tran_breakpoint_delegates() {
        let i =
            CurrentSource::new("I1".into(), Some(0), None, 1.0, None).with_waveform(Some(pulse()));
        assert_eq!(i.next_breakpoint(0.0), Some(1.0));
        assert_eq!(i.next_breakpoint(1.0), Some(1.1));
        let plain = CurrentSource::new("I2".into(), Some(0), None, 1.0, None);
        assert_eq!(plain.next_breakpoint(0.0), None);
    }

    #[test]
    fn tran_uses_waveform_and_dc_mode_ignores_it() -> Result<(), Error> {
        let i = CurrentSource::new("I1".into(), Some(0), Some(1), 1.0, None)
            .with_waveform(Some(pulse()));
        let z: [f64; 0] = [];
        let ctx = LoadContext {
            tran: Some(TranLoad {
                time: 1.3,
                coeffs: Coeffs::new(Method::Trap, 2, [1e-6, 1e-6])?,
                hist: [&z, &z, &z],
            }),
            ..LoadContext::new(LoadMode::Float)
        };
        let mut sys = RealSystem::new(2);
        i.load(&[0.0; 2], &mut [], &ctx, &mut sys);
        assert_eq!(sys.b, [-5.0, 5.0]);
        let mut sys = RealSystem::new(2);
        i.load(
            &[0.0; 2],
            &mut [],
            &LoadContext::new(LoadMode::Float),
            &mut sys,
        );
        assert_eq!(sys.b, [-1.0, 1.0]);
        Ok(())
    }
}
