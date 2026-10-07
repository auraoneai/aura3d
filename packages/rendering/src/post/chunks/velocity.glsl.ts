/**
 * `prd03.velocity` — C-14 velocity MRT chunk (PRD-03 §8.6, Phase 4).
 *
 * Emits per-object motion vectors for TAA/motion blur from inside the real
 * forward draw instead of TemporalHistory's separate re-render pass:
 *
 *   `vertex:pars`    — u_previousModel / u_previousViewProjection /
 *                      u_unjitteredViewProjection (bound by the C-14
 *                      `velocityMrtBinder`) + clip varyings.
 *   `vertex:end`     — writes both clip positions from the object-space
 *                      position: current via u_unjitteredViewProjection,
 *                      previous via u_previousViewProjection · u_previousModel.
 *   `fragment:pars`  — AURA_VELOCITY outputs: `layout(location = 1) out vec4`
 *                      (velocity, rg16f on the wire) and `layout(location = 2)
 *                      out float` (reactive mask, r8) per VELOCITY_MRT.
 *   `fragment:end`   — `v = (ndcCurr − ndcPrev) · 0.5`, the same units and
 *                      sign convention as the S1-C camera-velocity pass.
 *
 * Selection is gated on `A3D_QR_POST_VELOCITY_MRT` (default-off sub-flag):
 * the chunk only emits meaningfully when the forward target actually carries
 * the location-1/2 attachments — Q-01-2 (lane 01 MRT) is still pending, so
 * the feature is registered and ChunkHarness-compiled but never selected by
 * default. Skinned and morph items remain covered: skinned pose/morph weight
 * varyings are applied by the vertex deform stages before this hook reads
 * the position.
 */
import type { ShaderChunk, ShaderFeature } from "../../contracts/program";
import { VELOCITY_MRT } from "../../contracts/velocity";

export const velocityParsVertexChunk: ShaderChunk = {
  name: "a3d_prd03_velocityParsVertex",
  owner: "prd03",
  stage: "vertex",
  glsl: `// AURA_VELOCITY — C-14 velocity MRT (PRD-03 §8.6)
uniform mat4 u_model;
uniform mat4 u_previousModel;
uniform mat4 u_previousViewProjection;
uniform mat4 u_unjitteredViewProjection;
out vec4 a3d_velPrevClip;
out vec4 a3d_velCurrClip;
`,
  wgsl: `// WGSL mirror lands in Phase 7 (§7 parity pass).
struct A3dVelOut { @location(10) prevClip: vec4<f32>, @location(11) currClip: vec4<f32> };
`
};

export const velocityWriteVertexChunk: ShaderChunk = {
  name: "a3d_prd03_velocityWriteVertex",
  owner: "prd03",
  stage: "vertex",
  requires: ["a3d_prd03_velocityParsVertex"],
  glsl: `vec4 a3dWorldPos = u_model * vec4(a_position, 1.0);
a3d_velCurrClip = u_unjitteredViewProjection * a3dWorldPos;
a3d_velPrevClip = u_previousViewProjection * (u_previousModel * vec4(a_position, 1.0));`,
  wgsl: `// see vertex pars`
};

export const velocityParsFragmentChunk: ShaderChunk = {
  name: "a3d_prd03_velocityParsFragment",
  owner: "prd03",
  stage: "fragment",
  glsl: `// AURA_VELOCITY outputs (VELOCITY_MRT contract): velocity location 1
// (rg16f wire format — emitted as vec4, .rg carry the delta), reactive
// location 2 (r8).
layout(location = 1) out vec4 a3d_o_velocity;
layout(location = 2) out float a3d_o_reactive;
in vec4 a3d_velPrevClip;
in vec4 a3d_velCurrClip;
uniform float a3d_u_reactive;
`,
  wgsl: `// WGSL mirror lands in Phase 7.`
};

export const velocityWriteFragmentChunk: ShaderChunk = {
  name: "a3d_prd03_velocityWriteFragment",
  owner: "prd03",
  stage: "fragment",
  requires: ["a3d_prd03_velocityParsFragment"],
  glsl: `vec3 a3dNdcCurr = a3d_velCurrClip.xyz / max(a3d_velCurrClip.w, 1e-5);
vec3 a3dNdcPrev = a3d_velPrevClip.xyz / max(a3d_velPrevClip.w, 1e-5);
a3d_o_velocity = vec4(clamp((a3dNdcCurr.xy - a3dNdcPrev.xy) * 0.5, vec2(-0.25), vec2(0.25)), 0.0, 1.0);
a3d_o_reactive = a3d_u_reactive;`,
  wgsl: `// see fragment pars`
};

export const VELOCITY_BIT = "velocity";

export const velocityFeature: ShaderFeature = {
  id: "prd03.velocity",
  owner: "prd03",
  flag: "A3D_QR_POST",
  chunks: [
    "a3d_prd03_velocityParsVertex",
    "a3d_prd03_velocityWriteVertex",
    "a3d_prd03_velocityParsFragment",
    "a3d_prd03_velocityWriteFragment"
  ],
  hooks: ["vertex:pars", "vertex:end", "fragment:pars", "fragment:end"],
  select(input) {
    // Opt-in until Q-01-2 lands the location-1/2 attachments: nothing selects
    // the feature unless A3D_QR_POST_VELOCITY_MRT is explicitly on.
    if (input.pass !== "forward") return undefined;
    if (!input.flags.on("A3D_QR_POST_VELOCITY_MRT")) return undefined;
    return VELOCITY_BIT;
  },
  defines() {
    return { [VELOCITY_MRT.define]: true };
  }
};

export function registerVelocityShader(
  registerChunk: (c: ShaderChunk) => void,
  registerFeature: (f: ShaderFeature) => () => void
): () => void {
  registerChunk(velocityParsVertexChunk);
  registerChunk(velocityWriteVertexChunk);
  registerChunk(velocityParsFragmentChunk);
  registerChunk(velocityWriteFragmentChunk);
  return registerFeature(velocityFeature);
}
