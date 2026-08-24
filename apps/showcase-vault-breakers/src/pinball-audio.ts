/**
 * Vault Breakers audio runtime - a thin public-API wrapper around createGameAudio,
 * following the committed manifest discipline of the sibling showcase routes.
 *
 * Every cue maps to a CLI-registered typed audio asset synthesized in-repo by
 * scripts/build-sfx.mjs (original CC0, author "Aura3D synthesis"). No raw URLs,
 * no invented asset ids; playback happens only after a user gesture unlocks the
 * AudioContext. Buses split gameplay sfx and UI/event chimes.
 */
import { createGameAudio, type GameAudio } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

export type VaultAudioCue =
  | "flipper-snap"
  | "bumper-hit"
  | "sling-pop"
  | "ramp-roll"
  | "target-down"
  | "bank-clear"
  | "vault-open"
  | "multiball"
  | "ball-drain"
  | "tilt-warn"
  | "plunger-release";

export type VaultAudioAssetKey =
  | "vaultFlipperSnapSfx"
  | "vaultBumperHitSfx"
  | "vaultSlingPopSfx"
  | "vaultRampRollSfx"
  | "vaultTargetDownSfx"
  | "vaultBankClearSfx"
  | "vaultVaultOpenSfx"
  | "vaultMultiballSfx"
  | "vaultBallDrainSfx"
  | "vaultTiltWarnSfx"
  | "vaultPlungerReleaseSfx";

export const vaultAudioCueAssetKeys: Record<VaultAudioCue, VaultAudioAssetKey> = {
  "flipper-snap": "vaultFlipperSnapSfx",
  "bumper-hit": "vaultBumperHitSfx",
  "sling-pop": "vaultSlingPopSfx",
  "ramp-roll": "vaultRampRollSfx",
  "target-down": "vaultTargetDownSfx",
  "bank-clear": "vaultBankClearSfx",
  "vault-open": "vaultVaultOpenSfx",
  multiball: "vaultMultiballSfx",
  "ball-drain": "vaultBallDrainSfx",
  "tilt-warn": "vaultTiltWarnSfx",
  "plunger-release": "vaultPlungerReleaseSfx"
};

export type VaultAudioBus = "sfx" | "ui";

export interface VaultAudioCueDefinition {
  readonly cue: VaultAudioCue;
  readonly bus: VaultAudioBus;
  readonly intent: string;
  readonly loop: boolean;
  readonly assetKey: VaultAudioAssetKey;
  readonly asset: {
    readonly url: string;
    readonly hash: string;
    readonly format: "wav";
    readonly license: "CC0-1.0";
    readonly author: "Aura3D synthesis";
  };
  readonly volume: number;
}

export function vaultAudioAssetReference(key: VaultAudioAssetKey) {
  const asset = assets[key];
  if (!asset.hash || !asset.url) {
    throw new Error(`Vault Breakers audio asset ${key} is missing its generated content hash/url.`);
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

function define(cue: VaultAudioCue, bus: VaultAudioBus, intent: string, loop: boolean, volume: number): VaultAudioCueDefinition {
  const assetKey = vaultAudioCueAssetKeys[cue];
  return { cue, bus, intent, loop, assetKey, asset: vaultAudioAssetReference(assetKey), volume };
}

export const vaultAudioManifest: Record<VaultAudioCue, VaultAudioCueDefinition> = {
  "flipper-snap": define("flipper-snap", "sfx", "Flipper fires.", false, 0.6),
  "bumper-hit": define("bumper-hit", "sfx", "Pop bumper contact with kick.", false, 0.65),
  "sling-pop": define("sling-pop", "sfx", "Slingshot recoil.", false, 0.55),
  "ramp-roll": define("ramp-roll", "sfx", "Orbit lane pass.", false, 0.5),
  "target-down": define("target-down", "sfx", "Standup target banked.", false, 0.7),
  "bank-clear": define("bank-clear", "ui", "A three-target bank completes.", false, 0.75),
  "vault-open": define("vault-open", "ui", "All five banks clear; the vault unlocks.", false, 0.8),
  multiball: define("multiball", "ui", "Vault releases two extra balls.", false, 0.8),
  "ball-drain": define("ball-drain", "sfx", "A ball drains.", false, 0.7),
  "tilt-warn": define("tilt-warn", "ui", "Nudge strike warning and tilt lock.", false, 0.7),
  "plunger-release": define("plunger-release", "sfx", "Ball served from the plunger lane.", false, 0.7)
};

export interface VaultAudioProof {
  readonly enabled: boolean;
  readonly muted: boolean;
  readonly unlocked: boolean;
  readonly contextState: string;
  readonly lastCue: VaultAudioCue | null;
  readonly playedCueCount: number;
  readonly cueCount: number;
  readonly typedAssetCount: number;
  readonly audioErrors: readonly string[];
}

export interface VaultAudioController {
  readonly cue: (name: VaultAudioCue) => Promise<void>;
  readonly unlock: () => Promise<void>;
  readonly proof: () => VaultAudioProof;
}

let cachedAudio: GameAudio<VaultAudioCue> | null = null;

export function createVaultAudio(): VaultAudioController {
  const assetKeys = Object.values(vaultAudioCueAssetKeys);
  if (!cachedAudio) {
    const cueEntries = Object.fromEntries(
      Object.values(vaultAudioManifest).map((definition) => [
        definition.cue,
        {
          id: definition.cue,
          bus: definition.bus,
          volume: definition.volume,
          loop: definition.loop,
          asset: definition.asset
        }
      ])
    ) as unknown as Record<VaultAudioCue, Parameters<typeof createGameAudio<VaultAudioCue>>[0]["cues"][VaultAudioCue]>;
    cachedAudio = createGameAudio({
      browserContext: true,
      buses: [
        { id: "sfx", volume: 0.85 },
        { id: "ui", volume: 0.6 }
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
        lastCue: evidence.lastCue as VaultAudioCue | null,
        playedCueCount: evidence.playedCueCount,
        cueCount: Object.keys(vaultAudioManifest).length,
        typedAssetCount: assetKeys.length,
        audioErrors: evidence.errors.slice()
      };
    }
  };
}
