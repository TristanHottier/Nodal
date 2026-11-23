import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { configDefaults, defineConfig } from "vitest/config";

/** Preloads the hashed Inter Latin file in the built index.html (Vite does not rewrite a bare href). */
function preloadInter(): Plugin {
  let base = "/";
  return {
    name: "nodal-preload-inter",
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        if (ctx.bundle === undefined || !ctx.filename.endsWith("index.html")) return undefined;
        const file = Object.keys(ctx.bundle).find((f) =>
          /inter-latin-wght-normal-.*\.woff2$/.test(f),
        );
        if (file === undefined) throw new Error("Inter Latin woff2 missing from the bundle");
        return [
          {
            tag: "link",
            injectTo: "head-prepend",
            attrs: {
              rel: "preload",
              as: "font",
              type: "font/woff2",
              crossorigin: "",
              href: `${base}${file}`,
            },
          },
        ];
      },
    },
  };
}

export default defineConfig({
  base: "/Nodal/",
  plugins: [react(), preloadInter()],
  resolve: {
    alias: {
      "@nodal/wasm": fileURLToPath(
        new URL("../../crates/nodal-wasm/pkg/nodal_wasm.js", import.meta.url),
      ),
    },
  },
  build: {
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL("index.html", import.meta.url)),
        bench: fileURLToPath(new URL("bench.html", import.meta.url)),
      },
    },
  },
  worker: { format: "es" },
  test: {
    environment: "jsdom",
    exclude: [...configDefaults.exclude, "e2e/**"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
