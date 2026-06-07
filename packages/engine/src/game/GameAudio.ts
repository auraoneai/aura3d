export type GameAudioBusId = "master" | string;

export interface GameAudioContextLike {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: AudioNode;
  resume(): Promise<void>;
  suspend?(): Promise<void>;
  close?(): Promise<void>;
  createGain(): GainNode;
  createOscillator?(): OscillatorNode;
}

export interface GameAudioBusDefinition {
  readonly id: GameAudioBusId;
  readonly volume?: number;
}

export interface GameAudioCueDefinition<TCue extends string = string> {
  readonly id: TCue;
  readonly bus?: GameAudioBusId;
  readonly volume?: number;
  readonly frequency?: number;
  readonly duration?: number;
  play?(context: GameAudioContextLike, destination: AudioNode, cue: GameAudioCueDefinition<TCue>): void | Promise<void>;
}

export interface GameAudioCueEvent<TCue extends string = string> {
  readonly cue: TCue;
  readonly bus: GameAudioBusId;
  readonly muted: boolean;
  readonly unlocked: boolean;
  readonly time: number;
}

export interface GameAudioEvidence<TCue extends string = string> {
  readonly kind: "aura-game-audio-evidence";
  readonly enabled: boolean;
  readonly muted: boolean;
  readonly unlocked: boolean;
  readonly contextState: string;
  readonly cueCount: number;
  readonly busCount: number;
  readonly playedCueCount: number;
  readonly suppressedCueCount: number;
  readonly lastCue: TCue | null;
  readonly errors: readonly string[];
  readonly buses: readonly { readonly id: GameAudioBusId; readonly volume: number; readonly muted: boolean }[];
}

export interface GameAudioOptions<TCue extends string = string> {
  readonly context?: GameAudioContextLike | null;
  readonly createContext?: () => GameAudioContextLike | null;
  readonly buses?: readonly GameAudioBusDefinition[];
  readonly cues: Readonly<Record<TCue, GameAudioCueDefinition<TCue>>>;
}

export interface GameAudio<TCue extends string = string> {
  readonly evidence: GameAudioEvidence<TCue>;
  unlock(): Promise<GameAudioEvidence<TCue>>;
  cue(cue: TCue): Promise<GameAudioCueEvent<TCue>>;
  setMuted(muted: boolean): GameAudioEvidence<TCue>;
  setBusVolume(bus: GameAudioBusId, volume: number): GameAudioEvidence<TCue>;
  onCue(callback: (event: GameAudioCueEvent<TCue>) => void): () => void;
  dispose(): Promise<GameAudioEvidence<TCue>>;
}

interface GameAudioBusState {
  readonly id: GameAudioBusId;
  readonly gain?: GainNode;
  volume: number;
  muted: boolean;
}

export function createGameAudio<TCue extends string>(options: GameAudioOptions<TCue>): GameAudio<TCue> {
  const cueDefinitions = options.cues;
  const cueIds = Object.keys(cueDefinitions) as TCue[];
  let context: GameAudioContextLike | null | undefined = options.context;
  let muted = false;
  let unlocked = false;
  let disposed = false;
  let playedCueCount = 0;
  let suppressedCueCount = 0;
  let lastCue: TCue | null = null;
  const errors: string[] = [];
  const listeners = new Set<(event: GameAudioCueEvent<TCue>) => void>();
  const buses = new Map<GameAudioBusId, GameAudioBusState>();

  const getContext = (): GameAudioContextLike | null => {
    if (context === undefined) context = options.createContext?.() ?? null;
    return context ?? null;
  };

  const getBus = (id: GameAudioBusId): GameAudioBusState => {
    const existing = buses.get(id);
    if (existing) return existing;
    const audioContext = getContext();
    const gain = audioContext?.createGain();
    if (gain && audioContext) {
      gain.gain.value = 1;
      gain.connect(audioContext.destination);
    }
    const bus = { id, gain, volume: 1, muted: false };
    buses.set(id, bus);
    return bus;
  };

  getBus("master");
  for (const bus of options.buses ?? []) {
    const state = getBus(bus.id);
    if (bus.volume !== undefined) state.volume = bus.volume;
    if (state.gain) state.gain.gain.value = bus.volume ?? state.volume;
  }

  const snapshot = (): GameAudioEvidence<TCue> => {
    const audioContext = getContext();
    return {
      kind: "aura-game-audio-evidence",
      enabled: !disposed && audioContext !== null,
      muted,
      unlocked,
      contextState: audioContext?.state ?? "unavailable",
      cueCount: cueIds.length,
      busCount: buses.size,
      playedCueCount,
      suppressedCueCount,
      lastCue,
      errors,
      buses: [...buses.values()].map((bus) => ({
        id: bus.id,
        volume: bus.volume,
        muted: bus.muted
      }))
    };
  };

  const audio: GameAudio<TCue> = {
    get evidence() {
      return snapshot();
    },
    async unlock() {
      const audioContext = getContext();
      if (!audioContext) return snapshot();
      await audioContext.resume();
      unlocked = true;
      return snapshot();
    },
    async cue(cue) {
      const definition = cueDefinitions[cue];
      if (!definition) throw new Error(`Unknown game audio cue: ${String(cue)}`);
      const bus = getBus(definition.bus ?? "master");
      const audioContext = getContext();
      lastCue = cue;
      const event: GameAudioCueEvent<TCue> = {
        cue,
        bus: bus.id,
        muted: muted || bus.muted,
        unlocked,
        time: audioContext?.currentTime ?? 0
      };
      for (const listener of [...listeners]) listener(event);
      if (!audioContext || disposed || muted || bus.muted) {
        suppressedCueCount += 1;
        return event;
      }
      try {
        if (!unlocked) await audio.unlock();
        if (definition.play) {
          await definition.play(audioContext, bus.gain ?? audioContext.destination, definition);
        } else {
          playDefaultCue(audioContext, bus.gain ?? audioContext.destination, definition);
        }
        playedCueCount += 1;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
        suppressedCueCount += 1;
      }
      return event;
    },
    setMuted(value) {
      muted = value;
      return snapshot();
    },
    setBusVolume(busId, volume) {
      if (!Number.isFinite(volume) || volume < 0) throw new Error("Game audio bus volume must be a non-negative finite number.");
      const bus = getBus(busId);
      bus.volume = volume;
      if (bus.gain && !bus.muted) bus.gain.gain.value = volume;
      return snapshot();
    },
    onCue(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    async dispose() {
      disposed = true;
      for (const bus of buses.values()) bus.gain?.disconnect();
      if (context?.close) await context.close();
      return snapshot();
    }
  };

  return audio;
}

function playDefaultCue<TCue extends string>(
  context: GameAudioContextLike,
  destination: AudioNode,
  cue: GameAudioCueDefinition<TCue>
): void {
  const oscillator = context.createOscillator?.();
  if (!oscillator) return;
  const gain = context.createGain();
  const now = context.currentTime;
  const duration = cue.duration ?? 0.12;
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(cue.frequency ?? 176, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(cue.volume ?? 0.025, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain).connect(destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}
