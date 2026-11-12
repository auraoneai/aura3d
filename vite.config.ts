import {
  CONTEXTUAL_FIXTURE_ALIASES,
  CONTEXTUAL_ROUTE_ALIASES,
  rewriteLegacyPath
} from "./tools/naming-taxonomy/contextualAliases";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type ViteDevServer } from "vite";
import { installedAuraPackageAliases } from "./tests/browser/installed-package-resolve";
import { aliasEntries } from "./vite.aliases.generated";

const repoRoot = fileURLToPath(new URL(".", import.meta.url));



const installedAliases = installedAuraPackageAliases();
const gamePackageEntry = fileURLToPath(new URL("./packages/game/src/index.ts", import.meta.url));
const gamePackageDir = fileURLToPath(new URL("./packages/game/src/", import.meta.url));
const gameAliases = [
  { find: /^@aura3d\/engine\/game\/art$/, replacement: `${gamePackageDir}art/index.ts` },
  { find: /^@aura3d\/engine\/game\/capture$/, replacement: `${gamePackageDir}capture/index.ts` },
  { find: /^@aura3d\/engine\/game\/util$/, replacement: `${gamePackageDir}util/index.ts` },
  { find: /^@aura3d\/engine\/game\/styles\.css$/, replacement: `${gamePackageDir}styles.css` },
  { find: /^@aura3d\/engine\/game$/, replacement: gamePackageEntry },
  { find: /^@aura3d\/game$/, replacement: gamePackageEntry },
];
const alias = [
  ...gameAliases,
  ...(installedAliases.length > 0
    ? [...installedAliases]
    : aliasEntries.map(([find, replacement]) => ({
        find,
        replacement: new URL(replacement, import.meta.url).pathname,
      }))),
];

const editorExportModule = "virtual:aura3d-editor-export-runtime";
const resolvedEditorExportModule = `\0${editorExportModule}`;

async function bundleEditorRuntime(): Promise<string> {
  // The generated app must not depend on this editor's server or a CDN.
  // Bundle the real scene runtime as one IIFE when the export module is
  // requested (or the editor is built), with all static imports inlined.
  const result = await build({
    configFile: false,
    root: repoRoot,
    resolve: { alias },
    worker: { format: "iife", rollupOptions: { output: { inlineDynamicImports: true } } },
    build: {
      write: false,
      minify: false,
      sourcemap: false,
      target: "es2022",
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      lib: { entry: resolve(repoRoot, "apps/editor/src/export/exportRuntimeEntry.ts"), name: "Aura3DExport", formats: ["iife"] },
      rollupOptions: { output: { inlineDynamicImports: true } }
    },
    logLevel: "warn"
  });
  if (Array.isArray(result) || !("output" in result)) throw new Error("Editor export runtime did not produce one bundle.");
  const chunks = result.output.filter((entry) => entry.type === "chunk");
  const chunk = chunks[0];
  if (result.output.length !== 1 || chunks.length !== 1 || !chunk?.isEntry || chunk.imports.length || chunk.dynamicImports.length) {
    throw new Error("Editor export runtime must be a self-contained JavaScript bundle.");
  }
  return chunk.code;
}

/**
 * Package sources name their module workers by the emitted `.js` file
 * (`new Worker(new URL("../workers/zstd.worker.js", import.meta.url))`) so the packed dist and its
 * finalize-dist worker checks keep working. Inside the monorepo the aliases point at the package `src` trees,
 * where only the `.ts` source exists; map such a worker entry to its source sibling.
 */
export function createSourceWorkerEntryPlugin() {
  return {
    name: "a3d-source-worker-entries",
    enforce: "pre" as const,
    resolveId(id: string) {
      const path = id.split("?", 1)[0] ?? "";
      if (!/\/packages\/[^/]+\/src\/.+\.worker\.js$/.test(path) || existsSync(path)) return null;
      const source = path.replace(/\.js$/, ".ts");
      return existsSync(source) ? source + id.slice(path.length) : null;
    }
  };
}

export function createEditorExportRuntimePlugin(
  bundle: () => Promise<string> = bundleEditorRuntime,
  font: () => string = () => readFileSync(resolve(repoRoot, "public/fonts/whitney-regular.woff2")).toString("base64")
) {
  return {
    name: "a3d-editor-export-runtime",
    resolveId(id: string) {
      return id === editorExportModule ? resolvedEditorExportModule : null;
    },
    async load(id: string) {
      if (id !== resolvedEditorExportModule) return null;
      const script = await bundle();
      return `export default ${JSON.stringify({ script, fontDataUri: `data:font/woff2;base64,${font()}` })};`;
    }
  };
}

export default {
  resolve: {
    alias,
  },
  worker: {
    format: "es" as const,
    plugins: () => [createSourceWorkerEntryPlugin()],
  },
  plugins: [
    createSourceWorkerEntryPlugin(),
    createEditorExportRuntimePlugin(),
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
          const extension = extname(found);
          response.setHeader("Content-Type", extension === ".wasm" ? "application/wasm" : extension === ".txt" ? "text/plain; charset=utf-8" : "application/javascript");
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
