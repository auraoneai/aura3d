import { RenderDeviceError, type RenderTarget, type RenderTargetDescriptor } from "../RenderDevice";
import { PostViewHistory, type AutoExposureOptionsV2 } from "./PostGraph";
import { EXPOSURE_ADAPT_WGSL, EXPOSURE_LUMA_LOG_WGSL, EXPOSURE_MUL_WGSL, EXPOSURE_REDUCE_WGSL } from "./shaders/exposure.wgsl";

/** Limits bound metering work independently of the source image size. */
export const WEBGPU_EXPOSURE_METER_EDGE = 256;
export const WEBGPU_EXPOSURE_MAX_DIMENSION = 16384;
const MAX_FRAME_DELTA_SECONDS = 60;

export interface WebGPUExposureFrame {
  readonly scopeId: object;
  readonly viewId: string | number;
  readonly frameId: number;
  /** Renderer-captured monotonic seconds, shared by every view of the authored frame. */
  readonly timeSeconds: number;
  readonly cameraCut?: boolean;
  readonly deviceGeneration?: unknown;
}

export interface WebGPUExposureDraw {
  readonly label: string;
  readonly fragment: string;
  readonly entryPoint: string;
  /** Byte-correct WGSL uniform payload; textures use bindings 2 and 3. */
  readonly uniforms: Uint8Array;
  readonly sources: readonly RenderTarget[];
  readonly target: RenderTarget;
}

/**
 * `draw` enqueues in the device queue; it must lease every source and target
 * until the submitted work has completed and use unfilterable-float bindings.
 * Disposing a target must also defer native destruction until that queue fence.
 */
export interface WebGPUExposureHost {
  createTarget(descriptor: RenderTargetDescriptor): RenderTarget;
  draw(pass: WebGPUExposureDraw): void;
  disposeTarget?(target: RenderTarget): void;
}

export interface WebGPUExposureResult {
  /** Borrowed view-owned target, valid until the next execution/reset of this view. */
  readonly target: RenderTarget;
  /** Call only after the entire presentation was successfully submitted. */
  commit(): void;
  /** Abandon the history write if this or a subsequent presentation step fails. */
  abort(): void;
}

interface HistoryTarget { readonly target: RenderTarget; timeSeconds: number; }
interface Scratch {
  readonly width: number;
  readonly height: number;
  readonly format: "rgba16f" | "rgba32f";
  readonly levels: readonly RenderTarget[];
  readonly output: RenderTarget;
  readonly strideX: number;
  readonly strideY: number;
  readonly deviceGeneration: unknown;
  frameId: number;
  frameKey: string;
}

interface RetiredScratchTarget {
  readonly scopeId: object;
  readonly viewId: string | number;
  readonly target: RenderTarget;
}

interface ExposureCleanup {
  readonly attemptedScratch: Set<RetiredScratchTarget>;
  readonly attemptedHistory: Set<HistoryTarget>;
  readonly errors: unknown[];
  historyDisposed: boolean;
}

function invalid(message: string): never {
  throw new RenderDeviceError(message, "WEBGPU_AUTO_EXPOSURE_INVALID");
}

/**
 * Fail before allocating or submitting on malformed option bags. The native
 * EV and compensation bounds are [-32, 32], and adaptation speeds are bounded
 * to [0, 65536] per second.
 */
export function normalizeWebGPUAutoExposure(options: Partial<AutoExposureOptionsV2>): AutoExposureOptionsV2 {
  if (!options || typeof options !== "object" || Array.isArray(options)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(options))) invalid("Auto exposure options must be a plain object");
  const minEv = options.minEv === undefined ? -4 : options.minEv, maxEv = options.maxEv === undefined ? 4 : options.maxEv;
  const speedUp = options.speedUp === undefined ? 3 : options.speedUp, speedDown = options.speedDown === undefined ? 1 : options.speedDown;
  const compensationEv = options.compensationEv === undefined ? 0 : options.compensationEv;
  const meteringMask = options.meteringMask === undefined ? "center-weighted" : options.meteringMask;
  if (![minEv, maxEv, speedUp, speedDown, compensationEv].every(value => typeof value === "number" && Number.isFinite(value))) invalid("Auto exposure parameters must be finite numbers");
  // Finite bounds keep exponentiation and half-float EV storage meaningful.
  if (minEv < -32 || maxEv > 32 || minEv > maxEv || Math.abs(compensationEv) > 32) invalid("Auto exposure EV range is invalid");
  if (speedUp < 0 || speedDown < 0 || speedUp > 65536 || speedDown > 65536) invalid("Auto exposure speeds must be in [0, 65536]");
  if (meteringMask !== "center-weighted" && meteringMask !== "average") invalid("Auto exposure metering mask is invalid");
  return { minEv, maxEv, speedUp, speedDown, compensationEv, meteringMask };
}

function validateFrame(frame: WebGPUExposureFrame): void {
  if (!frame || !frame.scopeId || typeof frame.scopeId !== "object"
    || (typeof frame.viewId !== "string" && (typeof frame.viewId !== "number" || !Number.isFinite(frame.viewId)))
    || !Number.isSafeInteger(frame.frameId) || frame.frameId < 0
    || (frame.cameraCut !== undefined && typeof frame.cameraCut !== "boolean")) {
    throw new RenderDeviceError("Auto exposure requires a stable renderer, view and frame identity", "POSTPROCESS_HISTORY_IDENTITY_REQUIRED");
  }
  if (typeof frame.timeSeconds !== "number" || !Number.isFinite(frame.timeSeconds)) {
    throw new RenderDeviceError("Auto exposure requires the renderer's captured frame time", "WEBGPU_AUTO_EXPOSURE_TIME_REQUIRED");
  }
}

function validateSource(source: RenderTarget): asserts source is RenderTarget & { readonly colorTexture: RenderTarget["colorTexture"] & { readonly format: "rgba16f" | "rgba32f" } } {
  if (!source || source.disposed || source.colorTexture?.disposed || (source.colorTexture?.format !== "rgba16f" && source.colorTexture?.format !== "rgba32f")
    // 4x targets are metered through their single-sample color resolve (the host binds that view).
    || ((source.sampleCount ?? 1) !== 1 && source.sampleCount !== 4) || (source.dimension ?? "2d") !== "2d" || source.depthOnly) {
    throw new RenderDeviceError("WebGPU auto exposure requires a live, single-sample linear HDR color target", "WEBGPU_AUTO_EXPOSURE_HDR_REQUIRED");
  }
  if (!Number.isSafeInteger(source.width) || !Number.isSafeInteger(source.height) || source.width < 1 || source.height < 1
    || source.width > WEBGPU_EXPOSURE_MAX_DIMENSION || source.height > WEBGPU_EXPOSURE_MAX_DIMENSION) {
    throw new RenderDeviceError("WebGPU auto exposure source dimensions exceed the supported bound", "WEBGPU_AUTO_EXPOSURE_SIZE_UNSUPPORTED");
  }
}

function uintUniform(...values: number[]): Uint8Array {
  const data = new DataView(new ArrayBuffer(Math.max(16, Math.ceil(values.length / 4) * 16)));
  values.forEach((value, index) => data.setUint32(index * 4, value, true));
  return new Uint8Array(data.buffer);
}

function adaptUniform(options: AutoExposureOptionsV2, dt: number, hasPrevious: boolean): Uint8Array {
  const data = new DataView(new ArrayBuffer(32));
  [dt, options.speedUp, options.speedDown, options.minEv, options.maxEv, options.compensationEv]
    .forEach((value, index) => data.setFloat32(index * 4, value, true));
  data.setUint32(24, hasPrevious ? 1 : 0, true);
  return new Uint8Array(data.buffer);
}

/**
 * Per-device native pipeline. A view keeps one bounded metering pyramid, an
 * output target and two 1×1 history targets; there is no CPU/GPU readback.
 * Queue ordering permits reusing scratch between frames without a CPU wait.
 */
export class WebGPUAutoExposure {
  private readonly history = new PostViewHistory<HistoryTarget>();
  private readonly scopes = new Map<object, Map<string | number, Scratch>>();
  private readonly viewEpochs = new WeakMap<object, Map<string | number, object>>();
  private readonly retiredScratch = new Set<RetiredScratchTarget>();
  private cleanup?: ExposureCleanup;
  private disposed = false;
  constructor(private readonly host: WebGPUExposureHost) {}

  execute(source: RenderTarget, input: Partial<AutoExposureOptionsV2>, frame: WebGPUExposureFrame): WebGPUExposureResult {
    if (this.disposed) throw new RenderDeviceError("WebGPU auto exposure is disposed", "WEBGPU_AUTO_EXPOSURE_DISPOSED");
    const options = normalizeWebGPUAutoExposure(input);
    validateFrame(frame);
    validateSource(source);
    const views = this.scopes.get(frame.scopeId);
    const existing = views?.get(frame.viewId);
    const frameKey = JSON.stringify([frame.timeSeconds, frame.cameraCut === true, source.width, source.height, source.colorTexture.format, options]);
    if (existing && frame.frameId < existing.frameId) throw new RenderDeviceError("Auto exposure frame is out of order", "POST_HISTORY_FRAME_OUT_OF_ORDER");
    if (existing && frame.frameId === existing.frameId && (existing.frameKey !== frameKey || !Object.is(existing.deviceGeneration, frame.deviceGeneration))) {
      throw new RenderDeviceError("Auto exposure frame parameters changed within an authored frame", "POST_HISTORY_FRAME_CONFLICT");
    }
    const scratch = this.scratchFor(frame, source, frameKey, existing);
    scratch.frameId = frame.frameId;
    scratch.frameKey = frameKey;
    if ([scratch.output, ...scratch.levels].some(target => target === source || target.colorTexture === source.colorTexture)) {
      throw new RenderDeviceError("Auto exposure source aliases a scratch target", "POSTPROCESS_INPUT_OUTPUT_ALIAS");
    }
    const lease = this.history.begin({ ...frame, effectIndex: 0, width: source.width, height: source.height },
      () => ({ target: this.host.createTarget({ width: 1, height: 1, format: "rgba16f", depth: false, label: "webgpu-exposure-history" }), timeSeconds: NaN }),
      value => this.releaseHistoryTarget(value));
    try {
      const first = scratch.levels[0]!;
      this.host.draw({ label: "webgpu-exposure-luma", fragment: EXPOSURE_LUMA_LOG_WGSL, entryPoint: "fs_exposure_luma_log",
        uniforms: uintUniform(source.width, source.height, scratch.strideX, scratch.strideY, options.meteringMask === "center-weighted" ? 1 : 0),
        sources: [source], target: first });
      for (let i = 1; i < scratch.levels.length; i += 1) {
        const previous = scratch.levels[i - 1]!, target = scratch.levels[i]!;
        this.host.draw({ label: "webgpu-exposure-reduce", fragment: EXPOSURE_REDUCE_WGSL, entryPoint: "fs_exposure_reduce",
          uniforms: uintUniform(previous.width, previous.height), sources: [previous], target });
      }
      const average = scratch.levels[scratch.levels.length - 1]!;
      // A clock discontinuity seeds a new EV instead of inventing a frame time.
      const hasPrevious = Boolean(lease.read && Number.isFinite(lease.read.timeSeconds) && frame.timeSeconds >= lease.read.timeSeconds);
      const delta = hasPrevious ? Math.min(frame.timeSeconds - lease.read!.timeSeconds, MAX_FRAME_DELTA_SECONDS) : 0;
      this.host.draw({ label: "webgpu-exposure-adapt", fragment: EXPOSURE_ADAPT_WGSL, entryPoint: "fs_exposure_adapt",
        uniforms: adaptUniform(options, delta, hasPrevious), sources: [hasPrevious ? lease.read!.target : average, average], target: lease.write.target });
      this.host.draw({ label: "webgpu-exposure-mul", fragment: EXPOSURE_MUL_WGSL, entryPoint: "fs_exposure_mul",
        uniforms: uintUniform(source.width, source.height), sources: [source, lease.write.target], target: scratch.output });
      const assertCurrent = (): void => {
        if (this.disposed || this.scopes.get(frame.scopeId)?.get(frame.viewId) !== scratch) {
          throw new Error("POST_HISTORY_STALE_LEASE");
        }
      };
      return {
        target: scratch.output,
        commit: () => { assertCurrent(); lease.commit(); lease.write.timeSeconds = frame.timeSeconds; },
        abort: () => { assertCurrent(); lease.abort(); }
      };
    } catch (error) {
      try { lease.abort(); } catch { /* Preserve the original submission error. */ }
      throw error;
    }
  }

  resetView(scopeId: object, viewId: string | number): void {
    const epochs = this.viewEpochs.get(scopeId);
    epochs?.delete(viewId);
    if (epochs?.size === 0) this.viewEpochs.delete(scopeId);
    const views = this.scopes.get(scopeId), scratch = views?.get(viewId);
    if (scratch) views!.delete(viewId);
    if (views?.size === 0) this.scopes.delete(scopeId);
    if (scratch) this.retireScratch(scopeId, viewId, [...scratch.levels, scratch.output]);
    this.withCleanup("WebGPU exposure view disposal failed", cleanup => {
      // Invalidate history leases before invoking any scratch disposer.
      this.collectRelease(cleanup.errors, () => this.history.resetView(scopeId, viewId));
      this.releaseRetiredScratch(cleanup, target => target.scopeId === scopeId && target.viewId === viewId);
    });
  }

  resetScope(scopeId: object): void {
    this.viewEpochs.delete(scopeId);
    const views = this.scopes.get(scopeId);
    this.scopes.delete(scopeId);
    if (views) for (const [viewId, scratch] of views) this.retireScratch(scopeId, viewId, [...scratch.levels, scratch.output]);
    this.withCleanup("WebGPU exposure scope disposal failed", cleanup => {
      this.collectRelease(cleanup.errors, () => this.history.resetScope(scopeId));
      this.releaseRetiredScratch(cleanup, target => target.scopeId === scopeId);
    });
  }

  dispose(): void {
    if (!this.disposed) {
      this.disposed = true;
      for (const [scopeId, views] of this.scopes) {
        for (const [viewId, scratch] of views) this.retireScratch(scopeId, viewId, [...scratch.levels, scratch.output]);
      }
      this.scopes.clear();
    }
    this.withCleanup("WebGPU exposure disposal failed", cleanup => {
      if (!cleanup.historyDisposed) {
        cleanup.historyDisposed = true;
        this.collectRelease(cleanup.errors, () => this.history.dispose());
      }
      this.releaseRetiredScratch(cleanup, () => true);
    });
  }

  private scratchFor(frame: WebGPUExposureFrame, source: RenderTarget & { readonly colorTexture: RenderTarget["colorTexture"] & { readonly format: "rgba16f" | "rgba32f" } }, frameKey: string, existing?: Scratch): Scratch {
    if (existing && existing.width === source.width && existing.height === source.height && existing.format === source.colorTexture.format
      && Object.is(existing.deviceGeneration, frame.deviceGeneration)) return existing;
    const strideX = Math.max(1, Math.ceil(source.width / (WEBGPU_EXPOSURE_METER_EDGE * 4)));
    const strideY = Math.max(1, Math.ceil(source.height / (WEBGPU_EXPOSURE_METER_EDGE * 4)));
    let width = Math.ceil(source.width / (4 * strideX)), height = Math.ceil(source.height / (4 * strideY));
    const levels: RenderTarget[] = [];
    let output: RenderTarget | undefined;
    let epochs = this.viewEpochs.get(frame.scopeId);
    if (!epochs) { epochs = new Map(); this.viewEpochs.set(frame.scopeId, epochs); }
    let epoch = epochs.get(frame.viewId);
    if (!epoch) { epoch = {}; epochs.set(frame.viewId, epoch); }
    const assertCurrent = (): void => {
      if (this.disposed) throw new RenderDeviceError("WebGPU auto exposure is disposed", "WEBGPU_AUTO_EXPOSURE_DISPOSED");
      if (this.viewEpochs.get(frame.scopeId)?.get(frame.viewId) !== epoch
        || this.scopes.get(frame.scopeId)?.get(frame.viewId) !== existing) {
        throw new RenderDeviceError("Auto exposure was invalidated during allocation", "POST_HISTORY_STALE_LEASE");
      }
    };
    try {
      do {
        levels.push(this.host.createTarget({ width, height, format: "rgba16f", depth: false, label: "webgpu-exposure-meter" }));
        assertCurrent();
        if (width === 1 && height === 1) break;
        width = Math.ceil(width / 2); height = Math.ceil(height / 2);
      } while (true);
      output = this.host.createTarget({ width: source.width, height: source.height, format: source.colorTexture.format, depth: false, label: "webgpu-exposure-output" });
      assertCurrent();
      const targets = [...levels, output];
      if (new Set(targets).size !== targets.length || new Set(targets.map(target => target.colorTexture)).size !== targets.length) {
        throw new RenderDeviceError("Auto exposure scratch targets must be distinct", "POSTPROCESS_INPUT_OUTPUT_ALIAS");
      }
    } catch (error) {
      const retired = this.retireScratch(frame.scopeId, frame.viewId, [...levels, ...(output ? [output] : [])]);
      try {
        this.withCleanup("WebGPU exposure scratch disposal failed", cleanup => {
          this.releaseRetiredScratch(cleanup, target => retired.has(target));
        });
      } catch { /* Retain failed targets while preserving the allocation error. */ }
      throw error;
    }
    const scratch: Scratch = { width: source.width, height: source.height, format: source.colorTexture.format, levels, output,
      strideX, strideY, deviceGeneration: frame.deviceGeneration, frameId: frame.frameId, frameKey };
    let views = this.scopes.get(frame.scopeId);
    if (!views) { views = new Map(); this.scopes.set(frame.scopeId, views); }
    views.set(frame.viewId, scratch);
    if (existing) {
      const retired = this.retireScratch(frame.scopeId, frame.viewId, [...existing.levels, existing.output]);
      this.withCleanup("WebGPU exposure replacement disposal failed", cleanup => {
        if (existing.width !== source.width || existing.height !== source.height
          || !Object.is(existing.deviceGeneration, frame.deviceGeneration) || frame.cameraCut === true) {
          this.collectRelease(cleanup.errors, () => this.history.resetView(frame.scopeId, frame.viewId));
        }
        this.releaseRetiredScratch(cleanup, target => retired.has(target));
      });
      if (this.disposed || this.scopes.get(frame.scopeId)?.get(frame.viewId) !== scratch) {
        throw new RenderDeviceError("Auto exposure was invalidated during replacement", "POST_HISTORY_STALE_LEASE");
      }
    }
    return scratch;
  }

  private retireScratch(scopeId: object, viewId: string | number, targets: Iterable<RenderTarget>): Set<RetiredScratchTarget> {
    const retired = new Set<RetiredScratchTarget>();
    for (const target of new Set(targets)) {
      const entry = { scopeId, viewId, target };
      this.retiredScratch.add(entry);
      retired.add(entry);
    }
    return retired;
  }

  private releaseRetiredScratch(cleanup: ExposureCleanup, matches: (target: RetiredScratchTarget) => boolean): void {
    for (const retired of [...this.retiredScratch]) {
      if (!matches(retired) || cleanup.attemptedScratch.has(retired)) continue;
      cleanup.attemptedScratch.add(retired);
      try {
        this.disposeTarget(retired.target);
        this.retiredScratch.delete(retired);
      } catch (error) { cleanup.errors.push(error); }
    }
  }

  private releaseHistoryTarget(value: HistoryTarget): void {
    if (this.cleanup) {
      // A reentrant broader reset can revisit a previously failed history.
      // Keep it retired instead of invoking its disposer twice in one cleanup.
      if (this.cleanup.attemptedHistory.has(value)) throw new Error("POST_HISTORY_CLEANUP_DEFERRED");
      this.cleanup.attemptedHistory.add(value);
    }
    this.disposeTarget(value.target);
  }

  private disposeTarget(target: RenderTarget): void {
    if (this.host.disposeTarget) this.host.disposeTarget(target);
    else target.dispose();
  }

  private withCleanup(message: string, release: (cleanup: ExposureCleanup) => void): void {
    const outermost = !this.cleanup;
    const cleanup = this.cleanup ?? { attemptedScratch: new Set(), attemptedHistory: new Set(), errors: [], historyDisposed: false };
    this.cleanup = cleanup;
    const offset = cleanup.errors.length;
    try { release(cleanup); } finally { if (outermost) this.cleanup = undefined; }
    if (cleanup.errors.length > offset) throw new AggregateError(cleanup.errors.slice(offset), message);
  }

  private collectRelease(errors: unknown[], release: () => void): void {
    try { release(); } catch (error) { errors.push(error); }
  }
}
