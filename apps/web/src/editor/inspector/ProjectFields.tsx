import { useEditor, useEditorStore } from "../EditorContext";
import { splitProjectName } from "../TopBar";
import { Field } from "./Field";

export function ProjectFields() {
  const store = useEditorStore();
  const name = useEditor((s) => s.project.name);
  const { description } = splitProjectName(name);
  return (
    <Field
      label="Project name"
      {...(description ? { hint: description } : {})}
      value={name}
      onCommit={(t) => {
        if (t.trim() === "") return "Name cannot be empty";
        store.getState().setProjectName(t.trim());
        return undefined;
      }}
    />
  );
}
