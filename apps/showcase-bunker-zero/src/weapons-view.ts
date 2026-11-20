import { WEAPONS, type WeaponId } from "./sim";
export {
  buildCombatMacheteNode,
  buildPulseCarbineNode,
  buildReflexOpticNode,
  buildRocketLauncherNode,
  buildServicePistolNode,
  buildTacticalGloveNode,
  buildTacticalSleeveNode,
  buildTacticalWristCuffNode
} from "./art/proceduralModels";

/** Catalog key of the first-person model drawn for each weapon. One entry per weapon, all distinct, so the HUD name and the model in hand cannot disagree. */
export const VIEWMODEL_ASSET = {
  // WP-11 / Zero-GLB: 100% multi-material sculpted `@aura3d/engine` procedural viewmodels across all 4 weapons
  knife: "bzProceduralCombatMachete",
  pistol: "bzProceduralServicePistol",
  mg: "bzProceduralPulseCarbine",
  rocket: "bzProceduralRocketLauncher"
} as const satisfies Record<WeaponId, string>;

/** The HUD weapon name always comes from the active weapon definition. */
export function weaponHudLabel(id: WeaponId): string {
  return WEAPONS[id].name;
}

/** Yaw added to each viewmodel so every muzzle points away from the player. The source models do not agree on which end is the muzzle. */
export const VIEWMODEL_YAW_OFFSET: Record<WeaponId, number> = {
  knife: 0,
  pistol: Math.PI,
  // GU47 phase 6: the rifle's muzzle is at +X too (first drawn in hand in vmprobe g11p6-r3, it pointed at the camera)
  mg: Math.PI,
  rocket: 0
};

export interface ViewmodelFraming {
  readonly fov: number;
  readonly side: number;
  readonly forward: number;
  readonly drop: number;
}

/**
 * WP-10 Hor+ portrait framing: keeps desktop `aspect >= 1.2` viewmodel poses byte-identical
 * (`fov = baseFov`, `side = 0.26 * clamp(aspect / 1.6, 0.3, 1)`, `forward = 0.62`, `drop = 0.30`)
 * while widening portrait FOV (`82 deg` below `0.85`, e.g. `390x844`) and pulling the weapon + gloved hands
 * cleanly inside the viewport instead of clipping off the right edge.
 */
export function viewmodelFraming(aspect: number, baseFov: number): ViewmodelFraming {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9;
  const desktopSide = 0.26 * Math.max(0.3, Math.min(1, safeAspect / 1.6));
  if (safeAspect >= 1.2) {
    return { fov: baseFov, side: desktopSide, forward: 0.62, drop: 0.3 };
  }
  const portrait = { fov: 82, side: 0.11, forward: 0.56, drop: 0.28 };
  if (safeAspect <= 0.85) return portrait;
  const t = (safeAspect - 0.85) / 0.35;
  return {
    fov: portrait.fov + (baseFov - portrait.fov) * t,
    side: portrait.side + (desktopSide - portrait.side) * t,
    forward: portrait.forward + (0.62 - portrait.forward) * t,
    drop: portrait.drop + (0.3 - portrait.drop) * t
  };
}

const FEED_LABELS: Readonly<Record<string, string>> = {
  "treasure collected": "Silver Bullion +100",
  "treasure-small collected": "Silver Bullion +100",
  "treasure-big collected": "Gold Bullion +500",
  "health collected": "Field Medkit +25 HP",
  "medkit collected": "Field Medkit +25 HP",
  "plate collected": "Ration Tin +10 HP",
  "kit collected": "Trauma Surplus Kit +100 HP",
  "ammo collected": "9mm Munitions Crate +24",
  "armor collected": "Ballistic Plate +50 Armor",
  "mg collected": "Machine Gun Acquired",
  "rocket collected": "Rocket Launcher Acquired",
  "brass key secured": "Brass Clearance Key Secured",
  "push-wall revealed a secret": "Secret Bulkhead Breached",
  "kill confirmed — guard": "Patrol Guard Neutralized",
  "kill confirmed — dog": "Armored Hound Neutralized",
  "kill confirmed — gunner": "Heavy Gunner Neutralized",
  "kill confirmed — boss": "Iron Warden Terminated",
  "the Warden vents — VULNERABLE": "Warden Reactor Venting — Strike Now",
  "the Warden calls reinforcements": "Warden Summoning Reinforcements"
};

/** Humanizes internal pickup/kill event strings into crisp tactical comms copy. */
export function formatTacticalFeed(raw: string): string {
  const trimmed = raw.trim();
  return FEED_LABELS[trimmed] ?? trimmed;
}

/**
 * Real-GPU audit (2026-11-18): a player bullet's tracer dart spawned 0.55 m in front of the eye and 0.37 m below it, so
 * for its first frames the 0.42 m dart filled the space beside the pistol and read as an upright shell; and its trail
 * (life 0.14 s, sampled whether or not the dart is visible) drew a streak from wherever the dart was parked to the
 * muzzle. The dart now stays hidden and still for BULLET_TRACER_HOLD_S after a new bullet takes its slot (longer than
 * the trail life, so the parked points expire before it jumps) and until the bullet is BULLET_TRACER_MIN_RANGE out.
 */
export const BULLET_TRACER_HOLD_S = 0.18;
export const BULLET_TRACER_MIN_RANGE = 1.6;
export const BULLET_TRAIL_LIFE_S = 0.14;
export function bulletTracerVisible(heldFor: number, travelled: number): boolean {
  return heldFor >= BULLET_TRACER_HOLD_S && travelled >= BULLET_TRACER_MIN_RANGE;
}

/**
 * Real-GPU audit (2026-11-18): an enemy tracer was 60% of the shot length and rode to 70% of the way to the player, so
 * at 4 m its near end was ~0.5 m from the eye and the dart, pointing at the camera from below, filled the frame as a
 * tall upright spike. It is now at most ENEMY_TRACER_MAX_LEN long and its near end stays ENEMY_TRACER_CLEAR from the
 * player; returns null (not drawn) when the shooter is too close for that. `along` is the dart centre's distance from
 * the shooter, `length` its length (the dart mesh spans one unit along z).
 */
export const ENEMY_TRACER_CLEAR = 1.8;
export const ENEMY_TRACER_MAX_LEN = 1.0;
export function enemyTracerSpan(len: number, k: number): { along: number; length: number } | null {
  const length = Math.min(ENEMY_TRACER_MAX_LEN, Math.max(0.2, len * 0.3));
  const far = len - ENEMY_TRACER_CLEAR - length / 2;
  if (far < length / 2) return null;
  return { along: Math.min(len * (0.35 + 0.35 * Math.min(1, Math.max(0, k))), far), length };
}
