/**
 * Siege Golf audio runtime - a thin public-API wrapper around createGameAudio,
 * following the committed manifest discipline of the sibling showcase routes.
 *
 * Every cue maps to a CLI-registered typed audio asset synthesized in-repo by
 * scripts/build-sfx.mjs (original CC0, author "Aura3D synthesis"). No raw URLs,
 * no invented asset ids; playback happens only after a user gesture unlocks the
 * AudioContext. Buses split gameplay sfx, ambience, and UI confirmations.
 */
import { createGameAudio, type GameAudio } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

/** Logical gameplay cue identifiers used by the route. */
export type GolfAudioCue =
  | "drive-hit"
  | "wood-crack"
  | "metal-clang"
  | "target-down"
  | "cup-sink"
  | "par-chime"
  | "bogey-sting"
  | "ui-confirm"
  | "ambient-wind";

/** Typed audio asset keys registered through aura3d assets add. */
export type GolfAudioAssetKey =
  | "siegeDriveHitSfx"
  | "siegeWoodCrackSfx"
  | "siegeMetalClangSfx"
  | "siegeTargetDownSfx"
  | "siegeCupSinkSfx"
  | "siegeParChimeSfx"
  | "siegeBogeyStingSfx"
  | "siegeUiConfirmSfx"
  | "siegeAmbientWindSfx";

export const golfAudioCueAssetKeys: Record<GolfAudioCue, GolfAudioAssetKey> = {
  "drive-hit": "siegeDriveHitSfx",
  "wood-crack": "siegeWoodCrackSfx",
  "metal-clang": "siegeMetalClangSfx",
  "target-down": "siegeTargetDownSfx",
  "cup-sink": "siegeCupSinkSfx",
  "par-chime": "siegeParChimeSfx",
  "bogey-sting": "siegeBogeyStingSfx",
  "ui-confirm": "siegeUiConfirmSfx",
  "ambient-wind": "siegeAmbientWindSfx"
};

export type GolfAudioBus = "sfx" | "ambient" | "ui";

export interface GolfAudioCueDefinition {
  readonly cue: GolfAudioCue;
  readonly bus: GolfAudioBus;
  readonly intent: string;
  readonly loop: boolean;
  readonly assetKey: GolfAudioAssetKey;
  readonly asset: {
    readonly url: string;
    readonly hash: string;
    readonly format: "wav";
    readonly license: "CC0-1.0";
    readonly author: "Aura3D synthesis";
  };
  readonly volume: number;
}

/** Throws if a typed audio asset is missing its generated content hash/url. */
export function golfAudioAssetReference(key: GolfAudioAssetKey) {
  const asset = assets[key];
  if (!asset.hash || !asset.url) {
    throw new Error(`Siege Golf audio asset ${key} is missing its generated content hash/url.`);
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

function define(
  cue: GolfAudioCue,
  bus: GolfAudioBus,
  intent: string,
  loop: boolean,
  volume: number
): GolfAudioCueDefinition {
  const assetKey = golfAudioCueAssetKeys[cue];
  return {
    cue,
    bus,
    intent,
    loop,
    assetKey,
    asset: golfAudioAssetReference(assetKey),
    volume
  };
}

/** Committed cue -> bus/intent/asset/volume manifest (SG-09). */
export const golfAudioManifest: Record<GolfAudioCue, GolfAudioCueDefinition> = {
  "drive-hit": define("drive-hit", "sfx", "Ball strike at launch.", false, 0.75),
  "wood-crack": define("wood-crack", "sfx", "Plank or crate contact above the speed band.", false, 0.6),
  "metal-clang": define("metal-clang", "sfx", "Barrel or pedestal ring on hard contact.", false, 0.55),
  "target-down": define("target-down", "sfx", "A knock-down pin topples over.", false, 0.7),
  "cup-sink": define("cup-sink", "sfx", "A fallen pin settles inside a cup sensor.", false, 0.8),
  "par-chime": define("par-chime", "ui", "Hole completed at par or better.", false, 0.7),
  "bogey-sting": define("bogey-sting", "ui", "Over-par completion or hole failure.", false, 0.65),
  "ui-confirm": define("ui-confirm", "ui", "Pause, reset, and charge-start confirmation.", false, 0.4),
  "ambient-wind": define("ambient-wind", "ambient", "Night driving-range wind loop.", true, 0.22)
};

export const golfAudioAssets = Object.freeze(
  Object.fromEntries(
    Object.values(golfAudioCueAssetKeys).map((key) => [key, golfAudioAssetReference(key)])
  ) as Record<GolfAudioAssetKey, ReturnType<typeof golfAudioAssetReference>>
);

export interface GolfAudioProof {
  readonly enabled: boolean;
  readonly muted: boolean;
  readonly unlocked: boolean;
  readonly contextState: string;
  readonly sfxReady: boolean;
  readonly lastCue: GolfAudioCue | null;
  readonly recentCues: readonly string[];
  readonly playedCueCount: number;
  readonly suppressedCueCount: number;
  readonly cueCount: number;
  readonly typedAssetCount: number;
  readonly assetUrls: readonly string[];
  readonly audioErrors: readonly string[];
  readonly gestureUnlocked: boolean;
}

export interface GolfAudioController {
  readonly cue: (name: GolfAudioCue) => Promise<void>;
  readonly unlock: () => Promise<void>;
  readonly proof: () => GolfAudioProof;
  readonly dispose: () => Promise<void>;
}

let cachedAudio: GameAudio<GolfAudioCue> | null = null;

export function createGolfAudio(reducedMotion = false): GolfAudioController {
  const recentCues: string[] = [];
  let gestureUnlocked = false;
  const assetUrls = Object.values(golfAudioAssets).map((asset) => asset.url);

  if (!cachedAudio) {
    const cueEntries = Object.fromEntries(
      Object.values(golfAudioManifest).map((definition) => [
        definition.cue,
        {
          id: definition.cue,
          bus: definition.bus,
          volume: definition.volume,
          loop: definition.loop,
          asset: definition.asset
        }
      ])
    ) as unknown as Record<GolfAudioCue, Parameters<typeof createGameAudio<GolfAudioCue>>[0]["cues"][GolfAudioCue]>;

    cachedAudio = createGameAudio({
      browserContext: true,
      buses: [
        { id: "sfx", volume: 0.85 },
        { id: "ambient", volume: 0.5 },
        { id: "ui", volume: 0.6 }
      ],
      cues: cueEntries
    });
  }
  const audio = cachedAudio;

  return {
    async cue(name) {
      recentCues.push(name);
      if (recentCues.length > 32) recentCues.shift();
      await audio.cue(name);
    },
    async unlock() {
      await audio.unlock();
      gestureUnlocked = true;
    },
    proof() {
      const evidence = audio.evidence;
      const ready = evidence.enabled
        && Object.keys(golfAudioManifest).length >= 9
        && assetUrls.length >= 9;
      return {
        enabled: evidence.enabled && !evidence.muted,
        muted: evidence.muted,
        unlocked: evidence.unlocked,
        contextState: evidence.contextState,
        // Reduced-motion routes keep audio but skip motion-coupled cues.
        sfxReady: ready && !reducedMotion ? ready : evidence.enabled,
        lastCue: evidence.lastCue as GolfAudioCue | null,
        recentCues: recentCues.slice(),
        playedCueCount: evidence.playedCueCount,
        suppressedCueCount: evidence.suppressedCueCount,
        cueCount: Object.keys(golfAudioManifest).length,
        typedAssetCount: assetUrls.length,
        assetUrls: assetUrls.slice(),
        audioErrors: evidence.errors.slice(),
        gestureUnlocked
      };
    },
    async dispose() {
      // Shared cached AudioContext stays alive across pause/reset cycles.
    }
  };
}
