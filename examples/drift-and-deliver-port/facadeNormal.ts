/**
 * Gridlock Courier (GU47 WP-28 GC-M2): the facade normal canvas, derived from the painted facade albedo.
 *
 * Height is the albedo's luminance (deep window glass and their reveals are darker than the stucco, mortar lines and
 * slab lines darker still), so the normal map recesses the windows and gives the coursed stucco a relief that the
 * raking sun picks up. Built once per facade at half the albedo size (9 facades x 512^2 on High, 256^2 on Low),
 * tangent-space, OpenGL convention (+y up), linear.
 */

/** Relief strength: height step (0..1 luminance) to slope. */
export const FACADE_NORMAL_STRENGTH = 2.2;

/** Luminance (0..1) of an RGBA buffer, downsampled by `step` (box filter). */
export function heightField(rgba: ArrayLike<number>, w: number, h: number, step = 1): { data: Float32Array; w: number; h: number } {
  const ow = Math.max(1, Math.floor(w / step)), oh = Math.max(1, Math.floor(h / step));
  const out = new Float32Array(ow * oh);
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    let sum = 0;
    for (let dy = 0; dy < step; dy++) for (let dx = 0; dx < step; dx++) {
      const i = 4 * ((y * step + dy) * w + (x * step + dx));
      sum += (0.2126 * rgba[i]! + 0.7152 * rgba[i + 1]! + 0.0722 * rgba[i + 2]!) / 255;
    }
    out[y * ow + x] = sum / (step * step);
  }
  return { data: out, w: ow, h: oh };
}

/**
 * Tangent-space normal map (RGBA, alpha 255) from a height field with wrapped (tiling) central differences. Canvas
 * rows run top to bottom, so +v (up the wall) is -y in the buffer.
 */
export function heightToNormal(height: { data: Float32Array; w: number; h: number }, strength = FACADE_NORMAL_STRENGTH): Uint8ClampedArray {
  const { data, w, h } = height;
  const out = new Uint8ClampedArray(w * h * 4);
  const at = (x: number, y: number): number => data[((y + h) % h) * w + ((x + w) % w)]!;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * strength;
    const dv = (at(x, y - 1) - at(x, y + 1)) * 0.5 * strength;
    let nx = -dx, ny = -dv, nz = 1;
    const len = Math.hypot(nx, ny, nz);
    nx /= len; ny /= len; nz /= len;
    const i = 4 * (y * w + x);
    out[i] = Math.round((nx * 0.5 + 0.5) * 255);
    out[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
    out[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    out[i + 3] = 255;
  }
  return out;
}
