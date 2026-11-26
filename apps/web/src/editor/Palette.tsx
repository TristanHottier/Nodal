// The parts panel: one button per placeable item, an icon and a one-line label each.
import { Info } from "lucide-react";
import { entryForItem } from "../codex/catalog";
import { LABEL_SYMBOL, type PALETTE, SYMBOLS } from "../symbols/catalog";
import { openerProps, rememberOpener } from "./codexOpener";
import { useEditor, useEditorStore } from "./EditorContext";
import { keepFocus } from "./keepFocus";
import { Tooltip } from "./Tooltip";

type Item = (typeof PALETTE)[number];

/** Short visible labels for the items whose catalog label would not fit on one line. */
const SHORT: Partial<Record<Item, string>> = {
  ccvs: "CCVS",
  cccs: "CCCS",
  vcvs: "VCVS",
  vccs: "VCCS",
  opamp: "Op amp",
  switch: "Switch",
};

/** Palette groups, in reading order. Every palette item appears in exactly one group. */
export const GROUPS: readonly { title: string; items: readonly Item[] }[] = [
  { title: "Sources", items: ["vsource", "isource", "vcvs", "vccs", "ccvs", "cccs"] },
  { title: "Passives", items: ["resistor", "capacitor", "inductor"] },
  { title: "Semiconductors", items: ["diode", "npn", "pnp", "nmos", "pmos"] },
  { title: "Other", items: ["switch", "opamp", "ground", "label"] },
];

const fullName = (item: Item) => (item === "label" ? LABEL_SYMBOL.label : SYMBOLS[item].label);

/** The accessible name of the info button: "About " + the full name ("net label" for the label). */
export const aboutButtonName = (item: Item) =>
  `About ${item === "label" ? "net label" : SYMBOLS[item].label}`;

/** The visible label. It is always part of the accessible name (WCAG 2.5.3). */
export const partLabel = (item: Item) => SHORT[item] ?? fullName(item);

/** The accessible name: "Place " + the catalog label, plus ", " and the short label when it adds text (axe reads parentheses as a mismatch). */
export function partButtonName(item: Item): string {
  const full = item === "label" ? "net label" : SYMBOLS[item].label;
  const short = partLabel(item);
  return full.toLowerCase().includes(short.toLowerCase())
    ? `Place ${full}`
    : `Place ${full}, ${short}`;
}

function Preview({ item }: { item: Item }) {
  const def = item === "label" ? LABEL_SYMBOL : SYMBOLS[item];
  const { x0, y0, x1, y1 } = def.bounds;
  const Body = def.Body;
  // The flag's "NET" glyph would count as visible text and break WCAG 2.5.3 (Label in Name):
  // the button's visible text is "Net label", so the icon is just the flag.
  const props = item === "label" ? { text: "" } : {};
  return (
    <svg
      aria-hidden="true"
      viewBox={`${String(x0 - 0.5)} ${String(y0 - 0.5)} ${String(x1 - x0 + 1)} ${String(y1 - y0 + 1)}`}
      className="nodal-palette-icon"
    >
      <Body {...props} />
    </svg>
  );
}

export function Palette() {
  const store = useEditorStore();
  const tool = useEditor((s) => s.tool);
  return (
    <nav className="nodal-palette" aria-label="Palette">
      {GROUPS.map(({ title, items }) => (
        <div key={title} role="group" aria-label={title} className="nodal-palette-group">
          <p className="nodal-panel-title" aria-hidden="true">
            {title}
          </p>
          {items.map((item) => (
            <div key={item} className="nodal-palette-item">
              <button
                type="button"
                onMouseDown={keepFocus}
                aria-label={partButtonName(item)}
                aria-pressed={tool.kind === "place" && tool.item === item}
                onClick={() => {
                  store.getState().setTool({ kind: "place", item, rotation: 0, mirror: false });
                }}
              >
                <Preview item={item} />
                <span aria-hidden="true" className="nodal-palette-label">
                  {partLabel(item)}
                </span>
              </button>
              <Tooltip label={aboutButtonName(item)}>
                {() => (
                  <button
                    type="button"
                    className="nodal-palette-info"
                    aria-label={aboutButtonName(item)}
                    {...openerProps(`palette:${item}`)}
                    onClick={() => {
                      rememberOpener(`palette:${item}`);
                      store.getState().openCodex(entryForItem(item).id);
                    }}
                  >
                    <Info aria-hidden="true" className="nodal-icon" />
                  </button>
                )}
              </Tooltip>
            </div>
          ))}
        </div>
      ))}
    </nav>
  );
}
