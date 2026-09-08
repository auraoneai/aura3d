import { afterEach, describe, expect, it, vi } from "vitest";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { ProductionRuntimeRenderer } from "../../../packages/rendering/src/production-runtime/ProductionRuntimeRenderer";
import { ProductionWebGL2Renderer } from "../../../packages/rendering/src/production-runtime/ProductionWebGL2Renderer";
import type { ProductionRendererInput } from "../../../packages/rendering/src/production-runtime/ProductionRendererTypes";
import type { RenderDeviceDiagnostics } from "../../../packages/rendering/src/RenderDevice";

// This suite proves dispatch/awaiting only. Real native submissions and pixels belong
// to native-bloom-pyramid.spec.ts; the test double is never renderer evidence.
const diagnostics: RenderDeviceDiagnostics = {
  drawCalls: 1, buffers: 0, shaders: 0, renderTargets: 0, textures: 0,
  textureBytes: 0, lastError: null, contextLost: false
};
const input = {
  metadata: { primitiveCount: 1, meshCount: 1, materialCount: 1 },
  source: { items: [] }
} as unknown as ProductionRendererInput;

afterEach(() => vi.restoreAllMocks());

describe("production async dispatch", () => {
  it("forwards live shadow resources through runtime/backend wrappers without caching stale state", async () => {
    let observed: Readonly<Record<string, unknown>> | null = { submissionFrameId: 7, cascades: [{ index: 0, lightMatrix: [1, 0, 0, 1] }], pointFaceRects: [] };
    const getShadowEvidence = vi.fn(() => observed);
    vi.spyOn(Renderer, "create").mockResolvedValue({ device: { kind: "webgl2" }, getShadowEvidence, dispose: vi.fn() } as unknown as Renderer);
    const runtime = await ProductionRuntimeRenderer.create({ canvas: {} as HTMLCanvasElement, width: 16, height: 16, backend: "webgl2" });
    expect(runtime.getShadowEvidence()).toBe(observed);
    observed = null;
    expect(runtime.getShadowEvidence()).toBeNull();
    expect(getShadowEvidence).toHaveBeenCalledTimes(2);
    runtime.dispose();
  });

  it("awaits the WebGL renderer async method without calling its synchronous twin", async () => {
    let complete!: (value: RenderDeviceDiagnostics) => void;
    const renderAsync = vi.fn(() => new Promise<RenderDeviceDiagnostics>((resolve) => { complete = resolve; }));
    const render = vi.fn(() => { throw new Error("sync dispatch is forbidden"); });
    const resetTemporalHistory = vi.fn();
    const dispose = vi.fn();
    vi.spyOn(Renderer, "create").mockResolvedValue({
      device: { kind: "webgl2" }, render, renderAsync, resetTemporalHistory, dispose
    } as unknown as Renderer);
    vi.spyOn(ProductionWebGL2Renderer.prototype, "getFeatures").mockReturnValue([]);
    const runtime = await ProductionRuntimeRenderer.create({ canvas: {} as HTMLCanvasElement, width: 16, height: 16, backend: "webgl2" });
    let settled = false;
    const pending = runtime.renderInteractiveFrameAsync(input).then((value) => { settled = true; return value; });
    await Promise.resolve();
    expect(renderAsync).toHaveBeenCalledExactlyOnceWith(input.source, input.camera);
    expect(render).not.toHaveBeenCalled();
    expect(settled).toBe(false);
    complete(diagnostics);
    expect((await pending).diagnostics).toBe(diagnostics);
    runtime.resetTemporalHistory("pause");
    expect(resetTemporalHistory).toHaveBeenCalledExactlyOnceWith("pause");
    runtime.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("propagates native async failure without retrying a synchronous render", async () => {
    const render = vi.fn();
    const failure = new Error("native submission failed");
    vi.spyOn(Renderer, "create").mockResolvedValue({
      device: { kind: "webgl2" }, render,
      renderAsync: vi.fn().mockRejectedValue(failure), dispose: vi.fn()
    } as unknown as Renderer);
    const runtime = await ProductionRuntimeRenderer.create({ canvas: {} as HTMLCanvasElement, width: 16, height: 16, backend: "webgl2" });
    await expect(runtime.renderInteractiveFrameAsync(input)).rejects.toBe(failure);
    expect(render).not.toHaveBeenCalled();
    runtime.dispose();
  });
});
