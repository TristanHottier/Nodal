import { expect, type Locator, type Page, test } from "@playwright/test";

const SUFFIX: Record<string, number> = { p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, m: 1e-3, k: 1e3 };

/** Parses a field text such as "1.2m" or "0.0004" (the formatValue output). */
const num = (text: string): number => {
  const m = /^(-?[\d.]+(?:e[+-]?\d+)?)([pnuµmk]?)/.exec(text.trim());
  if (!m) throw new Error(`not a number: ${text}`);
  return Number(m[1]) * (SUFFIX[m[2] ?? ""] ?? 1);
};

const fieldA = (page: Page) => page.getByLabel("Cursor A", { exact: true });
const fieldB = (page: Page) => page.getByLabel("Cursor B", { exact: true });
const read = async (field: Locator) => num(await field.inputValue());

async function openTransient(page: Page) {
  await page.goto("./");
  await page.getByLabel("Open example").selectOption("rc-lowpass");
  await expect(page.locator('[data-testid^="part-"]').first()).toBeVisible();
  // The analyses are [ac, tran].
  await page.getByLabel("Analysis to run").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator(".nodal-runbar").getByRole("status")).toHaveText("Done");
  await expect(page.getByTestId("waveform-panel").getByTestId("plot")).toHaveCount(1);
  // The first node voltage is probed by default.
  await expect(page.locator(".nodal-chip")).toHaveCount(1);
}

/** Pixel position at a fraction of the plot area width. */
async function at(page: Page, fraction: number) {
  const box = await page.locator(".u-over").first().boundingBox();
  if (box === null) throw new Error("plot has no bounding box");
  return { x: box.x + box.width * fraction, y: box.y + box.height / 2 };
}

test("click_order_drag_and_nearest", async ({ page }) => {
  await openTransient(page);
  const p30 = await at(page, 0.3);
  await page.mouse.click(p30.x, p30.y);
  await expect(fieldA(page)).not.toHaveValue("");
  await expect(fieldB(page)).toHaveValue("");

  const p70 = await at(page, 0.7);
  await page.mouse.click(p70.x, p70.y);
  await expect(fieldB(page)).not.toHaveValue("");
  const a0 = await read(fieldA(page));
  const b0 = await read(fieldB(page));
  expect(b0).toBeGreaterThan(a0);
  await expect(page.locator('tr[data-signal^="V("] td[data-col="delta"]').first()).not.toHaveText(
    "–",
  );

  // Drag B to 50 %: B changes, A does not.
  const p50 = await at(page, 0.5);
  await page.mouse.move(p70.x, p70.y);
  await page.mouse.down();
  await page.mouse.move((p70.x + p50.x) / 2, p50.y, { steps: 4 });
  await page.mouse.move(p50.x, p50.y, { steps: 4 });
  await page.mouse.up();
  const b1 = await read(fieldB(page));
  expect(b1).toBeLessThan(b0);
  expect(await read(fieldA(page))).toBe(a0);

  // A click near A moves A, not B.
  const p20 = await at(page, 0.2);
  await page.mouse.click(p20.x, p20.y);
  expect(await read(fieldA(page))).toBeLessThan(a0);
  expect(await read(fieldB(page))).toBe(b1);

  // Hovering a cursor line shows the resize cursor class.
  const bx = await at(page, 0.5);
  await page.mouse.move(bx.x, bx.y);
  await expect(page.getByTestId("plot")).toHaveClass(/nodal-plot-grab/);
  await page.mouse.move(bx.x + 40, bx.y);
  await expect(page.getByTestId("plot")).not.toHaveClass(/nodal-plot-grab/);
});

test("shift_click_sets_b_and_clear_resets", async ({ page }) => {
  await openTransient(page);
  const p40 = await at(page, 0.4);
  await page.keyboard.down("Shift");
  await page.mouse.click(p40.x, p40.y);
  await page.keyboard.up("Shift");
  await expect(fieldB(page)).not.toHaveValue("");
  await expect(fieldA(page)).toHaveValue("");
  // Shift+click right on A still places B: it must not grab A.
  const p60 = await at(page, 0.6);
  await page.mouse.click(p60.x, p60.y);
  await expect(fieldA(page)).not.toHaveValue("");
  const aSet = await read(fieldA(page));
  const p41 = { x: p60.x + 2, y: p60.y };
  await page.keyboard.down("Shift");
  await page.mouse.click(p41.x, p41.y);
  await page.keyboard.up("Shift");
  expect(await read(fieldA(page))).toBe(aSet);
  expect(await read(fieldB(page))).toBeGreaterThan(aSet);
  await page.getByRole("button", { name: "Clear cursors" }).click();
  await expect(fieldB(page)).toHaveValue("");
  await expect(fieldA(page)).toHaveValue("");
});

test("keyboard_moves_and_clears_cursor_b", async ({ page }) => {
  await openTransient(page);
  const p30 = await at(page, 0.3);
  await page.mouse.click(p30.x, p30.y);
  const p70 = await at(page, 0.7);
  await page.mouse.click(p70.x, p70.y);

  // Shift+Tab from the signal picker lands on the plot, the previous stop in the page.
  await page.getByLabel("Signal").focus();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByTestId("plot")).toBeFocused();

  await page.keyboard.press("b");
  const b0 = await read(fieldB(page));
  const a0 = await read(fieldA(page));
  await page.keyboard.press("ArrowRight");
  const b1 = await read(fieldB(page));
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const b3 = await read(fieldB(page));
  expect(b1).toBeGreaterThan(b0);
  expect(b3).toBeGreaterThan(b1);
  await page.keyboard.press("ArrowLeft");
  expect(await read(fieldB(page))).toBeLessThan(b3);
  expect(await read(fieldA(page))).toBe(a0);

  // A moves with the keyboard after pressing A.
  await page.keyboard.press("a");
  await page.keyboard.press("ArrowLeft");
  expect(await read(fieldA(page))).toBeLessThan(a0);

  await page.keyboard.press("b");
  await page.keyboard.press("Delete");
  await expect(fieldB(page)).toHaveValue("");
  await expect(fieldA(page)).not.toHaveValue("");
});

test("cursors_survive_theme_and_width_changes", async ({ page }) => {
  await openTransient(page);
  const p30 = await at(page, 0.3);
  await page.mouse.click(p30.x, p30.y);
  const p70 = await at(page, 0.7);
  await page.mouse.click(p70.x, p70.y);
  const a = await fieldA(page).inputValue();
  const b = await fieldB(page).inputValue();

  await page.getByLabel("Theme").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(fieldA(page)).toHaveValue(a);
  await expect(fieldB(page)).toHaveValue(b);

  await page.setViewportSize({ width: 900, height: 700 });
  await expect(page.getByRole("status").filter({ hasText: "at least 1024 px wide" })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(fieldA(page)).toHaveValue(a);
  await expect(fieldB(page)).toHaveValue(b);
});
