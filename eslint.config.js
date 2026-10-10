import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "docs/evidence/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: { "no-console": "off" } },
  {
    files: ["apps/agent/public/**/*.js"],
    languageOptions: { sourceType: "script", globals: { window: "readonly", document: "readonly", fetch: "readonly", crypto: "readonly", setTimeout: "readonly", BigInt: "readonly" } },
  },
);
