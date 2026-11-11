import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  base: "/Nodal/",
  plugins: [react()],
  resolve: {
    alias: {
      "@nodal/wasm": fileURLToPath(
        new URL("../../crates/nodal-wasm/pkg/nodal_wasm.js", import.meta.url),
      ),
    },
  },
  worker: { format: "es" },
  test: { environment: "jsdom", exclude: [...configDefaults.exclude, "e2e/**"] },
});
