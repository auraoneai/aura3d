/**
 * SH-04 / L1-12 — `compute.*` and `app.compute`: a public, WebGPU-only compute
 * surface (WGSL required) over `@aura3d/rendering`'s `ComputeContext`.
 *
 * `createAuraApp` mounts WebGL2, which has no compute stage, so by default every
 * call throws `AuraRuntimeError("compute-requires-webgpu")`. To compute, create a
 * WebGPU renderer with `Renderer.create({ backend: "webgpu" })` (or request your own
 * `GPUDevice`) and call `compute.bind(...)` / `app.compute.bind(...)` once.
 *
 * Unit tests use a fake `GPUDevice`; real execution is covered by `tests/browser/parity-compute.spec.ts`
 * on a remote software-WebGPU (SwiftShader) device with exact read-back (hardware GPUs were not exercised).
 */

import {
  ComputeBuffer,
  ComputeContext,
  ComputeError,
  ComputePipeline,
  createComputeContext
} from "@aura3d/rendering";
import type {
  RenderDevice,
  ComputeBufferSpec,
  ComputeDispatchInput,
  ComputeDispatchResult,
  ComputeGPUDeviceLike,
  ComputePipelineSpec
} from "@aura3d/rendering";
import { AuraRuntimeError } from "../compiler/errors.js";

export type AuraComputePipelineSpec = ComputePipelineSpec;
export type AuraComputeBufferSpec = ComputeBufferSpec;
export type AuraComputeDispatchInput = ComputeDispatchInput;
export type AuraComputeDispatchResult = ComputeDispatchResult;
export type AuraComputePipeline = ComputePipeline;
export type AuraComputeBuffer = ComputeBuffer;

/** A WebGPU `GPUDevice`, or a render device that owns one (`WebGPUDevice.nativeGpuDevice`). */
export type AuraComputeDeviceSource = ComputeGPUDeviceLike | { readonly nativeGpuDevice: ComputeGPUDeviceLike } | RenderDevice;

export interface AuraComputeSurface {
  /** `true` once a WebGPU device is bound. */
  readonly available: boolean;
  /** Bind a WebGPU device (replaces and disposes any earlier binding). Throws `compute-requires-webgpu` for non-WebGPU devices. */
  bind(device: AuraComputeDeviceSource): void;
  /** WGSL `@compute` pipeline. Throws `compute-requires-webgpu` until a device is bound. */
  pipeline(spec: AuraComputePipelineSpec): AuraComputePipeline;
  /** Storage or uniform buffer with `write()`, async `read()` and idempotent `dispose()`. */
  buffer(spec: AuraComputeBufferSpec): AuraComputeBuffer;
  /** Encode and submit one compute pass. */
  dispatch(input: AuraComputeDispatchInput): AuraComputeDispatchResult;
  /** Resolves when all submitted compute work has finished. */
  idle(): Promise<void>;
  /** Destroy every buffer and retire every pipeline. Safe to call when nothing was ever bound. */
  dispose(): void;
}

const hasNativeDevice = (source: unknown): source is { readonly nativeGpuDevice: ComputeGPUDeviceLike } =>
  typeof source === "object" && source !== null && "nativeGpuDevice" in source && typeof (source as { nativeGpuDevice: unknown }).nativeGpuDevice === "object";

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
export function createComputeSurface(backend: () => string = () => "webgl2"): AuraComputeSurface {
  let context: ComputeContext | null = null;

  const requireContext = (operation: string): ComputeContext => {
    if (context && !context.disposed) return context;
    throw new AuraRuntimeError(
      "compute-requires-webgpu",
      `compute.${operation} needs a WebGPU device, but none is bound (backend: "${backend()}"). createAuraApp mounts WebGL2, which has no compute stage. Create a renderer with Renderer.create({ backend: "webgpu" }) from @aura3d/engine/renderer and call compute.bind(renderer.device) (or compute.bind(gpuDevice) with your own GPUDevice).`
    );
  };

  return {
    get available() {
      return context !== null && !context.disposed;
    },
    bind(source) {
      const device = (hasNativeDevice(source) ? source.nativeGpuDevice : source) as ComputeGPUDeviceLike;
      const looksLikeGpuDevice = typeof device === "object" && device !== null && typeof (device as { createComputePipeline?: unknown }).createComputePipeline === "function";
      if (!looksLikeGpuDevice) {
        throw new AuraRuntimeError(
          "compute-requires-webgpu",
          `compute.bind needs a WebGPU device (a GPUDevice or a WebGPU render device); got a device without compute support (backend: "${backend()}").`
        );
      }
      const next = wrap(() => createComputeContext(device));
      context?.dispose();
      context = next;
    },
    pipeline: (spec) => wrap(() => requireContext("pipeline").createPipeline(spec)),
    buffer: (spec) => wrap(() => requireContext("buffer").createBuffer(spec)),
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
      context?.dispose();
      context = null;
    }
  };
}

/** Module-level surface (`import { compute } from "@aura3d/engine"`); bind a WebGPU device before use. */
export const compute: AuraComputeSurface = createComputeSurface();
