import { describe, expect, it, vi } from "vitest";
import { MockRenderDevice, type LdrPostprocessPresentationOptions, type NativeWebGPUDofFrame, type RenderDevice, type RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import type { RendererPostProcessOptions } from "../../../packages/rendering/src/Renderer";
import { RendererPostprocessPipeline, createPostprocessDiagnostics, defaultPostprocessTargetFormat, webgpuDepthOfFieldRequested } from "../../../packages/rendering/src/renderer/PostprocessExecution";
import { postDiagnostics } from "../../../packages/rendering/src/renderer/PostDiagnosticsScope";
import type { RendererHost } from "../../../packages/rendering/src/renderer/RendererHost";

function fixture() {
  const device = new MockRenderDevice();
  Object.defineProperty(device, "kind", { value: "webgpu" });
  Object.defineProperty(device, "generation", { value: 4 });
  Object.defineProperty(device, "info", { value: { ...device.info, backend: "webgpu", capabilities: [...device.info.capabilities!, "hdr-render-targets"] } });
  const present = vi.fn((_source: RenderTarget, _options: LdrPostprocessPresentationOptions) => {});
  const validate = vi.fn((_frame: NativeWebGPUDofFrame, _source: RenderTarget) => true);
  (device as RenderDevice).presentLdrPostprocess = present;
  (device as RenderDevice).getPresentationAlphaMode = () => "opaque";
  (device as RenderDevice).canPresentNativeDepthOfField = () => true;
  (device as RenderDevice).validateNativeDepthOfFieldFrame = validate;
  const post = new RendererPostprocessPipeline({ device, width: 4, height: 4 } as unknown as RendererHost);
  const target = device.createRenderTarget({ width: 4, height: 4, sampleCount: 1, depth: "texture", colorAttachments: [{ format: "rgba16f" }, { format: "rgba8" }] });
  const scopeId = {};
  let current = true;
  const dofFrame: NativeWebGPUDofFrame = {
    source: target, coverage: { target, colorAttachment: 1, encoding: "depth-coverage-red8" },
    projection: { kind: "perspective", mode: "standard", clipRange: "zero-to-one", inverseProjection: new Float32Array(16),
      nearMeters: .1, farMeters: 10, viewportDepthRange: [0, 1], clearValue: 1 },
    maxGeometryDepthMeters: 11, skyDepthMeters: 20, alpha: "opaque", depthModel: "single-surface",
    scopeId, viewId: "left", frameId: 7, deviceGeneration: 4, isCurrent: () => current
  };
  const context = { source: {}, items: [], scopeId, viewId: "left", frameId: 7, timeSeconds: 3,
    sceneDepth: { texture: target.depthTexture ?? null, available: true, linearize: { near: .1, far: 10, orthographic: false } },
    nativeDepthOfFieldFrame: dofFrame };
  const pipeline = { dof: { focusDistance: 3 }, antiAliasing: "off", toneMapping: "none", exposure: 1,
    depthRange: { near: .1, far: 10, projection: "perspective" } };
  const options: RendererPostProcessOptions = { v2: true, toneMapping: false, pipeline, postFrameContext: context };
  return { device, post, target, scopeId, dofFrame, context, pipeline, options, present, validate,
    stale: () => { current = false; }, dispose: () => { target.dispose(); device.dispose(); } };
}

describe("native depth-of-field postprocess routing", () => {
  it.each([false, true])("encodes a pass-free linear canvas source once without altering encoded or offscreen sources (async=%s)", async asynchronous => {
    const f = fixture();
    const linear = f.device.createRenderTarget({ width: 4, height: 4, format: "rgba8" });
    const output = f.device.createRenderTarget({ width: 4, height: 4, format: "rgba8" });
    const options: RendererPostProcessOptions = { v2: true, toneMapping: false };
    const direct = vi.spyOn(f.device, "presentRenderTarget");
    const invoke = async (destination?: RenderTarget) => {
      if (asynchronous) await f.post.executePostprocessAsync(options, [linear], destination);
      else f.post.executePostprocess(options, [linear], destination);
    };
    try {
      await invoke();
      expect(f.present).toHaveBeenCalledOnce();
      expect(f.present.mock.calls[0]![1]).toMatchObject({
        passes: [{ name: "tone-mapping", options: { operator: "linear", exposure: 1, whitePoint: 1 } }],
        toneMappingDefaults: { outputColorSpace: "srgb", alphaMode: "opaque" }
      });
      expect(direct).not.toHaveBeenCalled();

      f.present.mockClear();
      linear.colorTexture.colorSpace = "srgb";
      await invoke();
      expect(f.present).not.toHaveBeenCalled();
      expect(direct).toHaveBeenCalledWith(linear);

      linear.colorTexture.colorSpace = "linear";
      const pixels = Uint8Array.from({ length: 4 * 4 * 4 }, (_, index) => (index * 29) % 256);
      f.device.writeRenderTargetPixels(linear, pixels);
      await invoke(output);
      expect(f.present).not.toHaveBeenCalled();
      f.device.setRenderTarget(output);
      expect(f.device.readPixels(0, 0, 4, 4)).toEqual(pixels);
    } finally { direct.mockRestore(); output.dispose(); linear.dispose(); f.dispose(); }
  });

  it("refuses implicit linear output on an unverified or non-opaque canvas", () => {
    const f = fixture();
    const source = f.device.createRenderTarget({ width: 4, height: 4, format: "rgba8" });
    try {
      (f.device as RenderDevice).getPresentationAlphaMode = () => "premultiplied";
      expect(() => f.post.executePostprocess({ v2: true, toneMapping: false }, [source])).toThrowError(/opaque presentation surface/);
      expect(f.present).not.toHaveBeenCalled();
    } finally { source.dispose(); f.dispose(); }
  });

  it.each([false, true])("forwards display-space native effects after the implicit sRGB conversion (async=%s)", async asynchronous => {
    const f = fixture();
    const source = f.device.createRenderTarget({ width: 4, height: 4, format: "rgba8" });
    const nativeEffects = [{ kind: "pixelation", size: 2 }] as const;
    const options: RendererPostProcessOptions = { v2: true, toneMapping: false, pipeline: { nativeEffects } };
    try {
      if (asynchronous) await f.post.executePostprocessAsync(options, [source]);
      else f.post.executePostprocess(options, [source]);
      expect(f.present).toHaveBeenCalledOnce();
      expect(f.present.mock.calls[0]![1]).toMatchObject({
        passes: [{ name: "tone-mapping", options: { operator: "linear", exposure: 1, whitePoint: 1 } }],
        nativeEffects,
        toneMappingDefaults: { outputColorSpace: "srgb", alphaMode: "opaque" }
      });
    } finally { source.dispose(); f.dispose(); }
  });

  it("counts the coverage color attachment and depth texture in diagnostics", () => {
    const f = fixture();
    try {
      const diagnostics = createPostprocessDiagnostics(f.options, [f.target], 4, 4);
      expect(diagnostics?.postprocessRenderTargets).toBe(1);
      expect(diagnostics?.postprocessTextures).toBe(3);
    } finally { f.dispose(); }
  });

  it("reports only the exact device-issued frame's submission and never claims rendered pixels", () => {
    const f = fixture();
    const token = postDiagnostics.begin(f.scopeId, "left", 7);
    const otherScope = {};
    const other = postDiagnostics.begin(otherScope, "left", 7);
    const options: RendererPostProcessOptions = { ...f.options, postFrameContext: { ...f.context, diagnosticToken: token } };
    try {
      // Even matching scoped markers may belong to a previous execution with
      // the same authored frame ID; they are not submission proof.
      postDiagnostics.recordStage(token, "S1:depth-prep");
      postDiagnostics.recordStage(token, "S6:dof");
      postDiagnostics.recordStage(other, "S6:dof");
      const before = createPostprocessDiagnostics(options, [f.target], 4, 4);
      expect(before?.nativeDepthOfField).toEqual({ requested: true, depthPreparation: "not-observed", effect: "not-observed", pixelValidation: "not-established" });
      expect(before?.postprocessPlan.claimBoundary).toContain("reported separately");
      const depthOnly = { frame: f.dofFrame, depthSubmitted: true, effectSubmitted: false };
      expect(createPostprocessDiagnostics(options, [f.target], 4, 4, { nativeDepthOfFieldSubmission: depthOnly })?.nativeDepthOfField).toEqual({
        requested: true, depthPreparation: "submitted", effect: "not-observed", pixelValidation: "not-established"
      });
      const complete = { ...depthOnly, effectSubmitted: true };
      expect(createPostprocessDiagnostics(options, [f.target], 4, 4, { nativeDepthOfFieldSubmission: complete })?.nativeDepthOfField).toEqual({
        requested: true, depthPreparation: "submitted", effect: "submitted", pixelValidation: "not-established"
      });
      const nextFrame = { ...f.dofFrame };
      const repeated: RendererPostProcessOptions = { ...options, postFrameContext: { ...f.context, diagnosticToken: token, nativeDepthOfFieldFrame: nextFrame } };
      expect(createPostprocessDiagnostics(repeated, [f.target], 4, 4, { nativeDepthOfFieldSubmission: complete })?.nativeDepthOfField?.effect).toBe("not-observed");
      const wrongToken: RendererPostProcessOptions = { ...options, postFrameContext: { ...f.context, diagnosticToken: other } };
      expect(createPostprocessDiagnostics(wrongToken, [f.target], 4, 4, { nativeDepthOfFieldSubmission: complete })?.nativeDepthOfField?.effect).toBe("not-observed");
      expect(createPostprocessDiagnostics(options, [f.target], 4, 4, { nativeDepthOfFieldSubmission: { ...complete, depthSubmitted: false } })?.nativeDepthOfField?.effect).toBe("not-observed");
    } finally { postDiagnostics.resetScope(f.scopeId); postDiagnostics.resetScope(otherScope); f.dispose(); }
  });

  it.each([false, true])("forwards the device-verified frame and uses native HDR presentation with no ordinary pass (async=%s)", async asynchronous => {
    const f = fixture();
    try {
      if (asynchronous) await f.post.executePostprocessAsync(f.options, [f.target]); else f.post.executePostprocess(f.options, [f.target]);
      expect(f.validate).toHaveBeenCalledWith(f.dofFrame, f.target);
      expect(f.present).toHaveBeenCalledOnce();
      const [source, sent] = f.present.mock.calls[0]!;
      expect(source).toBe(f.target);
      expect(sent.nativeDepthOfField).toEqual({ options: { focusDistance: 3 }, frame: f.dofFrame });
      expect(sent.passes).toEqual([{ name: "tone-mapping", options: { operator: "linear", exposure: 1 } }]);
      expect(defaultPostprocessTargetFormat(f.device, f.options)).toBe("rgba16f");
      expect(webgpuDepthOfFieldRequested(f.device, f.options)).toBe(true);
    } finally { f.dispose(); }
  });

  it.each([false, true])("retains mapped bloom, authored tone and output stages around the HDR request (async=%s)", async asynchronous => {
    const f = fixture();
    const options: RendererPostProcessOptions = { ...f.options, toneMapping: undefined, bloom: true, colorGrade: true, fxaa: true,
      pipeline: { ...f.pipeline, bloom: {}, toneMapping: "aces", exposure: 2 } };
    try {
      if (asynchronous) await f.post.executePostprocessAsync(options, [f.target]); else f.post.executePostprocess(options, [f.target]);
      const sent = f.present.mock.calls[0]![1];
      expect(sent.nativeDepthOfField?.frame).toBe(f.dofFrame);
      expect(sent.passes.map(pass => pass.name)).toEqual(["bloom", "tone-mapping", "color-grade", "fxaa"]);
      expect(sent.passes[1]!.options).toMatchObject({ operator: "aces", exposure: 2 });
    } finally { f.dispose(); }
  });

  it("forwards v2 tone and exposure defaults while preserving explicit tone-pass overrides", () => {
    const f = fixture();
    (f.device as RenderDevice).negotiateOutputColorSpace = requested => ({ requested: requested ?? "srgb", active: "display-p3", supported: ["srgb", "display-p3"] });
    const options: RendererPostProcessOptions = { ...f.options, toneMapping: undefined,
      pipeline: { ...f.pipeline, dof: false, outputColorSpace: "display-p3", toneMapping: "aces", exposure: 2 } };
    try {
      f.post.executePostprocess(options, [f.target]);
      const first = f.present.mock.calls[0]![1];
      expect(first.toneMappingDefaults).toMatchObject({ outputColorSpace: "display-p3", operator: "aces", exposure: 2 });
      expect({ ...first.toneMappingDefaults, ...first.passes[0]!.options }).toMatchObject({ operator: "aces", exposure: 2 });
      f.present.mockClear();
      f.post.executePostprocess({ ...options, toneMapping: { operator: "filmic", exposure: .5 } }, [f.target]);
      const second = f.present.mock.calls[0]![1];
      expect({ ...second.toneMappingDefaults, ...second.passes[0]!.options }).toMatchObject({ outputColorSpace: "display-p3", operator: "filmic", exposure: .5 });
    } finally { f.dispose(); }
  });

  it.each([false, true])("rejects unverified, stale and mismatched frame handoffs before presentation (async=%s)", async asynchronous => {
    const f = fixture();
    const invoke = async (options: RendererPostProcessOptions, target = f.target) => {
      if (asynchronous) await f.post.executePostprocessAsync(options, [target]); else f.post.executePostprocess(options, [target]);
    };
    const other = f.device.createRenderTarget({ width: 4, height: 4, format: "rgba16f", depth: "texture" });
    try {
      await expect(invoke({ ...f.options, postFrameContext: { ...f.context, nativeDepthOfFieldFrame: undefined } })).rejects.toMatchObject({ code: "WEBGPU_DOF_FRAME_REQUIRED" });
      await expect(invoke({ ...f.options, postFrameContext: { ...f.context, viewId: "right" } })).rejects.toMatchObject({ code: "WEBGPU_DOF_FRAME_REQUIRED" });
      await expect(invoke(f.options, other)).rejects.toMatchObject({ code: "WEBGPU_DOF_FRAME_REQUIRED" });
      f.validate.mockReturnValue(false);
      await expect(invoke(f.options)).rejects.toMatchObject({ code: "WEBGPU_DOF_FRAME_REQUIRED" });
      const forgedIsCurrent = vi.fn(() => { throw new Error("untrusted callback must not run"); });
      const forged = { ...f.dofFrame, isCurrent: forgedIsCurrent };
      await expect(invoke({ ...f.options, postFrameContext: { ...f.context, nativeDepthOfFieldFrame: forged } })).rejects.toMatchObject({ code: "WEBGPU_DOF_FRAME_REQUIRED" });
      expect(forgedIsCurrent).not.toHaveBeenCalled();
      f.validate.mockReturnValue(true);
      f.stale();
      await expect(invoke(f.options)).rejects.toMatchObject({ code: "WEBGPU_DOF_FRAME_REQUIRED" });
      expect(f.present).not.toHaveBeenCalled();
    } finally { other.dispose(); f.dispose(); }
  });

  it.each([false, true])("fails closed for unsupported device, alpha/depth combinations and post stages (async=%s)", async asynchronous => {
    const f = fixture();
    const invoke = async (options: RendererPostProcessOptions) => {
      if (asynchronous) await f.post.executePostprocessAsync(options, [f.target]); else f.post.executePostprocess(options, [f.target]);
    };
    const withPipeline = (change: Record<string, unknown>): RendererPostProcessOptions => ({ ...f.options, pipeline: { ...f.pipeline, ...change } });
    try {
      for (const dof of [null, true, [], 1, "invalid"]) await expect(invoke(withPipeline({ dof }))).rejects.toMatchObject({ code: "WEBGPU_DOF_INVALID" });
      for (const change of [{ ao: {} }, { ssr: {} }, { taa: {} }, { motionBlur: {} }, { antiAliasing: "taa" }, { nativeEffects: [{ kind: "unknown" }] }, { bloom: {} }]) {
        await expect(invoke(withPipeline(change))).rejects.toMatchObject({ code: "WEBGPU_DOF_COMBINATION_UNSUPPORTED" });
      }
      const badAlpha = { ...f.dofFrame, alpha: "straight" } as unknown as NativeWebGPUDofFrame;
      await expect(invoke({ ...f.options, postFrameContext: { ...f.context, nativeDepthOfFieldFrame: badAlpha } })).rejects.toMatchObject({ code: "WEBGPU_DOF_FRAME_REQUIRED" });
      await expect(invoke({ ...f.options, execution: "cpu-deterministic" })).rejects.toMatchObject({ code: "WEBGPU_DOF_NATIVE_REQUIRED" });
      (f.device as RenderDevice).canPresentNativeDepthOfField = () => false;
      await expect(invoke(f.options)).rejects.toMatchObject({ code: "WEBGPU_DOF_NATIVE_REQUIRED" });
      expect(f.present).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });
});
