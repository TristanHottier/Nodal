import { useMemo } from "react";
import type { Diagnostic } from "../netlist/diagnostics";
import { projectToNetlist } from "../netlist/netlister";
import { useEditor } from "./EditorContext";

/** Netlister problems for the current document, recomputed when it or the project changes. */
export function useDiagnostics(): Diagnostic[] {
  const doc = useEditor((s) => s.doc);
  const project = useEditor((s) => s.project);
  return useMemo(
    () => projectToNetlist({ ...project, schematic: doc }).diagnostics,
    [doc, project],
  );
}
