import { expect, test, type Page } from "@playwright/test";

// Records, at DOMContentLoaded (before the module script runs React), the theme attribute,
// the body background and the --color-canvas value resolved to a computed color.
async function recordAtDomReady(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const probe = document.createElement("div");
      probe.style.background = "var(--color-canvas)";
      document.body.appendChild(probe);
      const w = window as unknown as { __early: Record<string, string | null> };
      w.__early = {
        theme: document.documentElement.getAttribute("data-theme"),
        body: getComputedStyle(document.body).backgroundColor,
        canvas: getComputedStyle(probe).backgroundColor,
      };
      probe.remove();
    });
  });
}

const early = (page: Page) =>
  page.evaluate(() => (window as unknown as { __early: Record<string, string | null> }).__early);

test("a stored dark choice paints dark before React mounts", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("nodal-theme", "dark");
  });
  await recordAtDomReady(page);
  await page.goto("./");
  const e = await early(page);
  expect(e.theme).toBe("dark");
  expect(e.body).toBe(e.canvas);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("a dark OS setting without a stored choice gives the dark canvas", async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();
  await recordAtDomReady(page);
  await page.goto("./");
  const e = await early(page);
  expect(e.theme).toBeNull();
  expect(e.body).toBe(e.canvas);
  const light = await browser.newContext({ colorScheme: "light" });
  const lightPage = await light.newPage();
  await recordAtDomReady(lightPage);
  await lightPage.goto("./");
  expect((await early(lightPage)).canvas).not.toBe(e.canvas);
  await context.close();
  await light.close();
});

test("choosing Light persists across reload", async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();
  await page.goto("./");
  await page.getByLabel("Theme").selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByLabel("Theme")).toHaveValue("light");
  await context.close();
});
