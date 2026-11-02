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
import { programCacheSlot } from "../contracts/program";
import type { RenderDevice, RenderShaderProgram, ShaderSources } from "../RenderDevice";
import { SELECTIVE_BLOOM_FEATURE } from "../postprocess/NativeBloomPyramid";
import { generateProgramImpl, generatedProgramSupportsSelectiveBloom, GENERATED_PROGRAM_MARKER, programDegradationLog, type GenerateProgramOptions, type ProgramDegradation } from "./ProgramGenerator";
import { normalizeProgramFeatures } from "./ProgramFeatures";
import { programKey } from "./ProgramKey";

interface CacheEntry {
  key: string;
  status: "pending" | "ready" | "failed";
  program?: RenderShaderProgram;
  error?: string;
  pending?: Promise<void>;
  /** A speculative failure is reported only if an ordinary acquire asks for it. */
  selectivePrewarmOnly?: boolean;
  /** Exact ordinary source and its generation-time producer authentication. */
  ordinarySources?: ShaderSources;
  ordinarySelectiveSafe?: boolean;
  selectiveBaseKey?: string;
}

/*
 * Let ForwardPass discover that this module is already loaded without
 * importing the generator on a flag-off / custom-provider frame. The
 * discovery set is not an authority: isBuiltinSelectiveBloomCache also checks
 * the module-private set and the exact prototype. This property is
 * non-enumerable and never changes normal cache or provider behavior.
 *
 * Keep this key in sync with ForwardPass. A missing/frozen slot simply makes
 * the optional optimization unavailable.
 */
const SELECTIVE_CACHE_DISCOVERY = Symbol.for("aura3d.prd01.selectiveBloom.builtinCaches");
const SELECTIVE_VERIFY = Symbol("selective-bloom-verify");
const SELECTIVE_CAPTURED_PREWARM = Symbol("selective-bloom-captured-prewarm");
const SELECTIVE_CAPTURED_VERIFY = Symbol("selective-bloom-captured-verify");
const builtinCacheInstances = new WeakSet<object>();

function markBuiltinCache(cache: object): void {
  builtinCacheInstances.add(cache);
  try {
    let descriptor = Object.getOwnPropertyDescriptor(programCacheSlot, SELECTIVE_CACHE_DISCOVERY);
    if (!descriptor) {
      Object.defineProperty(programCacheSlot, SELECTIVE_CACHE_DISCOVERY, { value: new WeakSet<object>() });
      descriptor = Object.getOwnPropertyDescriptor(programCacheSlot, SELECTIVE_CACHE_DISCOVERY);
    }
    WeakSet.prototype.add.call(descriptor?.value, cache);
  } catch {
    // Discovery is optional; ordinary ProgramCache construction must not fail.
  }
}

export type CapturedSelectiveBloomPrewarm =
  | { readonly reason: string; readonly handles?: never }
  | { readonly reason?: never; readonly handles: readonly ProgramHandle[] };

/** Add only a second output to the exact ordinary GLSL; never regenerate hooks. */
function selectiveSources(sources: ShaderSources): ShaderSources | undefined {
  const declaration = "layout(location = 0) out vec4 outColor;";
  const write = "  outColor = vec4(a3dColor, a3dAlpha);";
  const coverage = "#ifdef BACKGROUND_COVERAGE\nlayout(location = 1) out vec4 outCoverage;\n#endif";
  const fragment = sources.fragment;
  if (fragment.includes("a3dBloomSignal") || fragment.indexOf(declaration) < 0 ||
      fragment.indexOf(declaration) !== fragment.lastIndexOf(declaration) ||
      fragment.indexOf(write) < 0 || fragment.indexOf(write) !== fragment.lastIndexOf(write) ||
      /\blayout\s*\(\s*location\s*=\s*1\s*\)\s*out\b/.test(fragment.replace(coverage, ""))) return undefined;
  return {
    ...sources,
    fragment: fragment
      .replace(declaration, `${declaration}\nlayout(location = 1) out vec4 a3dBloomSignal;\nuniform float u_a3dBloomWeight;\nuniform float u_a3dBloomMaxRadiance;`)
      .replace(write, `${write}\n  a3dBloomSignal = vec4(clamp(a3dColor, -u_a3dBloomMaxRadiance, u_a3dBloomMaxRadiance) * (0.5 * u_a3dBloomWeight), 1.0);`)
  };
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
  private readonly frameOrdinaryKeys = new Set<string>();
  private readonly previousOrdinaryKeys = new Set<string>();
  private readonly parallel: boolean;
  private readonly maxSyncCompilesPerFrame: number;
  private compileMsTotal = 0;
  private reuseCount = 0;
  private disposed = false;
  private frameSyncCompiles = 0;
  private readyMarked = false;
  private compiledSinceReadyCount = 0;

  constructor(
    private readonly device: RenderDevice,
    private readonly options: ProgramCacheOptions = {}
  ) {
    this.parallel = options.parallelCompile ?? device.probe?.parallelShaderCompile ?? false;
    this.maxSyncCompilesPerFrame = options.maxSyncCompilesPerFrame ?? 8;
    if (new.target === ProgramCache) markBuiltinCache(this);
  }

  /** T0-06: start of a frame's sync-compile budget. */
  beginFrame(): void {
    this.frameSyncCompiles = 0;
    this.previousOrdinaryKeys.clear();
    for (const key of this.frameOrdinaryKeys) this.previousOrdinaryKeys.add(key);
    this.frameOrdinaryKeys.clear();
  }

  /** T0-06: mark the ready barrier — later compiles count `compiledSinceReady`. */
  markReady(): void {
    this.readyMarked = true;
  }

  private noteCompiled(): void {
    if (this.readyMarked) this.compiledSinceReadyCount += 1;
  }

  acquire(features: ProgramFeatures): ProgramHandle {
    const normalized = normalizeProgramFeatures(features);
    const key = programKey(normalized);
    if (normalized.features[SELECTIVE_BLOOM_FEATURE] !== true) this.frameOrdinaryKeys.add(key);
    const existing = this.entries.get(key);
    // Keep a successfully drawn selective program's observed ordinary base in
    // the next frame's history as well. No selection or generation runs here.
    if (normalized.features[SELECTIVE_BLOOM_FEATURE] === true && existing?.selectiveBaseKey) {
      this.frameOrdinaryKeys.add(existing.selectiveBaseKey);
    }
    if (existing?.selectivePrewarmOnly) {
      // Normal callers retain the normal one-time failure diagnostic, even
      // when the optional prewarm failed before they requested this key.
      existing.selectivePrewarmOnly = false;
      if (existing.status === "failed") this.reportCompileFailure(existing);
    }
    if (existing && (existing.status !== "pending" || existing.pending !== undefined)) {
      this.reuseCount += 1;
      return this.toHandle(existing);
    }
    // A pending entry with no in-flight promise was bounded out by the T0-06
    // per-frame sync-compile bound — fall through to retry under this frame's
    // budget (or the async path).
    const entry: CacheEntry = existing ?? { key, status: "pending" };
    if (!existing) this.entries.set(key, entry);
    const started = Date.now();
    let sources: ShaderSources;
    try {
      const generated = generateProgramImpl(normalized, {
        flags: this.options.flags,
        onDegradation: this.options.onDegradation
      });
      sources = {
        label: `a3d-program:${key.slice(0, 40)}`,
        marker: GENERATED_PROGRAM_MARKER,
        vertex: generated.vertex,
        fragment: generated.fragment
      };
      if (normalized.features[SELECTIVE_BLOOM_FEATURE] !== true) {
        entry.ordinarySelectiveSafe = generated.key === key && generatedProgramSupportsSelectiveBloom(generated);
        // Only a provenance-safe base on an async-compile cache can ever gain
        // the signal output; other programs keep no extra copy of their GLSL.
        if (entry.ordinarySelectiveSafe && this.parallel) entry.ordinarySources = sources;
      }
    } catch (error) {
      entry.status = "failed";
      entry.error = describeCompileError(error);
      this.reportCompileFailure(entry);
      return this.toHandle(entry);
    }

    if (this.parallel && typeof this.device.compileAsync === "function") {
      entry.pending = this.device.compileAsync(sources)
        .then((program) => {
          entry.status = "ready";
          entry.program = program;
          this.compileMsTotal += Date.now() - started;
          this.noteCompiled();
        })
        .catch((error: unknown) => {
          // DEVICE_LOST (app dispose or a real context loss) is not a compile
          // failure — keep the entry pending so acquire() retries under the
          // restored context instead of permanently poisoning the key with a
          // program-compile-failed degradation + console.error at teardown.
          if ((error as { code?: string }).code === "DEVICE_LOST" || this.disposed) {
            entry.pending = undefined;
            return;
          }
          entry.status = "failed";
          entry.error = describeCompileError(error);
          this.reportCompileFailure(entry);
          this.compileMsTotal += Date.now() - started;
        });
    } else {
      if (this.frameSyncCompiles >= this.maxSyncCompilesPerFrame) {
        // T0-06 per-frame bound: leave the entry pending (no compile, no
        // promise); the next frame's `acquire` retries under a fresh budget.
        return this.toHandle(entry);
      }
      this.frameSyncCompiles += 1;
      try {
        entry.program = this.device.createShaderProgram(sources);
        entry.status = "ready";
        this.noteCompiled();
      } catch (error) {
        entry.status = "failed";
        entry.error = describeCompileError(error);
        this.reportCompileFailure(entry);
      }
      this.compileMsTotal += Date.now() - started;
    }
    return this.toHandle(entry);
  }

  /**
   * Internal selective-bloom-only prewarm. The exported wrapper authenticates
   * the exact cache before calling this captured implementation. Never invokes
   * the app's degradation sink, feature selectors, or feature binders for an
   * optional request; ordinary acquire keeps its existing reporting behavior.
   */
  [SELECTIVE_VERIFY](device: RenderDevice, flags: QrFlags): boolean {
    return !this.disposed && this.device === device && this.options.flags === flags && this.parallel;
  }

  [SELECTIVE_CAPTURED_PREWARM](
    device: RenderDevice,
    flags: QrFlags,
    compile: NonNullable<RenderDevice["compileAsync"]>
  ): CapturedSelectiveBloomPrewarm {
    if (this.disposed || this.device !== device || this.options.flags !== flags || !this.parallel || this.frameOrdinaryKeys.size === 0) {
      return { reason: "signal-program-unavailable" };
    }
    const prepared: { readonly key: string; readonly base: CacheEntry; readonly sources: ShaderSources; readonly optional: boolean }[] = [];
    const candidates = new Map<string, boolean>();
    for (const key of this.frameOrdinaryKeys) candidates.set(key, false);
    // Renderer warmup omits the legacy fog axis and per-item environment-cube
    // override. Match previous ordinary *draw* variants ignoring only those
    // axes; all other feature values must still match an ordinary warm key.
    // Their exact draw-time keys are checked again before they can be used.
    const warmShapes = new Set<string>();
    for (const key of this.frameOrdinaryKeys) {
      try {
        const record = JSON.parse(key) as ProgramFeatures;
        warmShapes.add(programKey({ ...record, fog: "none", environment: "none" }));
      } catch {
        // The required candidate below will decline an unusable record.
      }
    }
    for (const key of this.previousOrdinaryKeys) {
      if (candidates.has(key)) continue;
      const entry = this.entries.get(key);
      if (!entry || entry.status !== "ready" || !entry.ordinarySelectiveSafe) continue;
      try {
        const record = JSON.parse(key) as ProgramFeatures;
        if (warmShapes.has(programKey({ ...record, fog: "none", environment: "none" }))) candidates.set(key, true);
      } catch {
        // Unusual ordinary records remain available normally, never here.
      }
    }
    for (const [baseKey, optional] of candidates) {
      const base = this.entries.get(baseKey);
      if (!base || base.status === "pending") {
        if (optional) continue;
        return { reason: "signal-program-pending" };
      }
      if (base.status !== "ready" || !base.program || base.program.disposed) {
        if (optional) continue;
        return { reason: "signal-program-unavailable" };
      }
      if (!base.ordinarySources || !base.ordinarySelectiveSafe) {
        if (optional) continue;
        return { reason: "shader-feature" };
      }
      const source = selectiveSources(base.ordinarySources);
      if (!source) {
        if (optional) continue;
        return { reason: "shader-feature" };
      }
      // The cache key is already canonical JSON from the ordinary acquire:
      // parsing it avoids inspecting material or user-owned feature objects.
      const features = JSON.parse(baseKey) as ProgramFeatures;
      const key = programKey({ ...features, features: { ...features.features, [SELECTIVE_BLOOM_FEATURE]: true } });
      const existing = this.entries.get(key);
      if (existing && (existing.selectiveBaseKey !== baseKey ||
          existing.ordinarySources?.vertex !== source.vertex || existing.ordinarySources?.fragment !== source.fragment)) {
        if (optional) continue;
        return { reason: "signal-program-unavailable" };
      }
      prepared.push({ key, base, sources: source, optional });
    }
    const handles: ProgramHandle[] = [];
    for (const candidate of prepared) {
      let entry = this.entries.get(candidate.key);
      if (!entry) {
        entry = {
          key: candidate.key,
          status: "pending",
          selectivePrewarmOnly: true,
          selectiveBaseKey: candidate.base.key,
          ordinarySources: candidate.sources
        };
        this.entries.set(candidate.key, entry);
      }
      if (entry.status === "pending" && !entry.pending && entry.selectivePrewarmOnly) {
        const started = Date.now();
        const current = entry;
        try {
          current.pending = compile.call(device, candidate.sources).then((program) => {
            if (this.disposed) { program.dispose(); return; }
            current.status = "ready";
            current.program = program;
            this.compileMsTotal += Date.now() - started;
            if (this.readyMarked) this.compiledSinceReadyCount += 1;
          }).catch((error: unknown) => {
            if ((error as { code?: string } | null | undefined)?.code === "DEVICE_LOST" || this.disposed) {
              current.pending = undefined;
              return;
            }
            current.status = "failed";
            current.error = describeCompileError(error);
            if (!current.selectivePrewarmOnly) this.reportCompileFailure(current);
            this.compileMsTotal += Date.now() - started;
          });
        } catch (error) {
          if ((error as { code?: string } | null | undefined)?.code !== "DEVICE_LOST" && !this.disposed) {
            current.status = "failed";
            current.error = describeCompileError(error);
          }
        }
      }
      // An unused older draw must not block this frame; if it is still
      // compiling, draw-time key validation safely falls back until ready.
      if (!candidate.optional || entry.status === "ready") handles.push(entry);
    }
    return { handles };
  }

  [SELECTIVE_CAPTURED_VERIFY](key: string): boolean {
    const entry = this.entries.get(key);
    const base = entry?.selectiveBaseKey ? this.entries.get(entry.selectiveBaseKey) : undefined;
    return !!entry && entry.status === "ready" && !!entry.program && !entry.program.disposed &&
      !!base && base.status === "ready" && !!base.program && !base.program.disposed && base.ordinarySelectiveSafe === true;
  }

  async precompile(list: readonly ProgramFeatures[]): Promise<void> {
    const pending: Promise<void>[] = [];
    for (const features of list) {
      this.acquire(features);
    }
    for (const entry of this.entries.values()) {
      if (entry.pending) pending.push(entry.pending);
    }
    await Promise.all(pending);
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
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.entries.values()) {
      entry.program?.dispose();
    }
    this.entries.clear();
  }

  /**
   * T0-03/C-36: one `program-compile-failed` degradation + one console.error
   * per failed key, recorded when the entry first flips to `failed` (repeat
   * acquires reuse the entry and never re-report).
   */
  private reportCompileFailure(entry: CacheEntry): void {
    const message = `generated program failed to compile (key ${entry.key}): ${entry.error ?? "unknown error"}`;
    const degradation: ProgramDegradation = { code: "program-compile-failed", message, ownerPrd: 1 };
    programDegradationLog.push(degradation);
    this.options.onDegradation?.(degradation);
    console.error(`[prd01] ${message}`);
  }

  /** Return the live entry so a held "pending" handle observes the flip to ready/failed. */
  private toHandle(entry: CacheEntry): ProgramHandle {
    return entry as ProgramHandle;
  }
}

const builtinAcquire = ProgramCache.prototype.acquire;
const builtinSelectiveVerify = ProgramCache.prototype[SELECTIVE_VERIFY];
const builtinCapturedPrewarm = ProgramCache.prototype[SELECTIVE_CAPTURED_PREWARM];
const builtinCapturedVerify = ProgramCache.prototype[SELECTIVE_CAPTURED_VERIFY];

/** Authenticate a stock, device-bound cache with an asynchronous compiler. */
export function isBuiltinSelectiveBloomCache(cache: ProgramCacheLike, device: RenderDevice, flags: QrFlags): boolean {
  if (!builtinCacheInstances.has(cache) || Object.getPrototypeOf(cache) !== ProgramCache.prototype ||
      Object.getOwnPropertyDescriptor(cache, "acquire") !== undefined ||
      Object.getOwnPropertyDescriptor(ProgramCache.prototype, "acquire")?.value !== builtinAcquire) return false;
  return builtinSelectiveVerify.call(cache as ProgramCache, device, flags);
}

/** Derive optional programs from captured ordinary warmup or matching previous draw sources. */
export function prewarmCapturedSelectiveBloom(
  cache: ProgramCacheLike,
  device: RenderDevice,
  flags: QrFlags,
  compile: NonNullable<RenderDevice["compileAsync"]>
): CapturedSelectiveBloomPrewarm {
  if (!isBuiltinSelectiveBloomCache(cache, device, flags)) return { reason: "generated-programs-unavailable" };
  return builtinCapturedPrewarm.call(cache as ProgramCache, device, flags, compile);
}

export function capturedSelectiveBloomReady(cache: ProgramCacheLike, device: RenderDevice, flags: QrFlags, key: string): boolean {
  return isBuiltinSelectiveBloomCache(cache, device, flags) && builtinCapturedVerify.call(cache as ProgramCache, key);
}

/**
 * Error text for a failed program (T0-03/C-36). It appends the driver info log
 * and the stage from `RenderDeviceError.details`, so a remote run (strict
 * throw, console.error, C-36 degradation) says which line failed and why
 * instead of only "WebGL shader compile failed".
 */
export function describeCompileError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const details = (error as { details?: { log?: unknown; stage?: unknown } }).details;
  const log = typeof details?.log === "string" ? details.log.trim() : "";
  if (!log) return error.message;
  // Thrown shader-compile errors already carry the head of the log in `message`.
  const firstLine = log.split("\n").map((line) => line.trim()).find((line) => line.length > 0);
  if (firstLine !== undefined && error.message.includes(firstLine)) return error.message;
  const stage = details?.stage === undefined ? "" : ` [stage ${String(details.stage)}]`;
  return `${error.message}${stage}: ${log.length > 1200 ? `${log.slice(0, 1200)}…` : log}`;
}
