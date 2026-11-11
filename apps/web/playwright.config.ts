import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173/Nodal/",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
  webServer: {
    // Production build served under the /Nodal/ base path, as on GitHub Pages.
    command: "pnpm build && pnpm vite preview --port 4173 --strictPort",
    url: "http://localhost:4173/Nodal/",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
