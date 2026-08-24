/**
 * Courier Rush audio runtime - a thin public-API wrapper around createGameAudio.
 *
 * Every cue maps to a CLI-registered typed audio asset (assets.courier*Sfx)
 * synthesized in-repo by scripts/build-sfx.mjs (original CC0, author "Aura3D
 * synthesis"). No raw URLs, no invented asset ids, and playback only ever
 * happens after a user gesture unlocks the AudioContext.
 */
import { createGameAudio, type GameAudio } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

/** Logical gameplay cue identifiers used by the route. */
export type CourierAudioCue =
  | "engine"
  | "ambient-city"
  | "dispatch"
  | "pickup"
  | "drop"
  | "early-bonus"
  | "strike"
  | "horn"
  | "shift-clear"
  | "shift-fail";

/** Typed audio asset keys registered through `aura3d assets add`. */
export type CourierAudioAssetKey =
  | "courierEngineSfx"
  | "courierAmbientCitySfx"
  | "courierDispatchBlipSfx"
  | "courierParcelPickupSfx"
  | "courierParcelDropSfx"
  | "courierEarlyBonusSfx"
  | "courierStrikeHitSfx"
  | "courierHornNearSfx"
  | "courierShiftClearSfx"
  | "courierShiftFailSfx";

export const courierAudioCueAssetKeys: Record<CourierAudioCue, CourierAudioAssetKey> = {
  engine: "courierEngineSfx",
  "ambient-city": "courierAmbientCitySfx",
  dispatch: "courierDispatchBlipSfx",
  pickup: "courierParcelPickupSfx",
  drop: "courierParcelDropSfx",
  "early-bonus": "courierEarlyBonusSfx",
  strike: "courierStrikeHitSfx",
  horn: "courierHornNearSfx",
  "shift-clear": "courierShiftClearSfx",
  "shift-fail": "courierShiftFailSfx"
};

export interface CourierAudioCueDefinition {
  readonly cue: CourierAudioCue;
  readonly bus: "engine" | "city" | "fx" | "ui";
  readonly intent: string;
  readonly loop: boolean;
  readonly assetKey: CourierAudioAssetKey;
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
export function courierAudioAssetReference(key: CourierAudioAssetKey) {
  const asset = assets[key];
  if (!asset || !asset.hash || !asset.url) {
    throw new Error("Courier audio asset " + key + " is missing its generated content hash/url.");
  }
  return {
    key,
    typedAssetMember: "assets." + key,
    url: asset.url,
    hash: asset.hash,
    format: "wav" as const,
    license: "CC0-1.0" as const,
    author: "Aura3D synthesis" as const
  };
}

function define(
  cue: CourierAudioCue,
  bus: CourierAudioCueDefinition["bus"],
  intent: string,
  loop: boolean,
  volume: number
): CourierAudioCueDefinition {
  const assetKey = courierAudioCueAssetKeys[cue];
  return {
    cue,
    bus,
    intent,
    loop,
    assetKey,
    asset: courierAudioAssetReference(assetKey),
    volume
  };
}

/** Committed cue -> bus/intent/asset/volume manifest (10 cues per the PRD). */
export const courierAudioManifest: Record<CourierAudioCue, CourierAudioCueDefinition> = {
  engine: define("engine", "engine", "Soft van idle loop while the shift runs.", true, 0.42),
  "ambient-city": define("ambient-city", "city", "Night city ambience bed.", true, 0.3),
  dispatch: define("dispatch", "ui", "Dispatch radio blip at each new delivery.", false, 0.6),
  pickup: define("pickup", "fx", "Parcel thumps into the van bed.", false, 0.7),
  drop: define("drop", "fx", "Delivery chime on a scored drop.", false, 0.72),
  "early-bonus": define("early-bonus", "fx", "Combo sparkle for an early delivery.", false, 0.55),
  strike: define("strike", "fx", "Panel crunch when the van hits traffic or props.", false, 0.75),
  horn: define("horn", "city", "Traffic honk at a courtesy stop near the van.", false, 0.5),
  "shift-clear": define("shift-clear", "ui", "End-of-shift clear sting.", false, 0.75),
  "shift-fail": define("shift-fail", "ui", "Radio power-down when the shift fails.", false, 0.7)
};

export const courierAudioAssets = Object.freeze(
  Object.fromEntries(
    Object.values(courierAudioCueAssetKeys).map((key) => [key, courierAudioAssetReference(key)])
  ) as Record<CourierAudioAssetKey, ReturnType<typeof courierAudioAssetReference>>
);

export interface CourierAudioProof {
  readonly enabled: boolean;
  readonly muted: boolean;
  readonly unlocked: boolean;
  readonly contextState: string;
  readonly sfxReady: boolean;
  readonly lastCue: CourierAudioCue | null;
  readonly recentCues: readonly CourierAudioCue[];
  readonly playedCueCount: number;
  readonly suppressedCueCount: number;
  readonly cueCount: number;
  readonly typedAssetCount: number;
  readonly assetUrls: readonly string[];
  readonly audioErrors: readonly string[];
  readonly gestureUnlocked: boolean;
}

export interface CourierAudioController {
  readonly cue: (name: CourierAudioCue) => Promise<void>;
  readonly unlock: () => Promise<void>;
  readonly proof: () => CourierAudioProof;
}

let cachedAudio: GameAudio<CourierAudioCue> | null = null;

export function createCourierAudio(reducedMotion = false): CourierAudioController {
  const recentCues: CourierAudioCue[] = [];
  let gestureUnlocked = false;
  const assetUrls = Object.values(courierAudioAssets).map((asset) => asset.url);

  if (!cachedAudio) {
    const cueEntries = Object.fromEntries(
      Object.values(courierAudioManifest).map((definition) => [
        definition.cue,
        {
          id: definition.cue,
          bus: definition.bus,
          volume: definition.volume,
          loop: definition.loop,
          asset: definition.asset
        }
      ])
    ) as unknown as Record<CourierAudioCue, Parameters<typeof createGameAudio<CourierAudioCue>>[0]["cues"][CourierAudioCue]>;

    cachedAudio = createGameAudio({
      browserContext: true,
      buses: [
        { id: "engine", volume: 0.55 },
        { id: "city", volume: 0.5 },
        { id: "fx", volume: 0.8 },
        { id: "ui", volume: 0.65 }
      ],
      cues: cueEntries
    });
  }
  const audio = cachedAudio;

  async function cue(name: CourierAudioCue): Promise<void> {
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
        && Object.keys(courierAudioManifest).length >= 10
        && assetUrls.length >= 10;
      return {
        enabled: evidence.enabled && !evidence.muted,
        muted: evidence.muted,
        unlocked: evidence.unlocked,
        contextState: evidence.contextState,
        sfxReady: reducedMotion ? false : ready,
        lastCue: evidence.lastCue as CourierAudioCue | null,
        recentCues: recentCues.slice(),
        playedCueCount: evidence.playedCueCount,
        suppressedCueCount: evidence.suppressedCueCount,
        cueCount: Object.keys(courierAudioManifest).length,
        typedAssetCount: assetUrls.length,
        assetUrls: assetUrls.slice(),
        audioErrors: evidence.errors.slice(),
        gestureUnlocked
      };
    }
  };
}
