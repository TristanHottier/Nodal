// The codex: an index of every entry (searchable, grouped by kind) and one entry at a time.
// Reached only through `lazy(() => import("./codex/CodexPage"))` in App.tsx, so it and the
// entry content stay out of the editor's first load (scripts/check-first-load.mjs).
import { useEffect, useId, useState } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { EditorState } from "../editor/store";
import { CODEX, type EntryKind } from "./catalog";
import { CodexEntry } from "./CodexEntry";
import { codexHref } from "./route";
import { searchCodex } from "./search";
import "./Codex.css";

const GROUPS: readonly { kind: EntryKind; title: string }[] = [
  { kind: "part", title: "Parts" },
  { kind: "analysis", title: "Analyses" },
  { kind: "concept", title: "Concepts" },
];

function Results({ query, onPick }: { query: string; onPick: () => void }) {
  const found = searchCodex(query, CODEX);
  if (found.length === 0) return <p role="status">No entry matches “{query}”.</p>;
  return (
    <ul className="nodal-codex-list" aria-label="Search results">
      {found.map((e) => (
        <li key={e.id}>
          <a href={codexHref(e.id)} onClick={onPick}>
            {e.title}
          </a>
          <span className="nodal-codex-kind">{e.kind}</span>
        </li>
      ))}
    </ul>
  );
}

function Index() {
  return (
    <div className="nodal-codex-index">
      {GROUPS.map(({ kind, title }) => (
        <section key={kind} aria-labelledby={`nodal-codex-group-${kind}`}>
          <h2 id={`nodal-codex-group-${kind}`} className="nodal-panel-title">
            {title}
          </h2>
          <ul className="nodal-codex-list">
            {CODEX.filter((e) => e.kind === kind).map((e) => (
              <li key={e.id}>
                <a href={codexHref(e.id)}>{e.title}</a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default function CodexPage({
  id,
  store,
}: {
  id: string | null;
  store: StoreApi<EditorState>;
}) {
  const [query, setQuery] = useState("");
  const searchId = useId();
  const meta = id === null ? undefined : CODEX.find((e) => e.id === id);
  const searching = query.trim() !== "";

  useEffect(() => {
    if (id === null) document.title = "Codex · Nodal";
    else if (meta === undefined) document.title = `No entry called ${id} · Codex · Nodal`;
    else document.title = `${meta.title} · Codex · Nodal`;
  }, [id, meta]);

  // A new entry or the index starts a fresh search.
  useEffect(() => {
    setQuery("");
  }, [id]);

  let main;
  if (searching)
    main = (
      <Results
        query={query}
        onPick={() => {
          setQuery("");
        }}
      />
    );
  else if (id === null) main = <Index />;
  else if (meta === undefined)
    main = (
      <div className="nodal-codex-missing" role="alert">
        <h1>No entry called {id}</h1>
        <p>
          <a href={codexHref()}>Back to the codex index</a>
        </p>
      </div>
    );
  else main = <CodexEntry key={meta.id} meta={meta} store={store} />;

  return (
    <div className="nodal-codex">
      <header className="nodal-codex-bar">
        <a className="nodal-codex-back" href="#/">
          Back to editor
        </a>
        <a className="nodal-codex-home" href={codexHref()}>
          Codex
        </a>
        <div role="search" className="nodal-codex-search">
          <label htmlFor={searchId} className="nodal-visually-hidden">
            Search the codex
          </label>
          <input
            id={searchId}
            type="search"
            placeholder="Search parts, analyses, concepts"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
          />
        </div>
      </header>
      <main className="nodal-codex-main">
        {id === null || searching ? <h1>Codex</h1> : null}
        {main}
      </main>
    </div>
  );
}
