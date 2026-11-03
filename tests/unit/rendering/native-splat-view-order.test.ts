import { describe, expect, it, vi } from "vitest";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { mergeTransparentSegments, type TransparentEngineItem } from "../../../packages/rendering/src/renderer/InterleavedTransparentPass";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import type { TransparentQueueItem } from "../../../packages/rendering/src/contracts/frameGraph";

const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const inside = { min: [-0.2, -0.2, -0.2], max: [0.2, 0.2, 0.2] } as const;
const outside = { min: [3, 3, 3], max: [4, 4, 4] } as const;

describe("splat view visibility and transparent ordering", () => {
  it("keeps splats on the forward path without consuming a source getter in native preflight", () => {
    const create = (allowFallback: boolean) => {
      const device = new MockRenderDevice();
      Object.defineProperty(device, "kind", { value: "webgpu" });
      Object.assign(device, { nativeGpuDevice: {}, getNativeRenderSurface: () => ({}), markNativeRenderSurfaceWritten: () => {}, hasNativeSurfaceViewOverride: () => false });
      setRendererQrFlags({ values: {}, on: () => false }, device);
      return new Renderer(device, { backend: "mock", width: 20, height: 20, shaderLibrary: createDefaultShaderLibrary(), drawingPath: { mode: "deferred", allowFallback }, nativeDrawingPipelines: {} as never }, new TemporalHistory());
    };
    const strict = create(false), fallback = create(true);
    let reads = 0;
    const source = { renderItems: [], get gaussianSplats() { reads += 1; return [{}]; } };
    type Selector = { selectDrawingPath(input: unknown, camera: undefined, views: undefined): { input: unknown; diagnostics: { active: string; fallbackReason?: string } } };
    try {
      expect(() => (strict as unknown as Selector).selectDrawingPath(source, undefined, undefined)).toThrow(/Gaussian splats require the full forward renderer/);
      const selected = (fallback as unknown as Selector).selectDrawingPath(source, undefined, undefined);
      expect(selected.input).toBe(source);
      expect(selected.diagnostics).toMatchObject({ active: "forward", fallbackReason: expect.stringContaining("Gaussian splats") });
      expect(reads).toBe(0);
      expect(source.gaussianSplats).toHaveLength(1);
      expect(reads).toBe(1);
      expect(() => (strict as unknown as Selector).selectDrawingPath({ renderItems: [], gaussianSplats: [{}] }, undefined, undefined)).toThrow(/Gaussian splats/);
    } finally { strict.dispose(); fallback.dispose(); }
  });

  it("filters each view before preparing clouds and respects the opt-in culling switch", () => {
    const device = new MockRenderDevice();
    const renderer = new Renderer(device, { backend: "mock", width: 20, height: 20, shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory());
    const seen: number[] = [];
    const splatRenderer = {
      belongsToDevice: () => true,
      prepare: vi.fn(({ modelMatrix }: { modelMatrix: Float32Array }) => { seen.push(modelMatrix[12]!); return { colorSpace: "lin_rec709_display" }; }),
      transparentRuns: () => []
    };
    const draw = (id: number, layerMask: number, worldBounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] }, frustumCulled = true) => {
      const modelMatrix = identity.slice(); modelMatrix[12] = id;
      return { renderer: splatRenderer, modelMatrix, colorSpace: "lin_rec709_display", layerMask, worldBounds, frustumCulled };
    };
    const draws = [draw(1, 1, inside), draw(2, 2, inside), draw(3, 1, outside), draw(4, 1, outside, false)];
    const invoke = (source: unknown, layerMask: number) => (renderer as unknown as { gaussianSplatRuns(...args: unknown[]): unknown }).gaussianSplatRuns(
      draws, source, { layerMask, viewMatrix: identity, projectionMatrix: identity, viewProjectionMatrix: identity }, undefined, false, [], []
    );
    try {
      invoke({ frustumCulling: true }, 1);
      expect(seen).toEqual([1, 4]);
      seen.length = 0;
      invoke({ frustumCulling: true }, 2);
      expect(seen).toEqual([2]);
      seen.length = 0;
      invoke({ frustumCulling: false }, 1);
      expect(seen).toEqual([1, 3, 4]);
    } finally { renderer.dispose(); }
  });

  it("orders meshes and contributor queues by renderOrder before distance, retaining tie rules", () => {
    const mesh = (name: string, renderOrder: number, sortDepth: number): TransparentEngineItem =>
      ({ item: { label: name, renderOrder } as TransparentEngineItem["item"], sortDepth });
    const queue = (name: string, renderOrder: number, sortDepth: number, order = 0): TransparentQueueItem & { name: string } =>
      ({ name, renderOrder, sortDepth, order, draw: () => {} });
    const segments = mergeTransparentSegments(
      [mesh("early-mesh", -1, 1), mesh("default-mesh", 0, 4), mesh("late-mesh", 2, 100)],
      [queue("late-queue", 1, 1000), queue("early-queue", -1, 2), queue("tie-b", 0, 4, 2), queue("tie-a", 0, 4, 1)]
    );
    expect(segments.flatMap(segment => segment.engine?.map(item => item.label) ?? [(segment.queue as unknown as { name: string }).name]))
      .toEqual(["early-queue", "early-mesh", "tie-a", "tie-b", "default-mesh", "late-queue", "late-mesh"]);
  });

  it("only splits a splat run at distances belonging to the same renderOrder", () => {
    const renderer = new Renderer(new MockRenderDevice(), { backend: "mock", width: 20, height: 20, shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory());
    const calls: { ids: number[]; boundaries: readonly number[] }[] = [];
    const splatRenderer = {
      belongsToDevice: () => true,
      prepare: ({ modelMatrix }: { modelMatrix: Float32Array }) => ({ id: modelMatrix[12], colorSpace: "lin_rec709_display" }),
      transparentRuns: (entries: { frame: { id: number } }[], boundaries: readonly number[]) => {
        calls.push({ ids: entries.map(entry => entry.frame.id), boundaries });
        return [{ sortDepth: 5, draw: () => {}, colorSpace: "lin_rec709_display" }];
      }
    };
    const draw = (id: number, renderOrder: number) => {
      const modelMatrix = identity.slice(); modelMatrix[12] = id;
      return { renderer: splatRenderer, modelMatrix, colorSpace: "lin_rec709_display", renderOrder };
    };
    try {
      const runs = (renderer as unknown as { gaussianSplatRuns(...args: unknown[]): TransparentQueueItem[] }).gaussianSplatRuns(
        [draw(1, -1), draw(2, 1), draw(3, -1)], {}, { viewMatrix: identity, projectionMatrix: identity }, undefined, false,
        [{ item: { renderOrder: -1 }, sortDepth: 4 }, { item: { renderOrder: 1 }, sortDepth: 8 }],
        [{ renderOrder: 1, sortDepth: 3, draw: () => {} }, { sortDepth: 99, draw: () => {} }]
      );
      expect(calls).toEqual([{ ids: [1, 3], boundaries: [4] }, { ids: [2], boundaries: [8, 3] }]);
      expect(runs.map(run => run.renderOrder)).toEqual([-1, 1]);
    } finally { renderer.dispose(); }
  });
});
