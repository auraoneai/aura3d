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

export type AuraClashFighterClipMap = Record<AuraClashFighterClipKey, AuraClashClipName>;

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
  guard: "Sword_Idle",
  light: "Punch_Jab",
  heavy: "Punch_Cross",
  special: "Sword_Attack",
  hurt: "Hit_Chest",
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
  ko: "LayToIdle"
} as const satisfies AuraClashFighterClipMap;

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
