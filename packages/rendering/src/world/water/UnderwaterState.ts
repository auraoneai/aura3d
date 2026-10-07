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
// offset driven by the water normal texture (§8.7). Enabled only while the
// camera is submerged (the frame contributor flips the blackboard key).
export const UNDERWATER_KEY = "prd10.water.underwater";

const DISTORTION_FRAG = /* glsl */ `
uniform sampler2D u_scene;
uniform sampler2D u_normals;   // water detail normal atlas
uniform float u_time;
uniform vec2 u_distortion;     // amplitude in UV units (~0.004)
vec4 a3dUnderwaterDistort(sampler2D scene, vec2 uv) {
  vec2 o1 = texture(u_normals, uv * 3.0 + vec2(u_time * 0.03, 0.0)).xy - 0.5;
  vec2 o2 = texture(u_normals, uv * 7.0 - vec2(0.0, u_time * 0.05)).xy - 0.5;
  vec2 duv = uv + (o1 + o2) * u_distortion;
  return texture(scene, clamp(duv, vec2(0.0), vec2(1.0)));
}
`;

const DISTORTION_WGSL = /* wgsl */ `
@group(0) @binding(0) var u_scene : texture_2d<f32>;
@group(0) @binding(1) var u_normals : texture_2d<f32>;
@group(0) @binding(2) var u_samp : sampler;
struct A3dUnderwater { time : f32, distortion : vec2f, pad : f32 };
@group(0) @binding(3) var<uniform> u : A3dUnderwater;
fn a3dUnderwaterDistort(uv : vec2f) -> vec4f {
  let o1 = textureSample(u_normals, u_samp, uv * 3.0 + vec2f(u.time * 0.03, 0.0)).xy - vec2f(0.5);
  let o2 = textureSample(u_normals, u_samp, uv * 7.0 - vec2f(0.0, u.time * 0.05)).xy - vec2f(0.5);
  let duv = uv + (o1 + o2) * u.distortion;
  return textureSample(u_scene, u_samp, clamp(duv, vec2f(0.0), vec2f(1.0)));
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
    fragment: { glsl: DISTORTION_FRAG, wgsl: DISTORTION_WGSL },
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
