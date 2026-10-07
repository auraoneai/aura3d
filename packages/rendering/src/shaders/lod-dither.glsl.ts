/**
 * `prd05.lodDither` — C-02 chunk + feature for the MSFT_lod cross-fade
 * screen-door stipple (PRD-05 §6.3.8, §7.4).
 *
 * The `prd05.typed-glb-actor-lod` extension emits `RenderItem.lodFade` while a
 * fade window is open (CONTRACTS §3.3 field, pre-declared in renderItem.ts):
 *
 *   incoming level items  → lodFade = +t   (keep iff bayer < t)
 *   outgoing level items  → lodFade = -t   (keep iff bayer >= t)
 *
 * The sign convention makes the two levels a pixel-perfect partition of the
 * Bayer mask at every t — the "complement" the ChunkHarness test asserts —
 * instead of the overlap/gap a symmetric alpha fade produces. |lodFade| >=
 * 0.999 means fully opaque and skips the feature entirely.
 *
 * Shadow/distance variants use the same stipple through
 * `registerDepthVariantFeature` so a fading level's silhouette dithers instead
 * of popping between full levels in the shadow map.
 */
import type { RenderItem } from "../contracts/renderItem";
import type { ShaderChunk, ShaderFeature } from "../contracts/program";
import type { DepthVariantFeature } from "../contracts/shadows";
import type { UniformValue } from "../RenderDevice";

const BAYER_GLSL = `float a3dLodBayer4(vec2 p) {
  ivec2 i = ivec2(mod(floor(p), 4.0));
  int idx = i.x + i.y * 4;
  const float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[idx] + 0.5) / 16.0;
}`;

const BAYER_WGSL = `fn a3dLodBayer4(p: vec2<f32>) -> f32 {
  let m = array<f32, 16>(0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  let i = vec2<i32>(floor(p) % vec2<f32>(4.0));
  return (m[i.x + i.y * 4] + 0.5) / 16.0;
}`;

/** Uniform + Bayer helper, inserted at `fragment:pars`. */
export const lodDitherParsChunk: ShaderChunk = {
  name: "a3d_prd05_lod_dither",
  owner: "prd05",
  stage: "fragment",
  glsl: `uniform float u_lodFade;
${BAYER_GLSL}
void a3dLodDitherDiscard() {
  float a = abs(u_lodFade);
  if (a < 0.999) {
    if (u_lodFade >= 0.0 ? a3dLodBayer4(gl_FragCoord.xy) >= a : a3dLodBayer4(gl_FragCoord.xy) < a) discard;
  }
}
`,
  wgsl: `@group(1) @binding(0) var<uniform> a3dLodFade: f32;
${BAYER_WGSL}
fn a3dLodDitherDiscard(pos: vec4<f32>, fade: f32) {
  let a = abs(fade);
  if (a < 0.999) {
    let b = a3dLodBayer4(pos.xy);
    if (select(b < a, b >= a, fade >= 0.0)) { discard; }
  }
}
`
};

/** First alpha-stage statement: the stipple discard itself. */
export const lodDitherDiscardChunk: ShaderChunk = {
  name: "a3d_prd05_lod_ditherDiscard",
  owner: "prd05",
  stage: "fragment",
  // No `requires` on the pars chunk: hookSplice appends required chunks
  // AFTER the requiring one at the SAME hook, so the pars chunk's
  // uniform/function declarations would land inside main() (Q-05-8).
  // The feature's chunks+hooks already splice the pars chunk at fragment:pars.
  requires: [],
  // Guarded by the feature's own define: the ChunkHarness splices chunk GLSL
  // at pars position (outside main), where a bare statement cannot compile;
  // real programs define A3D_LOD_DITHER via the feature's defines().
  glsl: `#ifdef A3D_LOD_DITHER
a3dLodDitherDiscard();
#endif`,
  wgsl: `a3dLodDitherDiscard(a3dFragCoord, a3dLodFade);`
};

export const LOD_DITHER_BIT = "lodDither";

function activeFade(item: RenderItem): number | undefined {
  const fade = item.lodFade;
  if (fade === undefined || Math.abs(fade) >= 0.999) return undefined;
  return fade;
}

/** Forward-pass feature: dithers only while `lodFade` is mid-transition. */
export const lodDitherFeature: ShaderFeature = {
  id: "prd05.lodDither",
  owner: "prd05",
  flag: "A3D_QR_ASSETS_LOD",
  chunks: ["a3d_prd05_lod_dither", "a3d_prd05_lod_ditherDiscard"],
  hooks: ["fragment:pars", "fragment:alpha"],
  select(input) {
    if (input.pass !== "forward") return undefined;
    return activeFade(input.item) === undefined ? undefined : LOD_DITHER_BIT;
  },
  defines() {
    return { A3D_LOD_DITHER: true };
  },
  bindUniforms(_value, item: RenderItem, set: (name: string, v: UniformValue) => void) {
    set("u_lodFade", item.lodFade ?? 1);
  }
};

/** Depth/distance variant: the same stipple keeps silhouettes dithered in shadow passes. */
export const lodDitherDepthFeature: DepthVariantFeature = {
  id: "prd05.lodDither.depth",
  owner: "prd05",
  flag: "A3D_QR_ASSETS_LOD",
  passes: ["depth", "distance"],
  chunks: ["a3d_prd05_lod_dither", "a3d_prd05_lod_ditherDiscard"],
  hooks: ["fragment:pars", "fragment:alpha"],
  select(input) {
    if (input.pass !== "depth" && input.pass !== "distance") return undefined;
    return activeFade(input.item) === undefined ? undefined : LOD_DITHER_BIT;
  },
  defines() {
    return { A3D_LOD_DITHER: true };
  },
  bindUniforms(_value, item: RenderItem, set: (name: string, v: UniformValue) => void) {
    set("u_lodFade", item.lodFade ?? 1);
  }
};
