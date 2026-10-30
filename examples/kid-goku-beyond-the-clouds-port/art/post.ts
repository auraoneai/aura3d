/**
 * GU47 WP-35 CD-09 post plan for Cumulus Dash, pure so the tier rules are unit-tested: low god rays through the storm towers
 * on High and Ultra only and never on a coarse-pointer phone (PRD §6.2, §6.4); the sun lens flare stays on every tier (it is
 * a few additive sprites) and is not a flash. CD-11 adds DOF in the title flyover and finale and glider motion blur, on the
 * same tier rule. world.ts applies the plan through E-C's `app.post.setEffectEnabled` every frame (changes only).
 */
export type CumulusTier = "low" | "medium" | "high" | "ultra";

/** Shaft density for the volumetric node (E-C `godRayDensity`, decoupled from the look fog). */
export const CUMULUS_GOD_RAY_DENSITY = 0.08;

/**
 * CD-11: which moment the camera is in. Depth of field runs in the letterboxed title flyover and the finale only (never in
 * play); glider motion blur only while the cloud mount is ridden.
 */
export type CumulusMoment = "title" | "finale" | "play";

export interface CumulusPostContext {
  readonly tier: CumulusTier | string | undefined;
  readonly coarsePointer: boolean;
  readonly moment?: CumulusMoment;
  readonly riding?: boolean;
  readonly reducedMotion?: boolean;
}

export interface CumulusPostPlan { readonly godRays: boolean; readonly lensFlare: boolean; readonly dof: boolean; readonly motionBlur: boolean }

/** God rays, DOF and motion blur are High/Ultra only and never on a coarse-pointer phone (WP-35 budget); motion blur is
 *  also off under reduced motion (PRD §6.3). */
export function cumulusPostPlan(ctx: CumulusPostContext): CumulusPostPlan {
  const high = (ctx.tier === "high" || ctx.tier === "ultra") && !ctx.coarsePointer;
  const moment = ctx.moment ?? "play";
  return {
    godRays: high,
    lensFlare: true,
    dof: high && moment !== "play",
    motionBlur: high && moment === "play" && ctx.riding === true && ctx.reducedMotion !== true
  };
}

export interface CumulusPostSurface {
  setEffectEnabled(name: string, enabled: boolean): void;
  setEffect?(name: string, patch: Record<string, number>): void;
}

/**
 * Apply a plan; returns the states set (QA). Only effects whose state differs from `previous` are written, so calling it
 * every frame is cheap. Never throws.
 */
export function applyCumulusPostPlan(post: CumulusPostSurface | undefined, plan: CumulusPostPlan, previous?: Readonly<Record<string, boolean>>): Readonly<Record<string, boolean>> {
  const states = { volumetricFog: plan.godRays, depthOfField: plan.dof, motionBlur: plan.motionBlur };
  if (post) {
    for (const [name, on] of Object.entries(states)) {
      if (previous && previous[name] === on) continue;
      try { post.setEffectEnabled(name, on); } catch { /* not toggleable on this chain */ }
    }
  }
  return states;
}

/** CD-11 DOF: authored lens (metres, f-stop, mm) for the title and finale; the focus distance follows the subject. */
export const CUMULUS_DOF = { focusDistance: 14, fStop: 2.8, focalLength: 50, maxBlur: 6 } as const;
/** CD-11 glider motion blur: a short shutter so the HUD-readable runner stays crisp. */
export const CUMULUS_MOTION_BLUR = { shutter: 0.35, maxBlur: 12, samples: 8 } as const;

/** Focus distance (metres) from the eye to the subject, clamped to a sane lens range. */
export function cumulusFocusDistance(eye: readonly number[], subject: readonly number[]): number {
  const d = Math.hypot((subject[0] ?? 0) - (eye[0] ?? 0), (subject[1] ?? 0) - (eye[1] ?? 0), (subject[2] ?? 0) - (eye[2] ?? 0));
  return Math.max(2, Math.min(80, Number.isFinite(d) ? d : CUMULUS_DOF.focusDistance));
}

/** Refocus only on a change above 8% so the runtime override store is not rewritten every frame. */
export function needsRefocus(current: number | null, next: number): boolean {
  return current === null || Math.abs(next - current) > current * 0.08;
}

/** Sun lens-flare elements in the identity palette (warm sun, amber ghost, cool cobalt ghost). */
export const CUMULUS_FLARE_ELEMENTS = [
  { size: 180, distance: 0, color: "#ffe2b8" },
  { size: 36, distance: 0.38, color: "#ffb347" },
  { size: 64, distance: 0.7, color: "#6f9fd8" },
  { size: 26, distance: 1, color: "#ffe2b8" }
] as const;
