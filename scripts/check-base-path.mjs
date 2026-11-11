// Fails if any built .html/.js/.css file references a root-relative URL
// (a single leading "/") that is not under the "/Nodal/" base path.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import process from "node:process";

const BASE = "/Nodal/";
const distDir = process.argv[2];
if (!distDir) {
  process.stderr.write("Usage: node scripts/check-base-path.mjs <distDir>\n");
  process.exit(2);
}

if (!existsSync(join(distDir, "index.html"))) {
  process.stderr.write(`check-base-path: no index.html in ${distDir}\n`);
  process.exit(1);
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if ([".html", ".js", ".css"].includes(extname(entry.name))) yield path;
  }
}

// Each pattern captures a target that starts with exactly one "/" ("//" is
// protocol-relative and "https://" does not start with "/", so neither matches).
const patterns = [
  /\b(?:src|href)\s*=\s*["']?(\/(?!\/)[^"'\s>)]*)/g,
  /\burl\(\s*["']?(\/(?!\/)[^"')\s]*)/g,
  /\bnew\s+URL\(\s*["'`](\/(?!\/)[^"'`]*)/g,
];

const offenders = [];
for (const file of walk(distDir)) {
  const text = readFileSync(file, "utf8");
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const target = match[1];
      if (!target.startsWith(BASE)) offenders.push(`${file}: ${target}`);
    }
  }
}

if (offenders.length > 0) {
  process.stderr.write(
    `Found URLs outside ${BASE}:\n${offenders.map((o) => `  ${o}`).join("\n")}\n`,
  );
  process.exit(1);
}
process.stdout.write(`check-base-path: OK (${distDir})\n`);
