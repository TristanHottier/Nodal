//! Transient goldens: parsing and comparison (VALIDATION.md section 3, ADR 0011).

use std::collections::BTreeSet;

use nodal_engine::analysis::TranResult;

use super::{Comparison, I_ABS, SignalCheck, Status, V_ABS, signal_parts, status_of_ratio};

/// Relative part of the transient tolerance: a fraction of the reference peak-to-peak.
pub const TRAN_P2P: f64 = 1e-3;

/// A transient golden: ngspice time points and one column per signal.
#[derive(Debug, Clone, PartialEq)]
pub struct TranGolden {
    pub time: Vec<f64>,
    /// `V(node)` or `I(element)`, in column order.
    pub signals: Vec<String>,
    /// `columns[k][p]` is the value of `signals[k]` at `time[p]`.
    pub columns: Vec<Vec<f64>>,
}

/// Reads a `time,<signal>,...` golden: one row per ngspice time point.
pub fn parse_tran_golden(text: &str) -> Result<TranGolden, String> {
    let mut header: Option<Vec<String>> = None;
    let mut columns: Vec<Vec<f64>> = Vec::new();
    for (index, line) in text.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let fields: Vec<&str> = line.split(',').collect();
        let Some(names) = &header else {
            if fields.first() != Some(&"time") || fields.len() < 2 {
                return Err(format!(
                    "line {}: expected `time,<signal>,...` header",
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
    let names = header.ok_or("missing `time,...` header")?;
    let mut columns = columns.into_iter();
    let time = columns.next().unwrap_or_default();
    if time.is_empty() {
        return Err("golden has no data rows".to_string());
    }
    Ok(TranGolden {
        time,
        signals: names.into_iter().skip(1).collect(),
        columns: columns.collect(),
    })
}

/// Value of the piecewise-linear signal `(time, values)` at `t`, or `None` outside its range.
/// `time` must be non-decreasing.
fn interpolate(time: &[f64], values: &[f64], t: f64) -> Option<f64> {
    let (first, last) = (*time.first()?, *time.last()?);
    if !(t >= first && t <= last) {
        return None;
    }
    let upper = time.partition_point(|&s| s <= t);
    if upper == 0 {
        return values.first().copied();
    }
    if upper == time.len() {
        return values.last().copied();
    }
    let (t0, t1) = (time[upper - 1], time[upper]);
    let (x0, x1) = (values[upper - 1], values[upper]);
    Some(x0 + (x1 - x0) * (t - t0) / (t1 - t0))
}

/// Compares a transient result with a golden. Nodal's output is interpolated linearly onto
/// every golden time point; a golden time outside Nodal's range fails. A sample passes if
/// `|x - x_ref| <= TRAN_P2P * p2p(ref) + a`, with `a` = `V_ABS` for voltages and `I_ABS` for
/// currents (ADR 0011). The check of a signal carries the worst ratio over all points; when it
/// fails, its name also gives the time of the worst point, as `V(out) at t=1.5e-3`.
pub fn compare_tran(golden: &TranGolden, result: &TranResult) -> Comparison {
    let mut checks = Vec::new();
    let mut seen: BTreeSet<&str> = BTreeSet::new();
    for (signal, column) in golden.signals.iter().zip(&golden.columns) {
        seen.insert(signal);
        let (series, floor) = match signal_parts(signal) {
            Some(('V', name)) => (result.node_voltages.get(name), V_ABS),
            Some(('I', name)) => (result.branch_currents.get(name), I_ABS),
            _ => (None, 0.0),
        };
        let Some(series) = series.filter(|s| s.len() == result.time.len()) else {
            checks.push(SignalCheck {
                signal: signal.clone(),
                status: Status::Missing,
                ratio: f64::INFINITY,
            });
            continue;
        };
        let max = column.iter().copied().fold(f64::NEG_INFINITY, f64::max);
        let min = column.iter().copied().fold(f64::INFINITY, f64::min);
        let tol = TRAN_P2P * (max - min) + floor;
        let mut worst_ratio = 0.0_f64;
        let mut worst_time = None;
        for (&t, &reference) in golden.time.iter().zip(column) {
            let ratio = match interpolate(&result.time, series, t) {
                Some(x) => (x - reference).abs() / tol,
                None => f64::INFINITY,
            };
            // NaN must not pass and must not be hidden by a later finite ratio.
            let ratio = if ratio.is_nan() { f64::INFINITY } else { ratio };
            if worst_time.is_none() || ratio > worst_ratio {
                worst_ratio = ratio;
                worst_time = Some(t);
            }
        }
        let status = status_of_ratio(worst_ratio);
        let name = match (status, worst_time) {
            (Status::Fail, Some(t)) => format!("{signal} at t={t:e}"),
            _ => signal.clone(),
        };
        checks.push(SignalCheck {
            signal: name,
            status,
            ratio: worst_ratio,
        });
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;
    use std::error::Error;

    fn result(time: &[f64], v: &[(&str, &[f64])]) -> TranResult {
        TranResult {
            time: time.to_vec(),
            node_voltages: v
                .iter()
                .map(|(k, x)| ((*k).to_string(), x.to_vec()))
                .collect(),
            branch_currents: BTreeMap::new(),
        }
    }

    fn golden(time: &[f64], v: &[(&str, &[f64])]) -> TranGolden {
        TranGolden {
            time: time.to_vec(),
            signals: v.iter().map(|(k, _)| format!("V({k})")).collect(),
            columns: v.iter().map(|(_, x)| x.to_vec()).collect(),
        }
    }

    #[test]
    fn parse_tran_golden_reads_rows() -> Result<(), Box<dyn Error>> {
        let g = parse_tran_golden("# c\ntime,V(a),I(V1)\n0,1,2\n1e-3,3,4\n")?;
        assert_eq!(g.time, vec![0.0, 1e-3]);
        assert_eq!(g.signals, vec!["V(a)", "I(V1)"]);
        assert_eq!(g.columns, vec![vec![1.0, 3.0], vec![2.0, 4.0]]);
        assert!(parse_tran_golden("sweep,V(a)\n0,1\n").is_err());
        Ok(())
    }

    #[test]
    fn compare_tran_passes_with_interpolation() {
        // Nodal has points at 0 and 2 only; the line x = t interpolates exactly onto t = 1.
        let g = golden(&[0.0, 1.0, 2.0], &[("a", &[0.0, 1.0, 2.0])]);
        let r = result(&[0.0, 2.0], &[("a", &[0.0, 2.0])]);
        let c = compare_tran(&g, &r);
        assert!(c.passed(), "{c:?}");
        assert!(c.checks[0].ratio < 1e-6);
    }

    #[test]
    fn compare_tran_constant_signal_uses_floor() {
        // p2p = 0, so only the absolute floor remains: 1e-8 V.
        let g = golden(&[0.0, 1.0], &[("vdd", &[5.0, 5.0])]);
        let ok = result(&[0.0, 1.0], &[("vdd", &[5.0 + 5e-9, 5.0])]);
        assert!(compare_tran(&g, &ok).passed());
        let bad = result(&[0.0, 1.0], &[("vdd", &[5.0 + 2e-8, 5.0])]);
        assert!(!compare_tran(&g, &bad).passed());
    }

    #[test]
    fn compare_tran_scales_with_peak_to_peak() {
        // p2p = 10 V, tolerance 1e-2 V + 1e-8 V.
        let g = golden(&[0.0, 1.0], &[("a", &[0.0, 10.0])]);
        let ok = result(&[0.0, 1.0], &[("a", &[0.009, 10.0])]);
        assert!(compare_tran(&g, &ok).passed());
        let bad = result(&[0.0, 1.0], &[("a", &[0.011, 10.0])]);
        assert!(!compare_tran(&g, &bad).passed());
    }

    #[test]
    fn compare_tran_out_of_range_fails() {
        let g = golden(&[0.0, 1.0, 3.0], &[("a", &[1.0, 1.0, 1.0])]);
        let r = result(&[0.0, 2.0], &[("a", &[1.0, 1.0])]);
        let c = compare_tran(&g, &r);
        assert!(!c.passed());
        assert_eq!(c.checks[0].status, Status::Fail);
        assert!(c.checks[0].ratio.is_infinite());
    }

    #[test]
    fn compare_tran_failure_names_signal_and_time() {
        let g = golden(&[0.0, 1.0, 2.0], &[("a", &[0.0, 1.0, 2.0])]);
        let r = result(&[0.0, 1.0, 2.0], &[("a", &[0.0, 1.5, 2.0])]);
        let c = compare_tran(&g, &r);
        assert!(!c.passed());
        let name = &c.checks[0].signal;
        assert!(name.starts_with("V(a)") && name.contains("t=1e0"), "{name}");
    }

    #[test]
    fn compare_tran_missing_and_extra_signals_fail() {
        let g = golden(&[0.0, 1.0], &[("a", &[0.0, 1.0])]);
        let r = result(&[0.0, 1.0], &[("b", &[0.0, 1.0])]);
        let c = compare_tran(&g, &r);
        let statuses: Vec<Status> = c.checks.iter().map(|k| k.status).collect();
        assert_eq!(statuses, vec![Status::Missing, Status::Extra]);
    }

    #[test]
    fn compare_tran_nan_fails() {
        let g = golden(&[0.0, 1.0], &[("a", &[0.0, 1.0])]);
        let r = result(&[0.0, 1.0], &[("a", &[f64::NAN, 1.0])]);
        assert!(!compare_tran(&g, &r).passed());
    }
}
