/**
 * Mech Hangar audio — 4-bus mixer wrapper + cue manifest.
 *
 * All ten cues are CLI-registered typed assets synthesized in-repo by
 * scripts/build-sfx.mjs (Aura3D synthesis, CC0-1.0): no raw URLs, no invented ids.
 * Buses follow the repo's audio discipline: ui, combat, world, ambient. The servo
 * cycle plays on EVERY slot cycle (PRD DoD), and evidence records the recent cues.
 */
import { createGameAudio, type GameAudio } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

/** Typed audio asset refs resolved once from the generated map. */
const AUDIO_ASSETS = assets as unknown as Record<HangarAudioCue, { url: string; hash: string; format: "wav" }>;

export type HangarAudioCue =
  | "mechServoCycleSfx"
  | "mechLockInSfx"
  | "mechWalkHeavySfx"
  | "mechLightHitSfx"
  | "mechHeavyHitSfx"
  | "mechGuardBlockSfx"
  | "mechGuardBreakSfx"
  | "mechSpecialFireSfx"
  | "mechKoStingSfx"
  | "mechAmbientHangarSfx";

export const HANGAR_AUDIO_CUES: readonly HangarAudioCue[] = [
  "mechServoCycleSfx",
  "mechLockInSfx",
  "mechWalkHeavySfx",
  "mechLightHitSfx",
  "mechHeavyHitSfx",
  "mechGuardBlockSfx",
  "mechGuardBreakSfx",
  "mechSpecialFireSfx",
  "mechKoStingSfx",
  "mechAmbientHangarSfx"
];

export interface HangarAudioCueDefinition {
  readonly cue: HangarAudioCue;
  readonly bus: "ui" | "combat" | "world" | "ambient";
  readonly volume: number;
  /** The typed CLI-registered asset ref (never a raw URL or invented id). */
  readonly asset: { url: string; hash: string; format: "wav" };
}

function typedAsset(cue: HangarAudioCue): { url: string; hash: string; format: "wav" } {
  const ref = AUDIO_ASSETS[cue];
  if (!ref) throw new Error("missing typed audio asset for cue " + cue);
  return { url: ref.url, hash: ref.hash, format: "wav" };
}

export const hangarAudioManifest: Readonly<Record<HangarAudioCue, HangarAudioCueDefinition>> = {
  mechServoCycleSfx: { cue: "mechServoCycleSfx", bus: "ui", volume: 0.7, get asset() { return typedAsset("mechServoCycleSfx"); } },
  mechLockInSfx: { cue: "mechLockInSfx", bus: "ui", volume: 0.9, get asset() { return typedAsset("mechLockInSfx"); } },
  mechWalkHeavySfx: { cue: "mechWalkHeavySfx", bus: "world", volume: 0.55, get asset() { return typedAsset("mechWalkHeavySfx"); } },
  mechLightHitSfx: { cue: "mechLightHitSfx", bus: "combat", volume: 0.8, get asset() { return typedAsset("mechLightHitSfx"); } },
  mechHeavyHitSfx: { cue: "mechHeavyHitSfx", bus: "combat", volume: 0.95, get asset() { return typedAsset("mechHeavyHitSfx"); } },
  mechGuardBlockSfx: { cue: "mechGuardBlockSfx", bus: "combat", volume: 0.75, get asset() { return typedAsset("mechGuardBlockSfx"); } },
  mechGuardBreakSfx: { cue: "mechGuardBreakSfx", bus: "combat", volume: 0.95, get asset() { return typedAsset("mechGuardBreakSfx"); } },
  mechSpecialFireSfx: { cue: "mechSpecialFireSfx", bus: "combat", volume: 0.85, get asset() { return typedAsset("mechSpecialFireSfx"); } },
  mechKoStingSfx: { cue: "mechKoStingSfx", bus: "combat", volume: 1, get asset() { return typedAsset("mechKoStingSfx"); } },
  mechAmbientHangarSfx: { cue: "mechAmbientHangarSfx", bus: "ambient", volume: 0.4, get asset() { return typedAsset("mechAmbientHangarSfx"); } }
};

export interface HangarAudioProof {
  readonly enabled: boolean;
  readonly muted: boolean;
  readonly unlocked: boolean;
  readonly contextState: string;
  readonly registeredCues: number;
  readonly lastCue: HangarAudioCue | null;
  readonly recentCues: readonly HangarAudioCue[];
  readonly playedCueCount: number;
}

export interface HangarAudioController {
  readonly cue: (name: HangarAudioCue) => Promise<void>;
  readonly unlock: () => Promise<void>;
  readonly proof: () => HangarAudioProof;
  readonly dispose: () => Promise<void>;
}

export function createHangarAudio(): HangarAudioController {
  const recentCues: HangarAudioCue[] = [];
  const cueEntries = Object.fromEntries(
    HANGAR_AUDIO_CUES.map((cueName) => {
      const definition = hangarAudioManifest[cueName];
      return [definition.cue, { id: definition.cue, bus: definition.bus, volume: definition.volume, asset: definition.asset }];
    })
  ) as unknown as Record<HangarAudioCue, Parameters<typeof createGameAudio<HangarAudioCue>>[0]["cues"][HangarAudioCue]>;

  const audio: GameAudio<HangarAudioCue> = createGameAudio({
    browserContext: true,
    buses: [
      { id: "ui", volume: 0.8 },
      { id: "combat", volume: 1 },
      { id: "world", volume: 0.6 },
      { id: "ambient", volume: 0.5 }
    ],
    cues: cueEntries
  });

  /*
   * Cue scheduling discipline (route-local).
   *
   * The engine's GameAudio tracks every started source until dispose, so cue
   * rate IS a resource contract: time-warp brawling can otherwise demand
   * hundreds of simultaneous AudioBufferSources and starve the renderer.
   * Two limits keep playback musical and bounded:
   *   - per-cue refractory period (no double-firing one hit sound),
   *   - global budget of MAX_CUES_PER_SECOND starts per rolling second.
   */
  const CUE_REFRACTORY_MS = 130;
  const MAX_CUES_PER_SECOND = 10;
  const lastCueAt = new Map<HangarAudioCue, number>();
  let windowStart = 0;
  let windowCount = 0;

  return {
    async cue(name) {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (now - windowStart >= 1000) {
        windowStart = now;
        windowCount = 0;
      }
      if ((lastCueAt.get(name) ?? -Infinity) + CUE_REFRACTORY_MS > now) return;
      if (windowCount >= MAX_CUES_PER_SECOND) return;
      windowCount += 1;
      lastCueAt.set(name, now);
      recentCues.push(name);
      if (recentCues.length > 24) recentCues.shift();
      await audio.cue(name).catch(() => {
        // Audio is optional presentation; unlock/suppress failures are non-fatal.
      });
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
        registeredCues: HANGAR_AUDIO_CUES.length,
        lastCue: recentCues.length > 0 ? recentCues[recentCues.length - 1]! : null,
        recentCues: [...recentCues],
        playedCueCount: evidence.playedCueCount
      };
    },
    async dispose() {
      await audio.dispose?.();
    }
  };
}

/** The ambient loop is a one-shot WAV; retrigger it on this cadence while in the hangar. */
export const AMBIENT_LOOP_SECONDS = 3.2;

/** Typed asset URL list for evidence (proves cues resolve through the generated map). */
export function hangarAudioAssetUrls(): readonly string[] {
  const lookup = assets as unknown as Record<HangarAudioCue, { url: string } | undefined>;
  return HANGAR_AUDIO_CUES.map((cue) => lookup[cue]?.url ?? "").filter(Boolean);
}