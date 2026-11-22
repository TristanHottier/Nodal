import { type Browser, expect, test, type Page } from "@playwright/test";

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
        colorScheme: document.documentElement.style.colorScheme,
        body: getComputedStyle(document.body).backgroundColor,
        canvas: getComputedStyle(probe).backgroundColor,
      };
      probe.remove();
    });
  });
}

async function lightCanvas(browser: Browser): Promise<string | null> {
  const context = await browser.newContext({ colorScheme: "light" });
  const page = await context.newPage();
  await recordAtDomReady(page);
  await page.goto("./");
  const canvas = (await early(page)).canvas;
  await context.close();
  return canvas;
}

const early = (page: Page) =>
  page.evaluate(() => (window as unknown as { __early: Record<string, string | null> }).__early);

test("a stored dark choice paints dark before React mounts", async ({ page, browser }) => {
  await page.addInitScript(() => {
    localStorage.setItem("nodal-theme", "dark");
  });
  await recordAtDomReady(page);
  await page.goto("./");
  const e = await early(page);
  expect(e.theme).toBe("dark");
  expect(e.body).toBe(e.canvas);
  // The canvas really is dark: it differs from the light theme's canvas, so a missing
  // stylesheet (both transparent) cannot pass.
  expect(e.canvas).not.toBe(await lightCanvas(browser));
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("a stored Light choice on a dark OS fixes color-scheme before React mounts", async ({
  browser,
}) => {
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("nodal-theme", "light");
  });
  await recordAtDomReady(page);
  await page.goto("./");
  const e = await early(page);
  expect(e.theme).toBe("light");
  expect(e.colorScheme).toBe("light");
  expect(e.canvas).toBe(await lightCanvas(browser));
  await context.close();
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
