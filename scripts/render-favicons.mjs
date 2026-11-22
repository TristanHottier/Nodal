// Rasterizes apps/web/public/favicon.svg to favicon-32.png and apple-touch-icon.png with Chromium.
// Run: pnpm exec node scripts/render-favicons.mjs (the PNGs are committed; rerun after changing the mark).
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const publicDir = fileURLToPath(new URL("../apps/web/public/", import.meta.url));
const svg = readFileSync(`${publicDir}favicon.svg`, "utf8");

// Same values as --color-canvas in tokens.css (dark theme); iOS ignores transparency.
const TOUCH_BACKGROUND = "#0e1012";

const browser = await chromium.launch();
try {
  async function render(scheme, size, body, background) {
    const context = await browser.newContext({
      viewport: { width: size, height: size },
      colorScheme: scheme,
    });
    const page = await context.newPage();
    await page.setContent(
      `<!doctype html><style>html,body{margin:0;width:${size}px;height:${size}px;background:${background};display:grid;place-items:center}svg{display:block}</style>${body}`,
    );
    const png = await page.screenshot({ omitBackground: background === "transparent" });
    await context.close();
    return png;
  }
  const sized = (px) => svg.replace('width="32" height="32"', `width="${px}" height="${px}"`);
  // Tab icon: light-theme stops read on both light and dark tab strips.
  writeFileSync(`${publicDir}favicon-32.png`, await render("light", 32, sized(32), "transparent"));
  // Touch icon: dark-theme stops on the dark canvas, mark at about 64 % of the square.
  writeFileSync(
    `${publicDir}apple-touch-icon.png`,
    await render("dark", 180, sized(116), TOUCH_BACKGROUND),
  );
} finally {
  await browser.close();
}
