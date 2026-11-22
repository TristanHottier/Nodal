import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const schematic = (name: string) =>
  path.resolve(here, `../../../validation/schematics/${name}.nodal.json`);

// Default view: zoom 1, origin at the canvas top-left, GRID = 10 px.
async function canvasPoint(page: Page) {
  const box = await page.getByTestId("schematic-canvas").boundingBox();
  if (box === null) throw new Error("canvas has no bounding box");
  return async (gx: number, gy: number) => {
    const x = box.x + gx * 10;
    const y = box.y + gy * 10;
    await page.mouse.move(x, y);
    await page.mouse.click(x, y);
  };
}

const status = (page: Page) => page.locator(".nodal-runbar").getByRole("status");
const run = (page: Page) => page.getByRole("button", { name: "Run", exact: true }).click();

async function open(page: Page, name: string) {
  await page.goto("./");
  await page.getByTestId("open-file").setInputFiles(schematic(name));
  await expect(page.locator('[data-testid^="part-"]').first()).toBeVisible();
}

async function setCursorA(page: Page, text: string) {
  const input = page.getByLabel("Cursor A", { exact: true });
  await input.fill(text);
  await input.press("Enter");
}

test("draw_divider_run_op", async ({ page }) => {
  await page.goto("./");
  const click = await canvasPoint(page);
  // V1 pins (10,17) and (10,23); R1 pins (20,17) and (20,23); R2 pins (20,26) and (20,32).
  await page.getByRole("button", { name: "Place Voltage source" }).click();
  await click(10, 20);
  await page.getByRole("button", { name: "Place Ground" }).click();
  await click(10, 23);
  await page.getByRole("button", { name: "Place Resistor" }).click();
  await click(20, 20);
  await click(20, 29);
  await page.getByRole("button", { name: "Place Ground" }).click();
  await click(20, 32);
  await expect(page.locator('[data-testid^="part-"]')).toHaveCount(5);

  await page.getByRole("button", { name: "Wire" }).click();
  await click(10, 17);
  await click(20, 17);
  await click(20, 23);
  await click(20, 26);
  await expect(page.locator('[data-testid^="wire-"]')).toHaveCount(2);

  await run(page);
  await expect(status(page)).toHaveText("Done");
  const tags = page.locator('[data-testid^="op-tag-"]');
  await expect(tags).toHaveCount(2);
  await expect(tags.filter({ hasText: /^5 V$/ })).toHaveCount(1);
  await expect(tags.filter({ hasText: /^2\.5 V$/ })).toHaveCount(1);
});

test("rc_transient_probe_and_cursor", async ({ page }) => {
  await open(page, "T1-trap");
  const click = await canvasPoint(page);
  await run(page);
  await expect(status(page)).toHaveText("Done");
  await expect(page.getByTestId("waveform-panel")).toBeVisible();

  await page.getByRole("button", { name: "Probe" }).click();
  await click(31, 17);
  await expect(page.locator('[data-probe="V(out)"]')).toBeVisible();

  await setCursorA(page, "1m");
  const a = page.locator('tr[data-signal="V(out)"] td[data-col="a"]');
  // 1 - exp(-1) = 0.63212 for the ideal step; the 1 ns rise does not reach the shown digits.
  await expect(a).toHaveText("632.1 mV");
});

test("ac_bode", async ({ page }) => {
  await open(page, "A1");
  const click = await canvasPoint(page);
  await run(page);
  await expect(status(page)).toHaveText("Done");
  const panel = page.getByTestId("waveform-panel");
  const plots = panel.getByTestId("plot");
  await expect(plots).toHaveCount(2);
  await expect(plots.nth(0)).toHaveAttribute("data-y-label", "Magnitude (dB)");
  await expect(plots.nth(1)).toHaveAttribute("data-y-label", "Phase (°)");

  await page.getByRole("button", { name: "Probe" }).click();
  await click(31, 17);
  await expect(page.locator('[data-probe="V(out)"]')).toBeVisible();

  await setCursorA(page, "159.155");
  const cell = page.locator('tr[data-signal="V(out) dB"] td[data-col="a"]');
  await expect(cell).toHaveText(/^-3\.01\d? dB$/);
  const db = Number.parseFloat((await cell.textContent()) ?? "");
  expect(Math.abs(db - -3.0103)).toBeLessThan(0.01);
});

test("dc_sweep_plot", async ({ page }) => {
  await open(page, "N1");
  await run(page);
  await expect(status(page)).toHaveText("Done");
  const panel = page.getByTestId("waveform-panel");
  await expect(panel.getByTestId("plot")).toHaveCount(1);
  await expect(panel.getByTestId("plot")).toHaveAttribute("data-x-label", "V1");
});

test("cancel_long_run", async ({ page }) => {
  await open(page, "T1-trap");
  // Nothing selected: the inspector shows the Analyses panel.
  const tstop = page.getByLabel("tstop", { exact: true });
  await tstop.fill("1");
  await tstop.press("Enter");
  await run(page);
  await expect(status(page)).toHaveText("Running…");
  await page.getByRole("button", { name: "Cancel", exact: true }).click({ timeout: 1000 });
  await expect(status(page)).not.toHaveText("Running…");
  await expect(page.getByRole("button", { name: "Run", exact: true })).toBeVisible();

  await tstop.fill("5m");
  await tstop.press("Enter");
  await run(page);
  await expect(status(page)).toHaveText("Done");
});

test("engine_error_highlight", async ({ page }, testInfo) => {
  const part = (name: string, x: number) => ({
    id: `p-${name}`,
    type: "vsource",
    name,
    x,
    y: 20,
    rotation: 0,
    mirror: false,
    params: { dc: "5" },
  });
  const project = {
    format: "nodal-project",
    formatVersion: 1,
    name: "Source loop",
    createdAt: "2026-11-21T00:00:00.000Z",
    schematic: {
      parts: [
        part("V1", 10),
        part("V2", 20),
        {
          id: "p-GND1",
          type: "ground",
          name: "GND1",
          x: 10,
          y: 23,
          rotation: 0,
          mirror: false,
          params: {},
        },
      ],
      wires: [
        {
          id: "w1",
          points: [
            { x: 10, y: 17 },
            { x: 20, y: 17 },
          ],
        },
        {
          id: "w2",
          points: [
            { x: 10, y: 23 },
            { x: 20, y: 23 },
          ],
        },
      ],
      labels: [],
    },
    models: [],
    simulation: { analyses: [{ type: "op" }], options: {} },
  };
  const file = testInfo.outputPath("source-loop.nodal.json");
  writeFileSync(file, JSON.stringify(project));
  await page.goto("./");
  await page.getByTestId("open-file").setInputFiles(file);
  await expect(page.getByTestId("part-p-V1")).toBeVisible();

  await run(page);
  const message = status(page);
  await expect(message).toHaveAttribute("data-failed", "true");
  await expect(message).toContainText("V1");
  await expect(message).toContainText("V2");
  await expect(page.getByTestId("part-p-V1")).toHaveClass(/sim-error/);
  await expect(page.getByTestId("part-p-V2")).toHaveClass(/sim-error/);
});
