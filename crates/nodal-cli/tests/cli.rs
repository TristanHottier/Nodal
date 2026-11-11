//! Integration tests for the `nodal-cli` binary.
//!
//! Tests return `Result` instead of unwrapping, so the workspace
//! `unwrap_used` and `expect_used` lints hold in test code too.

use std::error::Error;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

const FIXTURE_DIVIDER: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/divider.json");
const FIXTURE_FLOATING: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/floating.json");

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
    assert!(String::from_utf8(out.stderr)?.contains("Usage:"));
    Ok(())
}

#[test]
fn unknown_subcommand_is_usage_error() -> Result<(), Box<dyn Error>> {
    let out = run(&["frobnicate"])?;
    assert_eq!(out.status.code(), Some(2));
    Ok(())
}

#[test]
fn run_divider() -> Result<(), Box<dyn Error>> {
    let out = run(&["run", FIXTURE_DIVIDER])?;
    assert_eq!(out.status.code(), Some(0));
    let json: serde_json::Value = serde_json::from_slice(&out.stdout)?;
    assert_eq!(json["irVersion"], 1);
    assert_eq!(json["title"], "Resistive divider");
    let result = &json["results"][0];
    assert_eq!(result["type"], "op");
    let out_v = result["nodeVoltages"]["out"]
        .as_f64()
        .ok_or("missing out voltage")?;
    let i_v1 = result["branchCurrents"]["V1"]
        .as_f64()
        .ok_or("missing V1 current")?;
    assert!((out_v - 7.5).abs() <= 1e-5 * 7.5 + 1e-8, "V(out) = {out_v}");
    assert!(
        (i_v1 + 2.5e-3).abs() <= 1e-5 * 2.5e-3 + 1e-13,
        "I(V1) = {i_v1}"
    );
    Ok(())
}

#[test]
fn export_divider() -> Result<(), Box<dyn Error>> {
    let out = run(&["export-spice", FIXTURE_DIVIDER])?;
    assert_eq!(out.status.code(), Some(0));
    let deck = String::from_utf8(out.stdout)?;
    assert!(deck.starts_with("Resistive divider\n"));
    assert!(deck.ends_with(".end\n"));
    Ok(())
}

#[test]
fn run_reports_topology_error() -> Result<(), Box<dyn Error>> {
    let out = run(&["run", FIXTURE_FLOATING])?;
    assert_eq!(out.status.code(), Some(1));
    let stderr = String::from_utf8(out.stderr)?;
    assert!(stderr.starts_with("error:"), "{stderr}");
    assert!(stderr.contains("floating nodes"), "{stderr}");
    assert!(stderr.contains("C1") && stderr.contains("R2"), "{stderr}");
    Ok(())
}

#[test]
fn run_missing_file() -> Result<(), Box<dyn Error>> {
    let out = run(&["run", "tests/fixtures/does-not-exist.json"])?;
    assert_eq!(out.status.code(), Some(1));
    assert!(String::from_utf8(out.stderr)?.starts_with("error:"));
    Ok(())
}

const VALIDATION_DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../validation");

#[test]
fn validate_repo_passes() -> Result<(), Box<dyn Error>> {
    let out = run(&["validate", VALIDATION_DIR])?;
    let stdout = String::from_utf8(out.stdout)?;
    assert_eq!(out.status.code(), Some(0), "{stdout}");
    assert!(stdout.starts_with("| circuit | analysis |"), "{stdout}");
    for id in ["L1", "L2", "L3"] {
        assert!(stdout.contains(&format!("| {id} | op |")), "{stdout}");
    }
    assert!(!stdout.contains("FAIL"), "{stdout}");
    Ok(())
}

fn copy_dir(from: &Path, to: &Path) -> Result<(), Box<dyn Error>> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

fn unique_temp_dir() -> Result<PathBuf, Box<dyn Error>> {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_nanos();
    Ok(std::env::temp_dir().join(format!("nodal-validate-{}-{nanos}", std::process::id())))
}

#[test]
fn validate_detects_tampered_golden() -> Result<(), Box<dyn Error>> {
    let dir = unique_temp_dir()?;
    let outcome = tampered_run(&dir);
    // Best effort: a leftover temp directory must not fail the test.
    let _ = std::fs::remove_dir_all(&dir);
    outcome
}

fn tampered_run(dir: &Path) -> Result<(), Box<dyn Error>> {
    copy_dir(Path::new(VALIDATION_DIR), dir)?;
    let golden = dir.join("golden/L1.op.csv");
    let text = std::fs::read_to_string(&golden)?;
    let tampered = text.replace(
        "V(out),7.5000000000000000e+00",
        "V(out),7.5075000000000000e+00",
    );
    assert_ne!(text, tampered, "golden line not found");
    std::fs::write(&golden, tampered)?;

    let dir_arg = dir.to_str().ok_or("temp dir is not UTF-8")?;
    let out = run(&["validate", dir_arg])?;
    let stdout = String::from_utf8(out.stdout)?;
    assert_eq!(out.status.code(), Some(1), "{stdout}");
    let row = stdout
        .lines()
        .find(|l| l.starts_with("| L1 |"))
        .ok_or("no L1 row")?;
    assert!(row.contains("V(out)") && row.contains("FAIL"), "{row}");
    Ok(())
}
