// PRD-07 P4/P5 — lane-07 *pars* library for the T0-05(b) per-item
// ShaderFeature.select evaluation. The registered features in lanes/prd07.ts
// delegate here so a program-acquire path (ProgramGenerator per-item
// evaluation, or MaterialFeatures bit population) resolves identical values.
//
// Call snippet for the prd01 T0-05 consumer (see qr issue #490):
//
//   import { prd07FeatureBits } from ".../vfx/prd07FeaturePars";
//   // inside contributingFeatures(f, flags, input) — per RenderItem:
//   for (const [id, value] of Object.entries(prd07FeatureBits(input))) {
//     if (f.features[id] === undefined) out.push({ feature: byId(id), value });
//   }
//
// or, populating bits at MaterialFeatures build time when ctx.item is known:
//
//   Object.assign(features, prd07FeatureBits({ item, pass: f.pass, tier, flags }));

import type { ShaderFeatureSelectInput } from "../contracts/program";
import { prd07WetnessState } from "../atmosphere/shaders/wetness.glsl";

/** "prd07.fog" — height fog model on analytic tiers, volumetric otherwise. */
export function prd07FogSelect(input: Pick<ShaderFeatureSelectInput, "flags" | "tier">): "height" | "volumetric" | undefined {
  if (!input.flags.on("A3D_QR_VFX_FOG")) return undefined;
  return input.tier.volumetricFog === "analytic" ? "height" : "volumetric";
}

/** "prd07.wetness" — only while a wetness driver is live (§6.8; IC-0: no
 *  chunk injected into a dry scene). */
export function prd07WetnessSelect(): true | undefined {
  const w = prd07WetnessState();
  return w.wetness > 0 || w.rainRipples > 0 || w.snowCover > 0 ? true : undefined;
}

/** Evaluate every lane-07 feature bit for one item. Sparse — only active
 *  features appear; merge over `f.features` without overwriting set bits. */
export function prd07FeatureBits(input: ShaderFeatureSelectInput): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  const fog = prd07FogSelect(input);
  if (fog !== undefined) out["prd07.fog"] = fog;
  const wet = prd07WetnessSelect();
  if (wet !== undefined) out["prd07.wetness"] = wet;
  return out;
}
