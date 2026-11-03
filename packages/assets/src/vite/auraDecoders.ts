/** Vite deployment of Aura3D's optional same-origin decoder assets. */
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { cp, copyFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const VENDOR_ROOT = fileURLToPath(new URL("../../vendor", import.meta.url));
const WORKER_DIR = fileURLToPath(new URL("../workers/", import.meta.url));
const WORKER_JS = path.join(WORKER_DIR, "ktx2.worker.js");
// Filesystem path for the workspace-only dev fallback (compileWorkspaceWorker),
// never a Worker URL: published packages serve WORKER_JS. Joined as a path
// because finalize-dist rejects import.meta.url URLs that name a TypeScript file.
const WORKER_TS = path.join(WORKER_DIR, "ktx2.worker.ts");
const CODECS = ["basis", "draco", "meshopt"] as const;
const DEPLOYMENT_MODULE = "virtual:aura3d-decoder-deployment";
const RESOLVED_DEPLOYMENT_MODULE = `\0${DEPLOYMENT_MODULE}`;
const DEPLOYMENT_DEFINE = "import.meta.env.AURA3D_DECODER_BASE_PATH";
export type AuraDecoderCodec = (typeof CODECS)[number];

// The vendored codecs are classic scripts. A module worker cannot call
// importScripts, so expose the same source with a static ESM export as well.
const MODULE_CODECS: Readonly<Record<string, { source: string; name: string }>> = {
  [path.join("basis", "basis_transcoder.mjs")]: { source: path.join("basis", "basis_transcoder.js"), name: "BASIS" },
  [path.join("draco", "draco_decoder.mjs")]: { source: path.join("draco", "draco_decoder.js"), name: "DracoDecoderModule" }
};

const MIME: Readonly<Record<string, string>> = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".cjs": "text/javascript",
  ".wasm": "application/wasm",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8"
};

export interface AuraDecodersPluginOptions {
  /** Absolute same-origin URL beneath Vite's base. Defaults to `<vite-base>aura-decoders/`. */
  readonly basePath?: string;
  /** Families to deploy; omitted means all. KTX2 requires `basis`. */
  readonly codecs?: readonly AuraDecoderCodec[];
}

export interface AuraDecoderDeployment {
  /** URL used as the runtime `assets.decoders.basePath`. */
  readonly basePath: string;
  /** Relative directory inside Vite's output directory. */
  readonly outputPath: string;
}

/** Parse a same-origin absolute URL pathname without allowing ambiguous segments. */
function pathSegments(value: string, label: string): string[] {
  if (!value.startsWith("/") || value.startsWith("//") || /[\\?#\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${label} must be an absolute same-origin path without a query or fragment`);
  }
  const parts = value.slice(1).split("/");
  if (parts.at(-1) === "") parts.pop();
  if (parts.some((part) => part === "")) throw new Error(`${label} contains an empty path segment`);
  return parts.map((part) => {
    let decoded: string;
    try { decoded = decodeURIComponent(part); } catch { throw new Error(`${label} contains invalid path encoding`); }
    // Reject percent after decoding too: this prevents a proxy from turning a
    // twice-encoded slash or dot segment into a different path on a second pass.
    if (decoded === "." || decoded === ".." || /[%/:\\\u0000-\u001f\u007f]/.test(decoded)) {
      throw new Error(`${label} contains an unsafe path segment`);
    }
    return decoded;
  });
}

function urlPath(parts: readonly string[]): string {
  return `/${parts.map((part) => encodeURIComponent(part)).join("/")}${parts.length ? "/" : ""}`;
}

/** Resolve one URL/output mapping for dev, build and static preview. */
export function resolveAuraDecodersDeployment(viteBase = "/", decoderBasePath?: string): AuraDecoderDeployment {
  const base = pathSegments(viteBase, "Vite base");
  const decoder = decoderBasePath === undefined
    ? [...base, "aura-decoders"]
    : pathSegments(decoderBasePath, "Decoder basePath");
  if (decoder.length <= base.length || base.some((part, index) => decoder[index] !== part)) {
    throw new Error("Decoder basePath must name a directory beneath the Vite base");
  }
  return { basePath: urlPath(decoder), outputPath: decoder.slice(base.length).join(path.sep) };
}

type Request = { url?: string; method?: string };
type Response = { statusCode: number; setHeader: (key: string, value: string) => void; end: (body?: unknown) => void };
type Middleware = (req: Request, res: Response, next: () => void) => void;
type MiddlewareStack = { use: (fn: Middleware) => void };

async function compileWorkspaceWorker(): Promise<string> {
  if (!existsSync(WORKER_TS)) throw new Error(`Missing KTX2 worker source ${WORKER_TS}`);
  // This source-only path runs inside a Vite application. Published packages
  // already contain the compiled worker and do not need this transform.
  const { transformWithEsbuild } = await import("vite");
  const result = await transformWithEsbuild(readFileSync(WORKER_TS, "utf8"), WORKER_TS, {
    loader: "ts", format: "iife", target: "es2020", sourcemap: false
  });
  return result.code;
}

/** Only normalized paths under the requested codec family are served. */
function requestedFile(basePath: string, rawUrl: string | undefined, codecs: ReadonlySet<string>):
  | { kind: "other" | "invalid" | "missing" }
  | { kind: "file"; relative: string; mime: string } {
  const requestPath = (rawUrl ?? "").split("?", 1)[0]!;
  if (!requestPath.startsWith(basePath)) return { kind: "other" };
  let parts: string[];
  try { parts = pathSegments(`/${requestPath.slice(basePath.length)}`, "Decoder request"); }
  catch { return { kind: "invalid" }; }
  if (parts.length < 2 || !codecs.has(parts[0]!)) return { kind: "missing" };
  const mime = MIME[path.extname(parts.at(-1)!).toLowerCase()];
  if (!mime) return { kind: "missing" };
  return { kind: "file", relative: parts.join(path.sep), mime };
}

function fileUnder(root: string, relative: string): string | undefined {
  const candidate = path.resolve(root, relative);
  if (!candidate.startsWith(`${path.resolve(root)}${path.sep}`) || !existsSync(candidate)) return undefined;
  try {
    const realRoot = realpathSync(root);
    const real = realpathSync(candidate);
    if (!real.startsWith(`${realRoot}${path.sep}`) || !statSync(real).isFile()) return undefined;
    return real;
  } catch { return undefined; }
}

function moduleCodecSource(relative: string): string | undefined {
  const codec = MODULE_CODECS[relative];
  if (!codec) return undefined;
  const file = fileUnder(VENDOR_ROOT, codec.source);
  if (!file) return undefined;
  // Keep UMD export shims local, and retain Emscripten's worker detection in
  // hosts that omit importScripts from module workers. The codec never calls
  // this binding; it only tests whether it is a function.
  return `// Modified by Aura3D: added module bindings and a default export for ESM loading.\nconst module = undefined, exports = undefined, define = undefined;\nconst importScripts = globalThis.importScripts ?? (() => { throw new TypeError("importScripts unavailable"); });\n${readFileSync(file, "utf8")}\nexport default ${codec.name};\n`;
}

export function auraDecodersPlugin(options: AuraDecodersPluginOptions = {}) {
  const selected = new Set<string>(options.codecs ?? CODECS);
  for (const codec of selected) {
    if (!(CODECS as readonly string[]).includes(codec)) throw new Error(`Unknown decoder codec: ${codec}`);
  }
  let deployment = resolveAuraDecodersDeployment("/", options.basePath);
  let outDir = path.resolve("dist");
  let isBuild = false;
  let configIsResolved = false;
  let injectedBase: string | undefined;

  function middleware(root: () => string, workspaceWorker = false): Middleware {
    return (req, res, next) => {
      const request = requestedFile(deployment.basePath, req.url, selected);
      if (request.kind === "other") return next();
      if (req.method !== undefined && req.method !== "GET" && req.method !== "HEAD") {
        res.statusCode = 405; res.setHeader("Allow", "GET, HEAD"); res.end(); return;
      }
      if (request.kind !== "file") {
        res.statusCode = request.kind === "invalid" ? 400 : 404; res.end(); return;
      }
      const worker = request.relative === path.join("basis", "ktx2.worker.js");
      const moduleCodec = root() === VENDOR_ROOT ? moduleCodecSource(request.relative) : undefined;
      if (moduleCodec !== undefined) {
        res.statusCode = 200;
        res.setHeader("Content-Type", request.mime);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.end(req.method === "HEAD" ? undefined : moduleCodec);
        return;
      }
      const file = worker && root() === VENDOR_ROOT ? (existsSync(WORKER_JS) ? WORKER_JS : undefined) : fileUnder(root(), request.relative);
      if (file) {
        res.statusCode = 200;
        res.setHeader("Content-Type", request.mime);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.end(req.method === "HEAD" ? undefined : readFileSync(file));
        return;
      }
      // Workspace development may run directly from TypeScript before the
      // assets package is built. Vite's own transform strips its types.
      if (worker && root() === VENDOR_ROOT && workspaceWorker && existsSync(WORKER_TS)) {
        void compileWorkspaceWorker().then((code) => {
          res.statusCode = 200;
          res.setHeader("Content-Type", request.mime);
          res.setHeader("X-Content-Type-Options", "nosniff");
          res.end(req.method === "HEAD" ? undefined : code);
        }).catch(() => { res.statusCode = 500; res.end(); });
        return;
      }
      res.statusCode = 404; res.end();
    };
  }

  return {
    name: "aura3d-aura-decoders",
    // The normal Vite define handles application and worker builds. The
    // optimizer runs separately and needs the same substitution for installed
    // packages prebundled in development. Both values are build-scoped data,
    // never mutable state on globalThis.
    config: {
      order: "post" as const,
      handler(config: { base?: string; define?: Record<string, unknown>; optimizeDeps?: { esbuildOptions?: { define?: Record<string, string> } } }) {
        const resolved = resolveAuraDecodersDeployment(config.base ?? "/", options.basePath);
        const literal = JSON.stringify(resolved.basePath);
        const existing = config.define?.[DEPLOYMENT_DEFINE];
        const optimized = config.optimizeDeps?.esbuildOptions?.define?.[DEPLOYMENT_DEFINE];
        if ((existing !== undefined && existing !== literal) || (optimized !== undefined && optimized !== literal)) {
          throw new Error("Conflicting Aura3D decoder deployment define");
        }
        injectedBase = resolved.basePath;
        return { define: { [DEPLOYMENT_DEFINE]: literal }, optimizeDeps: { esbuildOptions: { define: { [DEPLOYMENT_DEFINE]: literal } } } };
      }
    },
    configResolved(config: { command?: "build" | "serve"; root?: string; base?: string; build?: { outDir?: string }; define?: Record<string, unknown>; optimizeDeps?: { esbuildOptions?: { define?: Record<string, string> } } }) {
      configIsResolved = false;
      deployment = resolveAuraDecodersDeployment(config.base ?? "/", options.basePath);
      if (injectedBase !== undefined && (injectedBase !== deployment.basePath
        || config.define?.[DEPLOYMENT_DEFINE] !== JSON.stringify(injectedBase)
        || config.optimizeDeps?.esbuildOptions?.define?.[DEPLOYMENT_DEFINE] !== JSON.stringify(injectedBase))) {
        throw new Error("Aura3D decoder deployment changed after configuration; align Vite base and decoder defines");
      }
      isBuild = config.command === "build";
      outDir = path.resolve(config.root ?? process.cwd(), config.build?.outDir ?? "dist");
      configIsResolved = true;
    },
    resolveId(id: string) {
      return id === DEPLOYMENT_MODULE ? RESOLVED_DEPLOYMENT_MODULE : null;
    },
    load(id: string) {
      if (id !== RESOLVED_DEPLOYMENT_MODULE) return null;
      if (!configIsResolved) throw new Error("Aura3D decoder deployment requires resolved Vite configuration");
      // The resolved deployment is shared with the middleware and build copy.
      // Emit a value, not a browser/worker URL inference or global mutation.
      return `export const decoderBasePath = ${JSON.stringify(deployment.basePath)};\n`;
    },
    configureServer(server: { middlewares: MiddlewareStack }) {
      server.middlewares.use(middleware(() => VENDOR_ROOT, true));
    },
    configurePreviewServer(server: { middlewares: MiddlewareStack }) {
      server.middlewares.use(middleware(() => path.join(outDir, deployment.outputPath)));
    },
    async closeBundle() {
      if (!isBuild) return;
      const target = path.join(outDir, deployment.outputPath);
      for (const codec of selected) {
        await cp(path.join(VENDOR_ROOT, codec), path.join(target, codec), { recursive: true });
      }
      for (const [relative, codec] of Object.entries(MODULE_CODECS)) {
        if (!selected.has(relative.split(path.sep)[0]!)) continue;
        const source = moduleCodecSource(relative);
        if (source === undefined) throw new Error(`Missing module decoder source ${codec.source}`);
        await writeFile(path.join(target, relative), source);
      }
      if (selected.has("basis")) {
        const destination = path.join(target, "basis", "ktx2.worker.js");
        if (existsSync(WORKER_JS)) await copyFile(WORKER_JS, destination);
        else await writeFile(destination, await compileWorkspaceWorker());
      }
    }
  };
}

/** Vendored decoder root, also used by non-Vite copy scripts. */
export function auraDecodersVendorRoot(): string { return VENDOR_ROOT; }
