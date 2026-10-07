// PRD-07 P5-T2 — §8.2 procedural volume source (rain/snow/marine snow/dust),
// GLSL ES 3.00. Registered as chunk "a3d_prd07_volume"; the CPU mirror in
// ProceduralVolumeEmitter.ts (a3dProceduralVolumePosCpu) keeps constants and
// hashing identical so CPU-side culling matches the shader.

import { registerShaderChunk } from "../../contracts/program";

export const PRD07_VOLUME_CHUNK_NAME = "a3d_prd07_volume";

export const PRD07_VOLUME_CHUNK_GLSL = `
// ${PRD07_VOLUME_CHUNK_NAME} — §8.2
uniform vec3 u_volumeExtent;       // volume around the camera (world units)
uniform vec3 u_fallVelocity;       // per-particle fall dir·speed
uniform vec3 u_sway;               // sway amplitude per axis
uniform float u_swayFreq;
uniform float u_seed;
uniform vec3 u_cameraPosition;
uniform float u_volumeTime;

vec3 a3dHash31(float x) {
  vec3 p = fract(vec3(x) * vec3(0.1031, 0.1030, 0.0973));
  p += vec3(dot(p, p.yzx + 33.33));
  return fract((p.xxy + p.yzz) * p.zyx);
}

// §8.2: hash position + fall + sway, wrapped around the camera.
vec3 a3dProceduralVolumePos(int id, float t) {
  vec3 h = a3dHash31(float(id) * 0.6180339 + u_seed);             // [0,1)^3
  vec3 p = h * u_volumeExtent + u_fallVelocity * t + u_sway * sin(t * u_swayFreq + h.x * 6.2831);
  return u_cameraPosition + mod(p - u_cameraPosition + u_volumeExtent * 0.5, u_volumeExtent) - u_volumeExtent * 0.5;
}

// Fade at volume edges to hide the wrap seam (§8.2).
float a3dProceduralVolumeEdgeFade(vec3 pos, vec3 extent) {
  vec3 edge = abs(pos - u_cameraPosition);
  vec3 f = clamp((extent * 0.5 - edge) / max(extent * 0.15, vec3(1e-4)), 0.0, 1.0);
  return min(f.x, min(f.y, f.z));
}
`;

/** Idempotent registration — safe to call from the lane barrel. */
export function registerPrd07VolumeChunk(): void {
  try {
    registerShaderChunk({
      name: PRD07_VOLUME_CHUNK_NAME,
      owner: "prd07",
      stage: "vertex",
      glsl: PRD07_VOLUME_CHUNK_GLSL
    });
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith("SHADER_CHUNK_DUPLICATE"))) throw error;
  }
}
