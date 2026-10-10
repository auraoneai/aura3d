import { assets } from "../../aura-assets";

export type AuraClashAudioCue =
  | "pause"
  | "resume"
  | "reset"
  | "special"
  | "special-denied"
  | "jump"
  | "dash"
  | "player-hit"
  | "rival-hit"
  | "guard"
  | "guard-break"
  | "swing"
  | "footstep"
  | "win"
  | "ko"
  | "ko-impact"
  | "draw"
  // PRD-09 1740 — announcer lines and the arena bed come from `game-sfx-core`.
  | "round"
  | "fight"
  | "crowd-bed";

/**
 * AC-A6 — bus separation.
 *
 * The route's cues are split across named buses with independent levels: `music` carries the
 * round-result stingers, `sfx` carries every combat sound, `voice` carries the round-over
 * announcer line, and `ui` keeps interface feedback out of the fight mix. Guard-block versus hit
 * were already distinct cues; they now also sit on a bus whose level can move independently of
 * everything else (and be ducked as one layer).
 */
export type AuraClashAudioBusId = "music" | "sfx" | "voice" | "ui";

export interface AuraClashAudioCueDefinition {
  readonly cue: AuraClashAudioCue;
  readonly bus: AuraClashAudioBusId;
  readonly intent: string;
  readonly asset: AuraClashAudioCueAsset;
  readonly volume: number;
  readonly loop?: boolean;
}

export type AuraClashAudioAssetKey =
  | "auraClashHitSfx"
  | "auraClashGuardSfx"
  | "auraClashJumpSfx"
  | "auraClashDashSfx"
  | "auraClashSpecialSfx"
  | "auraClashKoSfx"
  | "auraClashUiConfirmSfx"
  | "auraClashUiToggleSfx"
  | "auraClashDeniedSfx"
  | "auraClashWinSfx"
  | "auraClashDrawSfx";

export interface AuraClashAudioAssetReference {
  readonly key: AuraClashAudioAssetKey;
  readonly typedAssetMember: `assets.${AuraClashAudioAssetKey}`;
  readonly url: string;
  readonly hash: string;
  readonly license: "CC0-1.0";
  readonly author: "Kenney";
  readonly sourceUrl: "https://kenney.nl/assets/impact-sounds" | "https://kenney.nl/assets/interface-sounds" | "https://kenney.nl/assets/sci-fi-sounds";
}

/** game-sfx-core pack reference — announcer lines and the arena crowd bed. */
export interface AuraClashPackAssetReference {
  readonly url: string;
  readonly license: "CC0-1.0";
  readonly provenance: "sample";
  readonly pack: "game-sfx-core";
}

export type AuraClashAudioCueAsset = AuraClashAudioAssetReference | AuraClashPackAssetReference;

/** Cues still keyed to the route's own typed Kenney samples (11 preserved). */
export type AuraClashOwnAssetCue = Exclude<AuraClashAudioCue, "round" | "fight" | "ko" | "crowd-bed">;

const packAsset = (id: string): AuraClashPackAssetReference => ({
  url: `/packs/game-sfx-core/${id}.{format}`,
  license: "CC0-1.0",
  provenance: "sample",
  pack: "game-sfx-core"
});

export const auraClashAudioCueAssetKeys: Record<AuraClashOwnAssetCue, AuraClashAudioAssetKey> = {
  pause: "auraClashUiToggleSfx",
  resume: "auraClashUiToggleSfx",
  reset: "auraClashUiConfirmSfx",
  special: "auraClashSpecialSfx",
  "special-denied": "auraClashDeniedSfx",
  jump: "auraClashJumpSfx",
  dash: "auraClashDashSfx",
  "player-hit": "auraClashHitSfx",
  "rival-hit": "auraClashHitSfx",
  guard: "auraClashGuardSfx",
  "guard-break": "auraClashSpecialSfx",
  swing: "auraClashDashSfx",
  footstep: "auraClashDashSfx",
  win: "auraClashWinSfx",
  // The KO announcer line moved to `creature.announcer.ko`; the Kenney impact
  // stays as the KO landing hit.
  "ko-impact": "auraClashKoSfx",
  draw: "auraClashDrawSfx"
};

/** Independent per-bus levels handed to `createGameAudio` (AC-A6). */
export const auraClashAudioBusLevels: Readonly<Record<AuraClashAudioBusId, number>> = Object.freeze({
  music: 0.55,
  sfx: 1,
  voice: 0.9,
  ui: 0.8
});

/**
 * AC-A6 — KO ducking contract.
 *
 * When a round ends, combat noise must fall away so the round-over stinger/announcer line reads.
 * The `sfx` bus drops to `duckedLevel` for `restoreAfterSeconds`, then returns to its declared
 * level. Constants live here so evidence and tests read the same numbers the controller applies.
 */
export const auraClashAudioKoDuck = Object.freeze({
  bus: "sfx" as AuraClashAudioBusId,
  duckedLevel: 0.32,
  restoreAfterSeconds: 1.3
});

export function auraClashAudioAssetReference(key: AuraClashAudioAssetKey): AuraClashAudioAssetReference {
  const asset = assets[key];
  if (!asset.hash) throw new Error(`Aura Clash audio asset ${key} is missing its generated content hash.`);
  return {
    key,
    typedAssetMember: `assets.${key}`,
    url: asset.url,
    hash: asset.hash,
    license: "CC0-1.0",
    author: "Kenney",
    sourceUrl: kenneySourceUrlForAsset(key)
  };
}

export const auraClashAudioManifest: Record<AuraClashAudioCue, AuraClashAudioCueDefinition> = {
  pause: cue("pause", "ui", "Pause menu confirmation.", 0.7),
  resume: cue("resume", "ui", "Resume confirmation.", 0.7),
  reset: cue("reset", "ui", "Round reset confirmation.", 0.75),
  special: cue("special", "sfx", "Accepted special attack launch feedback.", 0.7),
  "special-denied": cue("special-denied", "ui", "Insufficient meter or cooldown feedback.", 0.7),
  jump: cue("jump", "sfx", "Player jump launch feedback.", 0.5),
  dash: cue("dash", "sfx", "Player dash movement feedback.", 0.55),
  "player-hit": cue("player-hit", "sfx", "Player hit confirm.", 0.8),
  "rival-hit": cue("rival-hit", "sfx", "Rival hit confirm.", 0.8),
  guard: cue("guard", "sfx", "Blocked strike feedback.", 0.85),
  "guard-break": cue("guard-break", "sfx", "Guard-break crack distinct from an ordinary block.", 0.95),
  swing: cue("swing", "sfx", "Attack swing telegraph on the authored clip sfx frame (AC-A1 clip event).", 0.3),
  footstep: cue("footstep", "sfx", "Foot-plant footstep (driven by foot-IK foot-lock + authored clip events).", 0.35),
  win: cue("win", "music", "Player round victory stinger.", 0.8),
  ko: cue("ko", "voice", "Rival round victory announcer line.", 0.9, packAsset("creature.announcer.ko.00")),
  "ko-impact": cue("ko-impact", "sfx", "KO landing hit layered under the announcer line.", 0.9),
  draw: cue("draw", "music", "Draw round stinger.", 0.75),
  round: cue("round", "voice", "ROUND n announcer over the intro ceremony.", 0.9, packAsset("creature.announcer.round.00")),
  fight: cue("fight", "voice", "FIGHT announcer when the intro clears.", 0.95, packAsset("creature.announcer.fight.00")),
  "crowd-bed": cue("crowd-bed", "music", "Arena crowd bed looped under the fight mix.", 0.35, packAsset("ambience.crowd-arena"), true)
};

export const auraClashAudioAssets = Object.freeze(
  Object.fromEntries(
    Object.values(auraClashAudioCueAssetKeys).map((key) => [key, auraClashAudioAssetReference(key)])
  ) as Record<AuraClashAudioAssetKey, AuraClashAudioAssetReference>
);

function cue(
  cueId: AuraClashAudioCue,
  bus: AuraClashAudioBusId,
  intent: string,
  volume: number,
  asset?: AuraClashPackAssetReference,
  loop = false
): AuraClashAudioCueDefinition {
  return {
    cue: cueId,
    bus,
    intent,
    asset: asset ?? auraClashAudioAssetReference(auraClashAudioCueAssetKeys[cueId as AuraClashOwnAssetCue]),
    volume,
    loop
  };
}

function kenneySourceUrlForAsset(key: AuraClashAudioAssetKey): AuraClashAudioAssetReference["sourceUrl"] {
  if (key === "auraClashHitSfx" || key === "auraClashGuardSfx") return "https://kenney.nl/assets/impact-sounds";
  if (key === "auraClashJumpSfx" || key === "auraClashDashSfx" || key === "auraClashSpecialSfx" || key === "auraClashKoSfx") {
    return "https://kenney.nl/assets/sci-fi-sounds";
  }
  return "https://kenney.nl/assets/interface-sounds";
}
