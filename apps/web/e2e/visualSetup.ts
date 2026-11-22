import { expect, type Page } from "@playwright/test";

export async function openEditor(page: Page): Promise<void> {
  await page.goto("./");
  await page.getByLabel("Open example").selectOption("ce-amplifier");
  await expect(page.locator('[data-testid^="part-"]').first()).toBeVisible();
}

export async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.getByLabel("Theme").selectOption(theme);
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

// The analyses are [op, ac, tran]; run the AC sweep and wait for the waveform viewer.
export async function runAc(page: Page): Promise<void> {
  await page.getByLabel("Analysis to run").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator(".nodal-runbar").getByRole("status")).toHaveText("Done");
  await expect(page.getByTestId("waveform-panel").getByTestId("plot")).toHaveCount(2);
}
