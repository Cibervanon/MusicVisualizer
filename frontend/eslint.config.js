import js from "@eslint/js";
import typescriptEslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

// NOTE: this project runs React 18 without the React Compiler, so only the
// two classic hooks rules apply. The extra compiler-only rules shipped in
// eslint-plugin-react-hooks v7 (set-state-in-effect, purity, refs, ...) assume
// a compiler-managed component model and flag legitimate "sync external store
// into local state" patterns used by the screens.
export default [
  { ignores: ["dist", "node_modules", "tests/.build"] },
  ...typescriptEslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: "18.3" },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react/jsx-no-target-blank": "off",
      "react/prop-types": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
];
