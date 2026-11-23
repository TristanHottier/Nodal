// The icon tool rail: Select, Wire and Probe. A vertical toolbar with one tab stop (roving focus),
// and a tooltip with the shortcut on each button.
import { Crosshair, MousePointer2, Spline } from "lucide-react";
import { type KeyboardEvent, type RefObject, createRef, useMemo, useState } from "react";
import { useEditor, useEditorStore } from "./EditorContext";
import { keepFocus } from "./keepFocus";
import type { Tool } from "./store";
import { Tooltip } from "./Tooltip";
import "./ToolRail.css";

type Kind = "select" | "wire" | "probe";

const TOOLS: readonly { kind: Kind; label: string; shortcut: string; Icon: typeof Spline }[] = [
  { kind: "select", label: "Select", shortcut: "Esc", Icon: MousePointer2 },
  { kind: "wire", label: "Wire", shortcut: "W", Icon: Spline },
  { kind: "probe", label: "Probe", shortcut: "P", Icon: Crosshair },
];

export function ToolRail() {
  const store = useEditorStore();
  const tool = useEditor((s) => s.tool);
  const refs = useMemo<RefObject<HTMLButtonElement | null>[]>(
    () => TOOLS.map(() => createRef<HTMLButtonElement>()),
    [],
  );
  const activeIndex = Math.max(
    0,
    TOOLS.findIndex((t) => t.kind === tool.kind),
  );
  // The tab stop sits on the active tool until arrow keys move it.
  const [stop, setStop] = useState<{ for: Tool["kind"]; index: number } | null>(null);
  const tabStop = stop !== null && stop.for === tool.kind ? stop.index : activeIndex;

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const n = TOOLS.length;
    const from = refs.findIndex((r) => r.current === document.activeElement);
    const to =
      e.key === "ArrowDown"
        ? (from + 1) % n
        : e.key === "ArrowUp"
          ? (from - 1 + n) % n
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? n - 1
              : -1;
    if (to < 0 || from < 0) return;
    e.preventDefault();
    setStop({ for: tool.kind, index: to });
    refs[to]?.current?.focus();
  };

  return (
    <nav className="nodal-rail" aria-label="Tool rail">
      <div role="toolbar" aria-label="Tools" aria-orientation="vertical" onKeyDown={onKeyDown}>
        {TOOLS.map(({ kind, label, shortcut, Icon }, i) => (
          <Tooltip key={kind} label={label} shortcut={shortcut}>
            {(describedBy) => (
              <button
                ref={refs[i] ?? null}
                type="button"
                className="nodal-rail-button"
                aria-label={label}
                aria-describedby={describedBy}
                aria-pressed={tool.kind === kind}
                tabIndex={i === tabStop ? 0 : -1}
                onMouseDown={keepFocus}
                onClick={() => {
                  store.getState().setTool({ kind });
                  setStop(null);
                }}
              >
                <Icon aria-hidden="true" className="nodal-icon" />
              </button>
            )}
          </Tooltip>
        ))}
      </div>
    </nav>
  );
}
