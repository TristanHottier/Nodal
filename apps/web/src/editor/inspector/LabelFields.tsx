import { nodeNameRegex } from "@nodal/schema";
import { useEditorStore } from "../EditorContext";
import { setLabelText } from "../model/properties";
import { Field } from "./Field";

export const NODE_NAME_MESSAGE = "Use letters, digits and _";

export function LabelFields({ id, text }: { id: string; text: string }) {
  const store = useEditorStore();
  return (
    <Field
      key={`${id}:text`}
      label="Text"
      value={text}
      validate={(t) => (t !== "" && !nodeNameRegex.test(t.trim()) ? NODE_NAME_MESSAGE : null)}
      onCommit={(t) => {
        if (t.trim() === "") return "Label text cannot be empty";
        const s = store.getState();
        s.commit(setLabelText(s.doc, id, t));
        return undefined;
      }}
    />
  );
}
