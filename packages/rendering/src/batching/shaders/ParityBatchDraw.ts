/**
 * The Aura3D-authored parity batch draw shader registration. This module owns
 * the original feature identities and immutable shader chunks; matching one is
 * provenance only and does not itself authorize a combined native draw.
 */
import { registerShaderChunk, registerShaderFeature, shaderChunk, type ShaderChunk, type ShaderFeature } from "../../contracts/program";
import { registerDepthVariantFeature, type DepthVariantFeature } from "../../contracts/shadows";
import type { RenderItem } from "../../contracts/renderItem";
import type { Texture } from "../../Texture";
import { makeShaderFeatureReplayGuard } from "../../program/ShaderFeatureReplayGuard";
import { drawDataBindingFor } from "../DrawDataTexture";

const L5_BATCH_PARS_CHUNK = "a3d_l5_batch_draw_pars";
const L5_BATCH_WORLD_CHUNK = "a3d_l5_batch_draw_world";
const L5_BATCH_FRAG_CHUNK = "a3d_l5_batch_draw_frag";
const L5_BATCH_FEATURE = "parity.batchDraw";
const L5_BATCH_DEPTH_FEATURE = "parity.batchDraw.depth";

/**
 * Declarations shared by both stages. `a3d_l5_draw_index` resolves to
 * `gl_DrawID` when the driver exposes `WEBGL_multi_draw` AND the feature's
 * multi-draw bit is set — `#extension ... : warn` (emitted by the generator
 * for `A3D_L5_MULTI_DRAW`) leaves the macro undefined on drivers without it,
 * selecting the `u_drawId` uniform loop instead. That is exactly the
 * distinction `canMultiDraw` keys on (a program declaring `u_drawId` is the
 * uniform-loop fallback).
 */
const L5_BATCH_PARS_GLSL = /* glsl */ `
#if defined(GL_ANGLE_multi_draw) && defined(A3D_L5_MULTI_DRAW)
#define a3d_l5_draw_index gl_DrawID
#else
uniform highp int u_drawId;
#define a3d_l5_draw_index u_drawId
#endif
uniform highp sampler2D u_a3dDrawData;
#ifdef A3D_STAGE_VERTEX
out vec4 v_a3dL5DrawColor;
#else
in vec4 v_a3dL5DrawColor;
#endif
vec4 a3dL5DrawTexel(int draw, int row) {
  return texelFetch(u_a3dDrawData, ivec2(draw * 6 + row, 0), 0);
}
mat4 a3dL5DrawModel(int draw) {
  return mat4(a3dL5DrawTexel(draw, 0), a3dL5DrawTexel(draw, 1), a3dL5DrawTexel(draw, 2), a3dL5DrawTexel(draw, 3));
}
vec4 a3dL5DrawBaseColor(int draw) {
  return a3dL5DrawTexel(draw, 4);
}
vec4 a3dL5DrawMeta(int draw) {
  return a3dL5DrawTexel(draw, 5);
}
`;

/**
 * World hook: the draw row's model matrix replaces `u_modelMatrix *
 * instanceMatrix` entirely — the engine folds node×instance transforms into
 * the draw-data texture so one packed draw = one (geometry-slice, instance)
 * pair. meta.w bit 0 is the visibility flag: hidden rows collapse to a
 * degenerate point at the origin (no fragments).
 */
const L5_BATCH_WORLD_GLSL = /* glsl */ `
#ifdef A3D_L5_BATCH_DRAW
  {
    int a3dL5Draw = a3d_l5_draw_index;
    vec4 a3dL5Meta = a3dL5DrawMeta(a3dL5Draw);
    mat4 a3dL5Model = a3dL5DrawModel(a3dL5Draw);
    v_a3dL5DrawColor = a3dL5DrawBaseColor(a3dL5Draw);
    a3dWorld = a3dL5Model * a3dLocal;
    // Generated forward lit programs compute normals from instanceMatrix and the
    // geometry matrix after this hook. A packed carrier must bind an identity
    // u_normalMatrix so this row's transform is applied exactly once there.
    // Admission must also account for mirrored and singular matrices, whose
    // ordinary per-item normal and culling treatment differs.
#ifdef A3D_L5_FORWARD
    instanceMatrix = a3dL5Model;
#endif
    if ((uint(a3dL5Meta.w + 0.5) & 1u) == 0u) a3dWorld = vec4(0.0);
  }
#endif
`;

/**
 * Material hook: apply the row tint, then reconstruct the colour-derived PBR
 * fields from Aura's material equations. Dielectric specular is independent
 * of base colour; tinting the already-mixed result would incorrectly alter it.
 */
const L5_BATCH_FRAG_GLSL = /* glsl */ `
#ifdef A3D_L5_BATCH_DRAW
  a3dBaseColor *= v_a3dL5DrawColor;
  #ifdef A3D_LIT
    material.baseColor = max(a3dBaseColor.rgb, vec3(0.0));
    vec3 a3dL5ClampedColor = min(material.baseColor, vec3(1.0));
    material.diffuseContribution = a3dL5ClampedColor * (1.0 - material.metallic);
    material.specularColorBlended = mix(material.specularColor, a3dL5ClampedColor, material.metallic);
  #endif
#endif
`;


// Preserve exact identities for callback-free inspection. A provider with the
// same public name, changed callbacks, or replaced chunks must not pass.
const batchParsChunk: ShaderChunk = Object.freeze({ name: L5_BATCH_PARS_CHUNK, owner: "prd15", glsl: L5_BATCH_PARS_GLSL, stage: "both" });
const batchWorldChunk: ShaderChunk = Object.freeze({ name: L5_BATCH_WORLD_CHUNK, owner: "prd15", glsl: L5_BATCH_WORLD_GLSL, stage: "vertex" });
const batchFragmentChunk: ShaderChunk = Object.freeze({ name: L5_BATCH_FRAG_CHUNK, owner: "prd15", glsl: L5_BATCH_FRAG_GLSL, stage: "fragment" });

const batchDrawFeature: ShaderFeature = {
  id: L5_BATCH_FEATURE,
  owner: "prd15",
  flag: "A3D_PARITY_BATCHING",
  order: 40,
  select: (input) => {
    if (input.pass !== "forward") return undefined;
    const marker = (input.item as RenderItem & { multiDraw?: { mode: string; drawIndex: number } }).multiDraw;
    return marker ? marker.mode : undefined;
  },
  defines: (value): Readonly<Record<string, string | number | true>> => value === "multi-draw"
    ? { A3D_L5_BATCH_DRAW: true, A3D_L5_FORWARD: true, A3D_L5_MULTI_DRAW: true }
    : { A3D_L5_BATCH_DRAW: true, A3D_L5_FORWARD: true },
  chunks: [L5_BATCH_PARS_CHUNK, L5_BATCH_PARS_CHUNK, L5_BATCH_WORLD_CHUNK, L5_BATCH_FRAG_CHUNK],
  hooks: ["vertex:pars", "fragment:pars", "vertex:world", "fragment:material"],
  bindUniforms: (_value, item, set) => {
    const marker = (item as RenderItem & { multiDraw?: { drawIndex: number; drawData?: Texture } }).multiDraw;
    if (!marker) return;
    set("u_drawId", marker.drawIndex);
    if (marker.drawData) set("u_a3dDrawData", drawDataBindingFor(marker.drawData));
  }
};

const batchDrawDepthFeature: DepthVariantFeature = {
  id: L5_BATCH_DEPTH_FEATURE,
  owner: "prd15",
  flag: "A3D_PARITY_BATCHING",
  passes: Object.freeze(["depth", "distance"] as const),
  select: (input) =>
    (input.item as RenderItem & { multiDraw?: unknown }).multiDraw ? true : undefined,
  defines: () => ({ A3D_L5_BATCH_DRAW: true }),
  chunks: [L5_BATCH_PARS_CHUNK, L5_BATCH_WORLD_CHUNK],
  hooks: ["vertex:pars", "vertex:world"]
};

const unchangedBatchFeatures = makeShaderFeatureReplayGuard([batchDrawFeature, batchDrawDepthFeature]);
const originalChunksRegistered = (): boolean => shaderChunk(L5_BATCH_PARS_CHUNK) === batchParsChunk
  && shaderChunk(L5_BATCH_WORLD_CHUNK) === batchWorldChunk
  && shaderChunk(L5_BATCH_FRAG_CHUNK) === batchFragmentChunk;

/** Identity and immutability only; this is not a submission capability. */
export function isOriginalBatchedDrawFeature(feature: ShaderFeature): boolean {
  return feature === batchDrawFeature && unchangedBatchFeatures(feature) && originalChunksRegistered();
}

/** Depth has a distinct registry and immutable pass list. */
export function isOriginalBatchedDrawDepthFeature(feature: DepthVariantFeature): boolean {
  return feature === batchDrawDepthFeature && unchangedBatchFeatures(feature) && originalChunksRegistered();
}

let batchDrawShaderRegistered = false;

/** Register the exact shader feature and chunk objects once. */
export function registerBatchedDrawShader(): void {
  if (batchDrawShaderRegistered) return;
  batchDrawShaderRegistered = true;
  registerShaderChunk(batchParsChunk);
  registerShaderChunk(batchWorldChunk);
  registerShaderChunk(batchFragmentChunk);
  registerShaderFeature(batchDrawFeature);
  registerDepthVariantFeature(batchDrawDepthFeature);
}
