/**
 * `a3d_prd10_caustics` — PRD-10 §8.7 underwater caustics chunk.
 * On Path G the C-02 `ShaderFeature` `prd10.caustics` uses the split
 * `a3d_prd10_caustics_pars` / `_apply` chunks below (define
 * `A3D_PRD10_CAUSTICS`, #1143); on Path S this chunk is linked into
 * the lane's own terrain/kit programs. Multiplies the direct sun term by the
 * 16-frame caustic atlas projected along the sun direction.
 */
import type { ShaderChunk } from "../../../contracts/program.js";

const CAUSTICS_UNIFORMS_GLSL = /* glsl */ `
uniform sampler2D u_causticAtlas;   // 4x4 grid of 16 frames
uniform float u_causticScale;       // world metres per atlas tile
uniform float u_causticStrength;
uniform float u_waterHeight;
`;

/** Sampling + boost helpers, shared by the Path S chunk and the Path G pars chunk. */
const CAUSTICS_FUNCTIONS_GLSL = /* glsl */ `
// Sample the crossfaded caustic value at atlas-local uv in [0,1].
float a3dCausticSample(vec2 atlasUv, float t) {
  float frame = mod(floor(t * 12.0), 16.0);
  float next = mod(frame + 1.0, 16.0);
  vec2 cell0 = vec2(mod(frame, 4.0), floor(frame / 4.0));
  vec2 cell1 = vec2(mod(next, 4.0), floor(next / 4.0));
  float c0 = texture(u_causticAtlas, (cell0 + atlasUv) / 4.0).r;
  float c1 = texture(u_causticAtlas, (cell1 + atlasUv) / 4.0).r;
  return mix(c0, c1, fract(t * 12.0));
}

// Direct-sun multiplier for a submerged fragment: project along the sun dir
// to the water plane, sample the atlas, attenuate by depth.
float a3dCausticsBoost(vec3 worldPos, vec3 sunDir, float t) {
  float h = u_waterHeight;
  if (worldPos.y >= h) return 1.0;
  vec2 cuv = (worldPos.xz - sunDir.xz * (h - worldPos.y) / max(sunDir.y, 0.05)) / u_causticScale;
  float c = a3dCausticSample(fract(cuv), t);
  float depth = h - worldPos.y;
  return 1.0 + u_causticStrength * c * exp(-depth * 0.15);
}
`;

const glsl = /* glsl */ `${CAUSTICS_UNIFORMS_GLSL}uniform float u_time;
${CAUSTICS_FUNCTIONS_GLSL}`;

const wgsl = /* wgsl */ `
@group(0) @binding(0) var u_causticAtlas : texture_2d<f32>;
@group(0) @binding(1) var u_samp : sampler;
struct A3dCaustics {
  scale : f32,
  strength : f32,
  time : f32,
  waterHeight : f32,
};
@group(0) @binding(2) var<uniform> u_caustics : A3dCaustics;

fn a3dCausticSample(atlasUv : vec2f, t : f32) -> f32 {
  let frame = floor(t * 12.0) % 16.0;
  let next = (frame + 1.0) % 16.0;
  let cell0 = vec2f(frame % 4.0, floor(frame / 4.0));
  let cell1 = vec2f(next % 4.0, floor(next / 4.0));
  let c0 = textureSample(u_causticAtlas, u_samp, (cell0 + atlasUv) / 4.0).r;
  let c1 = textureSample(u_causticAtlas, u_samp, (cell1 + atlasUv) / 4.0).r;
  return mix(c0, c1, fract(t * 12.0));
}

fn a3dCausticsBoost(worldPos : vec3f, sunDir : vec3f, t : f32) -> f32 {
  let h = u_caustics.waterHeight;
  if (worldPos.y >= h) { return 1.0; }
  let cuv = (worldPos.xz - sunDir.xz * (h - worldPos.y) / max(sunDir.y, 0.05)) / u_caustics.scale;
  let c = a3dCausticSample(fract(cuv), t);
  let depth = h - worldPos.y;
  return 1.0 + u_caustics.strength * c * exp(-depth * 0.15);
}
`;

export const a3d_prd10_caustics: ShaderChunk = {
  name: "a3d_prd10_caustics",
  owner: "prd10",
  stage: "fragment",
  glsl,
  wgsl
};

/**
 * #1143 — generated-program (C-02, Path G) split of the caustics chunk.
 * `a3d_prd10_caustics_pars` is the global-scope declaration chunk at
 * `fragment:pars` (no `u_time`: the call reads frame time from the AuraFrame
 * block, `u_resolutionFarTime.w`, so it cannot collide with another feature's
 * `u_time`). `a3d_prd10_caustics_apply` is the statements-only call chunk at
 * `fragment:indirect`, which the generator appends after the default indirect
 * body, so the default light loop still runs and the boost scales its direct
 * accumulators. `u_causticSunDir` points toward the sun.
 */
const parsGlsl = /* glsl */ `${CAUSTICS_UNIFORMS_GLSL}uniform vec3 u_causticSunDir;
${CAUSTICS_FUNCTIONS_GLSL}`;

const applyGlsl = /* glsl */ `
#ifdef A3D_PRD10_CAUSTICS
  float a3dCausticBoost = a3dCausticsBoost(v_worldPosition, normalize(u_causticSunDir), u_resolutionFarTime.w);
  directDiffuse *= a3dCausticBoost;
  directSpecular *= a3dCausticBoost;
#endif
`;

export const a3d_prd10_caustics_pars: ShaderChunk = {
  name: "a3d_prd10_caustics_pars",
  owner: "prd10",
  stage: "fragment",
  glsl: parsGlsl,
  wgsl
};

export const a3d_prd10_caustics_apply: ShaderChunk = {
  name: "a3d_prd10_caustics_apply",
  owner: "prd10",
  stage: "fragment",
  glsl: applyGlsl,
  requires: ["a3d_prd10_caustics_pars"]
};
