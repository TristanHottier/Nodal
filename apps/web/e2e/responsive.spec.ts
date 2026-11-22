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
