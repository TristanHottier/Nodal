# Net label

## What it is

A net label gives a name to a net. Two nets with the same label are the same net, even when no wire joins them. A label is not a circuit element and has no value.

## Typical uses

- Naming a node so that you can find its voltage in the signal list and in probes.
- Connecting two distant parts of a schematic without drawing a long wire.
- Keeping a busy drawing readable by naming supply rails and signals.
- Marking the input and output of a block.

## How it works

The netlister turns the drawing into a netlist by finding nets. A net is a set of pins, wire ends and labels that are joined. A label connects to whatever pin, wire end or wire point lies at its anchor. A label anchor never makes a junction dot.

Naming follows a few rules:

- A label gives its text as the net name. Names may use letters, digits and underscores, so a label with a space, a dash or any other character is reported as `bad-label`.
- Labels whose text is the same ignoring upper and lower case join their nets into one. The net takes the first spelling in document order. So `Vout` and `vout` are one net.
- The names `0` and `gnd`, in any case, are reserved for ground and cannot be labels. A label on the ground net, or two labels on one net that differ by more than case, is a `label-conflict`.
- A label on a net that has no pins is ignored.
- Nets with no label get generated names `N001`, `N002` and so on, in the order their first pin appears. A generated name that equals a label ignoring case is skipped.

The node names reach the simulator and its results. The probe tool, when clicked on a net label, probes the voltage of that net.

## Equations

A net label has no equation. It does not appear in the IR, and the simulator never sees it. Its only effect is on the node names and on which nets are merged before the simulator starts.

{{parameters}}

## In the MNA system

A label adds no stamp. Two nets joined by a label become a single node, so they share one unknown voltage $v$ and a single KCL row, exactly as if a wire had joined them. The matrix has one row and column for the merged node, not two, and the elements that were on either net all connect to it. See [ground](#/codex/ground) for the one net, node `0`, that has no unknown.

## Differences from ngspice

In an ngspice netlist a node name is just a token in the element lines, and equal names mean one node. A net label is the schematic way of writing that. Nodal restricts names to letters, digits and underscores, and reserves `0` and `gnd`. Nodal also joins names that differ only in case, and keeps the first spelling for display.
