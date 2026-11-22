// Value notation (ADR 0009): SPICE-style suffixes, case-sensitive.
// `m` is milli, `M` and `meg`/`Meg` are mega.

export type ValueResult = { ok: true; value: number } | { ok: false; error: string };
export type PwlResult = { ok: true; points: [number, number][] } | { ok: false; error: string };

const SUFFIX_EXPONENT: Record<string, number> = {
  f: -15,
  p: -12,
  n: -9,
  u: -6,
  µ: -6,
  μ: -6,
  m: -3,
  k: 3,
  M: 6,
  meg: 6,
  Meg: 6,
  G: 9,
  T: 12,
};

const PLAIN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const WITH_SUFFIX = /^([+-]?(?:\d+\.?\d*|\.\d+))(f|p|n|u|µ|μ|m|k|M|G|T|meg|Meg)$/;

export function parseValue(text: string): ValueResult {
  const t = text.trim();
  let n: number;
  const suffixed = WITH_SUFFIX.exec(t);
  if (suffixed) {
    const [, mantissa = "", suffix = ""] = suffixed;
    // One Number() call on "<mantissa>e<exp>" keeps 10u exactly 1e-5.
    n = Number(`${mantissa}e${String(SUFFIX_EXPONENT[suffix])}`);
  } else if (PLAIN.test(t)) {
    n = Number(t);
  } else {
    return { ok: false, error: `not a number: ${text}` };
  }
  if (!Number.isFinite(n)) return { ok: false, error: `number out of range: ${text}` };
  return { ok: true, value: n };
}

const SUFFIX_OF_EXPONENT = new Map<number, string>([
  [-15, "f"],
  [-12, "p"],
  [-9, "n"],
  [-6, "u"],
  [-3, "m"],
  [0, ""],
  [3, "k"],
  [6, "Meg"],
  [9, "G"],
  [12, "T"],
]);

/**
 * Engineering notation with the suffix that puts the mantissa in [1, 1000).
 * `parseValue(formatValue(x))` returns x for values of at most `digits`
 * significant digits. Outside 1e-15…1e15 the plain `String(n)` is used.
 */
export function formatValue(n: number, digits = 12): string {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (!Number.isFinite(n) || abs < 1e-15 || abs >= 1e15) return String(n);
  // toExponential rounds first, so a carry such as 999.9999999999999 -> 1e3 lands in the exponent.
  const [m = "", e = "0"] = n.toExponential(digits - 1).split("e");
  const exp = Number(e);
  const group = Math.floor(exp / 3) * 3;
  const mantissa = Number(`${m}e${String(exp - group)}`);
  return `${String(Number(mantissa.toPrecision(digits)))}${SUFFIX_OF_EXPONENT.get(group) ?? ""}`;
}

/** Parses "t v" pairs separated by ";" or newlines. Monotonic time is checked elsewhere. */
export function parsePwl(text: string): PwlResult {
  const segments = text
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
  if (segments.length === 0)
    return { ok: false, error: "no points: expected pairs like 0 0; 1m 5" };
  const points: [number, number][] = [];
  for (const seg of segments) {
    const parts = seg.split(/\s+/);
    if (parts.length !== 2) {
      return { ok: false, error: `expected "<time> <value>" in "${seg}"` };
    }
    const [ts = "", vs = ""] = parts;
    const t = parseValue(ts);
    if (!t.ok) return { ok: false, error: `${t.error} (in "${seg}")` };
    const v = parseValue(vs);
    if (!v.ok) return { ok: false, error: `${v.error} (in "${seg}")` };
    points.push([t.value, v.value]);
  }
  return { ok: true, points };
}
