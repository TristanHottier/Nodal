// Pure property edits on parts and labels. Each returns the input object (`===`)
// when nothing changes, so the store records no history entry.
import type { Schematic } from "@nodal/schema";
import { produce } from "immer";

export function setPartName(doc: Schematic, id: string, name: string): Schematic {
  const value = name.trim();
  const part = doc.parts.find((p) => p.id === id);
  if (!part || part.name === value) return doc;
  return produce(doc, (d) => {
    const p = d.parts.find((x) => x.id === id);
    if (p) p.name = value;
  });
}

/** Store the trimmed raw string; an empty value deletes the key. */
export function setPartParam(doc: Schematic, id: string, key: string, value: string): Schematic {
  const v = value.trim();
  const part = doc.parts.find((p) => p.id === id);
  if (!part) return doc;
  const has = Object.prototype.hasOwnProperty.call(part.params, key);
  if (v === "" ? !has : part.params[key] === v) return doc;
  return produce(doc, (d) => {
    const p = d.parts.find((x) => x.id === id);
    if (!p) return;
    if (v === "") Reflect.deleteProperty(p.params, key);
    else p.params[key] = v;
  });
}

export function setLabelText(doc: Schematic, id: string, text: string): Schematic {
  const value = text.trim();
  const label = doc.labels.find((l) => l.id === id);
  if (!label || label.text === value) return doc;
  return produce(doc, (d) => {
    const l = d.labels.find((x) => x.id === id);
    if (l) l.text = value;
  });
}
