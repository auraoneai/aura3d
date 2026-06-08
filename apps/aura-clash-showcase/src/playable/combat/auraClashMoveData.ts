import { createAnimationEventTracks, type AnimationEventTrackContainer } from "@aura3d/animation";

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

export const auraClashMoveTable: Record<AuraClashMoveId, AuraClashMoveSpec> = {
  light: { duration: 0.34, activeStart: 0.07, activeEnd: 0.27, range: 1.38, damage: 6, knockback: 0.52 },
  heavy: { duration: 0.46, activeStart: 0.1, activeEnd: 0.38, range: 1.62, damage: 10, knockback: 0.64 },
  special: { duration: 0.68, activeStart: 0.08, activeEnd: 0.62, range: 2.28, damage: 56, knockback: 1.28 }
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
