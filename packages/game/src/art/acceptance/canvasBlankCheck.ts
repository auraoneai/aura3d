/**
 * C-35 — `canvasBlankCheck`: fails a captured shot when the canvas region
 * (HUD masked) is uniformly dark — the "black frame" detector independent of
 * DOM HUD pixels.
 *
 * Dark = Rec.709 luma < 10/255. Distinct colours are counted after 5-bit
 * quantisation per channel. Defaults (applied by callers, not here):
 * `maxDarkFraction 0.9`, `minDistinctColors 2000`.
 */

export interface CanvasMaskRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface CanvasBlankCheckLimits {
  readonly maxDarkFraction: number;
  readonly minDistinctColors: number;
}

export interface CanvasBlankCheckResult {
  readonly pass: boolean;
  readonly darkFraction: number;
  readonly distinctColors: number;
}

const DARK_LUMA_THRESHOLD = 10;

/**
 * `rgba` is the sRGB RGBA8 pixel buffer of the canvas rect; `mask` lists HUD
 * rects (pixel coordinates, clamped to the canvas) excluded from both counts.
 */
export function canvasBlankCheck(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  mask: readonly CanvasMaskRect[],
  limits: CanvasBlankCheckLimits
): CanvasBlankCheckResult {
  const pixelCount = width * height;
  const masked = new Uint8Array(pixelCount);
  for (const rect of mask) {
    const x0 = Math.max(0, Math.floor(rect.x));
    const y0 = Math.max(0, Math.floor(rect.y));
    const x1 = Math.min(width, Math.ceil(rect.x + rect.w));
    const y1 = Math.min(height, Math.ceil(rect.y + rect.h));
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) masked[y * width + x] = 1;
    }
  }

  let counted = 0;
  let dark = 0;
  const colors = new Set<number>();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (masked[idx] === 1) continue;
      counted += 1;
      const o = idx * 4;
      const r = rgba[o];
      const g = rgba[o + 1];
      const b = rgba[o + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (luma < DARK_LUMA_THRESHOLD) dark += 1;
      colors.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
    }
  }

  const darkFraction = counted === 0 ? 1 : dark / counted;
  const distinctColors = colors.size;
  return {
    pass: darkFraction <= limits.maxDarkFraction && distinctColors >= limits.minDistinctColors,
    darkFraction,
    distinctColors
  };
}
