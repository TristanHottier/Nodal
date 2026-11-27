//! Analog circuit simulation engine.
//!
//! This crate performs no I/O, reads no clock and has no browser dependency.
//! File, process and browser access belong in `nodal-cli` and `nodal-wasm`.

pub mod analysis;
pub mod circuit;
pub mod devices;
pub mod error;
pub mod export;
pub mod ir;
pub mod linalg;
pub mod mna;
pub mod waveform;

pub use analysis::AnalysisResult;
pub use error::Error;
pub use export::to_spice_deck;
pub use ir::parse_netlist;

use ir::{Analysis, Netlist};

/// Runs every analysis in the netlist and returns one result per entry.
pub fn simulate(netlist: &Netlist) -> Result<Vec<AnalysisResult>, Error> {
    let mut circuit = circuit::Circuit::build(netlist)?;
    netlist
        .analyses
        .iter()
        .map(|analysis| run_analysis(&mut circuit, netlist, analysis, &mut |_| {}))
        .collect()
}

/// Runs the analysis at `index` alone on a freshly built circuit.
///
/// `progress` receives values in `[0, 1]`, non-decreasing, and the last call
/// of a successful run is exactly `1.0`. An op reports once; dc and ac report
/// `(k + 1) / n` after point `k`; tran reports `t / tstop` after each
/// accepted point.
pub fn simulate_analysis(
    netlist: &Netlist,
    index: usize,
    progress: &mut dyn FnMut(f64),
) -> Result<AnalysisResult, Error> {
    let analysis = netlist.analyses.get(index).ok_or_else(|| {
        Error::Invalid(format!(
            "analysis index {index} out of range ({} analyses)",
            netlist.analyses.len()
        ))
    })?;
    let mut circuit = circuit::Circuit::build(netlist)?;
    run_analysis(&mut circuit, netlist, analysis, progress)
}

fn run_analysis(
    circuit: &mut circuit::Circuit,
    netlist: &Netlist,
    analysis: &Analysis,
    progress: &mut dyn FnMut(f64),
) -> Result<AnalysisResult, Error> {
    match analysis {
        Analysis::Op {} => {
            let result = analysis::solve_op(circuit).map(AnalysisResult::Op)?;
            progress(1.0);
            Ok(result)
        }
        Analysis::Dc {
            source,
            start,
            stop,
            step,
        } => {
            let values = ir::sweep_values(*start, *stop, *step);
            analysis::solve_dc_sweep_with_progress(circuit, source, &values, progress)
                .map(AnalysisResult::Dc)
        }
        Analysis::Ac {
            sweep,
            points,
            fstart,
            fstop,
        } => {
            let frequencies = ir::ac_frequencies(
                *sweep,
                *points,
                *fstart,
                *fstop,
                circuit.options.reltol,
                ir::MAX_AC_POINTS,
            )
            .ok_or_else(|| Error::Invalid("ac analysis: invalid frequency sweep".into()))?;
            analysis::solve_ac_with_progress(circuit, &frequencies, progress)
                .map(AnalysisResult::Ac)
        }
        Analysis::Tran {
            tstep,
            tstop,
            tstart,
            tmax,
            uic,
        } => {
            let options = netlist.options.as_ref();
            let spec = analysis::TranSpec {
                tstep: *tstep,
                tstop: *tstop,
                tstart: *tstart,
                tmax: *tmax,
                uic: *uic,
                method: options.and_then(|o| o.method).unwrap_or(ir::Method::Trap),
                trtol: options
                    .and_then(|o| o.trtol)
                    .unwrap_or(analysis::DEFAULT_TRTOL),
                chgtol: options
                    .and_then(|o| o.chgtol)
                    .unwrap_or(analysis::DEFAULT_CHGTOL),
            };
            analysis::solve_tran_with_progress(circuit, &spec, progress).map(AnalysisResult::Tran)
        }
    }
}

/// Crate version, taken from the manifest.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    #[test]
    fn version_matches_manifest() {
        assert_eq!(super::VERSION, "1.2.0");
    }
}
