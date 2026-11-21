// Regenerates ngspice goldens: node validation/scripts/regen-goldens.mjs [<id>...]
// With no ids, every existing validation/golden/*.op.csv, *.dc.csv, *.ac.csv and *.tran.csv is
// regenerated. Each circuit has exactly one analysis (op, dc, ac or tran); a dc golden has one
// row per sweep point, an ac golden one row per frequency, with .re and .im columns for every
// signal, and a tran golden one row per ngspice time point.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const circuitsDir = join(root, "validation", "circuits");
const goldenDir = join(root, "validation", "golden");

function fail(message) {
  throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", cwd: root, ...options });
  if (result.error) {
    if (result.error.code === "ENOENT" && command === "ngspice") {
      fail("ngspice not found. Install it (for example `apt-get install ngspice`) and retry.");
    }
    fail(`cannot run ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} exited with ${result.status}\n${result.stderr}`);
  }
  return result.stdout;
}

/** 17 significant digits, exponent as a signed two-digit number: 1.0000000000000000e+01. */
export function formatValue(x) {
  const [mantissa, exponent] = x.toExponential(16).split("e");
  const sign = exponent[0];
  const digits = exponent.slice(1).padStart(2, "0");
  return `${mantissa}e${sign}${digits}`;
}

/** First line of `ngspice -v` containing "ngspice-", without surrounding `*` and whitespace. */
function ngspiceVersion() {
  const line = run("ngspice", ["-v"])
    .split("\n")
    .find((l) => l.includes("ngspice-"));
  if (line === undefined) fail("cannot find a line containing 'ngspice-' in `ngspice -v`");
  return line.replace(/^[\s*]+|[\s*]+$/g, "");
}

const kinds = ["op", "dc", "ac", "tran"];

/**
 * Parses an ASCII rawfile into `{ names, points, complex }`: the variable names in file order
 * and one array of values per point. In a real plot a value is a number; in a complex plot
 * (`Flags: complex`) a value is a `[re, im]` pair.
 */
export function parseRaw(text) {
  const lines = text.split("\n");
  const varsAt = lines.findIndex((l) => l.startsWith("Variables:"));
  const valuesAt = lines.findIndex((l) => l.startsWith("Values:"));
  if (varsAt < 0 || valuesAt < 0) fail("rawfile has no Variables:/Values: sections");
  const header = lines.slice(0, varsAt).join("\n");
  const complex = /^Flags:\s*complex\s*$/m.test(header);
  if (!complex && !/^Flags:\s*real\s*$/m.test(header)) {
    fail("rawfile is neither a real nor a complex plot");
  }
  const count = /^No\. Variables:\s*(\d+)/m.exec(header);
  const points = /^No\. Points:\s*(\d+)/m.exec(header);
  if (!count || !points) fail("rawfile header lacks variable or point counts");
  const names = lines
    .slice(varsAt + 1, valuesAt)
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .map((l) => l.split(/\s+/)[1]);
  if (names.length !== Number(count[1])) fail("rawfile variable count mismatch");
  const values = lines
    .slice(valuesAt + 1)
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .map((l) => {
      const token = l.split(/\s+/).at(-1);
      if (!complex) return Number(token);
      const parts = token.split(",");
      if (parts.length !== 2) fail(`complex rawfile value ${token} is not re,im`);
      return parts.map(Number);
    });
  const n = Number(points[1]);
  const finite = (v) => (complex ? v.every(Number.isFinite) : Number.isFinite(v));
  if (n < 1 || values.length !== names.length * n || !values.every(finite)) {
    fail("rawfile value count mismatch or non-finite value");
  }
  const rows = [];
  for (let p = 0; p < n; p++) rows.push(values.slice(p * names.length, (p + 1) * names.length));
  return { names, points: rows, complex };
}

function irNames(ir) {
  const nodes = new Map();
  const elements = new Map();
  for (const element of ir.elements) {
    elements.set(element.name.toLowerCase(), element.name);
    for (const node of [...(element.nodes ?? []), ...(element.controlNodes ?? [])]) {
      nodes.set(node.toLowerCase(), node);
    }
  }
  return { nodes, elements };
}

/**
 * Fails when the frequency scale of a complex ac plot has a non-zero imaginary part. The golden
 * stores only the real part, so a non-zero imaginary part would be dropped silently.
 */
export function checkFrequencyScale(points) {
  for (const row of points) {
    if (row[0][1] !== 0) fail(`ac frequency scale has a non-zero imaginary part: ${row[0][1]}`);
  }
}

/**
 * Maps ngspice vector names to golden signal names; returns `[column, signal]` pairs.
 * In a dc plot the first vector is the scale (`v(v-sweep)` or `i(i-sweep)` in ngspice-42,
 * possibly the source name in newer versions) and becomes `sweep`. Vectors with a `#` other
 * than `#branch` are device-internal and skipped. Anything else unexpected is fatal.
 * In an ac plot the first vector must be `frequency`, which keeps that name; in a tran plot
 * it must be `time`.
 */
export function mapSignals(names, ir, analysisType) {
  const { nodes, elements } = irNames(ir);
  const element = (key, what) => {
    const found = elements.get(key);
    if (found === undefined) fail(`${what} has no element in the IR`);
    return found;
  };
  const mapped = [];
  names.forEach((name, column) => {
    if (analysisType === "dc" && column === 0) {
      const source = ir.analyses[0].source.toLowerCase();
      const scale = new RegExp(
        `^(?:[vi]\\()?(?:[vi]-sweep|${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\)?$`,
      );
      if (!scale.test(name)) fail(`unexpected dc scale vector ${name}`);
      mapped.push([column, "sweep"]);
      return;
    }
    if (analysisType === "ac" && column === 0) {
      if (name !== "frequency")
        fail(`an ac plot must start with the frequency vector, found ${name}`);
      mapped.push([column, "frequency"]);
      return;
    }
    if (analysisType === "tran" && column === 0) {
      if (name !== "time") fail(`a tran plot must start with the time vector, found ${name}`);
      mapped.push([column, "time"]);
      return;
    }
    if (name.includes("#") && !name.endsWith("#branch")) return;
    let match;
    if ((match = /^v\((.+)\)$/.exec(name))) {
      const node = nodes.get(match[1]);
      if (node === undefined) fail(`vector ${name} has no node in the IR`);
      mapped.push([column, `V(${node})`]);
    } else if ((match = /^(.+)#branch$/.exec(name)) || (match = /^i\((.+)\)$/.exec(name))) {
      mapped.push([column, `I(${element(match[1], `vector ${name}`)})`]);
    } else {
      fail(`unexpected ngspice vector ${name}`);
    }
  });
  return mapped;
}

/** Computes the golden for one circuit and returns `{ id, kind, text, count }`; writes nothing. */
function compute(id, version) {
  const irPath = join(circuitsDir, `${id}.json`);
  const ir = JSON.parse(readFileSync(irPath, "utf8"));
  if (!Array.isArray(ir.analyses) || ir.analyses.length !== 1) {
    fail(`${id}: a validation circuit must have exactly one analysis`);
  }
  const analysisType = ir.analyses[0].type;
  if (!kinds.includes(analysisType)) {
    fail(`${id}: unsupported analysis ${analysisType}`);
  }
  const deck = run("cargo", ["run", "-q", "-p", "nodal-cli", "--", "export-spice", irPath]);
  const optionsLine = deck.split("\n").find((l) => l.startsWith(".options "));
  if (optionsLine === undefined) fail(`${id}: deck has no .options line`);

  const dir = mkdtempSync(join(tmpdir(), "nodal-regen-"));
  try {
    const deckPath = join(dir, `${id}.cir`);
    const rawPath = join(dir, `${id}.raw`);
    writeFileSync(deckPath, deck);
    run("ngspice", ["-b", "-r", rawPath, deckPath], {
      env: { ...process.env, SPICE_ASCIIRAWFILE: "1" },
    });
    const raw = parseRaw(readFileSync(rawPath, "utf8"));
    const mapped = mapSignals(raw.names, ir, analysisType);
    const header = [
      `# circuit: ${id}`,
      `# analysis: ${analysisType}`,
      `# ngspice: ${version}`,
      `# options: ${optionsLine.slice(".options ".length)}`,
      ...(analysisType === "tran" ? [`# method: ${ir.options?.method ?? "trap"}`] : []),
      `# generated: ${new Date().toISOString().slice(0, 10)}`,
    ];
    let body;
    if (analysisType === "op") {
      if (raw.points.length !== 1)
        fail(`${id}: expected 1 point, rawfile has ${raw.points.length}`);
      body = [
        "signal,value",
        ...mapped.map(([column, name]) => `${name},${formatValue(raw.points[0][column])}`),
      ];
    } else if (analysisType === "ac") {
      if (!raw.complex) fail(`${id}: ac rawfile is not complex`);
      checkFrequencyScale(raw.points);
      const signals = mapped.slice(1);
      body = [
        ["frequency", ...signals.flatMap(([, name]) => [`${name}.re`, `${name}.im`])].join(","),
        ...raw.points.map((row) =>
          [
            formatValue(row[0][0]),
            ...signals.flatMap(([column]) => row[column].map(formatValue)),
          ].join(","),
        ),
      ];
    } else {
      if (raw.complex) fail(`${id}: ${analysisType} rawfile is complex`);
      body = [
        mapped.map(([, name]) => name).join(","),
        ...raw.points.map((row) => mapped.map(([column]) => formatValue(row[column])).join(",")),
      ];
    }
    return {
      id,
      kind: analysisType,
      text: `${[...header, ...body].join("\n")}\n`,
      count: analysisType === "ac" ? mapped.length - 1 : mapped.length,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Golden files of `id` whose kind differs from `kind`. Regenerating under a new kind must not
 * leave the old file behind, because `validate` would then compare against both.
 */
export function staleGoldens(id, kind, files) {
  return files.filter((f) => kinds.some((k) => k !== kind && f === `${id}.${k}.csv`));
}

/** Circuit ids that have a golden of any kind among `files`, sorted. */
export function goldenIds(files) {
  const ids = files.flatMap((f) => {
    const kind = kinds.find((k) => f.endsWith(`.${k}.csv`));
    return kind === undefined ? [] : [f.slice(0, -`.${kind}.csv`.length)];
  });
  return [...new Set(ids)].sort();
}

function main() {
  let ids = process.argv.slice(2);
  if (ids.length === 0) {
    try {
      ids = goldenIds(readdirSync(goldenDir));
    } catch {
      ids = [];
    }
    if (ids.length === 0) fail("no ids given and no existing goldens to regenerate");
  }
  const version = ngspiceVersion();
  // Compute everything first so a failure leaves the committed goldens untouched.
  const results = ids.map((id) => compute(id, version));
  mkdirSync(goldenDir, { recursive: true });
  const existing = readdirSync(goldenDir);
  for (const { id, kind } of results) {
    const stale = staleGoldens(id, kind, existing);
    if (stale.length > 0) {
      fail(
        `${id}: stale golden ${stale.join(", ")} exists next to the new ${id}.${kind}.csv; delete it first`,
      );
    }
  }
  for (const { id, kind, text, count } of results) {
    writeFileSync(join(goldenDir, `${id}.${kind}.csv`), text);
    process.stdout.write(`${id}: ${count} signals\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`regen-goldens: ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}
