/**
 * render-live.ts — headless capture + toon post-pass + real video encode for the
 * Cartoon Studio LIVE 3D render route (`src/render-live-route.ts`).
 *
 * Pipeline (every stage touches real bytes — nothing is faked):
 *  1. Serve the `live-route.html` route with a real Vite dev server.
 *  2. Drive it with Playwright (Chromium, WebGL2). Wait for the route's
 *     `__AURA_LIVE_ROUTE_READY__` proof, then call its `__auraSeek__(time)` hook
 *     at N distinct animation times. Each seek poses BOTH skinned GLB skeletons
 *     and renders one frame; we read the canvas back as raw RGBA pixels
 *     (gl.readPixels via a 2D copy → ImageData), so the captured bytes are the
 *     actual rendered, skinned characters.
 *  3. Apply the REAL toon treatment from `@aura3d/rendering` (monorepo source):
 *     - band-quantize each pixel's luma with `quantizeToonBand` (the exact cel
 *       math the CartoonToonMaterial GLSL mirrors), giving posterized shading,
 *     - run the Sobel `outlinePixels` ink pass + `colorGradePixels` storybook
 *       grade that `applyCartoonRenderPreset` prescribes.
 *  4. Save the 4 representative frames as PNGs named for the fidelity gate
 *     (first/dialogue/action/final) AND encode ALL frames into a real
 *     `episode-3d.webm` via `createFfmpegFrameEncoderAdapter` (libvpx-vp9).
 *
 * IMPORTANT — run this from the MONOREPO ROOT so `@aura3d/rendering` /
 * `@aura3d/engine` resolve to the SOURCE build (which ships CartoonToonMaterial +
 * the cartoon shader/post-passes). The template's own published `@aura3d/engine`
 * lacks those exports; the in-browser route only needs the renderer + skinning,
 * which the published build DOES have. Invoke as:
 *   pnpm exec tsx --tsconfig tsconfig.base.json \
 *     packages/create-aura3d/templates/cartoon-studio/scripts/render-live.ts
 */

import { createRequire } from "node:module";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import {
  applyCartoonRenderPreset,
  createCartoonRenderPreset,
  quantizeToonBand
} from "@aura3d/rendering";
import { createFfmpegFrameEncoderAdapter } from "@aura3d/engine";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = resolve(__dirname, "..");
const OUTPUT_DIR = resolve(TEMPLATE_ROOT, "dist/episodes/live-3d");
const FRAMES_DIR = resolve(OUTPUT_DIR, "frames");
const VIDEO_PATH = resolve(OUTPUT_DIR, "episode-3d.webm");

const WIDTH = 960;
const HEIGHT = 540;
const FRAME_RATE = 12;

// 12 captured frames spanning >1s of each clip so the skeletons clearly move.
// The 4 fidelity-gate frame IDs map onto a spread of these capture times.
const CAPTURE_TIMES = [0, 0.12, 0.25, 0.4, 0.55, 0.7, 0.85, 1.0, 1.2, 1.45, 1.7, 2.0];
const FIDELITY_FRAME_IDS = ["first", "dialogue", "action", "final"] as const;
// Pick spread-out capture indices for the gate's 4 named frames.
const FIDELITY_CAPTURE_INDEX: Record<(typeof FIDELITY_FRAME_IDS)[number], number> = {
  first: 0,
  dialogue: 3,
  action: 7,
  final: 11
};

interface SharpModule {
  (input: Buffer | Uint8Array, options?: { raw: { width: number; height: number; channels: number } }): {
    png(): { toBuffer(): Promise<Buffer> };
  };
}

function loadSharp(): SharpModule {
  try {
    const require = createRequire(import.meta.url);
    return require("sharp") as SharpModule;
  } catch {
    const storePkg = resolve(process.cwd(), "node_modules/.pnpm/sharp@0.33.5/node_modules/sharp/package.json");
    if (existsSync(storePkg)) {
      const require = createRequire(storePkg);
      return require("sharp") as SharpModule;
    }
    throw new Error("Could not load `sharp` to encode PNGs. Install it: pnpm add -D sharp");
  }
}

const sharp = loadSharp();

async function rawRgbaToPng(pixels: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  const buffer = await sharp(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength), {
    raw: { width, height, channels: 4 }
  })
    .png()
    .toBuffer();
  return new Uint8Array(buffer);
}

/**
 * Band-quantize each pixel toward the cel ramp using the engine's exact
 * `quantizeToonBand` math, then let `applyCartoonRenderPreset` ink the edges and
 * grade the result. Returns the final toon-treated RGBA buffer.
 */
function applyToonTreatment(pixels: Uint8Array, width: number, height: number): {
  readonly pixels: Uint8Array;
  readonly bands: number;
  readonly outline: boolean;
  readonly colorGrade: boolean;
} {
  const preset = createCartoonRenderPreset({
    name: "live-3d-toon",
    resolution: { width, height },
    materialStyle: { rampSteps: 4, outline: true, treatment: "cel", saturationBoost: 0.18 }
  });
  const bands = Math.max(2, Math.min(16, Math.round(preset.materialStyle.rampSteps)));

  // 1. Cel band-quantization on luma (the CartoonToonMaterial ramp), preserving hue.
  const banded = new Uint8Array(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]! / 255;
    const g = pixels[i + 1]! / 255;
    const b = pixels[i + 2]! / 255;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const quantized = quantizeToonBand(luma, bands);
    const scale = luma > 1e-4 ? quantized / luma : quantized;
    banded[i] = clampByte(r * scale * 255);
    banded[i + 1] = clampByte(g * scale * 255);
    banded[i + 2] = clampByte(b * scale * 255);
    banded[i + 3] = pixels[i + 3]!;
  }

  // 2. Outline + storybook color grade via the real preset post-passes.
  const applied = applyCartoonRenderPreset(preset, {
    frame: { pixels: banded, width, height }
  });
  const out = applied.colorGrade?.pixels ?? applied.outline?.pixels ?? banded;
  return {
    pixels: out instanceof Uint8Array ? out : new Uint8Array(out),
    bands,
    outline: applied.appliedToPixels.outline,
    colorGrade: applied.appliedToPixels.colorGrade
  };
}

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
}

// Monorepo root (…/aura3d). Resolved from this script's location so the dev
// server can alias `@aura3d/*` to the freshly-built `dist/` (same approach the
// working aura-clash showcase uses). The template's own published `@aura3d/engine`
// (v1.1.0) has a stricter/older material binder that rejects unbound PBR env-map
// textures, so we resolve the in-repo build that the renderer is validated against.
const MONOREPO_ROOT = resolve(TEMPLATE_ROOT, "../../../..");
const DIST = (p: string): string => resolve(MONOREPO_ROOT, "dist", p);

async function startViteServer(): Promise<ViteDevServer> {
  const distBuildExists = existsSync(DIST("engine/advanced-runtime/index.js"));
  const server = await createServer({
    root: TEMPLATE_ROOT,
    configFile: false,
    ...(distBuildExists
      ? {
          resolve: {
            alias: [
              { find: /^@aura3d\/engine$/, replacement: DIST("engine/agent-api/index.js") },
              { find: /^@aura3d\/engine\/advanced-runtime$/, replacement: DIST("engine/advanced-runtime/index.js") },
              { find: /^@aura3d\/engine\/production-runtime$/, replacement: DIST("engine/production-runtime/index.js") },
              { find: /^@aura3d\/engine\/assets\/browser$/, replacement: DIST("assets/browser-index.js") },
              { find: /^@aura3d\/engine\/rendering$/, replacement: DIST("rendering/index.js") },
              { find: /^@aura3d\/engine\/scene$/, replacement: DIST("scene/index.js") },
              { find: /^@aura3d\/rendering$/, replacement: DIST("rendering/index.js") },
              { find: /^@aura3d\/scene$/, replacement: DIST("scene/index.js") },
              { find: /^@aura3d\/assets\/browser$/, replacement: DIST("assets/browser-index.js") }
            ]
          }
        }
      : {}),
    server: { host: "127.0.0.1", port: 0 },
    logLevel: "warn"
  });
  await server.listen();
  return server;
}

interface CapturedFrame {
  readonly time: number;
  readonly raw: Uint8Array;
}

async function main(): Promise<void> {
  mkdirSync(FRAMES_DIR, { recursive: true });

  const server = await startViteServer();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") {
    throw new Error("Vite dev server did not expose a numeric port.");
  }
  const url = `http://127.0.0.1:${address.port}/live-route.html`;
  console.log(`vite dev server: ${url}`);

  const browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swdecoder", "--ignore-gpu-blocklist"]
  });
  const captured: CapturedFrame[] = [];
  let readyProof: unknown;
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH + 40, height: HEIGHT + 40 }, deviceScaleFactor: 1 });
    page.on("console", (msg) => {
      if (msg.type() === "error") console.error(`[page] ${msg.text()}`);
    });
    page.on("pageerror", (err) => console.error(`[pageerror] ${err.message}`));

    await page.addInitScript(() => {
      (window as unknown as { __AURA_LIVE_ROUTE_HEADLESS__: boolean }).__AURA_LIVE_ROUTE_HEADLESS__ = true;
    });
    await page.goto(url, { waitUntil: "load", timeout: 60_000 });

    // Wait until the route has loaded both skinned GLBs and exposed the seek hook.
    await page.waitForFunction(
      () => {
        const w = window as unknown as { __AURA_LIVE_ROUTE_READY__?: unknown; __AURA_LIVE_ROUTE_ERROR__?: string };
        if (w.__AURA_LIVE_ROUTE_ERROR__) throw new Error(`route error: ${w.__AURA_LIVE_ROUTE_ERROR__}`);
        return Boolean(w.__AURA_LIVE_ROUTE_READY__);
      },
      { timeout: 60_000 }
    );
    readyProof = await page.evaluate(() => (window as unknown as { __AURA_LIVE_ROUTE_READY__: unknown }).__AURA_LIVE_ROUTE_READY__);
    console.log("route ready:", JSON.stringify(readyProof));

    for (const time of CAPTURE_TIMES) {
      const result = await page.evaluate(
        ({ t, w, h }) => {
          const win = window as unknown as {
            __auraSeek__: (time: number) => unknown;
            __AURA_LIVE_SEEK_LAST__?: unknown;
          };
          const proof = win.__auraSeek__(t);
          win.__AURA_LIVE_SEEK_LAST__ = proof;
          const canvas = document.querySelector("#live-canvas") as HTMLCanvasElement;
          // Copy the WebGL canvas into a 2D canvas to read back stable RGBA bytes.
          const copy = document.createElement("canvas");
          copy.width = w;
          copy.height = h;
          const ctx = copy.getContext("2d")!;
          ctx.drawImage(canvas, 0, 0, w, h);
          const data = ctx.getImageData(0, 0, w, h).data;
          return { proof, pixels: Array.from(data) };
        },
        { t: time, w: WIDTH, h: HEIGHT }
      );
      const raw = Uint8Array.from(result.pixels as number[]);
      captured.push({ time, raw });
      const proof = result.proof as { drawCalls: number; skinnedRenderItems: number };
      console.log(`captured t=${time.toFixed(2)}s drawCalls=${proof.drawCalls} skinnedItems=${proof.skinnedRenderItems}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }

  if (captured.length === 0) throw new Error("No frames were captured.");

  // Toon-treat every frame; save the 4 fidelity-gate PNGs; collect PNG bytes for video.
  const encoder = await createFfmpegFrameEncoderAdapter({ codec: "vp9", container: "webm", frameRate: FRAME_RATE });
  let toonInfo = { bands: 0, outline: false, colorGrade: false };
  const fidelityByIndex = new Map<number, (typeof FIDELITY_FRAME_IDS)[number]>();
  for (const id of FIDELITY_FRAME_IDS) fidelityByIndex.set(FIDELITY_CAPTURE_INDEX[id], id);

  for (let index = 0; index < captured.length; index += 1) {
    const frame = captured[index]!;
    const treated = applyToonTreatment(frame.raw, WIDTH, HEIGHT);
    toonInfo = { bands: treated.bands, outline: treated.outline, colorGrade: treated.colorGrade };
    const png = await rawRgbaToPng(treated.pixels, WIDTH, HEIGHT);

    const fidelityId = fidelityByIndex.get(index);
    if (fidelityId) {
      writeFileSync(resolve(FRAMES_DIR, `${fidelityId}.png`), png);
    }

    encoder.encode({
      frame: index,
      time: frame.time,
      viewport: { width: WIDTH, height: HEIGHT },
      image: png
    });
  }

  const durationSeconds = captured.length / FRAME_RATE;
  const finalized = await encoder.finalize({
    codec: "vp9",
    container: "webm",
    mimeType: "video/webm; codecs=vp9",
    frameRate: FRAME_RATE,
    viewport: { width: WIDTH, height: HEIGHT },
    frameCount: captured.length,
    duration: durationSeconds,
    byteLength: 0,
    chunks: []
  });
  if (!(finalized instanceof Uint8Array) || finalized.byteLength === 0) {
    throw new Error(`ffmpeg produced no usable video bytes (got ${typeof finalized}).`);
  }
  const video = finalized;
  writeFileSync(VIDEO_PATH, video);

  const summary = {
    kind: "cartoon-studio-live-3d-render",
    route: "live-route.html",
    framesDir: FRAMES_DIR,
    video: VIDEO_PATH,
    videoBytes: video.byteLength,
    frameRate: FRAME_RATE,
    captureTimes: CAPTURE_TIMES,
    toon: toonInfo,
    ready: readyProof
  };
  writeFileSync(resolve(OUTPUT_DIR, "render-live-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

  console.log("\n--- render-live complete ---");
  console.log(`frames dir: ${FRAMES_DIR}`);
  console.log(`fidelity PNGs: ${FIDELITY_FRAME_IDS.map((id) => `${id}.png`).join(", ")}`);
  console.log(`video: ${VIDEO_PATH} (${video.byteLength} bytes)`);
  console.log(`toon: bands=${toonInfo.bands} outline=${toonInfo.outline} colorGrade=${toonInfo.colorGrade}`);
}

main().catch((error: unknown) => {
  console.error("render-live failed:", error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
