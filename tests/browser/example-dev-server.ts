import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import ts from "typescript";
import { contextualPathForLegacyPath } from "../../tools/naming-taxonomy/contextualAliases";

export interface ExampleDevServer {
  readonly origin: string;
  close(): Promise<void>;
}

const packageEntryPoints = new Map<string, string>([
  ["@galileo3d/math", "/packages/math/src/index.ts"],
  ["@galileo3d/core", "/packages/core/src/index.ts"],
  ["@galileo3d/scene", "/packages/scene/src/index.ts"],
  ["@galileo3d/ecs", "/packages/ecs/src/index.ts"],
  ["@galileo3d/rendering", "/packages/rendering/src/index.ts"],
  ["@galileo3d/engine", "/packages/engine/src/index.ts"],
  ["@galileo3d/engine/production-runtime", "/packages/engine/src/production-runtime/index.ts"],
  ["@galileo3d/engine/advanced-runtime", "/packages/engine/src/advanced-runtime/index.ts"],
  ["@galileo3d/engine/v6", "/packages/engine/src/production-runtime/index.ts"],
  ["@galileo3d/engine/v9", "/packages/engine/src/advanced-runtime/index.ts"],
  ["@galileo3d/apps", "/packages/apps/src/index.ts"],
  ["@galileo3d/engine/apps", "/packages/apps/src/index.ts"],
  ["@galileo3d/engine/engine", "/packages/engine/src/index.ts"],
  ["@galileo3d/product-studio", "/packages/product-studio/src/index.ts"],
  ["@galileo3d/physics", "/packages/physics/src/index.ts"],
  ["@galileo3d/animation", "/packages/animation/src/browser-index.ts"],
  ["@galileo3d/assets", "/packages/assets/src/browser-index.ts"],
  ["@galileo3d/engine/assets/asset-corpus", "/packages/assets/src/asset-corpus/index.ts"],
  ["@galileo3d/engine/assets/advanced-gallery", "/packages/assets/src/advanced-gallery/index.ts"],
  ["@galileo3d/engine/assets/v6", "/packages/assets/src/asset-corpus/index.ts"],
  ["@galileo3d/engine/assets/v9", "/packages/assets/src/advanced-gallery/index.ts"],
  ["@galileo3d/engine/assets/browser", "/packages/assets/src/browser-index.ts"],
  ["@galileo3d/engine/rendering", "/packages/rendering/src/index.ts"],
  ["@galileo3d/engine/rendering/production-runtime", "/packages/rendering/src/production-runtime/index.ts"],
  ["@galileo3d/engine/rendering/advanced-runtime", "/packages/rendering/src/advanced-runtime/index.ts"],
  ["@galileo3d/engine/rendering/v6", "/packages/rendering/src/production-runtime/index.ts"],
  ["@galileo3d/engine/rendering/v9", "/packages/rendering/src/advanced-runtime/index.ts"],
  ["@galileo3d/input", "/packages/input/src/index.ts"],
  ["@galileo3d/controls", "/packages/controls/src/index.ts"],
  ["@galileo3d/audio", "/packages/audio/src/index.ts"],
  ["@galileo3d/scripting", "/packages/scripting/src/index.ts"],
  ["@galileo3d/workflows", "/packages/workflows/src/index.ts"],
  ["@galileo3d/engine/workflows/production", "/packages/workflows/src/production-runtime/index.ts"],
  ["@galileo3d/engine/workflows/v6", "/packages/workflows/src/production-runtime/index.ts"],
  ["@galileo3d/engine/workflows", "/packages/workflows/src/index.ts"],
  ["@galileo3d/editor-runtime", "/packages/editor-runtime/src/index.ts"],
  ["@galileo3d/editor", "/packages/editor/src/index.ts"],
  ["@galileo3d/debug", "/packages/debug/src/index.ts"],
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
  ["flatbuffers", "/node_modules/.pnpm/flatbuffers@25.9.23/node_modules/flatbuffers/mjs/flatbuffers.js"],
  ["ktx-parse", "/node_modules/.pnpm/node_modules/ktx-parse/dist/ktx-parse.modern.js"],
  ["three/addons/loaders/GLTFLoader.js", "/node_modules/three/examples/jsm/loaders/GLTFLoader.js"],
  ["three", "/node_modules/three/build/three.module.js"],
  ["tslib", "/node_modules/.pnpm/tslib@2.8.1/node_modules/tslib/tslib.es6.mjs"],
]);

export async function startExampleDevServer(root = process.cwd()): Promise<ExampleDevServer> {
  const server = createServer((request, response) => {
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
      const file = resolveRequest(root, decodeURIComponent(url.pathname));

      if (!file) {
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("Not found");
        return;
      }

      if (file.endsWith(".ts")) {
        const source = readFileSync(file, "utf8");
        response.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
        response.end(transpileForBrowser(source, file));
        return;
      }

      const content = file.endsWith(".js") || file.endsWith(".mjs")
        ? rewritePackageImports(readFileSync(file, "utf8"))
        : readFileSync(file);
      response.writeHead(200, { "content-type": contentType(file) });
      response.end(content);
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain" });
      response.end(error instanceof Error ? error.stack : String(error));
    }
  });

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

  if (normalizedPath === "/" || normalizedPath === ".") {
    candidates.push(join(root, "examples", "00-basic-triangle", "index.html"));
  } else if (loadersBrowserMappedPath) {
    candidates.push(join(root, loadersBrowserMappedPath));
  } else {
    candidates.push(join(root, normalizedPath));
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

function transpileForBrowser(source: string, fileName: string): string {
  const rewritten = rewritePackageImports(source);
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
    output = output.replaceAll(`"${specifier}"`, `"${target}"`);
    output = output.replaceAll(`'${specifier}'`, `'${target}'`);
  }
  return output;
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
