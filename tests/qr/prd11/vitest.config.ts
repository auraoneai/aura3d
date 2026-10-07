import { defineConfig } from "vitest/config";
import baseConfig from "../../../vitest.config";

/**
 * Lane 11 test config (PRD 11 §Phase 0): same alias table as the root config,
 * scoped to this lane's test tree so `vitest run -c tests/qr/prd11/vitest.config.ts`
 * in CI only executes prd11 specs.
 */
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ["tests/qr/prd11/unit/**/*.test.ts"],
    environment: "node"
  }
});
