import { expect, test, type Page } from "@playwright/test";

async function openAcResults(page: Page) {
  await page.getByLabel("Open example").selectOption("ce-amplifier");
  await expect(page.locator('[data-testid^="part-"]').first()).toBeVisible();
  await page.getByLabel("Analysis to run").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator(".nodal-runbar").getByRole("status")).toHaveText("Done");
  await expect(page.getByTestId("waveform-panel")).toBeVisible();
}

/** Items of the schematic that lie outside the canvas box. */
async function outside(page: Page): Promise<string[]> {
  const canvas = await page.getByTestId("schematic-canvas").boundingBox();
  if (!canvas) throw new Error("no canvas");
  return page.locator('[data-testid^="part-"], [data-testid^="wire-"]').evaluateAll(
    (els, c) =>
      els.flatMap((el) => {
        const r = el.getBoundingClientRect();
        const out =
          r.left < c.x - 0.5 ||
          r.top < c.y - 0.5 ||
          r.right > c.x + c.width + 0.5 ||
          r.bottom > c.y + c.height + 0.5;
        return out ? [el.getAttribute("data-testid") ?? "?"] : [];
      }),
    canvas,
  );
}

test("opening the waveform panel at 1024x768 refits the whole circuit into the canvas", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("./");
  await openAcResults(page);
  await expect.poll(() => outside(page)).toEqual([]);
});

test("an example opened at 1024x768 is fitted into the canvas before any run", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("./");
  await page.getByLabel("Open example").selectOption("ce-amplifier");
  await expect(page.locator('[data-testid^="part-"]').first()).toBeVisible();
  await expect.poll(() => outside(page)).toEqual([]);
  // The fit is spent: a zoom afterwards stays.
  const world = page.locator('[data-testid="schematic-canvas"] > g').last();
  const box = await page.getByTestId("schematic-canvas").boundingBox();
  if (!box) throw new Error("no canvas");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const before = await world.getAttribute("transform");
  await page.mouse.wheel(0, -300);
  await expect.poll(async () => await world.getAttribute("transform")).not.toBe(before);
  const zoomed = await world.getAttribute("transform");
  await page.waitForTimeout(600);
  expect(await world.getAttribute("transform")).toBe(zoomed);
});

test("running an operating point first, then AC, still refits the circuit at 1024x768", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("./");
  await page.getByLabel("Open example").selectOption("ce-amplifier");
  await expect(page.locator('[data-testid^="part-"]').first()).toBeVisible();
  // The operating point table opens a short panel.
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator(".nodal-runbar").getByRole("status")).toHaveText("Done");
  await expect(page.getByRole("table", { name: "Operating point" })).toBeVisible();
  // The AC plot then replaces it with a much taller panel.
  await page.getByLabel("Analysis to run").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByTestId("waveform-panel")).toBeVisible();
  await expect.poll(() => outside(page)).toEqual([]);
});

for (const [width, height] of [
  [1024, 768],
  [1280, 800],
] as const) {
  test(`the analysis type selects show their option text in full at ${String(width)} px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("./");
    await page.getByLabel("Open example").selectOption("ce-amplifier");
    await expect(page.locator('[data-testid^="part-"]').first()).toBeVisible();
    await page.keyboard.press("Escape");
    const selects = page.getByRole("combobox", { name: "Analysis type" });
    expect(await selects.count()).toBeGreaterThan(1);
    const bad = await selects.evaluateAll((els) =>
      els.flatMap((el) => {
        const sel = el as HTMLSelectElement;
        const css = getComputedStyle(sel);
        const ctx = document.createElement("canvas").getContext("2d");
        if (!ctx) return [];
        ctx.font = `${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
        const text = sel.selectedOptions[0]?.text ?? "";
        const pad = parseFloat(css.paddingLeft) + parseFloat(css.paddingRight);
        // About 20 px of the right side belong to the drop-down arrow.
        const room = sel.clientWidth - pad - 20;
        return ctx.measureText(text).width > room ? [text] : [];
      }),
    );
    expect(bad, "selects whose text is cut").toEqual([]);
  });
}

test("the refit happens once: the user's zoom afterwards is kept", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("./");
  await openAcResults(page);
  await expect.poll(() => outside(page)).toEqual([]);
  const world = page.locator('[data-testid="schematic-canvas"] > g').last();
  const box = await page.getByTestId("schematic-canvas").boundingBox();
  if (!box) throw new Error("no canvas");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -300);
  await expect.poll(async () => await world.getAttribute("transform")).not.toBeNull();
  const zoomed = await world.getAttribute("transform");
  await page.waitForTimeout(600);
  expect(await world.getAttribute("transform")).toBe(zoomed);
});

test("the uic label does not touch another control in the transient card", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("./");
  await page.getByLabel("Open example").selectOption("ce-amplifier");
  await expect(page.locator('[data-testid^="part-"]').first()).toBeVisible();
  await page.keyboard.press("Escape");
  const uic = page.locator("label.nodal-check").first();
  await uic.scrollIntoViewIfNeeded();
  const a = await uic.boundingBox();
  if (!a) throw new Error("no uic label");
  const others = await page
    .locator(".nodal-inspector button, .nodal-inspector select, .nodal-inspector input")
    .evaluateAll(
      (els, r) =>
        els.flatMap((el) => {
          if (el.closest("label.nodal-check")) return [];
          const b = el.getBoundingClientRect();
          const overlap =
            b.left < r.x + r.width && b.right > r.x && b.top < r.y + r.height && b.bottom > r.y;
          return overlap ? [el.getAttribute("aria-label") ?? el.tagName] : [];
        }),
      a,
    );
  expect(others).toEqual([]);
});

test("a DC plot with voltage and current probes fits its y title in the plot height at 1024 px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("./");
  await page.getByLabel("Open example").selectOption("cmos-inverter");
  await expect(page.locator('[data-testid^="part-"]').first()).toBeVisible();
  const choices = await page.getByLabel("Analysis to run").locator("option").allTextContents();
  const dc = choices.findIndex((t) => t.includes("DC sweep"));
  expect(dc).toBeGreaterThanOrEqual(0);
  await page.getByLabel("Analysis to run").selectOption({ index: dc });
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator(".nodal-runbar").getByRole("status")).toHaveText("Done");
  const picker = page.locator(".nodal-signalpicker select");
  const current = await picker
    .locator("option")
    .evaluateAll((os) =>
      os.map((o) => (o as HTMLOptionElement).value).find((v) => v.startsWith("I(")),
    );
  expect(current).toBeDefined();
  await picker.selectOption(current ?? "");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const plot = page.locator(".nodal-plot").first();
  await expect(plot).toHaveAttribute("data-y-label", "Voltage (V), current (A)");
  const box = await plot.boundingBox();
  if (!box) throw new Error("no plot");
  // The y title is drawn rotated, so its text width must fit the plot height minus the titled x
  // axis (44 px, the axis size in Plot.tsx).
  const width = await page.evaluate(() => {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return Infinity;
    const css = getComputedStyle(document.documentElement);
    ctx.font = `${css.getPropertyValue("--weight-medium")} ${css.getPropertyValue("--text-sm")} ${css.getPropertyValue("--font-ui")}`;
    return ctx.measureText("Voltage (V), current (A)").width;
  });
  expect(width).toBeLessThan(box.height - 44);
});

for (const [width, height] of [
  [1024, 768],
  [1280, 800],
] as const) {
  for (const [name, example, pick] of [
    ["AC", "ce-amplifier", "AC"],
    ["transient", "rc-lowpass", "Transient"],
    ["DC sweep", "cmos-inverter", "DC sweep"],
  ] as const) {
    test(`the ${name} cursor table stays inside the side panel at ${String(width)} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto("./");
      await page.getByLabel("Open example").selectOption(example);
      await expect(page.locator('[data-testid^="part-"]').first()).toBeVisible();
      const choices = await page.getByLabel("Analysis to run").locator("option").allTextContents();
      const index = choices.findIndex((t) => t.includes(pick));
      expect(index, `${pick} analysis`).toBeGreaterThanOrEqual(0);
      await page.getByLabel("Analysis to run").selectOption({ index });
      await page.getByRole("button", { name: "Run", exact: true }).click();
      await expect(page.locator(".nodal-runbar").getByRole("status")).toHaveText("Done");
      await expect(page.getByTestId("waveform-panel")).toBeVisible();
      // Add a current probe when there is one, so the table has a long row too.
      const picker = page.locator(".nodal-signalpicker select");
      const current = await picker
        .locator("option")
        .evaluateAll((os) =>
          os.map((o) => (o as HTMLOptionElement).value).find((v) => v.startsWith("I(")),
        );
      if (current !== undefined) {
        await picker.selectOption(current);
        await page.getByRole("button", { name: "Add", exact: true }).click();
      }
      const over = page.locator(".u-over").first();
      const box = await over.boundingBox();
      if (!box) throw new Error("plot has no box");
      const y = box.y + box.height / 2;
      await page.mouse.click(box.x + box.width * 0.3, y);
      await page.mouse.click(box.x + box.width * 0.7, y);
      await expect(page.getByLabel("Cursor B", { exact: true })).not.toHaveValue("");
      const side = page.locator(".nodal-waveform-side");
      const sizes = await side.evaluate((el) => ({
        scroll: el.scrollWidth,
        client: el.clientWidth,
      }));
      expect(sizes.scroll, "side panel scrollWidth").toBeLessThanOrEqual(sizes.client);
      // Every cell lies inside the panel, not only the table box.
      const panel = await side.boundingBox();
      if (!panel) throw new Error("no side panel");
      const strays = await side.locator("th, td").evaluateAll(
        (els, edge) =>
          els.flatMap((el) => {
            const r = el.getBoundingClientRect();
            return r.right > edge + 0.5 ? [el.textContent.trim()] : [];
          }),
        panel.x + panel.width,
      );
      expect(strays, "cells past the panel edge").toEqual([]);
    });
  }
}
