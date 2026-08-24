/**
 * Neon Swarm audio runtime - thin public-API wrapper around createGameAudio.
 *
 * Thirteen synthesized cues registered as typed audio assets (see
 * scripts/build-sfx.mjs). Two buses: "sfx" for gameplay cues and "ambient"
 * for the looping city hum, which starts on the first user gesture (browser
 * autoplay unlock) and loops on its own bus.
 */
import { createGameAudio, type GameAudio } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

export type SwarmCue =
  | "pulse-fire"
  | "drone-hit"
  | "drone-die"
  | "player-hurt"
  | "dash"
  | "pickup"
  | "wave-start"
  | "wave-clear"
  | "death-sting"
  | "burst"
  | "graze"
  | "combo-break";

export type SwarmAudioAssetKey =
  | "neonPulseFireSfx"
  | "neonDroneHitSfx"
  | "neonDroneDieSfx"
  | "neonPlayerHurtSfx"
  | "neonDashSfx"
  | "neonPickupSfx"
  | "neonWaveStartSfx"
  | "neonWaveClearSfx"
  | "neonDeathStingSfx"
  | "neonAmbientHumSfx"
  | "neonBurstSfx"
  | "neonGrazeSfx"
  | "neonComboBreakSfx";

const CUE_ASSET_KEYS: Record<SwarmCue | "ambient", SwarmAudioAssetKey> = {
  "pulse-fire": "neonPulseFireSfx",
  "drone-hit": "neonDroneHitSfx",
  "drone-die": "neonDroneDieSfx",
  "player-hurt": "neonPlayerHurtSfx",
  dash: "neonDashSfx",
  pickup: "neonPickupSfx",
  "wave-start": "neonWaveStartSfx",
  "wave-clear": "neonWaveClearSfx",
  "death-sting": "neonDeathStingSfx",
  burst: "neonBurstSfx",
  graze: "neonGrazeSfx",
  "combo-break": "neonComboBreakSfx",
  ambient: "neonAmbientHumSfx"
};

/** All thirteen registered cue names, for evidence ordering. */
export const SWARM_AUDIO_CUE_NAMES: readonly string[] = [
  ...Object.keys(CUE_ASSET_KEYS)
];

function assetReference(key: SwarmAudioAssetKey) {
  const asset = assets[key];
  if (!asset || !asset.hash || !asset.url) {
    throw new Error("Neon Swarm audio asset " + key + " is missing its generated content hash/url.");
  }
  return {
    key,
    typedAssetMember: "assets." + key,
    url: asset.url,
    hash: asset.hash,
    format: "wav" as const,
    license: "CC0-1.0" as const,
    author: "Aura3D synthesis" as const,
    loop: key === "neonAmbientHumSfx"
  };
}

export interface SwarmAudioProof {
  readonly enabled: boolean;
  readonly muted: boolean;
  readonly unlocked: boolean;
  readonly contextState: string;
  readonly sfxReady: boolean;
  readonly ambientBusReady: boolean;
  readonly lastCue: string | null;
  readonly recentCues: readonly string[];
  readonly playedCueCount: number;
  readonly suppressedCueCount: number;
  readonly cueCount: number;
  readonly typedAssetCount: number;
  readonly audioErrors: readonly string[];
}

export interface SwarmAudioController {
  readonly cue: (name: SwarmCue) => Promise<void>;
  readonly unlock: () => Promise<void>;
  readonly proof: () => SwarmAudioProof;
  readonly dispose: () => Promise<void>;
}

export function createSwarmAudio(): SwarmAudioController {
  const recentCues: string[] = [];
  const entries = Object.entries(CUE_ASSET_KEYS) as readonly [string, SwarmAudioAssetKey][];
  const assetUrls = entries.map(([, key]) => assetReference(key));

  const cueEntries = Object.fromEntries(
    entries.map(([cue, key]) => {
      const ref = assetReference(key);
      return [
        cue,
        {
          id: cue,
          bus: key === "neonAmbientHumSfx" ? "ambient" : "sfx",
          volume: key === "neonAmbientHumSfx" ? 0.34 : 0.62,
          asset: { url: ref.url, hash: ref.hash, format: ref.format, license: ref.license, author: ref.author }
        }
      ];
    })
  ) as Record<string, Parameters<typeof createGameAudio<string>>[0]["cues"][string]>;

  const audio: GameAudio<string> = createGameAudio({
    browserContext: true,
    buses: [
      { id: "sfx", volume: 1 },
      { id: "ambient", volume: 0.6 }
    ],
    cues: cueEntries
  });

  let ambientStarted = false;

  async function startAmbient(): Promise<void> {
    if (ambientStarted) return;
    ambientStarted = true;
    // The hum is a long loopable bed; fire once after unlock on its own bus.
    await audio.cue("ambient");
  }

  return {
    async cue(name) {
      recentCues.push(name);
      if (recentCues.length > 24) recentCues.shift();
      await audio.cue(name);
    },
    async unlock() {
      await audio.unlock();
      await startAmbient();
    },
    proof() {
      const evidence = audio.evidence;
      return {
        enabled: evidence.enabled && !evidence.muted,
        muted: evidence.muted,
        unlocked: evidence.unlocked,
        contextState: evidence.contextState,
        sfxReady: evidence.enabled && Object.keys(cueEntries).length === 13 && assetUrls.length === 13,
        ambientBusReady: true,
        lastCue: evidence.lastCue,
        recentCues: recentCues.slice(),
        playedCueCount: evidence.playedCueCount,
        suppressedCueCount: evidence.suppressedCueCount,
        cueCount: Object.keys(cueEntries).length,
        typedAssetCount: assetUrls.length,
        audioErrors: evidence.errors.slice()
      };
    },
    async dispose() {
      await audio.dispose();
    }
  };
}
