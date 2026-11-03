/**
 * SH-04 / L1-12 — `compute.*` and `app.compute`: a public, WebGPU-only compute
 * surface (WGSL required) over `@aura3d/rendering`'s `ComputeContext`.
 *
 * An app running WebGPU uses the same native device and queue for compute and
 * rendering. Standalone surfaces may also bind an explicitly supplied GPUDevice.
 *
 * Unit tests use a fake `GPUDevice`; real execution is covered by `tests/browser/parity-compute.spec.ts`
 * on a remote software-WebGPU (SwiftShader) device with exact read-back (hardware GPUs were not exercised).
 */

import {
  ComputeBuffer,
  ComputeContext,
  ComputeError,
  ComputePipeline,
  ComputeSampler,
  createComputeContext
} from "@aura3d/rendering";
import type {
  RenderDevice,
  RenderBuffer,
  ComputeBufferSpec,
  ComputeDispatchInput,
  ComputeDispatchResult,
  ComputeGPUDeviceLike,
  ComputePipelineSpec,
  ComputeRenderOwner,
  ComputeSamplerSpec
} from "@aura3d/rendering";
import { AuraRuntimeError } from "../../contracts/runtimeError.js";

export type AuraComputePipelineSpec = ComputePipelineSpec;
export type AuraComputeBufferSpec = ComputeBufferSpec;
export type AuraComputeDispatchInput = ComputeDispatchInput;
export type AuraComputeDispatchResult = ComputeDispatchResult;
export type AuraComputePipeline = ComputePipeline;
export type AuraComputeBuffer = ComputeBuffer;
export type AuraComputeSampler = ComputeSampler;
export type AuraComputeSamplerSpec = ComputeSamplerSpec;

/** A WebGPU `GPUDevice`, or a render device that owns one (`WebGPUDevice.nativeGpuDevice`). */
export type AuraComputeDeviceSource = ComputeGPUDeviceLike | { readonly nativeGpuDevice: ComputeGPUDeviceLike } | RenderDevice;

export interface AuraComputeSurface {
  /** `true` once a WebGPU device is bound. */
  readonly available: boolean;
  /** Requested compute cleanup is outstanding, including failed or unobservable retirement. */
  readonly cleanupPending: boolean;
  /** Bind a WebGPU device (replaces and disposes any earlier binding). Throws `compute-requires-webgpu` for non-WebGPU devices. */
  bind(device: AuraComputeDeviceSource): void;
  /** WGSL `@compute` pipeline. Throws `compute-requires-webgpu` until a device is bound. */
  pipeline(spec: AuraComputePipelineSpec): AuraComputePipeline;
  /** Compile a dispatchable pipeline without submitting work; optionally cancel the wait. */
  pipelineAsync(spec: AuraComputePipelineSpec, options?: { readonly signal?: AbortSignal }): Promise<AuraComputePipeline>;
  /**
   * Storage or uniform buffer with `write()`, async `read()` and idempotent `dispose()`.
   * App-bound storage buffers expose `asRenderBuffer()` for graph storage bindings.
   */
  buffer(spec: AuraComputeBufferSpec): AuraComputeBuffer;
  /** Borrow a renderer-owned storage buffer without transferring its ownership. */
  borrowBuffer(buffer: RenderBuffer): AuraComputeBuffer;
  /** A compute sampler for sampled textures, owned by this compute context. */
  sampler(spec?: AuraComputeSamplerSpec): AuraComputeSampler;
  /** Encode and submit one compute pass. */
  dispatch(input: AuraComputeDispatchInput): AuraComputeDispatchResult;
  /** Resolves when all submitted compute work has finished. */
  idle(): Promise<void>;
  /** Destroy every buffer and retire every pipeline. Safe to call when nothing was ever bound. */
  dispose(): void;
}

const hasNativeDevice = (source: unknown): source is { readonly nativeGpuDevice: ComputeGPUDeviceLike } =>
  typeof source === "object" && source !== null && "nativeGpuDevice" in source;

function wrap<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof ComputeError) throw new AuraRuntimeError("invalid-compute-spec", error.message, { cause: error });
    throw error;
  }
}

/**
 * Build a compute surface. `backend` is read lazily so the message can name the
 * backend an app is actually running on.
 */
export function createComputeSurface(
  backend: () => string = () => "webgl2",
  selectedDevice?: () => AuraComputeDeviceSource | undefined
): AuraComputeSurface {
  let context: ComputeContext | null = null;
  let boundDevice: ComputeGPUDeviceLike | null = null;
  let boundOwner: ComputeRenderOwner | undefined;
  let boundGeneration: number | undefined;
  let boundToSelection = false;
  let bindingRevision = 0;
  const retiredContexts = new Set<ComputeContext>();

  const nativeDevice = (source: AuraComputeDeviceSource | undefined): ComputeGPUDeviceLike | undefined => {
    if (!source) return undefined;
    const state = source as { readonly disposed?: boolean; readonly contextLost?: boolean };
    if (state.disposed || state.contextLost) return undefined;
    try {
      const device = (hasNativeDevice(source) ? source.nativeGpuDevice : source) as ComputeGPUDeviceLike;
      return typeof device === "object" && device !== null && typeof device.createComputePipeline === "function" ? device : undefined;
    } catch {
      // A renderer can become lost between the selection check and its native-device getter.
      return undefined;
    }
  };
  const renderOwner = (source: AuraComputeDeviceSource | undefined): ComputeRenderOwner | undefined => {
    if (!source || !hasNativeDevice(source)) return undefined;
    const candidate = source as unknown as Partial<ComputeRenderOwner>;
    return typeof candidate.generation === "number"
      && typeof candidate.createBuffer === "function"
      && typeof candidate.getNativeStorageBuffer === "function"
      && typeof candidate.getNativeTexture === "function"
      && candidate.resourceInterop !== undefined
      ? candidate as ComputeRenderOwner
      : undefined;
  };
  const retainRetired = (retired: ComputeContext): void => {
    if (retiredContexts.has(retired)) return;
    retiredContexts.add(retired);
    retired.onCleanupComplete(() => { retiredContexts.delete(retired); });
  };
  const retire = (): void => {
    const previous = context;
    // Detach before invoking disposal callbacks. A reentrant bind can then
    // install a replacement without the outer retirement clearing it.
    context = null;
    boundDevice = null;
    boundOwner = undefined;
    boundGeneration = undefined;
    boundToSelection = false;
    bindingRevision++;
    if (previous) {
      retainRetired(previous);
      previous.dispose();
    }
  };
  const changedBinding = (): ComputeError =>
    new ComputeError("compute-disposed", "compute device or binding changed during the operation");
  const reportedBindingChange = (): AuraRuntimeError => {
    const cause = changedBinding();
    return new AuraRuntimeError("invalid-compute-spec", cause.message, { cause });
  };
  const readSelection = () => {
    const source = selectedDevice?.();
    const device = nativeDevice(source);
    const owner = device ? renderOwner(source) : undefined;
    return { device, owner, generation: owner?.generation };
  };
  const disposeCandidate = (candidate: ComputeContext, error: unknown): never => {
    retainRetired(candidate);
    try { candidate.dispose(); } catch (cleanup) {
      throw new AggregateError([error, cleanup], "Compute binding replacement and cleanup failed", { cause: error });
    }
    throw error;
  };
  const replaceBinding = (
    device: ComputeGPUDeviceLike,
    owner: ComputeRenderOwner | undefined,
    selected: boolean,
    version: number,
    selection: ReturnType<typeof readSelection>
  ): void => {
    const generation = owner?.generation;
    const next = wrap(() => createComputeContext(device, owner));
    if (bindingRevision !== version) disposeCandidate(next, reportedBindingChange());
    try { retire(); } catch (error) { disposeCandidate(next, error); }
    try {
      if (next.disposed || owner?.generation !== generation || bindingRevision !== version + 1 || context !== null) throw changedBinding();
      if (selectedDevice) {
        const current = readSelection();
        if (current.device !== selection.device || current.owner !== selection.owner || current.generation !== selection.generation) throw changedBinding();
      }
      // Selection getters may themselves reenter the surface.
      if (next.disposed || owner?.generation !== generation || bindingRevision !== version + 1 || context !== null) throw changedBinding();
    } catch (error) {
      const reported = error instanceof ComputeError
        ? new AuraRuntimeError("invalid-compute-spec", error.message, { cause: error }) : error;
      disposeCandidate(next, reported);
    }
    context = next;
    boundDevice = device;
    boundOwner = owner;
    boundGeneration = generation;
    boundToSelection = selected;
    bindingRevision++;
  };
  const syncSelection = (): void => {
    if (!selectedDevice) return;
    const version = bindingRevision;
    const selection = readSelection();
    if (bindingRevision !== version) wrap(() => { throw changedBinding(); });
    const { device, owner } = selection;
    if (!device) {
      if (boundToSelection) retire();
      return;
    }
    const current = context;
    const matches = device === boundDevice && owner === boundOwner && selection.generation === boundGeneration && current && !current.disposed;
    if (bindingRevision !== version) wrap(() => { throw changedBinding(); });
    if (matches) {
      if (!boundToSelection) { boundToSelection = true; bindingRevision++; }
      return;
    }
    replaceBinding(device, owner, true, version, selection);
  };

  const requireContext = (operation: string): ComputeContext => {
    syncSelection();
    if (context && !context.disposed) return context;
    throw new AuraRuntimeError(
      "compute-requires-webgpu",
      `compute.${operation} needs a WebGPU device, but none is bound (backend: "${backend()}"). Select WebGPU for the app, or create a renderer with Renderer.create({ backend: "webgpu" }) and call compute.bind(renderer.device).`
    );
  };

  return {
    get available() {
      syncSelection();
      return context !== null && !context.disposed;
    },
    get cleanupPending() {
      return retiredContexts.size > 0 || context?.cleanupPending === true;
    },
    bind(source) {
      const version = bindingRevision;
      const device = nativeDevice(source);
      if (!device) {
        throw new AuraRuntimeError(
          "compute-requires-webgpu",
          `compute.bind needs a WebGPU device (a GPUDevice or a WebGPU render device); got a device without compute support (backend: "${backend()}").`
        );
      }
      const selection = readSelection();
      if (bindingRevision !== version) wrap(() => { throw changedBinding(); });
      if (selection.device && selection.device !== device) {
        throw new AuraRuntimeError("invalid-compute-spec", "compute.bind must use the app's selected WebGPU device while its renderer is mounted.");
      }
      const owner = selection.device === device ? selection.owner : renderOwner(source);
      if (bindingRevision !== version) wrap(() => { throw changedBinding(); });
      replaceBinding(device, owner, selection.device === device, version, selection);
    },
    pipeline: (spec) => wrap(() => requireContext("pipeline").createPipeline(spec)),
    pipelineAsync: async (spec, options = {}) => {
      let pipeline: AuraComputePipeline | undefined;
      try {
        const bound = requireContext("pipelineAsync");
        const device = boundDevice;
        const owner = boundOwner;
        const generation = boundGeneration;
        pipeline = await bound.createPipelineAsync(spec, options);
        const checkAbort = (): void => {
          if (!options.signal?.aborted) return;
          if (options.signal.reason instanceof Error) throw options.signal.reason;
          const error = new Error("Pipeline warmup was aborted");
          error.name = "AbortError";
          throw error;
        };
        checkAbort();
        syncSelection();
        checkAbort();
        if (bound.disposed || context !== bound || boundDevice !== device || boundOwner !== owner || boundGeneration !== generation) throw changedBinding();
        return pipeline;
      } catch (error) {
        const reported = error instanceof ComputeError
          ? new AuraRuntimeError("invalid-compute-spec", error.message, { cause: error }) : error;
        if (pipeline) {
          try { pipeline.dispose(); } catch (cleanup) {
            throw new AggregateError([reported, cleanup], "Compute pipeline warmup and cleanup failed", { cause: reported });
          }
        }
        throw reported;
      }
    },
    buffer: (spec) => wrap(() => requireContext("buffer").createBuffer(spec)),
    borrowBuffer: (buffer) => wrap(() => requireContext("borrowBuffer").borrowRenderBuffer(buffer)),
    sampler: (spec) => wrap(() => requireContext("sampler").createSampler(spec)),
    dispatch: (input) => wrap(() => requireContext("dispatch").dispatch(input)),
    idle: async () => {
      const bound = requireContext("idle");
      try {
        await bound.onIdle();
      } catch (error) {
        if (error instanceof ComputeError) throw new AuraRuntimeError("invalid-compute-spec", error.message, { cause: error });
        throw error;
      }
    },
    dispose() {
      // Snapshot before detaching: a reentrant bind may install a new active
      // context, and a just-failed retirement must not be retried in this call.
      const pending = [...retiredContexts];
      const failures: unknown[] = [];
      try { retire(); } catch (error) { failures.push(error); }
      for (const retired of pending) {
        if (!retiredContexts.has(retired)) continue;
        try { retired.dispose(); } catch (error) {
          if (!failures.some((failure) => Object.is(failure, error))) failures.push(error);
        }
      }
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1) throw new AggregateError(failures, "Compute surface cleanup failed", { cause: failures[0] });
    }
  };
}

/** Module-level surface (`import { compute } from "@aura3d/engine"`); bind a WebGPU device before use. */
export const compute: AuraComputeSurface = createComputeSurface();
