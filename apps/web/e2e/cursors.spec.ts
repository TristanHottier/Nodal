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
const activeBadge = (page: Page) => page.getByTestId("active-cursor");
const delta = (page: Page) => page.locator('tr[data-signal^="V("] td[data-col="delta"]').first();
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
  // The last click placed B; the keyboard picks A, and A stays active through both changes.
  await page.getByLabel("Signal").focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("a");
  await expect(activeBadge(page)).toHaveText("Active: A");

  await page.getByLabel("Theme").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(fieldA(page)).toHaveValue(a);
  await expect(fieldB(page)).toHaveValue(b);
  await expect(activeBadge(page)).toHaveText("Active: A");

  await page.setViewportSize({ width: 900, height: 700 });
  await expect(page.getByRole("status").filter({ hasText: "at least 1024 px wide" })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(fieldA(page)).toHaveValue(a);
  await expect(fieldB(page)).toHaveValue(b);
  await expect(activeBadge(page)).toHaveText("Active: A");
});

test("cursors_are_placed_and_stepped_by_keyboard_alone", async ({ page }) => {
  await openTransient(page);
  await expect(fieldA(page)).toHaveValue("");
  await expect(fieldB(page)).toHaveValue("");

  await page.getByLabel("Signal").focus();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByTestId("plot")).toBeFocused();

  // An arrow with no cursor placed starts A at the middle sample.
  await page.keyboard.press("ArrowRight");
  await expect(fieldA(page)).not.toHaveValue("");
  await expect(fieldB(page)).toHaveValue("");
  await expect(delta(page)).toHaveText("–");

  // The axis samples from the first one, read one key press at a time.
  await page.keyboard.press("b");
  await page.keyboard.press("Home");
  const samples = [await fieldB(page).inputValue()];
  for (let i = 0; i < 10; i += 1) {
    await page.keyboard.press("ArrowRight");
    samples.push(await fieldB(page).inputValue());
  }
  expect(new Set(samples).size).toBe(samples.length);
  await expect(activeBadge(page)).toHaveText("Active: B");
  // The delta row has a value now that both cursors are set.
  await expect(delta(page)).not.toHaveText("–");

  // Three presses from the first sample land exactly on the third sample.
  await page.keyboard.press("Home");
  for (let i = 0; i < 3; i += 1) await page.keyboard.press("ArrowRight");
  await expect(fieldB(page)).toHaveValue(samples[3] as string);

  // Shift moves ten samples at once.
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(fieldB(page)).toHaveValue(samples[10] as string);
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(fieldB(page)).toHaveValue(samples[0] as string);
});

test("plot_focus_ring_is_visible_and_not_dimmed_when_stale", async ({ page }) => {
  await openTransient(page);
  const plot = page.getByTestId("plot");
  // Make the results stale: select a part and rotate it.
  await page.locator('[data-testid^="part-"]').first().click();
  await page.keyboard.press("r");
  await expect(page.getByTestId("waveform-panel")).toHaveAttribute("data-stale", "true");

  await page.getByLabel("Signal").focus();
  await page.keyboard.press("Shift+Tab");
  await expect(plot).toBeFocused();

  const ring = await plot.evaluate((el) => {
    const cs = getComputedStyle(el);
    const host = el.getBoundingClientRect();
    const clip = (el.closest(".nodal-waveform-plots") as HTMLElement).getBoundingClientRect();
    const chart = getComputedStyle(el.querySelector(".uplot") as Element);
    return {
      style: cs.outlineStyle,
      width: Number.parseFloat(cs.outlineWidth),
      offset: Number.parseFloat(cs.outlineOffset),
      hostOpacity: cs.opacity,
      chartOpacity: Number(chart.opacity),
      // How far the ring's outer edge lies outside the host box (negative: inside it).
      reach: Number.parseFloat(cs.outlineOffset) + Number.parseFloat(cs.outlineWidth),
      host: { left: host.left, right: host.right, top: host.top, bottom: host.bottom },
      clip: { left: clip.left, right: clip.right, top: clip.top, bottom: clip.bottom },
    };
  });
  expect(ring.style).toBe("solid");
  expect(ring.width).toBeGreaterThan(0);
  // The whole ring sits inside the box that clips it, on all four sides.
  expect(ring.host.left - ring.reach).toBeGreaterThanOrEqual(ring.clip.left);
  expect(ring.host.right + ring.reach).toBeLessThanOrEqual(ring.clip.right);
  expect(ring.host.top - ring.reach).toBeGreaterThanOrEqual(ring.clip.top);
  expect(ring.host.bottom + ring.reach).toBeLessThanOrEqual(ring.clip.bottom);
  // The stale dimming applies to the chart, never to the host that carries the ring.
  expect(ring.hostOpacity).toBe("1");
  expect(ring.chartOpacity).toBeLessThan(1);
});
