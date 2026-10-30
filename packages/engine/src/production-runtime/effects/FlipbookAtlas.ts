// PRD-07 §6.2 (`flipbook-sprite`: "without `texture`, `fireball` sequence") —
// built-in procedural fireball sheet. Deterministic per (columns, rows, seed):
// `columns*rows` frames of nine seeded radial blobs that expand, rise and cool
// from a bright core into a dissipating puff. Rasterised on the CPU (no canvas)
// with source-over compositing of piecewise-linear radial gradients, so it
// runs in workers and tests. Output is RGBA8, sRGB-encoded, straight alpha,
// rows bottom-up (GL upload order: v = 0 is the last image row), frame 0 in
// the top-left cell — the particle program's `u_grid` lookup convention.

import { Texture } from "@aura3d/rendering";
import type { AuraVfxBuiltinSequence } from "../../agent-api/vfx/atlas";
import { mulberry32 } from "./CpuEmitter";

export interface FlipbookSheet {
  readonly width: number;
  readonly height: number;
  readonly columns: number;
  readonly rows: number;
  readonly data: Uint8Array;
}

const CELL = 128;
const cache = new Map<string, FlipbookSheet>();

/** Built-in `fireball` sheet for a grid and seed (cached; same inputs → same bytes). */
export function proceduralFireballSheet(columns: number, rows: number, seed: number): FlipbookSheet {
  const cols = Math.max(1, Math.floor(columns));
  const rws = Math.max(1, Math.floor(rows));
  const key = `${cols}x${rws}:${seed >>> 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const width = cols * CELL;
  const height = rws * CELL;
  // Premultiplied float accumulation in image order (row 0 = top).
  const premul = new Float32Array(width * height * 4);
  const next = mulberry32(seed);
  const blobs = Array.from({ length: 9 }, () => ({ x: (next() - 0.5) * 0.5, y: (next() - 0.5) * 0.5, r: 0.35 + next() * 0.45, j: next() }));
  const frames = cols * rws;
  for (let frame = 0; frame < frames; frame += 1) {
    const t = frame / Math.max(1, frames - 1);
    const ox = (frame % cols) * CELL;
    const oy = Math.floor(frame / cols) * CELL;
    const heat = Math.max(0, 1 - t * 1.4);
    // sRGB-space blob colour (canvas semantics), normalised.
    const cr = 1;
    const cg = Math.round(140 + 80 * (1 - heat)) / 255;
    const cb = Math.round(50 + 130 * (1 - heat)) / 255;
    for (const blob of blobs) {
      const grow = 0.25 + t * 1.3;
      const bx = CELL * 0.5 + blob.x * CELL * (0.2 + t * 0.7);
      const by = CELL * 0.5 + blob.y * CELL * (0.2 + t * 0.7) - t * CELL * 0.12;
      const br = blob.r * CELL * grow * 0.5;
      const alpha0 = Math.max(0, (1 - t) * (0.85 + blob.j * 0.15));
      if (alpha0 <= 0 || br <= 0) continue;
      const x0 = Math.max(0, Math.floor(bx - br));
      const x1 = Math.min(CELL - 1, Math.ceil(bx + br));
      const y0 = Math.max(0, Math.floor(by - br));
      const y1 = Math.min(CELL - 1, Math.ceil(by + br));
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const d = Math.hypot(x + 0.5 - bx, y + 0.5 - by) / br;
          if (d >= 1) continue;
          // Stops: 0 → α0, 0.6 → 0.45·α0, 1 → 0 (linear between stops).
          const a = d < 0.6 ? alpha0 * (1 - (0.55 * d) / 0.6) : alpha0 * 0.45 * ((1 - d) / 0.4);
          const o = ((oy + y) * width + ox + x) * 4;
          const k = 1 - a;
          premul[o] = cr * a + premul[o] * k;
          premul[o + 1] = cg * a + premul[o + 1] * k;
          premul[o + 2] = cb * a + premul[o + 2] * k;
          premul[o + 3] = a + premul[o + 3] * k;
        }
      }
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const src = y * width * 4;
    const dst = (height - 1 - y) * width * 4; // bottom-up for the GL upload
    for (let x = 0; x < width * 4; x += 4) {
      const a = premul[src + x + 3];
      const inv = a > 1e-6 ? 1 / a : 0;
      data[dst + x] = Math.round(Math.min(1, premul[src + x] * inv) * 255);
      data[dst + x + 1] = Math.round(Math.min(1, premul[src + x + 1] * inv) * 255);
      data[dst + x + 2] = Math.round(Math.min(1, premul[src + x + 2] * inv) * 255);
      data[dst + x + 3] = Math.round(Math.min(1, a) * 255);
    }
  }
  const sheet: FlipbookSheet = { width, height, columns: cols, rows: rws, data };
  cache.set(key, sheet);
  return sheet;
}

// ---------------------------------------------------------------------------
// GU47 E-F: built-in atlas sprites (`sprite: "smoke-a"` on an emitter) and
// texture-asset sheets (`sprite: { atlas }`, `effects.flipbook({ texture })`).
// ---------------------------------------------------------------------------

/** One built-in sequence on the baked VFX page: pixel rect on the 2048 page, frame grid and playback. */
export interface VfxSpriteLayout {
  readonly rect: readonly [number, number, number, number];
  readonly columns: number;
  readonly rows: number;
  readonly frames: number;
  /** Frames per second for looping sequences; absent on single-frame sprites. */
  readonly fps?: number;
  /** Wrap at the last frame (smoke, flame, electric). Other multi-frame sequences play once over the particle life. */
  readonly loop?: boolean;
}

/**
 * Where each of the 18 built-in sequences sits on `packages/engine/assets/vfx/aura-vfx-2k.png`.
 * Mirrors `manifest.json` except for three sequences whose baked rows overlap: the bake tool advances one
 * cell row per layout row, so a two-row sequence is partly overwritten by the next row (`fireball` covers the
 * bottom-left cell of `smoke-a`, `flame-loop` covers the bottom row of `fireball`, `electric` and
 * `debris-chips` cover the bottom row of `flame-loop`). Those three sample only their clean top row here,
 * with the frame rate scaled so one cycle lasts as long as the baked sequence intends.
 */
export const VFX_SPRITE_LAYOUT: Readonly<Record<AuraVfxBuiltinSequence, VfxSpriteLayout>> = {
  "soft-dot": { rect: [4, 4, 256, 256], columns: 1, rows: 1, frames: 1 },
  glow: { rect: [264, 4, 256, 256], columns: 1, rows: 1, frames: 1 },
  flare: { rect: [524, 4, 256, 256], columns: 1, rows: 1, frames: 1 },
  "spark-streak": { rect: [784, 4, 256, 256], columns: 1, rows: 1, frames: 1 },
  ring: { rect: [1044, 4, 256, 256], columns: 1, rows: 1, frames: 1 },
  "ring-thin": { rect: [1304, 4, 256, 256], columns: 1, rows: 1, frames: 1 },
  "dust-mote": { rect: [1564, 4, 256, 256], columns: 1, rows: 1, frames: 1 },
  bubble: { rect: [4, 264, 256, 256], columns: 1, rows: 1, frames: 1 },
  "rain-streak": { rect: [264, 264, 256, 256], columns: 1, rows: 1, frames: 1 },
  snowflake: { rect: [524, 264, 256, 256], columns: 1, rows: 1, frames: 1 },
  // Baked 2×2 at 12 fps; its bottom-left cell is overwritten by `fireball`.
  "smoke-a": { rect: [784, 264, 512, 256], columns: 2, rows: 1, frames: 2, fps: 6, loop: true },
  "smoke-b": { rect: [1304, 264, 512, 512], columns: 2, rows: 2, frames: 4, fps: 12, loop: true },
  // Baked 4×2; its bottom row is overwritten by `flame-loop`.
  fireball: { rect: [4, 524, 1024, 256], columns: 4, rows: 1, frames: 4, fps: 24 },
  // Baked 4×2 at 16 fps; its bottom row is overwritten by `electric` and `debris-chips`.
  "flame-loop": { rect: [4, 784, 1024, 256], columns: 4, rows: 1, frames: 4, fps: 8, loop: true },
  muzzle: { rect: [1044, 784, 256, 256], columns: 1, rows: 1, frames: 1 },
  splash: { rect: [1304, 784, 512, 512], columns: 2, rows: 2, frames: 4, fps: 10 },
  electric: { rect: [4, 1044, 512, 256], columns: 2, rows: 1, frames: 2, fps: 30, loop: true },
  "debris-chips": { rect: [524, 1044, 512, 256], columns: 2, rows: 1, frames: 2, fps: 6 }
};

/** True for the 18 built-in sequence names (`agent-api/vfx/atlas.ts`). */
export function isVfxBuiltinSprite(name: unknown): name is AuraVfxBuiltinSequence {
  return typeof name === "string" && Object.prototype.hasOwnProperty.call(VFX_SPRITE_LAYOUT, name);
}

/** Atlas page size per quality tier: the 1k twin on low and medium, the 2k page on high and ultra. */
export function vfxSpritePageSize(tier: string): 1024 | 2048 {
  return tier === "low" || tier === "medium" ? 1024 : 2048;
}

/**
 * Pixel rect of a sequence on the page of `pageSize`. The 1k twin is baked with 128 px cells and the same
 * 4 px gutter, so its cell pitch is 132 px, not half of 260: halving the 2k rect would sample 4 px off.
 */
export function vfxSpriteRect(layout: VfxSpriteLayout, pageSize: 1024 | 2048): readonly [number, number, number, number] {
  if (pageSize >= 2048) return layout.rect;
  const [x, y, w, h] = layout.rect;
  const half = (v: number): number => 4 + Math.round((v - 4) / 260) * 132;
  return [half(x), half(y), w / 2, h / 2];
}

/**
 * Frame for one particle of a sprite emitter (written into the instance `frame` slot; the fraction blends
 * into the next cell when the batch has `frameBlend`). Looping sequences run at their fps from the
 * particle's birth; play-once sequences span the particle's life; a texture sheet holds its fixed `frame`.
 */
export function vfxSpriteFrame(
  sprite: { readonly frames: number; readonly fps?: number; readonly loop?: boolean; readonly frame?: number },
  age: number,
  life: number
): number {
  const frames = Math.max(1, Math.floor(sprite.frames));
  if (sprite.frame !== undefined) return Math.min(frames - 1, Math.max(0, Math.floor(sprite.frame)));
  if (frames === 1) return 0;
  if (sprite.loop && sprite.fps !== undefined && sprite.fps > 0) return (Math.max(0, age) * sprite.fps) % frames;
  const t = life > 0 ? Math.min(1, Math.max(0, age / life)) : 1;
  return t * (frames - 1);
}

/** Decoded image for a sprite texture: an uploadable image source (browser) or raw RGBA8 rows bottom-up (tests). */
export interface VfxSpriteImage {
  readonly width: number;
  readonly height: number;
  readonly source?: TexImageSource;
  readonly data?: Uint8Array;
}

/** Loads `url` and returns the pixel rect `rect` (whole image when null), rows oriented for the GL upload. */
export type VfxSpriteLoader = (url: string, rect: readonly [number, number, number, number] | null) => Promise<VfxSpriteImage>;

const browserPages = new Map<string, Promise<ImageBitmap>>();

/**
 * Browser loader: one fetch and decode per page URL (shared by every sequence), then a cropped ImageBitmap per
 * rect. `imageOrientation: "flipY"` puts the image's top row at v = 1 (WebGL ignores UNPACK_FLIP_Y for
 * ImageBitmap sources), and decoding keeps the stored bytes as they are (the atlas is premultiplied sRGB).
 */
export const browserVfxSpriteLoader: VfxSpriteLoader = async (url, rect) => {
  if (typeof fetch !== "function" || typeof createImageBitmap !== "function") {
    throw new Error("this runtime has no fetch or createImageBitmap to decode the sprite page");
  }
  let page = browserPages.get(url);
  if (!page) {
    page = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
      })
      .then((blob) => createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" }));
    browserPages.set(url, page);
    page.catch(() => browserPages.delete(url));
  }
  const bitmap = await page;
  const [x, y, w, h] = rect ?? [0, 0, bitmap.width, bitmap.height];
  const crop = await createImageBitmap(bitmap, x, y, w, h, { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" });
  return { width: crop.width, height: crop.height, source: crop };
};

/**
 * URL of the baked page. Resolved against this module so Vite (dev and build) emits the PNG from
 * `packages/engine/assets/vfx/`; `src/` and `dist/` sit at the same depth, so the package dist resolves it too.
 */
export function defaultVfxSpritePageUrl(pageSize: 1024 | 2048): string {
  return pageSize >= 2048
    ? new URL("../../../assets/vfx/aura-vfx-2k.png", import.meta.url).href
    : new URL("../../../assets/vfx/aura-vfx-1k.png", import.meta.url).href;
}

export type VfxSpriteTextureState = "pending" | "ready" | "failed";

interface SpriteTextureEntry {
  state: VfxSpriteTextureState;
  texture: Texture | null;
  readonly done: Promise<void>;
}

/**
 * Per-system cache of sprite textures. `builtin(name)` and `texture(url)` start the load on first use and
 * return null until the image is decoded (the batch keeps the analytic soft-dot meanwhile) or after the load
 * failed (`onError` is called once per key; the batch stays on the soft-dot).
 */
export class VfxSpriteTextures {
  private readonly entries = new Map<string, SpriteTextureEntry>();

  constructor(
    private readonly loader: VfxSpriteLoader = browserVfxSpriteLoader,
    readonly pageSize: 1024 | 2048 = 2048,
    private readonly onError?: (key: string, message: string) => void,
    private readonly pageUrl: (pageSize: 1024 | 2048) => string = defaultVfxSpritePageUrl
  ) {}

  /** Texture of a built-in sequence cropped from the tier page (premultiplied sRGB), or null while loading or failed. */
  builtin(name: AuraVfxBuiltinSequence): Texture | null {
    const layout = VFX_SPRITE_LAYOUT[name];
    if (!layout) return null;
    return this.load(`vfx:${name}`, this.pageUrl(this.pageSize), vfxSpriteRect(layout, this.pageSize));
  }

  /** Whole-image texture of a texture asset (straight-alpha sRGB sheet), or null while loading or failed. */
  texture(url: string): Texture | null {
    return this.load(`tex:${url}`, url, null);
  }

  /** Load state per key (`vfx:<name>` or `tex:<url>`). */
  status(): Readonly<Record<string, VfxSpriteTextureState>> {
    const out: Record<string, VfxSpriteTextureState> = {};
    for (const [key, entry] of this.entries) out[key] = entry.state;
    return out;
  }

  /** Resolves once every load requested so far has settled (tests and receipts wait on it). */
  async settled(): Promise<void> {
    await Promise.all([...this.entries.values()].map((entry) => entry.done));
  }

  private load(key: string, url: string, rect: readonly [number, number, number, number] | null): Texture | null {
    const existing = this.entries.get(key);
    if (existing) return existing.texture;
    const entry: { state: VfxSpriteTextureState; texture: Texture | null; done: Promise<void> } = { state: "pending", texture: null, done: Promise.resolve() };
    entry.done = this.loader(url, rect).then(
      (image) => {
        entry.texture = new Texture({
          width: image.width,
          height: image.height,
          colorSpace: "srgb",
          label: `a3d-vfx-sprite-${key}`,
          ...(image.source ? { source: image.source } : { data: image.data ?? new Uint8Array(image.width * image.height * 4) })
        });
        entry.state = "ready";
      },
      (error: unknown) => {
        entry.state = "failed";
        this.onError?.(key, error instanceof Error ? error.message : String(error));
      }
    );
    this.entries.set(key, entry);
    return null;
  }
}
