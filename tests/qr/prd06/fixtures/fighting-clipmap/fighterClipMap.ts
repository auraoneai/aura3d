/**
 * PRD-06 T0.9a — the fighting-game clip-map pattern as a lane fixture.
 *
 * Validate the real starter rigs from the template's typed asset manifest.
 * Each gameplay state resolves to an embedded clip. Neither rig has a
 * dedicated special-attack clip, so those states explicitly stand in on idle.
 * The fixture tests clip resolution; it does not assert runtime choreography.
 */

import { validateClipMap, type AuraClipMapEntry, type AuraClipMapValidationReport } from "../../../../../packages/engine/src/agent-api/GameCharacterAnimation";
import { assets } from "../../../../../packages/create-aura3d/templates/fighting-game/src/aura-assets";

/** The nine gameplay states a fighting-game fighter must resolve. */
export type FighterClip = "idle" | "walk" | "jump" | "dash" | "guard" | "light" | "heavy" | "special" | "hitstun";

export const FIGHTER_CLIPS: readonly FighterClip[] = [
  "idle",
  "walk",
  "jump",
  "dash",
  "guard",
  "light",
  "heavy",
  "special",
  "hitstun"
];

export type FighterAssetKey = keyof typeof assets;

export type FighterClipMap = Record<FighterAssetKey, Record<FighterClip, AuraClipMapEntry>>;

export const fighterClipMap: FighterClipMap = {
  auraclashPlayerRig: {
    idle: { clip: "Idle_Loop" },
    walk: { clip: "Walk_Loop" },
    jump: { clip: "Jump_Loop" },
    dash: { clip: "Sprint_Loop" },
    guard: { clip: "Sword_Block" },
    light: { clip: "Punch_Jab" },
    heavy: { clip: "Punch_Cross" },
    special: { clip: "Idle_Loop", standIn: true },
    hitstun: { clip: "Hit_Chest" }
  },
  auraclashRivalRig: {
    idle: { clip: "Idle_FoldArms_Loop" },
    walk: { clip: "Zombie_Walk_Fwd_Loop" },
    jump: { clip: "NinjaJump_Idle_Loop" },
    dash: { clip: "Shield_Dash_RM" },
    guard: { clip: "Sword_Block" },
    light: { clip: "Melee_Hook" },
    heavy: { clip: "Sword_Regular_A" },
    special: { clip: "Idle_FoldArms_Loop", standIn: true },
    hitstun: { clip: "Hit_Knockback" }
  }
};

export interface FighterClipMapAssetMetadata {
  readonly metadata?: { readonly animations?: readonly string[] };
}

/**
 * Validate a fighter clip map against the typed asset manifest. Runs
 * `validateClipMap` per asset key: absent clips and unmapped states throw
 * `FIGHTER_CLIP_MISSING` with the full list; each stand-in emits one
 * `FIGHTER_CLIP_STAND_IN` warning.
 */
export function validateFighterClipMap(
  map: Partial<Record<FighterAssetKey, Partial<Record<FighterClip, AuraClipMapEntry>>>> = fighterClipMap,
  assetsMetadata: Readonly<Record<string, FighterClipMapAssetMetadata>> = assets
): AuraClipMapValidationReport {
  const missing: AuraClipMapValidationReport["missing"][number][] = [];
  const standIns: AuraClipMapValidationReport["standIns"][number][] = [];
  const diagnostics: string[] = [];
  for (const assetKey of Object.keys(map) as FighterAssetKey[]) {
    const states = map[assetKey];
    const availableClips = assetsMetadata[assetKey]?.metadata?.animations ?? [];
    const report = validateClipMap(states ?? {}, {
      availableClips,
      requiredStates: FIGHTER_CLIPS,
      label: assetKey
    });
    missing.push(...report.missing);
    standIns.push(...report.standIns);
    diagnostics.push(...report.diagnostics);
  }
  return { ok: missing.length === 0, missing, standIns, diagnostics };
}
