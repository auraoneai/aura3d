import { describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { MockRenderDevice, type RenderTarget, type RenderTargetDescriptor, type ShaderSources } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import type { RenderDevice } from "../../../packages/rendering/src/RenderDevice";
import type { VolumeRenderer } from "../../../packages/rendering/src/VolumeRenderer";
import type { FrameCamera, FrameContributorContext } from "../../../packages/rendering/src/contracts/frameGraph";
import { mergeTransparentSegments } from "../../../packages/rendering/src/renderer/InterleavedTransparentPass";
import { assertScalarVolumeRoute, scalarVolumeTransparentItems, snapshotScalarVolumeDraws, type ScalarVolumeDrawRecord, type ScalarVolumeRoute } from "../../../packages/rendering/src/renderer/ScalarVolumeFrame";

const nativeVolumeDraw = vi.hoisted(() => vi.fn());
vi.mock("../../../packages/rendering/src/webgl2/ScalarVolumeHost", () => ({ drawScalarVolumeOnWebGL2: nativeVolumeDraw }));

const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const record = (offset = 0): ScalarVolumeDrawRecord => ({
  renderer: {} as VolumeRenderer,
  frameLease: { assertCurrent() {}, release() {} },
  modelMatrix: identity(),
  worldBounds: { min: [offset, -1, -1], max: [offset + 2, 1, 1] },
  layerMask: 1,
  frustumCulled: true,
  renderOrder: 0,
  mode: { type: "slice", axis: "z", position: 0.25 }
});

describe("scalar volume frame records", () => {
  it("samples the collection once and snapshots mutable matrices, bounds and slice mode", () => {
    const original = record();
    let reads = 0;
    const source = { get scalarVolumes() { reads += 1; return [original]; } };
    const [snapshot] = snapshotScalarVolumeDraws(source);
    original.modelMatrix[12] = 7;
    (original.worldBounds.min as unknown as number[])[0] = 9;
    (original.mode as unknown as { position: number }).position = 0.75;
    expect(reads).toBe(1);
    expect(snapshot!.modelMatrix[12]).toBe(0);
    expect(snapshot!.worldBounds.min[0]).toBe(0);
    expect(snapshot!.mode).toEqual({ type: "slice", axis: "z", position: 0.25 });
    expect(snapshot!.renderer).toBe(original.renderer);
  });

  it("treats sources without a volume collection as empty", () => {
    expect(snapshotScalarVolumeDraws(undefined)).toEqual([]);
    expect(snapshotScalarVolumeDraws({})).toEqual([]);
    expect(snapshotScalarVolumeDraws([])).toEqual([]);
  });

  it("rejects malformed matrices, bounds, modes and non-finite sort inputs", () => {
    const original = record();
    for (const invalid of [
      { ...original, modelMatrix: new Float32Array(15) },
      { ...original, modelMatrix: Float32Array.from([...identity().slice(0, 15), Infinity]) },
      { ...original, worldBounds: { min: [2, 0, 0], max: [1, 1, 1] } },
      { ...original, mode: { type: "slice", axis: "x", position: 2 } },
      { ...original, renderOrder: Number.NaN }
    ]) {
      expect(() => snapshotScalarVolumeDraws({ scalarVolumes: [invalid] })).toThrow(/Scalar volume/);
    }
    expect(() => snapshotScalarVolumeDraws({ scalarVolumes: {} })).toThrow(/array/);
  });

  it("filters by camera layer and optional frustum without hiding uncullable volumes", () => {
    const draws = snapshotScalarVolumeDraws({ scalarVolumes: [record(0), { ...record(4), layerMask: 2 },
      { ...record(8), frustumCulled: false }] });
    const intersects = vi.fn(() => false);
    const queue = scalarVolumeTransparentItems(draws, [0, 0, 0], 1, intersects, () => {});
    expect(queue).toHaveLength(1);
    expect(queue[0]!.sortDepth).toBe(9);
    expect(intersects).toHaveBeenCalledTimes(1);
    expect(scalarVolumeTransparentItems(draws, [0, 0, 0], 2, undefined, () => {})).toHaveLength(1);
  });

  it("interleaves with transparent meshes using render order and camera distance", () => {
    const near = { ...record(1), renderOrder: 0 };
    const far = { ...record(9), renderOrder: 0 };
    const early = { ...record(100), renderOrder: -1 };
    const drawn: ScalarVolumeDrawRecord[] = [];
    const queue = scalarVolumeTransparentItems(snapshotScalarVolumeDraws({ scalarVolumes: [near, far, early] }),
      [0, 0, 0], undefined, undefined, (draw) => drawn.push(draw));
    const mesh = { item: { label: "mesh", renderOrder: 0 } as never, sortDepth: 5 };
    const segments = mergeTransparentSegments([mesh], queue);
    expect(segments.map((segment) => segment.engine ? "mesh" : segment.queue!.renderOrder === -1 ? "early" : segment.queue!.sortDepth))
      .toEqual(["early", 10, "mesh", 2]);
    for (const segment of segments) segment.queue?.draw({} as FrameContributorContext);
    expect(drawn.map((entry) => entry.worldBounds.min[0])).toEqual([100, 9, 1]);
  });

  it("requires a finite active camera position", () => {
    const draws = snapshotScalarVolumeDraws({ scalarVolumes: [record()] });
    expect(() => scalarVolumeTransparentItems(draws, [0, Infinity, 0], undefined, undefined, () => {}))
      .toThrow(/finite active camera/);
  });

  it("admits only the known core linear-output route and validates volume ownership", () => {
    const renderer = { assertUsableForDevice: vi.fn() } as unknown as VolumeRenderer;
    const lease = { assertCurrent: vi.fn(), release: vi.fn() };
    const draws = snapshotScalarVolumeDraws({ scalarVolumes: [{ ...record(), renderer, frameLease: lease }] });
    const device = { kind: "webgl2", disposed: false, contextLost: false, generation: 3 } as unknown as RenderDevice;
    const camera = { position: [0, 0, 0], depth: { mode: "standard", clipRange: "minus-one-to-one", clearValue: 1,
      compare: "less-equal" } } as unknown as FrameCamera;
    const route: ScalarVolumeRoute = { device, deviceGeneration: 3, camera, coreOutput: true, postprocess: false,
      backgroundCoverage: false, explicitTarget: false, multiView: false, fullViewport: true, renderScale: 1,
      globalClipping: false, transmission: false, deferred: false };
    expect(() => assertScalarVolumeRoute(draws, route)).not.toThrow();
    expect(lease.assertCurrent).toHaveBeenCalledOnce();
    expect(renderer.assertUsableForDevice).toHaveBeenCalledWith(device);
    for (const unsupported of [
      { ...route, coreOutput: false }, { ...route, postprocess: true }, { ...route, backgroundCoverage: true },
      { ...route, explicitTarget: true }, { ...route, multiView: true }, { ...route, fullViewport: false },
      { ...route, renderScale: 0.5 }, { ...route, globalClipping: true }, { ...route, transmission: true },
      { ...route, deferred: true }, { ...route, deviceGeneration: 2 }, { ...route, camera: null },
      { ...route, camera: { ...camera, depth: { ...camera.depth!, mode: "reversed" } } as FrameCamera }
    ]) {
      expect(() => assertScalarVolumeRoute(draws, unsupported)).toThrow();
    }
    // Scenes with no volumes keep their ordinary routes unchanged.
    expect(() => assertScalarVolumeRoute([], { ...route, coreOutput: false })).not.toThrow();
  });

  it.each([false, true])("plans depth copy, volume draw, then encoded core output (async=%s)", async (asynchronous) => {
    nativeVolumeDraw.mockReset();
    const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_OUTPUT: true });
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    // Command-level mock only; no WebGL context, shader compiler, or pixels.
    Object.defineProperty(device, "kind", { configurable: true, value: "webgl2" });
    Object.defineProperty(device, "generation", { configurable: true, value: 1 });
    const createTarget = device.createRenderTarget.bind(device), descriptors: RenderTargetDescriptor[] = [];
    const draw = device.draw.bind(device), trace: string[] = [];
    const createShader = device.createShaderProgram.bind(device), shaders: ShaderSources[] = [];
    vi.spyOn(device, "createRenderTarget").mockImplementation((descriptor) => { descriptors.push(descriptor); return createTarget(descriptor); });
    vi.spyOn(device, "createShaderProgram").mockImplementation((sources) => { shaders.push(sources); return createShader(sources); });
    vi.spyOn(device, "draw").mockImplementation((command) => { trace.push(command.label ?? "draw"); return draw(command); });
    nativeVolumeDraw.mockImplementation((context: FrameContributorContext) => {
      const target = context.blackboard.get("prd01.forwardTarget") as RenderTarget;
      const copy = context.blackboard.get("aura.scene.depth.copy") as RenderTarget;
      expect(target.colorTexture.colorSpace).toBe("linear");
      expect(copy.depthTexture).toBeDefined();
      expect(copy.depthTexture).not.toBe(target.depthTexture);
      trace.push("volume");
    });
    const volumeRenderer = { assertUsableForDevice: vi.fn() } as unknown as VolumeRenderer;
    const frameLease = { assertCurrent: vi.fn(), release: vi.fn() };
    const volume = { ...record(), renderer: volumeRenderer, frameLease };
    const camera = { viewMatrix: identity(), projectionMatrix: identity(), viewProjectionMatrix: identity() };
    try {
      const input = { source: { renderItems: [], scalarVolumes: [volume] }, camera, frameId: 1 };
      if (asynchronous) await renderer.renderAsync(input); else renderer.render(input);
      expect(descriptors.find((entry) => entry.label === "renderer-hdr-scene"))
        .toMatchObject({ width: 4, height: 4, depth: "texture", sampleCount: 1 });
      expect(trace.indexOf("prd01-scene-depth-copy")).toBeGreaterThanOrEqual(0);
      expect(trace.indexOf("volume")).toBeGreaterThan(trace.indexOf("prd01-scene-depth-copy"));
      expect(trace.indexOf("prd01-output")).toBeGreaterThan(trace.indexOf("volume"));
      expect(shaders.some((shader) => shader.label?.startsWith("prd01-output") && shader.fragment.includes("a3dLinearToSRGB"))).toBe(true);
      expect(frameLease.assertCurrent).toHaveBeenCalled();
    } finally { renderer.dispose(); }
  });

  it.each([false, true])("rejects an unverified direct output route before allocating a target (async=%s)", async (asynchronous) => {
    nativeVolumeDraw.mockReset();
    const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_OUTPUT: false });
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    Object.defineProperty(device, "kind", { configurable: true, value: "webgl2" });
    Object.defineProperty(device, "generation", { configurable: true, value: 1 });
    const allocate = vi.spyOn(device, "createRenderTarget");
    const volume = { ...record(), renderer: { assertUsableForDevice: vi.fn() } as unknown as VolumeRenderer };
    const input = { source: { renderItems: [], scalarVolumes: [volume] },
      camera: { viewMatrix: identity(), projectionMatrix: identity(), viewProjectionMatrix: identity() }, frameId: 1 };
    try {
      if (asynchronous) await expect(renderer.renderAsync(input)).rejects.toThrow(/core linear output route/);
      else expect(() => renderer.render(input)).toThrow(/core linear output route/);
      expect(allocate).not.toHaveBeenCalled();
      expect(nativeVolumeDraw).not.toHaveBeenCalled();
    } finally { renderer.dispose(); }
  });
});
