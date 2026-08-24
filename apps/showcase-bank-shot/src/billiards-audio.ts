/**
 * Bank Shot audio runtime - a thin public-API wrapper around createGameAudio,
 * following the committed manifest discipline of the sibling showcase routes.
 *
 * Every cue maps to a CLI-registered typed audio asset synthesized in-repo by
 * scripts/build-sfx.mjs (original CC0, author "Aura3D synthesis"). No raw URLs,
 * no invented asset ids; playback happens only after a user gesture unlocks the
 * AudioContext. Buses split gameplay sfx, event chimes, and the hall ambience.
 */
import { createGameAudio, type GameAudio } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

export type BilliardsAudioCue =
  | "cue-strike"
  | "cushion-hit"
  | "ball-hit"
  | "pocket-drop"
  | "rack-clear"
  | "foul-whistle"
  | "eight-win"
  | "rack-fail"
  | "combo-chime"
  | "ambient-hall";

export type BilliardsAudioAssetKey =
  | "bankShotCueStrikeSfx"
  | "bankShotCushionHitSfx"
  | "bankShotBallHitSfx"
  | "bankShotPocketDropSfx"
  | "bankShotRackClearSfx"
  | "bankShotFoulWhistleSfx"
  | "bankShotEightWinSfx"
  | "bankShotRackFailSfx"
  | "bankShotComboChimeSfx"
  | "bankShotAmbientHallSfx";

export const billiardsAudioCueAssetKeys: Record<BilliardsAudioCue, BilliardsAudioAssetKey> = {
  "cue-strike": "bankShotCueStrikeSfx",
  "cushion-hit": "bankShotCushionHitSfx",
  "ball-hit": "bankShotBallHitSfx",
  "pocket-drop": "bankShotPocketDropSfx",
  "rack-clear": "bankShotRackClearSfx",
  "foul-whistle": "bankShotFoulWhistleSfx",
  "eight-win": "bankShotEightWinSfx",
  "rack-fail": "bankShotRackFailSfx",
  "combo-chime": "bankShotComboChimeSfx",
  "ambient-hall": "bankShotAmbientHallSfx"
};

export type BilliardsAudioBus = "sfx" | "ui" | "ambient";

export interface BilliardsAudioCueDefinition {
  readonly cue: BilliardsAudioCue;
  readonly bus: BilliardsAudioBus;
  readonly intent: string;
  readonly loop: boolean;
  readonly assetKey: BilliardsAudioAssetKey;
  readonly asset: {
    readonly url: string;
    readonly hash: string;
    readonly format: "wav";
    readonly license: "CC0-1.0";
    readonly author: "Aura3D synthesis";
  };
  readonly volume: number;
}

export function billiardsAudioAssetReference(key: BilliardsAudioAssetKey) {
  const asset = assets[key];
  if (!asset.hash || !asset.url) {
    throw new Error("Bank Shot audio asset " + key + " is missing its generated content hash/url.");
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

function define(cue: BilliardsAudioCue, bus: BilliardsAudioBus, intent: string, loop: boolean, volume: number): BilliardsAudioCueDefinition {
  const assetKey = billiardsAudioCueAssetKeys[cue];
  return { cue, bus, intent, loop, assetKey, asset: billiardsAudioAssetReference(assetKey), volume };
}

export const billiardsAudioManifest: Record<BilliardsAudioCue, BilliardsAudioCueDefinition> = {
  "cue-strike": define("cue-strike", "sfx", "Cue tip strikes the cue ball.", false, 0.7),
  "cushion-hit": define("cushion-hit", "sfx", "A ball rebounds off a cushion.", false, 0.5),
  "ball-hit": define("ball-hit", "sfx", "Ball-on-ball contact clack.", false, 0.65),
  "pocket-drop": define("pocket-drop", "sfx", "A ball drops into a pocket.", false, 0.75),
  "rack-clear": define("rack-clear", "ui", "A rack is completed.", false, 0.8),
  "foul-whistle": define("foul-whistle", "ui", "Foul called; ball in hand.", false, 0.75),
  "eight-win": define("eight-win", "ui", "The 8-ball drops clean; rack won.", false, 0.85),
  "rack-fail": define("rack-fail", "ui", "Rack lost (fouls, early 8, or clock).", false, 0.8),
  "combo-chime": define("combo-chime", "ui", "Combo streak extended.", false, 0.6),
  "ambient-hall": define("ambient-hall", "ambient", "Closed billiards hall air (loop).", true, 0.3)
};

export interface BilliardsAudioProof {
  readonly enabled: boolean;
  readonly muted: boolean;
  readonly unlocked: boolean;
  readonly contextState: string;
  readonly lastCue: BilliardsAudioCue | null;
  readonly playedCueCount: number;
  readonly cueCount: number;
  readonly typedAssetCount: number;
  readonly audioErrors: readonly string[];
}

export interface BilliardsAudioController {
  readonly cue: (name: BilliardsAudioCue) => Promise<void>;
  readonly unlock: () => Promise<void>;
  readonly proof: () => BilliardsAudioProof;
}

let cachedAudio: GameAudio<BilliardsAudioCue> | null = null;

export function createBilliardsAudio(): BilliardsAudioController {
  const assetKeys = Object.values(billiardsAudioCueAssetKeys);
  if (!cachedAudio) {
    const cueEntries = Object.fromEntries(
      Object.values(billiardsAudioManifest).map((definition) => [
        definition.cue,
        {
          id: definition.cue,
          bus: definition.bus,
          volume: definition.volume,
          loop: definition.loop,
          asset: definition.asset
        }
      ])
    ) as unknown as Record<BilliardsAudioCue, Parameters<typeof createGameAudio<BilliardsAudioCue>>[0]["cues"][BilliardsAudioCue]>;
    cachedAudio = createGameAudio({
      browserContext: true,
      buses: [
        { id: "sfx", volume: 0.85 },
        { id: "ui", volume: 0.6 },
        { id: "ambient", volume: 0.5 }
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
    proof() {
      const evidence = audio.evidence;
      return {
        enabled: evidence.enabled && !evidence.muted,
        muted: evidence.muted,
        unlocked: evidence.unlocked,
        contextState: evidence.contextState,
        lastCue: evidence.lastCue as BilliardsAudioCue | null,
        playedCueCount: evidence.playedCueCount,
        cueCount: Object.keys(billiardsAudioManifest).length,
        typedAssetCount: assetKeys.length,
        audioErrors: evidence.errors.slice()
      };
    }
  };
}
