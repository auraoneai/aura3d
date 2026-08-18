/**
 * Turbo Drift Circuit audio runtime — a thin public-API wrapper around `createGameAudio`.
 *
 * Every cue maps to a CLI-registered typed audio asset (`assets.turbo*Sfx`) synthesized
 * in-repo by `apps/showcase-turbo-drift-circuit/scripts/build-sfx.mjs` (original CC0,
 * author "Aura3D synthesis"). No raw URLs, no invented asset ids, and playback only
 * ever happens after a user gesture unlocks the AudioContext.
 */
import { createGameAudio, type GameAudio } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

/** Logical gameplay cue identifiers used by the route. */
export type TurboAudioCue =
  | "engine"
  | "drift-scuff"
  | "wind"
  | "checkpoint"
  | "countdown"
  | "go"
  | "finish-fanfare"
  | "off-track"
  | "ui-confirm";

/** Typed audio asset keys registered through `aura3d assets add`. */
export type TurboAudioAssetKey =
  | "turboEngineSfx"
  | "turboDriftScuffSfx"
  | "turboWindSfx"
  | "turboCheckpointChimeSfx"
  | "turboCountdownBlipSfx"
  | "turboGoSfx"
  | "turboFinishFanfareSfx"
  | "turboOffTrackRumbleSfx"
  | "turboUiConfirmSfx";

export const turboAudioCueAssetKeys: Record<TurboAudioCue, TurboAudioAssetKey> = {
  engine: "turboEngineSfx",
  "drift-scuff": "turboDriftScuffSfx",
  wind: "turboWindSfx",
  checkpoint: "turboCheckpointChimeSfx",
  countdown: "turboCountdownBlipSfx",
  go: "turboGoSfx",
  "finish-fanfare": "turboFinishFanfareSfx",
  "off-track": "turboOffTrackRumbleSfx",
  "ui-confirm": "turboUiConfirmSfx"
};

export interface TurboAudioCueDefinition {
  readonly cue: TurboAudioCue;
  readonly bus: "player" | "ambience" | "ui";
  readonly intent: string;
  readonly loop: boolean;
  readonly assetKey: TurboAudioAssetKey;
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
export function turboAudioAssetReference(key: TurboAudioAssetKey) {
  const asset = assets[key];
  if (!asset.hash || !asset.url) {
    throw new Error(`Turbo audio asset ${key} is missing its generated content hash/url.`);
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
  cue: TurboAudioCue,
  bus: TurboAudioCueDefinition["bus"],
  intent: string,
  loop: boolean,
  volume: number
): TurboAudioCueDefinition {
  const assetKey = turboAudioCueAssetKeys[cue];
  return {
    cue,
    bus,
    intent,
    loop,
    assetKey,
    asset: turboAudioAssetReference(assetKey),
    volume
  };
}

/** Committed cue -> bus/intent/asset/volume manifest. */
export const turboAudioManifest: Record<TurboAudioCue, TurboAudioCueDefinition> = {
  engine: define("engine", "ambience", "Driving engine loop, gated by throttle presence.", true, 0.5),
  "drift-scuff": define("drift-scuff", "player", "Tyres scuffing while the car is drifting.", false, 0.7),
  wind: define("wind", "ambience", "Ambient wind loop at speed.", true, 0.25),
  checkpoint: define("checkpoint", "player", "Ordered gate credited.", false, 0.6),
  countdown: define("countdown", "player", "Start-light countdown tick.", false, 0.5),
  go: define("go", "player", "Green-flag start blast.", false, 0.65),
  "finish-fanfare": define("finish-fanfare", "player", "Race-complete fanfare.", false, 0.7),
  "off-track": define("off-track", "player", "Grass/verge rumble when leaving the road.", false, 0.6),
  "ui-confirm": define("ui-confirm", "ui", "Pause/reset confirmation.", false, 0.4)
};

export const turboAudioAssets = Object.freeze(
  Object.fromEntries(
    Object.values(turboAudioCueAssetKeys).map((key) => [key, turboAudioAssetReference(key)])
  ) as Record<TurboAudioAssetKey, ReturnType<typeof turboAudioAssetReference>>
);

export interface TurboAudioProof {
  readonly enabled: boolean;
  readonly muted: boolean;
  readonly unlocked: boolean;
  readonly contextState: string;
  readonly sfxReady: boolean;
  readonly lastCue: TurboAudioCue | null;
  readonly recentCues: readonly TurboAudioCue[];
  readonly playedCueCount: number;
  readonly suppressedCueCount: number;
  readonly cueCount: number;
  readonly typedAssetCount: number;
  readonly assetUrls: readonly string[];
  readonly audioErrors: readonly string[];
  readonly gestureUnlocked: boolean;
}

export interface TurboAudioController {
  readonly cue: (name: TurboAudioCue) => Promise<void>;
  readonly unlock: () => Promise<void>;
  readonly proof: () => TurboAudioProof;
  readonly dispose: () => Promise<void>;
}

let cachedAudio: GameAudio<TurboAudioCue> | null = null;

export function createTurboAudio(reducedMotion = false): TurboAudioController {
  const recentCues: TurboAudioCue[] = [];
  let gestureUnlocked = false;
  const assetUrls = Object.values(turboAudioAssets).map((asset) => asset.url);

  if (!cachedAudio) {
    const cueEntries = Object.fromEntries(
      Object.values(turboAudioManifest).map((definition) => [
        definition.cue,
        {
          id: definition.cue,
          bus: definition.bus,
          volume: definition.volume,
          loop: definition.loop,
          asset: definition.asset
        }
      ])
    ) as unknown as Record<TurboAudioCue, Parameters<typeof createGameAudio<TurboAudioCue>>[0]["cues"][TurboAudioCue]>;

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

  async function cue(name: TurboAudioCue): Promise<void> {
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
        && Object.keys(turboAudioManifest).length >= 9
        && assetUrls.length >= 9;
      return {
        enabled: evidence.enabled && !evidence.muted,
        muted: evidence.muted,
        unlocked: evidence.unlocked,
        contextState: evidence.contextState,
        sfxReady: reducedMotion ? false : ready,
        lastCue: evidence.lastCue as TurboAudioCue | null,
        recentCues: recentCues.slice(),
        playedCueCount: evidence.playedCueCount,
        suppressedCueCount: evidence.suppressedCueCount,
        cueCount: Object.keys(turboAudioManifest).length,
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
