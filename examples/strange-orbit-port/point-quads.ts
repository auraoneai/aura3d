/**
 * The star, stardust and exhaust sprites as quads, for a requested lab backend (`?backend=webgpu|auto`).
 *
 * The default WebGL2 path draws them as `gl_PointSize` points (POINTS_VERTEX / POINTS_FRAGMENT, unchanged). WebGPU has no
 * point size (a point list rasterises one pixel), so when a lab backend is requested the port draws each point as a
 * screen-aligned quad of `size` pixels instead: four corners sharing the point's position, `uv` as the corner, and the same
 * round falloff the point sprite evaluates from `gl_PointCoord` (`d = dot(c, c)`, discard past 1, `smoothstep(1, 0, d)`).
 * The GLSL half draws the same quads if the request falls back to WebGL2. The corner/array helpers are in ../shared/sprite-quads.ts.
 */
import { WGSL_CLIP, wgslStage } from "../../apps/showcase-port-shared/wgsl-twins";
export { quadGeometryInput, quadUpdater } from "../shared/sprite-quads";

const QUAD_VERTEX = /* glsl */ `
attribute float size;
attribute vec3 tint;
attribute float fade;
out vec3 vTint;
out float vFade;
out vec2 vCorner;
void main() {
  vTint = tint;
  vFade = fade;
  vCorner = uv * 2.0 - 1.0;
  vec4 clip = modelViewProjectionMatrix * vec4(position, 1.0);
  clip.xy += vCorner * size / max(u_resolution, vec2(1.0)) * clip.w;
  gl_Position = clip;
}`;

const QUAD_FRAGMENT = /* glsl */ `
in vec3 vTint;
in float vFade;
in vec2 vCorner;
out vec4 outColor;
void main() {
  float d = dot(vCorner, vCorner);
  if (d > 1.0) discard;
  float soft = smoothstep(1.0, 0.0, d);
  outColor = vec4(vTint * (additive > 0.5 ? 1.4 : 1.0), soft * vFade);
}`;

/** Inputs at the geometry's WebGPU locations: uv 2, then fade 3, size 5, tint 6 (custom pool, name order). */
const QUAD_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct QuadVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) tint: vec3<f32>,
  @location(1) fade: f32,
  @location(2) corner: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>, @location(3) fade: f32, @location(5) size: f32, @location(6) tint: vec3<f32>) -> QuadVarying {
  var out: QuadVarying;
  out.tint = tint;
  out.fade = fade;
  out.corner = a_uv * 2.0 - vec2<f32>(1.0);
  var clip = aura.u_modelViewProjection * vec4<f32>(a_position, 1.0);
  clip = vec4<f32>(clip.xy + out.corner * size / max(aura.u_resolution, vec2<f32>(1.0)) * clip.w, clip.z, clip.w);
  out.position = a3dRasterPosition(clip);
  return out;
}`);

const QUAD_FRAGMENT_WGSL = wgslStage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vTint: vec3<f32>, @location(1) vFade: f32, @location(2) vCorner: vec2<f32>) -> @location(0) vec4<f32> {
  let d = dot(vCorner, vCorner);
  if (d > 1.0) { discard; }
  let soft = smoothstep(1.0, 0.0, d);
  return vec4<f32>(vTint * select(1.0, 1.4, aura.u_additive > 0.5), soft * vFade);
}`);

export const POINT_QUAD_SHADERS = {
  glsl: { vertex: QUAD_VERTEX, fragment: QUAD_FRAGMENT },
  wgsl: { vertex: QUAD_VERTEX_WGSL, fragment: QUAD_FRAGMENT_WGSL }
} as const;
