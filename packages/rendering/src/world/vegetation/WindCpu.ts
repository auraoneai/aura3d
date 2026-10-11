/**
 * PRD-10 S7 — CPU reference twin of the `a3d_prd10_wind` GLSL/WGSL chunk
 * (`shaders/wind.ts`). Same formula, op for op, so the browser parity spec
 * (`tests/browser/qr-prd10-wind-chunk.spec.ts`) can hold the GPU result to
 * ≤ 1e-4 and CPU-side systems (picking, bounds) can predict the bend.
 *
 * `gustSample` is the value the shader reads from `u_windNoise` (.r, 0..1) at
 * the instance's gust UV; the caller supplies it, so the twin stays
 * independent of texture filtering.
 */

export type WindVec3 = readonly [number, number, number];
export type WindVec4 = readonly [number, number, number, number];

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * `ubo` is the packed A3DWind block from `packWindUbo`:
 * [dir.x, dir.z, strength, time, gustStrength, 1/gustScale, -, -].
 * Returns the length-preserving offset (bent − localPos).
 */
export function windOffsetCpu(
  ubo: ArrayLike<number>,
  localPos: WindVec3,
  instanceOrigin: WindVec3,
  weights: WindVec4,
  assetHeight: number,
  gustSample: number
): [number, number, number] {
  const dirX = ubo[0]!;
  const dirY = ubo[1]!;
  const strength = ubo[2]!;
  const t = ubo[3]!;
  const gust = gustSample * ubo[4]!;
  const h = clamp01(localPos[1] / Math.max(assetHeight, 0.01));
  const bend = (strength + gust) * h * h * weights[0];
  const sway = Math.sin(t * (1.1 + weights[2]) + (instanceOrigin[0] * 0.37 + instanceOrigin[2] * 0.71)) * 0.25 * strength * weights[0];
  const k = (bend + sway) * 0.35 * assetHeight;
  let ox = dirX * k;
  let oy = 0;
  let oz = dirY * k;
  const flutter =
    Math.sin(t * 7.3 + weights[2] * 6.2831 + (localPos[0] * 2.1 + localPos[1] * 1.7 + localPos[2] * 2.9)) * 0.035 * (strength + gust) * weights[1];
  ox += flutter;
  oy += flutter * 0.4;
  oz += -flutter;
  const bx = localPos[0] + ox;
  const by = localPos[1] + oy;
  const bz = localPos[2] + oz;
  const bentLen = Math.hypot(bx, by, bz);
  const len = Math.hypot(localPos[0], localPos[1], localPos[2]);
  // GLSL normalize(0) is undefined; the chunk is only fed non-root vertices.
  const s = bentLen > 0 ? len / bentLen : 0;
  return [bx * s - localPos[0], by * s - localPos[1], bz * s - localPos[2]];
}
