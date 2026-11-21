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
        .map(|analysis| match analysis {
            Analysis::Op {} => analysis::solve_op(&circuit).map(AnalysisResult::Op),
            Analysis::Dc {
                source,
                start,
                stop,
                step,
            } => {
                let values = ir::sweep_values(*start, *stop, *step);
                analysis::solve_dc_sweep(&mut circuit, source, &values).map(AnalysisResult::Dc)
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
                analysis::solve_ac(&circuit, &frequencies).map(AnalysisResult::Ac)
            }
            Analysis::Tran { .. } => {
                Err(Error::Invalid("tran analysis is not simulated yet".into()))
            }
        })
        .collect()
}

/// Crate version, taken from the manifest.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    #[test]
    fn version_matches_manifest() {
        assert_eq!(super::VERSION, "0.1.0");
    }

    #[test]
    fn tran_is_not_simulated_yet() -> Result<(), Box<dyn std::error::Error>> {
        let json = include_str!("../../../packages/schema/fixtures/ir/valid/tran.json");
        let netlist = super::parse_netlist(json)?;
        let err = super::simulate(&netlist).err().ok_or("simulated")?;
        assert!(
            err.to_string()
                .contains("tran analysis is not simulated yet")
        );
        Ok(())
    }
}
