/**
 * 03-S8 contour-step oracle (#944). Pure function: no engine imports, so the
 * unit test `prd03-banding-oracle.test.ts` runs it against synthetic cases.
 *
 * PRD-03:1658 — "no contour steps > 1 LSB". A contour step is a jump in a
 * smooth gradient. Quantization without dither makes 1-LSB steps (allowed);
 * visible banding is a step of 2+ LSB. Dither noise is not a step.
 *
 * Method, on rounded 8-bit luma:
 *  1. Low-pass with a 5×5 box. Dither noise (σ≈0.5 LSB) drops to ≈0.06 LSB
 *     per adjacent difference; a sharp k-LSB step becomes a ramp of k/5 per px.
 *  2. Along x and y, the adjacent low-passed difference d minus the local
 *     background slope, taken as the smaller |slope| of two 4-px windows that
 *     sit 3–7 px to each side (so a window never straddles the measured step).
 *     Smooth ramp → ≈0; 1-LSB quantization step → ≤0.2; 2-LSB band → ≈0.4.
 *  3. Mask: no silhouette (raw neighbour |Δ| ≥ 6) within 10 px, and local
 *     background slope ≤ 1 LSB/px.
 *  4. Contour pixel: residual > 0.3 LSB/px (a step of more than 1.5 LSB).
 *     Score = contour fraction of the mask.
 * Validated by the unit test on dithered, undithered and 2-LSB-banded
 * gradients (horizontal, vertical, radial, with silhouettes).
 */

export interface ContourStepResult {
  readonly maskPixels: number;
  readonly contourPixels: number;
  readonly contourFraction: number;
  readonly maxResidualStep: number;
}

const SILHOUETTE_LSB = 6;
const SILHOUETTE_PAD = 10;
const CONTOUR_RESIDUAL = 0.3;

export function contourSteps(luma8: Float32Array | number[], width: number, height: number): ContourStepResult {
  const at = (x: number, y: number) => luma8[y * width + x]!;
  // 5×5 box via two separable passes.
  const tmp = new Float32Array(width * height);
  const lp = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0, n = 0;
      for (let d = -2; d <= 2; d++) { const xx = x + d; if (xx >= 0 && xx < width) { sum += at(xx, y); n++; } }
      tmp[y * width + x] = sum / n;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0, n = 0;
      for (let d = -2; d <= 2; d++) { const yy = y + d; if (yy >= 0 && yy < height) { sum += tmp[yy * width + x]!; n++; } }
      lp[y * width + x] = sum / n;
    }
  }
  // Silhouette proximity on the raw frame.
  const edge = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = at(x, y);
      if ((x + 1 < width && Math.abs(at(x + 1, y) - v) >= SILHOUETTE_LSB) || (y + 1 < height && Math.abs(at(x, y + 1) - v) >= SILHOUETTE_LSB)) {
        for (let dy = -SILHOUETTE_PAD; dy <= SILHOUETTE_PAD + 1; dy++) {
          for (let dx = -SILHOUETTE_PAD; dx <= SILHOUETTE_PAD + 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx >= 0 && xx < width && yy >= 0 && yy < height) edge[yy * width + xx] = 1;
          }
        }
      }
    }
  }
  const L = (x: number, y: number) => lp[y * width + x]!;
  // Residual at the gap between i and i+1 on a line accessor (needs i-7..i+8).
  const residual = (get: (i: number) => number, i: number) => {
    const d = Math.abs(get(i + 1) - get(i));
    const slopeL = Math.abs(get(i - 3) - get(i - 7)) / 4;
    const slopeR = Math.abs(get(i + 8) - get(i + 4)) / 4;
    const slope = Math.min(slopeL, slopeR);
    return { value: d - slope, slope };
  };
  let maskPixels = 0, contourPixels = 0, maxResidualStep = 0;
  for (let y = 8; y < height - 8; y++) {
    for (let x = 8; x < width - 8; x++) {
      if (edge[y * width + x]) continue;
      const rx = residual((i) => L(i, y), x);
      const ry = residual((i) => L(x, i), y);
      if (rx.slope > 1 || ry.slope > 1) continue;
      maskPixels++;
      const r = Math.max(rx.value, ry.value);
      maxResidualStep = Math.max(maxResidualStep, r);
      if (r > CONTOUR_RESIDUAL) contourPixels++;
    }
  }
  return { maskPixels, contourPixels, contourFraction: maskPixels ? contourPixels / maskPixels : 0, maxResidualStep };
}
