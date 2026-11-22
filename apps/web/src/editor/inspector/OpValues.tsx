// The selected part's operating-point values: its branch current and the voltage at each pin.
import type { Part } from "@nodal/schema";
import { irName } from "../../netlist/elements";
import { formatQuantity } from "../../netlist/value";
import { useOpView } from "../../simulation/SimulationContext";
import { SYMBOLS } from "../../symbols/catalog";

export function OpValues({ part }: { part: Part }) {
  const view = useOpView();
  if (!view) return null;
  const { result, map } = view;
  const voltage = (net: string): number | null => {
    if (net === "0") return 0;
    const s = result.signals.find((x) => x.kind === "v" && x.name === net);
    return s?.re[0] ?? null;
  };
  const name = irName(part);
  const current = result.signals.find((s) => s.kind === "i" && s.name === name)?.re[0];
  const rows = SYMBOLS[part.type].pins.flatMap((pin) => {
    const net = map.netOfPin.get(`${part.id}:${pin.name}`);
    const v = net === undefined ? null : voltage(net);
    return net === undefined || v === null
      ? []
      : [{ pin: pin.name, text: `${pin.name}: ${net} = ${formatQuantity(v, "V")}` }];
  });
  if (current === undefined && rows.length === 0) return null;
  return (
    <section aria-label="Operating point" style={{ opacity: view.stale ? 0.5 : 1 }}>
      <h3>Operating point</h3>
      {current !== undefined && (
        <div className="nodal-num">{`I(${name}) = ${formatQuantity(current, "A")}`}</div>
      )}
      {rows.map((r) => (
        <div key={r.pin} className="nodal-num">
          {r.text}
        </div>
      ))}
    </section>
  );
}
