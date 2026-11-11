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
    languageOptions: { parserOptions: { projectService: true } },
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
