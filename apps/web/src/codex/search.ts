// Codex search: title prefix, then title substring, then alias, then keyword.
import type { CodexEntryMeta } from "./catalog";

type Searchable = Pick<CodexEntryMeta, "title" | "aliases" | "keywords">;

const fold = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

function rank(entry: Searchable, q: string): number {
  const title = fold(entry.title);
  if (title.startsWith(q)) return 0;
  if (title.includes(q)) return 1;
  if (entry.aliases.some((a) => fold(a).includes(q))) return 2;
  if (entry.keywords.some((k) => fold(k).includes(q))) return 3;
  return -1;
}

/** Matching entries, best rank first and catalog order within a rank. An empty query returns all. */
export function searchCodex<T extends Searchable>(query: string, entries: readonly T[]): T[] {
  const q = fold(query);
  if (q === "") return [...entries];
  return entries
    .map((entry, index) => ({ entry, index, r: rank(entry, q) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.index - b.index)
    .map((x) => x.entry);
}
