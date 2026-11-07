import type { material } from "@aura3d/engine";

type CustomSpec = Parameters<typeof material.custom>[0];

/** Half extents of the shield ellipsoid (primitives.sphere size / 2); the vertex shader rebuilds true ellipsoid normals from them. */
export const SHIELD_SIZE: [number, number, number] = [2.9, 1.6, 4.9];

const VERTEX = /* glsl */ `
out vec3 vN;
out vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vec3 nLocal = position / (shieldRadii * shieldRadii);
  vN = mat3(modelMatrix) * nLocal;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = /* glsl */ `
#include <a3d_math>
#include <colorspace_decode>
in vec3 vN;
in vec3 vW;
out vec4 outColor;
void main() {
  vec3 n = a3dSafeNormalize(vN, vec3(0.0, 1.0, 0.0));
  vec3 v = a3dSafeNormalize(cameraPosition - vW, vec3(0.0, 0.0, 1.0));
  float rim = 1.0 - abs(dot(n, v));
  float rim3 = rim * rim * rim;
  float ripple = 0.5 + 0.5 * sin(vW.y * 8.0 - uTime * 3.2 + vW.z * 1.5);
  float alpha = a3dSaturate((0.025 + rim3 * 0.9 + ripple * rim * 0.12) * shieldPulse);
  vec3 col = a3dSrgbToLinear(shieldColor) * (0.55 + rim3 * 1.6);
  outColor = vec4(col, alpha);
}`;


/**
 * A4 (portable pair): the WGSL twin of the shield shell for the WebGPU backend. WebGL2 (the default and the only backend this
 * game mounts today) keeps drawing the GLSL above, so the 4.7.x pixels are untouched; the twin is the first step of the A3
 * unblock chain (the other custom shaders still lack one, so `?backend=` is not forwarded).
 */
const WGSL_VERTEX = `/* @aura3d-bindings */
struct ShieldVertex {
  @builtin(position) position: vec4<f32>,
  @location(0) n: vec3<f32>,
  @location(1) w: vec3<f32>,
};
@vertex fn vs_main(@location(0) position: vec3<f32>) -> ShieldVertex {
  var out: ShieldVertex;
  let world = aura.u_modelMatrix * vec4<f32>(position, 1.0);
  let nLocal = position / (aura.u_shieldRadii * aura.u_shieldRadii);
  let clip = aura.u_modelViewProjection * vec4<f32>(position, 1.0);
  out.position = vec4<f32>(clip.xy, clip.z * 0.5 + clip.w * 0.5, clip.w);
  out.w = world.xyz;
  out.n = (aura.u_modelMatrix * vec4<f32>(nLocal, 0.0)).xyz;
  return out;
}`;

const WGSL_FRAGMENT = `/* @aura3d-bindings */
struct ShieldFragment { @location(0) n: vec3<f32>, @location(1) w: vec3<f32> };
fn srgb_to_linear(c: vec3<f32>) -> vec3<f32> {
  let lo = c / 12.92;
  let hi = pow((c + vec3<f32>(0.055)) / 1.055, vec3<f32>(2.4));
  return select(hi, lo, c <= vec3<f32>(0.04045));
}
@fragment fn fs_main(input: ShieldFragment) -> @location(0) vec4<f32> {
  var nl = length(input.n);
  var n = vec3<f32>(0.0, 1.0, 0.0);
  if (nl > 1e-6) { n = input.n / nl; }
  var vv = aura.u_cameraPosition - input.w;
  var vl = length(vv);
  var v = vec3<f32>(0.0, 0.0, 1.0);
  if (vl > 1e-6) { v = vv / vl; }
  let rim = 1.0 - abs(dot(n, v));
  let rim3 = rim * rim * rim;
  let ripple = 0.5 + 0.5 * sin(input.w.y * 8.0 - aura.u_time * 3.2 + input.w.z * 1.5);
  let alpha = clamp((0.025 + rim3 * 0.9 + ripple * rim * 0.12) * aura.u_shieldPulse, 0.0, 1.0);
  let col = srgb_to_linear(aura.u_shieldColor) * (0.55 + rim3 * 1.6);
  return vec4<f32>(col, alpha);
}`;

/** A thin fresnel shell: the car stays fully visible, only the silhouette rim glows. */
export function shieldSpec(): CustomSpec {
  return {
    glsl: { vertex: VERTEX, fragment: FRAGMENT },
    wgsl: { vertex: WGSL_VERTEX, fragment: WGSL_FRAGMENT },
    uniforms: {
      shieldRadii: { type: "vec3", value: [SHIELD_SIZE[0] / 2, SHIELD_SIZE[1] / 2, SHIELD_SIZE[2] / 2] },
      shieldColor: { type: "vec3", value: [0.16, 0.78, 1.0] },
      shieldPulse: { type: "f32", value: 1 }
    },
    transparent: true,
    depthWrite: false,
    blending: "additive",
    side: "front"
  };
}
