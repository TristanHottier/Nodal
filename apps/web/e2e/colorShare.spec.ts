import { expect, test, type Page } from "@playwright/test";
import { colorShares, type ColorRefs, type ColorShares } from "./colorShare";
import { openEditor, runAc, setTheme } from "./visualSetup";

// Decodes a PNG in the page, resolves the three tokens to 8-bit RGB through a 1x1 canvas, and
// classifies every pixel there. `colorShares` is serialized into the page, so it stays pure.
async function inPage(
  png: string,
  share: typeof colorShares,
): Promise<{ shares: ColorShares; refs: ColorRefs }> {
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  const pctx = probe.getContext("2d", { willReadFrequently: true });
  if (pctx === null) throw new Error("no 2d context");
  const resolve = (token: string) => {
    const el = document.createElement("div");
    el.style.background = `var(${token})`;
    document.body.appendChild(el);
    const css = getComputedStyle(el).backgroundColor;
    el.remove();
    pctx.clearRect(0, 0, 1, 1);
    pctx.fillStyle = css;
    pctx.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0] = pctx.getImageData(0, 0, 1, 1).data;
    return { r, g, b };
  };
  const refs = {
    dominant: resolve("--color-canvas"),
    secondary: resolve("--color-panel"),
    accent: resolve("--color-accent"),
  };
  const blob = await (await fetch(`data:image/png;base64,${png}`)).blob();
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (ctx === null) throw new Error("no 2d context");
  ctx.drawImage(bmp, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  return { shares: share(data, refs), refs };
}

async function measure(page: Page): Promise<{ shares: ColorShares; refs: ColorRefs }> {
  const png = (await page.screenshot()).toString("base64");
  // Both functions are sent as source: `colorShares` is self-contained, `inPage` only uses DOM.
  return page.evaluate<{ shares: ColorShares; refs: ColorRefs }>(
    `(${inPage.toString()})(${JSON.stringify(png)}, ${colorShares.toString()})`,
  );
}

for (const theme of ["light", "dark"] as const) {
  for (const view of ["editor", "waveform"] as const) {
    test(`60/30/10 shares hold in the ${view} view, ${theme} theme`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await openEditor(page);
      await setTheme(page, theme);
      if (view === "waveform") await runAc(page);
      const { shares, refs } = await measure(page);
      test.info().annotations.push({
        type: "shares",
        description: JSON.stringify({ shares, refs }),
      });
      expect(shares.classified / (1440 * 900), "classified fraction").toBeGreaterThanOrEqual(0.5);
      expect(shares.dominant, "dominant").toBeGreaterThanOrEqual(0.5);
      expect(shares.dominant, "dominant").toBeLessThanOrEqual(0.8);
      expect(shares.secondary, "secondary").toBeGreaterThanOrEqual(0.15);
      expect(shares.secondary, "secondary").toBeLessThanOrEqual(0.45);
      expect(shares.accent, "accent").toBeGreaterThan(0);
      expect(shares.accent, "accent").toBeLessThanOrEqual(0.12);
    });
  }
}
