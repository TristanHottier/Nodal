import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const A1 = path.resolve(here, "../../../validation/schematics/A1.nodal.json");

interface SavedProject {
  formatVersion: number;
  schematic: { parts: { name: string; params: Record<string, string> }[] };
}

test("open_reference_edit_reload_export", async ({ page }) => {
  page.on("dialog", (d) => {
    void d.accept();
  });
  await page.goto("./");
  await page.getByTestId("open-file").setInputFiles(A1);

  const r1 = page.getByTestId("part-p-R1");
  await expect(r1).toBeVisible();
  await expect(page.locator('[data-testid^="part-"]')).toHaveCount(5);
  await expect(page.getByText("No problems")).toBeVisible();

  await r1.click();
  const value = page.getByLabel("Value", { exact: true });
  await expect(value).toHaveValue("1k");
  await value.fill("2k");
  await value.press("Enter");

  // Autosave is debounced by 500 ms.
  await page.waitForTimeout(900);
  await page.reload();

  await expect(page.getByTestId("part-p-R1")).toBeVisible();
  await page.getByTestId("part-p-R1").click();
  await expect(page.getByLabel("Value", { exact: true })).toHaveValue("2k");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save as…" }).click();
  const file = await (await downloadPromise).path();
  const saved = JSON.parse(readFileSync(file, "utf8")) as SavedProject;
  expect(saved.formatVersion).toBe(1);
  const saved1 = saved.schematic.parts.find((p) => p.name === "R1");
  expect(saved1?.params["value"]).toBe("2k");
});

test("bad_file_reports_error", async ({ page }, testInfo) => {
  page.on("dialog", (d) => {
    void d.accept();
  });
  await page.goto("./");
  const bad = testInfo.outputPath("bad.nodal.json");
  writeFileSync(bad, JSON.stringify({ format: "nodal-project", formatVersion: 99 }));
  await page.getByTestId("open-file").setInputFiles(bad);
  await expect(page.getByTestId("project-message")).toContainText("99");
  await expect(page.locator('[data-testid^="part-"]')).toHaveCount(0);
});
