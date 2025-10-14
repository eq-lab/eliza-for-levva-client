import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    testTimeout: 60000,
    exclude: [
      "**/e2e/**",
      "**/node_modules/**",
      //"**/*.integration.test.ts", // Exclude integration tests by default
    ],
    // Run integration tests sequentially to avoid channel conflicts
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
