// Right-hand panel: the selected part or label, else the project name and model library.
import { SYMBOLS } from "../../symbols/catalog";
import { AnalysisEditor } from "../../simulation/AnalysisEditor";
import { Diagnostics } from "../Diagnostics";
import { useEditor } from "../EditorContext";
import { LabelFields } from "./LabelFields";
import { ModelEditor } from "./ModelEditor";
import { OpValues } from "./OpValues";
import { PartFields } from "./PartFields";
import { ProjectFields } from "./ProjectFields";
import "./Inspector.css";

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
          <OpValues part={part} />
        </>
      ) : label ? (
        <>
          <h2>Net label</h2>
          <LabelFields id={label.id} text={label.text} />
        </>
      ) : (
        <>
          <h2 className="nodal-visually-hidden">Project</h2>
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
