// Problems list: netlister diagnostics, errors first. Clicking a row selects its items.
import { useMemo } from "react";
import { useEditor, useEditorStore } from "./EditorContext";
import { keepFocus } from "./keepFocus";
import { useDiagnostics } from "./useDiagnostics";
import "./Diagnostics.css";

export function Diagnostics() {
  const store = useEditorStore();
  const doc = useEditor((s) => s.doc);
  const diagnostics = useDiagnostics();
  const sorted = useMemo(
    () => [
      ...diagnostics.filter((d) => d.severity === "error"),
      ...diagnostics.filter((d) => d.severity === "warning"),
    ],
    [diagnostics],
  );
  const choose = (itemIds: readonly string[]) => {
    const ids = new Set([...doc.parts, ...doc.wires, ...doc.labels].map((i) => i.id));
    store.getState().select(itemIds.filter((id) => ids.has(id)));
  };
  return (
    <section className="nodal-problems" aria-label="Problems">
      <h3>Problems</h3>
      {sorted.length === 0 ? (
        <p>No problems</p>
      ) : (
        <ul>
          {sorted.map((d, i) => (
            <li key={`${d.code}-${String(i)}`}>
              <button
                type="button"
                data-severity={d.severity}
                onMouseDown={keepFocus}
                onClick={() => {
                  choose(d.itemIds);
                }}
              >
                <span aria-hidden="true" className="nodal-marker">
                  {d.severity === "error" ? "✖" : "⚠"}
                </span>
                <span>{d.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
