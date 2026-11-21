//! Independent voltage source.

use super::{Device, LoadContext, stamp_branch_kcl};
use crate::ir::{AcSpec, Waveform};
use crate::linalg::C64;
use crate::mna::{AcExcitation, RealSystem};
use crate::waveform;

#[derive(Debug)]
pub struct VoltageSource {
    name: String,
    p: Option<usize>,
    n: Option<usize>,
    k: usize,
    dc: f64,
    ac: Option<AcSpec>,
    tran: Option<Waveform>,
}

impl VoltageSource {
    pub fn new(
        name: String,
        p: Option<usize>,
        n: Option<usize>,
        k: usize,
        dc: f64,
        ac: Option<AcSpec>,
    ) -> Self {
        Self {
            name,
            p,
            n,
            k,
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

impl Device for VoltageSource {
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
        stamp_branch_kcl(sys, self.p, self.n, self.k);
        sys.add_a(Some(self.k), self.p, 1.0);
        sys.add_a(Some(self.k), self.n, -1.0);
        let value = match (&ctx.tran, &self.tran) {
            (Some(t), Some(w)) => waveform::value(w, t.time),
            (Some(_), None) => self.dc,
            (None, _) => self.dc * ctx.source_factor,
        };
        sys.add_b(Some(self.k), value);
        false
    }

    fn next_breakpoint(&self, t: f64) -> Option<f64> {
        self.tran
            .as_ref()
            .and_then(|w| waveform::next_breakpoint(w, t))
    }

    /// Port of `vsrcacld.c`: `b[k] += mag e^(j phase)`, phase in degrees.
    fn load_ac_excitation(&self, b: &mut AcExcitation) {
        if let Some(ac) = self.ac {
            let phase = ac.phase.to_radians();
            b.add(
                Some(self.k),
                C64::new(ac.mag * phase.cos(), ac.mag * phase.sin()),
            );
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

    fn source() -> VoltageSource {
        VoltageSource::new("V1".into(), Some(0), None, 1, 3.0, None).with_waveform(Some(pulse()))
    }

    fn tran_ctx(time: f64, coeffs: Coeffs, z: &[f64]) -> LoadContext<'_> {
        LoadContext {
            source_factor: 0.5,
            tran: Some(TranLoad {
                time,
                coeffs,
                hist: [z, z, z],
            }),
            ..LoadContext::new(LoadMode::Float)
        }
    }

    #[test]
    fn tran_uses_waveform_value() -> Result<(), Error> {
        let coeffs = Coeffs::new(Method::Trap, 2, [1e-6, 1e-6])?;
        let mut sys = RealSystem::new(2);
        // t = 1.3 is mid-plateau (td 1, tr 0.1, pw 0.5). Source factor is ignored.
        source().load(&[0.0; 2], &mut [], &tran_ctx(1.3, coeffs, &[]), &mut sys);
        assert_eq!(sys.b[1], 5.0);
        assert_eq!(sys.a.get(1, 0), 1.0);
        Ok(())
    }

    #[test]
    fn tran_without_waveform_uses_dc() -> Result<(), Error> {
        let coeffs = Coeffs::new(Method::Trap, 2, [1e-6, 1e-6])?;
        let v = VoltageSource::new("V1".into(), Some(0), None, 1, 3.0, None);
        let mut sys = RealSystem::new(2);
        v.load(&[0.0; 2], &mut [], &tran_ctx(1.3, coeffs, &[]), &mut sys);
        assert_eq!(sys.b[1], 3.0);
        Ok(())
    }

    #[test]
    fn dc_mode_ignores_waveform() {
        let mut ctx = LoadContext::new(LoadMode::Float);
        ctx.source_factor = 0.5;
        let mut sys = RealSystem::new(2);
        source().load(&[0.0; 2], &mut [], &ctx, &mut sys);
        assert_eq!(sys.b[1], 1.5);
    }

    #[test]
    fn breakpoint_delegates() {
        assert_eq!(source().next_breakpoint(0.0), Some(1.0));
        let plain = VoltageSource::new("V2".into(), Some(0), None, 1, 3.0, None);
        assert_eq!(plain.next_breakpoint(0.0), None);
    }
}
