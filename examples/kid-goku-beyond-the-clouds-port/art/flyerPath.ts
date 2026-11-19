/**
 * The diving pterosaur's flight path (render layer; the encounter rules in encounters.ts are unchanged), kept out of the
 * chase camera's sight line to the kid.
 *
 * GPU QA 2026-11-18 (390x844): after the pass the old path flew BACK along the course (`c.s - 1.2 d`) while the kid ran on,
 * so the 10 m Idol wyvern (scale 2.6) swept through the lens and covered the kid; at the pass it sat on top of him. Now:
 * - the Idol wyvern is drawn at IDOL_FLYER_SCALE (a 5.4 m span, still three kid-heights across) instead of 2.6;
 * - its drawn extent (FLYER_BOX: wingspan, wing flap, roll, the head reaching toward the runner) stays AHEAD of the kid by
 *   FLYER_LEAD_CLEAR at every moment: on the dive it swoops down to just in front of his face, after a dodge it climbs
 *   away ahead and out, and when he bonks it it tumbles forward and up, away from the road, never back over the camera.
 */
export const IDOL_FLYER_SCALE = 1.4;

/**
 * Drawn extent of the flyer per unit of scale, in the flight frame (measured on the admitted wyvern GLBs at frame yaw:
 * span +-1.94, height 0-2.30, head 1.89 toward the runner, tail 0.77 away), widened for the wing flap (+-1.03 rad about the
 * head axis) and the knocked-out roll: lateral and vertical cover the wing tips in any roll.
 */
export const FLYER_BOX = { toward: 1.89, away: 0.77, lateral: 2.4, below: 1.3, above: 3.5 } as const;
/** Clear distance between the kid's s and the near face of the flyer's box (his own half-depth plus a margin). */
export const FLYER_LEAD_CLEAR = 0.9;

export interface FlyerInput {
  /** Kid's course distance, the dive's course distance, the lane the dive locked onto (null: not yet) and the kid's lane. */
  readonly kidS: number; readonly diveS: number; readonly target: number | null; readonly lane: number;
  /** Bonked / duelled out of the sky, and the kid's s when that happened. */
  readonly ko: { readonly at: number } | null;
  readonly clock: number; readonly index: number; readonly scale: number;
}
export interface FlyerPose { readonly sp: number; readonly lat: number; readonly hgt: number; readonly bank: number; readonly flap: number; readonly pitch: number }

const smooth = (a: number, b: number, v: number): number => { const r = Math.max(0, Math.min(1, (v - a) / (b - a))); return r * r * (3 - 2 * r); };

export function flyerPose(f: FlyerInput): FlyerPose {
  const d = f.kidS - f.diveS;
  const target = f.target ?? f.lane;
  const side = target >= 0 ? 1 : -1;
  // the near face of the box (head toward the runner) stays FLYER_LEAD_CLEAR ahead of the kid
  const lead = f.kidS + FLYER_BOX.toward * f.scale + FLYER_LEAD_CLEAR;
  if (f.ko) {
    const dk = Math.max(0, f.kidS - f.ko.at);
    return { sp: lead + dk * 0.8, lat: target + side * dk * 0.5, hgt: 3 + dk * 0.5, bank: f.clock * 6, flap: 0.9, pitch: 0 };
  }
  const k2 = smooth(-40, 0, d);
  const flap = Math.sin(f.clock * 11 + f.index) * 0.55;
  const lat = d > 0 ? target + side * d * 0.3 : (target > 0 ? -9 : 9) + (target - (target > 0 ? -9 : 9)) * k2;
  const hgt = 1.6 + 17 * (1 - smooth(-40, -2, d)) + (d > 0 ? d * 0.8 : 0);
  const sp = d > 0 ? lead + d * 0.8 : Math.max(lead, f.diveS + 18 * (1 - k2));
  return { sp, lat, hgt, bank: (lat - target) * 0.03, flap, pitch: 0.2 * (1 - k2) };
}
