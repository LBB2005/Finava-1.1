import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      all: true,
      // Logic layer only — UI (.tsx) is intentionally excluded from the
      // coverage denominator and tested separately (RTL/Playwright) later.
      include: [
        "src/lib/**/*.ts",
        "src/agents/**/*.ts",
        "src/app/api/**/route.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "src/test/**",
        "src/lib/schemas/**", // declarative zod schemas, no branches worth covering
        "**/*.d.ts",
      ],
      reporter: ["text-summary", "html"],
      // Ratchet — raise these as each phase lands so coverage can't regress.
      thresholds: {
        lines: 60,
        statements: 60,
        functions: 55,
        branches: 38,
      },
    },
  },
});
