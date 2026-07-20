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
      // Vitest 4 reports every file matched by `include` below even when no test
      // imports it (the old `all: true` flag is the default now), so untested
      // route glue still counts against the ratchet.
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
        lines: 77,
        statements: 76,
        functions: 79,
        branches: 65,
      },
    },
  },
});
