/**
 * GU47 WP-35 CD-09 post plan for Cumulus Dash, pure so the tier rules are unit-tested: low god rays through the storm towers
 * on High and Ultra only and never on a coarse-pointer phone (PRD §6.2, §6.4); the sun lens flare stays on every tier (it is
 * a few additive sprites) and is not a flash. world.ts applies the plan through E-C's `app.post.setEffectEnabled` at bind and
 * whenever the quality tier changes.
 */
export type CumulusTier = "low" | "medium" | "high" | "ultra";

/** Shaft density for the volumetric node (E-C `godRayDensity`, decoupled from the look fog). */
export const CUMULUS_GOD_RAY_DENSITY = 0.08;

export interface CumulusPostPlan { readonly godRays: boolean; readonly lensFlare: boolean }

export function cumulusPostPlan(ctx: { readonly tier: CumulusTier | string | undefined; readonly coarsePointer: boolean }): CumulusPostPlan {
  const high = ctx.tier === "high" || ctx.tier === "ultra";
  return { godRays: high && !ctx.coarsePointer, lensFlare: true };
}

export interface CumulusPostSurface { setEffectEnabled(name: string, enabled: boolean): void }

/** Apply a plan; returns the states set (QA). Never throws. */
export function applyCumulusPostPlan(post: CumulusPostSurface | undefined, plan: CumulusPostPlan): Readonly<Record<string, boolean>> {
  const states = { volumetricFog: plan.godRays };
  if (post) for (const [name, on] of Object.entries(states)) { try { post.setEffectEnabled(name, on); } catch { /* not toggleable on this chain */ } }
  return states;
}

/** Sun lens-flare elements in the identity palette (warm sun, amber ghost, cool cobalt ghost). */
export const CUMULUS_FLARE_ELEMENTS = [
  { size: 180, distance: 0, color: "#ffe2b8" },
  { size: 36, distance: 0.38, color: "#ffb347" },
  { size: 64, distance: 0.7, color: "#6f9fd8" },
  { size: 26, distance: 1, color: "#ffe2b8" }
] as const;
