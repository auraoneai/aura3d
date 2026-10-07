/**
 * PRD-04 dev-server wrapper (lane 04 only).
 *
 * The shared `tests/browser/example-dev-server.ts` rewrites package specifiers
 * through a literal `packageEntryPoints` map that does not yet cover the
 * `@aura3d/rendering/contracts` and `@aura3d/rendering/contracts/*` subpaths the
 * engine contracts layer (`packages/engine/src/contracts/*.ts`,
 * `createAuraApp.ts`, `production-runtime/actor/extensions.ts`) imports. Any
 * harness page whose module graph reaches `createAuraApp` then dies at module
 * evaluation with
 *   "Failed to resolve module specifier '@aura3d/rendering/contracts'"
 * — nothing publishes `__QR_READY__`/`__QR_ERROR__`, so every capture test
 * waits out its deadline on both engines (the page's module-level imports die
 * before the three.js branch can run either).
 *
 * Editing the shared server is lane-15's surface (qr-request), so this wrapper
 * proxies the real server and applies the missing specifier rewrites on JS
 * responses — the exact same replacement shapes `rewritePackageImports` uses.
 */
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createServer, request as httpRequest, type Server } from "node:http";
import { join, resolve } from "node:path";
import { startExampleDevServer, type ExampleDevServer } from "../../browser/example-dev-server";
import { benchmarkAssetFiles } from "../../../benchmarks/quality-rebuild/shared/assets";

export type { ExampleDevServer };

const ESCAPE = /[.*+?^${}()|[\]\\]/g;

/**
 * Exact-specifier aliases missing from the shared map, in the same
 * `from "X"` / `import "X"` / `import("X")` positions it rewrites.
 * `@aura3d/rendering/contracts` resolves to `src/contracts/index.ts` per the
 * package's `exports` table.
 */
const LANE_ENTRY_POINTS = new Map<string, string>([
  ["@aura3d/rendering/contracts", "/packages/rendering/src/contracts/index.ts"],
]);

/**
 * Prefix aliases missing from the shared map. `three/examples/*` is what the
 * legacy (non-prd04) scene adapters import directly — the shared map only
 * covers `three`, `three/webgpu`, `three/tsl` and the `three/addons/*`
 * spellings used by its own showcase pages.
 */
const LANE_PREFIXES = new Map<string, string>([
  ["three/examples/", "/node_modules/three/examples/"],
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
  // (package exports `./contracts/*` -> `./contracts/*.js`; source is .ts).
  const subpath = /(\bfrom\s*["'])@aura3d\/rendering\/contracts\/([^"']+)(["'])/g;
  output = output.replace(subpath, "$1/packages/rendering/src/contracts/$2.ts$3");
  output = output.replace(
    /(\bimport\s*\(\s*(?:\/\*[^]*?\*\/\s*)?["'])@aura3d\/rendering\/contracts\/([^"']+)(["']\s*\))/g,
    "$1/packages/rendering/src/contracts/$2.ts$3",
  );
  for (const [prefix, target] of LANE_PREFIXES) {
    const esc = prefix.replace(ESCAPE, "\\$&");
    output = output
      .replace(new RegExp(`(\\bfrom\\s*["'])${esc}([^"']+)(["'])`, "g"), `$1${target}$2$3`)
      .replace(new RegExp(`(\\bimport\\s*["'])${esc}([^"']+)(["'])`, "g"), `$1${target}$2$3`)
      .replace(new RegExp(`(\\bimport\\s*\\(\\s*(?:/\\*[^]*?\\*/\\s*)?["'])${esc}([^"']+)(["']\\s*\\))`, "g"), `$1${target}$2$3`);
  }
  return output;
}

/**
 * `__AURA3D_VERSION__` is a vite `define` (benchmarks/quality-rebuild/vite
 * .config.ts reads the repo package.json); the shared dev-server transpiles
 * without defines, so the identifier survives into served JS and throws a
 * ReferenceError in any module that reports the engine version. Substitute it
 * with the same literal the vite config would inject. `__THREE_VERSION__`
 * comes from `node_modules/three/package.json` in the same config.
 */
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

export async function startPrd04DevServer(root = process.cwd()): Promise<ExampleDevServer> {
  const upstream = await startExampleDevServer(root);
  const defines = new Map<string, string>([
    ["__AURA3D_VERSION__", JSON.stringify(readRepoVersion(join(root, "package.json")))],
    ["__THREE_VERSION__", JSON.stringify(readRepoVersion(join(root, "node_modules/three/package.json")))],
  ]);
  // `/qr-assets/*` is served by the `quality-rebuild-assets` vite plugin at
  // benchmark time (vite.config.ts); the shared dev-server has no such route,
  // so legacy scene adapters that fetch the canonical URLs get 404s. Serve
  // the same url -> repoPath map here.
  const qrAssets = new Map(benchmarkAssetFiles().map((file) => [file.url, file.repoPath]));
  const server: Server = createServer((req, res) => {
    const requestPath = (req.url ?? "").split("?")[0] ?? "";
    const qrAssetPath = qrAssets.get(requestPath);
    if (qrAssetPath) {
      const source = resolve(root, qrAssetPath);
      if (!existsSync(source)) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end(`missing benchmark asset ${qrAssetPath}`);
        return;
      }
      res.writeHead(200, {
        "content-type": requestPath.endsWith(".hdr") ? "application/octet-stream" : "model/gltf-binary",
      });
      createReadStream(source).pipe(res);
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
        const headers: Record<string, string> = { "content-type": type };
        const location = up.headers.location;
        if (location) headers.location = String(location);
        res.writeHead(up.statusCode ?? 502, headers);
        res.end(payload);
      });
    });
    proxy.on("error", (err) => {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end(String(err));
    });
    req.pipe(proxy);
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolveListen();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("prd04 dev-server proxy did not bind a TCP port.");
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()));
      });
      await upstream.close();
    },
  };
}
