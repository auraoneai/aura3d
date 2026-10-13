// Mech Hangar parts catalog — fresh typed data over assets that exist in
// the repo today (assets/library, CC0/Quaternius). The trashed MH-2M
// 4x4 part matrix is NOT rebound: no separable chassis/arms/legs/weapon
// GLBs with sockets exist, so a slot only ships when a real typed asset
// backs it. Two slots survive that rule:
//
//   chassis — a whole rigged robot GLB (the visible mech swaps wholesale)
//   support — an optional flying gun-drone GLB hovering beside the mech
//
// Stats are deliberately limited to the two numbers the test-drive loop
// actually consumes (speed -> move speed, power -> strike damage). There
// is no armor/guard stat because nothing in the honest loop reads one.
// This module is pure data + arithmetic: no engine, DOM, or renderer
// imports, so unit tests drive it headlessly.

export type MechSlot = "chassis" | "support";

export const MECH_SLOTS: readonly MechSlot[] = ["chassis", "support"];

export interface PartStats {
  readonly speed: number;
  readonly power: number;
}

export interface PartDef {
  /** Typed asset key in src/aura-assets.ts, or null for "nothing attached". */
  readonly assetKey: string | null;
  readonly slot: MechSlot;
  readonly id: string;
  readonly displayName: string;
  readonly stats: PartStats;
  /** Clip names on the backing GLB (empty for the empty support slot). */
  readonly clips: { readonly idle: string; readonly walk: string; readonly strike: string } | null;
  /** Authored render scale bringing the GLB to hangar scale (~1.9 m mech). */
  readonly scale: number;
}

export interface BuildSelection {
  readonly chassis: number;
  readonly support: number;
}

export const DEFAULT_BUILD: BuildSelection = { chassis: 0, support: 0 };

const MECH_CLIPS = { idle: "RobotArmature|Idle", walk: "RobotArmature|Walk", strike: "RobotArmature|Kick" } as const;
const ROBOT_CLIPS = { idle: "CharacterArmature|Idle", walk: "CharacterArmature|Walk", strike: "CharacterArmature|Attack" } as const;

export const PART_OPTIONS: Readonly<Record<MechSlot, readonly PartDef[]>> = {
  chassis: [
    {
      assetKey: "quaterniusMech",
      slot: "chassis",
      id: "mech",
      displayName: "Mech (Quaternius)",
      stats: { speed: 5, power: 5 },
      clips: MECH_CLIPS,
      scale: 0.72
    },
    {
      assetKey: "quaterniusRobotEnemyLarge",
      slot: "chassis",
      id: "robot-large",
      displayName: "Robot Enemy Large (Quaternius)",
      stats: { speed: 3, power: 7 },
      clips: ROBOT_CLIPS,
      scale: 1.45
    },
    {
      assetKey: "quaterniusRobotEnemy",
      slot: "chassis",
      id: "robot",
      displayName: "Robot Enemy (Quaternius)",
      stats: { speed: 7, power: 4 },
      clips: ROBOT_CLIPS,
      scale: 1.55
    }
  ],
  support: [
    {
      assetKey: null,
      slot: "support",
      id: "none",
      displayName: "No support drone",
      stats: { speed: 0, power: 0 },
      clips: null,
      scale: 0
    },
    {
      assetKey: "quaterniusFlyingGunDrone",
      slot: "support",
      id: "gun-drone",
      displayName: "Flying Gun Drone (Quaternius)",
      stats: { speed: 0, power: 3 },
      clips: ROBOT_CLIPS,
      scale: 0.55
    }
  ]
};

/** The target dummy every test drive strikes: a real rigged GLB, stationary. */
export const DUMMY_ASSET_KEY = "quaterniusRobotEnemyLargeGun" as const;
export const DUMMY_SCALE = 1.45;
export const DUMMY_HP = 20;
export const DUMMY_POSITIONS: readonly number[] = [-2.5, 0.5, 3];
export const ARENA_MIN_X = -4;
export const ARENA_MAX_X = 4;
export const STRIKE_RANGE = 1.2;

export function cycleIndex(current: number, delta: number, count: number): number {
  return ((current + delta) % count + count) % count;
}

export function selectedParts(selection: BuildSelection): readonly PartDef[] {
  return MECH_SLOTS.map((slot) => {
    const options = PART_OPTIONS[slot];
    return options[cycleIndex(selection[slot], 0, options.length)]!;
  });
}

export function partFor(selection: BuildSelection, slot: MechSlot): PartDef {
  const options = PART_OPTIONS[slot];
  return options[cycleIndex(selection[slot], 0, options.length)]!;
}

export interface MechStats {
  readonly speed: number;
  readonly power: number;
  /** Metres per second along the arena lane. */
  readonly moveSpeed: number;
  /** HP removed from a target dummy per landed strike. */
  readonly strikeDamage: number;
}

export function aggregateStats(selection: BuildSelection): MechStats {
  const parts = selectedParts(selection);
  const speed = parts.reduce((sum, part) => sum + part.stats.speed, 0);
  const power = parts.reduce((sum, part) => sum + part.stats.power, 0);
  return {
    speed,
    power,
    moveSpeed: Math.round((1.2 + speed * 0.25) * 100) / 100,
    strikeDamage: 4 + power * 2
  };
}

/** Strikes needed to down one dummy under a build (always >= 1). */
export function strikesToDown(selection: BuildSelection): number {
  return Math.max(1, Math.ceil(DUMMY_HP / aggregateStats(selection).strikeDamage));
}

export type Rating = "S" | "A" | "B";

/** Rating for a completed test drive, by elapsed seconds only. */
export function ratingFor(elapsedSeconds: number): Rating {
  if (elapsedSeconds <= 20) return "S";
  if (elapsedSeconds <= 35) return "A";
  return "B";
}
