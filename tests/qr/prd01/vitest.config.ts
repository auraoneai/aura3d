/**
 * Lane-01 vitest config: runs tests/qr/prd01/unit with the repo's @aura3d/*
 * source aliases (same resolve table as the root vitest.config.ts, but a
 * lane-scoped include — merging the root test block would pull in every
 * repo-wide spec).
 */

import { defineConfig } from "vitest/config";
import rootConfig from "../../../vitest.config";

export default defineConfig({
  resolve: rootConfig.resolve,
  test: {
    environment: "node",
    include: ["tests/qr/prd01/unit/**/*.test.ts"],
    server: rootConfig.test?.server
  }
});
