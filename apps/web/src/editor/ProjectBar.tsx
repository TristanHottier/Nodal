// New, Open… and Save as… for `.nodal.json` files, shown above the tools.
import { newProject } from "@nodal/schema";
import { useRef } from "react";
import { EXAMPLES } from "../examples";
import { downloadProject, readProjectFile } from "../storage/files";
import { useEditorStore } from "./EditorContext";
import { keepFocus } from "./keepFocus";

const CONFIRM = "Replace the current project? Export it first if you want to keep it.";

export function ProjectBar() {
  const store = useEditorStore();
  const fileInput = useRef<HTMLInputElement>(null);

  const mayReplace = (): boolean => {
    const { doc, project } = store.getState();
    const empty =
      doc.parts.length === 0 &&
      doc.wires.length === 0 &&
      doc.labels.length === 0 &&
      project.models.length === 0 &&
      project.name === "Untitled";
    return empty || window.confirm(CONFIRM);
  };

  const onFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const r = await readProjectFile(file);
    const s = store.getState();
    if (!r.ok) {
      s.setStatusMessage(`Could not open ${file.name}: ${r.error}`);
      return;
    }
    if (!mayReplace()) return;
    s.loadProject(r.project);
    s.setStatusMessage(null);
  };

  return (
    <div className="nodal-projectbar" role="group" aria-label="Project">
      <button
        type="button"
        onMouseDown={keepFocus}
        onClick={() => {
          if (!mayReplace()) return;
          const s = store.getState();
          s.loadProject(newProject("Untitled", new Date().toISOString()));
          s.setStatusMessage(null);
        }}
      >
        New
      </button>
      <button
        type="button"
        onMouseDown={keepFocus}
        onClick={() => {
          fileInput.current?.click();
        }}
      >
        Open…
      </button>
      <button
        type="button"
        onMouseDown={keepFocus}
        onClick={() => {
          downloadProject(store.getState().getProject());
        }}
      >
        Save as…
      </button>
      <select
        aria-label="Open example"
        value=""
        onChange={(e) => {
          const example = EXAMPLES.find((x) => x.id === e.currentTarget.value);
          e.currentTarget.value = "";
          if (!example || !mayReplace()) return;
          const s = store.getState();
          s.loadProject(example.load());
          s.setStatusMessage(null);
        }}
      >
        <option value="" disabled>
          Examples…
        </option>
        {EXAMPLES.map((x) => (
          <option key={x.id} value={x.id} title={x.summary}>
            {x.title}
          </option>
        ))}
      </select>
      <input
        ref={fileInput}
        type="file"
        hidden
        data-testid="open-file"
        accept=".json,.nodal.json"
        aria-label="Open project file"
        onChange={(e) => {
          void onFile(e.currentTarget);
        }}
      />
    </div>
  );
}
