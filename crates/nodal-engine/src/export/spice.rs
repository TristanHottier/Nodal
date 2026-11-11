//! SPICE deck export, used to generate ngspice golden references.

use std::fmt::Write;

use crate::ir::{Element, Netlist};

/// Renders the netlist as an ngspice deck: title, elements in IR order,
/// `.options` for the options that are set, `.op` and `.end`.
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
        };
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
    deck.push_str(".op\n.end\n");
    deck
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse_netlist;
    use std::error::Error;

    const ALL_KINDS: &str =
        include_str!("../../../../packages/schema/fixtures/ir/valid/all-kinds.json");

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
