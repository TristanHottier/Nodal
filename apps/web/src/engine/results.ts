// Decoding of the flat result buffer and the located errors produced by the wasm engine.
import { z } from "zod";

export type SignalKind = "v" | "i";

export interface Signal {
  name: string;
  kind: SignalKind;
  re: Float64Array;
  /** Imaginary parts; present for ac only. */
  im?: Float64Array;
}

export interface SimResult {
  type: "op" | "dc" | "ac" | "tran";
  source?: string;
  /** Sweep values, frequencies or times; empty for op. */
  axis: Float64Array;
  signals: Signal[];
}

export interface EngineErrorInfo {
  message: string;
  elements: string[];
  nodes: string[];
}

const metaSchema = z.object({
  type: z.enum(["op", "dc", "ac", "tran"]),
  // The engine serializes an absent source as null.
  source: z.string().nullish(),
  points: z.number().int().nonnegative(),
  signals: z.array(z.object({ name: z.string(), kind: z.enum(["v", "i"]) })),
});

const errorSchema = z.object({
  message: z.string(),
  elements: z.array(z.string()),
  nodes: z.array(z.string()),
});

const malformed = (why: string): Error => new Error(`malformed engine result: ${why}`);

/**
 * Splits the flat buffer described by `meta` into an axis and signals.
 * Layout: axis (`points` values; none for op), then per signal `points` real
 * values and, for ac, `points` imaginary values. Arrays are views of `data`.
 */
export function decodeResult(meta: string, data: Float64Array): SimResult {
  let raw: unknown;
  try {
    raw = JSON.parse(meta);
  } catch (e) {
    throw malformed(`metadata is not JSON (${e instanceof Error ? e.message : String(e)})`);
  }
  const parsed = metaSchema.safeParse(raw);
  if (!parsed.success) throw malformed(parsed.error.message);
  const { type, source, points, signals } = parsed.data;

  const axisLen = type === "op" ? 0 : points;
  const parts = type === "ac" ? 2 : 1;
  const expected = axisLen + signals.length * points * parts;
  if (data.length !== expected) {
    throw malformed(`expected ${String(expected)} values, got ${String(data.length)}`);
  }

  const axis = data.subarray(0, axisLen);
  let offset = axisLen;
  const out: Signal[] = signals.map(({ name, kind }) => {
    const re = data.subarray(offset, offset + points);
    offset += points;
    if (type !== "ac") return { name, kind, re };
    const im = data.subarray(offset, offset + points);
    offset += points;
    return { name, kind, re, im };
  });

  const result: SimResult = { type, axis, signals: out };
  if (source != null) result.source = source;
  return result;
}

/** Parses the JSON string thrown by the engine; anything else becomes a bare message. */
export function decodeError(raw: unknown): EngineErrorInfo {
  if (typeof raw === "string") {
    try {
      const parsed = errorSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    } catch {
      // Not JSON: fall through to the bare message.
    }
  }
  return { message: String(raw), elements: [], nodes: [] };
}

export function signalKey(s: { name: string; kind: SignalKind }): string {
  return s.kind === "v" ? `V(${s.name})` : `I(${s.name})`;
}
