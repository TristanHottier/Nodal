// Lazy loader for the codex entries: one chunk per Markdown file, rendered at build time.
export interface CodexEntryHtml {
  html: string;
  title: string;
}

const entries = import.meta.glob<CodexEntryHtml>("./entries/*.md", {
  query: "?codex",
  import: "default",
});

export function loadEntry(id: string): Promise<CodexEntryHtml> {
  const load = entries[`./entries/${id}.md`];
  if (load === undefined) return Promise.reject(new Error(`no codex entry "${id}"`));
  return load();
}
