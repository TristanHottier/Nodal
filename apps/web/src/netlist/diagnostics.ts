export type DiagnosticCode =
  | "no-ground"
  | "invalid-value"
  | "missing-value"
  | "bad-name"
  | "duplicate-name"
  | "bad-label"
  | "label-conflict"
  | "missing-model"
  | "model-type-mismatch"
  | "invalid-model"
  | "unknown-control-source"
  | "unknown-sweep-source"
  | "shorted-element"
  | "dangling-pin"
  | "unconnected-part"
  | "ir-invalid";

export interface Diagnostic {
  severity: "error" | "warning";
  code: DiagnosticCode;
  message: string;
  /** Ids of the parts or labels involved. */
  itemIds: string[];
}
