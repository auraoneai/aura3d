/**
 * The exhaust and spore sprites as quads, for a requested WebGPU backend (`?backend=webgpu|auto`).
 *
 * The default WebGL2 path draws them as `gl_PointSize` points (POINTS_VERTEX / POINTS_FRAGMENT, unchanged). WebGPU has
 * no point size, and the engine has no point-quad program for a custom point material, so when a lab backend is
 * requested the port draws each point as a screen-aligned quad of `size` pixels instead: four corners sharing the point's
 * position, `uv` as the corner, and the same radial falloff the point sprite evaluates from `gl_PointCoord`. The GLSL
 * half draws the same quads if the request falls back to WebGL2.
 */

const QUAD_VERTEX = /* glsl */ `
attribute float size;
attribute float fade;
attribute vec3 tint;
out float vFade;
out vec3 vTint;
out vec2 vCorner;
void main() {
  vFade = fade;
  vTint = tint;
  vCorner = uv * 2.0 - 1.0;
  vec4 clip = modelViewProjectionMatrix * vec4(position, 1.0);
  clip.xy += vCorner * size / max(u_resolution, vec2(1.0)) * clip.w;
  gl_Position = clip;
}`;

const QUAD_FRAGMENT = /* glsl */ `
in float vFade;
in vec3 vTint;
in vec2 vCorner;
out vec4 outColor;
void main() {
  float a = (1.0 - smoothstep(0.0, 1.0, length(vCorner))) * vFade;
  outColor = vec4(vTint * a, a);
}`;

/** Inputs at the geometry's WebGPU locations: uv 2, then fade 3, size 5, tint 6 (custom pool, name order). */
const QUAD_VERTEX_WGSL = /* wgsl */ `/* @aura3d-bindings */
override a3dZeroToOneProjection: bool = false;
fn a3dRasterPosition(clip: vec4<f32>) -> vec4<f32> {
  return vec4<f32>(clip.xy, select(clip.z * 0.5 + clip.w * 0.5, clip.z, a3dZeroToOneProjection), clip.w);
}
struct QuadVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) fade: f32,
  @location(1) tint: vec3<f32>,
  @location(2) corner: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>, @location(3) fade: f32, @location(5) size: f32, @location(6) tint: vec3<f32>) -> QuadVarying {
  var out: QuadVarying;
  out.fade = fade;
  out.tint = tint;
  out.corner = a_uv * 2.0 - vec2<f32>(1.0);
  var clip = aura.u_modelViewProjection * vec4<f32>(a_position, 1.0);
  clip = vec4<f32>(clip.xy + out.corner * size / max(aura.u_resolution, vec2<f32>(1.0)) * clip.w, clip.z, clip.w);
  out.position = a3dRasterPosition(clip);
  return out;
}`;

const QUAD_FRAGMENT_WGSL = /* wgsl */ `/* @aura3d-bindings */
@fragment fn fs_main(@location(0) vFade: f32, @location(1) vTint: vec3<f32>, @location(2) vCorner: vec2<f32>) -> @location(0) vec4<f32> {
  let a = (1.0 - smoothstep(0.0, 1.0, length(vCorner))) * vFade;
  return vec4<f32>(vTint * a, a);
}`;

export const POINT_QUAD_SHADERS = {
  glsl: { vertex: QUAD_VERTEX, fragment: QUAD_FRAGMENT },
  wgsl: { vertex: QUAD_VERTEX_WGSL, fragment: QUAD_FRAGMENT_WGSL }
} as const;

export { expandToCorners, pointQuadArrays, quadUpdater } from "../shared/point-quads";
