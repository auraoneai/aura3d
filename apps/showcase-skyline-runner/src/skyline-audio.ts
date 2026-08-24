/**
 * Skyline Runner audio runtime — a thin public-API wrapper around `createGameAudio`.
 *
 * Cues are defined in `skyline-audio-manifest.ts` and played here through the typed
 * asset URLs, exactly like the Clash manifest discipline: no raw URLs, no invented
 * asset ids, gesture-unlocked AudioContext, and honest evidence.
 */
import { createGameAudio, type GameAudio } from "@aura3d/engine";
import {
  SKYLINE_AMBIENCE_BUS_LEVEL,
  SKYLINE_AMBIENCE_DUCK_LEVEL,
  SKYLINE_AMBIENCE_DUCK_SECONDS,
  skylineAmbienceBusForAct,
  skylineAudioAssets,
  skylineAudioManifest,
  type SkylineAmbienceBusId,
  type SkylineAudioCue
} from "./skyline-audio-manifest";

export interface SkylineAudioProof {
  readonly cueCount: number;
  readonly enabled: boolean;
  readonly playedCueCount: number;
  readonly muted: boolean;
  readonly suppressedCueCount: number;
  readonly unlocked: boolean;
  readonly typedAssetCount: number;
  readonly contextState: string;
  readonly assetUrls: readonly string[];
  readonly sfxReady: boolean;
  readonly audioErrors: readonly string[];
  readonly lastCue: SkylineAudioCue | null;
  readonly recentCues: readonly SkylineAudioCue[];
  /** Cumulative mounted-session requests, retained even when recentCues rolls over. */
  readonly cueAttempts: Readonly<Partial<Record<SkylineAudioCue, number>>>;
  /** SR-A6 ambience state: stems, active stem, and summit-duck status. */
  readonly ambience: {
    readonly started: boolean;
    readonly stems: readonly { readonly cue: SkylineAudioCue; readonly bus: SkylineAmbienceBusId; readonly looping: boolean }[];
    readonly activeStemBus: SkylineAmbienceBusId | null;
    readonly activeActIndex: number | null;
    readonly ducked: boolean;
  };
}

export interface SkylineAudioController {
  readonly cue: (name: SkylineAudioCue) => Promise<void>;
  readonly unlock: () => Promise<void>;
  /** Switches the audible ambience stem for the given act (SR-A6). */
  readonly setAmbienceAct: (actIndex: number) => void;
  readonly proof: () => SkylineAudioProof;
  readonly dispose: () => Promise<void>;
}

export function createSkylineAudio(reducedMotion = false): SkylineAudioController {
  const recentCues: SkylineAudioCue[] = [];
  const cueAttempts: Partial<Record<SkylineAudioCue, number>> = {};
  const assetUrls = Object.values(skylineAudioAssets).map((asset) => asset.url);
  // The manifest uses a literal bus string that is a valid GameAudioBusId; cast through unknown
  // so the Record keyed by every cue stays the authoritative signature.
  const cueEntries = Object.fromEntries(
    Object.values(skylineAudioManifest).map((definition) => [
      definition.cue,
      {
        id: definition.cue,
        bus: definition.bus,
        volume: definition.volume,
        asset: definition.asset,
        // SR-A6: ambience stems are looping sources; gameplay cues stay one-shot.
        ...(definition.loop ? { loop: true } : {})
      }
    ])
  ) as unknown as Record<SkylineAudioCue, Parameters<typeof createGameAudio<SkylineAudioCue>>[0]["cues"][SkylineAudioCue]>;

  /** The three ambience stems, each on its OWN bus so acts switch by volume. */
  const ambienceStems: readonly { readonly cue: SkylineAudioCue; readonly bus: SkylineAmbienceBusId }[] = [
    { cue: "ambience-grove", bus: "ambience-grove" },
    { cue: "ambience-steel", bus: "ambience-steel" },
    { cue: "ambience-crown", bus: "ambience-crown" }
  ];

  let ambienceStarted = false;
  let activeActIndex: number | null = null;
  let activeStemBus: SkylineAmbienceBusId | null = null;
  let ducked = false;
  let duckTimer: ReturnType<typeof setTimeout> | null = null;

  const audio: GameAudio<SkylineAudioCue> = createGameAudio({
    browserContext: true,
    buses: [
      { id: "player", volume: 0.8 },
      { id: "combat", volume: 1 },
      { id: "story", volume: 0.85 },
      { id: "ui", volume: 0.6 },
      // Ambience buses start silent; setAmbienceAct raises exactly one.
      { id: "ambience-grove", volume: 0 },
      { id: "ambience-steel", volume: 0 },
      { id: "ambience-crown", volume: 0 }
    ],
    cues: cueEntries
  });

  /** Starts all three looping stems once. Audibility is owned by bus volumes. */
  function ensureAmbienceStarted(): void {
    if (ambienceStarted) return;
    ambienceStarted = true;
    for (const stem of ambienceStems) {
      // Fire-and-forget: a suppressed cue (headless, muted) is recorded honestly
      // by the kit evidence and must not break gameplay.
      void audio.cue(stem.cue).catch(() => { /* ambience is optional */ });
    }
    if (activeStemBus) audio.setBusVolume(activeStemBus, SKYLINE_AMBIENCE_BUS_LEVEL);
  }

  function applyDuckRestore(): void {
    if (!activeStemBus) return;
    ducked = false;
    audio.setBusVolume(activeStemBus, SKYLINE_AMBIENCE_BUS_LEVEL);
  }

  async function cue(name: SkylineAudioCue): Promise<void> {
    recentCues.push(name);
    cueAttempts[name] = (cueAttempts[name] ?? 0) + 1;
    if (recentCues.length > 24) recentCues.shift();
    ensureAmbienceStarted();
    await audio.cue(name);
    // Summit theme ducks whichever act stem is currently audible (SR-A6).
    if (name === "summit") {
      if (duckTimer) clearTimeout(duckTimer);
      if (activeStemBus) {
        ducked = true;
        audio.setBusVolume(activeStemBus, SKYLINE_AMBIENCE_DUCK_LEVEL);
        duckTimer = setTimeout(applyDuckRestore, SKYLINE_AMBIENCE_DUCK_SECONDS * 1000);
      }
    }
  }

  return {
    async cue(name) {
      await cue(name);
    },
    async unlock() {
      await audio.unlock();
      ensureAmbienceStarted();
    },
    setAmbienceAct(actIndex) {
      const stem = skylineAmbienceBusForAct(actIndex);
      activeActIndex = actIndex;
      if (stem === activeStemBus) return;
      const previous = activeStemBus;
      activeStemBus = stem;
      if (previous) audio.setBusVolume(previous, 0);
      audio.setBusVolume(stem, ducked ? SKYLINE_AMBIENCE_DUCK_LEVEL : SKYLINE_AMBIENCE_BUS_LEVEL);
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
        cueAttempts: { ...cueAttempts },
        playedCueCount: evidence.playedCueCount,
        suppressedCueCount: evidence.suppressedCueCount,
        cueCount: Object.keys(skylineAudioManifest).length,
        typedAssetCount: assetUrls.length,
        assetUrls: assetUrls.slice(),
        audioErrors: evidence.errors.slice(),
        ambience: {
          started: ambienceStarted,
          stems: ambienceStems.map((stem) => ({
            cue: stem.cue,
            bus: stem.bus,
            looping: skylineAudioManifest[stem.cue].loop === true
          })),
          activeStemBus,
          activeActIndex,
          ducked
        }
      };
    },
    async dispose() {
      await audio.dispose();
    }
  };
}
