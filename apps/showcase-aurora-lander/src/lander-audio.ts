/**
 * Aurora Lander audio runtime — a thin public-API wrapper around `createGameAudio`.
 *
 * Every cue maps to a CLI-registered typed audio asset (`assets.aurora*Sfx`)
 * synthesized in-repo by `apps/showcase-aurora-lander/scripts/build-sfx.mjs`
 * (original CC0, author "Aura3D synthesis"). No raw URLs, no invented asset ids,
 * and playback only happens after a user gesture unlocks the AudioContext.
 */
import { createGameAudio, type GameAudio } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

/** Logical gameplay cue identifiers used by the route (PRD §7 manifest). */
export type LanderAudioCue =
  | "thrust-loop"
  | "rcs-puff"
  | "touch-soft"
  | "touch-hard"
  | "crash"
  | "pad-lock"
  | "fuel-low"
  | "site-clear"
  | "gust-warn"
  | "ambient-wind";

/** Typed audio asset keys registered through `aura3d assets add`. */
export type LanderAudioAssetKey =
  | "auroraThrustLoopSfx"
  | "auroraRcsPuffSfx"
  | "auroraTouchSoftSfx"
  | "auroraTouchHardSfx"
  | "auroraCrashSfx"
  | "auroraPadLockSfx"
  | "auroraFuelLowSfx"
  | "auroraSiteClearSfx"
  | "auroraGustWarnSfx"
  | "auroraAmbientWindSfx";

export const landerAudioCueAssetKeys: Record<LanderAudioCue, LanderAudioAssetKey> = {
  "thrust-loop": "auroraThrustLoopSfx",
  "rcs-puff": "auroraRcsPuffSfx",
  "touch-soft": "auroraTouchSoftSfx",
  "touch-hard": "auroraTouchHardSfx",
  crash: "auroraCrashSfx",
  "pad-lock": "auroraPadLockSfx",
  "fuel-low": "auroraFuelLowSfx",
  "site-clear": "auroraSiteClearSfx",
  "gust-warn": "auroraGustWarnSfx",
  "ambient-wind": "auroraAmbientWindSfx"
};

export interface LanderAudioCueDefinition {
  readonly cue: LanderAudioCue;
  readonly bus: "player" | "ambience" | "ui";
  readonly intent: string;
  readonly loop: boolean;
  readonly assetKey: LanderAudioAssetKey;
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
export function landerAudioAssetReference(key: LanderAudioAssetKey) {
  const asset = assets[key];
  if (!asset.hash || !asset.url) {
    throw new Error(`Aurora Lander audio asset ${key} is missing its generated content hash/url.`);
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
  cue: LanderAudioCue,
  bus: LanderAudioCueDefinition["bus"],
  intent: string,
  loop: boolean,
  volume: number
): LanderAudioCueDefinition {
  const assetKey = landerAudioCueAssetKeys[cue];
  return {
    cue,
    bus,
    intent,
    loop,
    assetKey,
    asset: landerAudioAssetReference(assetKey),
    volume
  };
}

/** Committed cue -> bus/intent/asset/volume manifest. All ten PRD cues are present. */
export const landerAudioManifest: Record<LanderAudioCue, LanderAudioCueDefinition> = {
  "thrust-loop": define("thrust-loop", "player", "Main engine burn loop, gated by throttle.", true, 0.55),
  "rcs-puff": define("rcs-puff", "player", "Attitude thruster puff while rotating.", false, 0.5),
  "touch-soft": define("touch-soft", "player", "Gentle touchdown thump on a graded soft landing.", false, 0.7),
  "touch-hard": define("touch-hard", "player", "Harsh impact of a hard (penalized) landing.", false, 0.75),
  crash: define("crash", "player", "Debris burst when the lander is destroyed.", false, 0.85),
  "pad-lock": define("pad-lock", "ui", "Pad sensor zone confirmation chime.", false, 0.45),
  "fuel-low": define("fuel-low", "ui", "Low-fuel attention blip pair.", false, 0.5),
  "site-clear": define("site-clear", "ui", "Site-cleared fanfare after a valid landing.", false, 0.7),
  "gust-warn": define("gust-warn", "ambience", "Storm gust telegraph before lateral force applies.", false, 0.6),
  "ambient-wind": define("ambient-wind", "ambience", "Slow ambient wind bed under everything.", true, 0.22)
};

export const landerAudioAssets = Object.freeze(
  Object.fromEntries(
    Object.values(landerAudioCueAssetKeys).map((key) => [key, landerAudioAssetReference(key)])
  ) as Record<LanderAudioAssetKey, ReturnType<typeof landerAudioAssetReference>>
);

export interface LanderAudioProof {
  readonly enabled: boolean;
  readonly muted: boolean;
  readonly unlocked: boolean;
  readonly contextState: string;
  readonly sfxReady: boolean;
  readonly lastCue: LanderAudioCue | null;
  readonly recentCues: readonly LanderAudioCue[];
  readonly playedCueCount: number;
  readonly suppressedCueCount: number;
  readonly cueCount: number;
  readonly typedAssetCount: number;
  readonly assetUrls: readonly string[];
  readonly audioErrors: readonly string[];
  readonly gestureUnlocked: boolean;
}

export interface LanderAudioController {
  readonly cue: (name: LanderAudioCue) => Promise<void>;
  readonly unlock: () => Promise<void>;
  readonly proof: () => LanderAudioProof;
  readonly dispose: () => Promise<void>;
}

let cachedAudio: GameAudio<LanderAudioCue> | null = null;

export function createLanderAudio(reducedMotion = false): LanderAudioController {
  const recentCues: LanderAudioCue[] = [];
  let gestureUnlocked = false;
  const assetUrls = Object.values(landerAudioAssets).map((asset) => asset.url);

  if (!cachedAudio) {
    const cueEntries = Object.fromEntries(
      Object.values(landerAudioManifest).map((definition) => [
        definition.cue,
        {
          id: definition.cue,
          bus: definition.bus,
          volume: definition.volume,
          loop: definition.loop,
          asset: definition.asset
        }
      ])
    ) as unknown as Record<LanderAudioCue, Parameters<typeof createGameAudio<LanderAudioCue>>[0]["cues"][LanderAudioCue]>;

    cachedAudio = createGameAudio({
      browserContext: true,
      buses: [
        { id: "player", volume: 0.8 },
        { id: "ambience", volume: 0.5 },
        { id: "ui", volume: 0.6 }
      ],
      cues: cueEntries
    });
  }
  const audio = cachedAudio;

  async function cue(name: LanderAudioCue): Promise<void> {
    recentCues.push(name);
    if (recentCues.length > 24) recentCues.shift();
    await audio.cue(name);
  }

  return {
    async cue(name) {
      await cue(name);
    },
    async unlock() {
      await audio.unlock();
      gestureUnlocked = true;
    },
    proof() {
      const evidence = audio.evidence;
      const ready = evidence.enabled
        && Object.keys(landerAudioManifest).length === 10
        && assetUrls.length === 10;
      return {
        enabled: evidence.enabled && !evidence.muted,
        muted: evidence.muted,
        unlocked: evidence.unlocked,
        contextState: evidence.contextState,
        sfxReady: reducedMotion ? false : ready,
        lastCue: evidence.lastCue as LanderAudioCue | null,
        recentCues: recentCues.slice(),
        playedCueCount: evidence.playedCueCount,
        suppressedCueCount: evidence.suppressedCueCount,
        cueCount: Object.keys(landerAudioManifest).length,
        typedAssetCount: assetUrls.length,
        assetUrls: assetUrls.slice(),
        audioErrors: evidence.errors.slice(),
        gestureUnlocked
      };
    },
    async dispose() {
      // Shared cached AudioContext stays alive across pause/reset.
    }
  };
}
