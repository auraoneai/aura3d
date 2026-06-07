import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: [],
    coverage: {
      reporter: ["text", "json"]
    }
  },
  resolve: {
    alias: {
      "@aura3d/math": new URL("./packages/math/src/index.ts", import.meta.url).pathname,
      "@aura3d/core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
      "@aura3d/scene": new URL("./packages/scene/src/index.ts", import.meta.url).pathname,
      "@aura3d/ecs": new URL("./packages/ecs/src/index.ts", import.meta.url).pathname,
      "@aura3d/rendering": new URL("./packages/rendering/src/index.ts", import.meta.url).pathname,
      "@aura3d/controls": new URL("./packages/controls/src/index.ts", import.meta.url).pathname,
      "@aura3d/engine/rendering/production-runtime": new URL("./packages/rendering/src/production-runtime/index.ts", import.meta.url).pathname,
      "@aura3d/engine/rendering/advanced-runtime": new URL("./packages/rendering/src/advanced-runtime/index.ts", import.meta.url).pathname,
      "@aura3d/engine/assets/asset-corpus": new URL("./packages/assets/src/asset-corpus/index.ts", import.meta.url).pathname,
      "@aura3d/engine/assets/advanced-gallery": new URL("./packages/assets/src/advanced-gallery/index.ts", import.meta.url).pathname,
      "@aura3d/engine/production-runtime": new URL("./packages/engine/src/production-runtime/index.ts", import.meta.url).pathname,
      "@aura3d/engine/advanced-runtime": new URL("./packages/engine/src/advanced-runtime/index.ts", import.meta.url).pathname,
      "@aura3d/engine/assets/browser": new URL("./packages/assets/src/browser-index.ts", import.meta.url).pathname,
      "@aura3d/engine/rendering": new URL("./packages/rendering/src/index.ts", import.meta.url).pathname,
      "@aura3d/engine/workflows/production": new URL("./packages/workflows/src/production-runtime/index.ts", import.meta.url).pathname,
      "@aura3d/engine": new URL("./packages/engine/src/index.ts", import.meta.url).pathname,
      "@aura3d/cli": new URL("./packages/aura3d-cli/src/index.ts", import.meta.url).pathname,
      "@aura3d/react": new URL("./packages/react/src/index.ts", import.meta.url).pathname,
      "@aura3d/three-compat": new URL("./packages/three-compat/src/index.ts", import.meta.url).pathname,
      "@aura3d/apps": new URL("./packages/apps/src/index.ts", import.meta.url).pathname,
      "@aura3d/engine/apps": new URL("./packages/apps/src/index.ts", import.meta.url).pathname,
      "@aura3d/engine/engine": new URL("./packages/engine/src/index.ts", import.meta.url).pathname,
      "@aura3d/create-aura3d": new URL("./packages/create-aura3d/src/index.ts", import.meta.url).pathname,
      "create-aura3d": new URL("./packages/create-aura3d/src/index.ts", import.meta.url).pathname,
      "@aura3d/product-studio": new URL("./packages/product-studio/src/index.ts", import.meta.url).pathname,
      "@aura3d/physics": new URL("./packages/physics/src/index.ts", import.meta.url).pathname,
      "@aura3d/animation": new URL("./packages/animation/src/index.ts", import.meta.url).pathname,
      "@aura3d/assets/browser": new URL("./packages/assets/src/browser-index.ts", import.meta.url).pathname,
      "@aura3d/assets": new URL("./packages/assets/src/index.ts", import.meta.url).pathname,
      "@aura3d/input": new URL("./packages/input/src/index.ts", import.meta.url).pathname,
      "@aura3d/audio": new URL("./packages/audio/src/index.ts", import.meta.url).pathname,
      "@aura3d/scripting": new URL("./packages/scripting/src/index.ts", import.meta.url).pathname,
      "@aura3d/workflows": new URL("./packages/workflows/src/index.ts", import.meta.url).pathname,
      "@aura3d/editor-runtime": new URL("./packages/editor-runtime/src/index.ts", import.meta.url).pathname,
      "@aura3d/editor": new URL("./packages/editor/src/index.ts", import.meta.url).pathname,
      "@aura3d/debug": new URL("./packages/debug/src/index.ts", import.meta.url).pathname,
      "@aura3d/asset-index": new URL("./packages/asset-index/src/index.ts", import.meta.url).pathname
    }
  }
});
