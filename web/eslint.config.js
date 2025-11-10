import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  // Ignorar build e artefatos de implantação não relacionados ao frontend
  globalIgnores(["dist", "netlify/**"]),
  {
    files: ["**/*.{js,jsx}"],
    extends: [
      js.configs.recommended,
      reactHooks.configs["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    rules: {
      "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]" }],
    },
  },
  // Override para arquivos Node (dev-server)
  {
    files: ["dev-server.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  // Override para APIs de servidor (Vercel)
  {
    files: ["api/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        sourceType: "module",
      },
    },
  },
  // Override para scripts utilitários Node
  {
    files: ["scripts/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
]);
