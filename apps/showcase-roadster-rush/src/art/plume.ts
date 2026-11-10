/**
 * GU47 AO-M4: energy plumes. The thruster cylinders (rear, ventral, lateral, the Rocket Send cone and the sky-lane jets) keep
 * their nodes, sizes and per-frame scales; only the material changes from a flat emissive to an additive fresnel cone:
 *
 * - the vertex stage pinches the unit cylinder (radius 0.5, y -0.5..0.5) toward its tip, so a plume reads as a cone from the
 *   nozzle (local -y, where every caller anchors it) to the tip (+y);
 * - the fragment stage glows at the silhouette (fresnel edge in the plume colour), burns white-hot along the view-facing axis
 *   near the nozzle (the core), and breaks the body up with value noise scrolling from nozzle to tip.
 *
 * Draws unchanged (same nodes, one material each). Reduced motion stops the scroll (`plumeScroll` 0, PRD §6.3); the core
 * never flashes, so reduced flash needs nothing. Low keeps the same shader (no extra pass).
 */
import type { material } from "@aura3d/engine";
import { hexToUnit } from "./look";
import { WGSL_CLIP, WGSL_COLOR, WGSL_MATH, wgslStage } from "./wgsl";

type CustomSpec = Parameters<typeof material.custom>[0];

export interface ApexPlumeOptions {
  /** Edge (fresnel) colour, sRGB hex. */
  readonly color: string;
  /** Overall gain; the old emissive intensity of the same plume. */
  readonly intensity: number;
  /** Tip radius as a fraction of the nozzle radius (0..1). */
  readonly tipRadius?: number;
  /**
   * AO-V2 heat shimmer (0..1): the cone's outer skin wobbles and carries fine heat bands. The engine has no screen-space
   * refraction pass, so this is an emissive approximation on the same draw (Rocket Send only).
   */
  readonly shimmer?: number;
}

/** Scroll speed (noise cells per second, nozzle to tip); 0 under reduced motion. */
export const APEX_PLUME_SCROLL = 3.4;

export function plumeScroll(reducedMotion: boolean): number {
  return reducedMotion ? 0 : APEX_PLUME_SCROLL;
}

/** Hot core colour (linear, before gain): near-white with a cyan cast, the brightest pixels of a plume. */
export const APEX_PLUME_CORE: readonly [number, number, number] = [0.92, 0.98, 1.0];

const VERTEX = /* glsl */ `
out vec3 vN;
out vec3 vW;
out float vAlong;
out float vAngle;
void main() {
  // unit cylinder: radius 0.5, y -0.5 (nozzle) .. 0.5 (tip); pinch the radius toward the tip
  float t = clamp(position.y + 0.5, 0.0, 1.0);
  float r = mix(1.0, plumeTip, t);
  // heat shimmer: a travelling radial wobble that grows toward the tip (0 when plumeShimmer is 0 or the scroll is stopped)
  float angle = atan(position.z, position.x);
  r *= 1.0 + plumeShimmer * t * 0.22 * sin(position.y * 23.0 - uTime * plumeScroll * 7.0 + angle * 3.0) * step(0.001, plumeScroll);
  vec3 local = vec3(position.x * r, position.y, position.z * r);
  mat4 m = modelMatrix * instanceMatrix;
  vec4 w = m * vec4(local, 1.0);
  vW = w.xyz;
  vN = mat3(m) * vec3(position.x, 0.0, position.z);
  vAlong = t;
  vAngle = angle;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAGMENT = /* glsl */ `
#include <a3d_math>
#include <colorspace_decode>
in vec3 vN;
in vec3 vW;
in float vAlong;
in float vAngle;
out vec4 outColor;
float plumeHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float plumeNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = plumeHash(i);
  float b = plumeHash(i + vec2(1.0, 0.0));
  float c = plumeHash(i + vec2(0.0, 1.0));
  float d = plumeHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
void main() {
  vec3 n = a3dSafeNormalize(vN, vec3(1.0, 0.0, 0.0));
  vec3 v = a3dSafeNormalize(cameraPosition - vW, vec3(0.0, 0.0, 1.0));
  float facing = abs(dot(n, v));
  float edge = pow(1.0 - facing, 2.0);
  float tip = 1.0 - vAlong;
  // noise scrolls from nozzle to tip; 6 cells around, 5 along
  vec2 q = vec2(vAngle * 0.9549, vAlong * 5.0 - uTime * plumeScroll);
  float noise = 0.55 + 0.45 * plumeNoise(q) * plumeNoise(q * 2.1 + 7.3);
  float diamonds = pow(max(0.0, cos(vAlong * 22.0 - uTime * plumeScroll * 2.2)), 8.0) * (1.0 - vAlong * 0.72) * pow(facing, 2.6);
  float core = pow(facing, 6.0) * tip * tip + diamonds * 0.58;
  float bands = 0.5 + 0.5 * sin(vAlong * 41.0 - uTime * plumeScroll * 9.0 + vAngle * 2.0);
  float heat = plumeShimmer * edge * bands * vAlong * 0.6;
  float body = a3dSaturate(edge * 0.85 + 0.25) * tip * noise + heat + diamonds * 0.25;
  vec3 col = a3dSrgbToLinear(plumeColor) * body + plumeCore * core;
  float a = a3dSaturate(body + core);
  outColor = vec4(a3dFinite(col * plumeGain), a);
}`;

/**
 * A3/W6: the WGSL twins for the WebGPU backend; WebGL2 keeps drawing the GLSL above (same pixels as before). GLSL reads
 * `instanceMatrix` as identity on a plain node; a WebGPU pipeline cannot declare inputs no buffer feeds, so the twin comes
 * in two vertex variants: plain nodes (the player's plumes) and instanced nodes (the sky-lane jets).
 */
function plumeWgslVertex(instanced: boolean): string {
  const inputs = instanced
    ? `@location(0) a_position: vec3<f32>,
  @location(8) a_instanceMatrix0: vec4<f32>,
  @location(9) a_instanceMatrix1: vec4<f32>,
  @location(10) a_instanceMatrix2: vec4<f32>,
  @location(11) a_instanceMatrix3: vec4<f32>`
    : "@location(0) a_position: vec3<f32>";
  const model = instanced
    ? "aura.u_modelMatrix * mat4x4<f32>(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3)"
    : "aura.u_modelMatrix";
  return wgslStage([WGSL_CLIP], /* wgsl */ `
struct PlumeVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) n: vec3<f32>,
  @location(1) w: vec3<f32>,
  @location(2) along: f32,
  @location(3) angle: f32,
};
@vertex fn vs_main(${inputs}) -> PlumeVarying {
  var out: PlumeVarying;
  let t = clamp(a_position.y + 0.5, 0.0, 1.0);
  var r = mix(1.0, aura.u_plumeTip, t);
  let angle = atan2(a_position.z, a_position.x);
  r = r * (1.0 + aura.u_plumeShimmer * t * 0.22 * sin(a_position.y * 23.0 - aura.u_time * aura.u_plumeScroll * 7.0 + angle * 3.0) * step(0.001, aura.u_plumeScroll));
  let local = vec3<f32>(a_position.x * r, a_position.y, a_position.z * r);
  let m = ${model};
  let w = m * vec4<f32>(local, 1.0);
  out.w = w.xyz;
  out.n = a3dMat3Mul(m, vec3<f32>(a_position.x, 0.0, a_position.z));
  out.along = t;
  out.angle = angle;
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * w);
  return out;
}`);
}

const WGSL_FRAGMENT = wgslStage([WGSL_MATH, WGSL_COLOR], /* wgsl */ `
fn plumeHash(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}
fn plumeNoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (vec2<f32>(3.0) - 2.0 * f);
  let a = plumeHash(i);
  let b = plumeHash(i + vec2<f32>(1.0, 0.0));
  let c = plumeHash(i + vec2<f32>(0.0, 1.0));
  let d = plumeHash(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
@fragment fn fs_main(@location(0) vN: vec3<f32>, @location(1) vW: vec3<f32>, @location(2) vAlong: f32, @location(3) vAngle: f32) -> @location(0) vec4<f32> {
  let n = a3dSafeNormalize3(vN, vec3<f32>(1.0, 0.0, 0.0));
  let v = a3dSafeNormalize3(aura.u_cameraPosition - vW, vec3<f32>(0.0, 0.0, 1.0));
  let facing = abs(dot(n, v));
  let edge = a3dPow(1.0 - facing, 2.0);
  let tip = 1.0 - vAlong;
  let q = vec2<f32>(vAngle * 0.9549, vAlong * 5.0 - aura.u_time * aura.u_plumeScroll);
  let noise = 0.55 + 0.45 * plumeNoise(q) * plumeNoise(q * 2.1 + vec2<f32>(7.3));
  let diamonds = a3dPow(max(0.0, cos(vAlong * 22.0 - aura.u_time * aura.u_plumeScroll * 2.2)), 8.0) * (1.0 - vAlong * 0.72) * a3dPow(facing, 2.6);
  let core = a3dPow(facing, 6.0) * tip * tip + diamonds * 0.58;
  let bands = 0.5 + 0.5 * sin(vAlong * 41.0 - aura.u_time * aura.u_plumeScroll * 9.0 + vAngle * 2.0);
  let heat = aura.u_plumeShimmer * edge * bands * vAlong * 0.6;
  let body = a3dSaturate(edge * 0.85 + 0.25) * tip * noise + heat + diamonds * 0.25;
  let col = a3dSrgbToLinear(aura.u_plumeColor) * body + aura.u_plumeCore * core;
  let a = a3dSaturate(body + core);
  return vec4<f32>(a3dFinite3(col * aura.u_plumeGain), a);
}`);

/** `instanced`: the node draws per-instance transforms (`instances.*`); picks the matching WGSL vertex variant only. */
export function plumeSpec(options: ApexPlumeOptions, reducedMotion: boolean, instanced = false): CustomSpec {
  const tip = Math.min(1, Math.max(0, options.tipRadius ?? 0.18));
  return {
    glsl: { vertex: VERTEX, fragment: FRAGMENT },
    wgsl: { vertex: plumeWgslVertex(instanced), fragment: WGSL_FRAGMENT },
    uniforms: {
      plumeColor: { type: "vec3", value: hexToUnit(options.color) },
      plumeCore: { type: "vec3", value: [...APEX_PLUME_CORE] },
      plumeGain: { type: "f32", value: options.intensity },
      plumeTip: { type: "f32", value: tip },
      plumeScroll: { type: "f32", value: plumeScroll(reducedMotion) },
      plumeShimmer: { type: "f32", value: reducedMotion ? 0 : Math.min(1, Math.max(0, options.shimmer ?? 0)) }
    },
    transparent: true,
    depthWrite: false,
    blending: "additive",
    side: "double"
  };
}

/** The game's plume set: cyan thrusters (identity cyan is the player's and the sky lane's), tangerine Rocket Send. */
export const APEX_PLUMES = {
  rear: { color: "#4df0ff", intensity: 1.9 },
  down: { color: "#38bdf8", intensity: 1.75 },
  side: { color: "#7dd3fc", intensity: 1.7 },
  rocket: { color: "#ff8a3d", intensity: 2.3, tipRadius: 0.1, shimmer: 1 },
  sky: { color: "#4df0ff", intensity: 1.9 }
} as const satisfies Record<string, ApexPlumeOptions>;
