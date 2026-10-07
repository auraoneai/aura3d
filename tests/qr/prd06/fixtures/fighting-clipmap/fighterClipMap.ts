/**
 * PRD-06 T0.9a — the fighting-game clip-map pattern as a lane fixture.
 *
 * `templates/fighting-game/src/game/fighters.ts` still registers nine
 * `tracks: []` / `poseBakedFallback` clips; its rewrite (Q-13-1, PRD 13)
 * adopts this pattern. The map is modelled on
 * `apps/aura-clash-showcase/src/playable/animation/auraClashClipMaps.ts` and
 * is explicit about stand-ins for today's default hero pair (E9b), read by
 * path from `templates/fighting-game/src/aura-assets.ts`:
 *
 * - player `showcaseWalkAnimatedGirl` embeds only "Take 001" → every state
 *   maps to it, `standIn: true` on all but `walk`;
 * - rival `showcaseRunnerRobot` embeds IDLE/WALK/RUN/ALL → idle→IDLE,
 *   walk→WALK, dash→RUN, everything else stands in on IDLE.
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
  showcaseWalkAnimatedGirl: {
    idle: { clip: "Take 001", standIn: true },
    walk: { clip: "Take 001" },
    jump: { clip: "Take 001", standIn: true },
    dash: { clip: "Take 001", standIn: true },
    guard: { clip: "Take 001", standIn: true },
    light: { clip: "Take 001", standIn: true },
    heavy: { clip: "Take 001", standIn: true },
    special: { clip: "Take 001", standIn: true },
    hitstun: { clip: "Take 001", standIn: true }
  },
  showcaseRunnerRobot: {
    idle: { clip: "IDLE" },
    walk: { clip: "WALK" },
    jump: { clip: "IDLE", standIn: true },
    dash: { clip: "RUN" },
    guard: { clip: "IDLE", standIn: true },
    light: { clip: "IDLE", standIn: true },
    heavy: { clip: "IDLE", standIn: true },
    special: { clip: "IDLE", standIn: true },
    hitstun: { clip: "IDLE", standIn: true }
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
