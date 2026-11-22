// The fields of one analysis, by type, and the defaults for a new one.
import type { Analysis, Schematic } from "@nodal/schema";
import { SelectField } from "../editor/inspector/Field";
import { NumberField } from "./numberField";

export const ANALYSIS_TYPES = [
  { value: "op", text: "Operating point" },
  { value: "dc", text: "DC sweep" },
  { value: "ac", text: "AC sweep" },
  { value: "tran", text: "Transient" },
] as const;

export const analysisLabel = (a: Analysis): string =>
  ANALYSIS_TYPES.find((t) => t.value === a.type)?.text ?? a.type;

export const sourceNames = (doc: Schematic): string[] =>
  doc.parts.filter((p) => p.type === "vsource" || p.type === "isource").map((p) => p.name);

export function defaultAnalysis(type: Analysis["type"], doc: Schematic): Analysis {
  switch (type) {
    case "op":
      return { type: "op" };
    case "dc":
      return { type: "dc", source: sourceNames(doc)[0] ?? "", start: 0, stop: 5, step: 0.1 };
    case "ac":
      return { type: "ac", sweep: "dec", points: 10, fstart: 1, fstop: 1e6 };
    case "tran":
      return { type: "tran", tstep: 1e-6, tstop: 1e-3, tstart: 0, tmax: undefined, uic: false };
  }
}

const positive = (n: number) => (n > 0 ? null : "Must be greater than 0");
const nonNegative = (n: number) => (n >= 0 ? null : "Must be 0 or more");

interface Props {
  analysis: Analysis;
  sources: string[];
  onChange: (next: Analysis) => void;
}

export function AnalysisFields({ analysis: a, sources, onChange }: Props) {
  switch (a.type) {
    case "op":
      return null;
    case "dc": {
      const choices = sources.includes(a.source) ? sources : [a.source, ...sources];
      return (
        <>
          <SelectField
            label="source"
            value={a.source}
            options={choices.map((n) => ({ value: n, text: n === "" ? "No source" : n }))}
            onChange={(source) => {
              onChange({ ...a, source });
            }}
          />
          <NumberField
            label="start"
            value={a.start}
            onSet={(n) => {
              if (n !== undefined) onChange({ ...a, start: n });
            }}
          />
          <NumberField
            label="stop"
            value={a.stop}
            onSet={(n) => {
              if (n !== undefined) onChange({ ...a, stop: n });
            }}
          />
          <NumberField
            label="step"
            value={a.step}
            check={(n) => (n === 0 ? "Must not be 0" : null)}
            onSet={(n) => {
              if (n !== undefined) onChange({ ...a, step: n });
            }}
          />
        </>
      );
    }
    case "ac":
      return (
        <>
          <SelectField
            label="sweep"
            value={a.sweep}
            options={[
              { value: "lin", text: "lin" },
              { value: "dec", text: "dec" },
              { value: "oct", text: "oct" },
            ]}
            onChange={(v) => {
              if (v === "lin" || v === "dec" || v === "oct") onChange({ ...a, sweep: v });
            }}
          />
          <NumberField
            label="points"
            value={a.points}
            check={(n) =>
              Number.isInteger(n) && n >= 1 ? null : "Must be a whole number, 1 or more"
            }
            onSet={(n) => {
              if (n !== undefined) onChange({ ...a, points: n });
            }}
          />
          <NumberField
            label="fstart"
            unit="Hz"
            value={a.fstart}
            check={nonNegative}
            onSet={(n) => {
              if (n !== undefined) onChange({ ...a, fstart: n });
            }}
          />
          <NumberField
            label="fstop"
            unit="Hz"
            value={a.fstop}
            check={nonNegative}
            onSet={(n) => {
              if (n !== undefined) onChange({ ...a, fstop: n });
            }}
          />
        </>
      );
    case "tran": {
      return (
        <>
          <NumberField
            label="tstep"
            unit="s"
            value={a.tstep}
            check={positive}
            onSet={(n) => {
              if (n !== undefined) onChange({ ...a, tstep: n });
            }}
          />
          <NumberField
            label="tstop"
            unit="s"
            value={a.tstop}
            check={positive}
            onSet={(n) => {
              if (n !== undefined) onChange({ ...a, tstop: n });
            }}
          />
          <NumberField
            label="tstart"
            unit="s"
            value={a.tstart}
            check={nonNegative}
            onSet={(n) => {
              if (n !== undefined) onChange({ ...a, tstart: n });
            }}
          />
          <NumberField
            label="tmax"
            unit="s"
            optional
            emptyHint="Optional: largest time step"
            value={a.tmax}
            check={positive}
            onSet={(n) => {
              onChange({ ...a, tmax: n });
            }}
          />
          <label className="nodal-check">
            <input
              type="checkbox"
              checked={a.uic}
              onChange={(e) => {
                onChange({ ...a, uic: e.target.checked });
              }}
            />
            uic
          </label>
        </>
      );
    }
  }
}
