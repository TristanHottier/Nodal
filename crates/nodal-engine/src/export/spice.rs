//! SPICE deck export, used to generate ngspice golden references.

use std::fmt::Write;

use crate::ir::{Analysis, DEFAULT_GMIN, Element, MOS_DEFAULT_SIZE, ModelKind, Netlist};

/// Renders the netlist as an ngspice deck: title, elements in IR order,
/// `.model` cards, `.options` for the options that are set, `.nodeset`, one
/// line per analysis and `.end`.
///
/// Model keys are sorted ASCII. NMOS and PMOS models start with `LEVEL=1`.
/// A switch model without `ROFF` gets `ROFF=1/gmin` written out.
///
/// Numbers use `{:e}`, the shortest scientific notation that parses back to
/// the same f64 (ADR 0009: no unit suffixes).
pub fn to_spice_deck(netlist: &Netlist) -> String {
    let mut deck = String::new();
    let title = netlist.title.as_deref().unwrap_or("nodal");
    deck.push_str(&title.replace(['\r', '\n'], " "));
    deck.push('\n');
    // Writing to a String cannot fail, so the fmt results are ignored.
    for element in &netlist.elements {
        let _ = match element {
            Element::R { name, nodes, value }
            | Element::L { name, nodes, value }
            | Element::C { name, nodes, value } => {
                writeln!(deck, "{name} {} {} {value:e}", nodes[0], nodes[1])
            }
            Element::V { name, nodes, dc } | Element::I { name, nodes, dc } => {
                writeln!(deck, "{name} {} {} DC {dc:e}", nodes[0], nodes[1])
            }
            Element::E {
                name,
                nodes,
                control_nodes,
                gain,
            }
            | Element::G {
                name,
                nodes,
                control_nodes,
                gain,
            } => writeln!(
                deck,
                "{name} {} {} {} {} {gain:e}",
                nodes[0], nodes[1], control_nodes[0], control_nodes[1]
            ),
            Element::F {
                name,
                nodes,
                control_source,
                gain,
            }
            | Element::H {
                name,
                nodes,
                control_source,
                gain,
            } => writeln!(
                deck,
                "{name} {} {} {control_source} {gain:e}",
                nodes[0], nodes[1]
            ),
            Element::D { name, nodes, model } => {
                writeln!(deck, "{name} {} {} {model}", nodes[0], nodes[1])
            }
            Element::Q { name, nodes, model } => {
                writeln!(
                    deck,
                    "{name} {} {} {} {model}",
                    nodes[0], nodes[1], nodes[2]
                )
            }
            Element::M {
                name,
                nodes,
                model,
                w,
                l,
            } => writeln!(
                deck,
                "{name} {} {} {} {} {model} W={:e} L={:e}",
                nodes[0],
                nodes[1],
                nodes[2],
                nodes[3],
                w.unwrap_or(MOS_DEFAULT_SIZE),
                l.unwrap_or(MOS_DEFAULT_SIZE)
            ),
            Element::S {
                name,
                nodes,
                control_nodes,
                model,
            } => writeln!(
                deck,
                "{name} {} {} {} {} {model}",
                nodes[0], nodes[1], control_nodes[0], control_nodes[1]
            ),
        };
    }
    let gmin = netlist
        .options
        .as_ref()
        .and_then(|o| o.gmin)
        .unwrap_or(DEFAULT_GMIN);
    for model in &netlist.models {
        let mut entries: Vec<(&str, f64)> =
            model.params.iter().map(|(k, v)| (k.as_str(), *v)).collect();
        if model.kind == ModelKind::SW && !model.params.contains_key("ROFF") {
            entries.push(("ROFF", 1.0 / gmin));
        }
        entries.sort_by(|a, b| a.0.cmp(b.0));
        let mut fields: Vec<String> = Vec::new();
        if matches!(model.kind, ModelKind::NMOS | ModelKind::PMOS) {
            fields.push("LEVEL=1".to_string());
        }
        fields.extend(entries.iter().map(|(k, v)| format!("{k}={v:e}")));
        let _ = write!(deck, ".model {} {}", model.name, model.kind.as_str());
        if !fields.is_empty() {
            let _ = write!(deck, " ({})", fields.join(" "));
        }
        deck.push('\n');
    }
    if let Some(o) = &netlist.options {
        let set: Vec<String> = [
            ("temp", o.temp),
            ("reltol", o.reltol),
            ("vntol", o.vntol),
            ("abstol", o.abstol),
            ("chgtol", o.chgtol),
            ("gmin", o.gmin),
        ]
        .into_iter()
        .filter_map(|(k, v)| v.map(|v| format!("{k}={v:e}")))
        .collect();
        if !set.is_empty() {
            let _ = writeln!(deck, ".options {}", set.join(" "));
        }
    }
    if let Some(set) = &netlist.nodeset
        && !set.is_empty()
    {
        let items: Vec<String> = set.iter().map(|(k, v)| format!("v({k})={v:e}")).collect();
        let _ = writeln!(deck, ".nodeset {}", items.join(" "));
    }
    for analysis in &netlist.analyses {
        let _ = match analysis {
            Analysis::Op {} => writeln!(deck, ".op"),
            Analysis::Dc {
                source,
                start,
                stop,
                step,
            } => writeln!(deck, ".dc {source} {start:e} {stop:e} {step:e}"),
        };
    }
    deck.push_str(".end\n");
    deck
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse_netlist;
    use std::error::Error;

    const ALL_KINDS: &str =
        include_str!("../../../../packages/schema/fixtures/ir/valid/all-kinds.json");

    const NONLINEAR: &str =
        include_str!("../../../../packages/schema/fixtures/ir/valid/nonlinear.json");

    #[test]
    fn deck_for_all_kinds() -> Result<(), Box<dyn Error>> {
        let netlist = parse_netlist(ALL_KINDS)?;
        let expected = "\
One element of each kind
V1 in 0 DC 5e0
I1 0 a DC 1e-3
R1 in a 1e3
L1 a b 1e-3
C1 b 0 1e-6
E1 e 0 a 0 2e0
G1 g 0 a 0 1e-2
H1 h 0 V1 1e2
F1 f 0 V1 3e0
.options temp=2.7e1 reltol=1e-3 vntol=1e-6 abstol=1e-12 chgtol=1e-14 gmin=1e-12
.op
.end
";
        assert_eq!(to_spice_deck(&netlist), expected);
        Ok(())
    }

    #[test]
    fn deck_for_nonlinear() -> Result<(), Box<dyn Error>> {
        let netlist = parse_netlist(NONLINEAR)?;
        let expected = "\
One nonlinear element of each kind
V1 in 0 DC 5e0
R1 in a 1e3
D1 a 0 DMOD
R2 in c 1e3
R3 in b 1e5
R4 e 0 1e2
Q1 c b e QN
R5 in d 1e3
R6 in g 1e5
R7 g 0 1e5
M1 d g 0 0 MN W=1e-5 L=1e-6
R8 in sw 1e3
S1 sw 0 a 0 SW1
.model DMOD D (IS=1e-14 N=1.5e0 RS=1e1)
.model QN NPN (BF=1e2 IS=1e-16 VAF=7.5e1)
.model QP PNP (BF=5e1 IS=2e-16)
.model MN NMOS (LEVEL=1 KP=2e-5 LAMBDA=1e-2 VTO=1e0)
.model MP PMOS (LEVEL=1 KP=1e-5 VTO=-1e0)
.model SW1 SW (ROFF=1e12 RON=1e0 VH=1e-1 VT=5e-1)
.options gmin=1e-12
.nodeset v(a)=6e-1 v(c)=2e0
.op
.dc V1 0e0 5e0 5e-1
.end
";
        assert_eq!(to_spice_deck(&netlist), expected);
        Ok(())
    }

    #[test]
    fn mos_defaults_and_switch_roff_follow_options() -> Result<(), Box<dyn Error>> {
        let json = r#"{"irVersion":1,"elements":[{"kind":"V","name":"V1","nodes":["a","0"]},{"kind":"M","name":"M1","nodes":["a","a","0","0"],"model":"MN"},{"kind":"S","name":"S1","nodes":["a","0"],"controlNodes":["a","0"],"model":"SW"}],"models":[{"name":"MN","type":"NMOS"},{"name":"SW","type":"SW"}],"analyses":[{"type":"op"}],"options":{"gmin":1e-9}}"#;
        let deck = to_spice_deck(&parse_netlist(json)?);
        assert!(deck.contains("M1 a a 0 0 MN W=1e-4 L=1e-4\n"), "{deck}");
        let roff = format!(".model SW SW (ROFF={:e})\n", 1.0 / 1e-9);
        assert!(deck.contains(&roff), "{deck}");
        Ok(())
    }

    #[test]
    fn export_round_trips_values() -> Result<(), Box<dyn Error>> {
        for v in [0.1_f64, 1.0 / 3.0, 4.7e3, 1e-12] {
            let json = format!(
                r#"{{"irVersion":1,"elements":[{{"kind":"R","name":"R1","nodes":["a","0"],"value":{v:e}}},{{"kind":"V","name":"V1","nodes":["a","0"],"dc":1}}],"analyses":[{{"type":"op"}}]}}"#
            );
            let deck = to_spice_deck(&parse_netlist(&json)?);
            let token = deck
                .lines()
                .find(|l| l.starts_with("R1 "))
                .and_then(|l| l.split(' ').nth(3))
                .ok_or("no R1 value token")?;
            assert_eq!(token.parse::<f64>()?, v);
        }
        Ok(())
    }
}
