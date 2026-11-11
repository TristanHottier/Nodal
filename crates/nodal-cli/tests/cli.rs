//! Integration tests for the `nodal-cli` binary.
//!
//! Tests return `Result` instead of unwrapping, so the workspace
//! `unwrap_used` and `expect_used` lints hold in test code too.

use std::error::Error;
use std::process::{Command, Output};

const USAGE: &str = "usage: nodal-cli --version";

fn run(args: &[&str]) -> Result<Output, Box<dyn Error>> {
    Ok(Command::new(env!("CARGO_BIN_EXE_nodal-cli"))
        .args(args)
        .output()?)
}

#[test]
fn version_flag() -> Result<(), Box<dyn Error>> {
    let out = run(&["--version"])?;
    assert_eq!(out.status.code(), Some(0));
    assert_eq!(
        String::from_utf8(out.stdout)?,
        "nodal-cli 0.1.0 (engine 0.1.0)\n"
    );
    Ok(())
}

#[test]
fn no_args_is_usage_error() -> Result<(), Box<dyn Error>> {
    let out = run(&[])?;
    assert_eq!(out.status.code(), Some(2));
    assert!(String::from_utf8(out.stderr)?.contains(USAGE));
    Ok(())
}

#[test]
fn unknown_arg_is_usage_error() -> Result<(), Box<dyn Error>> {
    let out = run(&["run"])?;
    assert_eq!(out.status.code(), Some(2));
    assert!(String::from_utf8(out.stderr)?.contains(USAGE));
    Ok(())
}
