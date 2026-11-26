import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function scan(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations.map((v) => ({
    id: v.id,
    nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
  }));
}

const drawerOf = (page: Page) => page.getByRole("complementary", { name: "Codex" });

/** Places one part on the canvas and selects it with the select tool. */
async function placeAndSelect(page: Page, name: string) {
  const canvas = page.getByTestId("schematic-canvas");
  const box = await canvas.boundingBox();
  if (box === null) throw new Error("canvas has no bounding box");
  await page.getByRole("button", { name: `Place ${name}` }).click();
  await page.mouse.click(box.x + 200, box.y + 200);
  await page.keyboard.press("Escape");
  const part = page.locator('[data-testid^="part-"]').first();
  await part.click();
  await expect(part).toHaveAttribute("data-selected", "true");
  return part;
}

test.describe("the codex drawer", () => {
  test("opens from the parts panel by keyboard and closes with Esc, leaving the selection alone", async ({
    page,
  }) => {
    await page.goto("./");
    const part = await placeAndSelect(page, "Resistor");
    await page.getByRole("button", { name: "Place Diode" }).focus();
    await page.keyboard.press("Tab");
    const about = page.getByRole("button", { name: "About Diode" });
    await expect(about).toBeFocused();
    await page.keyboard.press("Enter");

    const drawer = drawerOf(page);
    await expect(drawer.getByRole("heading", { name: "Diode", level: 1 })).toBeVisible();
    await expect(drawer.locator(":focus")).toHaveCount(1);
    await expect(drawer.locator("math").first()).toBeAttached();
    await expect(part).toHaveAttribute("data-selected", "true");
    await expect(page.getByRole("button", { name: "Place Diode" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(about).toBeFocused();
    await expect(part).toHaveAttribute("data-selected", "true");
  });

  test("opens from the parts panel with the mouse and closes with Esc", async ({ page }) => {
    await page.goto("./");
    const part = await placeAndSelect(page, "Resistor");
    const about = page.getByRole("button", { name: "About Diode" });
    await about.click();
    const drawer = drawerOf(page);
    await expect(drawer.getByRole("heading", { name: "Diode", level: 1 })).toBeVisible();
    await expect(drawer.locator(":focus")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(about).toBeFocused();
    await expect(part).toHaveAttribute("data-selected", "true");
  });

  test("the close button closes it and returns focus to the opener", async ({ page }) => {
    await page.goto("./");
    const about = page.getByRole("button", { name: "About Resistor" });
    await about.click();
    await drawerOf(page).getByRole("button", { name: "Close" }).click();
    await expect(drawerOf(page)).toHaveCount(0);
    await expect(about).toBeFocused();
  });

  test("opens from the inspector of a selected part", async ({ page }) => {
    await page.goto("./");
    await placeAndSelect(page, "NPN transistor");
    await page.getByRole("button", { name: "About this part" }).click();
    const drawer = drawerOf(page);
    await expect(drawer.getByRole("heading", { name: "NPN transistor", level: 1 })).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Open full page" })).toHaveAttribute(
      "href",
      "#/codex/npn",
    );
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(page.getByRole("button", { name: "About this part" })).toBeFocused();
  });

  test("opens the analysis entry from the analysis editor", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "About this analysis" }).first().click();
    await expect(
      drawerOf(page).getByRole("heading", { name: "Operating point", level: 1 }),
    ).toBeVisible();
  });
});

test("the top-bar link opens the codex; search, reload and Back work", async ({ page }) => {
  await page.goto("./");
  await placeAndSelect(page, "NPN transistor");
  await page.getByRole("banner").getByRole("link", { name: "Codex" }).click();
  await expect(page).toHaveURL(/#\/codex$/);
  await page.getByRole("searchbox", { name: "Search the codex" }).fill("mosfet");
  const nmos = page.getByRole("link", { name: "NMOS transistor" });
  await nmos.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/codex\/nmos$/);
  await expect(page.getByRole("heading", { name: "NMOS transistor", level: 1 })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "NMOS transistor", level: 1 })).toBeVisible();

  await page.goBack();
  await page.goBack();
  await expect(page.getByTestId("schematic-canvas")).toBeVisible();
  await expect(page.locator('[data-testid^="part-"]')).toHaveCount(1);
});

test("Try it opens the example in the editor", async ({ page }) => {
  await page.goto("./#/codex/capacitor");
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: /^Try it/ }).click();
  await expect(page.getByTestId("schematic-canvas")).toBeVisible();
  await expect(page.getByTestId("project-name")).toContainText("RC low-pass");
});

test("a 600 px wide window reads and searches the codex", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await page.goto("./#/codex/diode");
  await expect(page.getByRole("heading", { name: "Diode", level: 1 })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole("searchbox", { name: "Search the codex" }).fill("mosfet");
  await expect(page.getByRole("link", { name: "NMOS transistor" })).toBeVisible();
});

for (const theme of ["light", "dark"] as const) {
  test(`axe finds no violations in the codex, ${theme} theme`, async ({ page }) => {
    await page.goto("./");
    await page.getByLabel("Theme").selectOption(theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

    // The parts panel with its info buttons, then the open drawer.
    expect(await scan(page), "palette with info buttons").toEqual([]);
    await page.getByRole("button", { name: "About Diode" }).click();
    await expect(drawerOf(page).locator("math").first()).toBeAttached();
    expect(await scan(page), "open drawer").toEqual([]);
    await page.keyboard.press("Escape");

    await page.goto("./#/codex");
    await expect(page.getByRole("heading", { name: "Codex", level: 1 })).toBeVisible();
    expect(await scan(page), "codex index").toEqual([]);

    await page.goto("./#/codex/diode");
    await expect(page.getByRole("heading", { name: "Diode", level: 1 })).toBeVisible();
    await expect(page.locator("math").first()).toBeAttached();
    expect(await scan(page), "codex entry").toEqual([]);
  });
}
