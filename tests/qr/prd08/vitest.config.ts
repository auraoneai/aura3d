import { defineConfig } from "vitest/config";
import rootConfig from "../../../vitest.config";

/**
 * Lane-08 unit suite (PRD-08 §13): `tests/qr/prd08/unit/**` lives outside the
 * root vitest `include`, so the lane keeps its own config (same pattern as
 * `tests/templates/vitest.config.ts`, but reusing the root aliases because
 * these tests import `@aura3d/*`). `include` is REPLACED — `mergeConfig`
 * would concatenate and re-run the whole suite.
 *
 * Run: `pnpm exec vitest run --config tests/qr/prd08/vitest.config.ts`
 */
export default defineConfig({
  ...rootConfig,
  test: {
    ...rootConfig.test,
    include: ["tests/qr/prd08/**/*.test.ts"]
  }
});
