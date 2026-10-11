/**
 * PRD-10 §8.7 / T4.5 — underwater state + caustics wiring.
 *
 * `isUnderwater` asks whether a world-space point sits below a water body's
 * Gerstner surface at time t — evaluated by the caller's `heightAt` (the
 * `AuraWaterHandle`, same formula as the vertex shader). The frame pass uses
 * it to flip the fog request to C-21 absorption and to enable the
 * `prd10.underwaterDistortion` post pass.
 *
 * `registerPrd10Caustics()` lands the `a3d_prd10_caustics` chunk as the C-02
 * ShaderFeature `prd10.caustics` (hook `fragment:lights`, define
 * `A3D_PRD10_CAUSTICS`) so Path G materials pick up the direct-sun boost
 * automatically; Path S programs link the chunk explicitly.
 */
import { registerShaderFeature, type ShaderFeatureSelectInput } from "../../contracts/program.js";
import { registerPostPass } from "../../contracts/post.js";
import { a3d_prd10_caustics } from "./shaders/caustics.js";

/** True when `point` sits under the water surface at `timeSeconds`. */
export function isUnderwaterPoint(
  point: readonly [number, number, number],
  heightAt: (x: number, z: number, t: number) => number,
  timeSeconds: number
): boolean {
  return point[1] < heightAt(point[0], point[2], timeSeconds);
}

// -------------------------------------------------------------------------
// `prd10.underwaterDistortion` — C-13 post pass in `linear-hdr`, 2-tap UV
// offset (§8.7). Enabled only while the camera is submerged (the frame
// contributor flips the blackboard key).
//
// The fragment follows the §6.12 custom-pass contract
// (`customPassFragmentSource`): the engine prelude already declares
// `u_color`, `u_depthLinear`, `u_velocity`, `u_texelSize`, `u_time`, `v_uv`
// and `outColor`, so the pass declares only `u_distortion` and a `main()`.
// The first body redeclared `u_time`, sampled an unbound `u_scene` and had no
// `main()` — it could never compile once enabled. C-13 binds no extra
// textures, so the two taps use an analytic wave field instead of the water
// detail-normal atlas (§8.7 deviation, recorded in evidence/prd-10/phase-4.md).
export const UNDERWATER_KEY = "prd10.water.underwater";

export const UNDERWATER_DISTORTION_GLSL = /* glsl */ `
uniform vec2 u_distortion;     // amplitude in UV units (~0.004)
vec2 a3dUnderwaterWave(vec2 uv, float t) {
  vec2 o1 = vec2(sin(uv.y * 41.0 + t * 1.7), cos(uv.x * 37.0 - t * 1.3));
  vec2 o2 = vec2(sin((uv.x + uv.y) * 73.0 - t * 2.3), cos((uv.x - uv.y) * 67.0 + t * 1.9));
  return (o1 + 0.5 * o2) / 1.5;
}
vec4 a3dUnderwaterDistort(vec2 uv) {
  vec2 duv = uv + a3dUnderwaterWave(uv, u_time) * u_distortion;
  return texture(u_color, clamp(duv, vec2(0.0), vec2(1.0)));
}
void main() {
  outColor = a3dUnderwaterDistort(v_uv);
}
`;

export const UNDERWATER_DISTORTION_WGSL = /* wgsl */ `
@group(0) @binding(0) var u_color : texture_2d<f32>;
@group(0) @binding(1) var u_samp : sampler;
struct A3dUnderwater { time : f32, pad : f32, distortion : vec2f };
@group(0) @binding(2) var<uniform> u : A3dUnderwater;
fn a3dUnderwaterWave(uv : vec2f, t : f32) -> vec2f {
  let o1 = vec2f(sin(uv.y * 41.0 + t * 1.7), cos(uv.x * 37.0 - t * 1.3));
  let o2 = vec2f(sin((uv.x + uv.y) * 73.0 - t * 2.3), cos((uv.x - uv.y) * 67.0 + t * 1.9));
  return (o1 + 0.5 * o2) / 1.5;
}
fn a3dUnderwaterDistort(uv : vec2f) -> vec4f {
  let duv = uv + a3dUnderwaterWave(uv, u.time) * u.distortion;
  return textureSampleLevel(u_color, u_samp, clamp(duv, vec2f(0.0), vec2f(1.0)), 0.0);
}
`;

/** Register `prd10.caustics` + `prd10.underwaterDistortion`; returns unregister. */
export function registerPrd10UnderwaterFeatures(): () => void {
  const unCaustics = registerShaderFeature({
    id: "prd10.caustics",
    owner: "prd10",
    flag: "A3D_QR_WORLD",
    select: (input: ShaderFeatureSelectInput) =>
      input.item.label?.startsWith("prd10.caustics:") ? 1 : undefined,
    defines: (v): Readonly<Record<string, string | number | true>> => (v ? { A3D_PRD10_CAUSTICS: 1 } : {}),
    chunks: ["a3d_prd10_caustics"],
    hooks: ["fragment:lights"]
  });
  const unDistortion = registerPostPass({
    id: "prd10.underwaterDistortion",
    owner: "prd10",
    flag: "A3D_QR_WORLD",
    insertAt: "after-depth",
    space: "linear-hdr",
    inputs: ["color"],
    fragment: { glsl: UNDERWATER_DISTORTION_GLSL, wgsl: UNDERWATER_DISTORTION_WGSL },
    enabled: (frame) => frame.blackboard.get(UNDERWATER_KEY) === true,
    uniforms: () => ({ u_distortion: [0.004, 0.004] }),
    gpuOnly: true
  });
  return () => {
    unCaustics();
    unDistortion();
  };
}

export { a3d_prd10_caustics };
