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
  | "win"
  | "ko"
  | "draw";

export interface AuraClashAudioCueDefinition {
  readonly cue: AuraClashAudioCue;
  readonly bus: "ui" | "combat" | "round";
  readonly intent: string;
  readonly asset: AuraClashAudioAssetReference;
  readonly volume: number;
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

export const auraClashAudioCueAssetKeys: Record<AuraClashAudioCue, AuraClashAudioAssetKey> = {
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
  win: "auraClashWinSfx",
  ko: "auraClashKoSfx",
  draw: "auraClashDrawSfx"
};

export function auraClashAudioAssetReference(key: AuraClashAudioAssetKey): AuraClashAudioAssetReference {
  const asset = assets[key];
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
  special: cue("special", "combat", "Accepted special attack launch feedback.", 0.7),
  "special-denied": cue("special-denied", "ui", "Insufficient meter or cooldown feedback.", 0.7),
  jump: cue("jump", "combat", "Player jump launch feedback.", 0.5),
  dash: cue("dash", "combat", "Player dash movement feedback.", 0.55),
  "player-hit": cue("player-hit", "combat", "Player hit confirm.", 0.8),
  "rival-hit": cue("rival-hit", "combat", "Rival hit confirm.", 0.8),
  guard: cue("guard", "combat", "Blocked strike feedback.", 0.85),
  win: cue("win", "round", "Player round victory.", 0.8),
  ko: cue("ko", "round", "Rival round victory.", 0.9),
  draw: cue("draw", "round", "Draw round.", 0.75)
};

export const auraClashAudioAssets = Object.freeze(
  Object.fromEntries(
    Object.values(auraClashAudioCueAssetKeys).map((key) => [key, auraClashAudioAssetReference(key)])
  ) as Record<AuraClashAudioAssetKey, AuraClashAudioAssetReference>
);

function cue(cueId: AuraClashAudioCue, bus: AuraClashAudioCueDefinition["bus"], intent: string, volume: number): AuraClashAudioCueDefinition {
  return {
    cue: cueId,
    bus,
    intent,
    asset: auraClashAudioAssetReference(auraClashAudioCueAssetKeys[cueId]),
    volume
  };
}

function kenneySourceUrlForAsset(key: AuraClashAudioAssetKey): AuraClashAudioAssetReference["sourceUrl"] {
  if (key === "auraClashHitSfx" || key === "auraClashGuardSfx") return "https://kenney.nl/assets/impact-sounds";
  if (key === "auraClashJumpSfx" || key === "auraClashDashSfx" || key === "auraClashSpecialSfx" || key === "auraClashKoSfx") {
    return "https://kenney.nl/assets/sci-fi-sounds";
  }
  return "https://kenney.nl/assets/interface-sounds";
}
