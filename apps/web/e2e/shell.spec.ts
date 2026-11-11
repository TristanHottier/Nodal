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

  await expect(page.getByTestId("engine-status")).toHaveText("Engine 0.1.0", {
    timeout: 10_000,
  });
  expect(failedRequests).toEqual([]);

  // `vite preview` serves index.html for unknown paths, so a build with the
  // wrong base can still load. Pin the base path directly: every asset,
  // including the worker script and the .wasm file, must live under /Nodal/.
  expect(requestedPaths.some((path) => path.endsWith(".wasm"))).toBe(true);
  expect(requestedPaths.filter((path) => !path.startsWith("/Nodal/"))).toEqual([]);
});
