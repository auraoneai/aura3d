/**
 * CPU mirrors of the PRD-02 §8 chunk math (item 1911): the ChunkHarness
 * browser test compares GLSL output against these; unit tests compare them
 * against three r185's `getDistanceAttenuation` /
 * `getHemisphereLightIrradiance` within 1e-6.
 */

type V3 = readonly [number, number, number];

/** three r185 `getDistanceAttenuation` verbatim. */
export function a3dDistanceFalloff(lightDistance: number, cutoffDistance: number, decayExponent: number): number {
  const distanceFalloff = 1.0 / Math.max(Math.pow(lightDistance, decayExponent), 0.01);
  if (cutoffDistance > 0.0) {
    const x = Math.min(Math.max(1.0 - Math.pow(lightDistance / cutoffDistance, 4.0), 0.0), 1.0);
    return distanceFalloff * x * x;
  }
  return distanceFalloff;
}

const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/**
 * three r185 `getHemisphereLightIrradiance` verbatim:
 * `mix(groundColor, skyColor, 0.5·dotNL+0.5)`. Mirrors the
 * `a3d_prd02_lighting_ibl` hemisphere term (`u_hemi*` uniforms are
 * intensity-premultiplied host-side — pass premultiplied colours here).
 */
export function a3dHemisphereIrradiance(
  skyColor: V3,
  groundColor: V3,
  direction: V3,
  normal: V3
): V3 {
  const w = 0.5 * dot3(normalize(normal), normalize(direction)) + 0.5;
  return [
    groundColor[0] + (skyColor[0] - groundColor[0]) * w,
    groundColor[1] + (skyColor[1] - groundColor[1]) * w,
    groundColor[2] + (skyColor[2] - groundColor[2]) * w
  ];
}
