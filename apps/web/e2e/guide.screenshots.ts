// Takes the screenshots used by docs/user-guide.md. Not part of the e2e run.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../../../docs/user-guide");
const shot = (name: string) => path.join(outDir, `${name}.png`);

const status = (page: Page) => page.locator(".nodal-runbar").getByRole("status");

async function openExample(page: Page, id: string) {
  await page.goto("./");
  await page.getByLabel("Open example").selectOption(id);
  await expect(page.locator('[data-testid^="part-"]').first()).toBeVisible();
}

async function runAnalysis(page: Page, index: number) {
  await page.getByLabel("Analysis to run").selectOption({ index });
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(status(page)).toHaveText("Done");
}

test.beforeAll(() => {
  mkdirSync(outDir, { recursive: true });
});

test("editor with the CE amplifier", async ({ page }) => {
  await openExample(page, "ce-amplifier");
  await page.screenshot({ path: shot("editor-ce-amplifier") });
});

test("analysis editor", async ({ page }) => {
  await openExample(page, "rc-lowpass");
  // Nothing selected, so the inspector shows the project, models and analyses.
  await page.getByRole("complementary", { name: "Inspector" }).screenshot({
    path: shot("analysis-editor"),
  });
});

test("operating-point tags on the divider", async ({ page }) => {
  await openExample(page, "divider");
  await runAnalysis(page, 0);
  await expect(page.locator('[data-testid^="op-tag-"]').first()).toBeVisible();
  const canvas = page.getByTestId("schematic-canvas");
  const box = await canvas.boundingBox();
  if (box === null) throw new Error("canvas has no bounding box");
  // Zoom in around the circuit so the tags are readable.
  await page.mouse.move(box.x + 100, box.y + 120);
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -100);
  await page.screenshot({
    path: shot("op-tags-divider"),
    clip: { x: box.x, y: box.y, width: 640, height: 400 },
  });
});

test("transient waveform with cursors on the RC low-pass", async ({ page }) => {
  await openExample(page, "rc-lowpass");
  // Analyses are [ac, tran]; the second is the pulse response.
  await runAnalysis(page, 1);
  await expect(page.getByTestId("waveform-panel")).toBeVisible();
  await page.getByLabel("Signal", { exact: true }).selectOption("V(out)");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator('[data-probe="V(out)"]')).toBeVisible();
  const setCursor = async (label: string, text: string) => {
    const input = page.getByLabel(label, { exact: true });
    await input.fill(text);
    await input.press("Enter");
  };
  await setCursor("Cursor A", "0.5m");
  await setCursor("Cursor B", "2m");
  await expect(page.locator('tr[data-signal="V(out)"] td[data-col="delta"]')).not.toHaveText("–");
  await page.screenshot({ path: shot("waveform-rc-transient") });
});

test("Bode view of the CE amplifier", async ({ page }) => {
  await openExample(page, "ce-amplifier");
  // Analyses are [op, ac, tran].
  await runAnalysis(page, 1);
  await expect(page.getByTestId("waveform-panel").getByTestId("plot")).toHaveCount(2);
  const setCursor = async (label: string, text: string) => {
    const input = page.getByLabel(label, { exact: true });
    await input.fill(text);
    await input.press("Enter");
  };
  await setCursor("Cursor A", "10k");
  await page.screenshot({ path: shot("bode-ce-amplifier") });
});
