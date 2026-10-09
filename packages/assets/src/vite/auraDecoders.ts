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
import { existsSync, readFileSync } from "node:fs";
import { cp, stat } from "node:fs/promises";
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

export function auraDecodersPlugin(options?: AuraDecodersPluginOptions) {
  const basePath = options?.basePath ?? BASE_PATH;
  let outDir = "dist";
  return {
    name: "aura3d-aura-decoders",
    configResolved(config: { build?: { outDir?: string } }) {
      if (config.build?.outDir) outDir = config.build.outDir;
    },
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string; method?: string }, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b?: unknown) => void }, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0]!;
        if (!url.startsWith(basePath)) return next();
        const rel = decodeURIComponent(url.slice(basePath.length));
        const file = path.normalize(path.join(VENDOR_ROOT, rel));
        if (!file.startsWith(VENDOR_ROOT) || !existsSync(file)) return next();
        res.statusCode = 200;
        res.setHeader("Content-Type", MIME[path.extname(file)] ?? "application/octet-stream");
        res.end(readFileSync(file) as unknown as string);
      });
    },
    async closeBundle() {
      for (const dir of DECODER_DIRS) {
        const from = path.join(VENDOR_ROOT, dir);
        if (!existsSync(from)) continue;
        await cp(from, path.join(outDir, "aura-decoders", dir), { recursive: true });
      }
    }
  };
}

/** Resolves the vendored decoder directory path — exported for tests and
 *  non-vite copy scripts (`assets decoders install`). */
export function auraDecodersVendorRoot(): string {
  return VENDOR_ROOT;
}
