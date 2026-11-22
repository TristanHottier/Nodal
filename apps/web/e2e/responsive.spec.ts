import { expect, test, type Page } from "@playwright/test";

async function inViewport(page: Page, name: string, locator: ReturnType<Page["locator"]>) {
  const box = await locator.boundingBox();
  const vp = page.viewportSize();
  expect(box, `${name} has a box`).not.toBeNull();
  if (!box || !vp) return;
  expect(box.width, `${name} is visible`).toBeGreaterThan(0);
  expect(box.x, `${name} left`).toBeGreaterThanOrEqual(0);
  expect(box.y, `${name} top`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${name} right`).toBeLessThanOrEqual(vp.width);
  expect(box.y + box.height, `${name} bottom`).toBeLessThanOrEqual(vp.height);
}

for (const [width, height] of [
  [1024, 768],
  [1280, 800],
] as const) {
  test(`editor fits a ${String(width)}x${String(height)} window`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("./");
    await expect(page.getByRole("navigation", { name: "Palette" })).toBeVisible();
    const overflow = await page.evaluate(() => {
      const d = document.documentElement;
      return { x: d.scrollWidth - d.clientWidth, y: d.scrollHeight - d.clientHeight };
    });
    expect(overflow.x).toBeLessThanOrEqual(0);
    await inViewport(page, "palette", page.getByRole("navigation", { name: "Palette" }));
    await inViewport(page, "canvas", page.getByTestId("schematic-canvas"));
    await inViewport(page, "inspector", page.locator(".nodal-inspector"));
    await inViewport(page, "run", page.getByRole("button", { name: "Run", exact: true }));
  });
}

/** Every control inside the panel must lie within the panel's horizontal extent. */
async function controlsInside(page: Page, name: string, panel: ReturnType<Page["locator"]>) {
  const panelBox = await panel.boundingBox();
  expect(panelBox, `${name} has a box`).not.toBeNull();
  if (!panelBox) return;
  const strays = await panel.locator("button, select, input, textarea").evaluateAll(
    (els, edges) =>
      els.flatMap((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0) return [];
        const out = r.left < edges.left - 0.5 || r.right > edges.right + 0.5;
        const label = el.getAttribute("aria-label") ?? (el.textContent || el.tagName);
        return out
          ? [`${label.trim()} (${String(Math.round(r.left))}..${String(Math.round(r.right))})`]
          : [];
      }),
    { left: panelBox.x, right: panelBox.x + panelBox.width },
  );
  expect(strays, `${name} controls outside the panel`).toEqual([]);
}

for (const [width, height] of [
  [1024, 768],
  [1280, 800],
] as const) {
  test(`palette and inspector controls stay inside their panels at ${String(width)} px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("./");
    await page.getByLabel("Open example").selectOption("ce-amplifier");
    const parts = page.locator('[data-testid^="part-"]');
    await expect(parts.first()).toBeVisible();
    const palette = page.getByRole("navigation", { name: "Palette" });
    const inspector = page.locator(".nodal-inspector");

    // Analysis editor: nothing selected.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("complementary", { name: "Inspector" })).toBeVisible();
    await controlsInside(page, "palette", palette);
    await controlsInside(page, "inspector with analysis editor", inspector);

    // A part selected.
    await parts.first().click();
    await expect(inspector.locator("h2")).toBeVisible();
    await controlsInside(page, "palette", palette);
    await controlsInside(page, "inspector with a part", inspector);
  });
}

test("below 1024 px the notice shows and the schematic stays visible", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto("./");
  await expect(page.getByRole("status").filter({ hasText: "at least 1024 px wide" })).toHaveText(
    "Nodal's editor needs a window at least 1024 px wide. The schematic is shown read-only.",
  );
  await expect(page.getByTestId("schematic-canvas")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Palette" })).toHaveCount(0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("resizing below 1024 px mid-wire leaves no half wire", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("./");
  await page.getByRole("button", { name: "Wire" }).click();
  const svg = page.getByTestId("schematic-canvas");
  const b = await svg.boundingBox();
  if (!b) throw new Error("no canvas");
  await page.mouse.click(b.x + 200, b.y + 200);
  await page.mouse.move(b.x + 300, b.y + 260);
  await expect(page.getByTestId("wire-preview")).toHaveCount(1);
  await page.setViewportSize({ width: 900, height: 700 });
  await expect(page.getByTestId("wire-preview")).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByTestId("wire-preview")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Select" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("crossing 1024 px keeps the chosen analysis and the cursors", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("./");
  await page.getByLabel("Open example").selectOption("ce-amplifier");
  await expect(page.locator('[data-testid^="part-"]').first()).toBeVisible();
  await page.getByLabel("Analysis to run").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator(".nodal-runbar").getByRole("status")).toHaveText("Done");
  const cursorA = page.getByLabel("Cursor A");
  await cursorA.fill("1k");
  await cursorA.press("Enter");
  await expect(cursorA).toHaveValue(/1/);
  const shown = await cursorA.inputValue();

  await page.setViewportSize({ width: 900, height: 700 });
  await expect(page.getByRole("button", { name: "Run", exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 800 });

  await expect(page.getByLabel("Analysis to run")).toHaveValue("1");
  await expect(page.getByLabel("Cursor A")).toHaveValue(shown);
});
