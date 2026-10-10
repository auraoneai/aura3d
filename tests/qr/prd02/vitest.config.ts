/**
 * Lane prd02 vitest config (PRD-02 §15): the root vitest include list does not
 * cover tests/qr/**, so the lane unit suite runs via
 * `pnpm exec vitest run --config tests/qr/prd02/vitest.config.ts`.
 * Reuses the root `resolve.alias` table and inlining so @aura3d/* specifiers
 * map to src/ exactly as they do under the root suite — but with an
 * independent `test` block (mergeConfig would concatenate `include`).
 */
import { defineConfig } from "vitest/config";
import rootConfig from "../../../vitest.config";

export default defineConfig({
  resolve: rootConfig.resolve,
  test: {
    environment: "node",
    include: [
      "tests/qr/prd02/**/*.test.ts",
      "tests/unit/contracts/impl/prd02-*.test.ts",
      "tests/unit/agent-api/prd02-*.test.ts"
    ],
    setupFiles: [],
    server: { deps: { inline: [/^@aura3d\//, /^@aura3d$/] } }
  }
});
