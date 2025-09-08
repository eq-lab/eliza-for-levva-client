import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import prettier from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";

export default [
  // Global ignores
  {
    ignores: [
      "node_modules/",
      "dist/",
      "build/",
      "*.tsbuildinfo",
      "data/generated/",
      "patches/",
      "*.config.bundled_*.mjs",
      "drizzle/migrations/",
      "data/uploads/",
      "firecrawl/",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        // Node.js globals
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        global: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        // Browser globals
        fetch: "readonly",
        URLSearchParams: "readonly",
        document: "readonly",
        window: "readonly",
        // Node.js types
        NodeJS: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      prettier: prettier,
    },
    rules: {
      // TypeScript specific rules
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],

      // General JavaScript/TypeScript rules
      "no-console": "warn",
      "no-debugger": "error",
      "no-duplicate-imports": "error",
      "prefer-const": "error",
      "no-var": "error",

      // Code style (handled by Prettier)
      "prettier/prettier": "error",

      // ElizaOS specific - allow unused vars starting with _
      "no-unused-vars": "off", // Use TypeScript version instead

      // Allow any for ElizaOS framework compatibility
      "@typescript-eslint/no-explicit-any": "off",

      // Relax some rules for the framework
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
  {
    files: ["**/*.test.{ts,tsx,js,jsx}", "**/__tests__/**/*"],
    rules: {
      // Relax rules for test files
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },
  {
    files: ["**/*.config.{ts,js}", "**/scripts/**/*"],
    rules: {
      // Relax rules for config and script files
      "no-console": "off",
    },
  },
  prettierConfig, // Must be last to override other formatting rules
];
