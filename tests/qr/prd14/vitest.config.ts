import { defineConfig, mergeConfig } from "vitest/config";
import base from "../../../vitest.config";

/**
 * PRD 14 lane tests. The root vitest `include` does not cover `tests/qr/**`;
 * the lane workflow runs `pnpm exec vitest run tests/qr/prd14` with this
 * config, which inherits every alias and adds the lane glob.
 */
export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts", "tests/assets/**/*.test.ts", "tests/qr/**/*.test.ts"]
    }
  })
);
