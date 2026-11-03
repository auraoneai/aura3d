// PR 0b-2 carve-out (CONTRACTS.md §3.5) — verbatim move from Renderer.ts; 0 changed logic lines.
// File: packages/rendering/src/renderer/RendererFactory.ts — owner lane 11.

import { createRenderDevice } from "../RenderBackend";
import { Renderer, type RendererOptions } from "../Renderer";
import { assertRendererFeatures } from "../RendererFeatureGates";
import { registerPackedLoopDevice } from "../batching/BatchMembers";
import { RenderDeviceError } from "../RenderDevice";
import { resourceDisposalPending } from "../ResourceLifecycle";

export async function createRenderer(options: RendererOptions = {}): Promise<Renderer> {
  const device = await createRenderDevice(options);
  const cleanupFailures: unknown[] = [];
  try {
    registerPackedLoopDevice(device);
    if (options.requiredFeatures && options.requiredFeatures.length > 0) {
      assertRendererFeatures(device, options.requiredFeatures);
    }
    const shaderLibrary = options.shaderLibrary
      ?? (await import("../ShaderLibrary.js")).createDefaultShaderLibrary();
    // Keep the optional WebGPU drawing paths out of the default renderer bundle.
    const nativeDrawingPipelines = options.drawingPath && options.drawingPath.mode !== "forward"
      ? await Promise.all([
        import("../webgpu/DeferredPipeline.js"),
        import("../webgpu/MeshletPipeline.js"),
        import("../webgpu/VisibilityBufferPipeline.js"),
        import("./NativeDeferredAdmission.js"),
        import("../webgpu/DeferredProbe.js")
      ]).then(([deferred, meshlet, visibility, admission, probe]) => ({
        DeferredPipeline: deferred.DeferredPipeline,
        MeshletPipeline: meshlet.MeshletPipeline,
        VisibilityBufferPipeline: visibility.VisibilityBufferPipeline,
        nativeDrawingSceneFromRenderItems: deferred.nativeDrawingSceneFromRenderItems,
        admitNativeDeferredFeatures: admission.admitNativeDeferredFeatures,
        deferredProbeFromUniforms: probe.deferredProbeFromUniforms
      }))
      : undefined;
    // Keep optional temporal code off the ordinary synchronous import path.
    const { TemporalHistory } = await import("../TemporalHistory.js");
    const history = new TemporalHistory();
    try {
      return new Renderer(device, { ...options, shaderLibrary, ...(nativeDrawingPipelines ? { nativeDrawingPipelines } : {}) }, history);
    } catch (error) {
      try { history.dispose(); } catch (cleanupError) { cleanupFailures.push(cleanupError); }
      throw error;
    }
  } catch (error) {
    // A failed feature assertion or initialization must not strand a device.
    try { device.dispose(); } catch (cleanupError) { cleanupFailures.push(cleanupError); }
    if (options.webgpuCanvasOwnership === "exclusive" && device.kind === "webgpu") {
      // A successful synchronous dispose is not a receipt for GPU fences.
      // Do not let backend selection fall back while retirement is pending.
      if (cleanupFailures.length === 0) {
        try {
          await device.whenDisposed?.();
          if (!device.disposed || (device as typeof device & { readonly [resourceDisposalPending]?: boolean })[resourceDisposalPending]) {
            throw new Error("WebGPU device disposal did not complete");
          }
        } catch (cleanupError) { cleanupFailures.push(cleanupError); }
      }
      if (cleanupFailures.length) {
        const failure = new RenderDeviceError(
          "WEBGPU_OWNERSHIP_CLEANUP_FAILED: Renderer initialization failed and WebGPU cleanup could not be confirmed",
          "WEBGPU_OWNERSHIP_CLEANUP_FAILED"
        );
        failure.cause = new AggregateError([error, ...cleanupFailures], "Renderer initialization and cleanup failed", { cause: error });
        throw failure;
      }
    }
    throw error;
  }
}
