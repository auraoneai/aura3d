import {
  AudioBus,
  AudioContextManager,
  AudioFileManager,
  AudioSource,
  FootstepPlayer,
  computeDistanceAttenuation,
  computeDopplerShift,
  type AudioDecodeContextLike,
  type AudioFileInput
} from "@aura3d/audio";

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

export interface GameAudioVec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface GameAudioCueDefinition<TCue extends string = string> {
  readonly id: TCue;
  readonly bus?: GameAudioBusId;
  readonly volume?: number;
  readonly frequency?: number;
  readonly duration?: number;
  readonly asset?: AudioFileInput;
  readonly loop?: boolean;
  /** World position for positional playback; `playPositional` overrides per call. */
  readonly position?: GameAudioVec3;
  /** Static occlusion amount in [0, 1] (0 = clear). `setOcclusion` overrides per node. */
  readonly occlusion?: number;
  /** Footstep surface tag for `onFootPlant` selection (e.g. `"grass"`, `"metal"`). */
  readonly surface?: string;
  play?(context: GameAudioContextLike, destination: AudioNode, cue: GameAudioCueDefinition<TCue>): void | Promise<void>;
}

export interface GameAudioPlayingNode<TCue extends string = string> {
  readonly cue: TCue;
  readonly bus: GameAudioBusId;
  readonly position: GameAudioVec3;
  readonly attenuationGain: number;
  readonly dopplerShift: number;
  occlusion: number;
  readonly time: number;
}

export interface GameAudioFootPlant<TCue extends string = string> {
  readonly foot: "left" | "right";
  readonly surface: string;
  readonly position?: GameAudioVec3;
  readonly speed?: number;
}

export interface GameAudioDuckingOptions {
  /** Bus ducked while dialogue is active. Defaults to `"music"`. */
  readonly musicBus?: GameAudioBusId;
  /** Music gain multiplier while ducked. Defaults to 0.35. */
  readonly ratio?: number;
}

export interface GameAudioFootstepOptions<TCue extends string = string> {
  readonly surfaces: Readonly<Record<string, readonly TCue[]>>;
  readonly fallback?: TCue;
}

export interface GameAudioCueEvent<TCue extends string = string> {
  readonly cue: TCue;
  readonly bus: GameAudioBusId;
  readonly muted: boolean;
  readonly unlocked: boolean;
  readonly time: number;
}

export interface GameAudioBusLevel {
  readonly id: GameAudioBusId;
  readonly volume: number;
  readonly muted: boolean;
  /** Effective audibility: 0 when globally muted, bus-muted, or volume 0. Target gain, not metered loudness. */
  readonly level: number;
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
  /** Per-bus effective levels (I1: bus levels in evidence). */
  readonly busLevels: readonly GameAudioBusLevel[];
  /** Listener world position for positional math. */
  readonly listenerPosition: GameAudioVec3;
  /** Actually-played nodes with positions (I1: no silent-play claim — suppressed cues never appear here). */
  readonly playingNodes: readonly GameAudioPlayingNode<TCue>[];
  readonly duckingActive: boolean;
  readonly footplants: number;
}

export interface GameAudioPositionalOptions {
  readonly velocity?: GameAudioVec3;
  readonly occlusion?: number;
}

export interface GameAudioOptions<TCue extends string = string> {
  readonly context?: GameAudioContextLike | null;
  readonly createContext?: () => GameAudioContextLike | null;
  /** Ask the shared AudioContextManager to create and own the browser context. */
  readonly browserContext?: boolean;
  readonly buses?: readonly GameAudioBusDefinition[];
  readonly cues: Readonly<Record<TCue, GameAudioCueDefinition<TCue>>>;
  readonly ducking?: GameAudioDuckingOptions;
  readonly footsteps?: GameAudioFootstepOptions<TCue>;
}

export interface GameAudio<TCue extends string = string> {
  readonly evidence: GameAudioEvidence<TCue>;
  unlock(): Promise<GameAudioEvidence<TCue>>;
  cue(cue: TCue): Promise<GameAudioCueEvent<TCue>>;
  /** Play a cue at a world position; attenuation/doppler/occlusion land in `playingNodes`. */
  playPositional(cue: TCue, position: GameAudioVec3, options?: GameAudioPositionalOptions): Promise<GameAudioCueEvent<TCue>>;
  setListenerPosition(position: GameAudioVec3): GameAudioEvidence<TCue>;
  /** Update occlusion on the most recent playing node(s) for a cue. Advisory when nothing is playing. */
  setOcclusion(cue: TCue, amount: number): GameAudioEvidence<TCue>;
  /** Route a foot-IK plant event to its surface-tagged cue. Null when no cue is registered. */
  onFootPlant(event: GameAudioFootPlant): Promise<GameAudioCueEvent<TCue> | null>;
  /** Duck the music bus while dialogue/voice is active. */
  setDialogueActive(active: boolean): GameAudioEvidence<TCue>;
  setMuted(muted: boolean): GameAudioEvidence<TCue>;
  setBusVolume(bus: GameAudioBusId, volume: number): GameAudioEvidence<TCue>;
  onCue(callback: (event: GameAudioCueEvent<TCue>) => void): () => void;
  dispose(): Promise<GameAudioEvidence<TCue>>;
}

/**
 * WS-3.2 — a bus is now an `AudioBus` from `@aura3d/audio`, not a hand-rolled `GainNode` pair.
 *
 * `GameAudio` used to call `context.createGain()` itself and track `volume`/`muted` in plain fields, which
 * is why the R12 audit listed audio as duplicate ownership. Measurement showed the two layers are not
 * duplicates — `packages/audio` owns the graph, `GameAudio` owns cues and evidence — so the fix is
 * delegation rather than deleting either. After this change there is exactly one implementation of
 * bus routing, gain ramping, mute-restores-previous-volume and disposal in the repository, and
 * `GameAudio` keeps its public cue/evidence surface unchanged.
 *
 * `node` is optional because `GameAudio` is required to stay usable with no audio context at all
 * (headless route-health runs), where every cue is counted as suppressed instead of throwing.
 */
interface GameAudioBusState {
  readonly id: GameAudioBusId;
  readonly node?: AudioBus;
}

export function createGameAudio<TCue extends string>(options: GameAudioOptions<TCue>): GameAudio<TCue> {
  const cueDefinitions = options.cues;
  const cueIds = Object.keys(cueDefinitions) as TCue[];
  let context: GameAudioContextLike | null | undefined = options.context;
  if (options.browserContext && (options.context !== undefined || options.createContext !== undefined)) {
    throw new Error("Game audio browserContext cannot be combined with context or createContext; choose one context owner.");
  }
  const contextManager = options.browserContext ? new AudioContextManager() : undefined;
  let muted = false;
  let unlocked = false;
  let disposed = false;
  let playedCueCount = 0;
  let suppressedCueCount = 0;
  let lastCue: TCue | null = null;
  const errors: string[] = [];
  const listeners = new Set<(event: GameAudioCueEvent<TCue>) => void>();
  const buses = new Map<GameAudioBusId, GameAudioBusState>();
  /*
   * Volume for buses created while no audio context exists. `AudioBus` needs a real `createGain`, so
   * headless route-health runs have no `node` to hold the value — but `setBusVolume` must still be
   * observable in evidence there, which is what the harnesses assert on. One map, only ever read when
   * `node` is absent, so there is no second source of truth for a live bus.
   */
  const contextlessBusVolumes = new Map<GameAudioBusId, number>();
  let fileManager: AudioFileManager | undefined;
  const activeSources = new Set<AudioSource>();

  // I1 positional state: listener pose, recently played nodes, ducking, footsteps.
  let listenerPosition: GameAudioVec3 = { x: 0, y: 0, z: 0 };
  const playingNodes: GameAudioPlayingNode<TCue>[] = [];
  const MAX_PLAYING_NODES = 32;
  const duckingMusicBus: GameAudioBusId = options.ducking?.musicBus ?? "music";
  const duckingRatio = options.ducking?.ratio ?? 0.35;
  if (!Number.isFinite(duckingRatio) || duckingRatio < 0 || duckingRatio > 1) {
    throw new Error("Game audio ducking ratio must be between 0 and 1.");
  }
  let duckingActive = false;
  let duckingBaseVolume: number | undefined;
  let footstepPlayer: FootstepPlayer | undefined;
  let footplants = 0;
  if (options.footsteps) {
    const surfaces: Record<string, readonly string[]> = {};
    for (const [surface, cues] of Object.entries(options.footsteps.surfaces)) {
      for (const cueId of cues) {
        if (!cueDefinitions[cueId as TCue]) throw new Error(`Unknown game audio cue in footstep surface "${surface}": ${String(cueId)}`);
      }
      surfaces[surface] = [...cues];
    }
    const fallback = options.footsteps.fallback;
    if (fallback !== undefined && !cueDefinitions[fallback]) {
      throw new Error(`Unknown game audio cue as footstep fallback: ${String(fallback)}`);
    }
    footstepPlayer = new FootstepPlayer({ surfaces, fallback: fallback as string | undefined });
  }

  const getContext = (): GameAudioContextLike | null => {
    if (context === undefined) context = contextManager ? contextManager.context as unknown as GameAudioContextLike : options.createContext?.() ?? null;
    return context ?? null;
  };

  const getBus = (id: GameAudioBusId): GameAudioBusState => {
    const existing = buses.get(id);
    if (existing) return existing;
    const audioContext = getContext();
    // `GameAudioContextLike` structurally satisfies `AudioBusContextLike` (destination + createGain).
    const node = audioContext ? new AudioBus(String(id), audioContext) : undefined;
    const bus: GameAudioBusState = { id, node };
    buses.set(id, bus);
    return bus;
  };

  const playAssetCue = async (audioContext: GameAudioContextLike, destination: AudioNode, definition: GameAudioCueDefinition<TCue>): Promise<void> => {
    if (!definition.asset) return;
    if (!("decodeAudioData" in audioContext) || !("createBufferSource" in audioContext)) {
      throw new Error(`Game audio cue "${definition.id}" uses an asset but its context cannot decode or play audio buffers.`);
    }
    const decodeContext = audioContext as unknown as AudioDecodeContextLike;
    fileManager ??= new AudioFileManager({ context: decodeContext });
    const clip = await fileManager.load(definition.asset);
    const source = new AudioSource({ context: decodeContext, destination, clip, loop: definition.loop, volume: definition.volume });
    activeSources.add(source);
    source.play();
  };

  getBus("master");
  for (const bus of options.buses ?? []) {
    const state = getBus(bus.id);
    if (bus.volume === undefined) continue;
    if (state.node) state.node.setVolume(bus.volume);
    else contextlessBusVolumes.set(bus.id, bus.volume);
  }

  const busVolumeOf = (bus: GameAudioBusState): number => bus.node?.volume ?? contextlessBusVolumes.get(bus.id) ?? 1;
  const busMutedOf = (bus: GameAudioBusState): boolean => bus.node?.isMuted ?? false;

  const writeBusVolume = (bus: GameAudioBusState, volume: number): void => {
    if (bus.node) bus.node.setVolume(volume);
    else contextlessBusVolumes.set(bus.id, volume);
  };

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
        volume: busVolumeOf(bus),
        muted: busMutedOf(bus)
      })),
      busLevels: [...buses.values()].map((bus) => {
        const volume = busVolumeOf(bus);
        const busMuted = busMutedOf(bus);
        return { id: bus.id, volume, muted: busMuted, level: muted || busMuted ? 0 : volume };
      }),
      listenerPosition: { ...listenerPosition },
      playingNodes: playingNodes.map((node) => ({ ...node, position: { ...node.position } })),
      duckingActive,
      footplants
    };
  };

  const validateVec3 = (value: GameAudioVec3, label: string): GameAudioVec3 => {
    if (!value || ![value.x, value.y, value.z].every(Number.isFinite)) {
      throw new Error(`Game audio ${label} must have finite x/y/z numbers.`);
    }
    return { x: value.x, y: value.y, z: value.z };
  };

  const validateOcclusion = (amount: number, label: string): number => {
    if (!Number.isFinite(amount) || amount < 0 || amount > 1) {
      throw new RangeError(`Game audio ${label} must be between 0 and 1.`);
    }
    return amount;
  };

  const recordPlayingNode = (
    cue: TCue,
    busId: GameAudioBusId,
    position: GameAudioVec3,
    velocity: GameAudioVec3 | undefined,
    occlusion: number,
    time: number
  ): void => {
    const distance = Math.hypot(position.x - listenerPosition.x, position.y - listenerPosition.y, position.z - listenerPosition.z);
    playingNodes.push({
      cue,
      bus: busId,
      position: { ...position },
      attenuationGain: computeDistanceAttenuation(distance, {}),
      dopplerShift: velocity
        ? computeDopplerShift(position, velocity, listenerPosition, { x: 0, y: 0, z: 0 })
        : 1,
      occlusion,
      time
    });
    if (playingNodes.length > MAX_PLAYING_NODES) {
      playingNodes.splice(0, playingNodes.length - MAX_PLAYING_NODES);
    }
  };

  const playCue = async (
    cue: TCue,
    spatial?: { readonly position: GameAudioVec3; readonly velocity?: GameAudioVec3; readonly occlusion?: number }
  ): Promise<GameAudioCueEvent<TCue>> => {
    const definition = cueDefinitions[cue];
    if (!definition) throw new Error(`Unknown game audio cue: ${String(cue)}`);
    const bus = getBus(definition.bus ?? "master");
    const audioContext = getContext();
    lastCue = cue;
    const busMuted = busMutedOf(bus);
    const event: GameAudioCueEvent<TCue> = {
      cue,
      bus: bus.id,
      muted: muted || busMuted,
      unlocked,
      time: audioContext?.currentTime ?? 0
    };
    for (const listener of [...listeners]) listener(event);
    if (!audioContext || disposed || muted || busMuted) {
      suppressedCueCount += 1;
      return event;
    }
    try {
      if (!unlocked) await audio.unlock();
      if (definition.play) {
        await definition.play(audioContext, bus.node?.input ?? audioContext.destination, definition);
      } else if (definition.asset) {
        await playAssetCue(audioContext, bus.node?.input ?? audioContext.destination, definition);
      } else {
        playDefaultCue(audioContext, bus.node?.input ?? audioContext.destination, definition);
      }
      playedCueCount += 1;
      // Only actually-played cues become playing nodes — suppressed cues stay out (no silent-play claim).
      const position = spatial?.position ?? definition.position ?? listenerPosition;
      const occlusion = spatial?.occlusion ?? definition.occlusion ?? 0;
      recordPlayingNode(cue, bus.id, position, spatial?.velocity, validateOcclusion(occlusion, "cue occlusion"), event.time);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      suppressedCueCount += 1;
    }
    return event;
  };

  const audio: GameAudio<TCue> = {
    get evidence() {
      return snapshot();
    },
    async unlock() {
      const audioContext = getContext();
      if (!audioContext) return snapshot();
      if (contextManager) await contextManager.unlock();
      else await audioContext.resume();
      unlocked = true;
      return snapshot();
    },
    async cue(cue) {
      return playCue(cue);
    },
    async playPositional(cue, position, positionalOptions) {
      const resolved = validateVec3(position, "playPositional position");
      const velocity = positionalOptions?.velocity ? validateVec3(positionalOptions.velocity, "playPositional velocity") : undefined;
      const occlusion = positionalOptions?.occlusion === undefined
        ? undefined
        : validateOcclusion(positionalOptions.occlusion, "playPositional occlusion");
      return playCue(cue, { position: resolved, velocity, occlusion });
    },
    setListenerPosition(position) {
      listenerPosition = validateVec3(position, "listener position");
      return snapshot();
    },
    setOcclusion(cue, amount) {
      const resolved = validateOcclusion(amount, "occlusion amount");
      for (const node of playingNodes) {
        if (node.cue === cue) node.occlusion = resolved;
      }
      return snapshot();
    },
    async onFootPlant(event) {
      footplants += 1;
      if (!footstepPlayer) return null;
      const selected = footstepPlayer.onPlant({
        foot: event.foot,
        surface: event.surface,
        position: event.position,
        speed: event.speed
      });
      if (selected === null) return null;
      const position = event.position ? validateVec3(event.position, "foot plant position") : { ...listenerPosition };
      return playCue(selected as TCue, { position });
    },
    setDialogueActive(active) {
      duckingActive = active;
      const bus = getBus(duckingMusicBus);
      if (active) {
        if (duckingBaseVolume === undefined) duckingBaseVolume = busVolumeOf(bus);
        writeBusVolume(bus, duckingBaseVolume * duckingRatio);
      } else if (duckingBaseVolume !== undefined) {
        writeBusVolume(bus, duckingBaseVolume);
        duckingBaseVolume = undefined;
      }
      return snapshot();
    },
    setMuted(value) {
      muted = value;
      return snapshot();
    },
    setBusVolume(busId, volume) {
      if (!Number.isFinite(volume) || volume < 0) throw new Error("Game audio bus volume must be a non-negative finite number.");
      const bus = getBus(busId);
      // Validated again inside AudioBus.setVolume; the local check is kept so the error message stays
      // the game-facing one that existing routes and tests assert on.
      if (duckingActive && busId === duckingMusicBus && duckingBaseVolume !== undefined) {
        // A live mix change while ducked re-bases the duck instead of fighting it.
        duckingBaseVolume = volume;
        writeBusVolume(bus, volume * duckingRatio);
      } else {
        writeBusVolume(bus, volume);
      }
      return snapshot();
    },
    onCue(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    async dispose() {
      disposed = true;
      for (const bus of buses.values()) bus.node?.dispose();
      for (const source of activeSources) source.dispose();
      activeSources.clear();
      playingNodes.length = 0;
      fileManager?.clear();
      if (contextManager) await contextManager.dispose();
      else if (context?.close) await context.close();
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
