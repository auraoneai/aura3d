/**
 * render-core.ts — the REUSABLE capture + toon-post + encode pipeline, factored out of
 * render-live.ts so the warm render server (#7, render-server.ts) and any future caller
 * can drive it WITHOUT re-launching Vite/Chromium per render.
 *
 * render-live.ts remains the full-fidelity CLI (it keeps the per-frame proof
 * instrumentation: lip-sync A/B, staged-position pixel diffs, AuraVoice handoff record).
 * This module is the lean, parameterized path: given an already-ready Playwright page +
 * a document, it captures a frame range, applies the exact same toon treatment, burns
 * captions, and encodes a webm. Width/height/fps/low-fi are PARAMETERS here (not module
 * env constants), so one warm page can serve preview and full renders interchangeably.
 */

import { createRequire } from "node:module";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";
import { quantizeToonBand } from "@aura3d/rendering";
import { createFfmpegFrameEncoderAdapter } from "@aura3d/engine";
import type { Page } from "@playwright/test";
import type { EpisodeDocument } from "../src/episode-document.js";

export interface RenderProfile {
  readonly width: number;
  readonly height: number;
  readonly frameRate: number;
  readonly lowFi: boolean;
}

/** Standard fidelity profiles (mirrors render-live.ts: full = 960×540@12, low = 480×270@8). */
export function profileFor(lowFi: boolean): RenderProfile {
  return lowFi ? { width: 480, height: 270, frameRate: 8, lowFi: true } : { width: 960, height: 540, frameRate: 12, lowFi: false };
}

// --- sharp (PNG encode/decode) ---
export interface SharpModule {
  (input: Buffer | Uint8Array, options?: { raw: { width: number; height: number; channels: number } }): {
    png(): { toBuffer(): Promise<Buffer> };
  };
}
export function loadSharp(): SharpModule {
  try {
    const require = createRequire(import.meta.url);
    return require("sharp") as SharpModule;
  } catch {
    // Walk up from the render cwd AND from this module's location to find the pnpm
    // store copy of sharp — in the monorepo the template dir has no local sharp, but a
    // parent (repo root) does. This keeps the render working without a per-template install.
    const seeds = [process.cwd(), dirname(fileURLToPath(import.meta.url))];
    for (const seed of seeds) {
      let dir = seed;
      for (let i = 0; i < 8; i++) {
        const storePkg = resolve(dir, "node_modules/.pnpm/sharp@0.33.5/node_modules/sharp/package.json");
        if (existsSync(storePkg)) return createRequire(storePkg)("sharp") as SharpModule;
        const direct = resolve(dir, "node_modules/sharp/package.json");
        if (existsSync(direct)) return createRequire(direct)("sharp") as SharpModule;
        const parent = resolve(dir, "..");
        if (parent === dir) break;
        dir = parent;
      }
    }
    throw new Error("Could not load `sharp`. Install it: pnpm add -D sharp");
  }
}
export const sharp = loadSharp();

export async function rawRgbaToPng(pixels: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  const buffer = await sharp(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength), {
    raw: { width, height, channels: 4 }
  })
    .png()
    .toBuffer();
  return new Uint8Array(buffer);
}

// --- toon post-pass (the single canonical home; render-live.ts imports these) ---
export function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
}
export function aces(x: number): number {
  const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  const y = (x * (a * x + b)) / (x * (c * x + d) + e);
  return y < 0 ? 0 : y > 1 ? 1 : y;
}
export function inkOutline(pixels: Uint8Array, width: number, height: number, threshold: number): Uint8Array {
  const out = new Uint8Array(pixels);
  const lumaAt = (x: number, y: number): number => {
    const i = (y * width + x) * 4;
    return (0.2126 * pixels[i]! + 0.7152 * pixels[i + 1]! + 0.0722 * pixels[i + 2]!) / 255;
  };
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const c = lumaAt(x, y);
      const edge = Math.max(
        Math.abs(c - lumaAt(x - 1, y)), Math.abs(c - lumaAt(x + 1, y)),
        Math.abs(c - lumaAt(x, y - 1)), Math.abs(c - lumaAt(x, y + 1))
      );
      if (edge > threshold) {
        const k = Math.min(1, (edge - threshold) / 0.25);
        const f = 1 - 0.75 * k;
        const i = (y * width + x) * 4;
        out[i] = clampByte(pixels[i]! * f);
        out[i + 1] = clampByte(pixels[i + 1]! * f);
        out[i + 2] = clampByte(pixels[i + 2]! * f);
      }
    }
  }
  return out;
}
export function boxBlur(src: Float32Array, dst: Float32Array, width: number, height: number, radius: number): void {
  const norm = 1 / (radius * 2 + 1);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let sum = 0;
    for (let x = -radius; x <= radius; x += 1) sum += src[row + Math.min(width - 1, Math.max(0, x))]!;
    for (let x = 0; x < width; x += 1) {
      dst[row + x] = sum * norm;
      sum += src[row + Math.min(width - 1, x + radius + 1)]! - src[row + Math.max(0, x - radius)]!;
    }
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = -radius; y <= radius; y += 1) sum += dst[Math.min(height - 1, Math.max(0, y)) * width + x]!;
    for (let y = 0; y < height; y += 1) {
      src[y * width + x] = sum * norm;
      sum += dst[Math.min(height - 1, y + radius + 1) * width + x]! - dst[Math.max(0, y - radius) * width + x]!;
    }
  }
}
export function applyBloom(pixels: Uint8Array, width: number, height: number, options: { threshold: number; intensity: number }): Uint8Array {
  const count = width * height;
  const br = new Float32Array(count), bg = new Float32Array(count), bb = new Float32Array(count);
  const inv = 1 / Math.max(1e-3, 1 - options.threshold);
  for (let p = 0, i = 0; p < count; p += 1, i += 4) {
    const r = pixels[i]! / 255, g = pixels[i + 1]! / 255, b = pixels[i + 2]! / 255;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const w = luma > options.threshold ? (luma - options.threshold) * inv : 0;
    br[p] = r * w; bg[p] = g * w; bb[p] = b * w;
  }
  const accR = new Float32Array(count), accG = new Float32Array(count), accB = new Float32Array(count);
  const scratch = new Float32Array(count);
  for (const radius of [3, 7, 15]) {
    const tr = br.slice(), tg = bg.slice(), tb = bb.slice();
    boxBlur(tr, scratch, width, height, radius);
    boxBlur(tg, scratch, width, height, radius);
    boxBlur(tb, scratch, width, height, radius);
    for (let p = 0; p < count; p += 1) { accR[p] += tr[p]!; accG[p] += tg[p]!; accB[p] += tb[p]!; }
  }
  const k = (options.intensity / 3) * 1.6;
  const out = new Uint8Array(pixels.length);
  const base = (c: number, add: number): number => {
    const bn = c / 255, an = Math.min(1, add * k);
    return clampByte((1 - (1 - bn) * (1 - an)) * 255);
  };
  for (let p = 0, i = 0; p < count; p += 1, i += 4) {
    out[i] = base(pixels[i]!, accR[p]!);
    out[i + 1] = base(pixels[i + 1]!, accG[p]!);
    out[i + 2] = base(pixels[i + 2]!, accB[p]!);
    out[i + 3] = pixels[i + 3]!;
  }
  return out;
}
export function applyVignette(pixels: Uint8Array, width: number, height: number, strength: number): Uint8Array {
  const out = new Uint8Array(pixels);
  const cx = width / 2, cy = height / 2, maxD = Math.hypot(cx, cy);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const d = Math.hypot(x - cx, y - cy) / maxD;
      const t = Math.max(0, (d - 0.6) / 0.4);
      const factor = 1 - strength * (t * t * (3 - 2 * t));
      const i = (y * width + x) * 4;
      out[i] = clampByte(pixels[i]! * factor);
      out[i + 1] = clampByte(pixels[i + 1]! * factor);
      out[i + 2] = clampByte(pixels[i + 2]! * factor);
    }
  }
  return out;
}
/** Render style: "toon" = the (tuned) cel look; "pbr" = realistic (skip cel quantize + ink outline). */
export type RenderStyle = "toon" | "pbr";

/** Resolve the effective style: explicit arg wins, else AURA_RENDER_STYLE env, else "toon". */
export function resolveRenderStyle(style?: RenderStyle): RenderStyle {
  if (style === "toon" || style === "pbr") return style;
  const env = (process.env.AURA_RENDER_STYLE ?? "").trim().toLowerCase();
  return env === "pbr" ? "pbr" : "toon";
}

export function applyToonTreatment(
  pixels: Uint8Array,
  width: number,
  height: number,
  lowFi: boolean,
  style?: RenderStyle
): Uint8Array {
  const effectiveStyle = resolveRenderStyle(style);
  // --- tone map + (optional) cel banding + saturation grade ---
  // toon: more bands + a lighter cel-mix so the asset's real texture survives the quantize;
  // pbr: no quantize at all — just the ACES grade so realistic assets read realistically.
  const bands = 8, celMix = 0.32;
  const useCel = effectiveStyle === "toon";
  const toned = new Uint8Array(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    const r = aces(pixels[i]! / 255), g = aces(pixels[i + 1]! / 255), b = aces(pixels[i + 2]! / 255);
    let cr = r, cg = g, cb = b;
    if (useCel) {
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const q = quantizeToonBand(luma, bands);
      const scale = luma > 1e-4 ? q / luma : q;
      cr = (1 - celMix) * r + celMix * r * scale;
      cg = (1 - celMix) * g + celMix * g * scale;
      cb = (1 - celMix) * b + celMix * b * scale;
    }
    const l = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;
    // gentle saturation lift for both styles (toon a touch warmer than pbr)
    const sat = useCel ? 1.08 : 1.04;
    cr = l + (cr - l) * sat; cg = l + (cg - l) * sat; cb = l + (cb - l) * sat;
    toned[i] = clampByte(cr * 255); toned[i + 1] = clampByte(cg * 255); toned[i + 2] = clampByte(cb * 255);
    toned[i + 3] = pixels[i + 3]!;
  }
  // ink outline only for the cel look; pbr keeps clean edges.
  const outlined = useCel ? inkOutline(toned, width, height, 0.42) : toned;
  // bloom that halos genuine highlights without flattening color (higher threshold, lower intensity).
  const bloomed = lowFi ? outlined : applyBloom(outlined, width, height, { threshold: 0.82, intensity: 0.45 });
  // softer vignette so corners aren't crushed.
  return applyVignette(bloomed, width, height, 0.18);
}

export async function compositeCaptionPng(png: Uint8Array, text: string, width: number, height: number): Promise<Uint8Array> {
  const t = (text ?? "").trim();
  if (!t) return png;
  const wrap = (s: string, max = 38): string[] => {
    const words = s.split(/\s+/); const out: string[] = []; let cur = "";
    for (const w of words) { if ((`${cur} ${w}`).trim().length > max && cur) { out.push(cur); cur = w; } else cur = `${cur} ${w}`.trim(); }
    if (cur) out.push(cur); return out;
  };
  const lines = t.split(/\r?\n/).flatMap((s) => wrap(s.trim())).filter(Boolean);
  const fontPx = Math.round(height * 0.05);
  const lineH = Math.round(fontPx * 1.22);
  const bottomMargin = Math.round(height * 0.06);
  const totalH = lines.length * lineH;
  const cx = width / 2;
  const firstBaseline = height - bottomMargin - totalH + fontPx;
  const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const tspans = lines.map((ln, i) => `<tspan x="${cx}" y="${firstBaseline + i * lineH}">${esc(ln)}</tspan>`).join("");
  const stroke = Math.max(3, Math.round(fontPx * 0.18));
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <text text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${fontPx}" font-weight="700" fill="#ffffff" stroke="rgba(8,10,18,0.92)" stroke-width="${stroke}" stroke-linejoin="round" paint-order="stroke">${tspans}</text>
</svg>`;
  const sharpAny = sharp as unknown as (input: Buffer) => { composite(items: { input: Buffer }[]): { png(): { toBuffer(): Promise<Buffer> } } };
  const out = await sharpAny(Buffer.from(png)).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
  return new Uint8Array(out);
}

/** Seek the route at `time` and read back the canvas as raw RGBA, plus the seek proof. */
export async function seekAndReadPixels(page: Page, time: number, width: number, height: number): Promise<{ proof: { caption?: { text?: string }; shot?: { shotId?: string } }; raw: Uint8Array }> {
  const result = await page.evaluate(
    ({ t, w, h }) => {
      const win = window as unknown as { __auraSeek__: (time: number) => unknown };
      const proof = win.__auraSeek__(t);
      const canvas = document.querySelector("#live-canvas") as HTMLCanvasElement;
      const copy = document.createElement("canvas");
      copy.width = w; copy.height = h;
      copy.getContext("2d")!.drawImage(canvas, 0, 0, w, h);
      return { proof, dataUrl: copy.toDataURL("image/png") };
    },
    { t: time, w: width, h: height }
  );
  const b64 = result.dataUrl.slice(result.dataUrl.indexOf(",") + 1);
  const decoded = await (sharp as unknown as (b: Buffer) => { ensureAlpha(): { raw(): { toBuffer(o: { resolveWithObject: true }): Promise<{ data: Buffer }> } } })(Buffer.from(b64, "base64"))
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    proof: result.proof as { caption?: { text?: string }; shot?: { shotId?: string } },
    raw: new Uint8Array(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength)
  };
}

export interface RangeResult {
  readonly frameCount: number;
  readonly video: string;
  readonly framesDir: string;
  readonly firstSec: number;
  readonly lastSec: number;
  readonly profile: RenderProfile;
}

/**
 * Capture [firstSec, lastSec) of an already-ready page, toon-treat + caption every frame,
 * and encode a webm into `outDir`. The page must already have the target document mounted
 * (the route's __auraSeek__ hook ready). Returns the output paths + frame count.
 */
export async function renderRange(
  page: Page,
  opts: { document: EpisodeDocument; firstSec: number; lastSec: number; profile: RenderProfile; outDir: string }
): Promise<RangeResult> {
  const { width, height, frameRate, lowFi } = opts.profile;
  const framesDir = resolve(opts.outDir, "frames");
  mkdirSync(framesDir, { recursive: true });
  const firstFrame = Math.max(0, Math.round(opts.firstSec * frameRate));
  const lastFrame = Math.min(Math.round(opts.document.duration * frameRate), Math.round(opts.lastSec * frameRate));

  const frames: { time: number; png: Uint8Array }[] = [];
  for (let i = firstFrame; i < lastFrame; i += 1) {
    const t = i / frameRate;
    const { proof, raw } = await seekAndReadPixels(page, t, width, height);
    const capText = (proof.caption?.text ?? "").trim();
    const treated = applyToonTreatment(raw, width, height, lowFi);
    const basePng = await rawRgbaToPng(treated, width, height);
    const png = await compositeCaptionPng(basePng, capText, width, height);
    frames.push({ time: t, png });
  }
  if (frames.length === 0) throw new Error("renderRange captured no frames.");
  writeFileSync(resolve(framesDir, "first.png"), frames[0]!.png);
  writeFileSync(resolve(framesDir, "final.png"), frames[frames.length - 1]!.png);

  const encoder = await createFfmpegFrameEncoderAdapter({ codec: "vp9", container: "webm", frameRate });
  for (let index = 0; index < frames.length; index += 1) {
    encoder.encode({ frame: index, time: frames[index]!.time, viewport: { width, height }, image: frames[index]!.png });
  }
  const finalized = await encoder.finalize({
    codec: "vp9", container: "webm", mimeType: "video/webm; codecs=vp9", frameRate,
    viewport: { width, height }, frameCount: frames.length, duration: frames.length / frameRate, byteLength: 0, chunks: []
  });
  if (!(finalized instanceof Uint8Array) || finalized.byteLength === 0) throw new Error("ffmpeg produced no video bytes.");
  const videoPath = resolve(opts.outDir, "episode-3d.webm");
  writeFileSync(videoPath, finalized);
  return { frameCount: frames.length, video: videoPath, framesDir, firstSec: opts.firstSec, lastSec: opts.lastSec, profile: opts.profile };
}

/** Start a Vite dev server rooted at the template, aliasing @aura3d/* to the in-repo dist build. */
export async function startWarmVite(templateRoot: string, monorepoRoot: string): Promise<ViteDevServer> {
  const DIST = (p: string): string => resolve(monorepoRoot, "dist", p);
  const distBuildExists = existsSync(DIST("engine/advanced-runtime/index.js"));
  const server = await createServer({
    root: templateRoot,
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
    server: { host: "127.0.0.1", port: 0, hmr: false },
    logLevel: "warn"
  });
  await server.listen();
  return server;
}
