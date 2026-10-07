/**
 * PRD-03 Phase 7 — WGSL twin of `common.glsl.ts`.
 *
 * `linearizeDepth` is the §6.11 shared formula (view-space metres).
 * `triangularDither(fragCoord, frame)` is the §1096 dither: a PCG2D integer
 * hash produces two uniform samples whose sum minus 1 gives the triangular
 * distribution, scaled by 1/255 — ±1 LSB of the 8-bit output, applied at the
 * last write (S12).
 *
 * Every `post/shaders/*.wgsl.ts` module is a fragment-only WGSL module: the
 * shared fullscreen-triangle vertex is `WEBGPU_POST_VERTEX_WGSL`
 * (`webgpu/WebGPUPostShaders.ts`). Binding convention for all mirrors:
 *   @group(0) @binding(0)  var<uniform>  parameter block (GLSL scalar/vec/mat
 *                          uniforms in declaration order; GLSL bool/int/uint
 *                          uniforms become i32/u32 — bool is not
 *                          host-shareable in WGSL uniform address space)
 *   @group(0) @binding(N)  var *_tex     textures in GLSL sampler order
 *   @group(0) @binding(M)  var *_smp     one sampler per texture sampled with
 *                          `textureSampleLevel`; texelFetch-only textures
 *                          (textureLoad) declare no sampler
 * Execution wiring is lane 11's (Q-11-2); these strings are validated for
 * zero `getCompilationInfo()` errors in `tests/qr/prd03/wgsl-compile.spec.ts`.
 */

export const POST_COMMON_WGSL = /* wgsl */ `
fn linearize_depth(d: f32, n: f32, f: f32, ortho: bool) -> f32 {
  let z = d * 2.0 - 1.0;
  return select((2.0 * n * f) / (f + n - z * (f - n)), mix(n, f, d), ortho);
}

fn pcg2d(v_in: vec2<u32>) -> vec2<u32> {
  var v = v_in * vec2<u32>(1664525u) + vec2<u32>(1013904223u);
  v.x = v.x + v.y * 1664525u;
  v.y = v.y + v.x * 1664525u;
  v = v ^ (v >> vec2<u32>(16u));
  v.x = v.x + v.y * 1664525u;
  v.y = v.y + v.x * 1664525u;
  v = v ^ (v >> vec2<u32>(16u));
  return v;
}

// Triangular-PDF dither: (rand0 + rand1 - 1) / 255 → ±1 LSB of 8-bit output.
fn triangular_dither(frag_coord: vec2<f32>, frame: f32) -> f32 {
  let seed = vec2<u32>(frag_coord) + vec2<u32>(u32(frame) * 747796405u);
  let rand = vec2<f32>(pcg2d(seed)) / 4294967296.0;
  return (rand.x + rand.y - 1.0) / 255.0;
}
`;
