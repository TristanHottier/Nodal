// Lighthouse lab check: node scripts/lighthouse.mjs <url> [--runs 3]
// Performance only, mobile (default config) and desktop; median per metric.
// Exits 1 if LCP > 2500 ms, CLS > 0.1 or TBT > 200 ms in either form factor.
import { appendFileSync } from "node:fs";
import process from "node:process";
import console from "node:console";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import * as chromeLauncher from "chrome-launcher";

const LIMITS = { lcp: 2500, cls: 0.1, tbt: 200 };
const AUDITS = {
  lcp: "largest-contentful-paint",
  cls: "cumulative-layout-shift",
  tbt: "total-blocking-time",
};

const args = process.argv.slice(2);
const url = args.find((a) => /^https?:\/\//.test(a));
const runsAt = args.indexOf("--runs");
const runs = runsAt >= 0 ? Number(args[runsAt + 1]) : 3;
if (!url || !Number.isInteger(runs) || runs < 1) {
  console.error("usage: node scripts/lighthouse.mjs <url> [--runs 3]");
  process.exit(2);
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function measure(config) {
  const samples = { lcp: [], cls: [], tbt: [] };
  for (let i = 0; i < runs; i++) {
    const chrome = await chromeLauncher.launch({
      chromePath: process.env.CHROME_PATH || undefined,
      chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
    });
    try {
      const result = await lighthouse(
        url,
        { port: chrome.port, onlyCategories: ["performance"], logLevel: "error" },
        config,
      );
      for (const [key, id] of Object.entries(AUDITS)) {
        const value = result?.lhr.audits[id]?.numericValue;
        if (typeof value !== "number") throw new Error(`no ${id} in Lighthouse result`);
        samples[key].push(value);
      }
    } finally {
      await chrome.kill();
    }
  }
  return Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, median(v)]));
}

const forms = [
  ["mobile", undefined],
  ["desktop", desktopConfig],
];
const rows = [];
let failed = false;
for (const [name, config] of forms) {
  const m = await measure(config);
  const bad = m.lcp > LIMITS.lcp || m.cls > LIMITS.cls || m.tbt > LIMITS.tbt;
  failed ||= bad;
  rows.push(
    `| ${name} | ${m.lcp.toFixed(0)} | ${m.cls.toFixed(3)} | ${m.tbt.toFixed(0)} | ${bad ? "fail" : "pass"} |`,
  );
}

const table = [
  `Lighthouse lab, ${url}, median of ${runs} runs`,
  "",
  "| Form factor | LCP (ms) | CLS | TBT (ms) | Result |",
  "| --- | ---: | ---: | ---: | --- |",
  ...rows,
  "",
  `Limits: LCP <= ${LIMITS.lcp} ms, CLS <= ${LIMITS.cls}, TBT <= ${LIMITS.tbt} ms.`,
  "",
].join("\n");
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, table);
process.exit(failed ? 1 : 0);
