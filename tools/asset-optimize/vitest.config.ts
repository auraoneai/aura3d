import { defineConfig } from "vitest/config";

/**
 * Lane-05 tool suite (tools/asset-optimize/tests). The repo-root vitest
 * `include` does not cover tools/**, so these specs run only here, after
 * `npm install --prefix tools/asset-optimize` (asset-optimize.yml). They have
 * no deps-present skip guards: a missing tool dependency fails the job.
 */
export default defineConfig({
  test: {
    root: new URL(".", import.meta.url).pathname,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 120_000
  }
});
