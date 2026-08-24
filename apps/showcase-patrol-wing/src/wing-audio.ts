/**
 * Patrol Wing audio runtime — a thin public-API wrapper around createGameAudio,
 * following the committed manifest discipline of the sibling showcase routes.
 *
 * Every cue maps to a CLI-registered typed audio asset synthesized in-repo by
 * scripts/build-sfx.mjs (original CC0, author "Aura3D synthesis"). No raw URLs,
 * no invented asset ids; playback happens only after a user gesture unlocks the
 * AudioContext. The engine bed loops on its own bus with throttle-mapped
 * volume; the ambient wind bed loops quietly underneath everything.
 */
import { createGameAudio, type GameAudio } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

export type WingAudioCue =
  | "engine-loop"
  | "ring-chime"
  | "cannon-fire"
  | "drone-hit"
  | "drone-down"
  | "hull-alarm"
  | "shot-down"
  | "crash-thud"
  | "touchdown"
  | "patrol-clear"
  | "ambient-wind";

export type WingAudioAssetKey =
  | "patrolWingEngineLoopSfx"
  | "patrolWingRingChimeSfx"
  | "patrolWingCannonFireSfx"
  | "patrolWingDroneHitSfx"
  | "patrolWingDroneDownSfx"
  | "patrolWingHullAlarmSfx"
  | "patrolWingShotDownSfx"
  | "patrolWingCrashThudSfx"
  | "patrolWingTouchdownSfx"
  | "patrolWingPatrolClearSfx"
  | "patrolWingAmbientWindSfx";

export const wingAudioCueAssetKeys: Record<WingAudioCue, WingAudioAssetKey> = {
  "engine-loop": "patrolWingEngineLoopSfx",
  "ring-chime": "patrolWingRingChimeSfx",
  "cannon-fire": "patrolWingCannonFireSfx",
  "drone-hit": "patrolWingDroneHitSfx",
  "drone-down": "patrolWingDroneDownSfx",
  "hull-alarm": "patrolWingHullAlarmSfx",
  "shot-down": "patrolWingShotDownSfx",
  "crash-thud": "patrolWingCrashThudSfx",
  touchdown: "patrolWingTouchdownSfx",
  "patrol-clear": "patrolWingPatrolClearSfx",
  "ambient-wind": "patrolWingAmbientWindSfx"
};

export type WingAudioBus = "engine" | "ambient" | "sfx" | "ui";

export interface WingAudioCueDefinition {
  readonly cue: WingAudioCue;
  readonly bus: WingAudioBus;
  readonly intent: string;
  readonly loop: boolean;
  readonly assetKey: WingAudioAssetKey;
  readonly asset: {
    readonly url: string;
    readonly hash: string;
    readonly format: "wav";
    readonly license: "CC0-1.0";
    readonly author: "Aura3D synthesis";
  };
  readonly volume: number;
}

function assetReference(key: WingAudioAssetKey) {
  const asset = assets[key];
  if (!asset.hash || !asset.url) {
    throw new Error(`Patrol Wing audio asset ${key} is missing its generated content hash/url.`);
  }
  return {
    url: asset.url,
    hash: asset.hash,
    format: "wav" as const,
    license: "CC0-1.0" as const,
    author: "Aura3D synthesis" as const
  };
}

function define(cue: WingAudioCue, bus: WingAudioBus, intent: string, loop: boolean, volume: number): WingAudioCueDefinition {
  const assetKey = wingAudioCueAssetKeys[cue];
  return { cue, bus, intent, loop, assetKey, asset: assetReference(assetKey), volume };
}

export const wingAudioManifest: Record<WingAudioCue, WingAudioCueDefinition> = {
  "engine-loop": define("engine-loop", "engine", "Throttle-mapped prop drone bed.", true, 0.55),
  "ambient-wind": define("ambient-wind", "ambient", "Open-air wind bed over the island.", true, 0.3),
  "ring-chime": define("ring-chime", "ui", "Ring gate passed in order.", false, 0.7),
  "cannon-fire": define("cannon-fire", "sfx", "Cannon burst.", false, 0.6),
  "drone-hit": define("drone-hit", "sfx", "Cannon burst connects.", false, 0.65),
  "drone-down": define("drone-down", "sfx", "Pursuit drone destroyed.", false, 0.75),
  "hull-alarm": define("hull-alarm", "ui", "Hull damage warning / hot pad bounce.", false, 0.7),
  "shot-down": define("shot-down", "ui", "Hull zero: the plane goes down.", false, 0.8),
  "crash-thud": define("crash-thud", "sfx", "Terrain or ocean impact.", false, 0.8),
  touchdown: define("touchdown", "sfx", "Clean pad landing.", false, 0.7),
  "patrol-clear": define("patrol-clear", "ui", "Patrol graded after a complete run.", false, 0.8)
};

export interface WingAudioProof {
  readonly enabled: boolean;
  readonly muted: boolean;
  readonly unlocked: boolean;
  readonly contextState: string;
  readonly lastCue: WingAudioCue | null;
  readonly playedCueCount: number;
  readonly cueCount: number;
  readonly typedAssetCount: number;
  readonly audioErrors: readonly string[];
}

export interface WingAudioController {
  readonly cue: (name: WingAudioCue) => Promise<void>;
  readonly unlock: () => Promise<void>;
  /** Map throttle (0..1) to the engine-bed bus volume. */
  readonly setEngineIntensity: (throttle: number, airborne: boolean) => void;
  readonly proof: () => WingAudioProof;
}

let cachedAudio: GameAudio<WingAudioCue> | null = null;

export function createWingAudio(): WingAudioController {
  const assetKeys = Object.values(wingAudioCueAssetKeys);
  if (!cachedAudio) {
    const cueEntries = Object.fromEntries(
      Object.values(wingAudioManifest).map((definition) => [
        definition.cue,
        {
          id: definition.cue,
          bus: definition.bus,
          volume: definition.volume,
          loop: definition.loop,
          asset: definition.asset
        }
      ])
    ) as unknown as Record<WingAudioCue, Parameters<typeof createGameAudio<WingAudioCue>>[0]["cues"][WingAudioCue]>;
    cachedAudio = createGameAudio({
      browserContext: true,
      buses: [
        { id: "engine", volume: 0.0 },
        { id: "ambient", volume: 0.35 },
        { id: "sfx", volume: 0.85 },
        { id: "ui", volume: 0.65 }
      ],
      cues: cueEntries
    });
  }
  const audio = cachedAudio;
  return {
    async cue(name) {
      await audio.cue(name);
    },
    async unlock() {
      await audio.unlock();
    },
    setEngineIntensity(throttle, airborne) {
      const level = airborne ? 0.15 + Math.min(1, Math.max(0, throttle)) * 0.85 : 0.0;
      audio.setBusVolume("engine", level);
    },
    proof() {
      const evidence = audio.evidence;
      return {
        enabled: evidence.enabled && !evidence.muted,
        muted: evidence.muted,
        unlocked: evidence.unlocked,
        contextState: evidence.contextState,
        lastCue: evidence.lastCue as WingAudioCue | null,
        playedCueCount: evidence.playedCueCount,
        cueCount: Object.keys(wingAudioManifest).length,
        typedAssetCount: assetKeys.length,
        audioErrors: evidence.errors.slice()
      };
    }
  };
}
