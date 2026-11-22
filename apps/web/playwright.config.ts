import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173/Nodal/",
    trace: "retain-on-failure",
  },
  projects: [
    // The performance budget runs alone, in the `perf` project (`pnpm e2e:perf`).
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: /perf\.spec\.ts/ },
    { name: "firefox", use: { ...devices["Desktop Firefox"] }, testIgnore: /perf\.spec\.ts/ },
    // Chromium only. Run it with `--workers=1` so nothing else shares the machine.
    { name: "perf", use: { ...devices["Desktop Chrome"] }, testMatch: /perf\.spec\.ts/ },
  ],
  webServer: {
    // Production build served under the /Nodal/ base path, as on GitHub Pages.
    command: "pnpm build && pnpm vite preview --port 4173 --strictPort",
    url: "http://localhost:4173/Nodal/",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
