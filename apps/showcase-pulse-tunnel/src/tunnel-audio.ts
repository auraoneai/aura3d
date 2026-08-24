/**
 * Pulse Tunnel audio runtime — 4 stem buses + SFX controller over `createGameAudio`.
 *
 * The four music stems (drums/bass/lead/air) each own a bus whose volume is the
 * mixer: sections "unmute" stems by raising bus volume (PRD section 5). Stems are
 * scheduled as GameAudio cues whose custom `play` starts pre-decoded buffers at one
 * shared AudioContext timestamp, so all four stems and the beat clock share exactly
 * one anchor — that shared anchor is what makes ±80 ms beat tolerance meaningful.
 * SFX cues use the CLI-registered typed assets.
 *
 * Headless/autoplay safety: if no AudioContext can exist (route-health runs), every
 * cue is counted as suppressed by createGameAudio and the route falls back to
 * pattern mode; gameplay never depends on audio existing.
 */
import { createGameAudio, type GameAudio, type GameAudioContextLike } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

export type PulseSfxCue =
  | "laneSwitch"
  | "jump"
  | "slide"
  | "graze"
  | "shieldHit"
  | "shieldBreak"
  | "sectionRise"
  | "runOver"
  | "uiConfirm";

export type PulseStemCue = "stemDrums" | "stemBass" | "stemLead" | "stemAir";
export type PulseAudioCue = PulseSfxCue | PulseStemCue;

export const PULSE_STEM_BUS_IDS = ["drums", "bass", "lead", "air"] as const;
export type PulseStemBusId = (typeof PULSE_STEM_BUS_IDS)[number];

/** Section -> which stem buses are audible. Order is the PRD's rise. */
export const PULSE_SECTION_BUSES: Record<string, readonly PulseStemBusId[]> = {
  intro: ["drums"],
  build: ["drums", "bass"],
  drop: ["drums", "bass", "lead"],
  finale: ["drums", "bass", "lead", "air"]
};

const STEM_LEVEL = 0.28;
const SFX_LEVEL = 0.45;
/** Shared lookahead between "start run" and the moment buffers actually sound. */
const START_LEAD_SECONDS = 0.12;

interface StemBuffer {
  readonly cue: PulseStemCue;
  readonly buffer: AudioBuffer;
}

export interface TunnelAudioEvidence {
  readonly enabled: boolean;
  readonly contextState: string;
  readonly unlocked: boolean;
  readonly stemsDecoded: number;
  readonly stemAnchorSeconds: number | null;
  readonly busVolumes: Readonly<Record<string, number>>;
  readonly lastCue: string | null;
  readonly recentCues: readonly string[];
  readonly playedCueCount: number;
  readonly suppressedCueCount: number;
  readonly errors: readonly string[];
}

export interface TunnelAudio {
  /** Create/own the AudioContext and decode all four stems. Safe to call twice. */
  unlock(): Promise<boolean>;
  /**
   * Schedule all four stems to start together at ctx.currentTime + lookahead.
   * Returns the exact audio-context anchor seconds for the beat clock, or null
   * when there is no usable audio context.
   */
  startRun(): Promise<number | null>;
  stopStems(): void;
  applySection(sectionId: string): void;
  duckForSummary(): void;
  suspend(): Promise<void>;
  resume(): Promise<void>;
sfx(name: PulseSfxCue): Promise<void>;
  /** Raw owned-context clock seconds (0 when no context exists). */
  nowSeconds(): number;
  evidence(): TunnelAudioEvidence;
  dispose(): Promise<void>;
}

export function createTunnelAudio(): TunnelAudio {
  let context: AudioContext | null = null;
  try {
    const Ctor = window.AudioContext;
    if (typeof Ctor === "function") context = new Ctor();
  } catch {
    context = null;
  }

  const stems: Record<PulseStemCue, { url: string }> = {
    stemDrums: { url: assets.pulseDrumsStem.url },
    stemBass: { url: assets.pulseBassStem.url },
    stemLead: { url: assets.pulseLeadStem.url },
    stemAir: { url: assets.pulseAirStem.url }
  };

  const decoded = new Map<PulseStemCue, AudioBuffer>();
  const activeSources = new Set<AudioBufferSourceNode>();
  let scheduledAnchor: number | null = null;
  const recentCues: string[] = [];

  const cueEntries = {
    // ---- stems: custom play() schedules the pre-decoded buffer on the shared anchor
    stemDrums: {
      id: "stemDrums" as const,
      bus: "drums",
      volume: STEM_LEVEL,
      play: makeStemPlay("stemDrums")
    },
    stemBass: {
      id: "stemBass" as const,
      bus: "bass",
      volume: STEM_LEVEL,
      play: makeStemPlay("stemBass")
    },
    stemLead: {
      id: "stemLead" as const,
      bus: "lead",
      volume: STEM_LEVEL,
      play: makeStemPlay("stemLead")
    },
    stemAir: {
      id: "stemAir" as const,
      bus: "air",
      volume: STEM_LEVEL,
      play: makeStemPlay("stemAir")
    },
    // ---- sfx: typed CLI-registered assets on the sfx bus
    laneSwitch: { id: "laneSwitch" as const, bus: "sfx", asset: assets.pulseLaneSwitchSfx },
    jump: { id: "jump" as const, bus: "sfx", asset: assets.pulseJumpSfx },
    slide: { id: "slide" as const, bus: "sfx", asset: assets.pulseSlideSfx },
    graze: { id: "graze" as const, bus: "sfx", asset: assets.pulseGrazeSfx },
    shieldHit: { id: "shieldHit" as const, bus: "sfx", asset: assets.pulseShieldHitSfx },
    shieldBreak: { id: "shieldBreak" as const, bus: "sfx", asset: assets.pulseShieldBreakSfx },
    sectionRise: { id: "sectionRise" as const, bus: "sfx", asset: assets.pulseSectionRiseSfx },
    runOver: { id: "runOver" as const, bus: "sfx", asset: assets.pulseRunOverSfx },
    uiConfirm: { id: "uiConfirm" as const, bus: "sfx", asset: assets.pulseUiConfirmSfx }
  };

  function makeStemPlay(cue: PulseStemCue) {
    return (audioContext: GameAudioContextLike, destination: AudioNode): void => {
      if (!context) return;
      const buffer = decoded.get(cue);
      if (!buffer) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(destination);
      const when = scheduledAnchor ?? audioContext.currentTime + START_LEAD_SECONDS;
      source.start(when);
      source.onended = () => activeSources.delete(source);
      activeSources.add(source);
    };
  }

  const audio: GameAudio<PulseAudioCue> = createGameAudio<PulseAudioCue>({
    // One owned context shared with the beat clock; null-safe when construction failed.
    ...(context ? { context } : {}),
    buses: [
      { id: "drums", volume: STEM_LEVEL },
      { id: "bass", volume: 0 },
      { id: "lead", volume: 0 },
      { id: "air", volume: 0 },
      { id: "sfx", volume: SFX_LEVEL }
    ],
    cues: cueEntries
  });

  async function decodeStems(): Promise<number> {
    if (!context) return 0;
    const entries: [PulseStemCue, string][] = [
      ["stemDrums", stems.stemDrums.url],
      ["stemBass", stems.stemBass.url],
      ["stemLead", stems.stemLead.url],
      ["stemAir", stems.stemAir.url]
    ];
    await Promise.all(
      entries.map(async ([cue, url]) => {
        if (decoded.has(cue)) return;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`stem fetch failed: ${url}`);
        const bytes = await response.arrayBuffer();
        decoded.set(cue, await context!.decodeAudioData(bytes));
      })
    );
    return decoded.size;
  }

  return {
    async unlock() {
      if (!context) return false;
      try {
        await audio.unlock();
        await decodeStems();
        return context.state === "running";
      } catch {
        return false;
      }
    },
    async startRun() {
      if (!context || decoded.size < 4) return null;
      stopActiveSources();
      scheduledAnchor = context.currentTime + START_LEAD_SECONDS;
      // Fire synchronously so every stem reads the same anchor.
      audio.cue("stemDrums");
      audio.cue("stemBass");
      audio.cue("stemLead");
      audio.cue("stemAir");
      return scheduledAnchor;
    },
    stopStems() {
      stopActiveSources();
    },
    applySection(sectionId) {
      const audible = PULSE_SECTION_BUSES[sectionId] ?? PULSE_SECTION_BUSES.intro;
      for (const bus of PULSE_STEM_BUS_IDS) {
        audio.setBusVolume(bus, audible.includes(bus) ? STEM_LEVEL : 0);
      }
    },
    duckForSummary() {
      for (const bus of PULSE_STEM_BUS_IDS) audio.setBusVolume(bus, 0);
    },
    async suspend() {
      if (context && context.state === "running") await context.suspend().catch(() => undefined);
    },
    async resume() {
      if (context && context.state === "suspended") await context.resume().catch(() => undefined);
    },
    async sfx(name) {
      recentCues.push(name);
      if (recentCues.length > 24) recentCues.shift();
      await audio.cue(name);
    },
    nowSeconds() {
      return context?.currentTime ?? 0;
    },
    evidence() {
      const snapshot = audio.evidence;
      const busVolumes: Record<string, number> = {};
      for (const bus of snapshot.buses) busVolumes[bus.id] = bus.volume;
      return {
        enabled: snapshot.enabled && !snapshot.muted && context !== null,
        contextState: snapshot.contextState,
        unlocked: snapshot.unlocked,
        stemsDecoded: decoded.size,
        stemAnchorSeconds: scheduledAnchor,
        busVolumes,
        lastCue: snapshot.lastCue,
        recentCues: [...recentCues],
        playedCueCount: snapshot.playedCueCount,
        suppressedCueCount: snapshot.suppressedCueCount,
        errors: [...snapshot.errors]
      };
    },
    async dispose() {
      stopActiveSources();
      await audio.dispose();
      context = null;
    }
  };

  function stopActiveSources(): void {
    for (const source of [...activeSources]) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    activeSources.clear();
  }
}
