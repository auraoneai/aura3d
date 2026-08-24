import { auraClashMoveTable, type AuraClashMoveId } from "../combat/auraClashMoveData";

export type AuraClashClipName = string;

export type AuraClashFighterClipKey =
  | "idle"
  | "walk"
  | "run"
  | "air"
  | "down"
  | "guard"
  | "light"
  | "heavy"
  | "special"
  | "hurt"
  | "ko";

export type AuraClashFighterClipMap = Record<AuraClashFighterClipKey, AuraClashClipName> & {
  /** Optional heavier hit-reaction clip, used for heavy/special hits (light hits use `hurt`). */
  readonly hurtHeavy?: AuraClashClipName;
};

export const AURA_CLASH_REQUIRED_CLIP_KEYS = [
  "idle",
  "walk",
  "run",
  "air",
  "down",
  "guard",
  "light",
  "heavy",
  "special",
  "hurt",
  "ko"
] as const satisfies readonly AuraClashFighterClipKey[];

export interface AuraClashClipMapReadiness {
  readonly fighterId: string;
  readonly ok: boolean;
  readonly requiredKeys: readonly AuraClashFighterClipKey[];
  readonly mappedClips: readonly AuraClashClipName[];
  readonly availableClipCount: number | null;
  readonly missingKeys: readonly AuraClashFighterClipKey[];
  readonly missingClips: readonly AuraClashClipName[];
  readonly diagnostics: readonly string[];
}

export interface AuraClashClipReadiness {
  readonly ok: boolean;
  readonly fighters: readonly AuraClashClipMapReadiness[];
  readonly diagnostics: readonly string[];
}

export interface AuraClashClipMapReadinessInput {
  readonly fighterId: string;
  readonly clipMap: Partial<Record<AuraClashFighterClipKey, AuraClashClipName>>;
  readonly availableClips?: Iterable<AuraClashClipName>;
}

export interface AuraClashClipReadinessInput {
  readonly playerClipMap?: Partial<Record<AuraClashFighterClipKey, AuraClashClipName>>;
  readonly rivalClipMap?: Partial<Record<AuraClashFighterClipKey, AuraClashClipName>>;
  readonly playerAvailableClips?: Iterable<AuraClashClipName>;
  readonly rivalAvailableClips?: Iterable<AuraClashClipName>;
}

export const auraClashPlayerClips = {
  idle: "Idle_Loop",
  walk: "Walk_Loop",
  run: "Sprint_Loop",
  air: "Jump_Loop",
  down: "Crouch_Idle_Loop",
  guard: "Sword_Block",
  light: "Punch_Jab",
  heavy: "Punch_Cross",
  special: "Sword_Attack",
  hurt: "Hit_Chest",
  hurtHeavy: "Hit_Head",
  ko: "Death01"
} as const satisfies AuraClashFighterClipMap;

export const auraClashRivalClips = {
  idle: "Idle_FoldArms_Loop",
  walk: "Zombie_Walk_Fwd_Loop",
  run: "Shield_Dash_RM",
  air: "NinjaJump_Idle_Loop",
  down: "Sword_Block",
  guard: "Sword_Block",
  light: "Melee_Hook",
  heavy: "Sword_Regular_A",
  special: "Sword_Regular_Combo",
  hurt: "Hit_Knockback",
  hurtHeavy: "Hit_Knockback",
  ko: "LayToIdle"
} as const satisfies AuraClashFighterClipMap;

/**
 * Choose the hit-reaction severity from BOTH the attack weight and the defender's grounded state:
 * heavy/special hits (damage >= 10) OR airborne hits play the stronger reaction; grounded light hits
 * play the base reaction. Pure + deterministic.
 */
export function selectAuraClashHurtVariant(damage: number, grounded: boolean): "light" | "heavy" {
  return damage >= 10 || !grounded ? "heavy" : "light";
}

/**
 * Resolve the reaction clip for a hit: KO when dead, the heavier `hurtHeavy` clip for heavy/special
 * hits when the rig provides one, otherwise the base `hurt` clip. Pure + deterministic.
 */
export function resolveAuraClashHurtClip(
  clips: AuraClashFighterClipMap,
  variant: "light" | "heavy",
  dead: boolean
): AuraClashClipName {
  if (dead) return clips.ko;
  return variant === "heavy" && clips.hurtHeavy ? clips.hurtHeavy : clips.hurt;
}

export function validateAuraClashClipMapReadiness(input: AuraClashClipMapReadinessInput): AuraClashClipMapReadiness {
  const available = input.availableClips ? new Set(input.availableClips) : null;
  const missingKeys: AuraClashFighterClipKey[] = [];
  const mappedClips: AuraClashClipName[] = [];
  const missingClips: AuraClashClipName[] = [];
  const diagnostics: string[] = [];

  for (const key of AURA_CLASH_REQUIRED_CLIP_KEYS) {
    const clipName = input.clipMap[key];
    if (!clipName) {
      missingKeys.push(key);
      diagnostics.push(`${input.fighterId} missing required clip key "${key}".`);
      continue;
    }
    mappedClips.push(clipName);
    if (available && !available.has(clipName)) {
      missingClips.push(clipName);
      diagnostics.push(`${input.fighterId} maps "${key}" to missing embedded clip "${clipName}".`);
    }
  }

  return {
    fighterId: input.fighterId,
    ok: missingKeys.length === 0 && missingClips.length === 0,
    requiredKeys: AURA_CLASH_REQUIRED_CLIP_KEYS,
    mappedClips,
    availableClipCount: available ? available.size : null,
    missingKeys,
    missingClips,
    diagnostics
  };
}

export function assertAuraClashClipMapReady(input: AuraClashClipMapReadinessInput): AuraClashClipMapReadiness {
  const readiness = validateAuraClashClipMapReadiness(input);
  if (!readiness.ok) {
    throw new Error(`Aura Clash clip readiness failed for ${input.fighterId}: ${readiness.diagnostics.join(" ")}`);
  }
  return readiness;
}

export function validateAuraClashClipReadiness(input: AuraClashClipReadinessInput = {}): AuraClashClipReadiness {
  const fighters = [
    validateAuraClashClipMapReadiness({
      fighterId: "player",
      clipMap: input.playerClipMap ?? auraClashPlayerClips,
      availableClips: input.playerAvailableClips
    }),
    validateAuraClashClipMapReadiness({
      fighterId: "rival",
      clipMap: input.rivalClipMap ?? auraClashRivalClips,
      availableClips: input.rivalAvailableClips
    })
  ];
  const diagnostics = fighters.flatMap((fighter) => fighter.diagnostics);
  return { ok: fighters.every((fighter) => fighter.ok), fighters, diagnostics };
}

export function assertAuraClashClipReadiness(input: AuraClashClipReadinessInput = {}): AuraClashClipReadiness {
  const readiness = validateAuraClashClipReadiness(input);
  if (!readiness.ok) {
    throw new Error(`Aura Clash clip readiness failed: ${readiness.diagnostics.join(" ")}`);
  }
  return readiness;
}

/*
 * AC-A1 — authored presentation-event metadata, declared beside the clip maps.
 *
 * These are the clip-local frames presentation cues land on (`sfx`, `vfx`, `camera.impulse`).
 * Every time is **derived** from the move table in `auraClashMoveData.ts`, never re-typed, so this
 * metadata can never drift from frame data — and it is strictly additive: the `hitbox` lane in
 * `auraClashMoveEventTracks` remains the single authority for hit windows. Presentation only.
 */

/** Presentation cue lanes routed through the AC-A1 clip-event bridge. */
export type AuraClashPresentationEventName = "sfx" | "vfx" | "camera.impulse";

export interface AuraClashClipPresentationEvent {
  readonly name: AuraClashPresentationEventName;
  /** Exact clip-local time (seconds) this cue lands on. Derived from move frame data. */
  readonly time: number;
  readonly payload: Readonly<Record<string, string | number>>;
}

/** Halfway into startup — the same lead-in convention as the authored footstep marker. */
function swingCueTime(id: AuraClashMoveId): number {
  return Number((auraClashMoveTable[id].activeStart * 0.5).toFixed(4));
}

function attackPresentationEvents(id: AuraClashMoveId): readonly AuraClashClipPresentationEvent[] {
  const move = auraClashMoveTable[id];
  // Camera-impulse strength scales with the same move weight the hit-stop clock already uses.
  const impulseStrength = id === "special" ? 1 : id === "heavy" ? 0.6 : 0.35;
  return [
    { name: "sfx", time: swingCueTime(id), payload: { cue: "swing" } },
    { name: "vfx", time: Number(move.activeStart.toFixed(4)), payload: { effect: `${id}-spark` } },
    { name: "camera.impulse", time: Number(move.activeStart.toFixed(4)), payload: { strength: impulseStrength } }
  ];
}

/** Authored presentation metadata per attack move, built once (pure + deterministic). */
export const auraClashAttackPresentationEvents: Record<AuraClashMoveId, readonly AuraClashClipPresentationEvent[]> = {
  light: attackPresentationEvents("light"),
  heavy: attackPresentationEvents("heavy"),
  special: attackPresentationEvents("special")
};
