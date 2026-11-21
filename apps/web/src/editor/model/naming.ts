// Automatic names for parts and net labels.
import type { Schematic } from "@nodal/schema";

function maxSuffix(names: readonly string[], prefix: string): number {
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)$`, "i");
  let max = 0;
  for (const name of names) {
    const m = re.exec(name);
    if (m?.[1]) max = Math.max(max, Number(m[1]));
  }
  return max;
}

/** `prefix` plus one more than the largest numeric suffix in use (`R1` when none). */
export function nextName(doc: Schematic, prefix: string): string {
  const max = maxSuffix(
    doc.parts.map((p) => p.name),
    prefix,
  );
  return prefix + String(max + 1);
}

/** `NET1`, `NET2`... for new net labels. */
export function nextLabelText(doc: Schematic): string {
  const max = maxSuffix(
    doc.labels.map((l) => l.text),
    "NET",
  );
  return "NET" + String(max + 1);
}
