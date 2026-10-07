/**
 * PRD-05 dev-server wrapper (lane 05 only).
 *
 * Same problem as the prd04 wrapper: the shared `tests/browser/example-dev-server.ts`
 * rewrites package specifiers through a literal `packageEntryPoints` map that does
 * not cover the specifier set the prd05 module graph needs:
 *   - `meshoptimizer` (the dynamic `import("meshoptimizer")` inside
 *     `AssetDecoderRegistry.loadMeshopt` — Contract C-16 requires the package import,
 *     not a CDN), and
 *   - `@aura3d/rendering/contracts` + `@aura3d/assets/contracts` subpaths pulled in by
 *     `engine/agent-api/AssetDecoders.ts` / `engine/contracts/*`.
 *
 * Editing the shared server is lane-15's surface, so this wrapper proxies it and
 * applies the missing specifier rewrites on JS responses — the exact same
 * replacement shapes `rewritePackageImports` uses.
 *
 * Additionally serves `/aura-decoders/*` from `public/aura-decoders/*` (the
 * production URL the C-16 registry defaults to; vite serves `public/` at the
 * root, the shared dev-server has no public-dir mount).
 */
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createServer, request as httpRequest, type Server } from "node:http";
import { extname, join, resolve } from "node:path";
import { startExampleDevServer, type ExampleDevServer } from "../../browser/example-dev-server";

export type { ExampleDevServer };

const ESCAPE = /[.*+?^${}()|[\]\\]/g;

const LANE_ENTRY_POINTS = new Map<string, string>([
  ["@aura3d/rendering/contracts", "/packages/rendering/src/contracts/index.ts"],
  ["@aura3d/assets/contracts", "/packages/assets/src/contracts/decoders.ts"],
  ["@aura3d/rendering/lanes", "/packages/rendering/src/lanes/index.ts"],
  ["@aura3d/engine/lanes", "/packages/engine/src/lanes/index.ts"],
  ["@aura3d/assets/lanes", "/packages/assets/src/lanes/index.ts"],
  ["meshoptimizer", "/node_modules/meshoptimizer/index.js"],
]);

function rewriteLaneImports(source: string): string {
  let output = source;
  for (const [specifier, target] of LANE_ENTRY_POINTS) {
    const esc = specifier.replace(ESCAPE, "\\$&");
    output = output
      .replace(new RegExp(`(\\bfrom\\s*["'])${esc}(["'])`, "g"), `$1${target}$2`)
      .replace(new RegExp(`(\\bimport\\s*["'])${esc}(["'])`, "g"), `$1${target}$2`)
      .replace(new RegExp(`(\\bimport\\s*\\(\\s*(?:/\\*[^]*?\\*/\\s*)?["'])${esc}(["']\\s*\\))`, "g"), `$1${target}$2`);
  }
  // `@aura3d/rendering/contracts/*` -> `/packages/rendering/src/contracts/*.ts`
  const subpath = /(\bfrom\s*["'])@aura3d\/rendering\/contracts\/([^"']+)(["'])/g;
  output = output.replace(subpath, "$1/packages/rendering/src/contracts/$2.ts$3");
  output = output.replace(
    /(\bimport\s*\(\s*(?:\/\*[^]*?\*\/\s*)?["'])@aura3d\/rendering\/contracts\/([^"']+)(["']\s*\))/g,
    "$1/packages/rendering/src/contracts/$2.ts$3",
  );
  return output;
}

function readRepoVersion(packageJsonPath: string): string {
  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function applyDefines(source: string, defines: ReadonlyMap<string, string>): string {
  let output = source;
  for (const [token, literal] of defines) {
    output = output.replace(new RegExp(`\\b${token}\\b`, "g"), literal);
  }
  return output;
}

const DECODER_CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".json": "application/json; charset=utf-8"
};

export async function startPrd05DevServer(root = process.cwd()): Promise<ExampleDevServer> {
  const upstream = await startExampleDevServer(root);
  const defines = new Map<string, string>([
    ["__AURA3D_VERSION__", JSON.stringify(readRepoVersion(join(root, "package.json")))],
    ["__THREE_VERSION__", JSON.stringify(readRepoVersion(join(root, "node_modules/three/package.json")))]
  ]);
  const server: Server = createServer((req, res) => {
    const requestPath = (req.url ?? "").split("?")[0] ?? "";
    // `/aura-decoders/*` mirrors the production vite `public/` mount.
    if (requestPath.startsWith("/aura-decoders/")) {
      const repoPath = resolve(root, "public", decodeURIComponent(requestPath.slice(1)));
      if (!repoPath.startsWith(resolve(root, "public")) || !existsSync(repoPath)) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end(`missing decoder file ${requestPath}`);
        return;
      }
      res.writeHead(200, { "content-type": DECODER_CONTENT_TYPES[extname(repoPath)] ?? "application/octet-stream" });
      createReadStream(repoPath).pipe(res);
      return;
    }
    const proxy = httpRequest(new URL(req.url ?? "/", upstream.origin), { method: req.method, headers: req.headers }, (up) => {
      const chunks: Buffer[] = [];
      up.on("data", (c: Buffer) => chunks.push(c));
      up.on("end", () => {
        const body = Buffer.concat(chunks);
        const type = String(up.headers["content-type"] ?? "");
        const payload = /javascript|text\/plain/.test(type)
          ? applyDefines(rewriteLaneImports(body.toString("utf8")), defines)
          : body;
        // `resolveDirectoryModuleRedirect` answers extension-less directory
        // specifiers with 302 + location; dropping the header leaves the
        // browser's module fetch suspended forever.
        res.writeHead(up.statusCode ?? 200, { ...up.headers, "content-length": payload.length });
        res.end(payload);
      });
    });
    req.pipe(proxy);
    proxy.on("error", (error) => {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end(String(error));
    });
  });
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const address = server.address();
  const origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  return {
    origin,
    close: async () => {
      await new Promise<void>((done) => server.close(() => done()));
      await upstream.close();
    }
  };
}
