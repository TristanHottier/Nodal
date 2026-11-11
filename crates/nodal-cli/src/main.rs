//! `nodal-cli`: command-line front end for the Nodal circuit engine.

use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::process::ExitCode;

mod validate;

use clap::{CommandFactory, FromArgMatches, Parser, Subcommand};
use nodal_engine::{AnalysisResult, parse_netlist, simulate, to_spice_deck};
use serde::Serialize;

#[derive(Parser)]
#[command(
    name = "nodal-cli",
    about = "Command-line front end for the Nodal circuit engine"
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Simulate a netlist and print the results as JSON.
    Run {
        /// Path to the JSON netlist.
        ir: PathBuf,
    },
    /// Print the netlist as an ngspice deck.
    ExportSpice {
        /// Path to the JSON netlist.
        ir: PathBuf,
    },
    /// Compare Nodal's results with the ngspice goldens under a validation directory.
    Validate {
        /// Directory holding `circuits/` and `golden/`.
        dir: PathBuf,
        /// Also write the table to this file.
        #[arg(long)]
        report: Option<PathBuf>,
    },
}

/// The JSON printed by `run`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RunOutput<'a> {
    ir_version: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    title: Option<&'a str>,
    results: &'a [AnalysisResult],
}

pub(crate) fn load(path: &Path) -> Result<nodal_engine::ir::Netlist, String> {
    let text = std::fs::read_to_string(path)
        .map_err(|e| format!("cannot read {}: {e}", path.display()))?;
    parse_netlist(&text).map_err(|e| e.to_string())
}

/// Returns the text for stdout and whether the command succeeded.
fn execute(command: &Command) -> Result<(String, bool), String> {
    match command {
        Command::Run { ir } => {
            let netlist = load(ir)?;
            let results = simulate(&netlist).map_err(|e| e.to_string())?;
            let output = RunOutput {
                ir_version: netlist.ir_version,
                title: netlist.title.as_deref(),
                results: &results,
            };
            let mut json = serde_json::to_string(&output).map_err(|e| e.to_string())?;
            json.push('\n');
            Ok((json, true))
        }
        Command::ExportSpice { ir } => Ok((to_spice_deck(&load(ir)?), true)),
        Command::Validate { dir, report } => {
            let (table, passed) = validate::validate_dir(dir)?;
            if let Some(path) = report {
                std::fs::write(path, &table)
                    .map_err(|e| format!("cannot write {}: {e}", path.display()))?;
            }
            Ok((table, passed))
        }
    }
}

fn main() -> ExitCode {
    // clap needs a 'static version string; the leak happens once per process.
    let version: &'static str = Box::leak(
        format!(
            "{} (engine {})",
            env!("CARGO_PKG_VERSION"),
            nodal_engine::VERSION
        )
        .into_boxed_str(),
    );
    let mut matches = Cli::command().version(version).get_matches();
    let cli = match Cli::from_arg_matches_mut(&mut matches) {
        Ok(cli) => cli,
        Err(e) => e.exit(),
    };
    match execute(&cli.command) {
        Ok((text, success)) => match io::stdout().write_all(text.as_bytes()) {
            Ok(()) if success => ExitCode::SUCCESS,
            Ok(()) | Err(_) => ExitCode::FAILURE,
        },
        Err(message) => {
            // A failed write to stderr leaves no channel to report it, so the exit code stands.
            let _ = writeln!(io::stderr(), "error: {message}");
            ExitCode::from(1)
        }
    }
}
