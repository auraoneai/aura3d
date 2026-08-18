/**
 * Skyline Runner audio runtime — a thin public-API wrapper around `createGameAudio`.
 *
 * Cues are defined in `skyline-audio-manifest.ts` and played here through the typed
 * asset URLs, exactly like the Clash manifest discipline: no raw URLs, no invented
 * asset ids, gesture-unlocked AudioContext, and honest evidence.
 */
import { createGameAudio, type GameAudio } from "@aura3d/engine";
import { skylineAudioAssets, skylineAudioManifest, type SkylineAudioCue } from "./skyline-audio-manifest";

export interface SkylineAudioProof {
  readonly enabled: boolean;
  readonly muted: boolean;
  readonly unlocked: boolean;
  readonly contextState: string;
  readonly sfxReady: boolean;
  readonly lastCue: SkylineAudioCue | null;
  readonly recentCues: readonly SkylineAudioCue[];
  readonly playedCueCount: number;
  readonly suppressedCueCount: number;
  readonly cueCount: number;
  readonly typedAssetCount: number;
  readonly assetUrls: readonly string[];
  readonly audioErrors: readonly string[];
}

export interface SkylineAudioController {
  readonly cue: (name: SkylineAudioCue) => Promise<void>;
  readonly unlock: () => Promise<void>;
  readonly proof: () => SkylineAudioProof;
  readonly dispose: () => Promise<void>;
}

export function createSkylineAudio(reducedMotion = false): SkylineAudioController {
  const recentCues: SkylineAudioCue[] = [];
  const assetUrls = Object.values(skylineAudioAssets).map((asset) => asset.url);
  // The manifest uses a literal bus string that is a valid GameAudioBusId; cast through unknown
  // so the Record keyed by every cue stays the authoritative signature.
  const cueEntries = Object.fromEntries(
    Object.values(skylineAudioManifest).map((definition) => [
      definition.cue,
      { id: definition.cue, bus: definition.bus, volume: definition.volume, asset: definition.asset }
    ])
  ) as unknown as Record<SkylineAudioCue, Parameters<typeof createGameAudio<SkylineAudioCue>>[0]["cues"][SkylineAudioCue]>;

  const audio: GameAudio<SkylineAudioCue> = createGameAudio({
    browserContext: true,
    buses: [
      { id: "player", volume: 0.8 },
      { id: "combat", volume: 1 },
      { id: "story", volume: 0.85 },
      { id: "ui", volume: 0.6 }
    ],
    cues: cueEntries
  });

  async function cue(name: SkylineAudioCue): Promise<void> {
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
    },
    proof() {
      const evidence = audio.evidence;
      return {
        enabled: evidence.enabled && !evidence.muted,
        muted: evidence.muted,
        unlocked: evidence.unlocked,
        contextState: evidence.contextState,
        sfxReady: evidence.enabled && Object.keys(skylineAudioManifest).length >= 10 && assetUrls.length >= 10,
        lastCue: evidence.lastCue,
        recentCues: recentCues.slice(),
        playedCueCount: evidence.playedCueCount,
        suppressedCueCount: evidence.suppressedCueCount,
        cueCount: Object.keys(skylineAudioManifest).length,
        typedAssetCount: assetUrls.length,
        assetUrls: assetUrls.slice(),
        audioErrors: evidence.errors.slice()
      };
    },
    async dispose() {
      await audio.dispose();
    }
  };
}
