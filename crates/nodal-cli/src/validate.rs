//! `nodal-cli validate`: compares Nodal's results with committed ngspice goldens.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use nodal_engine::analysis::OpResult;
use nodal_engine::{AnalysisResult, simulate};

/// Absolute tolerance floor for voltages, in volts (VALIDATION.md section 3).
pub const V_ABS: f64 = 1e-8;
/// Absolute tolerance floor for currents, in amperes.
pub const I_ABS: f64 = 1e-13;
/// Relative tolerance.
pub const REL: f64 = 1e-5;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Pass,
    Fail,
    /// In the golden, absent from the result.
    Missing,
    /// In the result, absent from the golden.
    Extra,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SignalCheck {
    pub signal: String,
    pub status: Status,
    /// `|x - x_ref|` divided by the tolerance. Infinite for missing and extra signals.
    pub ratio: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Comparison {
    pub checks: Vec<SignalCheck>,
}

impl Comparison {
    pub fn passed(&self) -> bool {
        self.checks.iter().all(|c| c.status == Status::Pass)
    }
}

/// Compares a result with golden `(signal, value)` pairs named `V(node)` or `I(element)`.
///
/// A signal passes if `|x - x_ref| <= REL * |x_ref| + a`, with `a` = `V_ABS` for voltages
/// and `I_ABS` for currents. Signals present on only one side fail.
pub fn compare_op(golden: &[(String, f64)], result: &OpResult) -> Comparison {
    let mut checks = Vec::new();
    let mut seen: BTreeSet<String> = BTreeSet::new();
    for (signal, reference) in golden {
        seen.insert(signal.clone());
        let found = match signal_parts(signal) {
            Some(('V', name)) => result.node_voltages.get(name).map(|x| (*x, V_ABS)),
            Some(('I', name)) => result.branch_currents.get(name).map(|x| (*x, I_ABS)),
            _ => None,
        };
        checks.push(match found {
            None => SignalCheck {
                signal: signal.clone(),
                status: Status::Missing,
                ratio: f64::INFINITY,
            },
            Some((x, floor)) => {
                let tol = REL * reference.abs() + floor;
                let ratio = (x - reference).abs() / tol;
                // A NaN result must not pass: `ratio <= 1.0` is false for NaN.
                let status = if ratio <= 1.0 {
                    Status::Pass
                } else {
                    Status::Fail
                };
                SignalCheck {
                    signal: signal.clone(),
                    status,
                    ratio: if ratio.is_nan() { f64::INFINITY } else { ratio },
                }
            }
        });
    }
    let produced = result
        .node_voltages
        .keys()
        .map(|n| format!("V({n})"))
        .chain(result.branch_currents.keys().map(|n| format!("I({n})")));
    for signal in produced {
        if !seen.contains(&signal) {
            checks.push(SignalCheck {
                signal,
                status: Status::Extra,
                ratio: f64::INFINITY,
            });
        }
    }
    Comparison { checks }
}

/// Splits `V(out)` into `('V', "out")`.
fn signal_parts(signal: &str) -> Option<(char, &str)> {
    let kind = signal.chars().next()?;
    let name = signal.get(1..)?.strip_prefix('(')?.strip_suffix(')')?;
    (matches!(kind, 'V' | 'I') && !name.is_empty()).then_some((kind, name))
}

/// Reads `signal,value` rows from a golden file, skipping `#` header lines.
fn parse_golden(text: &str) -> Result<Vec<(String, f64)>, String> {
    let mut rows = Vec::new();
    let mut header_seen = false;
    for (index, line) in text.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if !header_seen {
            if line != "signal,value" {
                return Err(format!("line {}: expected `signal,value`", index + 1));
            }
            header_seen = true;
            continue;
        }
        let (signal, value) = line
            .split_once(',')
            .ok_or_else(|| format!("line {}: expected `signal,value`", index + 1))?;
        let value: f64 = value
            .parse()
            .map_err(|_| format!("line {}: bad number `{value}`", index + 1))?;
        rows.push((signal.to_string(), value));
    }
    if !header_seen {
        return Err("missing `signal,value` header".to_string());
    }
    Ok(rows)
}

struct Row {
    circuit: String,
    outcome: Outcome,
}

enum Outcome {
    Compared {
        signals: usize,
        worst: Option<SignalCheck>,
        passed: bool,
    },
    /// The golden could not be read, or the circuit failed to load or simulate.
    Error(String),
}

impl Row {
    fn passed(&self) -> bool {
        matches!(self.outcome, Outcome::Compared { passed: true, .. })
    }
}

fn check_golden(dir: &Path, id: &str, golden_path: &Path) -> Result<Row, String> {
    let golden_text = std::fs::read_to_string(golden_path)
        .map_err(|e| format!("cannot read {}: {e}", golden_path.display()))?;
    let golden =
        parse_golden(&golden_text).map_err(|e| format!("{}: {e}", golden_path.display()))?;
    let circuit_path = dir.join("circuits").join(format!("{id}.json"));
    let netlist = crate::load(&circuit_path)?;
    let results = simulate(&netlist).map_err(|e| format!("{id}: {e}"))?;
    let op = results
        .iter()
        .map(|r| match r {
            AnalysisResult::Op(op) => op,
        })
        .next()
        .ok_or_else(|| format!("{id}: circuit has no op analysis"))?;
    let comparison = compare_op(&golden, op);
    let worst = comparison
        .checks
        .iter()
        .max_by(|a, b| a.ratio.total_cmp(&b.ratio))
        .cloned();
    Ok(Row {
        circuit: id.to_string(),
        outcome: Outcome::Compared {
            signals: comparison.checks.len(),
            worst,
            passed: comparison.passed(),
        },
    })
}

fn render(rows: &[Row]) -> String {
    let mut table = String::from(
        "| circuit | analysis | signals | worst signal | worst err/tol | result |\n\
         |---|---|---|---|---|---|\n",
    );
    for row in rows {
        match &row.outcome {
            Outcome::Error(message) => {
                // `|` would split the Markdown cell; newlines would end the row.
                let message = message.replace('|', "/").replace('\n', " ");
                table.push_str(&format!(
                    "| {} | op | - | - | {message} | ERROR |\n",
                    row.circuit
                ));
            }
            Outcome::Compared {
                signals,
                worst,
                passed,
            } => {
                let (signal, ratio) = match worst {
                    Some(w) => (
                        w.signal.as_str(),
                        match w.status {
                            Status::Missing => "missing".to_string(),
                            Status::Extra => "extra".to_string(),
                            Status::Pass | Status::Fail => format!("{:.3e}", w.ratio),
                        },
                    ),
                    None => ("-", "-".to_string()),
                };
                let verdict = if *passed { "pass" } else { "FAIL" };
                table.push_str(&format!(
                    "| {} | op | {signals} | {signal} | {ratio} | {verdict} |\n",
                    row.circuit
                ));
            }
        }
    }
    table
}

/// Compares every `golden/<id>.op.csv` under `dir` with a fresh run of `circuits/<id>.json`.
/// Returns the table and whether every row passed. A circuit that fails to load or simulate
/// becomes an `ERROR` row and fails the run; a missing or empty `golden/` is an `Err`.
pub fn validate_dir(dir: &Path) -> Result<(String, bool), String> {
    let golden_dir = dir.join("golden");
    let entries = std::fs::read_dir(&golden_dir)
        .map_err(|e| format!("cannot read {}: {e}", golden_dir.display()))?;
    let mut ids: Vec<(String, PathBuf)> = Vec::new();
    for entry in entries {
        let path = entry.map_err(|e| e.to_string())?.path();
        let id = path
            .file_name()
            .and_then(|n| n.to_str())
            .and_then(|n| n.strip_suffix(".op.csv"));
        if let Some(id) = id {
            ids.push((id.to_string(), path.clone()));
        }
    }
    if ids.is_empty() {
        return Err(format!("no goldens in {}", golden_dir.display()));
    }
    ids.sort();
    let mut rows = Vec::new();
    for (id, path) in &ids {
        rows.push(check_golden(dir, id, path).unwrap_or_else(|message| Row {
            circuit: id.clone(),
            outcome: Outcome::Error(message),
        }));
    }
    let all_passed = rows.iter().all(Row::passed);
    Ok((render(&rows), all_passed))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;
    use std::error::Error;

    fn result(v: &[(&str, f64)], i: &[(&str, f64)]) -> OpResult {
        let map = |pairs: &[(&str, f64)]| -> BTreeMap<String, f64> {
            pairs.iter().map(|(k, x)| ((*k).to_string(), *x)).collect()
        };
        OpResult {
            node_voltages: map(v),
            branch_currents: map(i),
        }
    }

    fn golden(pairs: &[(&str, f64)]) -> Vec<(String, f64)> {
        pairs.iter().map(|(k, x)| ((*k).to_string(), *x)).collect()
    }

    fn status_of(c: &Comparison, signal: &str) -> Option<Status> {
        c.checks
            .iter()
            .find(|k| k.signal == signal)
            .map(|k| k.status)
    }

    #[test]
    fn exact_match_passes() {
        let c = compare_op(
            &golden(&[("V(out)", 7.5), ("I(V1)", -2.5e-3)]),
            &result(&[("out", 7.5)], &[("V1", -2.5e-3)]),
        );
        assert!(c.passed());
        assert_eq!(c.checks.len(), 2);
    }

    #[test]
    fn within_tolerance_passes() -> Result<(), Box<dyn Error>> {
        // tol = 1e-5 * 1e-6 + 1e-8 = 1.001e-8; error 5e-9 is inside it.
        let c = compare_op(
            &golden(&[("V(a)", 1e-6)]),
            &result(&[("a", 1e-6 + 5e-9)], &[]),
        );
        assert!(c.passed());
        let ratio = c.checks.first().ok_or("no check")?.ratio;
        assert!(ratio > 0.4 && ratio < 0.6, "ratio {ratio}");
        Ok(())
    }

    #[test]
    fn beyond_tolerance_fails() {
        let c = compare_op(
            &golden(&[("V(out)", 7.5)]),
            &result(&[("out", 7.5 + 1e-4)], &[]),
        );
        assert!(!c.passed());
        assert_eq!(status_of(&c, "V(out)"), Some(Status::Fail));
    }

    #[test]
    fn current_uses_ampere_floor() {
        let g = golden(&[("I(V1)", 0.0)]);
        assert!(compare_op(&g, &result(&[], &[("V1", 5e-14)])).passed());
        assert!(!compare_op(&g, &result(&[], &[("V1", 2e-13)])).passed());
    }

    #[test]
    fn missing_signal_fails() {
        let c = compare_op(
            &golden(&[("V(a)", 1.0), ("V(b)", 2.0)]),
            &result(&[("a", 1.0)], &[]),
        );
        assert!(!c.passed());
        assert_eq!(status_of(&c, "V(b)"), Some(Status::Missing));
    }

    #[test]
    fn extra_signal_fails() {
        let c = compare_op(
            &golden(&[("V(a)", 1.0)]),
            &result(&[("a", 1.0), ("b", 2.0)], &[]),
        );
        assert!(!c.passed());
        assert_eq!(status_of(&c, "V(b)"), Some(Status::Extra));
    }

    /// Scratch directory removed on drop, unique per process and test.
    struct TempDir(PathBuf);

    impl TempDir {
        fn new(test: &str) -> Result<Self, Box<dyn Error>> {
            let path = std::env::temp_dir()
                .join(format!("nodal-validate-unit-{}-{test}", std::process::id()));
            let _ = std::fs::remove_dir_all(&path);
            std::fs::create_dir_all(&path)?;
            Ok(Self(path))
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    const FLOATING: &str = r#"{"irVersion":1,"title":"floating","elements":[
        {"kind":"V","name":"V1","nodes":["in","0"],"dc":5},
        {"kind":"R","name":"R1","nodes":["in","0"],"value":1000},
        {"kind":"C","name":"C1","nodes":["in","x"],"value":1e-6},
        {"kind":"R","name":"R2","nodes":["x","y"],"value":1000}],
        "analyses":[{"type":"op"}]}"#;

    #[test]
    fn missing_circuit_is_an_error_row() -> Result<(), Box<dyn Error>> {
        let tmp = TempDir::new("missing_circuit")?;
        std::fs::create_dir_all(tmp.0.join("golden"))?;
        std::fs::write(tmp.0.join("golden/Z1.op.csv"), "signal,value\nV(a),1.0\n")?;
        let (table, passed) = validate_dir(&tmp.0)?;
        assert!(!passed);
        let row = table
            .lines()
            .find(|l| l.starts_with("| Z1 |"))
            .ok_or("no Z1 row")?;
        assert!(
            row.contains("| op | - | - |") && row.ends_with("| ERROR |"),
            "{row}"
        );
        Ok(())
    }

    #[test]
    fn error_row_rendered() -> Result<(), Box<dyn Error>> {
        let tmp = TempDir::new("error_row")?;
        std::fs::create_dir_all(tmp.0.join("golden"))?;
        std::fs::create_dir_all(tmp.0.join("circuits"))?;
        std::fs::write(tmp.0.join("circuits/F1.json"), FLOATING)?;
        std::fs::write(tmp.0.join("golden/F1.op.csv"), "signal,value\nV(in),5.0\n")?;
        let (table, passed) = validate_dir(&tmp.0)?;
        assert!(!passed);
        let row = table
            .lines()
            .find(|l| l.starts_with("| F1 |"))
            .ok_or("no F1 row")?;
        assert!(row.contains("ERROR"), "{row}");
        // The message must not break the Markdown table.
        assert_eq!(row.matches('|').count(), 7, "{row}");
        Ok(())
    }

    #[test]
    fn empty_golden_dir_is_an_error() -> Result<(), Box<dyn Error>> {
        let tmp = TempDir::new("empty_golden")?;
        std::fs::create_dir_all(tmp.0.join("golden"))?;
        assert!(validate_dir(&tmp.0).is_err());
        Ok(())
    }

    #[test]
    fn parse_golden_rejects_bad_header() {
        assert!(parse_golden("name,val\nV(a),1\n").is_err());
        assert!(parse_golden("# only a comment\n").is_err());
    }

    #[test]
    fn parse_golden_rejects_bad_number() {
        assert!(parse_golden("signal,value\nV(a),abc\n").is_err());
    }

    #[test]
    fn parse_golden_skips_comments() -> Result<(), Box<dyn Error>> {
        let rows = parse_golden("# c\nsignal,value\n# mid\n\nV(a),1.5\nI(V1),-2e-3\n")?;
        assert_eq!(rows, golden(&[("V(a)", 1.5), ("I(V1)", -2e-3)]));
        Ok(())
    }
}
