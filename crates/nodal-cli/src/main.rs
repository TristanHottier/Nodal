//! `nodal-cli`: command-line front end for the Nodal circuit engine.

use std::io::{self, Write};
use std::process::ExitCode;

const USAGE: &str = "usage: nodal-cli --version";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.as_slice() {
        [flag] if flag == "--version" => {
            let line = format!(
                "nodal-cli {} (engine {})",
                env!("CARGO_PKG_VERSION"),
                nodal_engine::VERSION
            );
            match writeln!(io::stdout(), "{line}") {
                Ok(()) => ExitCode::SUCCESS,
                Err(_) => ExitCode::FAILURE,
            }
        }
        _ => {
            // A failed write to stderr leaves no channel to report it, so the usage exit code stands.
            let _ = writeln!(io::stderr(), "{USAGE}");
            ExitCode::from(2)
        }
    }
}
