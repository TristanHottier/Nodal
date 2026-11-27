import { expect, test } from "@playwright/test";

test("shell shows engine version from WASM worker", async ({ page }) => {
  const failedRequests: string[] = [];
  const requestedPaths: string[] = [];
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.url()} (${request.failure()?.errorText ?? "unknown error"})`);
  });
  page.on("request", (request) => {
    requestedPaths.push(new URL(request.url()).pathname);
  });

  await page.goto("./");

  await expect(page.getByTestId("engine-status")).toHaveText("Engine 1.2.0", {
    timeout: 10_000,
  });
  expect(failedRequests).toEqual([]);

  // `vite preview` serves index.html for unknown paths, so a build with the
  // wrong base can still load. Pin the base path directly: every asset,
  // including the worker script and the .wasm file, must live under /Nodal/.
  expect(requestedPaths.some((path) => path.endsWith(".wasm"))).toBe(true);
  expect(requestedPaths.filter((path) => !path.startsWith("/Nodal/"))).toEqual([]);
});

test("shell reports an error when the WASM module fails to load", async ({ page }) => {
  // The 5 s budget is below the client's 10 s worker timeout, so only the real
  // error reply can satisfy it, not the timeout fallback.
  // Pins the real chain: wasm fetch fails -> init() rejects -> worker posts
  // {type:"error"} -> client rejects -> UI shows the error.
  await page.route("**/*.wasm", (route) => route.abort());

  await page.goto("./");

  await expect(page.getByTestId("engine-status")).toHaveText(/^Engine failed to load: /, {
    timeout: 5_000,
  });
});

test("built index.html preloads exactly one font, the Inter Latin file, and the browser uses it", async ({
  page,
  request,
}) => {
  const fontRequests: string[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "font") fontRequests.push(new URL(r.url()).pathname);
  });
  await page.goto("./");
  await expect(page.getByTestId("engine-status")).toHaveText(/Engine/, { timeout: 10_000 });

  const hrefs = await page
    .locator('link[rel="preload"][as="font"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute("href")));
  expect(hrefs).toHaveLength(1);
  const href = hrefs[0] ?? "";
  expect(href).toMatch(/\/Nodal\/assets\/inter-latin-wght-normal-.*\.woff2$/);
  expect((await request.get(href)).ok()).toBe(true);
  // The preload is the file the page actually uses, so it is not fetched twice.
  expect(fontRequests.filter((p) => p === href).length).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.fonts.check('13px "Inter Variable"'))).toBe(true);
});
