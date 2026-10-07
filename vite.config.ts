import {
  CONTEXTUAL_FIXTURE_ALIASES,
  CONTEXTUAL_ROUTE_ALIASES,
  rewriteLegacyPath
} from "./tools/naming-taxonomy/contextualAliases";
import { createReadStream, existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ViteDevServer } from "vite";
import { installedAuraPackageAliases } from "./tests/browser/installed-package-resolve";
import { aliasEntries } from "./vite.aliases.generated";

const repoRoot = fileURLToPath(new URL(".", import.meta.url));



const installedAliases = installedAuraPackageAliases();
const alias = installedAliases.length > 0
  ? [...installedAliases]
  : aliasEntries.map(([find, replacement]) => ({
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
    {
      name: "a3d-serve-draco-decoder",
      configureServer(server: ViteDevServer) {
        server.middlewares.use((request: IncomingMessage, response: ServerResponse, next: () => void) => {
          const path = (request.url ?? "").split("?")[0] ?? "";
          if (!path.startsWith("/assets/draco/") && !path.startsWith("/node_modules/draco3d/")) {
            next();
            return;
          }
          const file = path.replace(/^\/assets\/draco\//, "").replace(/^\/node_modules\/draco3d\//, "");
          const found = [
            resolve(repoRoot, "marketing/public/assets/draco", file),
            resolve(repoRoot, "node_modules/draco3d", file)
          ].find((candidate) => existsSync(candidate));
          if (!found) {
            next();
            return;
          }
          response.setHeader("Content-Type", extname(found) === ".wasm" ? "application/wasm" : "application/javascript");
          createReadStream(found).pipe(response);
        });
      }
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
