const aliasEntries = [
  ["@galileo3d/engine/rendering/v6", "./packages/rendering/src/v6/index.ts"],
  ["@galileo3d/engine/rendering/v9", "./packages/rendering/src/v9/index.ts"],
  ["@galileo3d/engine/rendering", "./packages/rendering/src/index.ts"],
  ["@galileo3d/engine/assets/browser", "./packages/assets/src/browser-index.ts"],
  ["@galileo3d/engine/workflows/v6", "./packages/workflows/src/v6/index.ts"],
  ["@galileo3d/engine/assets/v6", "./packages/assets/src/v6/index.ts"],
  ["@galileo3d/engine/assets/v9", "./packages/assets/src/v9/index.ts"],
  ["@galileo3d/engine/apps", "./packages/apps/src/index.ts"],
  ["@galileo3d/engine/engine", "./packages/engine/src/index.ts"],
  ["@galileo3d/engine/v6", "./packages/engine/src/v6/index.ts"],
  ["@galileo3d/engine/v9", "./packages/engine/src/v9/index.ts"],
  ["@galileo3d/math", "./packages/math/src/index.ts"],
  ["@galileo3d/core", "./packages/core/src/index.ts"],
  ["@galileo3d/scene", "./packages/scene/src/index.ts"],
  ["@galileo3d/ecs", "./packages/ecs/src/index.ts"],
  ["@galileo3d/rendering", "./packages/rendering/src/index.ts"],
  ["@galileo3d/controls", "./packages/controls/src/index.ts"],
  ["@galileo3d/environments", "./packages/environments/src/index.ts"],
  ["@galileo3d/materials", "./packages/materials/src/index.ts"],
  ["@galileo3d/engine", "./packages/engine/src/index.ts"],
  ["@galileo3d/apps", "./packages/apps/src/index.ts"],
  ["@galileo3d/create-g3d", "./packages/create-g3d/src/index.ts"],
  ["@galileo3d/physics", "./packages/physics/src/index.ts"],
  ["@galileo3d/product-studio", "./packages/product-studio/src/index.ts"],
  ["@galileo3d/animation", "./packages/animation/src/browser-index.ts"],
  ["@galileo3d/assets/browser", "./packages/assets/src/browser-index.ts"],
  ["@galileo3d/assets", "./packages/assets/src/browser-index.ts"],
  ["@galileo3d/input", "./packages/input/src/index.ts"],
  ["@galileo3d/audio", "./packages/audio/src/index.ts"],
  ["@galileo3d/scripting", "./packages/scripting/src/index.ts"],
  ["@galileo3d/workflows", "./packages/workflows/src/index.ts"],
  ["@galileo3d/three-compat", "./packages/three-compat/src/index.ts"],
  ["@galileo3d/editor-runtime", "./packages/editor-runtime/src/index.ts"],
  ["@galileo3d/editor", "./packages/editor/src/index.ts"],
  ["@galileo3d/debug", "./packages/debug/src/index.ts"],
  ["@galileo3d/test-utils", "./packages/test-utils/src/index.ts"],
] as const;

const alias = aliasEntries.map(([find, replacement]) => ({
  find,
  replacement: new URL(replacement, import.meta.url).pathname,
}));

export default {
  resolve: {
    alias,
  },
  server: {
    ...(process.env.G3D_VITE_TEST_SERVER === "advanced-gallery" || process.env.VITE_FORCE_HMR_DISABLED === "1"
      ? {
          hmr: false,
          watch: {
            ignored: [
              "**/tests/reports/**",
              "**/test-results/**",
              "**/playwright-report/**"
            ],
          },
        }
      : {}),
    fs: {
      allow: [new URL(".", import.meta.url).pathname],
    },
    warmup: {
      clientFiles: [
        "apps/v8-flagship-viewer/src/main.ts",
        "apps/v8-decals/src/main.ts",
        "apps/v8-parallax-barrier/src/main.ts",
      ],
    },
  },
  optimizeDeps: {
    entries: ["examples/**/*.html", "apps/**/*.html"],
  },
};
