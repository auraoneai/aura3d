/**
 * auraDecodersPlugin — F-05-04 (05-PKG): copies
 * `packages/assets/vendor/{basis,draco,meshopt}` to `<outDir>/aura-decoders/`
 * in app builds and serves the same tree under `/aura-decoders/` in dev, so
 * the C-16 decoder registry's same-origin `basePath` resolves with the
 * correct MIME types (`application/wasm` for `.wasm`) — no CDN, no
 * `public/` copy step required in the consuming app.
 *
 * Usage in a scaffolded template or app `vite.config.ts`:
 *
 *   import { auraDecodersPlugin } from "@aura3d/assets/vite";
 *   export default defineConfig({ plugins: [auraDecodersPlugin()] });
 *
 * Vendor tree is resolved relative to this module (`../../vendor/`):
 * `packages/assets/vendor/` in the repo, `<pkg>/vendor/` when installed
 * from the published tarball.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const VENDOR_ROOT = fileURLToPath(new URL("../../vendor", import.meta.url));
const DECODER_DIRS = ["basis", "draco", "meshopt"] as const;
const BASE_PATH = "/aura-decoders/";

const MIME: Record<string, string> = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".cjs": "text/javascript",
  ".wasm": "application/wasm",
  ".json": "application/json",
  ".md": "text/markdown"
};

export interface AuraDecodersPluginOptions {
  /** URL prefix the registry's `decoders.basePath` uses. Default `/aura-decoders/`. */
  readonly basePath?: string;
}

/** Vendored file for a dev-server URL under `basePath`, or null (not ours / not a file / escapes the vendor root). */
function vendorFileForUrl(basePath: string, rawUrl: string | undefined): string | null {
  const url = (rawUrl ?? "").split("?")[0]!;
  if (!url.startsWith(basePath)) return null;
  let rel: string;
  try {
    rel = decodeURIComponent(url.slice(basePath.length));
  } catch {
    return null; // malformed %-escape: not a vendored file
  }
  const file = path.resolve(VENDOR_ROOT, rel);
  if (!file.startsWith(VENDOR_ROOT + path.sep)) return null;
  if (!existsSync(file) || !statSync(file).isFile()) return null;
  return file;
}

export function auraDecodersPlugin(options?: AuraDecodersPluginOptions) {
  const basePath = options?.basePath ?? BASE_PATH;
  let outDir = path.resolve("dist");
  let isBuild = false;
  return {
    name: "aura3d-aura-decoders",
    configResolved(config: { command?: "build" | "serve"; root?: string; build?: { outDir?: string } }) {
      isBuild = config.command === "build";
      outDir = path.resolve(config.root ?? process.cwd(), config.build?.outDir ?? "dist");
    },
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string; method?: string }, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b?: unknown) => void }, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        const file = vendorFileForUrl(basePath, req.url);
        if (!file) return next();
        res.statusCode = 200;
        res.setHeader("Content-Type", MIME[path.extname(file)] ?? "application/octet-stream");
        res.end(readFileSync(file) as unknown as string);
      });
    },
    async closeBundle() {
      // Vite also calls closeBundle when a dev server shuts down; copy only for builds.
      if (!isBuild) return;
      // No existence skip: a missing vendor family must fail the build, not ship
      // an app whose decoders 404 at runtime.
      for (const dir of DECODER_DIRS) {
        await cp(path.join(VENDOR_ROOT, dir), path.join(outDir, "aura-decoders", dir), { recursive: true });
      }
    }
  };
}

/** Resolves the vendored decoder directory path — exported for tests and
 *  non-vite copy scripts (`assets decoders install`). */
export function auraDecodersVendorRoot(): string {
  return VENDOR_ROOT;
}
