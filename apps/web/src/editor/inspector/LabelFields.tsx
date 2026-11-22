import { labelProblem } from "../../netlist/nets";
import { useEditorStore } from "../EditorContext";
import { setLabelText } from "../model/properties";
import { Field } from "./Field";

/** The same rule the netlister applies (`bad-label`). */
function labelError(text: string): string | null {
  const problem = text === "" ? null : labelProblem(text.trim());
  return problem === null ? null : `Label ${problem}`;
}

export function LabelFields({ id, text }: { id: string; text: string }) {
  const store = useEditorStore();
  return (
    <Field
      key={`${id}:text`}
      label="Text"
      value={text}
      validate={labelError}
      onCommit={(t) => {
        if (t.trim() === "") return "Label text cannot be empty";
        const s = store.getState();
        s.commit(setLabelText(s.doc, id, t));
        return undefined;
      }}
    />
  );
}
