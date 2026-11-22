import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function scan(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
  }));
}

for (const theme of ["light", "dark"] as const) {
  test(`axe finds no WCAG 2.2 AA violations in the ${theme} theme`, async ({ page }) => {
    await page.goto("./");
    await page.getByLabel("Theme").selectOption(theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.getByLabel("Open example").selectOption("ce-amplifier");
    const parts = page.locator('[data-testid^="part-"]');
    await expect(parts.first()).toBeVisible();

    // The analyses are [op, ac, tran]; run the AC sweep.
    await page.getByLabel("Analysis to run").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.locator(".nodal-runbar").getByRole("status")).toHaveText("Done");
    await expect(page.getByTestId("waveform-panel").getByTestId("plot")).toHaveCount(2);

    // Waveform viewer.
    expect(await scan(page), "waveform viewer").toEqual([]);

    // Analysis editor: nothing selected, the inspector shows project and analysis fields.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("complementary", { name: "Inspector" })).toBeVisible();
    expect(await scan(page), "analysis editor").toEqual([]);

    // Editor with a part selected and its inspector open.
    await parts.first().click();
    await expect(
      page.getByRole("complementary", { name: "Inspector" }).locator("h2"),
    ).toBeVisible();
    expect(await scan(page), "editor with inspector").toEqual([]);
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`axe finds no violations in the stale state, ${theme} theme`, async ({ page }) => {
    await page.goto("./");
    await page.getByLabel("Theme").selectOption(theme);
    await page.getByLabel("Open example").selectOption("ce-amplifier");
    const parts = page.locator('[data-testid^="part-"]');
    await expect(parts.first()).toBeVisible();
    const status = page.locator(".nodal-runbar").getByRole("status");
    const run = page.getByRole("button", { name: "Run", exact: true });

    // Operating point: the op tags, the part's operating-point values and the op table go stale.
    await run.click();
    await expect(status).toHaveText("Done");
    await parts.first().click();
    await page.keyboard.press("r");
    await expect(status).toHaveText("Out of date, run again");
    await expect(page.locator(".nodal-op-tags")).toHaveAttribute("data-stale", "true");
    expect(await scan(page), "stale operating point").toEqual([]);

    // AC sweep: the plots, chips, cursor inputs and readout go stale.
    await page.getByLabel("Analysis to run").selectOption({ index: 1 });
    await run.click();
    await expect(status).toHaveText("Done");
    await expect(page.getByTestId("waveform-panel").getByTestId("plot")).toHaveCount(2);
    await page.keyboard.press("r");
    await expect(status).toHaveText("Out of date, run again");
    await expect(page.getByTestId("waveform-panel")).toHaveAttribute("data-stale", "true");
    const stale = await new AxeBuilder({ page })
      .include('[data-testid="waveform-panel"]')
      .include(".nodal-inspector")
      .withTags(TAGS)
      .analyze();
    expect(
      stale.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      "stale waveform panel and inspector",
    ).toEqual([]);
  });
}

test("the read-only view below 1024 px has no axe violations", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await page.goto("./");
  await expect(page.getByRole("status").first()).toBeVisible();
  expect(await scan(page), "read-only view").toEqual([]);
});

test("the page has one main landmark, one h1 and ordered headings", async ({ page }) => {
  await page.goto("./");
  await page.getByLabel("Open example").selectOption("ce-amplifier");
  await expect(page.locator('[data-testid^="part-"]').first()).toBeVisible();
  await page.keyboard.press("Escape");
  const { violations } = await new AxeBuilder({ page })
    .withRules(["landmark-one-main", "page-has-heading-one", "region", "heading-order"])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nodal");
});

test("the uic checkbox with its label is at least 24x24 px", async ({ page }) => {
  await page.goto("./");
  await page.getByLabel("Open example").selectOption("ce-amplifier");
  await expect(page.locator('[data-testid^="part-"]').first()).toBeVisible();
  await page.keyboard.press("Escape");
  const box = await page.locator("label.nodal-check").first().boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(24);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);
});

test("Tab reaches every button, select, input and the canvas, each with a visible outline", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.getByTestId("schematic-canvas")).toBeVisible();
  // Every tabbable control present at load, found by selector, is marked before tabbing.
  const expected = await page.evaluate(() => {
    const els = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button, select, input, [data-testid="schematic-canvas"]',
      ),
    ).filter(
      (el) => !el.matches(":disabled") && el.tabIndex >= 0 && el.getClientRects().length > 0,
    );
    els.forEach((el) => {
      el.dataset.a11yExpect = "";
    });
    return els.length;
  });
  expect(expected).toBeGreaterThan(10);

  const noOutline: string[] = [];
  let remaining = expected;
  for (let i = 0; i < 200 && remaining > 0; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (el === null || el === document.body) return null;
      el.dataset.a11ySeen = "";
      return {
        name: `${el.tagName.toLowerCase()} "${el.getAttribute("aria-label") ?? el.textContent}"`,
        outline: getComputedStyle(el).outlineStyle,
        left: document.querySelectorAll("[data-a11y-expect]:not([data-a11y-seen])").length,
      };
    });
    if (info === null) continue;
    if (info.outline === "none") noOutline.push(info.name);
    remaining = info.left;
  }
  const unreached = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-a11y-expect]:not([data-a11y-seen])")).map((el) =>
      el.outerHTML.slice(0, 120),
    ),
  );
  expect(unreached, "controls Tab never reached").toEqual([]);
  expect(noOutline, "focused elements without an outline").toEqual([]);
});

test("the keyboard can select, rotate and inspect a part, and Tab leaves the canvas", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByLabel("Open example").selectOption("ce-amplifier");
  const parts = page.locator('[data-testid^="part-"]');
  await expect(parts.first()).toBeVisible();
  const canvas = page.getByTestId("schematic-canvas");
  const inspector = page.getByRole("complementary", { name: "Inspector" });

  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  const first = parts.first();
  await expect(first).toHaveAttribute("data-selected", "true");
  await expect(inspector.locator("h2")).not.toHaveText("Project");
  // The selected part is not marked by color alone: it has an outline.
  await expect(first.locator(".nodal-outline")).toHaveCount(1);

  const before = await first.getAttribute("transform");
  await page.keyboard.press("r");
  await expect.poll(() => first.getAttribute("transform")).not.toBe(before);
  await expect(first).toHaveAttribute("data-selected", "true");

  // The next arrow moves the selection; Left comes back.
  await page.keyboard.press("ArrowRight");
  await expect(first).not.toHaveAttribute("data-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(first).toHaveAttribute("data-selected", "true");

  // Escape clears the selection and the canvas keeps focus.
  await page.keyboard.press("Escape");
  await expect(first).not.toHaveAttribute("data-selected", "true");

  // Tab leaves the canvas.
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))).not.toBe(
    "schematic-canvas",
  );
});
