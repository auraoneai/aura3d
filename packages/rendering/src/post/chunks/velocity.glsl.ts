/**
 * `prd03.velocity` — C-14 velocity MRT chunk (PRD-03 §8.6, Phase 4).
 *
 * Emits per-object motion vectors for TAA/motion blur from inside the real
 * forward draw instead of TemporalHistory's separate re-render pass:
 *
 *   `vertex:pars`    — u_previousModel / u_previousViewProjection /
 *                      u_unjitteredViewProjection (bound by the C-14
 *                      `velocityMrtBinder`) + clip varyings.
 *   `vertex:end`     — writes both clip positions. The previous position is
 *                      rebuilt from the previous pose, not the current one:
 *                      skinned and morphed vertices run the deform chunk's
 *                      `a3dDeformPrevious` (previous bone palette and
 *                      previous morph weights, enabled by `A3D_VELOCITY`),
 *                      and instanced draws read each instance's previous
 *                      matrix from `a_a3dPrevInstance0..3`. Both previous
 *                      inputs are supplied per object by the scoped
 *                      VelocityHistory, which seeds them with the current
 *                      pose on an object's first frame.
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
 * default. A graph material that replaces the vertex position reprojects
 * its deformed pre-graph previous position; graph displacement history is
 * not tracked.
 */
import type { ShaderChunk, ShaderFeature } from "../../contracts/program";
import { VELOCITY_MRT } from "../../contracts/velocity";
import { VELOCITY_PREVIOUS_INSTANCE_ATTRIBUTES, velocityFramePrepared } from "../../forward/Velocity";

export const velocityParsVertexChunk: ShaderChunk = {
  name: "a3d_prd03_velocityParsVertex",
  owner: "prd03",
  stage: "vertex",
  glsl: `// AURA_VELOCITY — C-14 velocity MRT (PRD-03 §8.6)
uniform mat4 u_previousModel;
uniform mat4 u_previousViewProjection;
uniform mat4 u_unjitteredViewProjection;
out vec4 a3d_velPrevClip;
out vec4 a3d_velCurrClip;
#ifdef A3D_VELOCITY_PREVIOUS_INSTANCE
in vec4 a_a3dPrevInstance0;
in vec4 a_a3dPrevInstance1;
in vec4 a_a3dPrevInstance2;
in vec4 a_a3dPrevInstance3;
#endif
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
  glsl: `a3d_velCurrClip = u_unjitteredViewProjection * a3dWorld;
#if defined(A3D_VELOCITY) && defined(A3D_DEFORM_ENTRY) && (defined(A3D_MORPH) || defined(A3D_SKINNING))
vec4 a3dVelPrevDeformed;
a3dDeformPrevious(a3dVelPrevDeformed);
vec4 a3dVelPrevLocal = u_geometryMatrix * a3dVelPrevDeformed;
#else
vec4 a3dVelPrevLocal = a3dLocal;
#endif
#ifdef A3D_VELOCITY_PREVIOUS_INSTANCE
mat4 a3dVelPrevInstance = mat4(a_a3dPrevInstance0, a_a3dPrevInstance1, a_a3dPrevInstance2, a_a3dPrevInstance3);
#else
mat4 a3dVelPrevInstance = instanceMatrix;
#endif
a3d_velPrevClip = u_previousViewProjection * (u_previousModel * a3dVelPrevInstance * a3dVelPrevLocal);`,
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
/** Instanced draws additionally read per-instance previous matrices. */
export const VELOCITY_INSTANCED_BIT = "velocity-instanced";
export { VELOCITY_PREVIOUS_INSTANCE_ATTRIBUTES };

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
    const previousInstances = input.item.instanceAttributes?.some(attribute => attribute.shaderName === VELOCITY_PREVIOUS_INSTANCE_ATTRIBUTES[0]);
    return previousInstances ? VELOCITY_INSTANCED_BIT : VELOCITY_BIT;
  },
  defines(value) {
    // A3D_VELOCITY enables the deform chunks' previous-pose inputs.
    return {
      [VELOCITY_MRT.define]: true,
      A3D_VELOCITY: true,
      ...(value === VELOCITY_INSTANCED_BIT ? { A3D_VELOCITY_PREVIOUS_INSTANCE: true } : {})
    };
  }
};

/**
 * GU47 E-G (WP-7): the registered form of `velocityFeature` also requires a
 * prepared temporal frame (`velocityFramePrepared`), so promoting
 * `A3D_QR_POST_VELOCITY_MRT` leaves scenes without TAA / motion blur on
 * their current programs. Selection is per draw and requires a real writable
 * velocity/reactive MRT; another view's prepared frame cannot enable it.
 */
export const registeredVelocityFeature: ShaderFeature = {
  ...velocityFeature,
  select: (input) => (velocityFramePrepared(input.item) ? velocityFeature.select(input) : undefined)
};

export function registerVelocityShader(
  registerChunk: (c: ShaderChunk) => void,
  registerFeature: (f: ShaderFeature) => () => void
): () => void {
  registerChunk(velocityParsVertexChunk);
  registerChunk(velocityWriteVertexChunk);
  registerChunk(velocityParsFragmentChunk);
  registerChunk(velocityWriteFragmentChunk);
  return registerFeature(registeredVelocityFeature);
}
