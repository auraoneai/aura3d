import {
  AudioClip,
  AudioContextManager,
  FootstepPlayer,
  computeDistanceAttenuation,
  computeDopplerShift,
  createGameSoundEngine,
  type AudioFileAssetLike,
  type AudioFileInput,
  type GameBusId,
  type SoundCueSpec,
  type SoundGraphContext
} from "@aura3d/audio";
import { resolveQrFlags, type QrFlagInput } from "../contracts/flags";
import { gameSoundSlot } from "../contracts/gameSound.js";

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
  /** Flag input for `A3D_QR_GAME` (C-25 throw-on-invalid-cue); env/URL apply when absent. */
  readonly qualityRebuild?: { readonly flags?: QrFlagInput };
}

export interface GameAudioListenerPose {
  readonly position: readonly [number, number, number];
  readonly forward: readonly [number, number, number];
  readonly up: readonly [number, number, number];
}

export interface GameAudio<TCue extends string = string> {
  readonly evidence: GameAudioEvidence<TCue>;
  unlock(): Promise<GameAudioEvidence<TCue>>;
  cue(cue: TCue): Promise<GameAudioCueEvent<TCue>>;
  /** Play a cue at a world position; attenuation/doppler/occlusion land in `playingNodes`. */
  playPositional(cue: TCue, position: GameAudioVec3, options?: GameAudioPositionalOptions): Promise<GameAudioCueEvent<TCue>>;
  /** Move the listener; keeps the last orientation set by `setListener`. */
  setListenerPosition(position: GameAudioVec3): GameAudioEvidence<TCue>;
  /**
   * C-25-shaped full listener pose (Q-09-6 / #213): position plus orientation, so
   * spatial panning follows the presented camera. `forward`/`up` need not be unit
   * length but must be non-zero and finite. `bindFeelSound` prefers this surface.
   */
  setListener(pose: GameAudioListenerPose): GameAudioEvidence<TCue>;
  /** Update occlusion on the most recent playing node(s) for a cue. Advisory when nothing is playing. */
  setOcclusion(cue: TCue, amount: number): GameAudioEvidence<TCue>;
  /** Route a foot-IK plant event to its surface-tagged cue. Null when no cue is registered. */
  onFootPlant(event: GameAudioFootPlant): Promise<GameAudioCueEvent<TCue> | null>;
  /**
   * Drive a playing cue (typically a loop: engine, wind, thrust, ambience) from
   * game state. `volume` is linear relative to the cue's authored volume (0 =
   * silent, 1 = authored), `rate` is a playback-rate multiplier; both glide
   * over `rampMs` (default 60). A no-op when the cue is not playing.
   */
  setCueLevel(cue: TCue, level: { readonly volume?: number; readonly rate?: number }, rampMs?: number): GameAudioEvidence<TCue>;
  /** Stop every live voice of a cue with a short fade (default 80 ms). */
  stopCue(cue: TCue, fadeMs?: number): GameAudioEvidence<TCue>;
  /** Duck the music bus while dialogue/voice is active. */
  setDialogueActive(active: boolean): GameAudioEvidence<TCue>;
  setMuted(muted: boolean): GameAudioEvidence<TCue>;
  setBusVolume(bus: GameAudioBusId, volume: number): GameAudioEvidence<TCue>;
  onCue(callback: (event: GameAudioCueEvent<TCue>) => void): () => void;
  /** §20 `audio.webm`: record the master bus for ~`seconds` (60 default). Null flag-off or when MediaRecorder is unavailable. */
  recordMaster(seconds?: number): Promise<Blob | null>;
  dispose(): Promise<GameAudioEvidence<TCue>>;
}

/**
 * A route-facing bus record: `GameAudio` no longer builds per-bus `GainNode`s
 * itself — the `GameSoundEngine` master chain owns the graph — but the adapter
 * still tracks route bus ids (and their target volumes) so the evidence shape
 * is unchanged and headless routes stay usable with no audio context at all.
 */
interface GameAudioBusState {
  readonly id: GameAudioBusId;
  /** Engine bus this route bus resolves to (route ids fold onto the §6.8 bus set). */
  readonly engineBus: GameBusId;
}

/** §6.8 engine buses; route-local ids fold onto `sfx` ("ambient" → `ambience`, "master" → `sfx`). */
const ENGINE_BUS_IDS: readonly string[] = ["music", "sfx", "ui", "ambience", "voice"];
const ENGINE_BUS_ALIASES: Readonly<Record<string, GameBusId>> = { ambient: "ambience", master: "sfx" };
const engineBusOf = (id: GameAudioBusId): GameBusId =>
  ENGINE_BUS_IDS.includes(id) ? (id as GameBusId) : ENGINE_BUS_ALIASES[id] ?? "sfx";
/**
 * Where a route bus volume lands. Engine buses (and `ambient`) set the engine
 * bus gain; `master` sets the master level. Every other id is route-local
 * ("engine", "wind", "music-stem-2", ...): its cues still route through the
 * engine `sfx` bus, but the volume scales only that bus's own voices. Writing
 * route-local volumes onto the shared `sfx` gain (the old behaviour) let the
 * last write win for every cue: Blockfall's stem-4 = 0 silenced all SFX,
 * Patrol Wing's per-frame engine throttle scaled every gun shot.
 */
const volumeTargetOf = (id: GameAudioBusId): GameBusId | "route" =>
  id === "master" ? "master" : ENGINE_BUS_IDS.includes(id) || id in ENGINE_BUS_ALIASES ? engineBusOf(id) : "route";

const gainToDb = (volume: number): number => 20 * Math.log10(Math.max(volume, 1e-4));

const missingCueMessage = (id: string): string =>
  `Game audio cue "${id}" has no asset or play(); synthesized default cues were removed (PRD 09).`;

const assetRefOf = (
  input: AudioFileInput
): { readonly url: string; readonly hash?: string; readonly license?: string; readonly buffer?: AudioBuffer } => {
  if (typeof input === "string") return { url: input };
  if (input instanceof URL) return { url: input.href };
  if (input instanceof AudioClip) {
    return { url: `clip:${input.name ?? "unnamed"}`, buffer: input.buffer };
  }
  const like = input as AudioFileAssetLike;
  return { url: like.url, hash: like.hash, license: like.license };
};

interface LiveVoiceHandle {
  readonly id: number;
  /** Real engine voices report when they finished; stub handles omit it. */
  readonly ended?: boolean;
  setLevel?(level: { gain?: number; rate?: number }, rampMs?: number): void;
  stop(fadeMs?: number): void;
  setPosition(p: GameAudioVec3): void;
  setOcclusion(amount: number): void;
}

/**
 * WS-3.2 + PRD-09 §7.5 — `GameAudio` is now an adapter over `createGameSoundEngine`:
 * the engine owns the whole graph (buses → master chain), voice pool, variant
 * selection and doppler; this adapter keeps the route-facing cue/evidence
 * surface (`cue`, `playPositional`, footsteps, dialogue ducking, occlusion
 * overrides) byte-for-byte unchanged.
 *
 * Cues without `asset`/`play` have nothing to sound — `playDefaultCue` is
 * deleted. With `A3D_QR_GAME` on, `createGameAudio` throws the PRD message;
 * off, it warns once per cue and those cues count as suppressed when played.
 * `tests/unit/engine/route-cue-maps.test.ts` proves every shipped cue map
 * already satisfies the rule.
 */
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

  // ---- C-25 cue validation (PRD-09 1734) -----------------------------------
  const qrFlags = resolveQrFlags({
    options: options.qualityRebuild?.flags,
    env: typeof process !== "undefined" ? process.env : undefined
  });
  const qrGameOn = qrFlags.on("A3D_QR_GAME");
  const engineCues: Record<string, SoundCueSpec> = {};
  for (const id of cueIds) {
    const def = cueDefinitions[id];
    if (def.asset === undefined && def.play === undefined) {
      // Synth/`play`-less cues must not crash boot under the flag (createGame
      // forwards flags:['game']): degrade to a suppressed cue and record the
      // miss on the evidence surface instead of throwing.
      if (qrGameOn) {
        errors.push(missingCueMessage(String(id)));
        if (typeof console !== "undefined") console.warn(missingCueMessage(String(id)));
      } else if (typeof console !== "undefined") console.warn(missingCueMessage(String(id)));
      continue; // cue exists in evidence but plays as suppressed
    }
    engineCues[id] = {
      bus: engineBusOf(def.bus ?? "master"),
      asset: def.asset === undefined ? undefined : assetRefOf(def.asset),
      play:
        def.play === undefined
          ? undefined
          : (ctx, destination) => void def.play!(ctx as unknown as GameAudioContextLike, destination, def),
      loop: def.loop,
      volumeDb: def.volume === undefined ? undefined : gainToDb(def.volume),
      spatial: def.position !== undefined,
      // The legacy surface plays on every `cue()` call — no anti-hammer cooldown.
      cooldownMs: 0
    };
  }

  // Volumes for route buses double as evidence truth (target gain — the doc on
  // GameAudioBusLevel says "not metered loudness") and feed the engine at build.
  const busVolumes = new Map<GameAudioBusId, number>();
  const mutedBuses = new Set<GameAudioBusId>();
  const liveVoices = new Map<TCue, Set<LiveVoiceHandle>>();
  let engine: ReturnType<typeof gameSoundSlot.stub> | undefined;

  // I1 positional state: listener pose, recently played nodes, ducking, footsteps.
  let listenerPosition: GameAudioVec3 = { x: 0, y: 0, z: 0 };
  // Orientation survives position-only updates (it used to be hard-coded).
  let listenerForward: readonly [number, number, number] = [0, 0, -1];
  let listenerUp: readonly [number, number, number] = [0, 1, 0];
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
    if (context === undefined) context = contextManager ? (contextManager.context as unknown as GameAudioContextLike) : options.createContext?.() ?? null;
    return context ?? null;
  };

  const getEngine = (): ReturnType<typeof createGameSoundEngine> | null => {
    if (disposed) return null;
    const audioContext = getContext();
    if (!audioContext) return null;
    if (!engine) {
      const initialVolumes: Partial<Record<GameBusId, number>> = {};
      for (const [busId, volume] of busVolumes) {
        const target = volumeTargetOf(busId);
        if (target !== "route") initialVolumes[target] = volume;
      }
      // C-25: flag on resolves through the contract slot (real engine iff
      // lane prd09 provided it, else the silent stub — 09-CONF real-or-stub
      // by flag). Flag off keeps the shipped legacy path, which has always
      // played through the real game-sound engine: routing it to the silent
      // stub (#712) muted every flag-off route (flag-off output must not change).
      const factory = qrGameOn ? gameSoundSlot.get(qrFlags) : createGameSoundEngine;
      engine = factory({
        context: audioContext as unknown as SoundGraphContext,
        cues: engineCues,
        buses: initialVolumes
      });
      if (muted) engine.setMuted(true);
    }
    return engine;
  };

  const getBus = (id: GameAudioBusId): GameAudioBusState => {
    const existing = buses.get(id);
    if (existing) return existing;
    const bus: GameAudioBusState = { id, engineBus: engineBusOf(id) };
    buses.set(id, bus);
    return bus;
  };

  getBus("master");
  for (const bus of options.buses ?? []) {
    const state = getBus(bus.id);
    if (bus.volume === undefined) continue;
    busVolumes.set(state.id, bus.volume);
    // Engine buses get the level immediately (otherwise it seeds construction);
    // route-local volumes apply per voice when their cues play.
    const target = volumeTargetOf(state.id);
    if (target !== "route") getEngine()?.setBusVolume(target, bus.volume);
  }

  const busVolumeOf = (bus: GameAudioBusState): number => busVolumes.get(bus.id) ?? 1;
  const busMutedOf = (bus: GameAudioBusState): boolean => mutedBuses.has(bus.id);

  /** Per-cue level set by `setCueLevel` (linear, 1 = authored). */
  const cueLevels = new Map<TCue, number>();
  /** Linear gain a cue's voices get on top of the authored volume: route-bus volume × cue level. */
  const voiceLevelOf = (cue: TCue): number => {
    const busId = cueDefinitions[cue]?.bus ?? "master";
    const routeBus = volumeTargetOf(busId) === "route" ? busVolumes.get(busId) ?? 1 : 1;
    return routeBus * (cueLevels.get(cue) ?? 1);
  };
  const writeBusVolume = (bus: GameAudioBusState, volume: number): void => {
    busVolumes.set(bus.id, volume);
    const target = volumeTargetOf(bus.id);
    if (target !== "route") {
      getEngine()?.setBusVolume(target, volume);
      return;
    }
    for (const id of cueIds) {
      if ((cueDefinitions[id].bus ?? "master") !== bus.id) continue;
      for (const voice of pruneEnded(id)) voice.setLevel?.({ gain: voiceLevelOf(id) }, 50);
    }
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
    if (!audioContext || disposed || muted || busMuted || engineCues[cue] === undefined) {
      suppressedCueCount += 1;
      return event;
    }
    // A looping cue that is already playing keeps its one voice: re-cueing it
    // (race restart, wave start, scene re-entry) used to stack another loop
    // on top every time — the layered drones read as a permanent buzz.
    if (definition.loop) {
      const live = pruneEnded(cue);
      if (live.size > 0) {
        suppressedCueCount += 1;
        return event;
      }
    }
    try {
      if (!unlocked) await audio.unlock();
      const sound = getEngine();
      const handle = sound?.play(cue, {
        position: spatial?.position ?? definition.position,
        velocity: spatial?.velocity,
        volumeDb: gainToDb(voiceLevelOf(cue))
      });
      if (!handle) {
        suppressedCueCount += 1;
        return event;
      }
      pruneEnded(cue).add(handle);
      playedCueCount += 1;
      // Only actually-played cues become playing nodes — suppressed cues stay out (no silent-play claim).
      const position = spatial?.position ?? definition.position ?? listenerPosition;
      const occlusion = spatial?.occlusion ?? definition.occlusion ?? 0;
      const resolvedOcclusion = validateOcclusion(occlusion, "cue occlusion");
      handle.setOcclusion(resolvedOcclusion);
      recordPlayingNode(cue, bus.id, position, spatial?.velocity, resolvedOcclusion, event.time);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      suppressedCueCount += 1;
    }
    return event;
  };

  /** Drop finished voices from the live set of a cue and return it. */
  function pruneEnded(cue: TCue): Set<LiveVoiceHandle> {
    const voices = liveVoices.get(cue) ?? new Set<LiveVoiceHandle>();
    for (const v of voices) if (v.ended === true) voices.delete(v);
    liveVoices.set(cue, voices);
    return voices;
  }

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
      await getEngine()?.unlock();
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
      getEngine()?.setListener({
        position: [position.x, position.y, position.z],
        forward: [...listenerForward],
        up: [...listenerUp]
      });
      return snapshot();
    },
    setListener(pose) {
      const tuple = (v: readonly number[] | undefined, label: string, nonZero: boolean): [number, number, number] => {
        if (!v || v.length !== 3 || !v.every(Number.isFinite)) {
          throw new Error(`Game audio listener ${label} must be three finite numbers.`);
        }
        if (nonZero && Math.hypot(v[0], v[1], v[2]) < 1e-9) {
          throw new Error(`Game audio listener ${label} must be non-zero.`);
        }
        return [v[0], v[1], v[2]];
      };
      const position = tuple(pose?.position, "position", false);
      listenerForward = tuple(pose?.forward, "forward", true);
      listenerUp = tuple(pose?.up, "up", true);
      listenerPosition = { x: position[0], y: position[1], z: position[2] };
      getEngine()?.setListener({ position, forward: [...listenerForward], up: [...listenerUp] });
      return snapshot();
    },
    setCueLevel(cue, level, rampMs = 60) {
      const volume = level.volume === undefined ? undefined : Math.max(0, Math.min(4, Number(level.volume) || 0));
      const rate = level.rate === undefined ? undefined : Math.max(0.0625, Math.min(4, Number(level.rate) || 1));
      if (volume !== undefined) cueLevels.set(cue, volume);
      const gain = volume === undefined ? undefined : voiceLevelOf(cue);
      for (const voice of pruneEnded(cue)) voice.setLevel?.({ gain, rate }, rampMs);
      return snapshot();
    },
    stopCue(cue, fadeMs = 80) {
      for (const voice of pruneEnded(cue)) voice.stop(fadeMs);
      liveVoices.delete(cue);
      return snapshot();
    },
    setOcclusion(cue, amount) {
      const resolved = validateOcclusion(amount, "occlusion amount");
      for (const node of playingNodes) {
        if (node.cue === cue) node.occlusion = resolved;
      }
      for (const voice of liveVoices.get(cue) ?? []) {
        voice.setOcclusion(resolved);
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
      engine?.setMuted(value);
      return snapshot();
    },
    setBusVolume(busId, volume) {
      if (!Number.isFinite(volume) || volume < 0) throw new Error("Game audio bus volume must be a non-negative finite number.");
      const bus = getBus(busId);
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
    recordMaster(seconds) {
      return getEngine()?.recordMaster?.(seconds) ?? Promise.resolve(null);
    },
    async dispose() {
      disposed = true;
      engine?.dispose();
      liveVoices.clear();
      playingNodes.length = 0;
      if (contextManager) await contextManager.dispose();
      else if (context?.close) await context.close();
      return snapshot();
    }
  };

  return audio;
}
