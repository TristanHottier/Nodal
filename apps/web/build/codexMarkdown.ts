// Build-time Markdown and KaTeX for the codex entries. `renderEntry` is pure (no `src/` import at
// runtime: the caller passes the entry kind and id); `codexMarkdown()` is the Vite plugin that
// turns `entries/<id>.md?codex` into `{ html, title }`.
import katex from "katex";
import { Marked, type Token, type Tokens } from "marked";
import type { Plugin } from "vite";

export type EntryKind = "part" | "analysis" | "concept";

export interface RenderedEntry {
  html: string;
  title: string;
}

const SECTIONS: Record<EntryKind, readonly string[]> = {
  part: [
    "What it is",
    "Typical uses",
    "How it works",
    "Equations",
    "In the MNA system",
    "Differences from ngspice",
  ],
  analysis: ["What it does", "How Nodal solves it", "Equations", "Settings", "Common problems"],
  concept: ["What it is", "Equations", "Where Nodal uses it"],
};

const MNA_SECTION = "In the MNA system";
const SLOT = "{{parameters}}";
const SLOT_HTML = '<div data-codex-slot="parameters"></div>';

/** A line `{{parameters}}` on its own. */
const SLOT_RULE = /^\{\{parameters\}\}[ \t]*(?:\n|$)/;
/** `$$ … $$` on its own lines. */
const DISPLAY_BLOCK_RULE = /^\$\$[ \t]*\n([\s\S]+?)\n\$\$[ \t]*(?:\n|$)/;
/** `$$ … $$` inside a paragraph. */
const DISPLAY_INLINE_RULE = /^\$\$((?:\\[\s\S]|[^\\])+?)\$\$/;
/** `$ … $`: no space inside the delimiters, and not followed by a digit (so prices stay prices). */
const INLINE_RULE = /^\$(?![\s$])((?:\\[\s\S]|[^$\\])+?)(?<![\s\\])\$(?!\d)/;

interface MathToken extends Tokens.Generic {
  type: "codexMath" | "codexDisplayMath";
  tex: string;
  display: boolean;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

class EntryError extends Error {
  constructor(id: string, line: number, message: string) {
    super(`codex entry ${id}:${String(line)}: ${message}`);
  }
}

function lineOf(source: string, snippet: string): number {
  const at = source.indexOf(snippet);
  return at < 0 ? 1 : source.slice(0, at).split("\n").length;
}

function makeMarked(source: string, id: string): Marked {
  const math = (tex: string, display: boolean, raw: string, block = false): MathToken => ({
    type: block ? "codexDisplayMath" : "codexMath",
    raw,
    tex,
    display,
  });
  const seen = new Map<string, number>();
  return new Marked({
    gfm: true,
    extensions: [
      {
        name: "codexSlot",
        level: "block",
        tokenizer(src) {
          const m = SLOT_RULE.exec(src);
          return m ? { type: "codexSlot", raw: m[0] } : undefined;
        },
        renderer: () => `${SLOT_HTML}\n`,
      },
      {
        name: "codexDisplayMath",
        level: "block",
        tokenizer(src) {
          const m = DISPLAY_BLOCK_RULE.exec(src);
          return m ? math((m[1] ?? "").trim(), true, m[0], true) : undefined;
        },
        renderer: (t) => renderMath(t as MathToken, source, id) + "\n",
      },
      {
        name: "codexMath",
        level: "inline",
        // Skip an escaped `\$`; code spans are consumed whole by marked's own tokenizer, because
        // extensions only run where a token starts, and a code span starts at its backtick.
        start(src) {
          const m = /(?<!\\)\$/.exec(src);
          return m?.index;
        },
        tokenizer(src) {
          const d = DISPLAY_INLINE_RULE.exec(src);
          if (d) return math((d[1] ?? "").trim(), true, d[0]);
          const m = INLINE_RULE.exec(src);
          return m ? math(m[1] ?? "", false, m[0]) : undefined;
        },
        renderer: (t) => renderMath(t as MathToken, source, id),
      },
    ],
    renderer: {
      html: ({ text }) => escapeHtml(text),
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens);
        const plain = tokens.map((t) => ("text" in t ? String(t.text) : t.raw)).join("");
        const slug = slugify(plain);
        const count = (seen.get(slug) ?? 0) + 1;
        seen.set(slug, count);
        const hid = count === 1 ? slug : `${slug}-${String(count)}`;
        return `<h${String(depth)} id="${hid}">${inner}</h${String(depth)}>\n`;
      },
    },
  });
}

function renderMath(token: MathToken, source: string, id: string): string {
  const line = lineOf(source, token.raw.trim());
  if (/\\frac(?![a-zA-Z])/.test(token.tex))
    throw new EntryError(id, line, "use \\dfrac, not \\frac");
  try {
    return katex.renderToString(token.tex, {
      displayMode: token.display,
      output: "htmlAndMathml",
      throwOnError: true,
      strict: "error",
      trust: false,
    });
  } catch (e) {
    throw new EntryError(id, line, `invalid TeX \`${token.tex}\`: ${(e as Error).message}`);
  }
}

/** Only http(s), fragment and relative targets; no scheme such as `javascript:` or `data:`. */
function safeHref(href: string): boolean {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(href.trim());
  return scheme === null || ["http", "https"].includes((scheme[1] ?? "").toLowerCase());
}

/** Throws on a stray `$` left in text (it is maths that did not parse) and on unsafe link targets. */
function checkTokens(md: Marked, tokens: Token[], source: string, id: string): void {
  void md.walkTokens(tokens, (t) => {
    if (t.type === "text" && !("tokens" in t && Array.isArray(t.tokens)) && t.raw.includes("$")) {
      throw new EntryError(
        id,
        lineOf(source, t.raw.trim()),
        "a `$` is not valid maths; write \\$ for a literal dollar or put it in a code span",
      );
    }
    if ((t.type === "link" || t.type === "image") && !safeHref((t as Tokens.Link).href)) {
      throw new EntryError(
        id,
        lineOf(source, t.raw.trim()),
        `unsafe link target "${(t as Tokens.Link).href}"`,
      );
    }
  });
}

function headingText(t: Token): string {
  return t.type === "heading" ? (t as Tokens.Heading).text : "";
}

function isH2(t: Token): boolean {
  return t.type === "heading" && (t as Tokens.Heading).depth === 2;
}

/** Which kind of entry a source file is, from its section headings (the plugin has no catalog). */
export function inferKind(source: string, id: string): EntryKind {
  const heads = makeMarked(source, id).lexer(source).filter(isH2).map(headingText);
  if (heads[0] === "What it does") return "analysis";
  if (heads[1] === "Typical uses") return "part";
  return "concept";
}

export function renderEntry(source: string, kind: EntryKind, id: string): RenderedEntry {
  const md = makeMarked(source, id);
  const tokens = md.lexer(source).filter((t) => t.type !== "space");

  checkTokens(md, tokens, source, id);

  const first = tokens[0];
  if (
    first?.type !== "heading" ||
    (first as Tokens.Heading).depth !== 1 ||
    !source.startsWith("# ")
  ) {
    throw new EntryError(id, 1, "the first line must be `# <title>`");
  }
  const title = (first as Tokens.Heading).text;

  // Group the tokens by `## ` section.
  const groups: { name: string; tokens: Token[] }[] = [];
  for (const t of tokens.slice(1)) {
    if (isH2(t)) groups.push({ name: headingText(t), tokens: [t] });
    else if (groups.length === 0) {
      throw new EntryError(id, lineOf(source, t.raw.trim()), "text before the first `## ` section");
    } else groups[groups.length - 1]?.tokens.push(t);
  }

  const required = SECTIONS[kind];
  const found = groups.map((g) => g.name);
  for (const name of required) {
    if (!found.includes(name)) {
      throw new EntryError(
        id,
        1,
        `missing section "${name}" (a ${kind} needs: ${required.join(", ")})`,
      );
    }
  }
  const unexpected = found.find((n) => !required.includes(n));
  if (unexpected !== undefined) {
    throw new EntryError(
      id,
      lineOf(source, `## ${unexpected}`),
      `unexpected section "${unexpected}"`,
    );
  }
  if (found.join("|") !== required.join("|")) {
    throw new EntryError(id, 1, `sections out of order: expected ${required.join(", ")}`);
  }

  // The parameter slot: exactly once, inside "Equations", in part entries only.
  const slots = groups.flatMap((g) =>
    g.tokens.filter((t) => t.type === "codexSlot").map(() => g.name),
  );
  const wantSlot = kind === "part";
  if (wantSlot && !(slots.length === 1 && slots[0] === "Equations")) {
    throw new EntryError(id, 1, `a part needs exactly one ${SLOT} line, inside "Equations"`);
  }
  if (!wantSlot && slots.length > 0) {
    throw new EntryError(id, lineOf(source, SLOT), `${SLOT} is only for part entries`);
  }

  const html = groups
    .map((g) => {
      const body = md.parser(g.tokens);
      return g.name === MNA_SECTION
        ? `<details class="nodal-codex-advanced"><summary>Advanced: MNA stamp</summary>\n${body}</details>\n`
        : body;
    })
    .join("");
  return { html, title };
}

/** Vite plugin: `import entry from "./entries/x.md?codex"` yields `{ html, title }`. */
export function codexMarkdown(): Plugin {
  return {
    name: "nodal-codex-markdown",
    enforce: "pre",
    transform(code, moduleId) {
      const [file, query] = moduleId.split("?");
      if (file === undefined || query === undefined || !file.endsWith(".md")) return undefined;
      if (!new URLSearchParams(query).has("codex")) return undefined;
      const id = file.slice(file.lastIndexOf("/") + 1, -".md".length);
      const out = renderEntry(code, inferKind(code, id), id);
      return {
        code: `import "katex/dist/katex.min.css";\nexport default ${JSON.stringify(out)};\n`,
        map: null,
      };
    },
  };
}
