import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";
import ts from "typescript";
import * as esbuild from "esbuild";
import { contextualPathForLegacyPath } from "../../tools/naming-taxonomy/contextualAliases";
import { installedAuraPackageAliases } from "./installed-package-resolve";

export interface ExampleDevServer {
  readonly origin: string;
  close(): Promise<void>;
}

const packageEntryPoints = new Map<string, string>([
  ["@aura3d/math", "/packages/math/src/index.ts"],
  ["@aura3d/core", "/packages/core/src/index.ts"],
  ["@aura3d/scene/math", "/packages/scene/src/MathTypes.ts"],
  ["@aura3d/scene", "/packages/scene/src/index.ts"],
  ["@aura3d/ecs", "/packages/ecs/src/index.ts"],
  ["@aura3d/rendering/reflection-surfaces", "/packages/rendering/src/reflection-surfaces.ts"],
  // Every published `@aura3d/rendering` subpath must be aliased here, and each must
  // precede the bare specifier because the first prefix match wins. Omitting one does not
  // fail loudly at build time: the browser rejects the specifier at runtime, the route
  // falls back to a scalar material, and only a downstream pixel assertion notices. That
  // is exactly how C1's textured upgrade silently regressed
  // ("Failed to resolve module specifier '@aura3d/rendering/extension-scalar-atlas'").
  ["@aura3d/rendering/extension-scalar-atlas", "/packages/rendering/src/extension-scalar-atlas.ts"],
  ["@aura3d/rendering/webgpu", "/packages/rendering/src/webgpu.ts"],
  // contracts/world subpaths used by QR lane code (prd07 flagged the gap when
  // browser specs timed out with unresolved bare specifiers).
  ["@aura3d/rendering/contracts/flags.state", "/packages/rendering/src/contracts/flags.state.ts"],
  ["@aura3d/rendering/contracts", "/packages/rendering/src/contracts/index.ts"],
  ["@aura3d/rendering/world", "/packages/rendering/src/world/index.ts"],
  ["@aura3d/rendering/production-runtime", "/packages/rendering/src/production-runtime/index.ts"],
  ["@aura3d/rendering", "/packages/rendering/src/index.ts"],
  ["@aura3d/engine", "/packages/engine/src/public/index.ts"],
  ["@aura3d/engine/scene", "/packages/scene/src/index.ts"],
  ["@aura3d/cli", "/packages/aura3d-cli/src/index.ts"],
  ["@aura3d/react", "/packages/react/src/index.ts"],
  ["@aura3d/engine/production-runtime", "/packages/engine/src/production-runtime/index.ts"],
  ["@aura3d/engine/advanced-runtime", "/packages/engine/src/advanced-runtime/index.ts"],
  ["@aura3d/apps", "/packages/apps/src/index.ts"],
  ["@aura3d/engine/apps", "/packages/apps/src/index.ts"],
  ["@aura3d/product-studio", "/packages/product-studio/src/index.ts"],
  ["@aura3d/physics", "/packages/physics/src/index.ts"],
  ["@aura3d/physics-rapier", "/packages/physics-rapier/src/index.ts"],
  ["@aura3d/navigation-recast", "/packages/navigation-recast/src/index.ts"],
  /*
   * WS-2.2/2.3 subpaths. Without these, any harness importing the public entry fails at runtime with
   * "Failed to resolve module specifier" — the browser has no bare-specifier resolution, so every
   * package entry has to be mapped here explicitly.
   */
  ["@aura3d/physics/solverless", "/packages/physics/src/solverless.ts"],
  ["@aura3d/physics/world", "/packages/physics/src/world.ts"],
  ["@aura3d/engine/rendering/webgpu", "/packages/rendering/src/webgpu.ts"],
  ["@aura3d/engine/contracts", "/packages/engine/src/contracts/index.ts"],
  ["@aura3d/engine-runtime/contracts", "/packages/engine/src/contracts/index.ts"],
  ["@aura3d/engine-runtime", "/packages/engine/src/index.ts"],
  ["@aura3d/engine/media-node", "/packages/engine/src/agent-api/media-node.ts"],
  ["@aura3d/animation/lanes", "/packages/animation/src/lanes/index.ts"],
  ["@aura3d/animation", "/packages/animation/src/browser-index.ts"],
  ["@aura3d/assets", "/packages/assets/src/browser-index.ts"],
  ["@aura3d/assets/browser", "/packages/assets/src/browser-index.ts"],
  ["@aura3d/assets/gltf-runtime", "/packages/assets/src/gltf-runtime.ts"],
  ["@aura3d/engine/assets/browser", "/packages/assets/src/browser-index.ts"],
  ["@aura3d/engine/rendering", "/packages/rendering/src/index.ts"],
  ["@aura3d/engine/rendering/production-runtime", "/packages/rendering/src/production-runtime/index.ts"],
  ["@aura3d/input", "/packages/input/src/index.ts"],
  ["@aura3d/controls", "/packages/controls/src/index.ts"],
  ["@aura3d/audio", "/packages/audio/src/index.ts"],
  ["@aura3d/scripting", "/packages/scripting/src/index.ts"],
  ["@aura3d/workflows", "/packages/workflows/src/index.ts"],
  ["@aura3d/engine/workflows/production", "/packages/workflows/src/production-runtime/index.ts"],
  ["@aura3d/engine/workflows", "/packages/workflows/src/index.ts"],
  ["@aura3d/editor-runtime", "/packages/editor-runtime/src/index.ts"],
  ["@aura3d/debug", "/packages/debug/src/index.ts"],
  ["@loaders.gl/core", "/node_modules/@loaders.gl/core/dist/index.js"],
  ["@loaders.gl/images", "/node_modules/.pnpm/@loaders.gl+images@4.4.1_@loaders.gl+core@4.4.1/node_modules/@loaders.gl/images/dist/index.js"],
  ["@loaders.gl/loader-utils", "/node_modules/.pnpm/@loaders.gl+loader-utils@4.4.1_@loaders.gl+core@4.4.1/node_modules/@loaders.gl/loader-utils/dist/index.js"],
  ["@loaders.gl/schema", "/node_modules/.pnpm/@loaders.gl+schema@4.4.1/node_modules/@loaders.gl/schema/dist/index.js"],
  ["@loaders.gl/schema-utils", "/node_modules/.pnpm/@loaders.gl+schema-utils@4.4.1_@loaders.gl+core@4.4.1/node_modules/@loaders.gl/schema-utils/dist/index.js"],
  ["@loaders.gl/textures", "/node_modules/@loaders.gl/textures/dist/index.js"],
  ["@loaders.gl/worker-utils", "/node_modules/.pnpm/@loaders.gl+worker-utils@4.4.1_@loaders.gl+core@4.4.1/node_modules/@loaders.gl/worker-utils/dist/index.js"],
  ["@math.gl/types", "/node_modules/.pnpm/@math.gl+types@4.1.0/node_modules/@math.gl/types/dist/index.js"],
  ["@probe.gl/env", "/node_modules/.pnpm/@probe.gl+env@4.1.1/node_modules/@probe.gl/env/dist/index.js"],
  ["@probe.gl/log", "/node_modules/.pnpm/@probe.gl+log@4.1.1/node_modules/@probe.gl/log/dist/index.js"],
  ["@probe.gl/stats", "/node_modules/.pnpm/@probe.gl+stats@4.1.1/node_modules/@probe.gl/stats/dist/index.js"],
  ["apache-arrow", "/node_modules/.pnpm/apache-arrow@21.1.0/node_modules/apache-arrow/Arrow.dom.mjs"],
  ["@dimforge/rapier3d-compat", "/node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs"],
  ["recast-navigation/generators", "/node_modules/.pnpm/recast-navigation@0.43.1/node_modules/recast-navigation/generators.mjs"],
  ["recast-navigation", "/node_modules/.pnpm/recast-navigation@0.43.1/node_modules/recast-navigation/index.mjs"],
  ["@recast-navigation/generators", "/node_modules/.pnpm/@recast-navigation+generators@0.43.1/node_modules/@recast-navigation/generators/dist/index.mjs"],
  ["@recast-navigation/core", "/node_modules/.pnpm/@recast-navigation+core@0.43.1/node_modules/@recast-navigation/core/dist/index.mjs"],
  ["@recast-navigation/wasm", "/node_modules/.pnpm/@recast-navigation+wasm@0.43.1/node_modules/@recast-navigation/wasm/dist/recast-navigation.wasm-compat.js"],
  ["flatbuffers", "/node_modules/.pnpm/flatbuffers@25.9.23/node_modules/flatbuffers/mjs/flatbuffers.js"],
  // ktx-parse resolves through the pnpm public-hoist link — the nested
  // `.pnpm/node_modules/` store layout varies by platform (404s on
  // windows-latest) while the hoisted `node_modules/ktx-parse` symlink exists
  // on every install.
  ["ktx-parse", "/node_modules/ktx-parse/dist/ktx-parse.modern.js"],
  ["three/addons/loaders/GLTFLoader.js", "/node_modules/three/examples/jsm/loaders/GLTFLoader.js"],
  ["three/addons/loaders/DRACOLoader.js", "/node_modules/three/examples/jsm/loaders/DRACOLoader.js"],
  ["three/addons/loaders/KTX2Loader.js", "/node_modules/three/examples/jsm/loaders/KTX2Loader.js"],
  ["three/addons/loaders/RGBELoader.js", "/node_modules/three/examples/jsm/loaders/RGBELoader.js"],
  ["three/addons/loaders/HDRLoader.js", "/node_modules/three/examples/jsm/loaders/HDRLoader.js"],
  ["three/addons/controls/OrbitControls.js", "/node_modules/three/examples/jsm/controls/OrbitControls.js"],
  ["three/addons/csm/CSM.js", "/node_modules/three/examples/jsm/csm/CSM.js"],
  ["three/addons/environments/RoomEnvironment.js", "/node_modules/three/examples/jsm/environments/RoomEnvironment.js"],
  ["three/addons/objects/Reflector.js", "/node_modules/three/examples/jsm/objects/Reflector.js"],
  ["three/addons/libs/meshopt_decoder.module.js", "/node_modules/three/examples/jsm/libs/meshopt_decoder.module.js"],
  ["three/addons/postprocessing/EffectComposer.js", "/node_modules/three/examples/jsm/postprocessing/EffectComposer.js"],
  ["three/addons/postprocessing/OutputPass.js", "/node_modules/three/examples/jsm/postprocessing/OutputPass.js"],
  ["three/addons/postprocessing/RenderPass.js", "/node_modules/three/examples/jsm/postprocessing/RenderPass.js"],
  ["three/addons/postprocessing/UnrealBloomPass.js", "/node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js"],
  ["three/addons/webxr/XRButton.js", "/node_modules/three/examples/jsm/webxr/XRButton.js"],
  ["three/webgpu", "/node_modules/three/build/three.webgpu.js"],
  ["three/tsl", "/node_modules/three/build/three.tsl.js"],
  ["three", "/node_modules/three/build/three.module.js"],
  ["tslib", "/node_modules/.pnpm/tslib@2.8.1/node_modules/tslib/tslib.es6.mjs"],
]);

for (const entry of installedAuraPackageAliases()) {
  const repositoryRelative = relative(process.cwd(), entry.replacement).replaceAll("\\", "/");
  if (repositoryRelative.startsWith("../")) {
    throw new Error(`Installed comparison package is outside the served repository: ${entry.replacement}`);
  }
  packageEntryPoints.set(entry.find, `/${repositoryRelative}`);
}

export async function startExampleDevServer(root = process.cwd()): Promise<ExampleDevServer> {
  // Transforms are deterministic per (file, mtime); engine graphs pull ~1,300
  // modules through this handler and re-running ts.transpileModule plus the
  // specifier rewrites per request is what pushes cold module-load past the
  // spec budgets on CI runners. Cache for the server's lifetime only.
  const transformCache = new Map<string, { mtimeMs: number; output: string | Buffer }>();
  const transformed = (file: string, produce: () => string | Buffer): string | Buffer => {
    const mtimeMs = statSync(file).mtimeMs;
    const hit = transformCache.get(file);
    if (hit && hit.mtimeMs === mtimeMs) return hit.output;
    const output = produce();
    transformCache.set(file, { mtimeMs, output });
    return output;
  };
  // Harness entries pull ~1,300 modules through per-request transpile; bundling
  // the entry once drops the whole graph to a single module (~1s esbuild vs
  // minutes on contended CI). Falls back to per-module serving if bundling
  // ever fails so the path is strictly non-worse.
  const bundleCache = new Map<string, { mtimeMs: number; output: string }>();
  const auraResolvePlugin: esbuild.Plugin = {
    name: "aura3d-dev-server-resolve",
    setup: (build) => {
      build.onResolve({ filter: /.*/ }, (args) => {
        // Entry points and already-absolute filesystem paths pass through.
        if (resolve(args.path) === args.path && existsSync(args.path)) {
          return { path: args.path };
        }
        if (args.path.startsWith("node:")) {
          // Node builtins appear inside dormant dynamic imports in deps
          // (e.g. @gltf-transform node helpers); keep them lazy like the
          // per-module path does — they 404 only if ever executed.
          return { path: args.path, external: true };
        }
        if (!args.path.startsWith(".") && !args.path.startsWith("/")) {
          const mapped = packageEntryPoints.get(args.path);
          if (mapped === undefined) {
            // Unmapped bare specifier: package.json/node_modules resolution
            // (deps like `three`), or a static-only miss — let esbuild decide.
            return undefined;
          }
          const file = resolve(join(root, mapped));
          // Hoist layout varies across environments (e.g. which ktx-parse
          // version lands at .pnpm/node_modules); a missing mapped file must
          // defer to esbuild's own node resolution — emitting the specifier
          // external would deliver a bare import the browser cannot resolve.
          if (!existsSync(file)) return undefined;
          return { path: file };
        }
        const canonical = resolveModuleSpecifier(args.importer, root, args.path);
        return canonical ? { path: resolve(join(root, canonical)) } : undefined;
      });
      build.onLoad({ filter: /\.css$/ }, (args) => ({
        loader: "js",
        contents: `(() => { const style = document.createElement("style"); style.setAttribute("data-aura3d-dev-css", ${JSON.stringify(relative(root, args.path))}); style.textContent = ${JSON.stringify(readFileSync(args.path, "utf8"))}; document.head.appendChild(style); })();`,
      }));
    },
  };
  const bundleForBrowser = async (file: string): Promise<string | undefined> => {
    const mtimeMs = statSync(file).mtimeMs;
    const hit = bundleCache.get(file);
    if (hit && hit.mtimeMs === mtimeMs) return hit.output;
    try {
      const result = await esbuild.build({
        entryPoints: [file],
        bundle: true,
        format: "esm",
        platform: "browser",
        write: false,
        logLevel: "silent",
        // §15 test-build gate: browser harness bundles are test builds, so
        // the PRD-09 `__AURA3D_GAME_TEST__` hook installs here while staying
        // absent from production (vite MODE="production") bundles.
        define: {
          "import.meta.env.MODE": '"test"',
        },
        plugins: [auraResolvePlugin],
        loader: {
          ".glsl": "text",
          ".glb": "dataurl",
          ".png": "dataurl",
          ".jpg": "dataurl",
          ".jpeg": "dataurl",
          ".webp": "dataurl",
          ".hdr": "dataurl",
          ".exr": "dataurl",
          ".bin": "dataurl",
          ".wasm": "dataurl",
          ".mp3": "dataurl",
          ".wav": "dataurl",
          ".ogg": "dataurl",
        },
      });
      const output = result.outputFiles[0]?.text;
      if (!output) return undefined;
      bundleCache.set(file, { mtimeMs, output });
      return output;
    } catch (error) {
      console.log("[example-dev-server] esbuild bundle failed for", file, "- falling back to per-module transform:", String(error).slice(0, 300));
      return undefined;
    }
  };
  const server = createServer((request, response) => {
    void handleRequest(request, response);
  });
  const handleRequest = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (isBrowserIconProbe(url.pathname)) {
        response.writeHead(204, { "cache-control": "no-store" });
        response.end();
        return;
      }
      const redirect = resolveDirectoryModuleRedirect(root, decodeURIComponent(url.pathname));
      if (redirect) {
        response.writeHead(302, { location: redirect });
        response.end();
        return;
      }
      const pathname = decodeURIComponent(url.pathname);
      const file = resolveRequest(root, pathname);

      if (!file) {
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("Not found");
        return;
      }

      // Canonicalize module URLs onto the real file path. Importers reach the
      // same `.ts` file via `x`, `x.js`, and `x.ts` specifiers (extensionless
      // relative imports are the repo convention); served verbatim those are
      // three distinct module instances, which breaks singleton registries
      // (REGISTRY_DUPLICATE). Redirecting non-canonical specifiers makes the
      // browser cache them as one module — the same resolution vite/TS apply.
      const canonical = `/${relative(resolve(root), resolve(file)).replace(/\\/g, "/")}`;
      if (file.endsWith(".ts") && normalize(pathname).replace(/\\/g, "/") !== canonical) {
        response.writeHead(302, { location: canonical });
        response.end();
        return;
      }

      if (file.endsWith(".ts")) {
        // Entries under tests/browser are page-level module scripts: serve them
        // as a single esbuild bundle so the browser evaluates one module
        // instead of ~1,300 individually transformed files.
        const bundled = normalize(pathname).replace(/\\/g, "/").startsWith("/tests/browser/")
          ? await bundleForBrowser(file)
          : undefined;
        const output = bundled ?? transformed(file, () => transpileForBrowser(readFileSync(file, "utf8"), file, root));
        response.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
        response.end(output);
        return;
      }

      const content = file.endsWith(".js") || file.endsWith(".mjs")
        ? transformed(file, () => rewriteModuleSpecifiers(rewritePackageImports(readFileSync(file, "utf8")), file, root))
        : readFileSync(file);
      response.writeHead(200, { "content-type": contentType(file) });
      response.end(content);
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain" });
      response.end(error instanceof Error ? error.stack : String(error));
    }
  };

  await listen(server);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Example dev server did not bind a TCP port.");
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => close(server),
  };
}

function resolveDirectoryModuleRedirect(root: string, pathname: string): string | undefined {
  const normalizedPath = normalize(contextualPathForLegacyPath(pathname)).replace(/^(\.\.[/\\])+/, "");
  if (normalizedPath === "/" || normalizedPath === "." || extname(normalizedPath) || pathname.endsWith("/")) {
    return undefined;
  }
  const directory = resolve(join(root, normalizedPath));
  if (!directory.startsWith(resolve(root))) {
    return undefined;
  }
  if (existsSync(join(directory, "index.ts")) || existsSync(join(directory, "index.js"))) {
    return `${pathname}/index.js`;
  }
  return undefined;
}

function resolveRequest(root: string, pathname: string): string | undefined {
  const normalizedPath = normalize(contextualPathForLegacyPath(pathname)).replace(/^(\.\.[/\\])+/, "");
  const candidates: string[] = [];
  const loadersBrowserMappedPath = browserMappedLoadersGLPath(normalizedPath);
  const legacyGameSliceTemplatePath = gameSliceTemplatePath(normalizedPath);

  if (normalizedPath === "/" || normalizedPath === ".") {
    candidates.push(join(root, "examples", "00-basic-triangle", "index.html"));
  } else if (normalizedPath.startsWith("assets/draco/") || normalizedPath.startsWith("/assets/draco/")) {
    const decoderFile = normalizedPath.replace(/^[/\\]?assets[/\\]draco[/\\]/, "");
    candidates.push(join(root, "marketing", "public", "assets", "draco", decoderFile));
    candidates.push(join(root, "node_modules", "draco3d", decoderFile));
  } else if (normalizedPath.startsWith("aura-assets/") || normalizedPath.startsWith("/aura-assets/")) {
    candidates.push(join(root, "public", normalizedPath.replace(/^[/\\]?/, "")));
    candidates.push(join(root, "templates", "product-viewer", "public", normalizedPath.replace(/^[/\\]?/, "")));
    candidates.push(join(root, "packages", "create-aura3d", "templates", "product-viewer", "public", normalizedPath.replace(/^[/\\]?/, "")));
    candidates.push(join(root, "templates", "mini-game", "public", normalizedPath.replace(/^[/\\]?/, "")));
    candidates.push(join(root, "packages", "create-aura3d", "templates", "mini-game", "public", normalizedPath.replace(/^[/\\]?/, "")));
  } else if (loadersBrowserMappedPath) {
    candidates.push(join(root, loadersBrowserMappedPath));
  } else if (legacyGameSliceTemplatePath) {
    // A real evidence route takes precedence when it exists. The template mapping
    // is only a compatibility fallback for checkouts that do not carry the
    // historical example tree.
    candidates.push(join(root, normalizedPath));
    candidates.push(join(root, legacyGameSliceTemplatePath));
  } else {
    candidates.push(join(root, normalizedPath));
    // Vite serves repository public/ files from the origin root. Mirror that
    // contract so route assets such as /favicon.svg do not become harness-only
    // 404s while production and preview builds resolve them correctly.
    candidates.push(join(root, "public", normalizedPath.replace(/^[/\\]?/, "")));
  }

  if (!extname(normalizedPath)) {
    candidates.push(join(root, `${normalizedPath}.ts`));
    candidates.push(join(root, `${normalizedPath}.js`));
    candidates.push(join(root, normalizedPath, "index.ts"));
    candidates.push(join(root, normalizedPath, "index.js"));
    candidates.push(join(root, normalizedPath, "index.html"));
  }

  if (normalizedPath.endsWith(".js")) {
    candidates.push(join(root, normalizedPath.replace(/\.js$/, ".ts")));
  }
  // Vite/TS resolve `foo.glsl`-style specifiers onto sibling `foo.glsl.ts`
  // modules (shader and lane sources follow that convention). Mirror it so
  // importing the full "." union in a browser harness finds them.
  if (extname(normalizedPath)) {
    candidates.push(join(root, `${normalizedPath}.ts`));
  }

  // Dotted-suffix sources resolve the same way TypeScript does: a specifier
  // like `./chunks/common.glsl` or `./diagnosticOnly.prd07` maps onto the
  // `.ts` file of the same dotted name (`common.glsl.ts`,
  // `diagnosticOnly.prd07.ts`). Only applies when the literal file is absent.
  if (extname(normalizedPath) && !normalizedPath.endsWith(".ts") && !normalizedPath.endsWith(".js") && !normalizedPath.endsWith(".mjs")) {
    candidates.push(join(root, `${normalizedPath}.ts`));
  }

  const loadersVersioned = normalizedPath.match(/^[/\\]node_modules[/\\]@loaders\.gl[/\\]([^/\\]+)@[^/\\]+([/\\].*)$/);
  if (loadersVersioned) {
    candidates.push(join(root, "node_modules", "@loaders.gl", loadersVersioned[1]!, loadersVersioned[2]!));
  }

  for (const candidate of candidates) {
    const resolved = resolve(candidate);
    if (!resolved.startsWith(resolve(root))) {
      continue;
    }
    if (existsSync(resolved) && statSync(resolved).isFile()) {
      return resolved;
    }
  }

  return undefined;
}

function gameSliceTemplatePath(pathname: string): string | undefined {
  const normalized = pathname.replace(/\\/g, "/").replace(/^\//, "");
  if (normalized === "examples/game-slice") {
    return "templates/game-slice/index.html";
  }
  if (normalized.startsWith("examples/game-slice/")) {
    return normalized.replace(/^examples\/game-slice/, "templates/game-slice");
  }
  return undefined;
}

function isBrowserIconProbe(pathname: string): boolean {
  return pathname === "/favicon.ico" || /^\/apple-touch-icon(?:-\d+x\d+)?(?:-precomposed)?\.png$/.test(pathname);
}

function browserMappedLoadersGLPath(pathname: string): string | undefined {
  if (!pathname.includes("@loaders.gl")) {
    return undefined;
  }
  if (pathname.includes("worker-utils") && pathname.endsWith("/dist/lib/node/worker_threads.js")) {
    return pathname.replace(/[/\\]dist[/\\]lib[/\\]node[/\\]worker_threads\.js$/, "/dist/lib/node/worker_threads-browser.js");
  }
  if (pathname.includes("worker-utils") && pathname.endsWith("/dist/lib/process-utils/child-process-proxy.js")) {
    return pathname.replace(/[/\\]dist[/\\]lib[/\\]process-utils[/\\]child-process-proxy\.js$/, "/dist/lib/process-utils/child-process-proxy.browser.js");
  }
  if (pathname.includes("loader-utils") && pathname.endsWith("/dist/lib/node/stream.js")) {
    return pathname.replace(/[/\\]dist[/\\]lib[/\\]node[/\\]stream\.js$/, "/dist/lib/node/stream.browser.js");
  }
  if (pathname.includes("loader-utils") && pathname.endsWith("/dist/lib/node/buffer.js")) {
    return pathname.replace(/[/\\]dist[/\\]lib[/\\]node[/\\]buffer\.js$/, "/dist/lib/node/buffer.browser.js");
  }
  return undefined;
}

function transpileForBrowser(source: string, fileName: string, rootDir: string): string {
  const withCssInjected = source.replace(/^\s*import\s+["']([^"']+\.css)["'];?\s*$/gm, (_statement, specifier: string) => {
    const cssPath = specifier.startsWith(".")
      ? resolve(dirname(fileName), specifier)
      : resolve(process.cwd(), specifier.replace(/^\//, ""));
    if (!existsSync(cssPath)) {
      throw new Error(`CSS import not found: ${specifier} from ${fileName}`);
    }
    return `(() => { const style = document.createElement("style"); style.setAttribute("data-aura3d-dev-css", ${JSON.stringify(relative(process.cwd(), cssPath))}); style.textContent = ${JSON.stringify(readFileSync(cssPath, "utf8"))}; document.head.appendChild(style); })();`;
  });
  const rewritten = rewriteModuleSpecifiers(rewritePackageImports(withCssInjected), fileName, rootDir);
  const result = ts.transpileModule(rewritten, {
    fileName,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      isolatedModules: true,
      sourceMap: false,
      inlineSourceMap: false,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
  });

  return result.outputText;
}

function rewritePackageImports(source: string): string {
  let output = source;
  for (const [specifier, target] of packageEntryPoints) {
    const escapedSpecifier = escapeRegExp(specifier);
    output = output.replace(
      new RegExp(`(\\bfrom\\s*["'])${escapedSpecifier}(["'])`, "g"),
      `$1${target}$2`,
    );
    output = output.replace(
      new RegExp(`(\\bimport\\s*["'])${escapedSpecifier}(["'])`, "g"),
      `$1${target}$2`,
    );
    output = output.replace(
      new RegExp(`(\\bimport\\s*\\(\\s*(?:/\\*[^]*?\\*/\\s*)?["'])${escapedSpecifier}(["']\\s*\\))`, "g"),
      `$1${target}$2`,
    );
  }
  return output;
}

/**
 * Rewrites relative (`./x`, `../x`) and root-absolute (`/x`) specifiers to the
 * canonical root-relative URL of the file they resolve to — `../a/b`,
 * `../a/b.js`, and `../a/b.ts` all become `/…/a/b.ts`. The browser keys its
 * module map on the requested specifier URL, so without this the same file is
 * evaluated once per specifier shape and singleton registries throw
 * REGISTRY_DUPLICATE. Mirrors `resolveRequest`'s candidate order (`.ts`,
 * `/index.ts`, `.js`→`.ts`, `foo.glsl`→`foo.glsl.ts`).
 */
function rewriteModuleSpecifiers(source: string, fileName: string, root: string): string {
  const resolveSpecifier = (specifier: string): string | undefined => {
    const resolved = resolveModuleSpecifier(fileName, root, specifier);
    return resolved;
  };
  const patterns = [
    /(\bfrom\s*["'])(\.{1,2}\/[^"']+|\/[^"']+)(["'])/g,
    /(\bimport\s*["'])(\.{1,2}\/[^"']+|\/[^"']+)(["'])/g,
    /(\bimport\s*\(\s*(?:\/\*[^]*?\*\/\s*)?["'])(\.{1,2}\/[^"']+|\/[^"']+)(["']\s*\))/g,
  ];
  let output = source;
  for (const pattern of patterns) {
    output = output.replace(pattern, (_m, head: string, specifier: string, tail: string) => {
      const canonical = resolveSpecifier(specifier);
      return canonical ? `${head}${canonical}${tail}` : _m;
    });
  }
  return output;
}

function resolveModuleSpecifier(fromFile: string, root: string, specifier: string): string | undefined {
  const base = specifier.startsWith("/")
    ? join(root, specifier)
    : resolve(dirname(fromFile), specifier);
  const candidates = [
    base,
    ...(base.endsWith(".js") ? [base.replace(/\.js$/, ".ts")] : []),
    `${base}.ts`,
    `${base}.js`,
    join(base, "index.ts"),
    join(base, "index.js"),
  ];
  for (const candidate of candidates) {
    const resolved = resolve(candidate);
    if (!resolved.startsWith(resolve(root))) continue;
    if (existsSync(resolved) && statSync(resolved).isFile()) {
      return `/${relative(resolve(root), resolved).replace(/\\/g, "/")}`;
    }
  }
  return undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function contentType(file: string): string {
  switch (extname(file)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml; charset=utf-8";
    case ".glb":
      return "model/gltf-binary";
    case ".gltf":
      return "model/gltf+json; charset=utf-8";
    case ".ktx2":
      return "image/ktx2";
    case ".wasm":
      return "application/wasm";
    case ".bin":
      return "application/octet-stream";
    case ".css":
      return "text/css; charset=utf-8";
    default:
      return "text/plain; charset=utf-8";
  }
}

function listen(server: Server): Promise<void> {
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolveListen();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolveClose, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolveClose();
      }
    });
  });
}
