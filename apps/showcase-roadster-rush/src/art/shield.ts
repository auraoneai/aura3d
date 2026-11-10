import type { material } from "@aura3d/engine";
import { WGSL_CLIP, wgslStage } from "./wgsl";

type CustomSpec = Parameters<typeof material.custom>[0];

/**
 * Tight aerodynamic energy shell (`[2.24, 1.24, 4.42]`, half-height `0.62 m`), mounted at `pRoot[1] + 0.72` so the bottom
 * clears the asphalt deck (`y >= 0.10 m`) without clipping while hugging the roadster silhouette.
 */
export const SHIELD_SIZE: [number, number, number] = [2.24, 1.24, 4.42];

const VERTEX = /* glsl */ `
out vec3 vN;
out vec3 vW;
out vec3 vLocal;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vLocal = position;
  vec3 nLocal = position / (shieldRadii * shieldRadii);
  vN = mat3(modelMatrix) * nLocal;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = /* glsl */ `
#include <a3d_math>
#include <colorspace_decode>
in vec3 vN;
in vec3 vW;
in vec3 vLocal;
out vec4 outColor;

float hexEdge(vec2 p) {
  const vec2 s = vec2(1.0, 1.7320508);
  vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 h = vec4(p - hC.xy * s, p - (hC.zw + 0.5) * s);
  vec2 q = abs(dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw);
  float d = 0.5 - max(dot(q, s * 0.5), q.x);
  return 1.0 - smoothstep(0.015, 0.065, d);
}

void main() {
  vec3 n = a3dSafeNormalize(vN, vec3(0.0, 1.0, 0.0));
  vec3 v = a3dSafeNormalize(cameraPosition - vW, vec3(0.0, 0.0, 1.0));
  float rim = 1.0 - abs(dot(n, v));
  float rim3 = rim * rim * rim;
  float rim5 = rim3 * rim * rim;
  float hex = hexEdge(vec2(atan(vLocal.x, vLocal.z) * 2.8, vLocal.y * 5.2));
  float ripple = 0.5 + 0.5 * sin(vW.y * 9.0 - uTime * 3.6 + vLocal.z * 2.4);
  // Fresnel-edge-only energy shell: center alpha <= 0.02 so the cobalt car body remains crystal clear inside
  float alpha = a3dSaturate((0.018 + rim5 * 0.92 + hex * rim3 * 0.42 + ripple * rim3 * 0.14) * shieldPulse);
  vec3 base = a3dSrgbToLinear(shieldColor);
  vec3 col = base * (0.35 + rim3 * 1.65 + hex * rim3 * 0.95);
  outColor = vec4(col, alpha);
}`;

const WGSL_VERTEX = wgslStage([WGSL_CLIP], /* wgsl */ `
struct ShieldVertex {
  @builtin(position) position: vec4<f32>,
  @location(0) n: vec3<f32>,
  @location(1) w: vec3<f32>,
  @location(2) localPos: vec3<f32>,
};
@vertex fn vs_main(@location(0) position: vec3<f32>) -> ShieldVertex {
  var out: ShieldVertex;
  let world = aura.u_modelMatrix * vec4<f32>(position, 1.0);
  let nLocal = position / (aura.u_shieldRadii * aura.u_shieldRadii);
  let clip = aura.u_modelViewProjection * vec4<f32>(position, 1.0);
  out.position = a3dRasterPosition(clip);
  out.w = world.xyz;
  out.localPos = position;
  out.n = (aura.u_modelMatrix * vec4<f32>(nLocal, 0.0)).xyz;
  return out;
}`);

const WGSL_FRAGMENT = `/* @aura3d-bindings */
struct ShieldFragment { @location(0) n: vec3<f32>, @location(1) w: vec3<f32>, @location(2) localPos: vec3<f32> };
fn srgb_to_linear(c: vec3<f32>) -> vec3<f32> {
  let lo = c / 12.92;
  let hi = pow((c + vec3<f32>(0.055)) / 1.055, vec3<f32>(2.4));
  return select(hi, lo, c <= vec3<f32>(0.04045));
}
fn hex_edge(p: vec2<f32>) -> f32 {
  let s = vec2<f32>(1.0, 1.7320508);
  let hC = floor(vec4<f32>(p, p - vec2<f32>(0.5, 1.0)) / vec4<f32>(s, s)) + vec4<f32>(0.5);
  let h = vec4<f32>(p - hC.xy * s, p - (hC.zw + vec2<f32>(0.5)) * s);
  let q = abs(select(h.zw, h.xy, dot(h.xy, h.xy) < dot(h.zw, h.zw)));
  let d = 0.5 - max(dot(q, s * 0.5), q.x);
  return 1.0 - smoothstep(0.015, 0.065, d);
}
@fragment fn fs_main(input: ShieldFragment) -> @location(0) vec4<f32> {
  let nl = length(input.n);
  var n = vec3<f32>(0.0, 1.0, 0.0);
  if (nl > 1e-6) { n = input.n / nl; }
  let vv = aura.u_cameraPosition - input.w;
  let vl = length(vv);
  var v = vec3<f32>(0.0, 0.0, 1.0);
  if (vl > 1e-6) { v = vv / vl; }
  let rim = 1.0 - abs(dot(n, v));
  let rim3 = rim * rim * rim;
  let rim5 = rim3 * rim * rim;
  let hex = hex_edge(vec2<f32>(atan2(input.localPos.x, input.localPos.z) * 2.8, input.localPos.y * 5.2));
  let ripple = 0.5 + 0.5 * sin(input.w.y * 9.0 - aura.u_time * 3.6 + input.localPos.z * 2.4);
  let alpha = clamp((0.018 + rim5 * 0.92 + hex * rim3 * 0.42 + ripple * rim3 * 0.14) * aura.u_shieldPulse, 0.0, 1.0);
  let base = srgb_to_linear(aura.u_shieldColor);
  let col = base * (0.35 + rim3 * 1.65 + hex * rim3 * 0.95);
  return vec4<f32>(col, alpha);
}`;

/** A thin Fresnel hexagonal energy shell: center alpha <= 0.02 so the hero car stays clear, only the rim lattice glows. */
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
