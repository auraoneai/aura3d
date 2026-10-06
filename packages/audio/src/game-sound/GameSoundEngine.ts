/**
 * game-sound/GameSoundEngine.ts — `createGameSoundEngine` per §7.5.
 *
 * Graph:
 *   voices/loops/stingers ─► [spatial + cue gain] ─► bus gain ─► master chain ─► destination
 *                                                       └─► reverb send ─┘
 *
 * `proof()` reads only LIVE node state — bus gain `.value`s, context.state,
 * voice counts from the pool — never remembered inputs.
 */

import { mulberry32 } from "./rng";
import { AudioContextManager } from "../AudioContextManager";
import { createMasterChain } from "./MasterChain";
import { VoicePool, type VoiceCueSpec, type VoiceRecord } from "./Voice";
import { createSpatialNode, type SpatialNode } from "./SpatialVoice";
import { LoopHandleImpl } from "./LoopHandle";
import { createEngineLoop, type EngineLoopHandleImpl, type EngineLayerSpec } from "./EngineLoop";
import { MusicControllerImpl, type MusicTrackSpec } from "./MusicController";
import { createReverbSend, type QualityTier, type ReverbPreset } from "./ReverbSend";
import { syncListener, type ListenerLike } from "./listenerSync";
import { clamp } from "./types";
import type { SoundGraphContext, SoundNodeLike, Vec3 } from "./types";

export type GameBusId = "master" | "music" | "sfx" | "ui" | "ambience" | "voice";
const BUS_IDS: readonly Exclude<GameBusId, "master">[] = ["music", "sfx", "ui", "ambience", "voice"];

export interface AudioAssetRef {
  readonly url: string;
  readonly hash?: string;
  readonly license?: string;
  readonly provenance?: "sample" | "synth";
  /** Pre-decoded buffer — skips the fetch/decode path (already-loaded clips). */
  readonly buffer?: AudioBuffer;
}

export interface SoundCueSpec extends VoiceCueSpec {
  readonly asset?: AudioAssetRef | readonly AudioAssetRef[];
  readonly play?: (ctx: BaseAudioContext, destination: AudioNode) => void;
  readonly spatial?: boolean | { readonly refDistance?: number; readonly maxDistance?: number; readonly rolloff?: number };
}

export interface EngineLoopSpec {
  readonly onLoad: readonly EngineLayerSpec[];
  readonly offLoad?: readonly EngineLayerSpec[];
  readonly idleRpm: number;
  readonly maxRpm: number;
  readonly bus?: GameBusId;
}

export interface GameSoundOptions<TCue extends string> {
  readonly cues: Readonly<Record<TCue, SoundCueSpec>>;
  readonly buses?: Partial<Record<GameBusId, number>>;
  readonly music?: { readonly tracks: Readonly<Record<string, MusicTrackSpec>>; readonly initial?: string };
  readonly reverb?: ReverbPreset;
  readonly master?: { readonly glue?: boolean; readonly limiterCeilingDb?: number };
  readonly tier?: QualityTier;
  readonly seed?: number;
  readonly context?: SoundGraphContext;
  readonly voiceCap?: number;
}

const VOICE_CAPS: Record<QualityTier, number> = { low: 12, medium: 24, high: 32, ultra: 48 };
const HRTF_CAP: Record<QualityTier, number> = { low: 0, medium: 4, high: 8, ultra: 16 };

export function createGameSoundEngine<TCue extends string>(options: GameSoundOptions<TCue>) {
  for (const [id, cue] of Object.entries(options.cues as Record<string, SoundCueSpec | undefined>)) {
    if (!cue || (!cue.asset && !cue.play)) {
      throw new Error(
        `Game audio cue "${id}" has no asset or play(); synthesized default cues were removed (PRD 09).`
      );
    }
  }

  const tier = options.tier ?? "high";
  // Context ownership (WS-3.2): constructing contexts is owned by the
  // AudioContextManager alone; callers may inject one via `options.context`.
  const ctx: SoundGraphContext =
    options.context ??
    (() => {
      try {
        return new AudioContextManager().context as unknown as SoundGraphContext;
      } catch {
        return fakeHeadlessContext();
      }
    })();
  const rng = mulberry32(options.seed ?? 1);
  const chain = createMasterChain(ctx, ctx.destination, options.master);
  const pool = new VoicePool({
    ctx,
    rng,
    voiceCap: options.voiceCap ?? VOICE_CAPS[tier],
    bufferFor: (url) => buffers.get(url)
  });

  // ---- buffers -------------------------------------------------------------
  const buffers = new Map<string, AudioBuffer>();
  const pending = new Map<string, Promise<AudioBuffer | undefined>>();
  const errors: string[] = [];
  const loadAsset = (url: string): Promise<AudioBuffer | undefined> => {
    if (buffers.has(url)) return Promise.resolve(buffers.get(url));
    let p = pending.get(url);
    if (!p) {
      if (typeof ctx.decodeAudioData !== "function" || typeof fetch !== "function") {
        return Promise.resolve(undefined);
      }
      p = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((data) => ctx.decodeAudioData!(data))
        .then((buf) => {
          buffers.set(url, buf);
          return buf;
        })
        .catch((e: Error) => {
          errors.push(`decode ${url}: ${e.message}`);
          return undefined;
        });
      pending.set(url, p);
    }
    return p;
  };
  // Eagerly kick off cue asset loads.
  for (const cue of Object.values(options.cues as Record<string, SoundCueSpec | undefined>)) {
    const assets = cue?.asset ? (Array.isArray(cue.asset) ? cue.asset : [cue.asset]) : [];
    for (const a of assets) void loadAsset(a.url);
  }

  // ---- buses ---------------------------------------------------------------
  const busGains = new Map<Exclude<GameBusId, "master">, SoundNodeLike>();
  for (const bus of BUS_IDS) {
    const gain = ctx.createGain() as unknown as SoundNodeLike;
    const v = options.buses?.[bus];
    (gain as unknown as { gain: { value: number } }).gain.value = v === undefined ? 1 : clamp(v, 0, 1);
    gain.connect(chain.input as unknown as SoundNodeLike);
    busGains.set(bus, gain);
  }

  // ---- reverb send ---------------------------------------------------------
  const reverb = createReverbSend({
    ctx,
    preset: options.reverb ?? "none",
    tier,
    bufferFor: (url) => buffers.get(url)
  }) as ReturnType<typeof createReverbSend> & {
    sendTail?: SoundNodeLike;
    setIrBuffer?: (b: AudioBuffer) => void;
  };
  if (reverb.enabled && reverb.sendInput && reverb.sendTail) {
    for (const bus of BUS_IDS) {
      const tap = ctx.createGain() as unknown as SoundNodeLike;
      (tap as unknown as { gain: { value: number } }).gain.value = 0.2;
      busGains.get(bus)!.connect(tap);
      tap.connect(reverb.sendInput);
    }
    reverb.sendTail.connect(chain.input as unknown as SoundNodeLike);
    const ext = (options as { irExtension?: string }).irExtension ?? "opus.webm";
    const url = `assets/ir/${options.reverb}.${ext}`;
    void loadAsset(url).then((buf) => buf && reverb.setIrBuffer?.(buf));
  }

  // ---- voices --------------------------------------------------------------
  const spatialOf = (cue: SoundCueSpec, position?: Vec3): SpatialNode | undefined => {
    if (!cue.spatial && position === undefined) return undefined;
    const s = cue.spatial === true ? {} : cue.spatial || {};
    const node = createSpatialNode({
      ctx,
      panningModel: HRTF_CAP[tier] > 0 ? "HRTF" : "equalpower",
      refDistance: s.refDistance,
      maxDistance: s.maxDistance,
      rolloff: s.rolloff
    });
    if (position !== undefined) node.setPosition(position);
    return node;
  };

  const busInput = (bus: string): SoundNodeLike =>
    busGains.get((bus as Exclude<GameBusId, "master">)) ?? busGains.get("sfx")!;

  const startLoopVoice = (
    cueId: string,
    cue: SoundCueSpec | VoiceCueSpec,
    input: SoundNodeLike
  ): VoiceRecord => {
    const record = pool.allocate(cueId, cue, input, { loop: true }).record;
    if (!record) throw new Error(`Engine loop voice for "${cueId}" was dropped at cap`);
    record.source.start();
    return record;
  };

  const handles = new Set<LoopHandleImpl>();
  let muted = false;
  let voicesPlayed = 0;

  const play = (
    cueId: string,
    opts: { position?: Vec3; velocity?: Vec3; volumeDb?: number; rate?: number } = {}
  ) => {
    if (muted) return null;
    const cue = options.cues[cueId as TCue];
    if (!cue) return null;
    const spatial = spatialOf(cue, opts.position);
    if (spatial && opts.velocity) spatial.setVelocity(opts.velocity);
    const input = spatial ? spatial.input : busInput(cue.bus);
    if (spatial) {
      const tail = spatial.occlusionFilter;
      (tail as { connect(d: SoundNodeLike): unknown }).connect(busInput(cue.bus));
    }
    // Synth cues (C-25 `play` callback) render directly into the bus — the
    // buffer-voice path has nothing to allocate.
    if (cue.asset === undefined && cue.play !== undefined) {
      cue.play(ctx as unknown as BaseAudioContext, input as unknown as AudioNode);
      voicesPlayed += 1;
      return {
        id: -1,
        stop: () => {},
        setPosition: (p: Vec3) => spatial?.setPosition(p),
        setOcclusion: (a: number) => spatial?.setOcclusion(a)
      };
    }
    const allocation = pool.allocate(cueId, cue as VoiceCueSpec, input, opts);
    if (allocation.dropped || !allocation.record) return null;
    const record = allocation.record;
    voicesPlayed += 1;
    record.source.start();
    return {
      id: record.id,
      stop: (fadeMs = 0) => {
        const g = (record.gain as unknown as { gain: { value: number; setTargetAtTime?(v: number, t: number, tau: number): void } }).gain;
        if (fadeMs > 0 && g.setTargetAtTime) {
          g.setTargetAtTime(0, ctx.currentTime, fadeMs / 3000);
          setTimeout(() => pool.release(record), fadeMs + 30).unref?.();
        } else {
          pool.release(record);
        }
      },
      setPosition: (p: Vec3) => spatial?.setPosition(p),
      setOcclusion: (a: number) => spatial?.setOcclusion(a)
    };
  };

  const loop = (
    cueId: string,
    opts: { position?: Vec3; fadeInMs?: number } = {}
  ): LoopHandleImpl | null => {
    if (muted) return null;
    const cue = options.cues[cueId as TCue];
    if (!cue) return null;
    const spatial = spatialOf(cue, opts.position);
    const input = spatial ? spatial.input : busInput(cue.bus);
    if (spatial) spatial.occlusionFilter.connect(busInput(cue.bus));
    const allocation = pool.allocate(cueId, cue as VoiceCueSpec, input, { loop: true });
    if (allocation.dropped || !allocation.record) return null;
    allocation.record.source.start();
    const handle = new LoopHandleImpl(
      ctx,
      allocation.record,
      spatial,
      (r) => pool.release(r)
    );
    handles.add(handle);
    if (opts.fadeInMs) {
      handle.setGain(-60);
      handle.setGain(cue.volumeDb ?? 0, opts.fadeInMs);
    }
    voicesPlayed += 1;
    return handle;
  };

  const engine = (
    spec: EngineLoopSpec | { cue: TCue; rpmRange: readonly [number, number]; pitchRange: readonly [number, number] }
  ): EngineLoopHandleImpl => {
    if ("cue" in spec) {
      // C-25 shorthand: one cue asset, pitch by rpm fraction.
      const cue = options.cues[spec.cue];
      if (!cue) throw new Error(`Unknown engine cue "${String(spec.cue)}"`);
      const asset = Array.isArray(cue.asset) ? cue.asset[0] : cue.asset;
      const layer: EngineLayerSpec = { asset: asset as { url: string }, rpm: spec.rpmRange[0] };
      return createEngineLoop({
        ctx,
        onLoad: [layer],
        idleRpm: spec.rpmRange[0],
        maxRpm: spec.rpmRange[1],
        busInput: busInput(cue.bus),
        spatial: undefined,
        pool,
        bufferFor: (url) => buffers.get(url),
        startVoice: (_b, input) => startLoopVoice(String(spec.cue), cue, input)
      });
    }
    const spatial = createSpatialNode({ ctx, panningModel: HRTF_CAP[tier] > 0 ? "HRTF" : "equalpower" });
    spatial.occlusionFilter.connect(busInput(spec.bus ?? "sfx"));
    return createEngineLoop({
      ctx,
      onLoad: spec.onLoad,
      offLoad: spec.offLoad,
      idleRpm: spec.idleRpm,
      maxRpm: spec.maxRpm,
      busInput: busInput(spec.bus ?? "sfx"),
      spatial,
      pool,
      bufferFor: (url) => buffers.get(url),
      startVoice: (_b, input) =>
        startLoopVoice("_engine", { bus: "sfx", priority: "normal" }, input)
    });
  };

  const music = new MusicControllerImpl({
    ctx,
    output: busInput("music"),
    tracks: options.music?.tracks ?? {},
    bufferFor: (url) => buffers.get(url),
    createMediaElement:
      typeof Audio !== "undefined" ? (url) => new Audio(url) : undefined,
    playCue: (cue) => {
      play(cue);
    }
  });
  if (options.music?.initial) music.play(options.music.initial);

  // ---- unlock --------------------------------------------------------------
  let readyResolve!: () => void;
  const ready = new Promise<void>((resolve) => (readyResolve = resolve));
  let unlockArmed = false;
  const unlock = async () => {
    if (unlockArmed) return;
    unlockArmed = true;
    const resume = async () => {
      try {
        await ctx.resume();
      } catch {
        /* ctx may not need resuming */
      }
      readyResolve();
    };
    if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
      const once = { once: true, passive: true } as const;
      for (const ev of ["pointerdown", "keydown", "touchend"]) {
        document.addEventListener(ev, () => void resume(), once);
      }
    }
    await resume();
  };
  void unlock; // armed lazily by callers (title screen doubles as gesture)

  const setListener = (pose: { position: Vec3; forward: Vec3; up: Vec3 }) => {
    const listener = (ctx as unknown as { listener?: ListenerLike }).listener;
    if (listener) syncListener(listener, ctx.currentTime, pose);
  };

  const setBusVolume = (bus: GameBusId, v: number) => {
    if (bus === "master") {
      chain.setMasterGain(v);
      return;
    }
    const g = busGains.get(bus) as unknown as { gain: { value: number } } | undefined;
    if (g) g.gain.value = clamp(v, 0, 1);
  };

  let duckT: ReturnType<typeof setTimeout> | undefined;
  const duck = (bus: GameBusId, ratio: number, ms: number) => {
    const g = busGains.get(bus as Exclude<GameBusId, "master">) as unknown as {
      gain: { value: number; setTargetAtTime?(v: number, t: number, tau: number): void };
    } | undefined;
    if (!g) return;
    const now = ctx.currentTime;
    const from = g.gain.value;
    g.gain.setTargetAtTime
      ? g.gain.setTargetAtTime(from * clamp(ratio, 0, 1), now, ms / 3000)
      : (g.gain.value = from * clamp(ratio, 0, 1));
    if (duckT) clearTimeout(duckT);
    duckT = setTimeout(() => {
      g.gain.setTargetAtTime
        ? g.gain.setTargetAtTime(from, ctx.currentTime, 0.05)
        : (g.gain.value = from);
    }, ms);
    duckT.unref?.();
  };

  return {
    ready,
    unlock,
    play,
    loop,
    engine,
    music,
    setListener,
    setBusVolume,
    setMuted(m: boolean) {
      muted = m;
      chain.setMasterGain(m ? 0 : 1);
    },
    duck,
    suspend: async () => {
      await ctx.suspend();
    },
    resume: async () => {
      await ctx.resume();
    },
    proof() {
      const busValues: Record<string, number> = {};
      for (const [id, g] of busGains) {
        busValues[id] = (g as unknown as { gain: { value: number } }).gain.value;
      }
      const cues = Object.values(options.cues as Record<string, SoundCueSpec | undefined>);
      return {
        contextState: String(ctx.state),
        voicesPlayed,
        liveVoices: pool.liveCount,
        poolStats: pool.stats,
        buses: busValues,
        assetCues: cues.filter((c) => c?.asset !== undefined).length,
        synthCues: cues.filter((c) => !c?.asset && c?.play !== undefined).length,
        limiterEngaged: chain.limiterEngaged,
        stages: [...chain.stages],
        tier,
        errors: [...errors]
      };
    },
    dispose() {
      pool.releaseAll();
      for (const h of handles) {
        if (!h.ended) h.stop(0);
      }
      music.dispose();
      reverb.dispose();
      chain.dispose();
      if (duckT) clearTimeout(duckT);
    }
  };
}

/** Last-resort context for headless runs — every factory no-ops. */
const fakeHeadlessContext = (): SoundGraphContext => {
  const param = () => ({ value: 0, setTargetAtTime: () => undefined });
  const node = (): SoundNodeLike & Record<string, unknown> => {
    const n: SoundNodeLike & Record<string, unknown> = {
      connect: (d: SoundNodeLike) => d,
      disconnect: () => undefined
    };
    n.gain = param();
    n.frequency = param();
    return n;
  };
  return {
    state: "running",
    currentTime: 0,
    destination: node() as unknown as AudioNode,
    resume: async () => undefined,
    suspend: async () => undefined,
    close: async () => undefined,
    createGain: () => node() as unknown as GainNode,
    createBufferSource: () =>
      ({
        ...node(),
        buffer: null,
        loop: false,
        playbackRate: param(),
        start: () => undefined,
        stop: () => undefined
      }) as unknown as AudioBufferSourceNode,
    createPanner: () => node() as unknown as PannerNode,
    createBiquadFilter: () => node() as unknown as BiquadFilterNode,
    createConvolver: () => node() as unknown as ConvolverNode
  };
};
