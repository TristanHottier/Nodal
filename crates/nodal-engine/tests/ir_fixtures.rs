//! Shared IR fixtures. The TypeScript validator in `@nodal/schema` runs the
//! same files, so both implementations agree on what is valid.
//!
//! Tests return `Result` instead of unwrapping, so the workspace
//! `unwrap_used` and `expect_used` lints hold in test code too.

use std::collections::BTreeSet;
use std::error::Error;
use std::fs;
use std::path::PathBuf;

use nodal_engine::ir::Element;
use nodal_engine::{Error as EngineError, parse_netlist};

type TestResult = Result<(), Box<dyn Error>>;

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn json_files(dir: &std::path::Path) -> Result<Vec<PathBuf>, Box<dyn Error>> {
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut files = Vec::new();
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.extension().is_some_and(|e| e == "json") {
            files.push(path);
        }
    }
    files.sort();
    Ok(files)
}

fn fixture(kind: &str, name: &str) -> Result<String, Box<dyn Error>> {
    let path = repo_root()
        .join("packages/schema/fixtures/ir")
        .join(kind)
        .join(format!("{name}.json"));
    Ok(fs::read_to_string(path)?)
}

fn rejection(name: &str) -> Result<String, Box<dyn Error>> {
    match parse_netlist(&fixture("invalid", name)?) {
        Ok(_) => Err(format!("{name} was accepted").into()),
        Err(e) => Ok(e.to_string()),
    }
}

#[test]
fn valid_fixtures_parse() -> TestResult {
    let mut files = json_files(&repo_root().join("packages/schema/fixtures/ir/valid"))?;
    files.extend(json_files(&repo_root().join("validation/circuits"))?);
    assert!(!files.is_empty());
    for path in files {
        let text = fs::read_to_string(&path)?;
        parse_netlist(&text).map_err(|e| format!("{}: {e}", path.display()))?;
    }
    Ok(())
}

#[test]
fn invalid_fixtures_are_rejected() -> TestResult {
    let files = json_files(&repo_root().join("packages/schema/fixtures/ir/invalid"))?;
    assert!(files.len() >= 34);
    for path in files {
        let text = fs::read_to_string(&path)?;
        assert!(
            parse_netlist(&text).is_err(),
            "{} was accepted",
            path.display()
        );
    }
    Ok(())
}

/// Every invalid fixture and the message fragment that names its rule.
const NEEDLES: &[(&str, &str)] = &[
    ("ir-version-2", "irVersion must be 1"),
    ("unknown-field", "unknown field `bogus`"),
    ("unknown-kind", "unknown variant `X`"),
    ("unsupported-analysis", "unknown variant `ac`"),
    ("analysis-extra-field", "unknown field `x`"),
    ("empty-elements", "elements must not be empty"),
    ("empty-analyses", "analyses must not be empty"),
    (
        "name-kind-mismatch",
        "element name C1 must start with its kind letter R",
    ),
    ("bad-element-name", "element name \"R-1\" must match"),
    ("bad-node-name", "node \"n 1\" must match"),
    (
        "gnd-node",
        "node \"GND\" is reserved: ngspice treats gnd as ground",
    ),
    (
        "duplicate-name-case",
        "must be unique ignoring case: R_A, R_a",
    ),
    (
        "node-case-collision",
        "must differ by more than case: OUT, out",
    ),
    ("zero-resistor", "element R1: value must be finite and > 0"),
    (
        "negative-capacitor",
        "element C1: value must be finite and > 0",
    ),
    ("infinite-value", "number out of range"),
    (
        "same-node-terminals",
        "element R1: both terminals are node in",
    ),
    (
        "unknown-control-source",
        "element F1: unknown controlling source V9",
    ),
    (
        "control-not-vsource",
        "element F1: controlling source R1 is not a voltage source",
    ),
    ("model-unknown", "element D1: unknown model NOPE"),
    (
        "model-wrong-type",
        "element D1: model QMOD has type NPN, expected D",
    ),
    (
        "model-duplicate-case",
        "model names must be unique ignoring case: DMOD, dmod",
    ),
    (
        "model-lowercase-param",
        "unsupported parameter is for model DMOD (D)",
    ),
    (
        "model-bv-rejected",
        "unsupported parameter BV for model DMOD (D)",
    ),
    (
        "model-param-out-of-range",
        "parameter M of model DMOD must be in [0, 1), got 1",
    ),
    ("mos-zero-width", "element M1: w must be finite and > 0"),
    (
        "switch-same-output-nodes",
        "element S1: both terminals are node a",
    ),
    ("dc-unknown-source", "analysis dc: unknown source V9"),
    (
        "dc-source-not-independent",
        "analysis dc: source R1 is not an independent source",
    ),
    ("dc-zero-step", "analysis dc: step must not be zero"),
    (
        "dc-step-misses-stop",
        "analysis dc: step 0.3 does not reach stop 1 from start 0",
    ),
    ("nodeset-unknown-node", "nodeset: unknown node zz"),
    (
        "temp-not-27",
        "option temp must be 27 (temperature is fixed in v1)",
    ),
    ("bad-option", "option reltol must be finite and > 0"),
];

#[test]
fn each_invalid_fixture_breaks_its_own_rule() -> TestResult {
    for (name, needle) in NEEDLES {
        let msg = rejection(name)?;
        assert!(msg.contains(needle), "{name}: {msg:?} lacks {needle:?}");
    }
    Ok(())
}

#[test]
fn messages_name_the_culprit() -> TestResult {
    let msg = rejection("duplicate-name-case")?;
    assert!(msg.contains("R_A") && msg.contains("R_a"), "{msg}");
    assert!(msg.find("R_A") < msg.find("R_a"), "not sorted: {msg}");

    let msg = rejection("node-case-collision")?;
    assert!(msg.contains("OUT") && msg.contains("out"), "{msg}");
    assert!(msg.find("OUT") < msg.find("out"), "not sorted: {msg}");

    let msg = rejection("unknown-control-source")?;
    assert!(msg.contains("F1") && msg.contains("unknown controlling source"));

    let msg = rejection("control-not-vsource")?;
    assert!(msg.contains("F1") && msg.contains("R1") && msg.contains("is not a voltage source"));
    Ok(())
}

#[test]
fn errors_are_typed() -> TestResult {
    let parse = parse_netlist("{");
    assert!(matches!(parse, Err(EngineError::Parse(_))));
    let invalid = parse_netlist(&fixture("invalid", "empty-elements")?);
    assert!(matches!(invalid, Err(EngineError::Invalid(_))));
    Ok(())
}

#[test]
fn dc_defaults_to_zero() -> TestResult {
    let netlist = parse_netlist(&fixture("valid", "dc-default")?)?;
    match netlist.elements.first() {
        Some(Element::V { dc, .. }) => assert_eq!(*dc, 0.0),
        other => return Err(format!("expected V source, got {other:?}").into()),
    }
    Ok(())
}

#[test]
fn all_kinds_round_trip() -> TestResult {
    let netlist = parse_netlist(&fixture("valid", "all-kinds")?)?;
    let names: Vec<&str> = netlist.elements.iter().map(Element::name).collect();
    assert_eq!(
        names,
        ["V1", "I1", "R1", "L1", "C1", "E1", "G1", "H1", "F1"]
    );
    assert_eq!(netlist.title.as_deref(), Some("One element of each kind"));
    let json = serde_json::to_string(&netlist)?;
    assert_eq!(parse_netlist(&json)?, netlist);
    Ok(())
}

#[test]
fn every_invalid_fixture_has_a_needle() -> TestResult {
    let files = json_files(&repo_root().join("packages/schema/fixtures/ir/invalid"))?;
    let on_disk: BTreeSet<String> = files
        .iter()
        .filter_map(|p| p.file_stem().map(|s| s.to_string_lossy().into_owned()))
        .collect();
    let listed: BTreeSet<String> = NEEDLES.iter().map(|(n, _)| n.to_string()).collect();
    assert_eq!(on_disk, listed);
    Ok(())
}

#[test]
fn floats_round_trip() -> TestResult {
    let text = r#"{"irVersion":1,"elements":[{"kind":"R","name":"R1","nodes":["a","0"],"value":0.1000000000000000055511151231257827}],"analyses":[{"type":"op"}]}"#;
    let netlist = parse_netlist(text)?;
    match netlist.elements.first() {
        Some(Element::R { value, .. }) => assert_eq!(*value, 0.1_f64),
        other => return Err(format!("expected resistor, got {other:?}").into()),
    }
    Ok(())
}
