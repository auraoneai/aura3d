/**
 * GU47 WP-12 post plan for Apex Overdrive (AO-P3, AO-P4, AO-PF1). Pure functions so the tier and reduced-motion rules are
 * unit-tested; main.ts applies the plan through E-C's runtime overrides (`app.post.setEffectEnabled`) at boot and whenever the
 * quality tier changes.
 *
 * - Motion blur (S7, shutter 0.22 since GU47 phase 3; 0.35 smeared the deck in the stills) and god rays (S4, density 0.06): High and Ultra only, never on a coarse-pointer phone
 *   (PRD §6.2, AO-PF1 "no S4/S7 on phone"); motion blur and the sun lens flare are off on reduced motion (PRD §6.3).
 * - The look's cinematic-film preset carries an empty depth-of-field node: off for a racer (the road ahead must stay sharp).
 * - Chromatic aberration stays at the preset's static 0.002 except on reduced motion and Low (the engine drops it on Low).
 * - Output-overlay flashes (warm crash, cyan rocket) peak at 0.3 for at most 200 ms; reduced flash skips them.
 */
import { APEX_FLASH_PEAK, APEX_PALETTE, hexToUnit } from "./look";

export type ApexTier = "low" | "medium" | "high" | "ultra";

export interface ApexPostPlan {
  readonly motionBlur: boolean;
  readonly godRays: boolean;
  readonly depthOfField: false;
  readonly chromaticAberration: boolean;
  readonly lensFlare: boolean;
}

export interface ApexPostContext {
  readonly tier: ApexTier | string | undefined;
  readonly reducedMotion: boolean;
  /** `(pointer: coarse)`: a phone or tablet. */
  readonly coarsePointer: boolean;
}

export function apexPostPlan(ctx: ApexPostContext): ApexPostPlan {
  const high = ctx.tier === "high" || ctx.tier === "ultra";
  return {
    motionBlur: high && !ctx.coarsePointer && !ctx.reducedMotion,
    godRays: high && !ctx.coarsePointer,
    depthOfField: false,
    chromaticAberration: !ctx.reducedMotion && ctx.tier !== "low",
    lensFlare: !ctx.reducedMotion
  };
}

/** The slice of `app.post` the plan needs (E-C runtime overrides). */
export interface ApexPostSurface {
  setEffectEnabled(name: string, enabled: boolean): void;
}

/** Apply a plan; returns the effect states it set (the QA hook publishes them). Never throws. */
export function applyApexPostPlan(post: ApexPostSurface | undefined, plan: ApexPostPlan): Readonly<Record<string, boolean>> {
  const states: Record<string, boolean> = {
    motionBlur: plan.motionBlur,
    volumetricFog: plan.godRays,
    depthOfField: plan.depthOfField,
    chromaticAberration: plan.chromaticAberration
  };
  if (!post) return states;
  for (const [name, enabled] of Object.entries(states)) {
    try {
      post.setEffectEnabled(name, enabled);
    } catch {
      /* an effect this chain cannot toggle stays as authored */
    }
  }
  return states;
}

export type ApexFlashKind = "crash" | "rocket";

/** Output-overlay flash colour and peak (AO-P4): warm tangerine for a crash, cyan for a rocket; peak <= 0.3. */
export function apexFlash(kind: ApexFlashKind): { readonly rgb: readonly [number, number, number]; readonly peak: number; readonly ms: number } {
  const rgb = hexToUnit(kind === "crash" ? APEX_PALETTE.tangerine : APEX_PALETTE.cyan);
  return { rgb, peak: Math.min(APEX_FLASH_PEAK, kind === "crash" ? 0.3 : 0.22), ms: kind === "crash" ? 180 : 140 };
}

/** Overlay alpha `ageMs` into a flash (linear decay from the peak); 0 once it is over or when reduced flash is on. */
export function apexFlashAlpha(kind: ApexFlashKind, ageMs: number, reducedFlash: boolean): number {
  if (reducedFlash) return 0;
  const f = apexFlash(kind);
  if (!(ageMs >= 0) || ageMs >= f.ms) return 0;
  return f.peak * (1 - ageMs / f.ms);
}
