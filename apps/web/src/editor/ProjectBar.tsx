// Examples, New, Open… and Save as… for `.nodal.json` files, shown in the top bar.
import { newProject } from "@nodal/schema";
import { Download, FilePlus, FolderOpen } from "lucide-react";
import { useRef } from "react";
import { EXAMPLES } from "../examples";
import { downloadProject, readProjectFile } from "../storage/files";
import { useEditorStore } from "./EditorContext";
import { keepFocus } from "./keepFocus";
import { loadExample, mayReplaceProject } from "./projectActions";

export function ProjectBar() {
  const store = useEditorStore();
  const fileInput = useRef<HTMLInputElement>(null);

  const mayReplace = () => mayReplaceProject(store);

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
      <select
        aria-label="Open example"
        value=""
        onChange={(e) => {
          const example = EXAMPLES.find((x) => x.id === e.currentTarget.value);
          e.currentTarget.value = "";
          if (example) loadExample(store, example);
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
        <FilePlus aria-hidden="true" className="nodal-icon" />
        New
      </button>
      <button
        type="button"
        onMouseDown={keepFocus}
        onClick={() => {
          fileInput.current?.click();
        }}
      >
        <FolderOpen aria-hidden="true" className="nodal-icon" />
        Open…
      </button>
      <button
        type="button"
        onMouseDown={keepFocus}
        onClick={() => {
          downloadProject(store.getState().getProject());
        }}
      >
        <Download aria-hidden="true" className="nodal-icon" />
        Save as…
      </button>
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
