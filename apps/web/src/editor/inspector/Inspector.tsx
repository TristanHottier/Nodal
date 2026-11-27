// Right-hand panel: the selected part or label, else the project name and model library.
import { entryForItem } from "../../codex/catalog";
import { SYMBOLS } from "../../symbols/catalog";
import { AnalysisEditor } from "../../simulation/AnalysisEditor";
import { Diagnostics } from "../Diagnostics";
import { openerProps, rememberOpener } from "../codexOpener";
import { useEditor, useEditorStore } from "../EditorContext";
import { LabelFields } from "./LabelFields";
import { ModelEditor } from "./ModelEditor";
import { OpValues } from "./OpValues";
import { PartFields } from "./PartFields";
import { ProjectFields } from "./ProjectFields";
import "./Inspector.css";

export function Inspector() {
  const store = useEditorStore();
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
          <button
            type="button"
            className="nodal-link-button"
            {...openerProps("inspector:part")}
            onClick={() => {
              rememberOpener("inspector:part");
              store.getState().openCodex(entryForItem(part.type).id);
            }}
          >
            About this part
          </button>
          <PartFields part={part} />
          <OpValues part={part} />
        </>
      ) : label ? (
        <>
          <h2>Net label</h2>
          <button
            type="button"
            className="nodal-link-button"
            {...openerProps("inspector:label")}
            onClick={() => {
              rememberOpener("inspector:label");
              store.getState().openCodex(entryForItem("label").id);
            }}
          >
            About this label
          </button>
          <LabelFields id={label.id} text={label.text} />
        </>
      ) : (
        <>
          {selection.length > 1 ? <p>{String(selection.length)} items selected</p> : null}
          <AnalysisEditor />
          <ProjectFields />
          <details className="nodal-models">
            <summary>Models</summary>
            <ModelEditor />
          </details>
        </>
      )}
      <Diagnostics />
    </aside>
  );
}
