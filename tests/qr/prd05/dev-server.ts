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

function rewriteLaneImports(source: string, servedPath: string, repoRoot: string): string {
  let output = source;
  // Same-file URL dedup: `from "./x.js"` specifiers inside repo source mean
  // `x.ts` on disk (TS/NodeNext resolution). The shared server answers them
  // verbatim at the `.js` URL, while extension-less specifiers 302 to `.ts` —
  // two URLs for one module → side-effect modules (e.g. lanes/prd02 feature
  // registration) evaluate twice and REGISTRY_DUPLICATE throws. Rewrite the
  // specifier to `.ts` when that file really exists (never for vendor .js
  // like packages/assets/vendor/*).
  if (/^\/(packages|tests|benchmarks|apps|tools)\//.test(servedPath)) {
    const servedDir = join(repoRoot, servedPath.split("/").slice(0, -1).join("/"));
    const maybeJsToTs = (match: string, pre: string, post: string): string => {
      const rel = pre.slice(0, -3).match(/["']([^"']+)$/)?.[1]; // specifier sans ".js"
      if (!rel) return match;
      const target = rel.startsWith("/")
        ? resolve(repoRoot, decodeURIComponent(rel.slice(1)) + ".ts")
        : resolve(servedDir, decodeURIComponent(rel) + ".ts");
      return target.startsWith(repoRoot) && existsSync(target) ? `${pre.slice(0, -3)}.ts${post}` : match;
    };
    output = output.replace(/(\bfrom\s*["'][./][^"']+\.js)(["'])/g, (m, a, b) => maybeJsToTs(m, a, b));
    output = output.replace(/(\bimport\s*["'][./][^"']+\.js)(["'])/g, (m, a, b) => maybeJsToTs(m, a, b));
    output = output.replace(/(\bimport\s*\(\s*(?:\/\*[^]*?\*\/\s*)?["'][./][^"']+\.js)(["']\s*\))/g, (m, a, b) => maybeJsToTs(m, a, b));
    // Extensionless repo specifiers resolve to `.ts` / `index.ts` on disk;
    // normalize them onto the same URL so each module evaluates exactly once.
    const resolveRel = (rel: string): string => (rel.startsWith("/")
      ? resolve(repoRoot, decodeURIComponent(rel.slice(1)))
      : resolve(servedDir, decodeURIComponent(rel)));
    const maybeAddExt = (match: string, pre: string, rel: string, post: string): string => {
      if (/\.(m?[tj]sx?|json|css|wasm|glsl|wgsl|png|jpg|svg|hdr|glb|bin|mp3|wav|ogg|ico|woff2?|map)$/.test(rel)) return match;
      const base = resolveRel(rel);
      if (!base.startsWith(repoRoot)) return match;
      if (existsSync(`${base}.ts`)) return `${pre}${rel}.ts${post}`;
      if (existsSync(join(base, "index.ts"))) return `${pre}${rel}/index.ts${post}`;
      return match;
    };
    output = output.replace(/(\bfrom\s*["'])([./][^"']+?)(["'])/g, (m, a, rel, b) => maybeAddExt(m, a, rel, b));
    output = output.replace(/(\bimport\s*["'])([./][^"']+?)(["'])/g, (m, a, rel, b) => maybeAddExt(m, a, rel, b));
    output = output.replace(/(\bimport\s*\(\s*)(["'])([./][^"']+?)(["']\s*\))/g, (m, a, q, rel, b) => {
      // b carries the closing quote + paren; reuse maybeAddExt's existsSync
      // check but splice .ts in before the closing quote.
      if (/\.(m?[tj]sx?|json|css|wasm|glsl|wgsl|png|jpg|svg|hdr|glb|bin|mp3|wav|ogg|ico|woff2?|map)$/.test(rel)) return m;
      const base = resolveRel(rel);
      if (!base.startsWith(repoRoot)) return m;
      if (existsSync(`${base}.ts`)) return `${a}${q}${rel}.ts${b}`;
      if (existsSync(join(base, "index.ts"))) return `${a}${q}${rel}/index.ts${b}`;
      return m;
    });
  }
  for (const [specifier, target] of LANE_ENTRY_POINTS) {
    const esc = specifier.replace(ESCAPE, "\\$&");
    output = output
      .replace(new RegExp(`(\\bfrom\\s*["'])${esc}(["'])`, "g"), `$1${target}$2`)
      .replace(new RegExp(`(\\bimport\\s*["'])${esc}(["'])`, "g"), `$1${target}$2`)
      .replace(new RegExp(`(\\bimport\\s*\\(\\s*(?:/\\*[^]*?\\*/\\s*)?["'])${esc}(["']\\s*\\))`, "g"), `$1${target}$2`);
  }
  // `"x.glsl"`/`"x.wgsl"` specifiers resolve to `x.glsl.ts`/`x.wgsl.ts` on
  // disk (TS resolution) — the upstream server only knows the raw path, so
  // point the specifier at the real file and let it transpile it.
  output = output.replace(/(\bfrom\s*["'][^"']+)\.(glsl|wgsl)(["'])/g, "$1.$2.ts$3");
  output = output.replace(/(\bimport\s*\(\s*["'][^"']+)\.(glsl|wgsl)(["']\s*\))/g, "$1.$2.ts$3");
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
        // Only module payloads get rewritten — upstream serves .hdr/.glsl/.wgsl
        // and other binaries as text/plain, and decoding those as UTF-8 turns
        // every byte >=0x80 into U+FFFD (observed: 1.5MB Radiance HDR -> 4MB
        // garbage -> production HDR decode failure).
        const payload = /javascript/.test(type)
          ? applyDefines(rewriteLaneImports(body.toString("utf8"), requestPath, root), defines)
          : body;
        // `resolveDirectoryModuleRedirect` answers extension-less directory
        // specifiers with 302 + location; dropping the header leaves the
        // browser's module fetch suspended forever. Upstream may use chunked
        // transfer-encoding — drop it plus its stale content-length so the
        // rewritten payload's length is the only framing on the wire.
        const { "transfer-encoding": _te, "content-length": _cl, ...headers } = up.headers;
        const out = typeof payload === "string" ? Buffer.from(payload, "utf8") : payload;
        res.writeHead(up.statusCode ?? 200, { ...headers, "content-length": out.length });
        res.end(out);
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
