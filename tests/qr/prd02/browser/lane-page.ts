/**
 * Lane prd02 pixel-spec helper (PRD-02 §15). Serves the lane bundle built by
 * `vite build --config benchmarks/quality-rebuild/scenes/prd02/vite.lane.config.ts`
 * (the lighting-quality browser job builds it first), renders `lane.html`
 * scenes in the spec's own Playwright page and decodes the #stage screenshot
 * into an RGBA `PixelBuffer` for the §16.4 region metrics.
 *
 * A missing bundle or a scene that never publishes READY throws — there is no
 * skip path (P-06: a broken spec must turn the job red).
 */
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import type { Page } from "@playwright/test";
import sharp from "sharp";
import type { PixelBuffer } from "../../../../benchmarks/quality-rebuild/scenes/prd02/masks";

const DIST = resolve(process.env.QR_PRD02_DIST ?? "benchmarks/quality-rebuild/scenes/prd02/dist");
const READY_TIMEOUT_MS = Number(process.env.QR_PRD02_READY_TIMEOUT_MS ?? 240_000);

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".hdr": "application/octet-stream",
  ".ktx2": "application/octet-stream",
  ".glb": "model/gltf-binary",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".map": "application/json"
};

export interface LaneServer {
  readonly origin: string;
  close(): Promise<void>;
}

/** Static server over the lane bundle (same routing as capture-lane.ts). */
export async function startLaneServer(): Promise<LaneServer> {
  if (!existsSync(join(DIST, "scenes/prd02/lane.html"))) {
    throw new Error(
      `prd02 lane bundle missing at ${DIST}: run 'pnpm exec vite build --config benchmarks/quality-rebuild/scenes/prd02/vite.lane.config.ts' first`
    );
  }
  const server: Server = createServer((request, response) => {
    const pathname = decodeURIComponent((request.url ?? "/").split("?")[0] ?? "/");
    const file = join(DIST, pathname === "/" ? "scenes/prd02/lane.html" : pathname);
    if (!file.startsWith(DIST) || !existsSync(file)) {
      response.statusCode = 404;
      response.end("not found");
      return;
    }
    response.setHeader("Content-Type", MIME[extname(file)] ?? "application/octet-stream");
    response.end(readFileSync(file));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((done) => server.close(() => done()))
  };
}

export interface LaneCaptureOptions {
  readonly scene: string;
  readonly engine?: "aura3d" | "three";
  /** `a3d-qr` value: "none" = flag off, "lighting" = A3D_QR_LIGHTING on. */
  readonly flags: string;
  /** Broken control from `scenes/prd02/controls.ts`. */
  readonly control?: string;
}

export interface LaneCapture {
  readonly pixels: PixelBuffer;
  readonly payload: unknown;
}

/** Render one lane scene and return its decoded #stage pixels (1280×720). */
export async function captureLaneScene(page: Page, server: LaneServer, options: LaneCaptureOptions): Promise<LaneCapture> {
  const engine = options.engine ?? "aura3d";
  const query = new URLSearchParams({ engine, scene: options.scene, "a3d-qr": options.flags });
  if (options.control) query.set("control", options.control);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${server.origin}/scenes/prd02/lane.html?${query.toString()}`, { waitUntil: "load", timeout: 60_000 });
  // String predicates: esbuild's `__name` helper must not leak into the page.
  await page.waitForFunction("Boolean(window.__QR_READY__ || window.__QR_ERROR__)", undefined, {
    timeout: READY_TIMEOUT_MS,
    polling: 250
  });
  const state = (await page.evaluate("({ ready: window.__QR_READY__ ?? null, error: window.__QR_ERROR__ ?? null })")) as {
    ready: unknown;
    error: unknown;
  };
  if (state.error) {
    throw new Error(`${options.scene}/${engine} (a3d-qr=${options.flags}${options.control ? `, ${options.control}` : ""}) failed: ${JSON.stringify(state.error).slice(0, 2000)}`);
  }
  const png = await page.locator("#stage").screenshot({ animations: "disabled", timeout: 30_000 });
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    pixels: { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength) },
    payload: state.ready
  };
}
