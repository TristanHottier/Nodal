// Right-hand panel: the selected part or label, else the project name and model library.
import { SYMBOLS } from "../../symbols/catalog";
import { AnalysisEditor } from "../../simulation/AnalysisEditor";
import { Diagnostics } from "../Diagnostics";
import { useEditor } from "../EditorContext";
import { LabelFields } from "./LabelFields";
import { ModelEditor } from "./ModelEditor";
import { PartFields } from "./PartFields";
import { ProjectFields } from "./ProjectFields";

export const INSPECTOR_CSS = `
.nodal-inspector { grid-row: 1; grid-column: 3; padding: 8px; overflow-y: auto; border-left: 1px solid #e5e7eb; background: #f8fafc; font-size: 13px; }
.nodal-inspector h2, .nodal-inspector h3 { margin: 0 0 6px; font-size: 13px; }
.nodal-inspector h3 { margin-top: 12px; }
.nodal-field { display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; }
.nodal-field-label { font-size: 12px; color: #475569; }
.nodal-field-row { display: flex; align-items: center; gap: 4px; }
.nodal-field input, .nodal-field textarea, .nodal-field select { flex: 1; min-width: 0; padding: 2px 4px; font: inherit; border: 1px solid #cbd5e1; border-radius: 3px; background: #fff; }
.nodal-field [aria-invalid="true"] { border-color: #dc2626; }
.nodal-unit, .nodal-hint { font-size: 11px; color: #64748b; }
.nodal-error { font-size: 11px; color: #dc2626; }
.nodal-model { margin: 8px 0 0; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff; }
.nodal-model button { font: inherit; }
`;

export function Inspector() {
  const selection = useEditor((s) => s.selection);
  const doc = useEditor((s) => s.doc);
  const id = selection.length === 1 ? selection[0] : undefined;
  const part = doc.parts.find((p) => p.id === id);
  const label = doc.labels.find((l) => l.id === id);
  return (
    <aside className="nodal-inspector" aria-label="Inspector">
      {part ? (
        <>
          <h2>{SYMBOLS[part.type].label}</h2>
          <PartFields part={part} />
        </>
      ) : label ? (
        <>
          <h2>Net label</h2>
          <LabelFields id={label.id} text={label.text} />
        </>
      ) : (
        <>
          {selection.length > 1 ? <p>{String(selection.length)} items selected</p> : null}
          <ProjectFields />
          <ModelEditor />
          <AnalysisEditor />
        </>
      )}
      <Diagnostics />
    </aside>
  );
}
