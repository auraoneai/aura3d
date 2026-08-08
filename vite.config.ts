import {
  CONTEXTUAL_FIXTURE_ALIASES,
  CONTEXTUAL_ROUTE_ALIASES,
  rewriteLegacyPath
} from "./tools/naming-taxonomy/contextualAliases";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ViteDevServer } from "vite";

const aliasEntries = [
  ["@aura3d/engine/lean-product", "./packages/engine/src/agent-api/lean-product.ts"],
  ["@aura3d/engine/lean-game", "./packages/engine/src/agent-api/lean-game.ts"],
  ["@aura3d/engine/lean", "./packages/engine/src/agent-api/lean.ts"],
  ["@aura3d/engine/rendering/production-runtime", "./packages/rendering/src/production-runtime/index.ts"],
  ["@aura3d/engine/rendering/advanced-runtime", "./packages/rendering/src/advanced-runtime/index.ts"],
  ["@aura3d/engine/rendering", "./packages/rendering/src/index.ts"],
  ["@aura3d/engine/assets/browser", "./packages/assets/src/browser-index.ts"],
  ["@aura3d/engine/workflows/production", "./packages/workflows/src/production-runtime/index.ts"],
  ["@aura3d/engine/assets/asset-corpus", "./packages/assets/src/asset-corpus/index.ts"],
  ["@aura3d/engine/assets/advanced-gallery", "./packages/assets/src/advanced-gallery/index.ts"],
  ["@aura3d/engine/apps", "./packages/apps/src/index.ts"],
  ["@aura3d/engine/engine", "./packages/engine/src/index.ts"],
  ["@aura3d/engine/production-runtime", "./packages/engine/src/production-runtime/index.ts"],
  ["@aura3d/engine/advanced-runtime", "./packages/engine/src/advanced-runtime/index.ts"],
  ["@aura3d/cli", "./packages/aura3d-cli/src/index.ts"],
  ["@aura3d/react", "./packages/react/src/index.ts"],
  ["@aura3d/math", "./packages/math/src/index.ts"],
  ["@aura3d/core", "./packages/core/src/index.ts"],
  ["@aura3d/scene/math", "./packages/scene/src/MathTypes.ts"],
  ["@aura3d/scene", "./packages/scene/src/index.ts"],
  ["@aura3d/ecs", "./packages/ecs/src/index.ts"],
  ["@aura3d/rendering/lean-runtime", "./packages/rendering/src/lean-runtime.ts"],
  ["@aura3d/rendering", "./packages/rendering/src/index.ts"],
  ["@aura3d/controls", "./packages/controls/src/index.ts"],
  ["@aura3d/environments", "./packages/environments/src/index.ts"],
  ["@aura3d/materials", "./packages/materials/src/browser-index.ts"],
  ["@aura3d/engine", "./packages/engine/src/index.ts"],
  ["@aura3d/apps", "./packages/apps/src/index.ts"],
  ["@aura3d/create-aura3d", "./packages/create-aura3d/src/index.ts"],
  ["create-aura3d", "./packages/create-aura3d/src/index.ts"],
  /*
   * Subpath entries must precede the bare package, because a string `find` matches by PREFIX.
   *
   * Vite/rollup treat a string alias as "starts with", so `@aura3d/physics` alone rewrote
   * `@aura3d/physics/solverless` to `packages/physics/src/index.ts/solverless` and the build died
   * with `ENOTDIR: not a directory`. `tsconfig.base.json` already declares both subpaths, so
   * typecheck passed and only a real bundle failed — which is why this surfaced from a showcase
   * route build rather than from `pnpm typecheck`.
   *
   * These two subpaths exist precisely so a scene with no bodies does not download the solver
   * (WS-2.2), so leaving them unresolvable would either break the build or, worse, silently fall
   * back to the full barrel and undo the bundle work.
   */
  ["@aura3d/physics/solverless", "./packages/physics/src/solverless.ts"],
  ["@aura3d/physics/world", "./packages/physics/src/world.ts"],
  ["@aura3d/physics", "./packages/physics/src/index.ts"],
  ["@aura3d/product-studio", "./packages/product-studio/src/index.ts"],
  ["@aura3d/animation", "./packages/animation/src/browser-index.ts"],
  ["@aura3d/assets/browser", "./packages/assets/src/browser-index.ts"],
  ["@aura3d/assets/gltf-runtime", "./packages/assets/src/gltf-runtime.ts"],
  ["@aura3d/assets", "./packages/assets/src/browser-index.ts"],
  ["@aura3d/input", "./packages/input/src/index.ts"],
  ["@aura3d/audio", "./packages/audio/src/index.ts"],
  ["@aura3d/scripting", "./packages/scripting/src/index.ts"],
  ["@aura3d/workflows", "./packages/workflows/src/index.ts"],
  ["@aura3d/three-compat", "./packages/three-compat/src/index.ts"],
  ["@aura3d/editor-runtime", "./packages/editor-runtime/src/index.ts"],
  ["@aura3d/editor", "./packages/editor/src/index.ts"],
  ["@aura3d/debug", "./packages/debug/src/index.ts"],
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
      name: "a3d-contextual-taxonomy-aliases",
      configureServer(server: ViteDevServer) {
        server.middlewares.use((request: IncomingMessage, _response: ServerResponse, next: () => void) => {
          const originalUrl = request.url ?? "";
          request.url = rewriteUrl(originalUrl);
          next();
        });
      },
    },
  ],
  server: {
    ...(process.env.A3D_VITE_TEST_SERVER === "advanced-gallery" || process.env.VITE_FORCE_HMR_DISABLED === "1"
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
        "apps/advanced-examples-gallery/src/main.ts",
        "apps/wow-common/src/showcase.ts",
        "apps/wow-common/src/gltf-showcase.ts",
      ],
    },
  },
  optimizeDeps: {
    entries: ["apps/**/*.html"],
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
