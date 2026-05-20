import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/assets/**/*.test.ts"]
  },
  resolve: {
    alias: {
      "@galileo3d/math": new URL("../../packages/math/src/index.ts", import.meta.url).pathname,
      "@galileo3d/core": new URL("../../packages/core/src/index.ts", import.meta.url).pathname,
      "@galileo3d/scene": new URL("../../packages/scene/src/index.ts", import.meta.url).pathname,
      "@galileo3d/ecs": new URL("../../packages/ecs/src/index.ts", import.meta.url).pathname,
      "@galileo3d/rendering": new URL("../../packages/rendering/src/index.ts", import.meta.url).pathname,
      "@galileo3d/product-studio": new URL("../../packages/product-studio/src/index.ts", import.meta.url).pathname,
      "@galileo3d/physics": new URL("../../packages/physics/src/index.ts", import.meta.url).pathname,
      "@galileo3d/animation": new URL("../../packages/animation/src/index.ts", import.meta.url).pathname,
      "@galileo3d/assets": new URL("../../packages/assets/src/index.ts", import.meta.url).pathname,
      "@galileo3d/input": new URL("../../packages/input/src/index.ts", import.meta.url).pathname,
      "@galileo3d/audio": new URL("../../packages/audio/src/index.ts", import.meta.url).pathname,
      "@galileo3d/scripting": new URL("../../packages/scripting/src/index.ts", import.meta.url).pathname,
      "@galileo3d/workflows": new URL("../../packages/workflows/src/index.ts", import.meta.url).pathname,
      "@galileo3d/editor-runtime": new URL("../../packages/editor-runtime/src/index.ts", import.meta.url).pathname,
      "@galileo3d/editor": new URL("../../packages/editor/src/index.ts", import.meta.url).pathname,
      "@galileo3d/debug": new URL("../../packages/debug/src/index.ts", import.meta.url).pathname
    }
  }
});
