/**
 * Gallery Shift audio runtime - a thin public-API wrapper around createGameAudio,
 * following the committed manifest discipline of the sibling showcase routes.
 *
 * Every cue maps to a CLI-registered typed audio asset synthesized in-repo by
 * scripts/build-sfx.mjs (original CC0, author "Aura3D synthesis"). No raw URLs,
 * no invented asset ids; playback happens only after a user gesture unlocks the
 * AudioContext. Buses split gameplay sfx and UI/event stingers; ambientHall is
 * the looping room tone.
 */
import { createGameAudio, type GameAudio } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

export type HeistAudioCue =
  | "sneak-step"
  | "walk-step"
  | "guard-alert"
  | "alert-rise"
  | "exhibit-lift"
  | "laser-trip"
  | "camera-whir"
  | "caught-sting"
  | "floor-clear"
  | "ambient-hall"
  | "exit-win";

export type HeistAudioAssetKey =
  | "galleryShiftSneakStepSfx"
  | "galleryShiftWalkStepSfx"
  | "galleryShiftGuardAlertSfx"
  | "galleryShiftAlertRiseSfx"
  | "galleryShiftExhibitLiftSfx"
  | "galleryShiftLaserTripSfx"
  | "galleryShiftCameraWhirSfx"
  | "galleryShiftCaughtStingSfx"
  | "galleryShiftFloorClearSfx"
  | "galleryShiftAmbientHallSfx"
  | "galleryShiftExitWinSfx";

export const heistAudioCueAssetKeys: Record<HeistAudioCue, HeistAudioAssetKey> = {
  "sneak-step": "galleryShiftSneakStepSfx",
  "walk-step": "galleryShiftWalkStepSfx",
  "guard-alert": "galleryShiftGuardAlertSfx",
  "alert-rise": "galleryShiftAlertRiseSfx",
  "exhibit-lift": "galleryShiftExhibitLiftSfx",
  "laser-trip": "galleryShiftLaserTripSfx",
  "camera-whir": "galleryShiftCameraWhirSfx",
  "caught-sting": "galleryShiftCaughtStingSfx",
  "floor-clear": "galleryShiftFloorClearSfx",
  "ambient-hall": "galleryShiftAmbientHallSfx",
  "exit-win": "galleryShiftExitWinSfx"
};

export type HeistAudioBus = "sfx" | "ui";

export interface HeistAudioCueDefinition {
  readonly cue: HeistAudioCue;
  readonly bus: HeistAudioBus;
  readonly intent: string;
  readonly loop: boolean;
  readonly assetKey: HeistAudioAssetKey;
  readonly asset: {
    readonly url: string;
    readonly hash: string;
    readonly format: "wav";
    readonly license: "CC0-1.0";
    readonly author: "Aura3D synthesis";
  };
  readonly volume: number;
}

export function heistAudioAssetReference(key: HeistAudioAssetKey) {
  const asset = assets[key];
  if (!asset.hash || !asset.url) {
    throw new Error(`Gallery Shift audio asset ${key} is missing its generated content hash/url.`);
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

function define(cue: HeistAudioCue, bus: HeistAudioBus, intent: string, loop: boolean, volume: number): HeistAudioCueDefinition {
  const assetKey = heistAudioCueAssetKeys[cue];
  return { cue, bus, intent, loop, assetKey, asset: heistAudioAssetReference(assetKey), volume };
}

export const heistAudioManifest: Record<HeistAudioCue, HeistAudioCueDefinition> = {
  "sneak-step": define("sneak-step", "sfx", "Soft thief footfall while sneaking (near-silent gait).", false, 0.35),
  "walk-step": define("walk-step", "sfx", "Thief walk footfall; also guards' authored-gait footsteps at distance attenuation.", false, 0.5),
  "guard-alert": define("guard-alert", "ui", "A guard crosses into the alert state.", false, 0.75),
  "alert-rise": define("alert-rise", "ui", "Detection meter climbing through suspicious territory.", false, 0.55),
  "exhibit-lift": define("exhibit-lift", "sfx", "Exhibit lifted off its pedestal.", false, 0.8),
  "laser-trip": define("laser-trip", "ui", "Laser sensor tripped: floor-wide alert burst.", false, 0.85),
  "camera-whir": define("camera-whir", "sfx", "Sweeping security camera passing nearby.", false, 0.4),
  "caught-sting": define("caught-sting", "ui", "Caught: detection meter full.", false, 0.9),
  "floor-clear": define("floor-clear", "ui", "Floor cleared at the service exit.", false, 0.85),
  "ambient-hall": define("ambient-hall", "sfx", "Looping low-lit gallery room tone.", true, 0.3),
  "exit-win": define("exit-win", "ui", "Both floors cleared: heist complete.", false, 0.9)
};

export interface HeistAudioProof {
  readonly enabled: boolean;
  readonly muted: boolean;
  readonly unlocked: boolean;
  readonly contextState: string;
  readonly lastCue: HeistAudioCue | null;
  readonly playedCueCount: number;
  readonly cueCount: number;
  readonly typedAssetCount: number;
  readonly audioErrors: readonly string[];
}

export interface HeistAudioController {
  readonly cue: (name: HeistAudioCue) => Promise<void>;
  readonly unlock: () => Promise<void>;
  readonly startAmbient: () => Promise<void>;
  readonly proof: () => HeistAudioProof;
}

let cachedAudio: GameAudio<HeistAudioCue> | null = null;

export function createHeistAudio(): HeistAudioController {
  const assetKeys = Object.values(heistAudioCueAssetKeys);
  if (!cachedAudio) {
    const cueEntries = Object.fromEntries(
      Object.values(heistAudioManifest).map((definition) => [
        definition.cue,
        {
          id: definition.cue,
          bus: definition.bus,
          volume: definition.volume,
          loop: definition.loop,
          asset: definition.asset
        }
      ])
    ) as unknown as Record<HeistAudioCue, Parameters<typeof createGameAudio<HeistAudioCue>>[0]["cues"][HeistAudioCue]>;
    cachedAudio = createGameAudio({
      browserContext: true,
      buses: [
        { id: "sfx", volume: 0.85 },
        { id: "ui", volume: 0.65 }
      ],
      cues: cueEntries
    });
  }
  const audio = cachedAudio;
  let ambientStarted = false;
  return {
    async cue(name) {
      await audio.cue(name);
    },
    async unlock() {
      await audio.unlock();
    },
    async startAmbient() {
      if (ambientStarted) return;
      ambientStarted = true;
      await audio.cue("ambient-hall");
    },
    proof() {
      const evidence = audio.evidence;
      return {
        enabled: evidence.enabled && !evidence.muted,
        muted: evidence.muted,
        unlocked: evidence.unlocked,
        contextState: evidence.contextState,
        lastCue: evidence.lastCue as HeistAudioCue | null,
        playedCueCount: evidence.playedCueCount,
        cueCount: Object.keys(heistAudioManifest).length,
        typedAssetCount: assetKeys.length,
        audioErrors: evidence.errors.slice()
      };
    }
  };
}
