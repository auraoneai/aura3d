/**
 * `program/ProgramCache.ts` (PRD-01 §6.4) — real `ProgramCacheLike`.
 *
 * `acquire` normalizes + keys the record, returns the cached handle when
 * present, otherwise generates through `generateProgramImpl` and compiles:
 *   - async path (KHR_parallel_shader_compile polling) when
 *     `o.parallelCompile ?? device.probe?.parallelShaderCompile` and the
 *     device implements `compileAsync` — the handle starts `pending` and
 *     flips `ready`/`failed` when the promise settles;
 *   - sync path otherwise (`createShaderProgram` blocks, handle is
 *     `ready`/`failed` immediately — "warm-then-block" stays the default).
 *
 * `precompile` awaits every pending entry (what `ProgramWarmup`/`app.ready`
 * await). Stats accumulate `compiled`/`pending`/`failed`/`compileMsTotal`.
 */

import type { QrFlags } from "../contracts/core";
import type { ProgramFeatures, ProgramHandle, ProgramCacheLike } from "../contracts/program";
import { RenderDeviceError, type RenderDevice, type RenderShaderProgram, type ShaderSources } from "../RenderDevice";
import { generateProgramImpl, GENERATED_PROGRAM_MARKER, isBuiltinGeneratedWgsl, programDegradationLog, type GenerateProgramOptions, type ProgramDegradation } from "./ProgramGenerator";
import { normalizeProgramFeatures } from "./ProgramFeatures";
import { programKey } from "./ProgramKey";
import { sanitizeShaderDiagnosticText } from "../ShaderFailures";
import { resourceDisposalPending } from "../ResourceLifecycle";
import { recordStaticGeneratedUnlitSources } from "../webgl2/StaticGeneratedUnlitShader";
import { registerStaticGeneratedCacheCapability } from "./StaticGeneratedCacheCapability";

const readinessListeners = new WeakMap<RenderDevice, Set<() => void>>();
const readinessQueued = new WeakSet<RenderDevice>();

type ProgramDisposalOrigin = "stale" | "generation" | "dispose" | "returned";

interface ProgramOwner {
  readonly owner: ProgramCache;
  readonly key: string;
  readonly deviceGeneration: number | undefined;
  readonly deviceEpoch: number;
}

interface ProgramDisposalRequest extends ProgramOwner {
  readonly origin: ProgramDisposalOrigin;
}

interface ProgramDisposalFailure extends ProgramDisposalRequest {
  readonly error: unknown;
  readonly retirement: ProgramRetirement;
  resolved: boolean;
}

interface ProgramRetirement {
  readonly deviceGeneration: number | undefined;
  readonly deviceEpoch: number;
  readonly foreign?: ProgramRetirement;
  readonly claims: Map<CacheEntry, ProgramOwner>;
  readonly requests: ProgramDisposalRequest[];
  readonly failures: ProgramDisposalFailure[];
  phase: "live" | "retiring" | "retryable" | "uncertain" | "released";
  retryOwner?: ProgramCache;
  retryGeneration?: number;
  retryEpoch?: number;
  deferRetry?: boolean;
  inProgressError?: Error;
  generationError?: Error;
  incompleteError?: Error;
}

interface ProgramDisposalState {
  // Successful retirements remain weakly deduplicated; only uncertain ones
  // keep their programs strongly reachable. Failure history does not own them.
  readonly programs: WeakMap<RenderShaderProgram, ProgramRetirement>;
  readonly pending: Map<RenderShaderProgram, ProgramRetirement>;
  readonly failures: ProgramDisposalFailure[];
  epoch: number;
  lossObserved: boolean;
  lossNotified: WeakSet<ProgramCache>;
}

// Cache owners can share a program, and renderer teardown can discard a cache
// before a driver returns it. Keep uncertain cleanup reachable with its device.
const programDisposalStates = new WeakMap<RenderDevice, ProgramDisposalState>();
// A wrapper cannot safely be owned by two devices, even if both return it.
const programHomes = new WeakMap<RenderShaderProgram, { device: RenderDevice | undefined; readonly retirement: ProgramRetirement }>();
const disposingCaches = new WeakSet<ProgramCache>();
const activeCompilations = new WeakMap<ProgramCache, Set<CacheEntry>>();

function trackProgramCompilation(cache: ProgramCache, entry: CacheEntry): () => void {
  let entries = activeCompilations.get(cache);
  if (!entries) { entries = new Set(); activeCompilations.set(cache, entries); }
  entries.add(entry);
  const tracked = entries;
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    tracked.delete(entry);
    if (!tracked.size) activeCompilations.delete(cache);
  };
}

function programDisposalState(device: RenderDevice): ProgramDisposalState {
  let state = programDisposalStates.get(device);
  if (!state) {
    state = { programs: new WeakMap(), pending: new Map(), failures: [], epoch: 0, lossObserved: false, lossNotified: new WeakSet() };
    programDisposalStates.set(device, state);
  }
  return state;
}

function programRetirement(state: ProgramDisposalState, device: RenderDevice, program: RenderShaderProgram, owner: ProgramOwner): ProgramRetirement {
  let retirement = state.programs.get(program);
  if (!retirement) {
    const home = programHomes.get(program);
    retirement = { deviceGeneration: owner.deviceGeneration, deviceEpoch: owner.deviceEpoch,
      foreign: home && home.device !== device ? home.retirement : undefined,
      claims: new Map(), requests: [], failures: [], phase: "live" };
    state.programs.set(program, retirement);
    if (!home) programHomes.set(program, { device, retirement });
  }
  return retirement;
}

function recordDisposalFailure(state: ProgramDisposalState, retirement: ProgramRetirement, request: ProgramDisposalRequest, error: unknown): void {
  if (retirement.failures.some((failure) => !failure.resolved && failure.owner === request.owner
    && failure.key === request.key && failure.origin === request.origin && Object.is(failure.error, error))) return;
  const failure: ProgramDisposalFailure = { ...request, error, retirement, resolved: false };
  retirement.failures.push(failure);
  state.failures.push(failure);
  try {
    const key = sanitizeShaderDiagnosticText(failure.key).slice(0, 256);
    const prefix = failure.origin === "stale" ? "stale " : "";
    console.error(`[prd01] ${prefix}shader program cleanup could not be confirmed (key ${key}): ${describeCompileError(failure.error)}`);
  } catch { /* The original failure and program remain retained even if logging fails. */ }
}

function requestProgramDisposal(state: ProgramDisposalState, retirement: ProgramRetirement, request: ProgramDisposalRequest): void {
  if (retirement.requests.some((previous) => previous.owner === request.owner && previous.key === request.key && previous.origin === request.origin)) return;
  const errors = new Set(retirement.failures.filter((failure) => !failure.resolved).map((failure) => failure.error));
  retirement.requests.push(request);
  for (const error of errors) recordDisposalFailure(state, retirement, request, error);
}

function recordProgramFailure(state: ProgramDisposalState, retirement: ProgramRetirement, error: unknown): void {
  for (const request of retirement.requests) recordDisposalFailure(state, retirement, request, error);
}

function reportProgramDisposalInProgress(state: ProgramDisposalState, retirement: ProgramRetirement, owner: ProgramCache): void {
  const error = retirement.inProgressError ??= new Error("Shader program cleanup is already in progress");
  for (const request of retirement.requests) {
    if (request.owner === owner) recordDisposalFailure(state, retirement, request, error);
  }
}

function finishProgramDisposal(state: ProgramDisposalState, program: RenderShaderProgram, retirement: ProgramRetirement): void {
  retirement.phase = "released";
  for (const failure of retirement.failures) failure.resolved = true;
  retirement.failures.length = 0;
  retirement.claims.clear();
  retirement.requests.length = 0;
  retirement.retryOwner = undefined;
  state.pending.delete(program);
  const home = programHomes.get(program);
  if (home?.retirement === retirement) home.device = undefined;
}

function programDisposalStatus(program: RenderShaderProgram): { readonly pending: boolean | undefined; readonly disposed: boolean } {
  return {
    pending: (program as RenderShaderProgram & { readonly [resourceDisposalPending]?: boolean })[resourceDisposalPending],
    disposed: program.disposed
  };
}

function deferExternallyPendingRetry(retirement: ProgramRetirement): void {
  // The pending signal also covers a disposer currently on the stack. Wait
  // until it unwinds before considering an externally initiated retry.
  retirement.deferRetry = true;
  queueMicrotask(() => { retirement.deferRetry = false; });
}

function handleProgramDisposalError(
  state: ProgramDisposalState, program: RenderShaderProgram, retirement: ProgramRetirement, error: unknown
): void {
  let status: ReturnType<typeof programDisposalStatus>;
  try {
    status = programDisposalStatus(program);
  } catch (statusError) {
    recordProgramFailure(state, retirement, error);
    if (!Object.is(statusError, error)) recordProgramFailure(state, retirement, statusError);
    retirement.phase = "uncertain";
    return;
  }
  // A false explicit pending receipt, unlike a bare disposed flag after a
  // throw, proves that the retryable native cleanup completed.
  if (status.disposed === true && status.pending === false) {
    recordProgramFailure(state, retirement, error);
    finishProgramDisposal(state, program, retirement);
  } else {
    recordProgramFailure(state, retirement, error);
    retirement.phase = status.pending === true ? "retryable" : "uncertain";
  }
}

function completeProgramDisposalAttempt(state: ProgramDisposalState, program: RenderShaderProgram, retirement: ProgramRetirement): void {
  const status = programDisposalStatus(program);
  if (status.pending === true) {
    const error = retirement.incompleteError ??= new Error("Shader program disposal did not complete");
    recordProgramFailure(state, retirement, error);
    retirement.phase = "retryable";
  } else if (status.disposed === false) {
    recordProgramFailure(state, retirement, new Error("Shader program did not report disposal"));
    retirement.phase = "uncertain";
  } else {
    finishProgramDisposal(state, program, retirement);
  }
}

function attemptProgramDisposal(
  device: RenderDevice, state: ProgramDisposalState, program: RenderShaderProgram, retirement: ProgramRetirement, owner: ProgramCache
): void {
  if (retirement.phase !== "live" || retirement.claims.size) return;
  retirement.phase = "retiring";
  retirement.retryOwner = owner;
  state.pending.set(program, retirement);
  let attempted = false;
  try {
    retirement.retryGeneration = device.generation;
    retirement.retryEpoch = state.epoch;
    const status = programDisposalStatus(program);
    if (status.pending === true) {
      deferExternallyPendingRetry(retirement);
      recordProgramFailure(state, retirement, new Error("Shader program already has incomplete disposal"));
      retirement.phase = "retryable";
    } else if (status.disposed === true) {
      finishProgramDisposal(state, program, retirement);
    } else {
      attempted = true;
      program.dispose();
      completeProgramDisposalAttempt(state, program, retirement);
    }
  } catch (error) {
    if (!attempted) deferExternallyPendingRetry(retirement);
    handleProgramDisposalError(state, program, retirement, error);
  }
}

function retryProgramDisposal(device: RenderDevice, state: ProgramDisposalState, program: RenderShaderProgram, retirement: ProgramRetirement): void {
  if (retirement.phase !== "retryable" || retirement.claims.size) return;
  retirement.phase = "retiring";
  try {
    const status = programDisposalStatus(program);
    if (status.disposed === true && status.pending === false) {
      finishProgramDisposal(state, program, retirement);
    } else if (status.pending !== true) {
      recordProgramFailure(state, retirement, new Error("Shader program cleanup no longer has a completion receipt"));
      retirement.phase = "uncertain";
    } else if (retirement.deferRetry) {
      retirement.phase = "retryable";
    } else if (device.generation !== retirement.retryGeneration || state.epoch !== retirement.retryEpoch) {
      const error = retirement.generationError ??= new Error("Shader program cleanup retry blocked by a device generation change");
      recordProgramFailure(state, retirement, error);
      retirement.phase = "retryable";
    } else {
      program.dispose();
      completeProgramDisposalAttempt(state, program, retirement);
    }
  } catch (error) {
    handleProgramDisposalError(state, program, retirement, error);
  }
}

function releaseProgram(
  device: RenderDevice, program: RenderShaderProgram, entry: CacheEntry | undefined, request: ProgramDisposalRequest
): void {
  const state = programDisposalState(device);
  const retirement = programRetirement(state, device, program, request);
  if (entry) retirement.claims.delete(entry);
  if (retirement.foreign) {
    quarantineForeignProgram(state, program, retirement, request);
    return;
  }
  if (retirement.phase === "released") return;
  if (retirement.phase === "live" && programGenerationConflict(retirement, request)) {
    quarantineProgramGeneration(state, program, retirement, request);
    return;
  }
  requestProgramDisposal(state, retirement, request);
  if (retirement.phase === "retiring") reportProgramDisposalInProgress(state, retirement, request.owner);
  else attemptProgramDisposal(device, state, program, retirement, request.owner);
}

function invalidateProgramClaims(state: ProgramDisposalState, program: RenderShaderProgram, retirement: ProgramRetirement): void {
  const claims = [...retirement.claims];
  retirement.claims.clear();
  for (const [entry, owner] of claims) {
    if (entry.program === program) {
      entry.program = undefined;
      entry.status = "failed";
      entry.error = "Compiled shader program is already retired";
      entry.settle?.();
      entry.settle = undefined;
      entry.pending = undefined;
    }
    requestProgramDisposal(state, retirement, { ...owner, origin: "returned" });
  }
}

function programGenerationConflict(retirement: ProgramRetirement, owner: ProgramOwner): boolean {
  return retirement.deviceEpoch !== owner.deviceEpoch || (retirement.deviceGeneration !== undefined
    && owner.deviceGeneration !== undefined && retirement.deviceGeneration !== owner.deviceGeneration);
}

function quarantineForeignProgram(
  state: ProgramDisposalState, program: RenderShaderProgram, retirement: ProgramRetirement, request: ProgramDisposalRequest
): void {
  if (retirement.foreign?.phase === "released") {
    finishProgramDisposal(state, program, retirement);
  } else if (retirement.phase === "live") {
    retirement.phase = "retiring";
    state.pending.set(program, retirement);
    requestProgramDisposal(state, retirement, request);
    recordProgramFailure(state, retirement, new Error("Shader program belongs to another render device"));
    retirement.phase = "uncertain";
  } else if (retirement.phase !== "released") {
    requestProgramDisposal(state, retirement, request);
    if (retirement.phase === "retiring") reportProgramDisposalInProgress(state, retirement, request.owner);
  }
}

function quarantineProgramGeneration(
  state: ProgramDisposalState, program: RenderShaderProgram, retirement: ProgramRetirement, request: ProgramDisposalRequest
): void {
  // The same object cannot safely represent native names from two epochs.
  retirement.phase = "retiring";
  state.pending.set(program, retirement);
  invalidateProgramClaims(state, program, retirement);
  requestProgramDisposal(state, retirement, request);
  recordProgramFailure(state, retirement, new Error("Shader program was reused across device generations"));
  retirement.phase = "uncertain";
}

function claimProgram(device: RenderDevice, program: RenderShaderProgram, entry: CacheEntry, owner: ProgramOwner): boolean {
  const state = programDisposalState(device);
  const retirement = programRetirement(state, device, program, owner);
  if (retirement.foreign) {
    quarantineForeignProgram(state, program, retirement, { ...owner, origin: "returned" });
    return false;
  }
  if (retirement.phase !== "live") {
    if (retirement.phase !== "released") requestProgramDisposal(state, retirement, { ...owner, origin: "returned" });
    if (retirement.phase === "retiring") reportProgramDisposalInProgress(state, retirement, owner.owner);
    return false;
  }
  if (programGenerationConflict(retirement, owner)) {
    quarantineProgramGeneration(state, program, retirement, { ...owner, origin: "returned" });
    return false;
  }
  let status: ReturnType<typeof programDisposalStatus>;
  try {
    status = programDisposalStatus(program);
  } catch (error) {
    const phase = retirement.phase as ProgramRetirement["phase"];
    if (phase !== "live") {
      if (phase !== "released") requestProgramDisposal(state, retirement, { ...owner, origin: "returned" });
      if (phase === "retiring") reportProgramDisposalInProgress(state, retirement, owner.owner);
      return false;
    }
    retirement.phase = "retiring";
    retirement.retryOwner = owner.owner;
    state.pending.set(program, retirement);
    invalidateProgramClaims(state, program, retirement);
    requestProgramDisposal(state, retirement, { ...owner, origin: "returned" });
    recordProgramFailure(state, retirement, error);
    retirement.phase = "uncertain";
    return false;
  }
  // Accessors can reenter and retire the program while its status is read.
  const phase = retirement.phase as ProgramRetirement["phase"];
  if (phase !== "live") {
    if (phase !== "released") requestProgramDisposal(state, retirement, { ...owner, origin: "returned" });
    if (phase === "retiring") reportProgramDisposalInProgress(state, retirement, owner.owner);
    return false;
  }
  if (status.disposed === true || status.pending === true) {
    retirement.phase = "retiring";
    retirement.retryOwner = owner.owner;
    state.pending.set(program, retirement);
    invalidateProgramClaims(state, program, retirement);
    requestProgramDisposal(state, retirement, { ...owner, origin: "returned" });
    if (status.pending === true) {
      deferExternallyPendingRetry(retirement);
      recordProgramFailure(state, retirement, new Error("Compiled shader program already has incomplete disposal"));
      try { retirement.retryGeneration = device.generation; retirement.retryEpoch = state.epoch; } catch (error) {
        recordProgramFailure(state, retirement, error);
        retirement.phase = "uncertain";
        return false;
      }
      retirement.phase = "retryable";
    } else {
      finishProgramDisposal(state, program, retirement);
    }
    return false;
  }
  retirement.claims.set(entry, owner);
  return true;
}

function observeUncertainProgram(state: ProgramDisposalState, program: RenderShaderProgram, retirement: ProgramRetirement): void {
  if (retirement.phase !== "uncertain" || retirement.claims.size) return;
  if (retirement.foreign) {
    if (retirement.foreign.phase === "released") finishProgramDisposal(state, program, retirement);
    return;
  }
  retirement.phase = "retiring";
  try {
    const status = programDisposalStatus(program);
    if (status.disposed === true && status.pending === false) finishProgramDisposal(state, program, retirement);
    else retirement.phase = "uncertain";
  } catch (error) {
    recordProgramFailure(state, retirement, error);
    retirement.phase = "uncertain";
  }
}

function detachCacheEntries(
  entries: Map<string, CacheEntry>, state: ProgramDisposalState, owner: ProgramCache, deviceGeneration: number | undefined, reason: string
): { readonly entry: CacheEntry; readonly program: RenderShaderProgram; readonly owner: ProgramOwner }[] {
  const snapshot = [...entries.values()];
  entries.clear();
  const programs: { entry: CacheEntry; program: RenderShaderProgram; owner: ProgramOwner }[] = [];
  for (const entry of snapshot) {
    if (entry.program) {
      const program = entry.program;
      const claim = state.programs.get(program)?.claims.get(entry) ?? { owner, key: entry.key, deviceGeneration, deviceEpoch: state.epoch };
      programs.push({ entry, program, owner: claim });
    }
    entry.program = undefined;
    entry.status = "failed";
    entry.error = reason;
    entry.settle?.();
    entry.settle = undefined;
    entry.pending = undefined;
  }
  return programs;
}

function programDisposalErrors(state: ProgramDisposalState, owner: ProgramCache, since: number): unknown[] {
  const seen = new Map<ProgramRetirement, Set<unknown>>();
  const errors: unknown[] = [];
  state.failures.forEach((failure, index) => {
    if (failure.owner !== owner || (failure.resolved && index < since)) return;
    let programErrors = seen.get(failure.retirement);
    if (!programErrors) { programErrors = new Set(); seen.set(failure.retirement, programErrors); }
    if (!programErrors.has(failure.error)) {
      programErrors.add(failure.error);
      errors.push(failure.error);
    }
  });
  return errors;
}

/** Notify a mounted renderer that a deferred generated program needs another
 * frame. Listeners are device-scoped and calls are coalesced per microtask. */
export function subscribeProgramReadiness(device: RenderDevice, listener: () => void): () => void {
  let listeners = readinessListeners.get(device);
  if (!listeners) {
    listeners = new Set();
    readinessListeners.set(device, listeners);
  }
  const entry = () => listener();
  listeners.add(entry);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    listeners!.delete(entry);
    if (listeners!.size === 0 && readinessListeners.get(device) === listeners) readinessListeners.delete(device);
  };
}

function notifyProgramReadiness(device: RenderDevice): void {
  if (readinessQueued.has(device) || !readinessListeners.has(device)) return;
  readinessQueued.add(device);
  queueMicrotask(() => {
    readinessQueued.delete(device);
    if (device.disposed) return;
    for (const listener of [...(readinessListeners.get(device) ?? [])]) listener();
  });
}

interface CacheEntry {
  key: string;
  status: "pending" | "ready" | "failed";
  program?: RenderShaderProgram;
  error?: string;
  pending?: Promise<void>;
  settle?: () => void;
  /** A synchronous generator or compile is active; pending without this flag
   * or a promise is an entry deferred by the per-frame compile budget. */
  compiling?: boolean;
}

export interface ProgramCacheOptions {
  /** When true, `generateProgramImpl` resolves registered feature contributors. */
  readonly flags?: QrFlags;
  /** When unset, falls back to `device.probe?.parallelShaderCompile`. */
  readonly parallelCompile?: boolean;
  /** Sink for generator degradations (e.g. extension-lobe-pending). */
  readonly onDegradation?: GenerateProgramOptions["onDegradation"];
  /**
   * T0-06 (§403): bound on synchronous compiles issued inside one frame epoch
   * (`beginFrame` resets it). Beyond the bound a new entry stays `pending`
   * without a compile — the next frame's `acquire` retries it. Async
   * (`compileAsync`) compiles do not count against the bound.
   */
  readonly maxSyncCompilesPerFrame?: number;
}

export class ProgramCache implements ProgramCacheLike {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly parallel: boolean;
  private readonly maxSyncCompilesPerFrame: number;
  private compileMsTotal = 0;
  private reuseCount = 0;
  private disposed = false;
  private frameSyncCompiles = 0;
  private readyMarked = false;
  private compiledSinceReadyCount = 0;
  private generation = 0;
  private observedDeviceGeneration: number | undefined;
  private observedDeviceEpoch: number;
  private readonly unsubscribeDeviceLost?: () => void;

  constructor(
    private readonly device: RenderDevice,
    private readonly options: ProgramCacheOptions = {}
  ) {
    this.parallel = options.parallelCompile ?? device.probe?.parallelShaderCompile ?? false;
    this.maxSyncCompilesPerFrame = options.maxSyncCompilesPerFrame ?? 8;
    this.observedDeviceGeneration = device.generation;
    const deviceState = programDisposalState(device);
    // A newly registered observer may not have received an earlier loss.
    deviceState.lossObserved = false;
    this.observedDeviceEpoch = deviceState.epoch;
    this.unsubscribeDeviceLost = device.onDeviceLost?.(() => {
      const state = programDisposalState(device);
      if (!state.lossObserved || state.lossNotified.has(this)) {
        state.lossObserved = true;
        state.lossNotified = new WeakSet();
        const epoch = ++state.epoch;
        // The same loss is delivered synchronously to every cache on a device.
        // A later loss must still advance the epoch without a new acquisition.
        queueMicrotask(() => { if (state.epoch === epoch) state.lossObserved = false; });
      }
      state.lossNotified.add(this);
      this.observedDeviceGeneration = device.generation;
      this.observedDeviceEpoch = state.epoch;
      this.invalidateGeneration();
    });
    const stateCurrent = captureProgramCacheState(this);
    programCacheStateChecks.set(this, stateCurrent);
    registerStaticGeneratedCacheCapability(this, () => programCacheMethodsCurrent(this) && stateCurrent(), {
      peekReady: (features) => programCachePeekIntrinsic.call(this, features),
      commitReadyReuse: (features, program, count) => programCacheCommitIntrinsic.call(this, features, program, count)
    });
  }

  /**
   * Stale cleanup diagnostics for this device, including disposed caches.
   * The result reports the original error but never exposes the stale program;
   * use `disposalFailures` to distinguish a subsequently confirmed retry.
   */
  static staleDisposalFailures(device: RenderDevice): readonly {
    readonly owner: ProgramCache;
    readonly key: string;
    readonly deviceGeneration: number | undefined;
    readonly error: unknown;
  }[] {
    return (programDisposalStates.get(device)?.failures ?? [])
      .filter((failure) => failure.origin === "stale")
      .map(({ owner, key, deviceGeneration, error }) => ({ owner, key, deviceGeneration, error }));
  }

  /** Cleanup diagnostics for every retirement path, including resolved retries. */
  static disposalFailures(device: RenderDevice): readonly {
    readonly owner: ProgramCache;
    readonly key: string;
    readonly deviceGeneration: number | undefined;
    readonly deviceEpoch: number;
    readonly origin: ProgramDisposalOrigin;
    readonly error: unknown;
    readonly resolved: boolean;
  }[] {
    return (programDisposalStates.get(device)?.failures ?? [])
      .map(({ owner, key, deviceGeneration, deviceEpoch, origin, error, resolved }) => ({ owner, key, deviceGeneration, deviceEpoch, origin, error, resolved }));
  }

  /** A closed cache can still own cleanup whose completion is not confirmed. */
  get [resourceDisposalPending](): boolean {
    const state = programDisposalStates.get(this.device);
    return disposingCaches.has(this)
      || [...(activeCompilations.get(this) ?? [])].some((entry) => entry.status !== "pending")
      || [...(state?.pending.values() ?? [])]
      .some((retirement) => retirement.requests.some((request) => request.owner === this));
  }

  /** T0-06: start of a frame's sync-compile budget. */
  beginFrame(): void {
    this.frameSyncCompiles = 0;
  }

  /** T0-06: mark the ready barrier — later compiles count `compiledSinceReady`. */
  markReady(): void {
    this.readyMarked = true;
  }

  private noteCompiled(): void {
    if (this.readyMarked) this.compiledSinceReadyCount += 1;
  }

  acquire(features: ProgramFeatures): ProgramHandle {
    return this.acquireEntry(features, false);
  }

  /**
   * Read a live ready program for speculative planning without acquiring it.
   * This deliberately does not synchronize device generations: a stale cache
   * declines here, and a later ordinary acquire performs normal invalidation.
   * Accessor-bearing or non-plain feature data conservatively declines.
   */
  peekReady(features: ProgramFeatures): RenderShaderProgram | undefined {
    try {
      const stateCurrent = programCacheStateChecks.get(this);
      if (!stateCurrent || !stateCurrent() || !programCacheMethodsCurrent(this)
        || this.disposed || this.device.disposed || this.device.contextLost
        || this.device.generation !== this.observedDeviceGeneration
        || programDisposalState(this.device).epoch !== this.observedDeviceEpoch) return undefined;
      const copy = copyPlainFeatures(features, new WeakSet<object>());
      if (copy === INVALID_FEATURE_DATA || !stateCurrent() || !programCacheMethodsCurrent(this)) return undefined;
      // acquireEntry normalizes once and programKey normalizes again. Compute
      // the same canonical key without touching either structural-key memo.
      const key = serializeFeatureKey(normalizeProgramFeatures(normalizeProgramFeatures(copy as ProgramFeatures)));
      const entry = this.entries.get(key);
      if (entry?.status !== "ready" || !entry.program) return undefined;
      const program = entry.program;
      const disposed = Object.getOwnPropertyDescriptor(program, "disposed");
      if (!disposed || !("value" in disposed) || disposed.value !== false || !stateCurrent() || !programCacheMethodsCurrent(this)
        || this.disposed || this.device.disposed || this.device.contextLost
        || this.device.generation !== this.observedDeviceGeneration
        || programDisposalState(this.device).epoch !== this.observedDeviceEpoch || this.entries.get(key) !== entry
        || entry.status !== "ready" || entry.program !== program) return undefined;
      return program;
    } catch {
      // Speculation must not replace the ordinary acquire's error behavior.
      return undefined;
    }
  }

  /**
   * Account for already-performed logical acquires after a pair reaches its
   * corresponding draw boundaries. A failed identity check changes nothing.
   */
  commitReadyReuse(features: ProgramFeatures, expectedProgram: RenderShaderProgram, count: number): boolean {
    const stateCurrent = programCacheStateChecks.get(this);
    if (!stateCurrent || !stateCurrent() || !programCacheMethodsCurrent(this)
      || (count !== 1 && count !== 2) || !Number.isSafeInteger(this.reuseCount + count)) return false;
    const program = programCachePeekIntrinsic.call(this, features);
    if (!program || program !== expectedProgram || !stateCurrent() || !programCacheMethodsCurrent(this)) return false;
    this.reuseCount += count;
    return true;
  }

  private acquireEntry(features: ProgramFeatures, warmup: boolean): CacheEntry {
    this.synchronizeGeneration();
    this.assertAlive();
    const disposalState = programDisposalState(this.device);
    disposalState.lossObserved = false;
    const normalized = normalizeProgramFeatures(features);
    const key = programKey(normalized);
    const existing = this.entries.get(key);
    if (existing && (existing.status !== "pending" || existing.pending !== undefined || existing.compiling)) {
      this.reuseCount += 1;
      return existing;
    }
    // A pending entry with no in-flight promise was bounded out by the T0-06
    // per-frame sync-compile bound — fall through to retry under this frame's
    // budget (or the async path).
    const entry: CacheEntry = existing ?? { key, status: "pending" };
    if (!existing) this.entries.set(key, entry);
    // Generators and device methods may invoke client callbacks. A nested
    // acquisition must observe this pending entry instead of compiling it a
    // second time; a loss, disposal or replacement must not publish the old
    // compile result into a new device generation.
    entry.compiling = true;
    const generation = this.generation;
    const deviceGeneration = this.device.generation;
    const deviceEpoch = disposalState.epoch;
    const stale = (): boolean => this.disposed || this.device.disposed || this.device.contextLost
      || generation !== this.generation || this.device.generation !== deviceGeneration
      || disposalState.epoch !== deviceEpoch
      || this.entries.get(key) !== entry || entry.status !== "pending";
    const retireStale = (): void => {
      entry.compiling = false;
      if (entry.status === "pending") {
        entry.status = "failed";
        entry.error = this.disposed || this.device.disposed ? "DISPOSED_PROGRAM_CACHE" : "DEVICE_LOST";
      }
      // A nested acquisition may already have installed a new generation.
      if (this.entries.get(key) === entry) this.entries.delete(key);
    };
    const started = Date.now();
    let sources: ShaderSources;
    try {
      const generated = generateProgramImpl(normalized, {
        flags: this.options.flags,
        onDegradation: this.options.onDegradation
      });
      // The current native device uses GLSL as its legacy reflection surface
      // and the generated descriptor to compile the matching WGSL template.
      // Supplying raw WGSL here would select the generic passthrough layout,
      // which does not bind the generated material, textures or AuraFrame.
      // This bridge is restricted to our own validated emissions; an external
      // emitter keeps its original sources and behavior.
      const reflectionSource = this.device.kind === "webgpu" && isBuiltinGeneratedWgsl(generated)
        ? generateProgramImpl({ ...generated.descriptor!.features, target: "glsl300es" }, {
            flags: this.options.flags,
            onDegradation: this.options.onDegradation
          })
        : generated;
      sources = {
        label: `a3d-program:${key.slice(0, 40)}`,
        marker: GENERATED_PROGRAM_MARKER,
        vertex: reflectionSource.vertex,
        fragment: reflectionSource.fragment,
        ...(generated.descriptor ? { generatedProgram: generated.descriptor } : {})
      };
    } catch (error) {
      if (stale()) {
        retireStale();
        return entry;
      }
      entry.compiling = false;
      entry.status = "failed";
      entry.error = describeCompileError(error);
      this.reportCompileFailure(entry);
      return entry;
    }

    if (stale()) {
      retireStale();
      return entry;
    }

    if (this.parallel && typeof this.device.compileAsync === "function") {
      // The cancellation barrier belongs to the cache, not the driver promise:
      // warmup and held handles must settle even if a driver never settles.
      entry.pending = new Promise<void>((resolve) => { entry.settle = resolve; });
      entry.compiling = false;
      const settle = (): void => {
        entry.settle?.();
        entry.settle = undefined;
        entry.pending = undefined;
        if (!this.disposed) notifyProgramReadiness(this.device);
      };
      const finishCompilation = trackProgramCompilation(this, entry);
      let compilation: Promise<RenderShaderProgram>;
      try {
        try { recordStaticGeneratedUnlitSources(sources); } catch { /* Optional source admission must not prevent compilation. */ }
        compilation = Promise.resolve(this.device.compileAsync(sources));
      } catch (error) {
        compilation = Promise.reject(error);
      }
      void compilation.then((program) => {
        try {
          const owner = { owner: this, key, deviceGeneration, deviceEpoch };
          if (stale()) {
            retireStale();
            try {
              releaseProgram(this.device, program, undefined, { ...owner, origin: "stale" });
            } finally {
              settle();
            }
            return;
          }
          const claimed = claimProgram(this.device, program, entry, owner);
          if (stale()) {
            retireStale();
            try {
              releaseProgram(this.device, program, claimed ? entry : undefined, { ...owner, origin: "stale" });
            } finally {
              settle();
            }
            return;
          }
          if (!claimed) {
            entry.status = "failed";
            entry.error = "Compiled shader program is already retired";
            this.compileMsTotal += Date.now() - started;
            settle();
            this.reportCompileFailure(entry);
            return;
          }
          entry.status = "ready";
          entry.program = program;
          this.compileMsTotal += Date.now() - started;
          this.noteCompiled();
          settle();
        } finally {
          finishCompilation();
        }
        })
        .catch((error: unknown) => {
          try {
          if (entry.status !== "pending") {
            settle();
            return;
          }
          const code = compileErrorCode(error);
          if (this.disposed || this.device.disposed || this.device.contextLost || generation !== this.generation || this.device.generation !== deviceGeneration || code === "DEVICE_LOST" || code === "CONTEXT_LOST" || code === "DISPOSED_DEVICE") {
            entry.status = "failed";
            entry.error = this.disposed || this.device.disposed ? "DISPOSED_PROGRAM_CACHE" : "DEVICE_LOST";
            if (this.entries.get(key) === entry) this.entries.delete(key);
            settle();
            return;
          }
          entry.status = "failed";
          entry.error = describeCompileError(error);
          this.compileMsTotal += Date.now() - started;
          settle();
          this.reportCompileFailure(entry);
          } finally {
            finishCompilation();
          }
        });
    } else {
      if (!warmup && this.frameSyncCompiles >= this.maxSyncCompilesPerFrame) {
        // T0-06 per-frame bound: leave the entry pending (no compile, no
        // promise); the next frame's `acquire` retries under a fresh budget.
        entry.compiling = false;
        notifyProgramReadiness(this.device);
        return entry;
      }
      this.frameSyncCompiles += 1;
      const finishCompilation = trackProgramCompilation(this, entry);
      try {
        try { recordStaticGeneratedUnlitSources(sources); } catch { /* Optional source admission must not prevent compilation. */ }
        const program = this.device.createShaderProgram(sources);
        const owner = { owner: this, key, deviceGeneration, deviceEpoch };
        if (stale()) {
          retireStale();
          releaseProgram(this.device, program, undefined, { ...owner, origin: "stale" });
          return entry;
        }
        const claimed = claimProgram(this.device, program, entry, owner);
        if (stale()) {
          retireStale();
          releaseProgram(this.device, program, claimed ? entry : undefined, { ...owner, origin: "stale" });
          return entry;
        }
        entry.compiling = false;
        if (claimed) {
          entry.program = program;
          entry.status = "ready";
          this.noteCompiled();
        } else {
          entry.status = "failed";
          entry.error = "Compiled shader program is already retired";
          this.reportCompileFailure(entry);
        }
      } catch (error) {
        const code = compileErrorCode(error);
        if (stale() || code === "DEVICE_LOST" || code === "CONTEXT_LOST" || code === "DISPOSED_DEVICE") {
          retireStale();
          return entry;
        }
        entry.compiling = false;
        entry.status = "failed";
        entry.error = describeCompileError(error);
        this.reportCompileFailure(entry);
      } finally {
        finishCompilation();
      }
      this.compileMsTotal += Date.now() - started;
    }
    return entry;
  }

  async precompile(list: readonly ProgramFeatures[]): Promise<void> {
    this.assertAlive();
    // Warmup is an explicit readiness barrier: unlike per-frame acquisition,
    // it cannot silently leave excess synchronous compiles queued for a frame.
    const entries = list.map((features) => this.acquireEntry(features, true));
    await Promise.all(entries.flatMap((entry) => entry.pending ? [entry.pending] : []));
    const failed = entries.find((entry) => entry.status !== "ready");
    if (failed) {
      const reason = failed.error ?? "Program did not finish compiling";
      throw new RenderDeviceError(`Program warmup failed: ${reason}`, reason === "DEVICE_LOST" ? "DEVICE_LOST" : reason === "DISPOSED_PROGRAM_CACHE" ? "DISPOSED_PROGRAM_CACHE" : "PROGRAM_COMPILE_FAILED");
    }
  }

  stats(): { readonly compiled: number; readonly pending: number; readonly failed: number; readonly compileMsTotal: number; readonly compiledSinceReady: number } {
    let compiled = 0;
    let pending = 0;
    let failed = 0;
    for (const entry of this.entries.values()) {
      if (entry.status === "ready") compiled++;
      else if (entry.status === "pending") pending++;
      else failed++;
    }
    return { compiled, pending, failed, compileMsTotal: this.compileMsTotal, compiledSinceReady: this.compiledSinceReadyCount };
  }

  /** PRD-01 Phase 6 C-31: introspection for the lane's `programs` section. */
  keys(): readonly string[] {
    return [...this.entries.keys()];
  }

  /** Acquires served from an existing entry (cache hits). */
  get reused(): number {
    return this.reuseCount;
  }

  dispose(): void {
    if (disposingCaches.has(this)) throw new Error("Program cache cleanup is already in progress");
    const state = programDisposalState(this.device);
    const since = state.failures.length;
    const wasDisposed = this.disposed;
    const pending = [...state.pending].filter(([, retirement]) =>
      retirement.requests.some((request) => request.owner === this));
    const errors: unknown[] = [];
    disposingCaches.add(this);
    try {
      if (!wasDisposed) {
        this.disposed = true;
        // Detach and settle every entry before any disposer can reenter.
        const programs = detachCacheEntries(this.entries, state, this, this.observedDeviceGeneration, "DISPOSED_PROGRAM_CACHE");
        try { this.unsubscribeDeviceLost?.(); } catch (error) { errors.push(error); }
        for (const { program, entry, owner } of programs) {
          releaseProgram(this.device, program, entry, { ...owner, origin: "dispose" });
        }
      }
      // Only a later explicit cache disposal may retry a native pending
      // contract. A newly observed alias never repeats this pass's attempt.
      for (const [program, retirement] of pending) {
        if (retirement.phase === "retiring") reportProgramDisposalInProgress(state, retirement, this);
        else if (retirement.phase === "retryable" && (wasDisposed || retirement.retryOwner === this)) {
          retryProgramDisposal(this.device, state, program, retirement);
        } else if (retirement.phase === "uncertain") observeUncertainProgram(state, program, retirement);
      }
    } finally {
      disposingCaches.delete(this);
    }
    errors.push(...programDisposalErrors(state, this, since));
    if (errors.length) throw new AggregateError(errors, "One or more shader programs could not be disposed");
  }

  private assertAlive(): void {
    if (this.disposed || this.device.disposed) throw new RenderDeviceError("Program cache is disposed", "DISPOSED_PROGRAM_CACHE");
    if (this.device.contextLost) throw new RenderDeviceError("Render device is lost", "DEVICE_LOST");
  }

  private synchronizeGeneration(): void {
    const epoch = programDisposalState(this.device).epoch;
    if (this.device.generation !== this.observedDeviceGeneration || epoch !== this.observedDeviceEpoch) {
      this.observedDeviceGeneration = this.device.generation;
      this.observedDeviceEpoch = epoch;
      this.invalidateGeneration();
    }
  }

  /** A restored device must never reuse a program from its former generation. */
  private invalidateGeneration(): void {
    this.generation += 1;
    const state = programDisposalState(this.device);
    const programs = detachCacheEntries(this.entries, state, this, this.observedDeviceGeneration, "DEVICE_LOST");
    for (const { program, entry, owner } of programs) {
      releaseProgram(this.device, program, entry, { ...owner, origin: "generation" });
    }
  }

  /**
   * T0-03/C-36: one `program-compile-failed` degradation + one console.error
   * per failed key, recorded when the entry first flips to `failed` (repeat
   * acquires reuse the entry and never re-report).
   */
  private reportCompileFailure(entry: CacheEntry): void {
    const message = `generated program failed to compile (key ${entry.key}): ${entry.error ?? "unknown error"}`;
    const degradation: ProgramDegradation = { code: "program-compile-failed", message, ownerPrd: 1 };
    if (this.options.onDegradation) {
      try { this.options.onDegradation(degradation); } catch { /* A diagnostic listener cannot stall shader settlement. */ }
    } else {
      // Standalone callers retain the legacy log, bounded to avoid unbounded
      // retention. App/device callers receive only their own diagnostic sink.
      if (programDegradationLog.length >= 64) programDegradationLog.shift();
      programDegradationLog.push(degradation);
    }
    console.error(`[prd01] ${message}`);
  }

}

// Capture every method involved in normal acquisition and speculative
// accounting before any instance exists. The internal capability is valid
// only while the original concrete cache behavior remains in place.
const programCachePrototype = ProgramCache.prototype;
const programCacheParent = Object.getPrototypeOf(programCachePrototype) as object | null;
const programCacheMethodDescriptors = [
  "acquire", "acquireEntry", "peekReady", "commitReadyReuse", "reused", "synchronizeGeneration", "invalidateGeneration",
  "assertAlive", "noteCompiled", "reportCompileFailure"
].map((name) => [name, Object.getOwnPropertyDescriptor(programCachePrototype, name)] as const);
const programCachePeekIntrinsic = programCachePrototype.peekReady;
const programCacheCommitIntrinsic = programCachePrototype.commitReadyReuse;
const programCacheStateChecks = new WeakMap<ProgramCache, () => boolean>();

function programCacheMethodsCurrent(cache: ProgramCache): boolean {
  try {
    if (Object.getPrototypeOf(cache) !== programCachePrototype || Object.getPrototypeOf(programCachePrototype) !== programCacheParent) return false;
    return programCacheMethodDescriptors.every(([name, before]) => {
      if (!before || Object.hasOwn(cache, name)) return false;
      const after = Object.getOwnPropertyDescriptor(programCachePrototype, name);
      return after !== undefined && after.value === before.value && after.get === before.get && after.set === before.set
        && after.writable === before.writable && after.enumerable === before.enumerable && after.configurable === before.configurable;
    });
  } catch { return false; }
}

/** Reject runtime replacement of the cache's state or an accessor for it. */
function captureProgramCacheState(cache: ProgramCache): () => boolean {
  const names = ["device", "options", "entries", "parallel", "maxSyncCompilesPerFrame", "unsubscribeDeviceLost",
    "compileMsTotal", "reuseCount", "disposed", "frameSyncCompiles", "readyMarked", "compiledSinceReadyCount",
    "generation", "observedDeviceGeneration", "observedDeviceEpoch"] as const;
  const variable = new Set<string>(["compileMsTotal", "reuseCount", "disposed", "frameSyncCompiles", "readyMarked",
    "compiledSinceReadyCount", "generation", "observedDeviceGeneration", "observedDeviceEpoch"]);
  const expected = names.map((name) => [name, Object.getOwnPropertyDescriptor(cache, name)] as const);
  return () => {
    try {
      for (const [name, before] of expected) {
        const after = Object.getOwnPropertyDescriptor(cache, name);
        if (!before || !("value" in before) || !after || !("value" in after)
          || after.writable !== before.writable || after.enumerable !== before.enumerable || after.configurable !== before.configurable) return false;
        if (!variable.has(name) && after.value !== before.value) return false;
        if (variable.has(name) && name !== "observedDeviceGeneration" && typeof after.value !== typeof before.value) return false;
        if (name === "observedDeviceGeneration" && after.value !== undefined && typeof after.value !== "number") return false;
        if (name === "entries" && (Object.getPrototypeOf(after.value) !== Map.prototype || Reflect.ownKeys(after.value).length !== 0)) return false;
      }
      return true;
    } catch { return false; }
  };
}

const INVALID_FEATURE_DATA = Symbol("invalid-program-feature-data");

/** Copy only plain own data, without invoking feature or nested value getters. */
function copyPlainFeatures(value: unknown, ancestors: WeakSet<object>): unknown {
  if (value === null || value === undefined || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "object" || ancestors.has(value)) return INVALID_FEATURE_DATA;
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return INVALID_FEATURE_DATA;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result: Record<string, unknown> | unknown[] = array
    ? new Array((descriptors.length as PropertyDescriptor).value as number)
    : Object.create(null) as Record<string, unknown>;
  ancestors.add(value);
  try {
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== "string") return INVALID_FEATURE_DATA;
      if (array && key === "length") continue;
      const descriptor = Reflect.get(descriptors, key) as PropertyDescriptor;
      if (!("value" in descriptor)) return INVALID_FEATURE_DATA;
      const copied = copyPlainFeatures(descriptor.value, ancestors);
      if (copied === INVALID_FEATURE_DATA) return INVALID_FEATURE_DATA;
      Object.defineProperty(result, key, { value: copied, enumerable: descriptor.enumerable, writable: true, configurable: true });
    }
  } finally {
    ancestors.delete(value);
  }
  return result;
}

/** Match computeProgramKey's stable serialization without its mutable memo. */
function serializeFeatureKey(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(serializeFeatureKey).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${serializeFeatureKey(entry)}`).join(",")}}`;
}

function compileErrorCode(error: unknown): unknown {
  try {
    return error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Error text for a failed program (T0-03/C-36). It appends the driver info log
 * and the stage from `RenderDeviceError.details`, so a remote run (strict
 * throw, console.error, C-36 degradation) says which line failed and why
 * instead of only "WebGL shader compile failed".
 */
export function describeCompileError(error: unknown): string {
  try {
    if (!(error instanceof Error)) {
      const primitive = typeof error === "string" ? error : error === null ? "null" : ["number", "bigint", "boolean", "undefined"].includes(typeof error) ? String(error) : "Unknown shader compile error";
      return sanitizeShaderDiagnosticText(primitive).slice(0, 1300);
    }
    const message = typeof error.message === "string" ? error.message : "Shader compile failed";
    const details = (error as { details?: { log?: unknown; stage?: unknown } }).details;
    const log = typeof details?.log === "string" ? details.log.trim() : "";
    if (!log) return sanitizeShaderDiagnosticText(message).slice(0, 1300);
    const firstLine = log.split("\n").map((line) => line.trim()).find((line) => line.length > 0);
    if (firstLine !== undefined && message.includes(firstLine)) return sanitizeShaderDiagnosticText(message).slice(0, 1300);
    const stageValue = details?.stage;
    const stage = typeof stageValue === "string" || typeof stageValue === "number" ? ` [stage ${stageValue}]` : "";
    return sanitizeShaderDiagnosticText(`${message}${stage}: ${log.length > 1200 ? `${log.slice(0, 1200)}…` : log}`).slice(0, 1300);
  } catch {
    return "Unknown shader compile error";
  }
}
