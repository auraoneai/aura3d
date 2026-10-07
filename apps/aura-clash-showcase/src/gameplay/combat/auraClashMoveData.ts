import { createAnimationEventTracks, type AnimationEventTrackContainer } from "@aura3d/animation";
import {
  combatFrameAdvantage,
  solveCombatFrameData,
  validateCombatFrameData,
  type CombatFrameAdvantage,
  type CombatFrameData
} from "@aura3d/engine";

export type AuraClashMoveId = "light" | "heavy" | "special";
export type AuraClashMovementMoveId = "guard" | "jump" | "down" | "dash";
export type AuraClashActionMoveId = AuraClashMoveId | AuraClashMovementMoveId;

export interface AuraClashMoveSpec {
  readonly duration: number;
  readonly activeStart: number;
  readonly activeEnd: number;
  readonly range: number;
  readonly damage: number;
  readonly knockback: number;
}

export interface AuraClashMovementMoveSpec {
  readonly duration: number;
  readonly startup: number;
  readonly activeStart: number;
  readonly activeEnd: number;
  readonly recovery: number;
  readonly clipKey: "guard" | "air" | "run";
  readonly input: AuraClashMovementMoveId;
  readonly hold: boolean;
  readonly guardGrace?: number;
  readonly jumpVelocity?: number;
  readonly jumpGrace?: number;
  readonly maxJumpY?: number;
  readonly fastFallVelocity?: number;
  readonly downGrace?: number;
  readonly runSpeed?: number;
}

export interface AuraClashActionFrameData {
  readonly id: AuraClashActionMoveId;
  readonly kind: "attack" | "movement";
  readonly duration: number;
  readonly startup: number;
  readonly activeStart: number;
  readonly activeEnd: number;
  readonly recovery: number;
  readonly clipKey: "light" | "heavy" | "special" | "guard" | "air" | "run";
}

export const AURA_CLASH_START_HEALTH = 360;
export const AURA_CLASH_START_METER = 60;
export const AURA_CLASH_SPECIAL_METER_COST = 20;
export const AURA_CLASH_SPECIAL_COOLDOWN = 0.48;
export const AURA_CLASH_ATTACK_COOLDOWN = 0.06;
export const AURA_CLASH_WALK_SPEED = 1.9;

/** Frames per second the frame data is expressed in. */
const AURA_CLASH_FPS = 60;

/**
 * Attack frame data, derived from each move's role by the reusable combat solver.
 *
 * ## Why this is no longer hand-authored
 *
 * The previous table declared active windows in seconds, and converting them to frames
 * showed the shape was inverted:
 *
 * | move    | startup | active | recovery |
 * | ------- | ------- | ------ | -------- |
 * | light   | 4       | 12     | 4        |
 * | heavy   | 6       | 17     | 5        |
 * | special | 5       | 32     | 4        |
 *
 * Real fighting-game frame data is 2-5 active frames against 10-30 recovery frames.
 * These active windows were 3-8x too long and the recoveries 3-6x too short, which
 * produced exactly the reported symptoms: a hitbox live for over half a second cannot
 * make damage correspond to the moment of contact, and a four-frame recovery means a
 * whiff is free, so there is no spacing game and no punish window. Every move was
 * heavily plus on block.
 *
 * `solveCombatFrameData` derives startup, active, recovery, hitstun, blockstun,
 * hitstop and knockback from a move's role plus its reach and damage, and
 * `validateCombatFrameData` refuses a table that drifts back to an unreadable shape.
 */
const AURA_CLASH_SOLVED_FRAMES = {
  light: solveCombatFrameData({ id: "light", role: "light", range: 1.38, damage: 6 }),
  heavy: solveCombatFrameData({ id: "heavy", role: "heavy", range: 1.62, damage: 10 }),
  special: solveCombatFrameData({ id: "special", role: "special", range: 2.28, damage: 56 })
} as const satisfies Record<AuraClashMoveId, CombatFrameData>;

/**
 * Frame-data consistency report for the roster's attacks.
 *
 * Exported so the route can publish it: the previous table's problems were invisible to
 * every gate that existed, because nothing checked frame data as frame data.
 */
export const auraClashFrameDataReport = validateCombatFrameData(
  Object.values(AURA_CLASH_SOLVED_FRAMES)
);

/** Convert solved frame data back into the route's seconds-based move spec. */
function specFromFrames(frames: CombatFrameData): AuraClashMoveSpec {
  const toSeconds = (value: number) => Number((value / AURA_CLASH_FPS).toFixed(4));
  return {
    duration: toSeconds(frames.startup + frames.active + frames.recovery),
    activeStart: toSeconds(frames.startup),
    activeEnd: toSeconds(frames.startup + frames.active),
    range: frames.range,
    damage: frames.damage,
    knockback: frames.knockback
  };
}

export const auraClashMoveTable: Record<AuraClashMoveId, AuraClashMoveSpec> = {
  light: specFromFrames(AURA_CLASH_SOLVED_FRAMES.light),
  heavy: specFromFrames(AURA_CLASH_SOLVED_FRAMES.heavy),
  special: specFromFrames(AURA_CLASH_SOLVED_FRAMES.special)
};

/** Frame-accurate data for each attack, for HUD, evidence and AI use. */
export const auraClashAttackFrames: Record<AuraClashMoveId, CombatFrameData & { readonly advantage: CombatFrameAdvantage }> = {
  light: { ...AURA_CLASH_SOLVED_FRAMES.light, advantage: combatFrameAdvantage(AURA_CLASH_SOLVED_FRAMES.light) },
  heavy: { ...AURA_CLASH_SOLVED_FRAMES.heavy, advantage: combatFrameAdvantage(AURA_CLASH_SOLVED_FRAMES.heavy) },
  special: { ...AURA_CLASH_SOLVED_FRAMES.special, advantage: combatFrameAdvantage(AURA_CLASH_SOLVED_FRAMES.special) }
};

export const auraClashMovementMoveTable: Record<AuraClashMovementMoveId, AuraClashMovementMoveSpec> = {
  guard: {
    duration: 0.18,
    startup: 0,
    activeStart: 0,
    activeEnd: 0.18,
    recovery: 0.06,
    clipKey: "guard",
    input: "guard",
    hold: true,
    guardGrace: 0.06
  },
  jump: {
    duration: 0.42,
    startup: 0,
    activeStart: 0,
    activeEnd: 0.2,
    recovery: 0.12,
    clipKey: "air",
    input: "jump",
    hold: false,
    jumpVelocity: 8.95,
    jumpGrace: 0.2,
    maxJumpY: 2.28
  },
  down: {
    duration: 0.18,
    startup: 0,
    activeStart: 0,
    activeEnd: 0.18,
    recovery: 0.08,
    clipKey: "guard",
    input: "down",
    hold: true,
    fastFallVelocity: -21,
    downGrace: 0.18
  },
  dash: {
    duration: 0.16,
    startup: 0,
    activeStart: 0,
    activeEnd: 0.16,
    recovery: 0.08,
    clipKey: "run",
    input: "dash",
    hold: true,
    runSpeed: 3.9
  }
};

export const auraClashActionFrameData: Record<AuraClashActionMoveId, AuraClashActionFrameData> = {
  light: toAttackFrameData("light"),
  heavy: toAttackFrameData("heavy"),
  special: toAttackFrameData("special"),
  guard: toMovementFrameData("guard"),
  jump: toMovementFrameData("jump"),
  down: toMovementFrameData("down"),
  dash: toMovementFrameData("dash")
};

// Authored animation event tracks per attack move. The "hitbox" lane carries an active-frame
// window (marker time + duration) that is the single source of truth for when the attack's hitbox
// is live; footstep and VFX lanes carry trigger markers. Authored to match each move's active
// window exactly, so deriving the engine hit window from these events leaves combat — and the
// deterministic replay checksum — byte-identical.
export function createAuraClashMoveEventTracks(id: AuraClashMoveId): AnimationEventTrackContainer {
  const move = auraClashMoveTable[id];
  const tracks = createAnimationEventTracks(id, move.duration);
  tracks.addMarker("hitbox", move.activeStart, {
    type: "hitbox",
    duration: move.activeEnd - move.activeStart,
    payload: { damage: move.damage, range: move.range }
  });
  tracks.addMarker("footstep", Number((move.activeStart * 0.5).toFixed(4)), { type: "footstep" });
  tracks.addMarker("vfx", move.activeStart, { type: "vfx", payload: { effect: `${id}-spark` } });
  return tracks;
}

/** Active-frame hitbox window derived from a move's authored event tracks. */
export function auraClashHitWindowFromTracks(tracks: AnimationEventTrackContainer): { activeStart: number; activeEnd: number } {
  const window = tracks.activeWindows("hitbox")[0];
  return window ? { activeStart: window.start, activeEnd: window.end } : { activeStart: 0, activeEnd: 0 };
}

/** Cached per-move event tracks (built once; pure/deterministic). */
export const auraClashMoveEventTracks: Record<AuraClashMoveId, AnimationEventTrackContainer> = {
  light: createAuraClashMoveEventTracks("light"),
  heavy: createAuraClashMoveEventTracks("heavy"),
  special: createAuraClashMoveEventTracks("special")
};

function toAttackFrameData(id: AuraClashMoveId): AuraClashActionFrameData {
  const move = auraClashMoveTable[id];
  return {
    id,
    kind: "attack",
    duration: move.duration,
    startup: move.activeStart,
    activeStart: move.activeStart,
    activeEnd: move.activeEnd,
    recovery: Math.max(0, move.duration - move.activeEnd),
    clipKey: id
  };
}

function toMovementFrameData(id: AuraClashMovementMoveId): AuraClashActionFrameData {
  const move = auraClashMovementMoveTable[id];
  return {
    id,
    kind: "movement",
    duration: move.duration,
    startup: move.startup,
    activeStart: move.activeStart,
    activeEnd: move.activeEnd,
    recovery: move.recovery,
    clipKey: move.clipKey
  };
}
