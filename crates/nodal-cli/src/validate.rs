//! `nodal-cli validate`: compares Nodal's results with committed ngspice goldens.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use nodal_engine::analysis::{DcResult, OpResult};
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

/// A DC sweep golden: signal names and one row of values per sweep point.
#[derive(Debug, Clone, PartialEq)]
pub struct DcGolden {
    pub sweep: Vec<f64>,
    /// `V(node)` or `I(element)`, in column order.
    pub signals: Vec<String>,
    /// `columns[k][p]` is the value of `signals[k]` at point `p`.
    pub columns: Vec<Vec<f64>>,
}

/// Tolerance on a sweep value: `1e-9 * max(1, |x|)`.
fn sweep_tolerance(reference: f64) -> f64 {
    1e-9 * reference.abs().max(1.0)
}

/// Compares a sweep result with a golden. The returned checks hold `sweep`
/// first, then one entry per signal with the worst ratio over all points.
/// A different point count fails the `sweep` check outright.
pub fn compare_dc(golden: &DcGolden, result: &DcResult) -> Comparison {
    let mut checks = Vec::new();
    let sweep_ratio = if golden.sweep.len() == result.sweep.len() {
        golden
            .sweep
            .iter()
            .zip(&result.sweep)
            .map(|(r, x)| (x - r).abs() / sweep_tolerance(*r))
            .fold(0.0, worst)
    } else {
        f64::INFINITY
    };
    checks.push(SignalCheck {
        signal: "sweep".to_string(),
        status: status_of_ratio(sweep_ratio),
        ratio: sweep_ratio,
    });
    let same_length = golden.sweep.len() == result.sweep.len();
    let mut seen: BTreeSet<&str> = BTreeSet::new();
    for (signal, column) in golden.signals.iter().zip(&golden.columns) {
        seen.insert(signal);
        let (series, floor) = match signal_parts(signal) {
            Some(('V', name)) => (result.node_voltages.get(name), V_ABS),
            Some(('I', name)) => (result.branch_currents.get(name), I_ABS),
            _ => (None, 0.0),
        };
        let check = match series {
            Some(series) if same_length && series.len() == column.len() => {
                let ratio = column
                    .iter()
                    .zip(series)
                    .map(|(r, x)| (x - r).abs() / (REL * r.abs() + floor))
                    .fold(0.0, worst);
                SignalCheck {
                    signal: signal.clone(),
                    status: status_of_ratio(ratio),
                    ratio: if ratio.is_nan() { f64::INFINITY } else { ratio },
                }
            }
            Some(_) => SignalCheck {
                signal: signal.clone(),
                status: Status::Fail,
                ratio: f64::INFINITY,
            },
            None => SignalCheck {
                signal: signal.clone(),
                status: Status::Missing,
                ratio: f64::INFINITY,
            },
        };
        checks.push(check);
    }
    let produced = result
        .node_voltages
        .keys()
        .map(|n| format!("V({n})"))
        .chain(result.branch_currents.keys().map(|n| format!("I({n})")));
    for signal in produced {
        if !seen.contains(signal.as_str()) {
            checks.push(SignalCheck {
                signal,
                status: Status::Extra,
                ratio: f64::INFINITY,
            });
        }
    }
    Comparison { checks }
}

/// Larger of two ratios, where NaN wins so that it cannot hide.
fn worst(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else {
        a.max(b)
    }
}

fn status_of_ratio(ratio: f64) -> Status {
    // A NaN ratio must not pass: `ratio <= 1.0` is false for NaN.
    if ratio <= 1.0 {
        Status::Pass
    } else {
        Status::Fail
    }
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

/// Reads a `sweep,<signal>,...` golden: one row per point.
fn parse_dc_golden(text: &str) -> Result<DcGolden, String> {
    let mut header: Option<Vec<String>> = None;
    let mut columns: Vec<Vec<f64>> = Vec::new();
    for (index, line) in text.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let fields: Vec<&str> = line.split(',').collect();
        let Some(names) = &header else {
            if fields.first() != Some(&"sweep") || fields.len() < 2 {
                return Err(format!(
                    "line {}: expected `sweep,<signal>,...` header",
                    index + 1
                ));
            }
            columns = vec![Vec::new(); fields.len()];
            header = Some(fields.iter().map(|f| (*f).to_string()).collect());
            continue;
        };
        if fields.len() != names.len() {
            return Err(format!(
                "line {}: expected {} fields, found {}",
                index + 1,
                names.len(),
                fields.len()
            ));
        }
        for (column, field) in columns.iter_mut().zip(&fields) {
            let value: f64 = field
                .parse()
                .map_err(|_| format!("line {}: bad number `{field}`", index + 1))?;
            column.push(value);
        }
    }
    let names = header.ok_or("missing `sweep,...` header")?;
    let mut columns = columns.into_iter();
    let sweep = columns.next().unwrap_or_default();
    Ok(DcGolden {
        sweep,
        signals: names.into_iter().skip(1).collect(),
        columns: columns.collect(),
    })
}

/// Which analysis a golden file belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Kind {
    Op,
    Dc,
}

impl Kind {
    fn name(self) -> &'static str {
        match self {
            Kind::Op => "op",
            Kind::Dc => "dc",
        }
    }
}

struct Row {
    circuit: String,
    kind: Kind,
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

fn check_golden(dir: &Path, id: &str, kind: Kind, golden_path: &Path) -> Result<Row, String> {
    let golden_text = std::fs::read_to_string(golden_path)
        .map_err(|e| format!("cannot read {}: {e}", golden_path.display()))?;
    let in_file = |e: String| format!("{}: {e}", golden_path.display());
    let circuit_path = dir.join("circuits").join(format!("{id}.json"));
    let comparison = match kind {
        Kind::Op => {
            let golden = parse_golden(&golden_text).map_err(in_file)?;
            let netlist = crate::load(&circuit_path)?;
            let results = simulate(&netlist).map_err(|e| format!("{id}: {e}"))?;
            let op = results.iter().find_map(|r| match r {
                AnalysisResult::Op(op) => Some(op),
                AnalysisResult::Dc(_) => None,
            });
            compare_op(
                &golden,
                op.ok_or_else(|| format!("{id}: circuit has no op analysis"))?,
            )
        }
        Kind::Dc => {
            let golden = parse_dc_golden(&golden_text).map_err(in_file)?;
            let netlist = crate::load(&circuit_path)?;
            let results = simulate(&netlist).map_err(|e| format!("{id}: {e}"))?;
            let dc = results.iter().find_map(|r| match r {
                AnalysisResult::Dc(dc) => Some(dc),
                AnalysisResult::Op(_) => None,
            });
            compare_dc(
                &golden,
                dc.ok_or_else(|| format!("{id}: circuit has no dc analysis"))?,
            )
        }
    };
    let worst = comparison
        .checks
        .iter()
        .max_by(|a, b| a.ratio.total_cmp(&b.ratio))
        .cloned();
    Ok(Row {
        circuit: id.to_string(),
        kind,
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
                    "| {} | {} | - | - | {message} | ERROR |\n",
                    row.circuit,
                    row.kind.name()
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
                    "| {} | {} | {signals} | {signal} | {ratio} | {verdict} |\n",
                    row.circuit,
                    row.kind.name()
                ));
            }
        }
    }
    table
}

/// Compares every `golden/<id>.op.csv` and `golden/<id>.dc.csv` under `dir` with a fresh run
/// of `circuits/<id>.json`.
/// Returns the table and whether every row passed. A circuit that fails to load or simulate
/// becomes an `ERROR` row and fails the run; a missing or empty `golden/` is an `Err`.
pub fn validate_dir(dir: &Path) -> Result<(String, bool), String> {
    let golden_dir = dir.join("golden");
    let entries = std::fs::read_dir(&golden_dir)
        .map_err(|e| format!("cannot read {}: {e}", golden_dir.display()))?;
    let mut ids: Vec<(String, Kind, PathBuf)> = Vec::new();
    for entry in entries {
        let path = entry.map_err(|e| e.to_string())?.path();
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if let Some(id) = name.strip_suffix(".op.csv") {
            ids.push((id.to_string(), Kind::Op, path.clone()));
        } else if let Some(id) = name.strip_suffix(".dc.csv") {
            ids.push((id.to_string(), Kind::Dc, path.clone()));
        }
    }
    if ids.is_empty() {
        return Err(format!("no goldens in {}", golden_dir.display()));
    }
    ids.sort();
    let mut rows = Vec::new();
    for (id, kind, path) in &ids {
        rows.push(
            check_golden(dir, id, *kind, path).unwrap_or_else(|message| Row {
                circuit: id.clone(),
                kind: *kind,
                outcome: Outcome::Error(message),
            }),
        );
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

    fn dc_result(sweep: &[f64], v: &[(&str, &[f64])]) -> DcResult {
        DcResult {
            source: "V1".to_string(),
            sweep: sweep.to_vec(),
            node_voltages: v
                .iter()
                .map(|(k, x)| ((*k).to_string(), x.to_vec()))
                .collect(),
            branch_currents: BTreeMap::new(),
        }
    }

    fn dc_golden(sweep: &[f64], v: &[(&str, &[f64])]) -> DcGolden {
        DcGolden {
            sweep: sweep.to_vec(),
            signals: v.iter().map(|(k, _)| format!("V({k})")).collect(),
            columns: v.iter().map(|(_, x)| x.to_vec()).collect(),
        }
    }

    #[test]
    fn compare_dc_passes_and_reports_worst_point() -> Result<(), Box<dyn Error>> {
        let g = dc_golden(&[0.0, 1.0], &[("a", &[0.0, 0.75])]);
        let r = dc_result(&[0.0, 1.0], &[("a", &[0.0, 0.75 + 3.75e-6])]);
        let c = compare_dc(&g, &r);
        assert!(c.passed());
        let a = c
            .checks
            .iter()
            .find(|k| k.signal == "V(a)")
            .ok_or("no V(a)")?;
        assert!(a.ratio > 0.4 && a.ratio < 0.6, "ratio {}", a.ratio);
        Ok(())
    }

    #[test]
    fn compare_dc_point_count_mismatch_fails() {
        let g = dc_golden(&[0.0, 1.0, 2.0], &[("a", &[0.0, 1.0, 2.0])]);
        let r = dc_result(&[0.0, 1.0], &[("a", &[0.0, 1.0])]);
        let c = compare_dc(&g, &r);
        assert!(!c.passed());
        assert_eq!(status_of(&c, "sweep"), Some(Status::Fail));
    }

    #[test]
    fn compare_dc_sweep_value_mismatch_fails() {
        let g = dc_golden(&[0.0, 1.0], &[("a", &[0.0, 1.0])]);
        let r = dc_result(&[0.0, 1.0 + 1e-6], &[("a", &[0.0, 1.0])]);
        let c = compare_dc(&g, &r);
        assert_eq!(status_of(&c, "sweep"), Some(Status::Fail));
        assert_eq!(status_of(&c, "V(a)"), Some(Status::Pass));
    }

    #[test]
    fn compare_dc_signal_failure_at_one_point_fails() {
        let g = dc_golden(&[0.0, 1.0], &[("a", &[0.0, 1.0])]);
        let r = dc_result(&[0.0, 1.0], &[("a", &[0.0, 1.1])]);
        assert_eq!(status_of(&compare_dc(&g, &r), "V(a)"), Some(Status::Fail));
    }

    #[test]
    fn parse_dc_golden() -> Result<(), Box<dyn Error>> {
        let g = super::parse_dc_golden(
            "# circuit: X\n# analysis: dc\nsweep,V(a),I(V1)\n0e0,1.5,-2e-3\n1e0,2.5,-3e-3\n",
        )?;
        assert_eq!(g.sweep, [0.0, 1.0]);
        assert_eq!(g.signals, ["V(a)", "I(V1)"]);
        assert_eq!(g.columns, [vec![1.5, 2.5], vec![-2e-3, -3e-3]]);
        assert!(super::parse_dc_golden("signal,value\n").is_err());
        assert!(super::parse_dc_golden("sweep,V(a)\n0,1,2\n").is_err());
        assert!(super::parse_dc_golden("# only comments\n").is_err());
        Ok(())
    }

    #[test]
    fn dc_error_row_says_dc() -> Result<(), Box<dyn Error>> {
        let tmp = TempDir::new("dc_error_row")?;
        std::fs::create_dir_all(tmp.0.join("golden"))?;
        std::fs::write(tmp.0.join("golden/Z2.dc.csv"), "sweep,V(a)\n0,1\n")?;
        let (table, passed) = validate_dir(&tmp.0)?;
        assert!(!passed);
        let row = table
            .lines()
            .find(|l| l.starts_with("| Z2 |"))
            .ok_or("no Z2 row")?;
        assert!(
            row.contains("| dc | - | - |") && row.ends_with("| ERROR |"),
            "{row}"
        );
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
