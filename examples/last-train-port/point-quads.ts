/**
 * The weather (snow) and mote sprites as quads, for a requested lab backend (`?backend=webgpu|auto`).
 *
 * The default WebGL2 path draws them as `gl_PointSize` points (POINTS_VERTEX / POINTS_FRAGMENT, unchanged). WebGPU has no
 * point size, so with a lab backend each point becomes a screen-aligned quad of `size` pixels: four corners sharing the
 * point's position, `uv` as the corner, and the point sprite's round falloff (`d = dot(c, c)`, discard past 1, alpha
 * `smoothstep(1, 0, d) * fade`, colour the sRGB-decoded `weatherTint`). The GLSL half draws the same quads if the request
 * falls back to WebGL2. Corner/array helpers: ../shared/sprite-quads.ts.
 */
import { WGSL_CLIP, WGSL_COLOR, wgslStage } from "../../apps/showcase-port-shared/wgsl-twins";

export { quadGeometryInput, quadUpdater } from "../shared/sprite-quads";

const QUAD_VERTEX = /* glsl */ `
attribute float size;
attribute float fade;
out float vFade;
out vec2 vCorner;
void main() {
  vFade = fade;
  vCorner = uv * 2.0 - 1.0;
  vec4 clip = modelViewProjectionMatrix * vec4(position, 1.0);
  clip.xy += vCorner * size / max(u_resolution, vec2(1.0)) * clip.w;
  gl_Position = clip;
}`;

const QUAD_FRAGMENT = /* glsl */ `
#include <colorspace_decode>
in float vFade;
in vec2 vCorner;
out vec4 outColor;
void main() {
  float d = dot(vCorner, vCorner);
  if (d > 1.0) discard;
  outColor = vec4(a3dSrgbToLinear(weatherTint), smoothstep(1.0, 0.0, d) * vFade);
}`;

/** Inputs at the geometry's WebGPU locations: uv 2, then fade 3, size 5 (custom pool, name order). */
const QUAD_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct QuadVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) fade: f32,
  @location(1) corner: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>, @location(3) fade: f32, @location(5) size: f32) -> QuadVarying {
  var out: QuadVarying;
  out.fade = fade;
  out.corner = a_uv * 2.0 - vec2<f32>(1.0);
  var clip = aura.u_modelViewProjection * vec4<f32>(a_position, 1.0);
  clip = vec4<f32>(clip.xy + out.corner * size / max(aura.u_resolution, vec2<f32>(1.0)) * clip.w, clip.z, clip.w);
  out.position = a3dRasterPosition(clip);
  return out;
}`);

const QUAD_FRAGMENT_WGSL = wgslStage([WGSL_COLOR], /* wgsl */ `
@fragment fn fs_main(@location(0) vFade: f32, @location(1) vCorner: vec2<f32>) -> @location(0) vec4<f32> {
  let d = dot(vCorner, vCorner);
  if (d > 1.0) { discard; }
  return vec4<f32>(a3dSrgbToLinear(aura.u_weatherTint), smoothstep(1.0, 0.0, d) * vFade);
}`);

export const POINT_QUAD_SHADERS = {
  glsl: { vertex: QUAD_VERTEX, fragment: QUAD_FRAGMENT },
  wgsl: { vertex: QUAD_VERTEX_WGSL, fragment: QUAD_FRAGMENT_WGSL }
} as const;
