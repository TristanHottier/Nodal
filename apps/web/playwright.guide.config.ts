// Regenerates the screenshots in docs/user-guide/. Run with `pnpm --filter @nodal/web guide:screenshots`.
// The normal e2e run never picks this up: `guide.screenshots.ts` does not match the default test pattern.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /guide\.screenshots\.ts/,
  reporter: "list",
  workers: 1,
  use: {
    baseURL: "http://localhost:4173/Nodal/",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
  },
  projects: [
    {
      name: "guide",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        colorScheme: "dark",
      },
    },
  ],
  webServer: {
    command: "pnpm build && pnpm vite preview --port 4173 --strictPort",
    url: "http://localhost:4173/Nodal/",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
