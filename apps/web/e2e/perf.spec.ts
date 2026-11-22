import { expect, test } from "@playwright/test";

// Performance budget (docs/ROADMAP.md). Chromium only (see playwright.config.ts).
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
  for (const row of await rows.all()) {
    const name = await row.getAttribute("data-name");
    const median = await row.getAttribute("data-median");
    expect(
      await row.getAttribute("data-status"),
      `${name ?? "?"} median ${median ?? "n/a"} ms`,
    ).toBe("pass");
  }
});
