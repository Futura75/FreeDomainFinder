import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["lib/**/*.test.ts", "lib/**/*.test.tsx", "app/**/*.test.ts", "app/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      // Vitest 4's text reporter omits fully-covered files unless skipFull is
      // set on the reporter itself; keep every measured file in the table.
      reporter: [["text", { skipFull: false }], "html", "json-summary", "lcov"],
      include: ["lib/**/*.ts", "lib/**/*.tsx", "app/api/**/route.ts"],
      exclude: ["**/*.test.*", "**/*.d.ts"],
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 70,
      },
    },
  },
});
