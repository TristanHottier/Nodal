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
    signals: usize,
    worst: Option<SignalCheck>,
    passed: bool,
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
        signals: comparison.checks.len(),
        worst,
        passed: comparison.passed(),
    })
}

fn render(rows: &[Row]) -> String {
    let mut table = String::from(
        "| circuit | analysis | signals | worst signal | worst err/tol | result |\n\
         |---|---|---|---|---|---|\n",
    );
    for row in rows {
        let (signal, ratio) = match &row.worst {
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
        let verdict = if row.passed { "pass" } else { "FAIL" };
        table.push_str(&format!(
            "| {} | op | {} | {signal} | {ratio} | {verdict} |\n",
            row.circuit, row.signals
        ));
    }
    table
}

/// Compares every `golden/<id>.op.csv` under `dir` with a fresh run of `circuits/<id>.json`.
/// Returns the table and whether every row passed.
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
    let mut failures = Vec::new();
    for (id, path) in &ids {
        match check_golden(dir, id, path) {
            Ok(row) => rows.push(row),
            Err(message) => failures.push(message),
        }
    }
    if !failures.is_empty() {
        return Err(failures.join("\n"));
    }
    let all_passed = rows.iter().all(|r| r.passed);
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
}
