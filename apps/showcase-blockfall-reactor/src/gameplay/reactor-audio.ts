/**
 * Blockfall Reactor audio runtime — a thin public-API wrapper around `createGameAudio`.
 *
 * Cues are defined in `blockfall-audio-manifest.ts` and played here through the typed
 * asset URLs, exactly like the Skyline/Clash discipline: no raw URLs, no invented asset
 * ids, gesture-unlocked AudioContext, and honest evidence.
 *
 * BF-A1 specifics:
 * - the ambient reactor hum starts once (first gesture) on its own bus and loops,
 * - all four music intensity stems also start as loops; layering is bus-volume
 *   automation from `blockfallStemVolumesForLevel(level)`, so a rising level adds an
 *   additive stem every five levels without any start/stop churn, and a reset simply
 *   returns the gains to the level-1 mix.
 */
import { createGameAudio, type GameAudio } from "@aura3d/engine";
import {
  blockfallAudioAssets,
  blockfallAudioManifest,
  blockfallStemVolumesForLevel,
  BLOCKFALL_GAMEPLAY_CUES,
  type BlockfallAudioBus,
  type BlockfallAudioCue
} from "./blockfall-audio-manifest";

export interface BlockfallAudioProof {
  readonly enabled: boolean;
  readonly muted: boolean;
  readonly unlocked: boolean;
  readonly contextState: string;
  readonly sfxReady: boolean;
  readonly lastCue: BlockfallAudioCue | null;
  readonly recentCues: readonly BlockfallAudioCue[];
  readonly cueCounts: Readonly<Record<string, number>>;
  readonly playedCueCount: number;
  readonly suppressedCueCount: number;
  readonly gameplayCueCount: number;
  readonly cueCount: number;
  readonly typedAssetCount: number;
  readonly assetUrls: readonly string[];
  /** Bus ids currently at nonzero gain — the live intensity-layer set. */
  readonly audibleBuses: readonly string[];
  readonly busVolumes: Readonly<Record<string, number>>;
  readonly musicLevel: number;
  readonly errors: readonly string[];
}

export interface BlockfallAudioController {
  readonly cue: (name: BlockfallAudioCue) => Promise<void>;
  readonly unlock: () => Promise<void>;
  /** Applies the additive stem mix for this level (no-op before first unlock). */
  readonly applyMusicLevel: (level: number) => void;
  readonly toggleMute: () => boolean;
  readonly proof: () => BlockfallAudioProof;
  readonly dispose: () => Promise<void>;
}

const ALL_BUSES: readonly BlockfallAudioBus[] = ["sfx", "ambient", "music-stem-1", "music-stem-2", "music-stem-3", "music-stem-4"];

export function createBlockfallReactorAudio(reducedMotion = false): BlockfallAudioController {
  const recentCues: BlockfallAudioCue[] = [];
  const cueCounts: Record<string, number> = {};
  const assetUrls = Object.values(blockfallAudioAssets).map((asset) => asset.url);
  let musicLevel = 1;
  let startedLoops = false;
  let muted = false;

  // The manifest uses literal bus strings that are valid GameAudioBusIds; cast through
  // unknown so the Record keyed by every cue stays the authoritative signature.
  const cueEntries = Object.fromEntries(
    Object.values(blockfallAudioManifest).map((definition) => [
      definition.cue,
      {
        id: definition.cue,
        bus: definition.bus,
        volume: definition.volume,
        loop: definition.loop ?? false,
        asset: definition.asset
      }
    ])
  ) as unknown as Record<BlockfallAudioCue, Parameters<typeof createGameAudio<BlockfallAudioCue>>[0]["cues"][BlockfallAudioCue]>;

  const audio: GameAudio<BlockfallAudioCue> = createGameAudio({
    browserContext: true,
    buses: [
      { id: "sfx", volume: 0.5 },
      { id: "ambient", volume: reducedMotion ? 0.08 : 0.18 },
      { id: "music-stem-1", volume: 0.22 },
      { id: "music-stem-2", volume: 0 },
      { id: "music-stem-3", volume: 0 },
      { id: "music-stem-4", volume: 0 }
    ],
    cues: cueEntries
  });

  async function startLoopsOnce(): Promise<void> {
    if (startedLoops) return;
    startedLoops = true;
    // Loops are persistent: layering happens through per-stem bus volumes.
    await audio.cue("ambient-hum");
    await audio.cue("music-stem-1");
    await audio.cue("music-stem-2");
    await audio.cue("music-stem-3");
    await audio.cue("music-stem-4");
  }

  function applyLevelMix(level: number): void {
    musicLevel = Math.max(1, Math.floor(level));
    const volumes = blockfallStemVolumesForLevel(musicLevel);
    for (const bus of ALL_BUSES) {
      audio.setBusVolume(bus, volumes[bus]);
    }
  }

  async function cue(name: BlockfallAudioCue): Promise<void> {
    recentCues.push(name);
    if (recentCues.length > 32) recentCues.shift();
    cueCounts[name] = (cueCounts[name] ?? 0) + 1;
    try {
      await audio.cue(name);
    } catch {
      // Audio is enhancement, never a gameplay blocker: unlock/decode failures are
      // already recorded in the engine evidence errors list.
    }
  }

  return {
    async cue(name) {
      await cue(name);
    },
    async unlock() {
      await audio.unlock();
      await startLoopsOnce();
      applyLevelMix(musicLevel);
    },
    applyMusicLevel(level) {
      applyLevelMix(level);
    },
    toggleMute() {
      muted = !muted;
      audio.setMuted(muted);
      return muted;
    },
    proof() {
      const evidence = audio.evidence;
      const busVolumes: Record<string, number> = {};
      for (const bus of evidence.buses) busVolumes[bus.id] = bus.volume;
      return {
        enabled: evidence.enabled && !evidence.muted,
        muted: evidence.muted,
        unlocked: evidence.unlocked,
        contextState: evidence.contextState,
        sfxReady:
          evidence.enabled &&
          BLOCKFALL_GAMEPLAY_CUES.length === 9 &&
          Object.keys(blockfallAudioManifest).length >= 13 &&
          assetUrls.length >= 13,
        lastCue: evidence.lastCue,
        recentCues: recentCues.slice(),
        cueCounts: { ...cueCounts },
        playedCueCount: evidence.playedCueCount,
        suppressedCueCount: evidence.suppressedCueCount,
        gameplayCueCount: BLOCKFALL_GAMEPLAY_CUES.length,
        cueCount: Object.keys(blockfallAudioManifest).length,
        typedAssetCount: assetUrls.length,
        assetUrls: assetUrls.slice(),
        audibleBuses: ALL_BUSES.filter((bus) => (busVolumes[bus] ?? 0) > 0),
        busVolumes,
        musicLevel,
        errors: evidence.errors.slice()
      };
    },
    async dispose() {
      await audio.dispose();
    }
  };
}