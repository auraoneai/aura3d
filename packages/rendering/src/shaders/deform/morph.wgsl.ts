/**
 * PRD-06 T2.7 — WGSL twin of `a3d_prd06_morph_texture`
 * (`shaders/deform/morph.glsl.ts`). The packed deltas stay a
 * `texture_2d_array<f32>` (layer = target, texel = vertexIndex * stride +
 * attr, exactly as `resources/MorphTargetTexture.ts` packs them); the scalar
 * §8.2 ints and the packed index/weight arrays fold into one uniform struct.
 *
 * WGSL realities vs the GLSL source:
 *   - `gl_VertexID` is an entry-point builtin — helpers take `vertexIndex`
 *     as a parameter; the generated `@vertex` fn forwards
 *     `@builtin(vertex_index)`.
 *   - `A3D_MORPH_MAX_ACTIVE` becomes a `const` the program generator rewrites
 *     per tier (8/16/32/64); the twin validates at the Ultra ceiling 64.
 *   - The float-declared §8.2 uniforms keep their float read + `u32(x + 0.5)`
 *     cast — the MultiDraw integer-upload gap (Q-01-3) applies to WGSL
 *     uniform layout equally, and float32 round-trips small ints exactly.
 *   - `inout` parameters become `ptr<function, …>`.
 *   - `stride` is a WGSL reserved word → the struct field is `morphStride`.
 */

export const A3D_PRD06_MORPH_TEXTURE_WGSL = /* wgsl */ `
// A3D_MORPH_MAX_ACTIVE — emitted per tier by the program generator
// (8 Low, 16 Med, 32 High, 64 Ultra); the twin validates at the Ultra bound.
const A3D_MORPH_MAX_ACTIVE: u32 = 64u;
const A3D_MORPH_VEC4_SLOTS: u32 = A3D_MORPH_MAX_ACTIVE / 4u;

struct A3dPrd06MorphUniform {
  // x = stride (1|2|3 attrs), y = texture width, z = active count, w unused.
  dims: vec4<f32>,
  activeIndex4: array<vec4<f32>, A3D_MORPH_VEC4_SLOTS>,
  activeWeight4: array<vec4<f32>, A3D_MORPH_VEC4_SLOTS>,
  // §8.5 — previous-frame weights over the same index list (0 when newly
  // active). Velocity programs read it; others never bind it.
  prevWeight4: array<vec4<f32>, A3D_MORPH_VEC4_SLOTS>,
};
@group(3) @binding(12) var<uniform> a3dMorph: A3dPrd06MorphUniform;
@group(3) @binding(13) var a3dMorphTexture: texture_2d_array<f32>;

fn a3dMorphTargetIndex(k: u32) -> u32 {
  return u32(a3dMorph.activeIndex4[k >> 2u][k & 3u] + 0.5);
}
fn a3dMorphFetch(vertexIndex: u32, targetLayer: u32, attr: u32) -> vec4<f32> {
  let stride_ = u32(a3dMorph.dims.x + 0.5);
  let texWidth = u32(a3dMorph.dims.y + 0.5);
  let t = vertexIndex * stride_ + attr;
  let y = t / texWidth;
  return textureLoad(a3dMorphTexture, vec2<i32>(i32(t - y * texWidth), i32(y)), i32(targetLayer), 0);
}
fn a3dMorphActiveWeight(k: u32) -> f32 {
  return a3dMorph.activeWeight4[k >> 2u][k & 3u];
}
fn a3dMorphPrevWeight(k: u32) -> f32 {
  return a3dMorph.prevWeight4[k >> 2u][k & 3u];
}
fn a3dMorphActiveCount() -> u32 {
  return u32(a3dMorph.dims.z + 0.5);
}
fn a3dApplyMorph(vertexIndex: u32, p: ptr<function, vec3<f32>>, n: ptr<function, vec3<f32>>, tg: ptr<function, vec4<f32>>) {
  for (var k: u32 = 0u; k < A3D_MORPH_MAX_ACTIVE; k = k + 1u) {
    if (k >= a3dMorphActiveCount()) { break; }
    let tgt = a3dMorphTargetIndex(k);
    let w = a3dMorphActiveWeight(k);
    *p = *p + a3dMorphFetch(vertexIndex, tgt, 0u).xyz * w;
    if (a3dMorph.dims.x > 1.5) {
      *n = *n + a3dMorphFetch(vertexIndex, tgt, 1u).xyz * w;
    }
    if (a3dMorph.dims.x > 2.5) {
      let d = a3dMorphFetch(vertexIndex, tgt, 2u).xyz * w;
      *tg = vec4<f32>((*tg).xyz + d, (*tg).w);
    }
  }
}
`;
