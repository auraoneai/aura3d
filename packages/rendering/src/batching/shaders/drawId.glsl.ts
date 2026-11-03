/**
 * PRD 11 Phase 3 — `a3d_prd11_draw_id` shader chunk + `prd11.drawId` feature
 * for the multi-draw layer (§6.6 layer 3). Two fetch paths share one source:
 *
 *   - `A3D_PRD11_MULTI_DRAW_EXT` defined → `gl_DrawID` (requires
 *     `#extension GL_ANGLE_multi_draw`, emitted by the generator's define pass).
 *   - otherwise → `uniform highp int u_drawId` bound per draw in the
 *     uniform-loop fallback (identical pixels, more draw calls).
 *
 * The draw-data texture (`u_a3dDrawData`) layout matches
 * `DrawDataTexture.TEXELS_PER_DRAW`: texels 0..3 model matrix, 4 base colour,
 * 5 packed meta. A `prd11.drawId.depth` depth-variant feature (C-11) exposes
 * the same fetch for depth/distance passes so shadow casters can batch once
 * Q-02-3 lands a depth-appropriate variant.
 */

import { registerShaderChunk, registerShaderFeature, shaderChunk, type ShaderChunk, type ShaderFeature } from "../../contracts/program";
import { registerDepthVariantFeature, type DepthVariantFeature } from "../../contracts/shadows";
import { makeShaderFeatureReplayGuard } from "../../program/ShaderFeatureReplayGuard";
import { DRAW_DATA_TEXELS_PER_DRAW, drawDataBindingFor } from "../DrawDataTexture";
import { registerWgslTwin } from "../../program/chunks/manifest";
import { PRD11_DRAWID_WGSL } from "../../program/chunks/drawId.wgsl";
import type { Texture } from "../../Texture";

export const PRD11_DRAWID_CHUNK = "a3d_prd11_draw_id";
const PRD11_DRAWID_WORLD_CHUNK = "a3d_prd11_draw_id_world";
const PRD11_DRAWID_MATERIAL_CHUNK = "a3d_prd11_draw_id_material";
export const PRD11_DRAWID_FEATURE = "prd11.drawId";
export const PRD11_DRAWID_DEPTH_FEATURE = "prd11.drawId.depth";

/** Marker a batch emits on a RenderItem to activate `prd11.drawId`. */
export interface Prd11MultiDrawItem {
  readonly multiDraw?: {
    readonly mode: "multi-draw" | "loop";
    readonly drawIndex: number;
    readonly drawData?: Texture;
  };
}

const DRAWID_GLSL = /* glsl */ `
#ifdef A3D_PRD11_MULTI_DRAW_EXT
#define a3d_draw_index gl_DrawID
#else
uniform highp int u_drawId;
#define a3d_draw_index u_drawId
#endif
uniform highp sampler2D u_a3dDrawData;
#ifdef A3D_STAGE_VERTEX
out vec4 v_a3dPrd11DrawColor;
#else
in vec4 v_a3dPrd11DrawColor;
#endif

vec4 a3dDrawTexel(int draw, int row) {
  return texelFetch(u_a3dDrawData, ivec2(draw * ${DRAW_DATA_TEXELS_PER_DRAW} + row, 0), 0);
}
mat4 a3dDrawModelMatrix(int draw) {
  return mat4(a3dDrawTexel(draw, 0), a3dDrawTexel(draw, 1), a3dDrawTexel(draw, 2), a3dDrawTexel(draw, 3));
}
vec4 a3dDrawBaseColor(int draw) {
  return a3dDrawTexel(draw, 4);
}
vec4 a3dDrawMeta(int draw) {
  return a3dDrawTexel(draw, 5);
}
`;

const DRAWID_WORLD_GLSL = /* glsl */ `
#ifdef A3D_PRD11_DRAWID
  {
    int a3dPrd11Draw = a3d_draw_index;
    mat4 a3dPrd11Model = a3dDrawModelMatrix(a3dPrd11Draw);
    vec4 a3dPrd11Meta = a3dDrawMeta(a3dPrd11Draw);
    v_a3dPrd11DrawColor = a3dDrawBaseColor(a3dPrd11Draw);
    a3dWorld = a3dPrd11Model * a3dLocal;
    instanceMatrix = a3dPrd11Model;
    if ((uint(a3dPrd11Meta.w + 0.5) & 1u) == 0u) a3dWorld = vec4(0.0);
  }
#endif
`;

const DRAWID_MATERIAL_GLSL = /* glsl */ `
#ifdef A3D_PRD11_DRAWID
  a3dBaseColor *= v_a3dPrd11DrawColor;
#ifdef A3D_LIT
  material.baseColor *= v_a3dPrd11DrawColor.rgb;
  material.diffuseContribution *= v_a3dPrd11DrawColor.rgb;
  material.specularColorBlended *= v_a3dPrd11DrawColor.rgb;
#endif
#endif
`;

let registered = false;

// Keep the exact built-ins available for callback-free identity checks without
// treating another provider with the same public id as trusted. Immutable
// chunk descriptors cannot be changed after the feature was registered.
const drawIdChunk: ShaderChunk = Object.freeze({
  name: PRD11_DRAWID_CHUNK, owner: "prd11", glsl: DRAWID_GLSL, wgsl: PRD11_DRAWID_WGSL, stage: "both"
});
const drawIdWorldChunk: ShaderChunk = Object.freeze({ name: PRD11_DRAWID_WORLD_CHUNK, owner: "prd11", glsl: DRAWID_WORLD_GLSL, stage: "vertex" });
const drawIdMaterialChunk: ShaderChunk = Object.freeze({ name: PRD11_DRAWID_MATERIAL_CHUNK, owner: "prd11", glsl: DRAWID_MATERIAL_GLSL, stage: "fragment" });

const drawIdFeature: ShaderFeature = {
  id: PRD11_DRAWID_FEATURE,
  owner: "prd11",
  flag: "A3D_QR_TIERS_BATCHING",
  select: (input) => {
    const marker = (input.item as unknown as Prd11MultiDrawItem).multiDraw;
    return marker ? marker.mode : undefined;
  },
  defines: (value): Readonly<Record<string, string | number | true>> => value === "multi-draw"
    ? { A3D_PRD11_DRAWID: true, A3D_PRD11_MULTI_DRAW_EXT: true }
    : { A3D_PRD11_DRAWID: true },
  chunks: [PRD11_DRAWID_CHUNK, PRD11_DRAWID_WORLD_CHUNK, PRD11_DRAWID_CHUNK, PRD11_DRAWID_MATERIAL_CHUNK],
  hooks: ["vertex:pars", "vertex:world", "fragment:pars", "fragment:material"],
  bindUniforms: (_value, item, set) => {
    const marker = (item as unknown as Prd11MultiDrawItem).multiDraw;
    if (!marker) return;
    set("u_drawId", marker.drawIndex);
    if (marker.drawData) set("u_a3dDrawData", drawDataBindingFor(marker.drawData));
  }
};

const drawIdDepthFeature: DepthVariantFeature = {
  id: PRD11_DRAWID_DEPTH_FEATURE,
  owner: "prd11",
  flag: "A3D_QR_TIERS_BATCHING",
  passes: Object.freeze(["depth", "distance"] as const),
  select: (input) => ((input.item as unknown as Prd11MultiDrawItem).multiDraw ? true : undefined),
  defines: () => ({ A3D_PRD11_DRAWID: true }),
  chunks: [PRD11_DRAWID_CHUNK],
  hooks: ["vertex:pars", "vertex:world"]
};

const unchangedDrawIdFeature = makeShaderFeatureReplayGuard([drawIdFeature, drawIdDepthFeature]);
const originalChunksRegistered = (): boolean => shaderChunk(PRD11_DRAWID_CHUNK) === drawIdChunk
  && shaderChunk(PRD11_DRAWID_WORLD_CHUNK) === drawIdWorldChunk
  && shaderChunk(PRD11_DRAWID_MATERIAL_CHUNK) === drawIdMaterialChunk;

/** Inspect only the original identity; foreign providers may be proxies. */
export function isOriginalPrd11DrawIdFeature(feature: ShaderFeature): boolean {
  return feature === drawIdFeature && unchangedDrawIdFeature(feature) && originalChunksRegistered();
}

/** The depth variant has its own registry and immutable pass list. */
export function isOriginalPrd11DrawIdDepthFeature(feature: DepthVariantFeature): boolean {
  return feature === drawIdDepthFeature && unchangedDrawIdFeature(feature) && originalChunksRegistered();
}

export function registerPrd11DrawIdShader(): void {
  if (registered) return;
  registered = true;
  registerShaderChunk(drawIdChunk);
  registerShaderChunk(drawIdWorldChunk);
  registerShaderChunk(drawIdMaterialChunk);
  registerWgslTwin({ chunkName: PRD11_DRAWID_CHUNK, owner: "prd11", wgsl: PRD11_DRAWID_WGSL });
  registerShaderFeature(drawIdFeature);
  registerDepthVariantFeature(drawIdDepthFeature);
}
