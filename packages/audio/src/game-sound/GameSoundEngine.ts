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
import { AudioFileManager, type AudioDecodeContextLike, type AudioFileRequest } from "../AudioFileManager";
import { createMasterChain } from "./MasterChain";
import { VoicePool, type VoiceCueSpec, type VoiceRecord } from "./Voice";
import { createSpatialNode, type SpatialNode } from "./SpatialVoice";
import { LoopHandleImpl } from "./LoopHandle";
import { createEngineLoop, type EngineLoopHandleImpl, type EngineLayerSpec } from "./EngineLoop";
import { MusicControllerImpl, type MusicTrackSpec } from "./MusicController";
import { createReverbSend, type QualityTier, type ReverbPreset } from "./ReverbSend";
import { formatExtension, probeFormat, type EncodedFormat } from "./formatProbe";
import { syncListener, type ListenerLike } from "./listenerSync";
import { clamp, dbToGain } from "./types";
import type { SoundGraphContext, SoundNodeLike, Vec3 } from "./types";

export type GameBusId = "master" | "music" | "sfx" | "ui" | "ambience" | "voice";
const BUS_IDS: readonly Exclude<GameBusId, "master">[] = ["music", "sfx", "ui", "ambience", "voice"];

/** Transport policy is snapshotted before a cue begins asynchronous work. */
export type GameSoundRequest = Omit<AudioFileRequest, "input">;

export interface AudioAssetRef {
  readonly url: string;
  readonly id?: string;
  readonly kind?: string;
  readonly type?: string;
  readonly format?: string;
  readonly hash?: string;
  readonly sha256?: string;
  readonly integrity?: AudioFileRequest["integrity"];
  readonly sizeBytes?: number;
  readonly securityContext?: string;
  readonly license?: string;
  readonly provenance?: "sample" | "synth";
  readonly request?: GameSoundRequest;
  /** Encoded-byte digests for a URL containing `{format}`. */
  readonly variantHashes?: Readonly<Partial<Record<"opus.webm" | "m4a", string>>>;
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
  /** Default asset transport policy; a cue asset may override individual fields. */
  readonly request?: GameSoundRequest;
  /** Base URL of the 20 ms format probes; default "assets/probes/". */
  readonly probeBase?: string;
  /** Override fetch for probes (testing). */
  readonly fetchProbe?: (url: string) => Promise<ArrayBuffer>;
}

export type GameSoundPlayOptions = { position?: Vec3; velocity?: Vec3; volumeDb?: number; rate?: number };
type PlayOptions = GameSoundPlayOptions;
/** Handle returned by `play()`: a live voice (or a loop waiting for its buffer). */
export interface GameSoundPlayHandle {
  readonly id: number;
  readonly ended?: boolean;
  /** Present while loading; resolves only after a voice actually starts or fails. */
  readonly started?: Promise<boolean>;
  setLevel?(level: { gain?: number; rate?: number }, rampMs?: number): void;
  stop(fadeMs?: number): void;
  setPosition(p: Vec3): void;
  setOcclusion(a: number): void;
}
type PlayHandle = GameSoundPlayHandle;

const VOICE_CAPS: Record<QualityTier, number> = { low: 12, medium: 24, high: 32, ultra: 48 };
const HRTF_CAP: Record<QualityTier, number> = { low: 0, medium: 4, high: 8, ultra: 16 };
const MAX_AUDIO_DIAGNOSTICS = 32;
const SHA256 = /^(?:sha256[:-])?([a-f0-9]{64})$/i;

/** Copy mutable request fields while the caller's generation is still current. */
function snapshotRequest(request: GameSoundRequest | undefined): GameSoundRequest {
  if (!request) return {};
  const integrity = request.integrity;
  const source = request.headers;
  const allowedOrigins = request.allowedOrigins;
  if (source !== undefined && typeof Headers !== "function") throw new Error("Audio headers are unavailable");
  let headers: Headers | undefined;
  if (source !== undefined) {
    // Foreign-realm Headers need not pass instanceof checks in this realm.
    // Copy their entries explicitly instead of treating them as a plain object.
    if (!Array.isArray(source) && typeof (source as Headers).forEach === "function") {
      const entries: [string, string][] = [];
      (source as Headers).forEach((value, key) => entries.push([key, value]));
      headers = new Headers(entries);
    } else headers = new Headers(source);
  }
  const fields: Record<string, unknown> = {};
  for (const key of ["signal", "cacheKey", "name", "credentials", "cache", "mode", "redirect", "referrer",
    "referrerPolicy", "priority", "expectedHash", "sourceOrigin", "expectedUrl", "maxBytes", "securityContext",
    "baseURL", "onProgress"] as const) {
    const value = request[key];
    if (value !== undefined) fields[key] = value;
  }
  return {
    ...fields,
    ...(headers === undefined ? {} : { headers }),
    ...(allowedOrigins === undefined ? {} : { allowedOrigins: [...allowedOrigins] }),
    ...(integrity === undefined ? {} : { integrity: integrity && typeof integrity === "object" ? {
      ...integrity, ...(integrity.dependencies ? { dependencies: { ...integrity.dependencies } } : {})
    } : integrity })
  } as GameSoundRequest;
}

function snapshotAsset(asset: AudioAssetRef): AudioAssetRef {
  const integrity = asset.integrity;
  return {
    ...asset,
    url: asset.url,
    ...(asset.id === undefined ? {} : { id: asset.id }),
    ...(asset.kind === undefined ? {} : { kind: asset.kind }),
    ...(asset.type === undefined ? {} : { type: asset.type }),
    ...(asset.format === undefined ? {} : { format: asset.format }),
    ...(asset.hash === undefined ? {} : { hash: asset.hash }),
    ...(asset.sha256 === undefined ? {} : { sha256: asset.sha256 }),
    ...(asset.sizeBytes === undefined ? {} : { sizeBytes: asset.sizeBytes }),
    ...(asset.securityContext === undefined ? {} : { securityContext: asset.securityContext }),
    ...(asset.license === undefined ? {} : { license: asset.license }),
    ...(asset.provenance === undefined ? {} : { provenance: asset.provenance }),
    ...(asset.buffer === undefined ? {} : { buffer: asset.buffer }),
    ...(asset.request ? { request: snapshotRequest(asset.request) } : {}),
    ...(asset.variantHashes ? { variantHashes: { ...asset.variantHashes } } : {}),
    ...(integrity === undefined ? {} : { integrity: integrity && typeof integrity === "object" ? {
      ...integrity, ...(integrity.dependencies ? { dependencies: { ...integrity.dependencies } } : {})
    } : integrity })
  };
}

function digestOf(value: string | undefined, required: boolean): string | undefined {
  if (value === undefined) return undefined;
  const match = SHA256.exec(value.trim());
  if (!match && required) throw new Error("Invalid audio SHA-256 digest");
  return match?.[1].toLowerCase();
}

function integrityDigest(value: AudioFileRequest["integrity"]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return digestOf(value, true);
  if (!value || value.version !== 1 || typeof value.digest !== "string") throw new Error("Invalid audio integrity metadata");
  if (value.requireDependencies || (value.dependencies && Object.keys(value.dependencies).length > 0)) {
    throw new Error("Audio integrity dependencies are unsupported");
  }
  return digestOf(value.digest, true);
}

function isAbort(error: unknown): boolean {
  try { return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"; }
  catch { return false; }
}

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
        return AudioContextManager.shared().context as unknown as SoundGraphContext;
      } catch {
        return fakeHeadlessContext();
      }
    })();
  const rng = mulberry32(options.seed ?? 1);
  const chain = createMasterChain(ctx, ctx.destination, options.master);
  const errors: string[] = [];
  const lifetime = new AbortController();
  const pendingLoads = new Set<AbortController>();
  let disposed = false;
  let generation = 0;
  let defaultRequest: GameSoundRequest;
  const cueSpecs: Record<string, SoundCueSpec> = Object.create(null) as Record<string, SoundCueSpec>;
  try {
    defaultRequest = snapshotRequest(options.request);
    for (const [id, cue] of Object.entries(options.cues as Record<string, SoundCueSpec>)) {
      const asset = cue.asset;
      cueSpecs[id] = {
        ...cue,
        ...(asset === undefined ? {} : { asset: Array.isArray(asset)
          ? asset.map((entry) => snapshotAsset(entry))
          : snapshotAsset(asset as AudioAssetRef) })
      };
    }
  } catch {
    chain.dispose();
    throw new Error("Invalid game audio asset or request policy");
  }
  const assetCueCount = Object.values(cueSpecs).filter((cue) => cue.asset !== undefined).length;
  const synthCueCount = Object.values(cueSpecs).filter((cue) => cue.asset === undefined && cue.play !== undefined).length;
  let fetchProbe = options.fetchProbe;
  let probeBase = options.probeBase;
  let securityContext = defaultRequest.securityContext;
  const fileManager = typeof ctx.decodeAudioData === "function"
    ? new AudioFileManager({ context: ctx as AudioDecodeContextLike })
    : undefined;

  // A plan is keyed by the authored asset object, never by its URL. The file
  // manager owns all reusable decoded data and its request-policy identity.
  interface AssetPlan {
    readonly asset: AudioAssetRef;
    readonly localRequest: GameSoundRequest;
    resolved?: { readonly url: string; readonly extension?: "opus.webm" | "m4a" };
  }
  const plans = new WeakMap<object, AssetPlan>();
  const planFor = (asset: AudioAssetRef): AssetPlan => {
    let plan = plans.get(asset);
    if (!plan) {
      const snap = snapshotAsset(asset);
      plan = { asset: snap, localRequest: snapshotRequest(snap.request) };
      plans.set(asset, plan);
    }
    return plan;
  };
  const diagnostic = (code: string): void => {
    if (disposed) return;
    if (errors.length >= MAX_AUDIO_DIAGNOSTICS) errors.shift();
    errors.push(code);
  };
  const FORMAT_TOKEN = "{format}";
  let probedExt: Promise<"opus.webm" | "m4a"> | undefined;
  const resolveExtension = (): Promise<"opus.webm" | "m4a"> => {
    if (!probedExt) {
      probedExt = probeFormat({
        decodeAudioData: (data) => {
          if (disposed) return Promise.reject(abortError());
          return ctx.decodeAudioData!(data);
        },
        fetchProbe: async (url) => {
          if (disposed) throw abortError();
          const reader = fetchProbe;
          const data = reader ? await reader(url) : await fetch(url).then((response) => {
            if (!response.ok) throw new Error("Audio format probe failed");
            return response.arrayBuffer();
          });
          if (disposed) throw abortError();
          return data;
        },
        probeBase
      }).then((format: EncodedFormat) => formatExtension(format) as "opus.webm" | "m4a")
        .catch(() => "m4a" as const);
    }
    return probedExt;
  };
  const abortError = (): Error => typeof DOMException === "undefined"
    ? Object.assign(new Error("Audio load cancelled"), { name: "AbortError" })
    : new DOMException("Audio load cancelled", "AbortError");
  const waitFor = <T>(pending: Promise<T>, signal: AbortSignal): Promise<T> => new Promise<T>((resolve, reject) => {
    let done = false;
    const finish = (callback: () => void): void => {
      if (done) return;
      done = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = (): void => finish(() => reject(abortError()));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    pending.then((value) => finish(() => resolve(value)), (error: unknown) => finish(() => reject(error)));
  });
  const linkSignals = (signals: readonly (AbortSignal | undefined)[]): { signal: AbortSignal; dispose(): void } => {
    const controller = new AbortController();
    const listeners: Array<readonly [AbortSignal, () => void]> = [];
    const dispose = (): void => {
      for (const [signal, listener] of listeners) signal.removeEventListener("abort", listener);
      listeners.length = 0;
    };
    for (const signal of new Set(signals.filter((item): item is AbortSignal => item !== undefined))) {
      const abort = (): void => { if (!controller.signal.aborted) controller.abort(); dispose(); };
      if (signal.aborted) { abort(); break; }
      listeners.push([signal, abort]);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) { abort(); break; }
    }
    return { signal: controller.signal, dispose };
  };
  const policyFor = (plan: AssetPlan): GameSoundRequest => {
    const local = plan.localRequest;
    const hasHeaders = defaultRequest.headers !== undefined || local.headers !== undefined;
    if (hasHeaders && typeof Headers !== "function") throw new Error("Audio headers are unavailable");
    const headers = hasHeaders ? new Headers(defaultRequest.headers) : undefined;
    if (local.headers !== undefined) new Headers(local.headers).forEach((value, key) => headers!.set(key, value));
    const allowedOrigins = defaultRequest.allowedOrigins && local.allowedOrigins
      ? defaultRequest.allowedOrigins.filter((origin) => local.allowedOrigins!.includes(origin))
      : local.allowedOrigins ?? defaultRequest.allowedOrigins;
    if (defaultRequest.expectedUrl !== undefined && local.expectedUrl !== undefined && defaultRequest.expectedUrl !== local.expectedUrl) {
      throw new Error("Conflicting audio expected URLs");
    }
    const selectedContext = plan.asset.securityContext ?? local.securityContext ?? securityContext;
    const result: GameSoundRequest = {
      ...defaultRequest, ...local, ...(headers ? { headers } : {}),
      ...(allowedOrigins === undefined ? {} : { allowedOrigins: [...allowedOrigins] }),
      ...(defaultRequest.maxBytes !== undefined && local.maxBytes !== undefined
        ? { maxBytes: Math.min(defaultRequest.maxBytes, local.maxBytes) } : {}),
      ...(selectedContext === undefined ? { securityContext: undefined } : { securityContext: selectedContext })
    };
    return result;
  };
  const prepareInput = (plan: AssetPlan, resolved: { readonly url: string; readonly extension?: "opus.webm" | "m4a" }, request: GameSoundRequest) => {
    const digests = [
      digestOf(defaultRequest.expectedHash, true), digestOf(plan.localRequest.expectedHash, true),
      integrityDigest(defaultRequest.integrity), integrityDigest(plan.localRequest.integrity),
      digestOf(plan.asset.sha256, true), integrityDigest(plan.asset.integrity),
      digestOf(plan.asset.hash, typeof plan.asset.hash === "string" && /^sha256[:-]/i.test(plan.asset.hash.trim()))
    ].filter((item): item is string => item !== undefined);
    const variantHash = resolved.extension ? digestOf(plan.asset.variantHashes?.[resolved.extension], true) : undefined;
    if (resolved.extension && plan.asset.variantHashes !== undefined && !variantHash) throw new Error("Audio variant digest is required");
    if (resolved.extension && digests.length > 0 && !variantHash) throw new Error("Audio variant digest is required");
    if (variantHash) digests.push(variantHash);
    if (digests.some((digest) => digest !== digests[0])) throw new Error("Conflicting audio content digests");
    if (plan.asset.kind === "aura-asset-ref" && plan.asset.type !== "audio") throw new Error("Typed game asset is not audio");
    if (plan.asset.buffer && (digests.length > 0 || plan.asset.sizeBytes !== undefined || request.maxBytes !== undefined ||
        request.expectedUrl !== undefined || plan.asset.variantHashes !== undefined)) {
      throw new Error("Cannot verify encoded bytes for an audio buffer");
    }
    const legacyHash = plan.asset.hash && !SHA256.test(plan.asset.hash.trim()) ? plan.asset.hash : undefined;
    const fetchRequest: GameSoundRequest = {
      ...request,
      ...(digests[0] ? { expectedHash: digests[0] } : {}),
      ...(legacyHash ? { cacheKey: JSON.stringify([request.cacheKey ?? null, legacyHash]) } : {}),
      ...(request.expectedUrl && resolved.extension ? { expectedUrl: request.expectedUrl.replaceAll(FORMAT_TOKEN, resolved.extension) } : {})
    };
    const input = {
      url: resolved.url,
      ...(plan.asset.id === undefined ? {} : { id: plan.asset.id }),
      ...(plan.asset.kind === undefined ? {} : { kind: plan.asset.kind }),
      ...(plan.asset.type === undefined ? {} : { type: plan.asset.type }),
      ...(plan.asset.format === undefined ? {} : { format: plan.asset.format }),
      ...(plan.asset.sizeBytes === undefined ? {} : { sizeBytes: plan.asset.sizeBytes }),
      ...(digests[0] ? { hash: digests[0] } : {})
    };
    return { input, request: fetchRequest };
  };
  const bufferForAsset = (asset: AudioAssetRef): AudioBuffer | undefined => {
    if (disposed) return undefined;
    try {
      const plan = planFor(asset);
      const request = policyFor(plan);
      if (defaultRequest.signal?.aborted || plan.localRequest.signal?.aborted) return undefined;
      if (plan.asset.buffer) {
        prepareInput(plan, { url: plan.asset.url }, request);
        return plan.asset.buffer;
      }
      const resolved = plan.resolved ?? (!plan.asset.url.includes(FORMAT_TOKEN) ? { url: plan.asset.url } : undefined);
      if (!resolved) return undefined;
      const prepared = prepareInput(plan, resolved, request);
      const reusable = (prepared.request.credentials === "omit" || prepared.request.securityContext !== undefined)
        && !["no-store", "reload", "no-cache"].includes(prepared.request.cache ?? "default");
      return reusable ? fileManager?.getCached(prepared.input, prepared.request)?.buffer : undefined;
    } catch {
      return undefined;
    }
  };
  const loadAsset = (asset: AudioAssetRef, signal?: AbortSignal): Promise<AudioBuffer | undefined> => {
    if (disposed) return Promise.resolve(undefined);
    let plan: AssetPlan;
    let request: GameSoundRequest;
    try { plan = planFor(asset); request = policyFor(plan); }
    catch { diagnostic("AUDIO_ASSET_POLICY_INVALID"); return Promise.resolve(undefined); }
    const controller = new AbortController();
    const linked = linkSignals([lifetime.signal, controller.signal, defaultRequest.signal, plan.localRequest.signal, signal]);
    const currentGeneration = generation;
    pendingLoads.add(controller);
    const operation = async (): Promise<AudioBuffer | undefined> => {
      if (linked.signal.aborted) throw abortError();
      if (plan.asset.buffer) {
        prepareInput(plan, { url: plan.asset.url }, request);
        return plan.asset.buffer;
      }
      let resolved = plan.resolved;
      if (!resolved) {
        const extension = plan.asset.url.includes(FORMAT_TOKEN) ? await waitFor(resolveExtension(), linked.signal) : undefined;
        if (linked.signal.aborted || disposed || generation !== currentGeneration) throw abortError();
        resolved = { url: extension ? plan.asset.url.replaceAll(FORMAT_TOKEN, extension) : plan.asset.url, ...(extension ? { extension } : {}) };
        plan.resolved = resolved;
      }
      const prepared = prepareInput(plan, resolved, request);
      if (!fileManager) throw new Error("Audio decoding is unavailable");
      const clip = await fileManager.load(prepared.input, { ...prepared.request, signal: linked.signal });
      if (linked.signal.aborted || disposed || generation !== currentGeneration) throw abortError();
      return clip.buffer;
    };
    return operation().catch((error: unknown) => {
      if (!isAbort(error) && !linked.signal.aborted && !disposed && generation === currentGeneration) diagnostic("AUDIO_ASSET_LOAD_FAILED");
      return undefined;
    }).finally(() => { pendingLoads.delete(controller); linked.dispose(); });
  };
  const pool = new VoicePool({
    ctx,
    rng,
    voiceCap: options.voiceCap ?? VOICE_CAPS[tier],
    bufferFor: (_url, asset) => asset ? bufferForAsset(asset as AudioAssetRef) : undefined
  });

  // Warm authored cue assets without ever issuing a fetch for inline buffers.
  for (const cue of Object.values(cueSpecs)) {
    const assets = cue.asset ? (Array.isArray(cue.asset) ? cue.asset : [cue.asset]) : [];
    for (const asset of assets) if (!asset.buffer) void loadAsset(asset);
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
    bufferFor: () => undefined
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
    // Built-in impulse responses do not inherit caller-supplied asset headers.
    if (fileManager) void fileManager.load(url, { credentials: "omit", signal: lifetime.signal }).then((clip) => {
      if (!disposed) reverb.setIrBuffer?.(clip.buffer);
    }).catch((error: unknown) => { if (!disposed && !isAbort(error)) diagnostic("AUDIO_REVERB_LOAD_FAILED"); });
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
    input: SoundNodeLike,
    asset?: AudioAssetRef,
    buffer?: AudioBuffer
  ): VoiceRecord => {
    const currentGeneration = generation;
    const record = pool.allocate(cueId, cue, input, { loop: true, selectedAsset: asset, buffer }).record;
    if (!record) throw new Error(`Engine loop voice for "${cueId}" was dropped at cap`);
    try { record.source.start(); }
    catch (error) { pool.release(record); throw error; }
    if (disposed || generation !== currentGeneration || record.ended) {
      pool.release(record);
      throw new Error("Engine loop was cancelled while starting");
    }
    return record;
  };

  const handles = new Set<LoopHandleImpl>();
  const pendingPlays = new Set<PlayHandle>();
  let muted = false;
  let masterVolume = 1;
  let voicesPlayed = 0;

  /** Preserve the selected variant while its policy-scoped bytes are loaded. */
  const deferPlay = (cueId: string, cue: SoundCueSpec, asset: AudioAssetRef, opts: PlayOptions): PlayHandle => {
    let real: PlayHandle | null = null;
    let stopped = false;
    let failed = false;
    let level: { gain?: number; rate?: number } | undefined;
    let position: Vec3 | undefined;
    let occlusion: number | undefined;
    const controller = new AbortController();
    let finishStarted!: (started: boolean) => void;
    const started = new Promise<boolean>((resolve) => { finishStarted = resolve; });
    void loadAsset(asset, controller.signal).then((buffer) => {
      if (stopped || disposed || muted || !buffer) {
        failed = true;
        finishStarted(false);
        return;
      }
      try { real = playNow(cueId, cue, position ? { ...opts, position } : opts, asset, buffer); }
      catch { diagnostic("AUDIO_PLAYBACK_FAILED"); }
      if (!real || disposed || stopped) {
        real?.stop();
        failed = true;
        finishStarted(false);
        return;
      }
      try {
        if (level) real.setLevel?.(level, 1);
        if (position) real.setPosition(position);
        if (occlusion !== undefined) real.setOcclusion(occlusion);
        finishStarted(true);
      } catch {
        real.stop();
        failed = true;
        diagnostic("AUDIO_PLAYBACK_FAILED");
        finishStarted(false);
      }
    }).finally(() => pendingPlays.delete(handle));
    const handle: PlayHandle = {
      get id() { return real?.id ?? -2; },
      started,
      get ended() {
        return stopped || failed || (real?.ended ?? false);
      },
      setLevel: (l, rampMs) => {
        level = { ...level, ...l };
        real?.setLevel?.(l, rampMs);
      },
      stop: (fadeMs) => {
        stopped = true;
        controller.abort();
        finishStarted(false);
        real?.stop(fadeMs);
      },
      setPosition: (p) => {
        position = p;
        real?.setPosition(p);
      },
      setOcclusion: (a) => {
        occlusion = a;
        real?.setOcclusion(a);
      }
    };
    pendingPlays.add(handle);
    return handle;
  };

  const play = (cueId: string, opts: PlayOptions = {}): PlayHandle | null => {
    if (muted || disposed) return null;
    const cue = cueSpecs[cueId];
    if (!cue) return null;
    if (cue.asset === undefined) return playNow(cueId, cue, opts);
    const selected = pool.selectAsset(cueId, cue) as AudioAssetRef | undefined;
    if (!selected) return null;
    const buffer = bufferForAsset(selected);
    return buffer ? playNow(cueId, cue, opts, selected, buffer) : deferPlay(cueId, cue, selected, opts);
  };

  const playNow = (cueId: string, cue: SoundCueSpec, opts: PlayOptions = {}, selectedAsset?: AudioAssetRef, buffer?: AudioBuffer): PlayHandle | null => {
    if (muted || disposed) return null;
    const currentGeneration = generation;
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
    const allocation = pool.allocate(cueId, cue as VoiceCueSpec, input, { ...opts, selectedAsset, buffer });
    if (allocation.dropped || !allocation.record) { spatial?.dispose(); return null; }
    const record = allocation.record;
    // Authored level after jitter, without the per-play volumeDb: setLevel
    // gains are relative to it (setLevel({gain:1}) = authored level).
    const baseGain = Math.max(1e-6, record.targetGain / dbToGain(opts.volumeDb ?? 0));
    const baseRate = record.source.playbackRate?.value ?? 1;
    try { record.source.start(); }
    catch (error) { pool.release(record); spatial?.dispose(); throw error; }
    if (disposed || generation !== currentGeneration || record.ended) {
      pool.release(record); spatial?.dispose(); return null;
    }
    voicesPlayed += 1;
    return {
      id: record.id,
      /** True once the voice finished, was stopped, stolen or evicted. */
      get ended() {
        return record.ended;
      },
      /** Ramp this voice's gain (linear) and playback rate; loops follow game state. */
      setLevel: (level: { gain?: number; rate?: number }, rampMs = 60) => {
        const now = ctx.currentTime;
        const tau = Math.max(1, rampMs) / 3000;
        const g = (record.gain as unknown as { gain: { value: number; setTargetAtTime?(v: number, t: number, tau: number): void; cancelScheduledValues?(t: number): void } }).gain;
        if (level.gain !== undefined) {
          const target = clamp(level.gain, 0, 4) * baseGain;
          if (g.setTargetAtTime) {
            g.cancelScheduledValues?.(now);
            g.setTargetAtTime(target, now, tau);
          } else g.value = target;
        }
        const r = record.source.playbackRate;
        if (level.rate !== undefined && r) {
          const target = Math.max(0.0625, Math.min(4, level.rate * baseRate));
          if (r.setTargetAtTime) r.setTargetAtTime(target, now, tau);
          else r.value = target;
        }
      },
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

  const loopNow = (
    cueId: string,
    cue: SoundCueSpec,
    opts: { position?: Vec3; fadeInMs?: number },
    selectedAsset: AudioAssetRef,
    buffer: AudioBuffer
  ): LoopHandleImpl | null => {
    if (muted || disposed) return null;
    const currentGeneration = generation;
    for (const handle of handles) if (handle.ended) handles.delete(handle);
    const spatial = spatialOf(cue, opts.position);
    const input = spatial ? spatial.input : busInput(cue.bus);
    if (spatial) spatial.occlusionFilter.connect(busInput(cue.bus));
    const allocation = pool.allocate(cueId, cue as VoiceCueSpec, input, { loop: true, selectedAsset, buffer });
    if (allocation.dropped || !allocation.record) { spatial?.dispose(); return null; }
    try { allocation.record.source.start(); }
    catch (error) { pool.release(allocation.record); spatial?.dispose(); throw error; }
    if (disposed || generation !== currentGeneration || allocation.record.ended) {
      pool.release(allocation.record); spatial?.dispose(); return null;
    }
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

  const loop = (
    cueId: string,
    opts: { position?: Vec3; fadeInMs?: number } = {}
  ): (LoopHandleImpl & { readonly started?: Promise<boolean> }) | null => {
    if (muted || disposed) return null;
    const cue = cueSpecs[cueId];
    if (!cue?.asset) return null;
    const selected = pool.selectAsset(cueId, cue) as AudioAssetRef | undefined;
    if (!selected) return null;
    const cached = bufferForAsset(selected);
    if (cached) return loopNow(cueId, cue, opts, selected, cached);

    // Keep the existing LoopHandleImpl API while a policy-scoped load is in
    // flight. The placeholder is never submitted to the audio context.
    const placeholder = { id: -2, ended: false } as VoiceRecord;
    class PendingLoop extends LoopHandleImpl {
      private target?: LoopHandleImpl;
      private cancelled = false;
      private failed = false;
      private readonly controller = new AbortController();
      private rate?: readonly [number, number];
      private gain?: readonly [number, number];
      private position?: Vec3;
      private velocity?: Vec3;
      private occlusion?: number;
      private settle!: (value: boolean) => void;
      readonly started = new Promise<boolean>((resolve) => { this.settle = resolve; });

      constructor() {
        super(ctx, placeholder, undefined, () => {});
        void loadAsset(selected!, this.controller.signal).then((buffer) => {
          if (this.cancelled || disposed || muted || !buffer) { this.failed = true; this.settle(false); return; }
          try {
            this.target = loopNow(cueId, cue!, this.position ? { ...opts, position: this.position } : opts, selected!, buffer) ?? undefined;
            if (!this.target || this.cancelled || disposed) {
              this.target?.stop(); this.failed = true; this.settle(false); return;
            }
            if (this.rate) this.target.setRate(...this.rate);
            if (this.gain) this.target.setGain(...this.gain);
            if (this.position) this.target.setPositionVelocity(this.position, this.velocity);
            if (this.occlusion !== undefined) this.target.setOcclusion(this.occlusion);
            this.settle(true);
          } catch {
            this.target?.stop(); this.failed = true;
            diagnostic("AUDIO_PLAYBACK_FAILED"); this.settle(false);
          }
        });
      }

      override get id(): number { return this.target?.id ?? -2; }
      override get ended(): boolean { return this.cancelled || this.failed || (this.target?.ended ?? false); }
      override stop(fadeMs = 0): void {
        if (this.cancelled) return;
        this.cancelled = true; this.controller.abort(); this.settle(false); this.target?.stop(fadeMs);
      }
      override setPosition(position: Vec3): void { this.position = position; this.target?.setPosition(position); }
      override setPositionVelocity(position: Vec3, velocity?: Vec3): void {
        this.position = position; this.velocity = velocity; this.target?.setPositionVelocity(position, velocity);
      }
      override setOcclusion(value: number): void { this.occlusion = value; this.target?.setOcclusion(value); }
      override setRate(value: number, rampMs = 0): void { this.rate = [value, rampMs]; this.target?.setRate(value, rampMs); }
      override setGain(value: number, rampMs = 0): void { this.gain = [value, rampMs]; this.target?.setGain(value, rampMs); }
    }
    const pending = new PendingLoop();
    handles.add(pending);
    return pending;
  };

  const engineLoops = new Set<EngineLoopHandleImpl>();
  const assetBufferFor = (_url: string, asset?: { readonly url: string }): AudioBuffer | undefined =>
    asset ? bufferForAsset(asset as AudioAssetRef) : undefined;
  const requiresBufferedAsset = (): boolean =>
    securityContext !== undefined || Object.keys(defaultRequest).length > 0;

  const engine = (
    spec: EngineLoopSpec | { cue: TCue; rpmRange: readonly [number, number]; pitchRange: readonly [number, number] }
  ): EngineLoopHandleImpl => {
    if (disposed) throw new Error("Game audio engine is disposed");
    const currentGeneration = generation;
    for (const handle of engineLoops) if (handle.ended) engineLoops.delete(handle);
    if ("cue" in spec) {
      // C-25 shorthand: one cue asset, pitch by rpm fraction.
      const cue = cueSpecs[spec.cue];
      if (!cue) throw new Error(`Unknown engine cue "${String(spec.cue)}"`);
      const asset = Array.isArray(cue.asset) ? cue.asset[0] : cue.asset as AudioAssetRef | undefined;
      if (!asset) throw new Error("Engine loop cue requires an audio asset");
      const layer: EngineLayerSpec = { asset, rpm: spec.rpmRange[0] };
      const handle = createEngineLoop({
        ctx,
        onLoad: [layer],
        idleRpm: spec.rpmRange[0],
        maxRpm: spec.rpmRange[1],
        busInput: busInput(cue.bus),
        spatial: undefined,
        pool,
        bufferFor: assetBufferFor,
        loadAsset: (entry, signal) => loadAsset(entry as AudioAssetRef, signal),
        requiresBufferedAsset,
        startVoice: (buffer, input, _loop, entry) => startLoopVoice(String(spec.cue), cue, input, entry as AudioAssetRef | undefined, buffer)
      });
      if (disposed || generation !== currentGeneration) handle.stop(0);
      else engineLoops.add(handle);
      return handle;
    }
    const spatial = createSpatialNode({ ctx, panningModel: HRTF_CAP[tier] > 0 ? "HRTF" : "equalpower" });
    spatial.occlusionFilter.connect(busInput(spec.bus ?? "sfx"));
    try {
      const handle = createEngineLoop({
        ctx,
        onLoad: spec.onLoad,
        offLoad: spec.offLoad,
        idleRpm: spec.idleRpm,
        maxRpm: spec.maxRpm,
        busInput: busInput(spec.bus ?? "sfx"),
        spatial,
        pool,
        bufferFor: assetBufferFor,
        loadAsset: (entry, signal) => loadAsset(entry as AudioAssetRef, signal),
        requiresBufferedAsset,
        startVoice: (buffer, input, _loop, entry) =>
          startLoopVoice("_engine", { bus: "sfx", priority: "normal" }, input, entry as AudioAssetRef | undefined, buffer)
      });
      if (disposed || generation !== currentGeneration) handle.stop(0);
      else engineLoops.add(handle);
      return handle;
    } catch (error) {
      spatial.dispose();
      throw error;
    }
  };

  const music = new MusicControllerImpl({
    ctx,
    output: busInput("music"),
    tracks: options.music?.tracks ?? {},
    bufferFor: assetBufferFor,
    loadAsset: (asset, signal) => loadAsset(asset as AudioAssetRef, signal),
    requiresBufferedAsset,
    onLoadFailure: () => diagnostic("AUDIO_MUSIC_LOAD_FAILED"),
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
  const unlockEvents = ["pointerdown", "keydown", "touchend"] as const;
  let unlockListener: (() => void) | undefined;
  const detachUnlock = (): void => {
    if (unlockListener && typeof document !== "undefined") {
      for (const event of unlockEvents) document.removeEventListener(event, unlockListener);
    }
    unlockListener = undefined;
  };
  const unlock = async () => {
    if (unlockArmed || disposed) return;
    unlockArmed = true;
    const resume = async () => {
      if (disposed) return;
      try {
        await ctx.resume();
      } catch {
        /* ctx may not need resuming */
      }
      if (!disposed) readyResolve();
    };
    if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
      const once = { once: true, passive: true } as const;
      unlockListener = () => { detachUnlock(); void resume(); };
      for (const event of unlockEvents) document.addEventListener(event, unlockListener, once);
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
      masterVolume = clamp(v, 0, 1);
      if (!muted) chain.setMasterGain(masterVolume);
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

  /**
   * §20 `audio.webm`: tap the post-chain master output into a MediaRecorder for
   * ~`seconds` (default 60). Resolves the recorded Blob (`audio/webm`, Opus when
   * the runtime offers it), or `null` when MediaRecorder/MediaStreamDestination
   * are unavailable (headless stub contexts).
   */
  const recordMaster = (seconds = 60): Promise<Blob | null> => {
    const createDest = (ctx as { createMediaStreamDestination?: () => MediaStreamAudioDestinationNode }).createMediaStreamDestination;
    const Recorder = (globalThis as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
    if (typeof createDest !== "function" || typeof Recorder !== "function") return Promise.resolve(null);
    const dest = createDest.call(ctx);
    (chain.output as unknown as AudioNode).connect(dest);
    const mime = ["audio/webm;codecs=opus", "audio/webm"].find((m) => Recorder.isTypeSupported?.(m) ?? false);
    const recorder = new Recorder(dest.stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    return new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        (chain.output as unknown as AudioNode).disconnect(dest);
        resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || mime || "audio/webm" }) : null);
      };
      recorder.start();
      setTimeout(() => recorder.state !== "inactive" && recorder.stop(), Math.max(1, seconds) * 1000).unref?.();
    });
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
    recordMaster,
    /** Invalidate voices and cached/in-flight data when ambient identity changes. */
    setSecurityContext(next?: string) {
      if (disposed) return;
      if (next !== undefined && (typeof next !== "string" || !next.trim())) {
        throw new Error("Audio securityContext must be a non-empty authentication generation");
      }
      securityContext = next;
      generation += 1;
      for (const controller of pendingLoads) controller.abort();
      for (const handle of pendingPlays) handle.stop();
      for (const handle of handles) if (!handle.ended) handle.stop(0);
      for (const handle of engineLoops) if (!handle.ended) handle.stop(0);
      handles.clear();
      engineLoops.clear();
      fileManager?.clear();
      music.reset();
      pool.releaseAll();
    },
    setMuted(m: boolean) {
      muted = m;
      // Unmute restores the user's master level, not unity.
      chain.setMasterGain(m ? 0 : masterVolume);
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
      return {
        contextState: String(ctx.state),
        voicesPlayed,
        liveVoices: pool.liveCount,
        poolStats: pool.stats,
        buses: busValues,
        assetCues: assetCueCount,
        synthCues: synthCueCount,
        limiterEngaged: chain.limiterEngaged,
        stages: [...chain.stages],
        tier,
        errors: [...errors]
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      lifetime.abort();
      for (const controller of pendingLoads) controller.abort();
      for (const handle of pendingPlays) handle.stop();
      pendingPlays.clear();
      for (const h of handles) {
        if (!h.ended) h.stop(0);
      }
      handles.clear();
      for (const handle of engineLoops) if (!handle.ended) handle.stop(0);
      engineLoops.clear();
      music.dispose();
      pool.releaseAll();
      fileManager?.dispose();
      reverb.dispose();
      chain.dispose();
      if (duckT) clearTimeout(duckT);
      detachUnlock();
      readyResolve();
      defaultRequest = {};
      securityContext = undefined;
      probedExt = undefined;
      fetchProbe = undefined;
      probeBase = undefined;
      for (const key of Object.keys(cueSpecs)) delete cueSpecs[key];
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
