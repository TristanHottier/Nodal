//! Flat, transferable encoding of analysis results and located errors.

use std::collections::BTreeMap;

use nodal_engine::{AnalysisResult, Error};
use serde::Serialize;

/// Shape of a flat result buffer.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    pub r#type: &'static str,
    pub source: Option<String>,
    pub points: usize,
    pub signals: Vec<SignalMeta>,
}

/// One signal of a result: a node voltage (`v`) or a branch current (`i`).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalMeta {
    pub name: String,
    pub kind: &'static str,
}

/// An error with the circuit objects it points at.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorInfo {
    pub message: String,
    pub elements: Vec<String>,
    pub nodes: Vec<String>,
}

/// Flattens a result into a metadata record and one `f64` buffer.
///
/// Layout of the buffer: the axis (`points` values; absent for op), then for
/// each signal its `points` real values and, for ac, its `points` imaginary
/// values right after. Signals are node voltages, then branch currents, each
/// in map order.
pub fn encode(result: &AnalysisResult) -> (Meta, Vec<f64>) {
    let mut signals = Vec::new();
    let mut data = Vec::new();
    let (kind, source, points) = match result {
        AnalysisResult::Op(r) => {
            for (name, v) in &r.node_voltages {
                signals.push(signal(name, "v"));
                data.push(*v);
            }
            for (name, v) in &r.branch_currents {
                signals.push(signal(name, "i"));
                data.push(*v);
            }
            ("op", None, 1)
        }
        AnalysisResult::Dc(r) => {
            data.extend_from_slice(&r.sweep);
            push_real(
                &mut signals,
                &mut data,
                &r.node_voltages,
                &r.branch_currents,
            );
            ("dc", Some(r.source.clone()), r.sweep.len())
        }
        AnalysisResult::Tran(r) => {
            data.extend_from_slice(&r.time);
            push_real(
                &mut signals,
                &mut data,
                &r.node_voltages,
                &r.branch_currents,
            );
            ("tran", None, r.time.len())
        }
        AnalysisResult::Ac(r) => {
            data.extend_from_slice(&r.frequencies);
            for (map, k) in [(&r.node_voltages, "v"), (&r.branch_currents, "i")] {
                for (name, series) in map {
                    signals.push(signal(name, k));
                    data.extend_from_slice(&series.re);
                    data.extend_from_slice(&series.im);
                }
            }
            ("ac", None, r.frequencies.len())
        }
    };
    (
        Meta {
            r#type: kind,
            source,
            points,
            signals,
        },
        data,
    )
}

fn signal(name: &str, kind: &'static str) -> SignalMeta {
    SignalMeta {
        name: name.to_string(),
        kind,
    }
}

fn push_real(
    signals: &mut Vec<SignalMeta>,
    data: &mut Vec<f64>,
    nodes: &BTreeMap<String, Vec<f64>>,
    branches: &BTreeMap<String, Vec<f64>>,
) {
    for (map, k) in [(nodes, "v"), (branches, "i")] {
        for (name, series) in map {
            signals.push(signal(name, k));
            data.extend_from_slice(series);
        }
    }
}

/// Describes an error and the nodes and elements it points at. Both lists are
/// sorted and deduplicated.
pub fn error_info(e: &Error) -> ErrorInfo {
    let mut nodes = Vec::new();
    let mut elements = Vec::new();
    collect(e, &mut nodes, &mut elements);
    for list in [&mut nodes, &mut elements] {
        list.sort();
        list.dedup();
    }
    ErrorInfo {
        message: e.to_string(),
        elements,
        nodes,
    }
}

fn collect(e: &Error, nodes: &mut Vec<String>, elements: &mut Vec<String>) {
    match e {
        Error::Floating {
            nodes: n,
            elements: el,
        } => {
            nodes.extend(n.iter().cloned());
            elements.extend(el.iter().cloned());
        }
        Error::SourceLoop { elements: el } => elements.extend(el.iter().cloned()),
        Error::Singular { unknown } => locate(unknown, nodes, elements),
        Error::TimestepTooSmall {
            device, unknown, ..
        } => {
            if !device.is_empty() {
                elements.push(device.clone());
            }
            locate(unknown, nodes, elements);
        }
        Error::NoConvergence { updates, .. } => {
            for (label, _) in updates {
                locate(label, nodes, elements);
            }
        }
        Error::SweepPoint { source, cause, .. } => {
            collect(cause, nodes, elements);
            elements.push(source.clone());
        }
        Error::AcPoint { cause, .. } => collect(cause, nodes, elements),
        Error::Parse(_) | Error::Invalid(_) | Error::Internal(_) => {}
    }
}

/// Files an unknown label: `V(x)` is node `x`, `I(x)` is element `x`.
fn locate(label: &str, nodes: &mut Vec<String>, elements: &mut Vec<String>) {
    if let Some(name) = label.strip_prefix("V(").and_then(|r| r.strip_suffix(')')) {
        nodes.push(name.to_string());
    } else if let Some(name) = label.strip_prefix("I(").and_then(|r| r.strip_suffix(')')) {
        elements.push(name.to_string());
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use nodal_engine::analysis::{AcResult, ComplexSeries, DcResult, OpResult, TranResult};

    use super::*;

    fn s(x: &str) -> String {
        x.to_string()
    }

    fn names(v: &[&str]) -> Vec<String> {
        v.iter().map(|x| x.to_string()).collect()
    }

    #[test]
    fn op_layout() {
        let r = AnalysisResult::Op(OpResult {
            node_voltages: BTreeMap::from([(s("a"), 1.0), (s("b"), 2.0)]),
            branch_currents: BTreeMap::from([(s("V1"), -0.5)]),
        });
        let (meta, data) = encode(&r);
        assert_eq!(meta.r#type, "op");
        assert_eq!(meta.points, 1);
        assert_eq!(meta.source, None);
        let sig: Vec<_> = meta
            .signals
            .iter()
            .map(|x| (x.name.as_str(), x.kind))
            .collect();
        assert_eq!(sig, vec![("a", "v"), ("b", "v"), ("V1", "i")]);
        assert_eq!(data, vec![1.0, 2.0, -0.5]);
    }

    #[test]
    fn dc_layout_has_source_and_sweep_axis() {
        let r = AnalysisResult::Dc(DcResult {
            source: s("V1"),
            sweep: vec![0.0, 1.0],
            node_voltages: BTreeMap::from([(s("a"), vec![0.0, 0.5])]),
            branch_currents: BTreeMap::from([(s("V1"), vec![1.0, 2.0])]),
        });
        let (meta, data) = encode(&r);
        assert_eq!(meta.r#type, "dc");
        assert_eq!(meta.source.as_deref(), Some("V1"));
        assert_eq!(meta.points, 2);
        assert_eq!(data, vec![0.0, 1.0, 0.0, 0.5, 1.0, 2.0]);
    }

    #[test]
    fn ac_layout_interleaves_im() {
        let cs = |re: [f64; 3], im: [f64; 3]| ComplexSeries {
            re: re.to_vec(),
            im: im.to_vec(),
        };
        let r = AnalysisResult::Ac(AcResult {
            frequencies: vec![1.0, 10.0, 100.0],
            node_voltages: BTreeMap::from([(s("a"), cs([1.0, 2.0, 3.0], [4.0, 5.0, 6.0]))]),
            branch_currents: BTreeMap::from([(s("V1"), cs([7.0, 8.0, 9.0], [10.0, 11.0, 12.0]))]),
        });
        let (meta, data) = encode(&r);
        assert_eq!(meta.r#type, "ac");
        assert_eq!(meta.points, 3);
        assert_eq!(data.len(), 3 + 2 * 3 * meta.signals.len());
        let expect: Vec<f64> = (1..=12).map(f64::from).collect();
        assert_eq!(&data[..3], &[1.0, 10.0, 100.0]);
        assert_eq!(&data[3..], expect.as_slice());
    }

    #[test]
    fn tran_axis_first() {
        let r = AnalysisResult::Tran(TranResult {
            time: vec![0.0, 1e-3],
            node_voltages: BTreeMap::from([(s("a"), vec![5.0, 6.0])]),
            branch_currents: BTreeMap::new(),
        });
        let (meta, data) = encode(&r);
        assert_eq!(meta.r#type, "tran");
        assert_eq!(meta.points, 2);
        assert_eq!(data, vec![0.0, 1e-3, 5.0, 6.0]);
    }

    #[test]
    fn meta_serializes_camel_case() {
        let (meta, _) = encode(&AnalysisResult::Op(OpResult {
            node_voltages: BTreeMap::from([(s("a"), 1.0)]),
            branch_currents: BTreeMap::new(),
        }));
        let json = serde_json::to_string(&meta).unwrap_or_default();
        assert_eq!(
            json,
            r#"{"type":"op","source":null,"points":1,"signals":[{"name":"a","kind":"v"}]}"#
        );
    }

    #[test]
    fn error_info_lists() {
        let info = |e: Error| error_info(&e);
        let e = Error::Floating {
            nodes: names(&["b", "c"]),
            elements: names(&["C1", "R2"]),
        };
        let i = info(e.clone());
        assert_eq!(i.message, e.to_string());
        assert_eq!(i.nodes, names(&["b", "c"]));
        assert_eq!(i.elements, names(&["C1", "R2"]));

        let i = info(Error::SourceLoop {
            elements: names(&["V2", "L1"]),
        });
        assert_eq!(i.elements, names(&["L1", "V2"]));
        assert!(i.nodes.is_empty());

        let i = info(Error::Singular { unknown: s("V(a)") });
        assert_eq!(i.nodes, names(&["a"]));
        assert!(i.elements.is_empty());
        let i = info(Error::Singular {
            unknown: s("I(V1)"),
        });
        assert_eq!(i.elements, names(&["V1"]));
        assert!(i.nodes.is_empty());

        let i = info(Error::TimestepTooSmall {
            time: 1e-3,
            device: s("C1"),
            unknown: String::new(),
        });
        assert_eq!(i.elements, names(&["C1"]));
        assert!(i.nodes.is_empty());
        let i = info(Error::TimestepTooSmall {
            time: 1e-3,
            device: String::new(),
            unknown: s("V(x)"),
        });
        assert_eq!(i.nodes, names(&["x"]));
        assert!(i.elements.is_empty());

        let i = info(Error::NoConvergence {
            updates: vec![
                (s("V(b)"), 1.0),
                (s("I(V1)"), 0.5),
                (s("V(b)"), 0.1),
                (s("V(a)"), 0.0),
            ],
            residuals: vec![(s("zz"), 1.0)],
        });
        assert_eq!(i.nodes, names(&["a", "b"]));
        assert_eq!(i.elements, names(&["V1"]));

        let i = info(Error::SweepPoint {
            source: s("V1"),
            value: 1.0,
            cause: Box::new(Error::Singular { unknown: s("V(b)") }),
        });
        assert_eq!(i.nodes, names(&["b"]));
        assert_eq!(i.elements, names(&["V1"]));

        let i = info(Error::AcPoint {
            frequency: 1e3,
            cause: Box::new(Error::Singular {
                unknown: s("I(L1)"),
            }),
        });
        assert_eq!(i.elements, names(&["L1"]));
        assert!(i.nodes.is_empty());

        let i = info(Error::Parse(s("x")));
        assert!(i.nodes.is_empty() && i.elements.is_empty());
    }
}
