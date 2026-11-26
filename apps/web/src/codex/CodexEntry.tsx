// One codex entry: header, symbol, prose, parameter tables, "Try it" and related links.
// Shared by the codex page and the editor drawer. The KaTeX stylesheet is imported by each
// `?codex` module, so nothing here pulls it into the editor's first load.
import type { PartType } from "@nodal/schema";
import { useEffect, useState } from "react";
import type { StoreApi } from "zustand/vanilla";
import { loadExample } from "../editor/projectActions";
import type { EditorState } from "../editor/store";
import { EXAMPLES } from "../examples";
import { LABEL_SYMBOL, SYMBOLS } from "../symbols/catalog";
import { CODEX, type CodexEntryMeta } from "./catalog";
import { fieldRows, modelRows } from "./paramTable";
import { ParamTable } from "./ParamTable";
import { loadEntry } from "./entries";
import { codexHref } from "./route";
import "./Codex.css";

const SLOT = '<div data-codex-slot="parameters"></div>';
const KIND_LABEL = { part: "Part", analysis: "Analysis", concept: "Concept" } as const;

type Loaded =
  { state: "loading" } | { state: "ready"; html: string } | { state: "failed"; message: string };

function PartSymbol({ item }: { item: PartType | "label" }) {
  const def = item === "label" ? LABEL_SYMBOL : SYMBOLS[item];
  const { x0, y0, x1, y1 } = def.bounds;
  const Body = def.Body;
  const pins = def.pins.map((p) => p.name).join(", ");
  return (
    <figure className="nodal-codex-symbol">
      <svg
        role="img"
        aria-label={`${def.label} symbol. Pins: ${pins}.`}
        viewBox={`${String(x0 - 0.5)} ${String(y0 - 0.5)} ${String(x1 - x0 + 1)} ${String(y1 - y0 + 1)}`}
      >
        <Body />
      </svg>
      <figcaption>
        Pins:{" "}
        {def.pins.map((p, i) => (
          <span key={p.name}>
            {i > 0 ? ", " : ""}
            <span className="nodal-num">{p.name}</span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

function Parameters({ meta }: { meta: CodexEntryMeta }) {
  const item = meta.item;
  const fields = item !== undefined && item !== "label" ? fieldRows(item) : [];
  const model = meta.model !== undefined ? modelRows(meta.model) : [];
  if (fields.length === 0 && model.length === 0) return null;
  return (
    <section className="nodal-codex-params" aria-label="Parameters">
      {fields.length > 0 ? (
        <ParamTable
          caption="Inspector fields"
          firstColumn="Field"
          rows={fields.map((r) => ({ ...r, name: r.label }))}
        />
      ) : null}
      {model.length > 0 ? (
        <ParamTable
          caption={`Model card (${meta.model ?? ""})`}
          firstColumn="Parameter"
          rows={model}
        />
      ) : null}
    </section>
  );
}

/** Moves every heading in the rendered prose down by `by` levels (h2 becomes h3), capped at h6. */
export function shiftHeadings(html: string, by: number): string {
  if (by === 0) return html;
  return html.replace(/<(\/?)h([1-6])\b/g, (_m, slash: string, n: string) => {
    return `<${slash}h${String(Math.min(6, Number(n) + by))}`;
  });
}

/** `headingLevel` is the level of the entry title: 1 on the codex page, 2 in the editor drawer. */
export function CodexEntry({
  meta,
  store,
  headingLevel = 1,
}: {
  meta: CodexEntryMeta;
  store: StoreApi<EditorState>;
  headingLevel?: 1 | 2;
}) {
  const Title = headingLevel === 1 ? "h1" : "h2";
  const Section = headingLevel === 1 ? "h2" : "h3";
  const shift = headingLevel - 1;
  const [loaded, setLoaded] = useState<{ id: string; value: Loaded } | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadEntry(meta.id).then(
      ({ html }) => {
        if (!cancelled) setLoaded({ id: meta.id, value: { state: "ready", html } });
      },
      (e: unknown) => {
        if (!cancelled)
          setLoaded({
            id: meta.id,
            value: { state: "failed", message: e instanceof Error ? e.message : String(e) },
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [meta.id]);

  const body: Loaded = loaded?.id === meta.id ? loaded.value : { state: "loading" };
  const example = meta.tryIt === undefined ? undefined : EXAMPLES.find((e) => e.id === meta.tryIt);
  const html = body.state === "ready" ? shiftHeadings(body.html, shift) : "";
  const [before, after] = html.includes(SLOT)
    ? (html.split(SLOT) as [string, string])
    : [html, null];
  const related = meta.related.flatMap((id) => CODEX.find((e) => e.id === id) ?? []);

  return (
    <article className="nodal-codex-entry" aria-labelledby="nodal-codex-title">
      <header>
        <p className="nodal-panel-title">{KIND_LABEL[meta.kind]}</p>
        <Title id="nodal-codex-title">{meta.title}</Title>
        {meta.aliases.length > 0 ? (
          <p className="nodal-codex-aliases">Also known as {meta.aliases.join(", ")}</p>
        ) : null}
      </header>
      {meta.item !== undefined ? <PartSymbol item={meta.item} /> : null}
      {body.state === "loading" ? <p role="status">Loading entry…</p> : null}
      {body.state === "failed" ? <p role="alert">This entry could not be loaded.</p> : null}
      {/* Build-time output of the codex Markdown pipeline (build/codexMarkdown.ts): trusted, never user input. */}
      <div className="nodal-codex-prose" dangerouslySetInnerHTML={{ __html: before }} />
      {after !== null ? (
        <>
          <Parameters meta={meta} />
          {/* Same trusted build-time output as above. */}
          <div className="nodal-codex-prose" dangerouslySetInnerHTML={{ __html: after }} />
        </>
      ) : null}
      {example !== undefined ? (
        <p>
          <button
            type="button"
            className="nodal-button-primary"
            onClick={() => {
              if (loadExample(store, example)) window.location.hash = "#/";
            }}
          >
            Try it: open the {example.title} example
          </button>
        </p>
      ) : null}
      {related.length > 0 ? (
        <nav className="nodal-codex-related" aria-label="Related entries">
          <Section className="nodal-panel-title">Related</Section>
          <ul>
            {related.map((r) => (
              <li key={r.id}>
                <a href={codexHref(r.id)}>{r.title}</a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </article>
  );
}
