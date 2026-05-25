import {
  CONTEXTUAL_FIXTURE_ALIASES,
  CONTEXTUAL_ROUTE_ALIASES,
  rewriteLegacyPath
} from "./tools/naming-taxonomy/contextualAliases";

const aliasEntries = [
  ["@galileo3d/engine/rendering/production-runtime", "./packages/rendering/src/production-runtime/index.ts"],
  ["@galileo3d/engine/rendering/advanced-runtime", "./packages/rendering/src/advanced-runtime/index.ts"],
  ["@galileo3d/engine/rendering/v6", "./packages/rendering/src/production-runtime/index.ts"],
  ["@galileo3d/engine/rendering/v9", "./packages/rendering/src/advanced-runtime/index.ts"],
  ["@galileo3d/engine/rendering", "./packages/rendering/src/index.ts"],
  ["@galileo3d/engine/assets/browser", "./packages/assets/src/browser-index.ts"],
  ["@galileo3d/engine/workflows/production", "./packages/workflows/src/production-runtime/index.ts"],
  ["@galileo3d/engine/workflows/v6", "./packages/workflows/src/production-runtime/index.ts"],
  ["@galileo3d/engine/assets/asset-corpus", "./packages/assets/src/asset-corpus/index.ts"],
  ["@galileo3d/engine/assets/advanced-gallery", "./packages/assets/src/advanced-gallery/index.ts"],
  ["@galileo3d/engine/assets/v6", "./packages/assets/src/asset-corpus/index.ts"],
  ["@galileo3d/engine/assets/v9", "./packages/assets/src/advanced-gallery/index.ts"],
  ["@galileo3d/engine/apps", "./packages/apps/src/index.ts"],
  ["@galileo3d/engine/engine", "./packages/engine/src/index.ts"],
  ["@galileo3d/engine/production-runtime", "./packages/engine/src/production-runtime/index.ts"],
  ["@galileo3d/engine/advanced-runtime", "./packages/engine/src/advanced-runtime/index.ts"],
  ["@galileo3d/engine/v6", "./packages/engine/src/production-runtime/index.ts"],
  ["@galileo3d/engine/v9", "./packages/engine/src/advanced-runtime/index.ts"],
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
  plugins: [
    {
      name: "g3d-contextual-taxonomy-aliases",
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          const originalUrl = request.url ?? "";
          request.url = rewriteUrl(originalUrl);
          next();
        });
      },
    },
  ],
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
        "apps/flagship-viewer/src/main.ts",
        "apps/decals/src/main.ts",
        "apps/parallax-barrier/src/main.ts",
      ],
    },
  },
  optimizeDeps: {
    entries: ["examples/**/*.html", "apps/**/*.html"],
  },
};

function rewriteUrl(url: string): string {
  const [pathWithQuery, hash = ""] = url.split("#", 2);
  const [path = "", query = ""] = pathWithQuery.split("?", 2);
  const rewrittenPath = rewriteByAliases(path);
  const rewrittenQuery = query ? `?${query}` : "";
  const rewrittenHash = hash ? `#${hash}` : "";
  return `${rewrittenPath}${rewrittenQuery}${rewrittenHash}`;
}

function rewriteByAliases(path: string): string {
  return rewriteLegacyPath(path, [...CONTEXTUAL_ROUTE_ALIASES, ...CONTEXTUAL_FIXTURE_ALIASES]);
}
