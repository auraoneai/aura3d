import { describe, expect, it, vi } from "vitest";
import { MockRenderDevice, type LdrPostprocessPresentationOptions, type RenderDevice, type RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { Renderer, type RendererPostProcessOptions } from "../../../packages/rendering/src/Renderer";
import { RendererPostprocessPipeline, defaultPostprocessTargetFormat, postGraphV2LastOutcome } from "../../../packages/rendering/src/renderer/PostprocessExecution";
import { postDiagnostics } from "../../../packages/rendering/src/renderer/PostDiagnosticsScope";
import type { RendererHost } from "../../../packages/rendering/src/renderer/RendererHost";

function fixture() {
  const device = new MockRenderDevice();
  Object.defineProperty(device, "kind", { value: "webgpu" });
  Object.defineProperty(device, "info", { value: { ...device.info, backend: "webgpu", capabilities: [...device.info.capabilities!, "hdr-render-targets"] } });
  const present = vi.fn((_source: RenderTarget, _options: LdrPostprocessPresentationOptions) => {});
  (device as RenderDevice).presentLdrPostprocess = present;
  const post = new RendererPostprocessPipeline({ device, width: 4, height: 4 } as unknown as RendererHost);
  const target = device.createRenderTarget({ width: 4, height: 4, format: "rgba16f" });
  const scopeId = {}, token = postDiagnostics.begin(scopeId, "left", 7);
  const frame = { source: {}, items: [], scopeId, viewId: "left", frameId: 7, timeSeconds: 3.25, diagnosticToken: token,
    sceneDepth: { texture: null, available: false, linearize: { near: .1, far: 10, orthographic: false } } };
  const options: RendererPostProcessOptions = { v2: true, toneMapping: false,
    pipeline: { autoExposure: {}, toneMapping: "none", exposure: 1, depthRange: { near: .1, far: 10, projection: "perspective" } }, postFrameContext: frame };
  return { device, present, post, target, options, frame, scopeId, token,
    dispose: () => { postDiagnostics.resetScope(scopeId); target.dispose(); device.dispose(); } };
}

describe("WebGPU auto exposure presentation routing", () => {
  it.each([false, true])("forwards scope, time and options and forces a native HDR present with no authored passes (async=%s)", async asynchronous => {
    const f = fixture();
    try {
      if (asynchronous) await f.post.executePostprocessAsync(f.options, [f.target]); else f.post.executePostprocess(f.options, [f.target]);
      expect(f.present).toHaveBeenCalledOnce();
      expect(f.present.mock.calls[0]![0]).toBe(f.target);
      const sent = f.present.mock.calls[0]![1];
      expect(sent.autoExposure).toEqual({});
      expect(sent.postFrameContext).toEqual({ scopeId: f.scopeId, viewId: "left", frameId: 7, timeSeconds: 3.25, cameraCut: undefined, diagnosticToken: f.token });
      expect(sent.passes).toEqual([{ name: "tone-mapping", options: { operator: "linear", exposure: 1 } }]);
      expect(postGraphV2LastOutcome(f.token)).toBe("legacy-chain:backend");
      expect(defaultPostprocessTargetFormat(f.device, f.options)).toBe("rgba16f");
    } finally { f.dispose(); }
  });

  it.each([false, true])("rejects invalid routes before invoking the device (async=%s)", async asynchronous => {
    const f = fixture();
    const invoke = async (options: RendererPostProcessOptions, source = f.target) => {
      if (asynchronous) await f.post.executePostprocessAsync(options, [source]); else f.post.executePostprocess(options, [source]);
    };
    const withValue = (value: unknown): RendererPostProcessOptions => ({ ...f.options, pipeline: { ...f.options.pipeline as object, autoExposure: value } });
    const ldr = f.device.createRenderTarget({ width: 4, height: 4, format: "rgba8" });
    try {
      for (const bad of [null, true, [], 1, "invalid"]) await expect(invoke(withValue(bad))).rejects.toMatchObject({ code: "WEBGPU_AUTO_EXPOSURE_INVALID" });
      await expect(invoke({ ...f.options, execution: "cpu-deterministic" })).rejects.toMatchObject({ code: "WEBGPU_AUTO_EXPOSURE_NATIVE_REQUIRED" });
      await expect(invoke(f.options, ldr)).rejects.toMatchObject({ code: "WEBGPU_AUTO_EXPOSURE_HDR_REQUIRED" });
      await expect(invoke({ ...f.options, postFrameContext: { ...f.frame, scopeId: undefined } })).rejects.toMatchObject({ code: "POSTPROCESS_HISTORY_IDENTITY_REQUIRED" });
      await expect(invoke({ ...f.options, postFrameContext: { ...f.frame, timeSeconds: NaN } })).rejects.toMatchObject({ code: "WEBGPU_AUTO_EXPOSURE_TIME_REQUIRED" });
      await expect(invoke({ ...f.options, toneMapping: { operator: "linear" }, filmGrain: true })).rejects.toMatchObject({ code: "WEBGPU_AUTO_EXPOSURE_NATIVE_REQUIRED" });
      (f.device as RenderDevice).presentLdrPostprocess = undefined;
      await expect(invoke(f.options)).rejects.toMatchObject({ code: "WEBGPU_AUTO_EXPOSURE_NATIVE_REQUIRED" });
      expect(f.present).not.toHaveBeenCalled();
    } finally { ldr.dispose(); f.dispose(); }
  });

  it.each([false, true])("retains bloom, tone and FXAA around exposure, and leaves an off request inactive (async=%s)", async asynchronous => {
    const f = fixture();
    const invoke = async (options: RendererPostProcessOptions) => {
      if (asynchronous) await f.post.executePostprocessAsync(options, [f.target]); else f.post.executePostprocess(options, [f.target]);
    };
    try {
      await invoke({ ...f.options, bloom: true, toneMapping: { operator: "aces" }, fxaa: true });
      expect(f.present.mock.calls[0]![1].passes.map(pass => pass.name)).toEqual(["bloom", "tone-mapping", "fxaa"]);
      expect(f.present.mock.calls[0]![1].autoExposure).toEqual({});
      f.present.mockClear();
      await invoke({ ...f.options, bloom: true, fxaa: true });
      expect(f.present.mock.calls[0]![1].passes.map(pass => pass.name)).toEqual(["bloom", "tone-mapping", "fxaa"]);
      expect(f.present.mock.calls[0]![1].passes[1]!.options.operator).toBe("linear");
      f.present.mockClear();
      await invoke({ ...f.options, pipeline: { ...f.options.pipeline as object, autoExposure: false } });
      expect(f.present).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it.each([false, true])("selects a single-sample HDR forward target and passes the authored-frame time (async=%s)", async asynchronous => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const device = renderer.device;
    Object.defineProperty(device, "kind", { value: "webgpu" });
    Object.defineProperty(device, "info", { value: { ...device.info, backend: "webgpu", capabilities: [...device.info.capabilities!, "hdr-render-targets"] } });
    const present = vi.fn((_source: RenderTarget, _options: LdrPostprocessPresentationOptions) => {});
    device.presentLdrPostprocess = present;
    const source = { cameraPolicy: "identity" as const, renderItems: [], postprocess: { v2: true, toneMapping: false as const,
      pipeline: { autoExposure: {}, toneMapping: "none" as const, exposure: 1, depthRange: { near: .1, far: 10, projection: "perspective" as const } } } };
    try {
      if (asynchronous) await renderer.renderAsync({ source, frameId: 11 }); else renderer.render({ source, frameId: 11 });
      expect(present).toHaveBeenCalledOnce();
      const [target, options] = present.mock.calls[0]!;
      expect(target.colorTexture.format).toBe("rgba16f");
      expect(target.sampleCount).toBe(1);
      expect(options.postFrameContext?.frameId).toBe(11);
      expect(Number.isFinite(options.postFrameContext?.timeSeconds)).toBe(true);
    } finally { renderer.dispose(); }
  });
});
