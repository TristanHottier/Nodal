// Tool and symbol palette: Select, Wire, and one button per placeable item.
import { LABEL_SYMBOL, PALETTE, SYMBOLS } from "../symbols/catalog";
import { useEditor, useEditorStore } from "./EditorContext";
import { keepFocus } from "./keepFocus";
import { ProjectBar } from "./ProjectBar";
import type { Tool } from "./store";

type Item = (typeof PALETTE)[number];

function Preview({ item }: { item: Item }) {
  const def = item === "label" ? LABEL_SYMBOL : SYMBOLS[item];
  const { x0, y0, x1, y1 } = def.bounds;
  const Body = def.Body;
  return (
    <svg
      aria-hidden="true"
      width={28}
      height={28}
      viewBox={`${String(x0 - 0.5)} ${String(y0 - 0.5)} ${String(x1 - x0 + 1)} ${String(y1 - y0 + 1)}`}
      className="nodal-palette-icon"
    >
      <Body />
    </svg>
  );
}

const itemName = (item: Item) => (item === "label" ? "net label" : SYMBOLS[item].label);

export function Palette() {
  const store = useEditorStore();
  const tool = useEditor((s) => s.tool);
  const choose = (t: Tool) => {
    store.getState().setTool(t);
  };
  return (
    <nav className="nodal-palette" aria-label="Palette">
      <ProjectBar />
      <hr />
      <button
        type="button"
        onMouseDown={keepFocus}
        aria-label="Select"
        aria-pressed={tool.kind === "select"}
        onClick={() => {
          choose({ kind: "select" });
        }}
      >
        Select
      </button>
      <button
        type="button"
        onMouseDown={keepFocus}
        aria-label="Wire"
        aria-pressed={tool.kind === "wire"}
        onClick={() => {
          choose({ kind: "wire" });
        }}
      >
        Wire
      </button>
      <button
        type="button"
        onMouseDown={keepFocus}
        aria-label="Probe"
        aria-pressed={tool.kind === "probe"}
        onClick={() => {
          choose({ kind: "probe" });
        }}
      >
        Probe
      </button>
      <hr />
      {PALETTE.map((item) => (
        <button
          type="button"
          onMouseDown={keepFocus}
          key={item}
          aria-label={`Place ${itemName(item)}`}
          aria-pressed={tool.kind === "place" && tool.item === item}
          onClick={() => {
            choose({ kind: "place", item, rotation: 0, mirror: false });
          }}
        >
          <Preview item={item} />
          <span aria-hidden="true">
            {item === "label" ? LABEL_SYMBOL.label : SYMBOLS[item].label}
          </span>
        </button>
      ))}
    </nav>
  );
}
