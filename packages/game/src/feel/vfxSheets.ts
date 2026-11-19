/**
 * Procedural RGBA8 VFX sprite sheets (flipbooks) and strip grading LUTs built as `texture.data` typed arrays, so they
 * work identically headless, in a worker, on WebGPU and on WebGL2 with no image assets. Extracted from the 30 live
 * games' shared VFX pack (`apps/showcase-port-shared/vfx-pack.ts`) in 5.7.0.
 */
import { texture } from "@aura3d/engine/v5/internal";

/** The procedural flipbook looks: radial `sparks`, a soft `dust` puff, a lobed `ink` splat, a swirling `plasma` ball, a 6-ray `muzzle` flash and an expanding `ripple` ring. */
export type FlipbookKind = "sparks" | "dust" | "ink" | "plasma" | "muzzle" | "ripple";

/** A flipbook sheet for `effects.flipbook({ texture, spriteColumns: columns, spriteRows: rows })`. */
export interface FlipbookAtlasSpec {
  /** The sRGB RGBA8 sheet (384 x 192: 8 columns x 4 rows of 48 px cells). */
  readonly texture: ReturnType<typeof texture.data>;
  /** Cells across (8). */
  readonly columns: number;
  /** Cells down (4). */
  readonly rows: number;
  /** Frames in play order, left to right then top to bottom (32). */
  readonly frameCount: number;
}

/**
 * Generate a 32-frame procedural flipbook sheet of `kind`, tinted by `tint` (sRGB 0..255; the core blends toward
 * white). Deterministic: the same arguments always give the same bytes.
 *
 * @example
 * const sparks = createFlipbookAtlas("sparks", [255, 200, 90]);
 * effects.flipbook({ texture: sparks.texture, spriteColumns: sparks.columns, spriteRows: sparks.rows });
 */

export function createFlipbookAtlas(
  kind: FlipbookKind,
  tint: readonly [number, number, number] = [255, 210, 120]
): FlipbookAtlasSpec {
  const columns = 8;
  const rows = 4;
  const cell = 48;
  const width = columns * cell;
  const height = rows * cell;
  const data = new Uint8Array(width * height * 4);
  const frameCount = columns * rows;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const col = frame % columns;
    const row = Math.floor(frame / columns);
    const t = frame / (frameCount - 1);
    const fade = Math.pow(1 - t, kind === "dust" ? 1.35 : 1.75);
    const radius = kind === "ripple" ? 0.16 + 0.74 * t : 0.18 + 0.68 * Math.pow(t, 0.62);

    for (let y = 0; y < cell; y += 1) {
      const ny = ((y + 0.5) / cell) * 2 - 1;
      for (let x = 0; x < cell; x += 1) {
        const nx = ((x + 0.5) / cell) * 2 - 1;
        const r = Math.hypot(nx, ny);
        const theta = Math.atan2(ny, nx);
        let alpha = 0;
        let coreBoost = 0;

        if (kind === "ripple") {
          const ring = Math.exp(-Math.pow((r - radius) / 0.11, 2));
          alpha = ring * fade;
          coreBoost = ring * 0.45;
        } else if (kind === "sparks" || kind === "muzzle") {
          const rays = Math.pow(Math.max(0, Math.cos(theta * (kind === "muzzle" ? 6 : 9) + frame * 0.35)), 4);
          const shell = Math.exp(-Math.pow((r - radius * 0.65) / 0.28, 2));
          const core = Math.exp(-Math.pow(r / Math.max(0.12, 0.35 * (1 - t)), 2));
          alpha = Math.min(1, (rays * shell * 0.95 + core) * fade);
          coreBoost = core;
        } else if (kind === "ink") {
          const lobes = 1 + 0.28 * Math.sin(theta * 5 + 1.3) + 0.16 * Math.cos(theta * 8 - 0.7);
          const mask = Math.max(0, 1 - r / (radius * lobes));
          alpha = Math.min(1, Math.pow(mask, 0.55) * fade * 1.15);
          coreBoost = Math.pow(mask, 2.2) * 0.35;
        } else if (kind === "plasma") {
          const swirl = 0.5 + 0.5 * Math.sin(theta * 4 - r * 7 + t * 8);
          const env = Math.exp(-Math.pow(r / Math.max(0.2, radius), 2));
          alpha = Math.min(1, env * (0.45 + 0.55 * swirl) * fade);
          coreBoost = Math.exp(-Math.pow(r / 0.24, 2)) * (1 - t);
        } else {
          // soft volumetric dust puff
          const puff = 0.75 + 0.25 * Math.sin(theta * 3 + r * 4.5);
          const env = Math.max(0, 1 - r / Math.max(0.22, radius));
          alpha = Math.min(1, Math.pow(env, 1.4) * puff * fade * 0.85);
          coreBoost = env * 0.15;
        }

        if (alpha <= 0.004) continue;
        const px = col * cell + x;
        const py = row * cell + y;
        const idx = (py * width + px) * 4;
        data[idx] = Math.min(255, Math.round(tint[0] + (255 - tint[0]) * coreBoost));
        data[idx + 1] = Math.min(255, Math.round(tint[1] + (255 - tint[1]) * coreBoost));
        data[idx + 2] = Math.min(255, Math.round(tint[2] + (255 - tint[2]) * coreBoost));
        data[idx + 3] = Math.min(255, Math.round(alpha * 255));
      }
    }
  }

  return {
    texture: texture.data({
      data,
      width,
      height,
      format: "rgba8",
      colorSpace: "srgb"
    }),
    columns,
    rows,
    frameCount
  };
}

/** Built-in grading looks for {@link createGradingLut}. */
export type GradingLutPreset = "cinema-warm" | "broadcast-crisp" | "cyber-neon";

/** A strip LUT for `output: { lut: { texture, size, intensity } }`. */
export interface GradingLut {
  /** LUT edge length (the strip is `size * size` x `size`). */
  readonly size: number;
  /** The linear RGBA8 strip texture. */
  readonly texture: ReturnType<typeof texture.data>;
}

/**
 * Generate a horizontal strip grading LUT (`size * size` x `size`, default `size = 16` -> 256 x 16) for `preset`:
 * an S-curve with a warm, crisp broadcast or neon cast. Deterministic.
 *
 * @example
 * const lut = createGradingLut("cinema-warm");
 * createAuraApp({ output: { lut: { texture: lut.texture, size: lut.size, intensity: 0.6 } } });
 */
export function createGradingLut(preset: GradingLutPreset, size = 16): GradingLut {
  const width = size * size;
  const height = size;
  const data = new Uint8Array(width * height * 4);
  const sCurve = (v: number, contrast: number): number => {
    const x = Math.min(1, Math.max(0, v));
    return x < 0.5 ? 0.5 * Math.pow(2 * x, contrast) : 1 - 0.5 * Math.pow(2 * (1 - x), contrast);
  };

  for (let b = 0; b < size; b += 1) {
    const nb = b / (size - 1);
    for (let g = 0; g < size; g += 1) {
      const ng = g / (size - 1);
      for (let r = 0; r < size; r += 1) {
        const nr = r / (size - 1);
        const luma = 0.2126 * nr + 0.7152 * ng + 0.0722 * nb;
        let or = nr;
        let og = ng;
        let ob = nb;

        if (preset === "cinema-warm") {
          or = sCurve(nr * 1.03 + 0.015 * luma, 1.08);
          og = sCurve(ng * 1.0 + 0.004 * luma, 1.07);
          ob = sCurve(nb * 0.96 + 0.022 * (1 - luma), 1.08);
        } else if (preset === "cyber-neon") {
          or = sCurve(nr * 1.02 + 0.025 * Math.max(0, nr - ng), 1.12);
          og = sCurve(ng * 0.99 + 0.012 * nb, 1.1);
          ob = sCurve(nb * 1.05 + 0.03 * (1 - luma), 1.12);
        } else {
          // broadcast-crisp: clean whites, punchy turf/court saturation
          const sat = 1.08;
          or = sCurve(luma + (nr - luma) * sat, 1.06);
          og = sCurve(luma + (ng - luma) * sat, 1.06);
          ob = sCurve(luma + (nb - luma) * sat, 1.06);
        }

        const px = b * size + r;
        const py = g;
        const idx = (py * width + px) * 4;
        data[idx] = Math.min(255, Math.max(0, Math.round(or * 255)));
        data[idx + 1] = Math.min(255, Math.max(0, Math.round(og * 255)));
        data[idx + 2] = Math.min(255, Math.max(0, Math.round(ob * 255)));
        data[idx + 3] = 255;
      }
    }
  }

  return {
    size,
    texture: texture.data({
      data,
      width,
      height,
      format: "rgba8",
      colorSpace: "linear"
    })
  };
}
