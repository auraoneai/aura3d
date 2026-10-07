/**
 * PRD 11 Phase 3 — `a3d_prd11_draw_id` shader chunk + `prd11.drawId` feature
 * for the multi-draw layer (§6.6 layer 3). Two fetch paths share one source:
 *
 *   - `A3D_PRD11_MULTI_DRAW_EXT` defined → `gl_DrawID` (requires
 *     `#extension WEBGL_multi_draw`, emitted by the generator's define pass).
 *   - otherwise → `uniform highp int u_drawId` bound per draw in the
 *     uniform-loop fallback (identical pixels, more draw calls).
 *
 * The draw-data texture (`u_a3dDrawData`) layout matches
 * `DrawDataTexture.TEXELS_PER_DRAW`: texels 0..3 model matrix, 4 base colour,
 * 5 packed meta. A `prd11.drawId.depth` depth-variant feature (C-11) exposes
 * the same fetch for depth/distance passes so shadow casters can batch once
 * Q-02-3 lands a depth-appropriate variant.
 */

import { registerShaderChunk, registerShaderFeature } from "../../contracts/program";
import { registerDepthVariantFeature } from "../../contracts/shadows";
import { DRAW_DATA_TEXELS_PER_DRAW } from "../DrawDataTexture";
import { registerWgslTwin } from "../../program/chunks/manifest";
import { PRD11_DRAWID_WGSL } from "../../program/chunks/drawId.wgsl";
import type { Texture } from "../../Texture";

export const PRD11_DRAWID_CHUNK = "a3d_prd11_draw_id";
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

let registered = false;

export function registerPrd11DrawIdShader(): void {
  if (registered) return;
  registered = true;
  registerShaderChunk({
    name: PRD11_DRAWID_CHUNK,
    owner: "prd11",
    glsl: DRAWID_GLSL,
    wgsl: PRD11_DRAWID_WGSL,
    stage: "both"
  });
  registerWgslTwin({ chunkName: PRD11_DRAWID_CHUNK, owner: "prd11", wgsl: PRD11_DRAWID_WGSL });
  registerShaderFeature({
    id: PRD11_DRAWID_FEATURE,
    owner: "prd11",
    flag: "A3D_QR_TIERS_BATCHING",
    select: (input) => {
      const marker = (input.item as unknown as Prd11MultiDrawItem).multiDraw;
      return marker ? marker.mode : undefined;
    },
    defines: (value) => value === "multi-draw"
      ? { A3D_PRD11_DRAWID: true, A3D_PRD11_MULTI_DRAW_EXT: true }
      : { A3D_PRD11_DRAWID: true, A3D_PRD11_MULTI_DRAW_EXT: 0 },
    chunks: [PRD11_DRAWID_CHUNK],
    hooks: ["vertex:pars", "vertex:world", "fragment:material"],
    bindUniforms: (_value, item, set) => {
      const marker = (item as unknown as Prd11MultiDrawItem).multiDraw;
      if (!marker) return;
      set("u_drawId", marker.drawIndex);
      if (marker.drawData) {
        set("u_a3dDrawData", marker.drawData as unknown as never);
      }
    }
  });
  registerDepthVariantFeature({
    id: PRD11_DRAWID_DEPTH_FEATURE,
    owner: "prd11",
    flag: "A3D_QR_TIERS_BATCHING",
    passes: ["depth", "distance"],
    select: (input) => ((input.item as unknown as Prd11MultiDrawItem).multiDraw ? true : undefined),
    defines: () => ({ A3D_PRD11_DRAWID: true }),
    chunks: [PRD11_DRAWID_CHUNK],
    hooks: ["vertex:pars", "vertex:world"]
  });
}
