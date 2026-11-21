import { expect, test } from "@playwright/test";

// Default view: zoom 1, origin at the canvas top-left, GRID = 10 px.
test("editor_draws_and_undoes", async ({ page }) => {
  await page.goto("./");
  const canvas = page.getByTestId("schematic-canvas");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (box === null) throw new Error("canvas has no bounding box");
  const at = (gx: number, gy: number) => ({ x: box.x + gx * 10, y: box.y + gy * 10 });
  const click = async (gx: number, gy: number) => {
    const p = at(gx, gy);
    await page.mouse.move(p.x, p.y);
    await page.mouse.click(p.x, p.y);
  };

  // Resistor pins at (20,17) and (20,23); ground pin at (20,30).
  await page.getByRole("button", { name: "Place Resistor" }).click();
  await click(20, 20);
  await page.getByRole("button", { name: "Place Ground" }).click();
  await click(20, 30);
  await expect(page.locator('[data-testid^="part-"]')).toHaveCount(2);

  await page.getByRole("button", { name: "Wire" }).click();
  await click(20, 23);
  await click(20, 30);
  await expect(page.locator('[data-testid^="wire-"]')).toHaveCount(1);
  await expect(page.getByTestId("junction")).toHaveCount(0);

  // A second wire ending inside the first one makes a T-junction.
  await click(30, 26);
  await click(20, 26);
  await expect(page.locator('[data-testid^="wire-"]')).toHaveCount(2);
  await expect(page.getByTestId("junction")).toHaveCount(1);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("junction")).toHaveCount(0);
  await expect(page.locator('[data-testid^="wire-"]')).toHaveCount(1);
});

test("symbol_strokes_are_thin_and_non_scaling", async ({ page }) => {
  await page.goto("./");
  const canvas = page.getByTestId("schematic-canvas");
  const box = await canvas.boundingBox();
  if (box === null) throw new Error("canvas has no bounding box");
  await page.getByRole("button", { name: "Place Resistor" }).click();
  await page.mouse.move(box.x + 200, box.y + 200);
  await page.mouse.click(box.x + 200, box.y + 200);
  const part = page.locator('[data-testid^="part-"]').first();
  await expect(part).toBeVisible();
  const styles = await part.locator("path, rect[fill='none']").evaluateAll((els) =>
    els.map((el) => {
      const cs = getComputedStyle(el);
      const w = parseFloat(cs.strokeWidth);
      const scale = (el as SVGGraphicsElement).getScreenCTM()?.a ?? 1;
      const rendered = cs.vectorEffect === "non-scaling-stroke" ? w : w * scale;
      return { effect: cs.vectorEffect, width: rendered };
    }),
  );
  expect(styles.length).toBeGreaterThan(0);
  for (const s of styles) {
    expect(s.effect).toBe("non-scaling-stroke");
    // Rendered stroke width in screen px at zoom 1.
    expect(s.width).toBeLessThanOrEqual(2);
  }
});
