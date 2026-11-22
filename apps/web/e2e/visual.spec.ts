import { expect, test } from "@playwright/test";
import { openEditor, runAc, setTheme } from "./visualSetup";

for (const theme of ["light", "dark"] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await openEditor(page);
      await setTheme(page, theme);
    });

    test("editor with the CE amplifier", async ({ page }) => {
      await expect(page).toHaveScreenshot(`editor-${theme}.png`);
    });

    test("waveform viewer after an AC run", async ({ page }) => {
      await runAc(page);
      await expect(page).toHaveScreenshot(`waveform-${theme}.png`);
    });

    test("analysis editor", async ({ page }) => {
      await page.keyboard.press("Escape");
      const inspector = page.getByRole("complementary", { name: "Inspector" });
      await expect(inspector.getByRole("heading", { name: "Analyses" })).toBeVisible();
      await expect(inspector.getByRole("group", { name: "Analysis 1" })).toBeVisible();
      // Bring the analysis cards and the solver options to the top of the inspector.
      await inspector.getByRole("heading", { name: "Analyses" }).evaluate((el) => {
        el.scrollIntoView({ block: "start" });
      });
      await expect(page).toHaveScreenshot(`analysis-${theme}.png`);
    });

    test("read-only view at 900 px", async ({ page }) => {
      await page.setViewportSize({ width: 900, height: 700 });
      await expect(
        page.getByRole("status").filter({ hasText: "at least 1024 px wide" }),
      ).toBeVisible();
      await expect(page).toHaveScreenshot(`readonly-${theme}.png`);
    });
  });
}

test("a selected probed wire wears the selection color, not its trace color", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await runAc(page);
  const wire = page.locator('[data-testid^="wire-"].probed').first();
  const line = wire.locator(".nodal-wire-line");
  await expect(line).toBeAttached();
  const before = await line.evaluate((el) => {
    const c = getComputedStyle(el);
    return { stroke: c.stroke, width: parseFloat(c.strokeWidth) };
  });
  await expect(wire.locator(".nodal-halo")).toHaveCount(0);

  // Click the middle of the wire's own path, in screen coordinates.
  const at = await line.evaluate((el) => {
    const g = el as unknown as SVGGeometryElement;
    const p = g.getPointAtLength(g.getTotalLength() / 2);
    const m = g.getScreenCTM();
    if (m === null) throw new Error("no CTM");
    return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
  });
  await page.mouse.click(at.x, at.y);
  await expect(wire).toHaveClass(/\bselected\b/);

  const { stroke, width } = await line.evaluate((el) => {
    const c = getComputedStyle(el);
    return { stroke: c.stroke, width: parseFloat(c.strokeWidth) };
  });
  const accent = await page.evaluate(() => {
    const el = document.createElement("div");
    el.style.color = "var(--color-accent)";
    document.body.appendChild(el);
    const c = getComputedStyle(el).color;
    el.remove();
    return c;
  });
  expect(stroke).toBe(accent);
  expect(stroke).not.toBe(before.stroke);
  // Colour is not the only cue: trace 1 and the accent share a hue, so a selected wire is also
  // heavier than a probed one and sits in a canvas-coloured halo.
  expect(width).toBeGreaterThan(before.width);
  const halo = wire.locator(".nodal-halo");
  await expect(halo).toHaveCount(1);
  const canvas = await page.evaluate(() => {
    const el = document.createElement("div");
    el.style.color = "var(--color-canvas)";
    document.body.appendChild(el);
    const c = getComputedStyle(el).color;
    el.remove();
    return c;
  });
  const haloStyle = await halo.evaluate((el) => {
    const c = getComputedStyle(el);
    return { stroke: c.stroke, width: parseFloat(c.strokeWidth) };
  });
  expect(haloStyle.stroke).toBe(canvas);
  expect(haloStyle.width).toBeGreaterThan(width);
});
