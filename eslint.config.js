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
          // Not covered by its package tsconfig.json; the default project cap is 8 files.
          allowDefaultProject: ["packages/schema/src/ir.test.ts"],
          defaultProject: "apps/web/tsconfig.node.json",
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
  {
    // Config and e2e files belong to apps/web/tsconfig.node.json, which already includes them.
    files: [
      "apps/web/vite.config.ts",
      "apps/web/playwright.config.ts",
      "apps/web/playwright.guide.config.ts",
      "apps/web/e2e/**/*.ts",
      "apps/web/build/**/*.ts",
    ],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: "apps/web/tsconfig.node.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
