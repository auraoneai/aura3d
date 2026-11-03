/**
 * Aura implementation of the uv transform material operation.
 * Its WGSL companion (physical-wgsl/uv_transform.wgsl.ts) mirrors it.
 * Equations: KHR_texture_transform affine T * R * S (PRD-04 §8.10).
 */
import type { ShaderChunk } from "../../contracts/program";
import WGSL from "../physical-wgsl/uv_transform.wgsl.js";

const glsl = /* glsl */ `
// KHR_texture_transform uses an affine point transform on the selected set.
vec2 a3dPrd04UvSelect(int texCoord, vec2 uv0, vec2 uv1) {
  return texCoord == 1 ? uv1 : uv0;
}
vec2 a3dPrd04UvTransform(mat3 transform, int texCoord, vec2 uv0, vec2 uv1) {
  vec2 uv = a3dPrd04UvSelect(texCoord, uv0, uv1);
  vec3 transformed = transform[0] * uv.x + transform[1] * uv.y + transform[2];
  return transformed.xy;
}
`;

export const A3D_PRD04_UV_TRANSFORM: ShaderChunk = {
  name: "a3d_prd04_uv_transform", owner: "prd04", glsl, wgsl: WGSL,
  stage: "fragment", requires: []
};
