import { defineConfig, devices } from "@playwright/test";

// perf and visual run in their own projects (`pnpm e2e:perf`, `pnpm e2e:visual`).
const IGNORED = /(perf|visual|colorShare)\.spec\.ts/;

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" } },
  use: {
    baseURL: "http://localhost:4173/Nodal/",
    trace: "retain-on-failure",
  },
  projects: [
    // The performance budget runs alone, in the `perf` project (`pnpm e2e:perf`).
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: IGNORED },
    { name: "firefox", use: { ...devices["Desktop Firefox"] }, testIgnore: IGNORED },
    // Chromium only. Run it with `--workers=1` so nothing else shares the machine.
    // Retries absorb timing noise on shared CI runners. A real regression fails all three runs.
    {
      name: "perf",
      retries: 2,
      use: { ...devices["Desktop Chrome"] },
      testMatch: /perf\.spec\.ts/,
    },
    // Pixel baselines and color shares, Chromium only. Baselines are rendered on the CI runner.
    {
      name: "visual",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /(visual|colorShare)\.spec\.ts/,
    },
  ],
  webServer: {
    // Production build served under the /Nodal/ base path, as on GitHub Pages.
    command: "pnpm build && pnpm vite preview --port 4173 --strictPort",
    url: "http://localhost:4173/Nodal/",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
