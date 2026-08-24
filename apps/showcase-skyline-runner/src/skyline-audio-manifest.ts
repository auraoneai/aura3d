/**
 * Skyline Runner SFX manifest — maps gameplay cues to typed, CLI-registered audio.
 *
 * Every cue below resolves to a generated `assets.skyline*Sfx` audio entry that was
 * committed through `aura3d assets add` from `scripts/build-sfx.mjs` (original CC0
 * synthesis, author "Aura3D synthesis"). No raw URLs, no invented ids — playback uses
 * the typed asset member so provenance stays in `aura.assets.json`.
 */
import { assets } from "../../../src/aura-assets";

export type SkylineAudioCue =
  | "jump"
  | "land-dust"
  | "dash"
  | "coin-chime"
  | "ember-pickup"
  | "ember-fire"
  | "ember-deny"
  | "ember-impact"
  | "sentry-telegraph"
  | "sentry-defeat"
  | "death"
  | "respawn"
  | "checkpoint"
  | "summit"
  | "pause"
  | "reset"
  /** Per-act ambience loops (SR-A6), one bus per stem so acts crossfade by volume. */
  | "ambience-grove"
  | "ambience-steel"
  | "ambience-crown";

export interface SkylineAudioCueDefinition {
  readonly cue: SkylineAudioCue;
  readonly bus: "player" | "combat" | "story" | "ui" | "ambience-grove" | "ambience-steel" | "ambience-crown";
  readonly intent: string;
  readonly assetKey: SkylineAudioAssetKey;
  /** Ambience stems loop; every gameplay cue is one-shot. */
  readonly loop?: boolean;
  readonly asset: {
    readonly url: string;
    readonly hash: string;
    readonly format: "wav";
    readonly license: "CC0-1.0";
    readonly author: "Aura3D synthesis";
  };
  readonly volume: number;
}

export type SkylineAudioAssetKey =
  | "skylineJumpSfx"
  | "skylineLandDustSfx"
  | "skylineDashWindSfx"
  | "skylineCoinChimeSfx"
  | "skylineEmberFireSfx"
  | "skylineEmberDenySfx"
  | "skylineSentryDefeatSfx"
  | "skylineSentryTelegraphSfx"
  | "skylineDeathStingSfx"
  | "skylineRespawnRecoverySfx"
  | "skylineCheckpointFanfareSfx"
  | "skylineSummitThemeSfx"
  | "skylineAmbienceGroveSfx"
  | "skylineAmbienceSteelSfx"
  | "skylineAmbienceCrownSfx";

export const skylineAudioCueAssetKeys: Record<SkylineAudioCue, SkylineAudioAssetKey> = {
  jump: "skylineJumpSfx",
  "land-dust": "skylineLandDustSfx",
  dash: "skylineDashWindSfx",
  "coin-chime": "skylineCoinChimeSfx",
  "ember-pickup": "skylineCoinChimeSfx",
  "ember-fire": "skylineEmberFireSfx",
  "ember-deny": "skylineEmberDenySfx",
  "ember-impact": "skylineEmberFireSfx",
  "sentry-telegraph": "skylineSentryTelegraphSfx",
  "sentry-defeat": "skylineSentryDefeatSfx",
  death: "skylineDeathStingSfx",
  respawn: "skylineRespawnRecoverySfx",
  checkpoint: "skylineCheckpointFanfareSfx",
  summit: "skylineSummitThemeSfx",
  pause: "skylineCoinChimeSfx",
  reset: "skylineLandDustSfx",
  "ambience-grove": "skylineAmbienceGroveSfx",
  "ambience-steel": "skylineAmbienceSteelSfx",
  "ambience-crown": "skylineAmbienceCrownSfx"
};

/** Throws if the typed audio asset is missing a content hash — no silent placeholder. */
export function skylineAudioAssetReference(key: SkylineAudioAssetKey) {
  const asset = assets[key];
  if (!asset.hash || !asset.url) {
    throw new Error(`Skyline audio asset ${key} is missing its generated content hash/url.`);
  }
  return {
    key,
    typedAssetMember: `assets.${key}`,
    url: asset.url,
    hash: asset.hash,
    format: "wav" as const,
    license: "CC0-1.0" as const,
    author: "Aura3D synthesis" as const
  };
}

/** Bus id carrying each ambience stem; acts crossfade by bus volume. */
export type SkylineAmbienceBusId = "ambience-grove" | "ambience-steel" | "ambience-crown";

/** Resting gain of whichever act's ambience bus is active. */
export const SKYLINE_AMBIENCE_BUS_LEVEL = 0.5;
/** Gain the active stem ducks to while the summit theme plays. */
export const SKYLINE_AMBIENCE_DUCK_LEVEL = 0.08;
/** How long the summit theme holds the duck before the stem swells back. */
export const SKYLINE_AMBIENCE_DUCK_SECONDS = 2.6;

/** Steel Dawn owns acts 0-1, Hanging Grove acts 2-3, and Crown Heights act 4. */
export function skylineAmbienceBusForAct(actIndex: number): SkylineAmbienceBusId {
  if (actIndex >= 4) return "ambience-crown";
  if (actIndex >= 2) return "ambience-grove";
  return "ambience-steel";
}

/** The committed manifest, in the Clash cliff pattern: cue -> bus/intent/asset/volume. */
export const skylineAudioManifest: Record<SkylineAudioCue, SkylineAudioCueDefinition> = {
  jump: cue("jump", "player", "Hero launches a variable-height jump.", 0.55),
  "land-dust": cue("land-dust", "player", "Hero lands on a certified surface with recovery dust.", 0.5),
  dash: cue("dash", "player", "Hero commits a short authored dash burst.", 0.52),
  "coin-chime": cue("coin-chime", "story", "Sky-shard collect chime.", 0.6),
  "ember-pickup": cue("ember-pickup", "story", "Ember charge pickup.", 0.55),
  "ember-fire": cue("ember-fire", "combat", "Ember volley launch.", 0.6),
  "ember-deny": cue("ember-deny", "combat", "Ember fire attempted with empty stock.", 0.6),
  "ember-impact": cue("ember-impact", "combat", "Ember volley hits a sentry.", 0.6),
  "sentry-telegraph": cue("sentry-telegraph", "combat", "Sentry 0.5s intercept warning.", 0.4),
  "sentry-defeat": cue("sentry-defeat", "combat", "Sentry defeated.", 0.65),
  death: cue("death", "story", "Fall/hazard impact sting.", 0.6),
  respawn: cue("respawn", "story", "Relay recovery and control return.", 0.58),
  checkpoint: cue("checkpoint", "story", "Relay checkpoint activated.", 0.6),
  summit: cue("summit", "story", "Summit beacon reached.", 0.7),
  pause: cue("pause", "ui", "Pause toggle.", 0.35),
  reset: cue("reset", "ui", "Full run reset.", 0.4),
  "ambience-grove": { ...cue("ambience-grove", "ambience-grove", "Hanging Grove birdsong and warm garden bed (acts 2-3).", 1), loop: true },
  "ambience-steel": { ...cue("ambience-steel", "ambience-steel", "Steel Dawn wind-over-roofs gusts (acts 0-1).", 1), loop: true },
  "ambience-crown": { ...cue("ambience-crown", "ambience-crown", "Crown Heights sunrise shimmer (act 4).", 1), loop: true }
};

export const skylineAudioAssets = Object.freeze(
  Object.fromEntries(
    Object.values(skylineAudioCueAssetKeys).map((key) => [key, skylineAudioAssetReference(key)])
  ) as Record<SkylineAudioAssetKey, ReturnType<typeof skylineAudioAssetReference>>
);

function cue(cueId: SkylineAudioCue, bus: SkylineAudioCueDefinition["bus"], intent: string, volume: number): SkylineAudioCueDefinition {
  return {
    cue: cueId,
    bus,
    intent,
    assetKey: skylineAudioCueAssetKeys[cueId],
    asset: skylineAudioAssetReference(skylineAudioCueAssetKeys[cueId]),
    volume
  };
}
