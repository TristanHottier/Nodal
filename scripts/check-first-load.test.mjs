import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const script = fileURLToPath(new URL("./check-first-load.mjs", import.meta.url));
const roots = [];

function fixture({ entry, files, css = "" }) {
  const dir = mkdtempSync(join(tmpdir(), "first-load-"));
  roots.push(dir);
  mkdirSync(join(dir, "assets"));
  writeFileSync(
    join(dir, "index.html"),
    `<!doctype html><html><head>
<script type="module" crossorigin src="/Nodal/assets/index.js"></script>
<link rel="modulepreload" crossorigin href="/Nodal/assets/vendor.js">
<link rel="stylesheet" crossorigin href="/Nodal/assets/index.css">
</head><body><div id="root"></div></body></html>`,
  );
  writeFileSync(join(dir, "assets/index.js"), entry);
  writeFileSync(join(dir, "assets/index.css"), css);
  for (const [name, text] of Object.entries({ "vendor.js": "export const v = 1;", ...files })) {
    writeFileSync(join(dir, "assets", name), text);
  }
  return dir;
}

const run = (dir) => spawnSync(process.execPath, [script, dir], { encoding: "utf8" });

after(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

describe("check-first-load", () => {
  it("passes when the codex is only reached through a dynamic import", () => {
    const dir = fixture({
      entry: 'import{v}from"./vendor.js";const p=()=>import("./codex.js");export{p,v};',
      files: { "codex.js": "export const k = 'katex data-codex-slot';" },
    });
    const r = run(dir);
    assert.equal(r.status, 0, r.stderr);
  });

  it("fails when the entry statically imports a chunk containing katex", () => {
    const dir = fixture({
      entry: 'import{k}from"./codex.js";export{k};',
      files: { "codex.js": "export const k = 'katex';" },
    });
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /codex\.js/);
  });

  it("fails on a bare static import and follows imports transitively", () => {
    const dir = fixture({
      entry: 'import"./mid.js";',
      files: {
        "mid.js": 'import{a}from"./deep.js";export{a};',
        "deep.js": "export const a='data-codex-slot';",
      },
    });
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /deep\.js/);
  });

  it("fails when a linked stylesheet contains .katex rules", () => {
    const dir = fixture({ entry: "export {};", files: {}, css: ".katex{font:inherit}" });
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /index\.css/);
  });

  it("fails when a modulepreload target statically reaches katex", () => {
    const dir = fixture({ entry: "export {};", files: { "vendor.js": "export const v='katex';" } });
    assert.equal(run(dir).status, 1);
  });

  it("exits 2 without an argument and 1 without an index.html", () => {
    assert.equal(spawnSync(process.execPath, [script], { encoding: "utf8" }).status, 2);
    const empty = mkdtempSync(join(tmpdir(), "first-load-"));
    roots.push(empty);
    assert.equal(run(empty).status, 1);
  });
});
