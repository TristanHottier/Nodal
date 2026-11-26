// Fails if the editor's first load reaches the codex content. It walks the static import graph
// from index.html (module scripts and modulepreload links, then `import ... from "./x.js"` and
// bare `import "./x.js"` inside each chunk, never `import(`) and rejects any reached file that
// contains `katex` or `data-codex-slot`, and any linked stylesheet that contains `.katex`.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";

const distDir = process.argv[2];
if (!distDir) {
  process.stderr.write("Usage: node scripts/check-first-load.mjs <distDir>\n");
  process.exit(2);
}
const indexPath = join(distDir, "index.html");
if (!existsSync(indexPath)) {
  process.stderr.write(`check-first-load: no index.html in ${distDir}\n`);
  process.exit(1);
}

const BASE = "/Nodal/";
const html = readFileSync(indexPath, "utf8");

/** Maps a URL found in index.html to a file under distDir. */
function fromHtml(url) {
  const path = url.startsWith(BASE) ? url.slice(BASE.length) : url.replace(/^\//, "");
  return join(distDir, path);
}

const tags = [...html.matchAll(/<(script|link)\b[^>]*>/gi)].map((m) => m[0]);
const attr = (tag, name) => new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(tag)?.[1];

const entries = [];
const sheets = [];
for (const tag of tags) {
  if (/^<script/i.test(tag) && /type\s*=\s*["']module["']/i.test(tag)) {
    const src = attr(tag, "src");
    if (src) entries.push(fromHtml(src));
  } else if (/^<link/i.test(tag)) {
    const rel = attr(tag, "rel") ?? "";
    const href = attr(tag, "href");
    if (!href) continue;
    if (/modulepreload/i.test(rel)) entries.push(fromHtml(href));
    else if (/stylesheet/i.test(rel)) sheets.push(fromHtml(href));
  }
}

// `from"./x.js"` and bare `import"./x.js"`; a dynamic `import("./x.js")` has a "(" and never matches.
const STATIC = /(?:\bfrom\s*|\bimport\s*)["'](\.{1,2}\/[^"']+)["']/g;
const BAD = ["katex", "data-codex-slot"];

const seen = new Set();
const offenders = [];
const queue = entries.map((file) => ({ file, via: "index.html" }));
while (queue.length > 0) {
  const { file, via } = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  if (!existsSync(file)) {
    offenders.push(`${via}: missing file ${file}`);
    continue;
  }
  const text = readFileSync(file, "utf8");
  for (const word of BAD) {
    if (text.includes(word))
      offenders.push(`${relative(distDir, file)} contains "${word}" (reached from ${via})`);
  }
  for (const m of text.matchAll(STATIC)) {
    queue.push({ file: resolve(dirname(file), m[1]), via: relative(distDir, file) });
  }
}
for (const sheet of sheets) {
  if (existsSync(sheet) && readFileSync(sheet, "utf8").includes(".katex")) {
    offenders.push(
      `${relative(distDir, sheet)} contains ".katex" (stylesheet linked from index.html)`,
    );
  }
}

if (offenders.length > 0) {
  process.stderr.write(
    `The first load reaches the codex:\n${offenders.map((o) => `  ${o}`).join("\n")}\n`,
  );
  process.exit(1);
}
process.stdout.write(`check-first-load: OK (${seen.size} files, ${sheets.length} stylesheets)\n`);
