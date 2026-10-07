/**
 * Lane 11 scene spec (C-30): `prd11-tier-ladder`.
 *
 * Same composition as the harness's base "18-game-scene" (third-person
 * character, props, pickups, shadows, bloom, fog) so results are comparable
 * against an existing base scene. Two URL parameters extend it for lane 11:
 *
 * - `?aura3d-quality=<tier>` (Aura adapter only): sets the requested C-27 tier.
 *    Phase 0 ignores it; Phase 4's quality resolver reads it.
 * - `?loadMs=<n>` (benchmark only): the Aura adapter burns `n` ms of CPU per
 *    rAF to simulate game-logic load, exercising the fps telemetry across
 *    distinct loads (S1's "two scenes, different loads" clause).
 *
 * `admittedAsReference: false` — lane scenes are never reference baselines.
 */
export interface Prd11TierLadderSpec {
  readonly kind: "prd11-tier-ladder";
  readonly sourceScene: "18-game-scene";
  readonly qrFlags: readonly ["tiers"];
  readonly admittedAsReference: false;
  readonly params: {
    /** `?aura3d-quality=` — requested C-27 tier name (Aura adapter only). */
    readonly auraQualityParam: "aura3d-quality";
    /** `?loadMs=` — per-rAF CPU busy-loop budget in ms (Aura adapter only). */
    readonly loadMsParam: "loadMs";
  };
}

export const tierLadderSpec: Prd11TierLadderSpec = {
  kind: "prd11-tier-ladder",
  sourceScene: "18-game-scene",
  qrFlags: ["tiers"],
  admittedAsReference: false,
  params: { auraQualityParam: "aura3d-quality", loadMsParam: "loadMs" }
};
