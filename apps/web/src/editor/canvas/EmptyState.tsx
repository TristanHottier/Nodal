// First-run prompt over an empty canvas: the bundled examples as buttons, and a pointer to the
// parts panel. The read-only view has no parts panel, so it offers the examples only.
import { EXAMPLES } from "../../examples";
import { useEditor, useEditorStore } from "../EditorContext";
import { loadExample } from "../projectActions";
import "./EmptyState.css";

export function EmptyState({ readOnly = false }: { readOnly?: boolean }) {
  const store = useEditorStore();
  const empty = useEditor((s) => s.doc.parts.length === 0);
  if (!empty) return null;
  return (
    <div className="nodal-empty">
      <div className="nodal-empty-card">
        <h2 className="nodal-empty-title">Start from an example</h2>
        <ul className="nodal-empty-list">
          {EXAMPLES.map((x) => (
            <li key={x.id}>
              <button
                type="button"
                title={x.summary}
                onClick={() => {
                  loadExample(store, x);
                }}
              >
                {x.title}
              </button>
            </li>
          ))}
        </ul>
        {readOnly ? null : <p className="nodal-empty-or">or pick a part from the left</p>}
      </div>
    </div>
  );
}
