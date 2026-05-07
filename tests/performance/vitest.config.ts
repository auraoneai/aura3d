import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/performance/**/*.test.ts"],
    testTimeout: 30_000
  },
  resolve: {
    alias: {
      "@galileo3d/math": new URL("../../packages/math/src/index.ts", import.meta.url).pathname,
      "@galileo3d/core": new URL("../../packages/core/src/index.ts", import.meta.url).pathname,
      "@galileo3d/scene": new URL("../../packages/scene/src/index.ts", import.meta.url).pathname,
      "@galileo3d/ecs": new URL("../../packages/ecs/src/index.ts", import.meta.url).pathname
    }
  }
});
