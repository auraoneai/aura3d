// Pip's Big Leap — shared spec types.
//
// A world is fully described by a `WorldSpec`: a compact course of collision
// platforms plus gameplay props (springs, hazards, pickups, checkpoints, swim
// pockets, the Sun-Gate). `world.ts` lowers a spec into scene nodes + a
// collision world; `player.ts` simulates against it. Keeping physics data and
// presentation in one spec guarantees the visual course is exactly the
// solvable course.

export type Vec3 = readonly [number, number, number];

export type WorldId = "academy" | "w1" | "w2" | "w3" | "w4" | "w5" | "w6";
export type ModeId = "quick" | "academy" | "atlas" | "studio" | "trial";

export type PlatformKind =
  | "grass" | "earth" | "mushroom" | "leaf"       // Whispering Forest
  | "dock" | "wood" | "rope"                      // Sunmill Wharf
  | "cloud" | "sky"                               // Cloudspan Wharf
  | "stone" | "ember" | "metal"                   // Ember Cellar
  | "marble" | "gold"                             // Hollow Palace
  | "crystal" | "starlight";                      // Starfall Garden

/** A solid box platform. `y` is the TOP surface; the mesh sinks `h` below it. */
export interface PlatSpec {
  readonly id: string;
  readonly x: number;
  readonly y: number;       // top surface height
  readonly z: number;
  readonly w: number;       // x extent
  readonly d: number;       // z extent
  readonly h?: number;      // thickness (default 0.55)
  readonly kind?: PlatformKind;
  /** Gentle slope rendered as a rotated slab; collision stays stepped. */
  readonly mover?: {
    readonly axis: "x" | "y" | "z";
    readonly amplitude: number;
    readonly period: number;
    readonly phase?: number;
  };
  /** Timed platform: solid while (t mod period)/period < onFrac. */
  readonly timed?: {
    readonly period: number;
    readonly onFrac: number;
    readonly phase?: number;
  };
  /** Decor only — renders but does not collide (e.g. tiny ledges). */
  readonly ghost?: boolean;
}

export interface HazardSpec {
  readonly id: string;
  readonly x: number;
  readonly y: number;       // top of the hurt volume
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly h?: number;      // hurt volume depth below top (default 0.5)
  readonly type: "thorns" | "lava" | "ember" | "frost";
  /** Damage respawns the player at the checkpoint when true (pits, lava). */
  readonly respawn?: boolean;
}

export interface PickupSpec {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface CheckpointSpec extends PickupSpec {
  readonly yaw?: number;
}

export interface SpringSpec extends PickupSpec {
  /** Launch velocity in m/s; defaults per world. */
  readonly power?: number;
  readonly yaw?: number;
}

/** A swim pocket: a water volume the player can enter and paddle in. */
export interface WaterSpec {
  readonly id: string;
  readonly x: number;
  readonly y: number;       // water surface height
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly depth?: number;  // below surface (default 2.2)
}

export interface DecorSpec {
  /** Procedural prop id — interpreted by world.ts (tree, mushroom, crystal…). */
  readonly id: string;
  readonly kind:
    | "tree" | "mushroom" | "flower" | "rock" | "windmill" | "sail"
    | "cloud" | "fan" | "vent" | "pillar" | "arch" | "crystal" | "star"
    | "lantern" | "crate" | "barrel" | "banner";
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly s?: number;      // uniform scale (default 1)
  readonly yaw?: number;
}

/** Registered GLB backdrop dressing, far from the playable lane. */
export interface BackdropSpec {
  readonly asset: "verdant" | "cartoon" | "palace" | "readable" | "sidescroll" | "basicpack";
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale: number;
  readonly yaw?: number;
}

export interface NpcSpec extends PickupSpec {
  readonly who: "sidekick" | "helper";
  readonly clip?: string;
}

export interface WorldSpec {
  readonly id: WorldId;
  readonly order: number;          // 0=academy, 1..6 worlds
  readonly title: string;
  readonly shortName: string;
  readonly subtitle: string;
  readonly look: string;
  readonly lookOverrides?: { readonly fogDensityScale?: number; readonly exposureEv?: number };
  readonly background?: string;
  readonly spawn: Vec3;
  readonly spawnYaw?: number;
  readonly lowerBound: number;
  readonly gateSeeds: number;      // seeds needed to open the Sun-Gate
  readonly seedGoal: number;       // seeds placed (6 per world)
  readonly medals: { readonly gold: number; readonly silver: number; readonly bronze: number };
  readonly gravityScale?: number;  // Starfall low-gravity
  readonly moveSpeed?: number;
  readonly airControl?: number;
  readonly swimPocket?: boolean;
  readonly boss?: boolean;
  readonly doubleJumpGrant?: boolean;   // entering this world grants double-jump
  readonly unlockHint?: string;         // banner shown on first entry
  readonly ambientFx?: "spores" | "embers" | "stars" | "petals" | "dust" | "snow";
  readonly platforms: readonly PlatSpec[];
  readonly hazards: readonly HazardSpec[];
  readonly springs: readonly SpringSpec[];
  readonly waters: readonly WaterSpec[];
  readonly seeds: readonly PickupSpec[];
  readonly acorns: readonly PickupSpec[];
  readonly hearts: readonly PickupSpec[];
  readonly checkpoints: readonly CheckpointSpec[];
  readonly gate: PickupSpec & { readonly yaw?: number };
  readonly decor: readonly DecorSpec[];
  readonly backdrops: readonly BackdropSpec[];
  readonly npcs: readonly NpcSpec[];
}

// ---------------------------------------------------------------------------
// Runtime collision model (derived from the spec by world.ts).

export interface SolidBox {
  readonly id: string;
  /** Centre position; `hx/hy/hz` are half extents. */
  x: number;
  y: number;
  z: number;
  readonly hx: number;
  readonly hy: number;
  readonly hz: number;
  readonly plat: PlatSpec;
  /** True while a timed platform is phased in. */
  active: boolean;
  /** Per-frame velocity of the platform surface (movers). */
  vx: number;
  vy: number;
  vz: number;
}

export interface HazardBox {
  readonly spec: HazardSpec;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly hx: number;
  readonly hy: number;
  readonly hz: number;
}

/** Player locomotion states mirrored by animation + HUD. */
export type MoveState =
  | "grounded" | "air" | "jump" | "glide" | "dive" | "pound"
  | "swim" | "hurt" | "dead" | "celebrate";

export interface WorldTuning {
  readonly gravity: number;             // negative
  readonly jumpVelocity: number;
  readonly moveSpeed: number;
  readonly airControl: number;          // 0..1
  readonly coyoteMs: number;
  readonly jumpBufferMs: number;
  readonly terminalVelocity: number;
  readonly fallGravityMultiplier: number;
  readonly apexHangGravityScale: number;
  readonly apexHangThreshold: number;
  readonly releaseVelocityScale: number;
  readonly diveSpeed: number;
  readonly diveVy: number;
  readonly poundSpeed: number;
  readonly glideFallSpeed: number;
  readonly springVelocity: number;
  readonly swimGravity: number;
  readonly swimTerminal: number;
  readonly swimStrokeVelocity: number;
  readonly swimMoveSpeed: number;
  readonly knockback: { readonly h: number; readonly v: number };
  readonly stepUpHeight: number;
}
