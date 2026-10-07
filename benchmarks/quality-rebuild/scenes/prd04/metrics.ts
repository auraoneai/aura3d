/**
 * metrics.ts — PRD-04 §15.x/§16.1 pixel metrics (P7). Pure functions over RGBA
 * pixel buffers (`Uint8ClampedArray` / `number[]`, row-major, 4 channels), so
 * the same math runs inside the browser driver pages and inside the Node
 * specs that compare two loads. No DOM types — keep it dependency-free.
 *
 * Metrics implemented:
 *   - CIEDE2000 (`deltaE00`) + masked means (vs the clear colour or a second frame)
 *   - masked SSIM (8x8 luma blocks, both-pixels-in-mask)
 *   - masked Laplacian-of-luma variance (texture-detail retention probe)
 *   - temporal per-pixel luma stddev (grazing-angle shimmer probe)
 *   - row-profile spectral spike (tile seam probe, recording-only)
 *   - bottom-quartile luma (shadow-side brightening probe)
 *   - alpha-edge gradient width (MASK under MSAA probe)
 */

/** sRGB byte triple -> CIE Lab (D65). */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const f = (v: number) => {
    const s = v / 255;
    return s > 0.04045 ? Math.pow((s + 0.055) / 1.055, 2.4) : s / 12.92;
  };
  const x = (f(r) * 0.4124 + f(g) * 0.3576 + f(b) * 0.1805) / 0.95047;
  const y = f(r) * 0.2126 + f(g) * 0.7152 + f(b) * 0.0722;
  const z = (f(r) * 0.0193 + f(g) * 0.1192 + f(b) * 0.9505) / 1.08883;
  const t = (v: number) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  return [116 * t(y) - 16, 500 * (t(x) - t(y)), 200 * (t(y) - t(z))];
}

/** CIEDE2000 colour difference. */
export function deltaE00(a: [number, number, number], b: [number, number, number]): number {
  const [l1, a1, b1] = a;
  const [l2, a2, b2] = b;
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const cb = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(cb ** 7 / (cb ** 7 + 25 ** 7)));
  const ap1 = a1 * (1 + g);
  const ap2 = a2 * (1 + g);
  const cp1 = Math.hypot(ap1, b1);
  const cp2 = Math.hypot(ap2, b2);
  const hp = (x: number, y: number) => {
    if (x === 0 && y === 0) return 0;
    const h = (Math.atan2(y, x) * 180) / Math.PI;
    return h < 0 ? h + 360 : h;
  };
  const h1 = hp(ap1, b1);
  const h2 = hp(ap2, b2);
  const dL = l2 - l1;
  const dC = cp2 - cp1;
  const dh =
    cp1 * cp2 === 0
      ? 0
      : Math.abs(h2 - h1) <= 180
        ? h2 - h1
        : h2 - h1 > 180
          ? h2 - h1 - 360
          : h2 - h1 + 360;
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin((dh / 2) * (Math.PI / 180));
  const lb = (l1 + l2) / 2;
  const cbp = (cp1 + cp2) / 2;
  const hb =
    cp1 * cp2 === 0
      ? h1 + h2
      : Math.abs(h1 - h2) <= 180
        ? (h1 + h2) / 2
        : h1 + h2 < 360
          ? (h1 + h2 + 360) / 2
          : (h1 + h2 - 360) / 2;
  const tt =
    1 -
    0.17 * Math.cos(((hb - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * hb * Math.PI) / 180) +
    0.32 * Math.cos(((3 * hb + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * hb - 63) * Math.PI) / 180);
  const rt =
    -2 * Math.sqrt(cbp ** 7 / (cbp ** 7 + 25 ** 7)) *
    Math.sin(60 * Math.exp(-(((hb - 275) / 25) ** 2) * (Math.PI / 180)));
  const sl = 1 + (0.015 * (lb - 50) ** 2) / Math.sqrt(20 + (lb - 50) ** 2);
  const sc = 1 + 0.045 * cbp;
  const sh = 1 + 0.015 * cbp * tt;
  const dL2 = dL / sl;
  const dC2 = dC / sc;
  const dH2 = dH / sh;
  return Math.sqrt(dL2 ** 2 + dC2 ** 2 + dH2 ** 2 + rt * dC2 * dH2);
}

export type PixelBuffer = ArrayLike<number>;

/** Harness clear colour (dark grey) — matches the drivers' clearColor. */
export const CLEAR: readonly [number, number, number] = [0.015, 0.018, 0.024];

/** Mask of pixels differing from the clear colour by >10/255 in any channel. */
export function subjectMask(px: PixelBuffer, clear: readonly [number, number, number] = CLEAR): Uint8Array {
  const mask = new Uint8Array(px.length / 4);
  for (let i = 0; i < mask.length; i++) {
    const diff = Math.max(
      Math.abs(px[i * 4]! - clear[0] * 255),
      Math.abs(px[i * 4 + 1]! - clear[1] * 255),
      Math.abs(px[i * 4 + 2]! - clear[2] * 255)
    );
    mask[i] = diff > 10 ? 1 : 0;
  }
  return mask;
}

export function meanLab(px: PixelBuffer, mask: Uint8Array): [number, number, number] {
  let n = 0;
  let l = 0;
  let a = 0;
  let b = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const lab = rgbToLab(px[i * 4]!, px[i * 4 + 1]!, px[i * 4 + 2]!);
    n++;
    l += lab[0];
    a += lab[1];
    b += lab[2];
  }
  return [l / Math.max(n, 1), a / Math.max(n, 1), b / Math.max(n, 1)];
}

/** Mean CIEDE2000 between two frames over `mask`. */
export function maskedDeltaE(a: PixelBuffer, b: PixelBuffer, mask: Uint8Array): number {
  let n = 0;
  let sum = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    sum += deltaE00(rgbToLab(a[i * 4]!, a[i * 4 + 1]!, a[i * 4 + 2]!), rgbToLab(b[i * 4]!, b[i * 4 + 1]!, b[i * 4 + 2]!));
    n++;
  }
  return sum / Math.max(n, 1);
}

/** sRGB -> relative luminance (Rec.709 luma weights on linearized values, 0..1). */
export function lumaAt(px: PixelBuffer, index: number): number {
  const r = px[index * 4]! / 255;
  const g = px[index * 4 + 1]! / 255;
  const b = px[index * 4 + 2]! / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function lumaMap(px: PixelBuffer): Float32Array {
  const out = new Float32Array(px.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = lumaAt(px, i);
  return out;
}

/**
 * Masked SSIM over 8x8 luma blocks (blocks fully inside the mask). Returns
 * mean SSIM; 1 = identical. Used by S3 (white tint must be a no-op).
 */
export function maskedSsim(a: PixelBuffer, b: PixelBuffer, width: number, height: number, mask: Uint8Array): number {
  const C1 = 0.01 ** 2;
  const C2 = 0.03 ** 2;
  const block = 8;
  let sum = 0;
  let count = 0;
  for (let y = 0; y + block <= height; y += block) {
    for (let x = 0; x + block <= width; x += block) {
      let masked = 0;
      for (let j = 0; j < block; j++) {
        for (let i = 0; i < block; i++) masked += mask[(y + j) * width + x + i]!;
      }
      if (masked < block * block * 0.6) continue;
      let ma = 0;
      let mb = 0;
      const n = block * block;
      const la: number[] = [];
      const lb: number[] = [];
      for (let j = 0; j < block; j++) {
        for (let i = 0; i < block; i++) {
          const idx = (y + j) * width + x + i;
          la.push(lumaAt(a, idx));
          lb.push(lumaAt(b, idx));
          ma += lumaAt(a, idx);
          mb += lumaAt(b, idx);
        }
      }
      ma /= n;
      mb /= n;
      let va = 0;
      let vb = 0;
      let cov = 0;
      for (let i = 0; i < n; i++) {
        va += (la[i]! - ma) ** 2;
        vb += (lb[i]! - mb) ** 2;
        cov += (la[i]! - ma) * (lb[i]! - mb);
      }
      va /= n - 1;
      vb /= n - 1;
      cov /= n - 1;
      sum += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma ** 2 + mb ** 2 + C1) * (va + vb + C2));
      count++;
    }
  }
  return count === 0 ? 1 : sum / count;
}

/**
 * Variance of the 4-neighbour Laplacian of luma over masked pixels —
 * a texture-detail probe (drops when maps are flattened by a tint or when
 * procedural detail is absent).
 */
export function maskedLaplacianVariance(px: PixelBuffer, width: number, height: number, mask: Uint8Array): number {
  const luma = lumaMap(px);
  let n = 0;
  let mean = 0;
  const vals: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (!mask[i]) continue;
      const lap = luma[i - width]! + luma[i + width]! + luma[i - 1]! + luma[i + 1]! - 4 * luma[i]!;
      vals.push(lap);
      mean += lap;
      n++;
    }
  }
  if (n < 16) return 0;
  mean /= n;
  let v = 0;
  for (const lap of vals) v += (lap - mean) ** 2;
  return v / (n - 1);
}

/** Mean luma + count over a mask; used for shadow-side and region probes. */
export function maskedLumaStats(px: PixelBuffer, mask: Uint8Array): { mean: number; count: number } {
  let n = 0;
  let sum = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    sum += lumaAt(px, i);
    n++;
  }
  return { mean: sum / Math.max(n, 1), count: n };
}

/**
 * Shadow-side probe (S3): the mean luma of the darkest quartile of masked
 * pixels. A legacy tint glows the shadow side, so this rises sharply.
 */
export function shadowQuartileLuma(px: PixelBuffer, mask: Uint8Array): number {
  const vals: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) vals.push(lumaAt(px, i));
  }
  if (vals.length < 8) return 0;
  vals.sort((a, b) => a - b);
  const q = vals.slice(0, Math.max(1, Math.floor(vals.length / 4)));
  return q.reduce((s, v) => s + v, 0) / q.length;
}

/** Mean R/G channel ratio over the mask — the red-tint probe. */
export function maskedChannelRatio(px: PixelBuffer, mask: Uint8Array, numChannel: number, denChannel: number): number {
  let n = 0;
  let sum = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    sum += px[i * 4 + numChannel]! / Math.max(1, px[i * 4 + denChannel]!);
    n++;
  }
  return sum / Math.max(n, 1);
}

/**
 * Temporal shimmer probe (S6): per-pixel luma stddev across `frames` luma
 * maps, averaged over `mask` rows restricted to the `rowFraction` span with
 * the smallest row index (the "far" strip for the ground-plane scene).
 */
export function temporalLumaStddev(
  frames: readonly Float32Array[],
  width: number,
  height: number,
  mask: Uint8Array,
  rowFraction = 1 / 3,
  far: "top" | "bottom" = "top"
): { mean: number; maskedPixels: number } {
  if (frames.length < 2) return { mean: 0, maskedPixels: 0 };
  const rowStart = far === "top" ? 0 : Math.floor(height * (1 - rowFraction));
  const rowEnd = far === "top" ? Math.floor(height * rowFraction) : height;
  let n = 0;
  let sumStd = 0;
  for (let y = rowStart; y < rowEnd; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!mask[i]) continue;
      let m = 0;
      for (const frame of frames) m += frame[i]!;
      m /= frames.length;
      let v = 0;
      for (const frame of frames) v += (frame[i]! - m) ** 2;
      sumStd += Math.sqrt(v / (frames.length - 1));
      n++;
    }
  }
  return { mean: sumStd / Math.max(n, 1), maskedPixels: n };
}

/**
 * Tile-seam probe (S6 integrated half): 1-D DFT magnitude of the mean-luma
 * row profile over the far strip, reporting the largest non-DC spike relative
 * to the median bin. A periodic tile seam shows as a sharp spike.
 */
export function rowProfileSpike(frame: Float32Array, width: number, height: number, mask: Uint8Array): { spike: number; bins: number } {
  const farRows = Math.floor(height / 3);
  const n = 256;
  const profile = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const x = Math.floor((k / n) * width);
    let sum = 0;
    let count = 0;
    for (let y = 0; y < farRows; y++) {
      const i = y * width + x;
      if (mask[i]) {
        sum += frame[i]!;
        count++;
      }
    }
    profile[k] = count > 0 ? sum / count : 0;
  }
  const mags: number[] = [];
  for (let f = 1; f < n / 2; f++) {
    let re = 0;
    let im = 0;
    for (let k = 0; k < n; k++) {
      const t = (2 * Math.PI * f * k) / n;
      re += profile[k]! * Math.cos(t);
      im -= profile[k]! * Math.sin(t);
    }
    mags.push(Math.hypot(re, im));
  }
  const sorted = [...mags].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 1;
  const peak = Math.max(...mags);
  return { spike: median > 0 ? peak / median : 0, bins: mags.length };
}

/**
 * Alpha-edge probe (alpha-to-coverage): for each masked row, the width in
 * pixels of the luma transition across the strongest edge. MASK-without-A2C
 * gives a 1-px staircase; A2C under MSAA widens it into a gradient.
 * Returns the mean transition width over the sampled rows.
 */
export function meanEdgeTransitionWidth(px: PixelBuffer, width: number, height: number, mask: Uint8Array): { mean: number; rows: number } {
  let total = 0;
  let rows = 0;
  const threshold = 0.04;
  for (let y = 0; y < height; y++) {
    let rowMasked = 0;
    for (let x = 0; x < width; x++) rowMasked += mask[y * width + x]!;
    if (rowMasked < width * 0.05) continue;
    // Find the strongest |dL/dx| position on this row inside the mask.
    let bestX = -1;
    let bestGrad = 0;
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (!mask[i] || !mask[i - 1] || !mask[i + 1]) continue;
      const grad = Math.abs(lumaAt(px, i + 1) - lumaAt(px, i - 1));
      if (grad > bestGrad) {
        bestGrad = grad;
        bestX = x;
      }
    }
    if (bestX < 0 || bestGrad < threshold) continue;
    const peak = lumaAt(px, y * width + bestX);
    // March left and right until the luma slope flattens below threshold/4.
    let left = bestX;
    let right = bestX;
    while (left > 0 && Math.abs(lumaAt(px, y * width + left) - lumaAt(px, y * width + left - 1)) > threshold / 4) left--;
    while (right < width - 1 && Math.abs(lumaAt(px, y * width + right + 1) - lumaAt(px, y * width + right)) > threshold / 4) right++;
    void peak;
    total += right - left + 1;
    rows++;
  }
  return { mean: total / Math.max(rows, 1), rows };
}

/**
 * Mirrored-halves probe (§16.2 prd04-normal-tangent): mean ΔE2000 between each
 * masked pixel (x, y) and its horizontally mirrored counterpart (w-1-x, y).
 * Correct bitangent math lights the GLB's mirrored halves identically.
 */
export function mirroredDeltaE(px: PixelBuffer, width: number, height: number, mask: Uint8Array): number {
  let n = 0;
  let sum = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < Math.floor(width / 2); x++) {
      const i = y * width + x;
      const j = y * width + (width - 1 - x);
      if (!mask[i] || !mask[j]) continue;
      sum += deltaE00(
        rgbToLab(px[i * 4]!, px[i * 4 + 1]!, px[i * 4 + 2]!),
        rgbToLab(px[j * 4]!, px[j * 4 + 1]!, px[j * 4 + 2]!)
      );
      n++;
    }
  }
  return sum / Math.max(n, 1);
}

/** Decode an app screenshot data-URL to raw RGBA pixels (browser drivers). */
export async function decodePngDataUrl(dataUrl: string): Promise<{ width: number; height: number; pixels: number[] }> {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return { width: canvas.width, height: canvas.height, pixels: Array.from(data) };
}

/** Snapshot a canvas' current front buffer into a Uint8ClampedArray (browser drivers). */
export async function canvasPixels(canvas: HTMLCanvasElement): Promise<Uint8ClampedArray> {
  const bitmap = await createImageBitmap(canvas);
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}
