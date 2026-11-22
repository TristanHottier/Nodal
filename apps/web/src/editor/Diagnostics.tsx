// Problems list: netlister diagnostics, errors first. Clicking a row selects its items.
import { useMemo } from "react";
import { useEditor, useEditorStore } from "./EditorContext";
import { keepFocus } from "./keepFocus";
import { useDiagnostics } from "./useDiagnostics";

export const DIAGNOSTICS_CSS = `
.nodal-problems ul { margin: 0; padding: 0; list-style: none; }
.nodal-problems button { display: flex; gap: 6px; width: 100%; padding: 3px 4px; font: inherit; text-align: left; border: 0; border-radius: 3px; background: none; cursor: pointer; }
.nodal-problems button:hover { background: #e2e8f0; }
.nodal-problems [data-severity="error"] .nodal-marker { color: #dc2626; }
.nodal-problems [data-severity="warning"] .nodal-marker { color: #b45309; }
`;

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
