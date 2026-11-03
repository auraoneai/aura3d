import { afterEach, describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import "../../../packages/rendering/src/lanes/prd02";
import { NativeLightProbeGrid } from "@aura3d/engine/lighting";
import { advancedLightingStateFor, releaseAdvancedLightingState, setAdvancedLightingInvalidator } from "../../../packages/engine/src/agent-api/app/advancedLightingState";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { createProductionRuntimeSceneRenderer } from "../../../packages/engine/src/agent-api/compiler/renderer";
import { defineAuraCustomGeometry } from "../../../packages/engine/src/agent-api/RootGeometry";
import { batched } from "../../../packages/engine/src/agent-api/nodes/batched";
import { camera } from "../../../packages/engine/src/agent-api/nodes/camera";
import { cameras } from "../../../packages/engine/src/agent-api/nodes/cameras";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { surfaces } from "../../../packages/engine/src/agent-api/nodes/surfaces";
import type { AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { packedLoopMemberFor } from "../../../packages/rendering/src/batching/BatchMembers";
import type { RenderItem, RenderSource, RendererView } from "../../../packages/rendering/src";
import { Renderer } from "../../../packages/rendering/src/Renderer";

class FakeCanvas {
  width = 100; height = 50; clientWidth = 100; clientHeight = 50;
  style = {}; dataset = {}; parentElement = null;
  getBoundingClientRect() { return { width: this.width, height: this.height, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}

const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const tile = (x: number) => ({ fullWidth: 800, fullHeight: 400, x, y: 0, width: 400, height: 400 });
const flags = (compiler: boolean) => resolveQrFlags({ options: {
  A3D_QR_COMPILER: compiler, A3D_QR_CORE: true, A3D_QR_LIGHTING: false, A3D_QR_POST: false
} });

function arrayViews() {
  return cameras.array({ cameras: [
    { viewport: rect(0, 0, 0.5, 1), camera: { layers: 1, viewOffset: tile(0) } },
    { viewport: rect(0.5, 0, 0.5, 1), camera: { layers: 2, viewOffset: tile(400) } }
  ] });
}

function stereoViews() {
  return cameras.stereo({ views: [
    { camera: { layers: 1, viewOffset: tile(0) } },
    { camera: { layers: 2, viewOffset: tile(400) } }
  ] });
}

function sourceScene(view?: ReturnType<typeof cameras.array>): AuraSceneSnapshot {
  const builder = scene()
    .camera(camera.perspective({ position: [0, 0, 5], target: [0, 0, 0], near: 1, far: 100, fov: 90 }))
    .add(primitives.box({ name: "left-only", layers: 1, frustumCulled: false }))
    .add(primitives.sphere({ name: "right-only", layers: 2, frustumCulled: false }))
    .add(cameras.cube({ resolution: 4 }))
    .add(surfaces.mirror({ resolution: 4 }));
  if (view) builder.add(view);
  return builder.toJSON();
}

function installMockRenderer(): void {
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", {
    innerWidth: 100, innerHeight: 50, location: { href: "http://localhost/", search: "" },
    addEventListener() {}, removeEventListener() {}
  });
  const create = Renderer.create.bind(Renderer);
  vi.spyOn(Renderer, "create").mockImplementation(async (options = {}) => {
    const renderer = await create({ ...options, backend: "mock", requiredFeatures: [] });
    Object.defineProperty(renderer.device, "kind", { value: "webgl2" });
    Object.defineProperty(renderer.device, "info", { value: {
      ...renderer.device.info, capabilities: [...(renderer.device.info.capabilities ?? []), "hdr-render-targets"]
    } });
    return renderer;
  });
}

async function mount(snapshot: AuraSceneSnapshot, compiler = false, customFlags = flags(compiler)) {
  installMockRenderer();
  const canvas = new FakeCanvas();
  const registry = createAuraRuntimeNodeRegistry(snapshot, { flags: customFlags });
  try {
    const controller = await createProductionRuntimeSceneRenderer(
      canvas as unknown as HTMLCanvasElement, snapshot, { backend: "webgl2" }, registry, customFlags
    );
    const renderer = controller.auraRenderer as Renderer;
    return {
      canvas, registry, controller, renderer,
      async dispose() { controller.dispose(); registry.dispose(); await controller.whenDisposed?.(); }
    };
  } catch (error) {
    registry.dispose();
    throw error;
  }
}

function observe(renderer: Renderer) {
  const internals = renderer as unknown as { warmGeneratedPrograms(...args: unknown[]): Promise<void> };
  return {
    warm: vi.spyOn(internals, "warmGeneratedPrograms"),
    precompile: vi.spyOn(renderer, "precompile"),
    render: vi.spyOn(renderer, "render"),
    probe: vi.spyOn(renderer, "renderProbeFace"),
    begin: vi.spyOn(renderer.device, "beginFrame"),
    draw: vi.spyOn(renderer.device, "draw"),
    compile: vi.spyOn(renderer.device, "createShaderProgram")
  };
}

function expectNoSubmit(observation: ReturnType<typeof observe>): void {
  expect(observation.render).not.toHaveBeenCalled();
  expect(observation.probe).not.toHaveBeenCalled();
  expect(observation.begin).not.toHaveBeenCalled();
  expect(observation.draw).not.toHaveBeenCalled();
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("root multiview precompile", () => {
  it.each([
    { kind: "array", makeViews: arrayViews, compiler: false },
    { kind: "array", makeViews: arrayViews, compiler: true },
    { kind: "stereo", makeViews: stereoViews, compiler: false },
    { kind: "stereo", makeViews: stereoViews, compiler: true }
  ])("warms each $kind view with compiler=$compiler and follows resize without captures", async ({ makeViews, compiler }) => {
    const f = await mount(sourceScene(makeViews()), compiler);
    const observation = observe(f.renderer);
    try {
      const result = await f.controller.precompile!();
      expect(result.compiledPrograms).toBeGreaterThan(0);
      expect(observation.compile).toHaveBeenCalled();
      expect(observation.warm).toHaveBeenCalledTimes(2);
      const warmed = observation.warm.mock.calls.map((args) => (args[0] as readonly RenderItem[]).map((item) => item.label ?? ""));
      expect(warmed[0]!.some((label) => label.includes("left-only"))).toBe(true);
      expect(warmed[0]!.some((label) => label.includes("right-only"))).toBe(false);
      expect(warmed[1]!.some((label) => label.includes("right-only"))).toBe(true);
      expect(warmed[1]!.some((label) => label.includes("left-only"))).toBe(false);
      const first = observation.precompile.mock.calls[0]![0] as { views: readonly RendererView[] };
      expect(first.views.map((view) => view.viewport)).toEqual([rect(0, 0, 50, 50), rect(50, 0, 50, 50)]);
      expectNoSubmit(observation);

      f.canvas.width = 200; f.canvas.height = 80;
      f.controller.resize!(200, 80);
      await f.controller.precompile!();
      const second = observation.precompile.mock.calls[1]![0] as { views: readonly RendererView[] };
      expect(second.views.map((view) => view.viewport)).toEqual([rect(0, 0, 100, 80), rect(100, 0, 100, 80)]);
      expect(second.views.map((view) => view.id)).toEqual(first.views.map((view) => view.id));
      expect(observation.warm).toHaveBeenCalledTimes(4);
      expectNoSubmit(observation);
    } finally { await f.dispose(); }
  });

  it("keeps ordinary single-camera precompile and never captures surfaces", async () => {
    const f = await mount(sourceScene());
    const observation = observe(f.renderer);
    try {
      const result = await f.controller.precompile!();
      expect(result.compiledPrograms).toBeGreaterThan(0);
      expect(observation.warm).toHaveBeenCalledTimes(1);
      expect((observation.precompile.mock.calls[0]![0] as { views?: unknown }).views).toBeUndefined();
      expectNoSubmit(observation);
    } finally { await f.dispose(); }
  });

  it.each([
    { name: "second array depth", view: cameras.array({ cameras: [
      { viewport: rect(0, 0, 0.5, 1) },
      { viewport: rect(0.5, 0, 0.5, 1), camera: { depth: { mode: "reversed", clipRange: "zero-to-one" } as never } }
    ] }), error: /CAMERA_ARRAY_DEPTH_UNSUPPORTED/ },
    { name: "second array tile", view: cameras.array({ cameras: [
      { viewport: rect(0, 0, 0.5, 1) },
      { viewport: rect(0.5, 0, 0.5, 1), camera: { viewOffset: tile(401) } }
    ] }), error: /view offset/i },
    { name: "stereo overflow", view: cameras.stereo({ zoom: Number.MAX_VALUE }), error: /CAMERA_STEREO_INVALID/ }
  ])("rejects invalid $name before warmup or capture", async ({ view, error }) => {
    const f = await mount(sourceScene(view));
    const observation = observe(f.renderer);
    try {
      await expect(f.controller.precompile!()).rejects.toThrow(error);
      // A rejected view must release the device lock for the next attempt.
      await expect(f.controller.precompile!()).rejects.toThrow(error);
      expect(observation.precompile).not.toHaveBeenCalled();
      expect(observation.warm).not.toHaveBeenCalled();
      expect(observation.compile).not.toHaveBeenCalled();
      expectNoSubmit(observation);
    } finally { await f.dispose(); }
  });

  it("preserves the advanced-lighting precompile rejection for multiview sources", async () => {
    const f = await mount(sourceScene(arrayViews()));
    const observation = observe(f.renderer);
    const unregister = setAdvancedLightingInvalidator(f.registry, () => {});
    const grid = new NativeLightProbeGrid({ min: [0, 0, 0], max: [1, 1, 1], dimensions: [1, 1, 1] });
    let detach = () => {};
    try {
      detach = advancedLightingStateFor(f.registry).attachIndirect({ kind: "probe-grid", grid });
      await expect(f.controller.precompile!()).rejects.toThrow(/precompile requires a live frame/i);
      expect(observation.warm).not.toHaveBeenCalled();
      expectNoSubmit(observation);
    } finally {
      detach(); unregister();
      await f.dispose();
      releaseAdvancedLightingState(f.registry);
      grid.dispose();
    }
  });

  it("retains the original compiled frame while a multiview precompile is pending", async () => {
    const batch = batched.mesh({ maxInstances: 1, multiDraw: "loop" });
    const geometry = defineAuraCustomGeometry({ positions: [0, 0, 0, 2, 0, 0, 0, 2, 0], indices: [0, 1, 2] });
    batch.addInstance(batch.addGeometry(geometry));
    batch.addGeometry(geometry);
    const snapshot = scene()
      .camera(camera.perspective({ position: [0, 0, 5], target: [0, 0, 0] }))
      .add(primitives.box())
      .add(batch.runtime({ id: "lease-batch" }).toJSON())
      .add(arrayViews())
      .toJSON();
    const batchFlags = resolveQrFlags({ options: "parity.batching,tiers.batching,core,compiler,-lighting,-post" });
    const f = await mount(snapshot, true, batchFlags);
    let unblock!: () => void;
    let signalEntered!: () => void;
    const gate = new Promise<void>((resolve) => { unblock = resolve; });
    const entered = new Promise<void>((resolve) => { signalEntered = resolve; });
    let lease!: NonNullable<ReturnType<typeof packedLoopMemberFor>>["lease"];
    const precompile = vi.spyOn(f.renderer, "precompile").mockImplementation(async (argument) => {
      const input = argument as { source: RenderSource; views: readonly RendererView[] };
      expect(input.views).toHaveLength(2);
      const items = [...(input.source.collectRenderItems?.() ?? input.source.renderItems ?? [])];
      const packet = items.map(packedLoopMemberFor).find((value) => value !== undefined);
      if (!packet) throw new Error("Expected a compiled packed-loop frame lease.");
      lease = packet.lease;
      signalEntered();
      await gate;
      return { compiledPrograms: 0, durationMs: 0 };
    });
    const job = f.controller.precompile!();
    try {
      await Promise.race([entered, job.then(() => { throw new Error("Precompile finished before the lease was observed."); })]);
      expect(precompile).toHaveBeenCalledTimes(1);
      expect(lease.isCurrent()).toBe(true);
      f.controller.update!(1000);
      expect(lease.isCurrent()).toBe(true);
      unblock();
      await job;
      expect(lease.isCurrent()).toBe(false);
    } finally {
      unblock();
      await job.catch(() => {});
      await f.dispose();
      batch.dispose();
    }
  });
});
