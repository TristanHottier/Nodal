import { expect, test } from "@playwright/test";

// Performance budget (docs/ROADMAP.md). Runs alone in the `perf` project (pnpm e2e:perf).
test("engine_meets_perf_budget", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  await page.goto("bench.html");
  await page.waitForFunction(() => document.body.dataset.done === "1", undefined, {
    timeout: 280_000,
  });
  const table = page.getByTestId("bench-results");
  const text = await table.innerText();
  console.log(text);
  await testInfo.attach("bench-results", { body: text, contentType: "text/plain" });
  const rows = table.locator("tbody tr");
  expect(await rows.count()).toBeGreaterThan(0);
  // The editor row is part of the budget: 60 fps (>= 58 fps, <= 5 % slow frames).
  await expect(table.locator('tbody tr[data-name="editor pan/zoom (500 parts)"]')).toHaveCount(1);
  for (const row of await rows.all()) {
    const name = await row.getAttribute("data-name");
    const median = await row.getAttribute("data-median");
    expect(
      await row.getAttribute("data-status"),
      `${name ?? "?"} median ${median ?? "n/a"} ms`,
    ).toBe("pass");
  }
});
