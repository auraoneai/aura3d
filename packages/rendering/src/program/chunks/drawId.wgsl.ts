/**
 * PRD 11 Phase 6 groundwork — WGSL twin of `a3d_prd11_draw_id`
 * (`batching/shaders/drawId.glsl.ts`). Same six-texel draw-data layout as
 * `DrawDataTexture`; WGSL has no `gl_DrawID` builtin, so the twin models the
 * uniform-loop path (`a3dDrawId.u_drawId`) — the multi-draw selection under
 * WebGPU is a Phase-6+ device decision (indirect draws), not a chunk detail.
 */

import { DRAW_DATA_TEXELS_PER_DRAW } from "../../batching/DrawDataTexture";

export const PRD11_DRAWID_WGSL = /* wgsl */ `
struct A3dPrd11DrawIdUniform {
  u_drawId: i32,
};
@group(3) @binding(0) var<uniform> a3dDrawId: A3dPrd11DrawIdUniform;
@group(3) @binding(1) var u_a3dDrawData: texture_2d<f32>;

fn a3dDrawTexel(draw: i32, row: i32) -> vec4<f32> {
  return textureLoad(u_a3dDrawData, vec2<i32>(draw * ${DRAW_DATA_TEXELS_PER_DRAW} + row, 0), 0);
}
fn a3dDrawModelMatrix(draw: i32) -> mat4x4<f32> {
  return mat4x4<f32>(a3dDrawTexel(draw, 0), a3dDrawTexel(draw, 1), a3dDrawTexel(draw, 2), a3dDrawTexel(draw, 3));
}
fn a3dDrawBaseColor(draw: i32) -> vec4<f32> {
  return a3dDrawTexel(draw, 4);
}
fn a3dDrawMeta(draw: i32) -> vec4<f32> {
  return a3dDrawTexel(draw, 5);
}
`;
