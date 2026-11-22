import { expect, type Page, test } from "@playwright/test";

const status = (page: Page) => page.locator(".nodal-runbar").getByRole("status");

async function openExample(page: Page, id: string) {
  await page.goto("./");
  await page.getByLabel("Open example").selectOption(id);
  await expect(page.locator('[data-testid^="part-"]').first()).toBeVisible();
}

test("ce_amplifier_ac_shows_bode", async ({ page }) => {
  await openExample(page, "ce-amplifier");
  // The analyses are [op, ac, tran]; pick the second.
  await page.getByLabel("Analysis to run").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(status(page)).toHaveText("Done");
  const plots = page.getByTestId("waveform-panel").getByTestId("plot");
  await expect(plots).toHaveCount(2);
  await expect(plots.nth(0)).toHaveAttribute("data-y-label", "Magnitude (dB)");
  await expect(plots.nth(1)).toHaveAttribute("data-y-label", "Phase (°)");
});

test("divider_op_tag", async ({ page }) => {
  await openExample(page, "divider");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(status(page)).toHaveText("Done");
  const tags = page.locator('[data-testid^="op-tag-"]');
  await expect(tags.filter({ hasText: /^3\.333 V$/ })).toHaveCount(1);
});
