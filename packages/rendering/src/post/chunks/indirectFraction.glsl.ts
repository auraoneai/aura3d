/**
 * `prd03.indirectFraction` — C-02 chunk + feature writing the §6.3
 * indirect-fraction into `color0.a` (PRD-03 §6.3).
 *
 * The forward shader computes `radiance = direct + indirect + emissive`; the
 * lane-02 lighting chunk exposes the indirect term as `a3dIndirectRadiance`
 * (request Q-02-1). This chunk's `fragment:end` hook writes
 * `o_color.a = clamp(luminance(indirect) / max(luminance(radiance), 1e-4),
 * 0, 1)` so S2's apply can do `mix(1.0, aoMB, f_ind)` — ambient-dominated
 * pixels get full occlusion while emissive, sky and direct-lit pixels stay
 * untouched.
 *
 * Transparent/additive draws keeping the surface's `f_ind` require
 * `blendFuncSeparate(srcRGB, dstRGB, ZERO, ONE)` in `RenderCommandState` —
 * lane 01's C-04 surface, request Q-01-1. Until C-02 `generateProgram` is
 * real (lane 01) this feature is registered but never selected into a
 * compiled program; the S2 apply uses the `u_aoFallbackStrength` path and
 * the graph reports `AO_INDIRECT_FRACTION_PENDING`.
 */
import type { ShaderChunk, ShaderFeature } from "../../contracts/program";

/** `fragment:pars` — luminance + fraction helper (declaration-level). */
export const indirectFractionParsChunk: ShaderChunk = {
  name: "a3d_prd03_indirectFractionPars",
  owner: "prd03",
  stage: "fragment",
  glsl: `// f_ind = luminance(indirect) / max(luminance(radiance), 1e-4)  (§6.3)
vec4 a3dWriteIndirectFraction(vec4 color, vec3 indirectRadiance) {
  float indLuma = dot(indirectRadiance, vec3(0.2126, 0.7152, 0.0722));
  float radLuma = max(dot(color.rgb, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
  color.a = clamp(indLuma / radLuma, 0.0, 1.0);
  return color;
}
`,
  wgsl: `fn a3dWriteIndirectFraction(colorIn: vec4<f32>, indirectRadiance: vec3<f32>) -> vec4<f32> {
  var color = colorIn;
  let indLuma = dot(indirectRadiance, vec3<f32>(0.2126, 0.7152, 0.0722));
  let radLuma = max(dot(color.rgb, vec3<f32>(0.2126, 0.7152, 0.0722)), 1e-4);
  color.a = clamp(indLuma / radLuma, 0.0, 1.0);
  return color;
}
`
};

/**
 * `fragment:end` — the alpha write itself. `a3dIndirectRadiance` is the
 * lane-02 lighting chunk's exposed value (Q-02-1); `o_color`/`radiance`
 * naming follows the C-02 generator's forward fragment.
 */
export const indirectFractionWriteChunk: ShaderChunk = {
  name: "a3d_prd03_indirectFractionWrite",
  owner: "prd03",
  stage: "fragment",
  requires: ["a3d_prd03_indirectFractionPars"],
  glsl: `o_color = a3dWriteIndirectFraction(o_color, a3dIndirectRadiance);`,
  wgsl: `o_color = a3dWriteIndirectFraction(o_color, a3dIndirectRadiance);`
};

export const INDIRECT_FRACTION_BIT = "indirectFraction";

export const indirectFractionFeature: ShaderFeature = {
  id: "prd03.indirectFraction",
  owner: "prd03",
  // The registry filters entries by `flags.on(flag)`, so the entry flag is the
  // lane flag; `A3D_QR_POST_AO` applies §15 sub-flag semantics in `select`:
  // default-on under `A3D_QR_POST`, explicit `A3D_QR_POST_AO=0` opts out.
  flag: "A3D_QR_POST",
  chunks: ["a3d_prd03_indirectFractionPars", "a3d_prd03_indirectFractionWrite"],
  hooks: ["fragment:pars", "fragment:end"],
  select(input) {
    // Only forward HDR draws write f_ind; depth/distance/velocity variants
    // never produce a color0.a worth reading.
    if (input.pass !== "forward") return undefined;
    const explicit = input.flags.values.A3D_QR_POST_AO;
    if (explicit !== undefined && !input.flags.on("A3D_QR_POST_AO")) return undefined;
    return INDIRECT_FRACTION_BIT;
  },
  defines() {
    return { A3D_INDIRECT_FRACTION: true };
  }
};

export function registerIndirectFractionShader(
  registerChunk: (c: ShaderChunk) => void,
  registerFeature: (f: ShaderFeature) => () => void
): () => void {
  registerChunk(indirectFractionParsChunk);
  registerChunk(indirectFractionWriteChunk);
  return registerFeature(indirectFractionFeature);
}
