// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderEntry } from "./codexMarkdown";

const CONCEPT = ["What it is", "Equations", "Where Nodal uses it"];
const PART = [
  "What it is",
  "Typical uses",
  "How it works",
  "Equations",
  "In the MNA system",
  "Differences from ngspice",
];

/** A valid concept entry whose sections carry `body` under "What it is". */
function concept(body: string): string {
  const sections = CONCEPT.map((h) => `## ${h}\n\n${h === "What it is" ? body : "Text."}\n`);
  return `# Title\n\n${sections.join("\n")}`;
}

function part(): string {
  const sections = PART.map((h) => {
    const slot = h === "Equations" ? "\n{{parameters}}\n" : "";
    return `## ${h}\n\nText.\n${slot}`;
  });
  return `# Resistor\n\n${sections.join("\n")}`;
}

describe("renderEntry maths", () => {
  it("renders inline and display maths with HTML and MathML", () => {
    const { html } = renderEntry(
      concept("Inline $x^2$ here.\n\n$$\n\\dfrac{a}{b}\n$$"),
      "concept",
      "t",
    );
    expect(html).toContain("<math");
    expect(html).toContain('class="katex"');
    expect(html).toContain("katex-display");
  });

  it("does not treat a dollar inside a code span as maths", () => {
    const { html } = renderEntry(concept("Use `$x$` and `a$b` literally."), "concept", "t");
    expect(html).toContain("<code>$x$</code>");
    expect(html).not.toContain("katex");
  });

  it("does not treat an escaped dollar as maths", () => {
    const { html } = renderEntry(concept("It costs \\$5 and \\$6."), "concept", "t");
    expect(html).not.toContain("katex");
    expect(html).toContain("$5");
  });

  it("rejects \\frac and accepts \\dfrac", () => {
    expect(() => renderEntry(concept("$\\frac{1}{2}$"), "concept", "frac-id")).toThrow(/dfrac/);
    expect(() => renderEntry(concept("$\\dfrac{1}{2}$"), "concept", "t")).not.toThrow();
  });

  it("throws on invalid TeX and names the entry", () => {
    expect(() => renderEntry(concept("$\\dfrac{1}$"), "concept", "bad-tex")).toThrow(/bad-tex/);
  });
});

describe("renderEntry strictness", () => {
  it("throws on a literal dollar that is not maths", () => {
    expect(() => renderEntry(concept("value $ x$ and $y $ done"), "concept", "dollar")).toThrow(
      /dollar/,
    );
  });

  it("lets inline maths span a soft line break", () => {
    const { html } = renderEntry(concept("so $a +\nb$ done"), "concept", "t");
    expect(html).toContain('class="katex"');
  });

  it("uses the display renderer for block maths", () => {
    const { html } = renderEntry(concept("$$\nx\n$$"), "concept", "t");
    expect(html).toContain("katex-display");
    expect(html).toMatch(/<\/span>\n/);
  });

  it("numbers repeated heading ids", () => {
    const { html } = renderEntry(concept("### Ex\n\nx\n\n### Ex\n\ny"), "concept", "t");
    expect(html).toContain('<h3 id="ex">');
    expect(html).toContain('<h3 id="ex-2">');
    expect(html).not.toContain('id="ex-3"');
  });

  it("only allows http, https, fragment and relative links", () => {
    const ok = "[a](https://x.org) [b](#what-it-is) [c](../x) [d](http://y.org)";
    expect(() => renderEntry(concept(ok), "concept", "t")).not.toThrow();
    expect(() => renderEntry(concept("[x](javascript:alert(1))"), "concept", "js-link")).toThrow(
      /js-link/,
    );
    expect(() => renderEntry(concept("![x](data:text/html,a)"), "concept", "img")).toThrow(/img/);
  });
});

describe("renderEntry link and dollar edge cases", () => {
  it("rejects entity-encoded schemes, backslashes, control chars and protocol-relative links", () => {
    for (const href of [
      "&#106;avascript:alert(1)",
      "a\\b",
      "//evil.example/x",
      "/\\evil",
      "a%20b&amp;c",
    ]) {
      expect(() => renderEntry(concept(`[x](<${href}>)`), "concept", "enc")).toThrow(/enc/);
    }
    expect(() => renderEntry(concept("[x](<a\tb>)"), "concept", "enc")).toThrow(/enc/);
  });

  it("does not throw for an escaped dollar or a dollar in a code span", () => {
    expect(() => renderEntry(concept("cost \\$5 and `$`"), "concept", "t")).not.toThrow();
  });
});

describe("renderEntry Markdown", () => {
  it("escapes raw HTML", () => {
    const { html } = renderEntry(
      concept("<script>alert(1)</script>\n\nand <b>inline</b>"),
      "concept",
      "t",
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("returns the title and leaves it out of the body", () => {
    const out = renderEntry(concept("x"), "concept", "t");
    expect(out.title).toBe("Title");
    expect(out.html).not.toContain("<h1");
  });

  it("gives headings stable ids", () => {
    const { html } = renderEntry(concept("x"), "concept", "t");
    expect(html).toContain('<h2 id="what-it-is">What it is</h2>');
    expect(html).toContain('id="where-nodal-uses-it"');
    expect(html).toEqual(renderEntry(concept("x"), "concept", "t").html);
  });

  it("requires a first-line title", () => {
    expect(() => renderEntry("## What it is\n", "concept", "no-title")).toThrow(/no-title:1/);
  });
});

describe("renderEntry sections", () => {
  it("throws on a missing section", () => {
    const src = concept("x").replace("## Equations\n\nText.\n", "");
    expect(() => renderEntry(src, "concept", "missing")).toThrow(/missing.*Equations/);
  });

  it("throws on out-of-order sections", () => {
    const src = `# T\n\n## Equations\n\nx\n\n## What it is\n\nx\n\n## Where Nodal uses it\n\nx\n`;
    expect(() => renderEntry(src, "concept", "order")).toThrow(/order/);
  });

  it("throws on an extra section", () => {
    expect(() => renderEntry(concept("x") + "\n## Extra\n\nx\n", "concept", "extra")).toThrow(
      /Extra/,
    );
  });

  it("renders the slot and wraps the MNA section in details", () => {
    const { html } = renderEntry(part(), "part", "resistor");
    expect(html).toContain('<div data-codex-slot="parameters"></div>');
    expect(html).toContain(
      '<details class="nodal-codex-advanced"><summary>Advanced: MNA stamp</summary>',
    );
    expect(html).toContain("</details>");
    expect(html.indexOf("data-codex-slot")).toBeLessThan(html.indexOf("<details"));
  });

  it("requires the slot in part entries and forbids it elsewhere", () => {
    const noSlot = part().replace("{{parameters}}", "");
    expect(() => renderEntry(noSlot, "part", "resistor")).toThrow(/parameters/);
    expect(() => renderEntry(concept("{{parameters}}"), "concept", "t")).toThrow(/parameters/);
  });

  it("checks analysis sections", () => {
    const heads = [
      "What it does",
      "How Nodal solves it",
      "Equations",
      "Settings",
      "Common problems",
    ];
    const ok = `# Op\n\n${heads.map((h) => `## ${h}\n\nx\n`).join("\n")}`;
    expect(() => renderEntry(ok, "analysis", "op")).not.toThrow();
    expect(() => renderEntry(ok, "part", "op")).toThrow();
  });
});
