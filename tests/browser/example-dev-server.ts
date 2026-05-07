import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import ts from "typescript";

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
  ["@galileo3d/physics", "/packages/physics/src/index.ts"],
  ["@galileo3d/animation", "/packages/animation/src/index.ts"],
  ["@galileo3d/assets", "/packages/assets/src/index.ts"],
  ["@galileo3d/input", "/packages/input/src/index.ts"],
  ["@galileo3d/audio", "/packages/audio/src/index.ts"],
  ["@galileo3d/scripting", "/packages/scripting/src/index.ts"],
  ["@galileo3d/editor-runtime", "/packages/editor-runtime/src/index.ts"],
  ["@galileo3d/editor", "/packages/editor/src/index.ts"],
  ["@galileo3d/debug", "/packages/debug/src/index.ts"],
]);

export async function startExampleDevServer(root = process.cwd()): Promise<ExampleDevServer> {
  const server = createServer((request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
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

      response.writeHead(200, { "content-type": contentType(file) });
      response.end(readFileSync(file));
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

function resolveRequest(root: string, pathname: string): string | undefined {
  const normalizedPath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const candidates: string[] = [];

  if (normalizedPath === "/" || normalizedPath === ".") {
    candidates.push(join(root, "examples", "00-basic-triangle", "index.html"));
  } else {
    candidates.push(join(root, normalizedPath));
  }

  if (!extname(normalizedPath)) {
    candidates.push(join(root, `${normalizedPath}.ts`));
    candidates.push(join(root, `${normalizedPath}.js`));
    candidates.push(join(root, normalizedPath, "index.html"));
  }

  if (normalizedPath.endsWith(".js")) {
    candidates.push(join(root, normalizedPath.replace(/\.js$/, ".ts")));
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
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".glb":
      return "model/gltf-binary";
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
