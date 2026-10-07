/**
 * PRD-02 §16.4 numeric metrics — pure functions over decoded RGBA pixels and
 * byte masks so the same module runs in vitest (node, synthetic buffers) and
 * inside the lane capture page (bundled by vite). Thresholds live in the
 * PRD; every metric returns a plain number keyed report.
 *
 * Metric ids (see PRD-02 §16.4 table):
 *   shadow-drop            receiver-region luma drop, shadow-on vs no-shadows
 *   second-caster-coverage aura shadowed ratio / three shadowed ratio (scene 12)
 *   shadow-iou             IoU of binarized shadow masks (08/15-class scenes)
 *   edge-density           strong-edge density in the building band (17)
 *   sky-std                luma stddev in the sky band (09/13)
 *   specular-hf            high-frequency energy per metal disc + monotonicity (06)
 *   sky-tint               B/R ratio at the top of a white sphere (13)
 *   unrequested-shadows    shadow-mask pixels where no light requested shadow
 *   temporal               mean frame-to-frame diff on shadow-edge mask (17)
 *   clipping               fraction of clipped pixels near practical lights (10)
 */

export interface PixelBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** 0|255 per pixel. */
export type MaskBuffer = Uint8Array;

export function lumaAt(data: Uint8ClampedArray, index: number): number {
  const o = index * 4;
  return 0.299 * data[o]! + 0.587 * data[o + 1]! + 0.114 * data[o + 2]!;
}

export function meanLuma(img: PixelBuffer, mask?: MaskBuffer): number {
  const count = img.width * img.height;
  let sum = 0;
  let n = 0;
  for (let index = 0; index < count; index += 1) {
    if (mask && !mask[index]) continue;
    sum += lumaAt(img.data, index);
    n += 1;
  }
  return n ? sum / n : 0;
}

export function stdLuma(img: PixelBuffer, mask?: MaskBuffer): number {
  const count = img.width * img.height;
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  for (let index = 0; index < count; index += 1) {
    if (mask && !mask[index]) continue;
    const l = lumaAt(img.data, index);
    sum += l;
    sum2 += l * l;
    n += 1;
  }
  if (!n) return 0;
  const mean = sum / n;
  return Math.sqrt(Math.max(0, sum2 / n - mean * mean));
}

/**
 * `shadow-drop` — relative luma drop inside the receiver mask:
 * `(meanOff - meanOn) / meanOff`. three's benchmark value is ≈0.50, the legacy
 * Aura path ≈0.09 (research/22); §16.4 wants Aura within ±20% relative of three.
 */
export function shadowDrop(shadowOn: PixelBuffer, shadowOff: PixelBuffer, receiverMask: MaskBuffer): number {
  const off = meanLuma(shadowOff, receiverMask);
  const on = meanLuma(shadowOn, receiverMask);
  return off > 1e-6 ? Math.max(0, (off - on) / off) : 0;
}

/** Binarized shadow mask: pixels where off/on differ by > `threshold` luma. */
export function shadowMask(shadowOn: PixelBuffer, shadowOff: PixelBuffer, threshold = 8): MaskBuffer {
  const count = Math.min(shadowOn.width * shadowOn.height, shadowOff.width * shadowOff.height);
  const mask = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    if (Math.abs(lumaAt(shadowOn.data, index) - lumaAt(shadowOff.data, index)) > threshold) mask[index] = 255;
  }
  return mask;
}

export function maskIoU(a: MaskBuffer, b: MaskBuffer): number {
  let both = 0;
  let either = 0;
  const count = Math.min(a.length, b.length);
  for (let index = 0; index < count; index += 1) {
    const ua = a[index]! > 0;
    const ub = b[index]! > 0;
    if (ua && ub) both += 1;
    if (ua || ub) either += 1;
  }
  return either ? both / either : 1;
}

/** Fraction of `within` pixels whose shadow mask is set — used for caster coverage. */
export function coverage(shadow: MaskBuffer, within: MaskBuffer): number {
  let hit = 0;
  let total = 0;
  for (let index = 0; index < within.length; index += 1) {
    if (!within[index]) continue;
    total += 1;
    if (shadow[index]) hit += 1;
  }
  return total ? hit / total : 0;
}

/** Strong-edge density: fraction of mask pixels with |∇luma| above `threshold`. */
export function edgeDensity(img: PixelBuffer, mask: MaskBuffer, threshold = 40): number {
  const { width, height } = img;
  let edges = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      n += 1;
      const gx = Math.abs(lumaAt(img.data, index + 1) - lumaAt(img.data, index - 1));
      const gy = Math.abs(lumaAt(img.data, index + width) - lumaAt(img.data, index - width));
      if (gx + gy > threshold) edges += 1;
    }
  }
  return n ? edges / n : 0;
}

/**
 * High-frequency energy: mean |laplacian| of luma inside a mask. Used per
 * metal sphere disc on scene 06 — must decrease strictly with roughness.
 */
export function hfEnergy(img: PixelBuffer, mask: MaskBuffer): number {
  const { width, height } = img;
  let sum = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      const lap = Math.abs(
        4 * lumaAt(img.data, index) -
          lumaAt(img.data, index - 1) -
          lumaAt(img.data, index + 1) -
          lumaAt(img.data, index - width) -
          lumaAt(img.data, index + width)
      );
      sum += lap;
      n += 1;
    }
  }
  return n ? sum / n : 0;
}

/** Luma range (max - min) inside a mask — the r=1 sphere gradient for 06. */
export function lumaRange(img: PixelBuffer, mask: MaskBuffer): { min: number; max: number; range: number } {
  const count = img.width * img.height;
  let min = 255;
  let max = 0;
  for (let index = 0; index < count; index += 1) {
    if (!mask[index]) continue;
    const l = lumaAt(img.data, index);
    if (l < min) min = l;
    if (l > max) max = l;
  }
  return { min, max, range: max - min };
}

/** B/R channel ratio inside a mask (mean blue over mean red) — the 13 sky tint. */
export function channelRatio(img: PixelBuffer, mask: MaskBuffer, numerator: 0 | 1 | 2 = 2, denominator: 0 | 1 | 2 = 0): number {
  const count = img.width * img.height;
  let num = 0;
  let den = 0;
  let n = 0;
  for (let index = 0; index < count; index += 1) {
    if (!mask[index]) continue;
    num += img.data[index * 4 + numerator]!;
    den += img.data[index * 4 + denominator]!;
    n += 1;
  }
  return n && den > 1e-6 ? num / den : 1;
}

/** Fraction of mask pixels clipped at or above `level` of full scale. */
export function clippingFraction(img: PixelBuffer, mask: MaskBuffer, level = 0.98): number {
  const count = img.width * img.height;
  const clip = level * 255;
  let clipped = 0;
  let n = 0;
  for (let index = 0; index < count; index += 1) {
    if (!mask[index]) continue;
    n += 1;
    if (Math.max(img.data[index * 4]!, img.data[index * 4 + 1]!, img.data[index * 4 + 2]!) >= clip) clipped += 1;
  }
  return n ? clipped / n : 0;
}

/** Fraction of `within` pixels that differ shadow-on vs shadow-off (unrequested shadows). */
export function diffPixelRatio(shadowOn: PixelBuffer, shadowOff: PixelBuffer, within: MaskBuffer, threshold = 8): number {
  const count = Math.min(shadowOn.width * shadowOn.height, shadowOff.width * shadowOff.height);
  let diff = 0;
  let n = 0;
  for (let index = 0; index < count; index += 1) {
    if (!within[index]) continue;
    n += 1;
    if (Math.abs(lumaAt(shadowOn.data, index) - lumaAt(shadowOff.data, index)) > threshold) diff += 1;
  }
  return n ? diff / n : 0;
}

/** Mean absolute frame-to-frame luma diff inside a mask — CSM shimmer (17 strip). */
export function meanFrameDiff(frames: readonly PixelBuffer[], mask: MaskBuffer): number {
  if (frames.length < 2) return 0;
  let sum = 0;
  let n = 0;
  for (let f = 1; f < frames.length; f += 1) {
    const a = frames[f - 1]!;
    const b = frames[f]!;
    const count = Math.min(a.width * a.height, b.width * b.height, mask.length);
    for (let index = 0; index < count; index += 1) {
      if (!mask[index]) continue;
      sum += Math.abs(lumaAt(a.data, index) - lumaAt(b.data, index));
      n += 1;
    }
  }
  return n ? sum / n : 0;
}
