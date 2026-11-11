import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/target/**",
      "**/node_modules/**",
      "**/pkg/**",
      "**/dist/**",
      ".superpowers/**",
      "test-results/**",
      "playwright-report/**",
      "coverage/**",
    ],
  },
  eslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: {
          // Files covered by apps/web/tsconfig.node.json, not by the nearest tsconfig.json.
          allowDefaultProject: [
            "apps/web/vite.config.ts",
            "apps/web/playwright.config.ts",
            "apps/web/e2e/*.ts",
          ],
          defaultProject: "apps/web/tsconfig.node.json",
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
