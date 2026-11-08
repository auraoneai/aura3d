import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import "../../../packages/rendering/src/lanes/prd07";
import "../../../packages/engine/src/lanes/prd07";
import { createAuraAppWithPhysicsWorldAccess } from "../../../packages/engine/src/agent-api/app/createAuraAppCore";
import { renderProductionSourceWithProbesAsync } from "../../../packages/engine/src/agent-api/compiler/renderer";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import type { PhysicsWorldAccess } from "../../../packages/engine/src/agent-api/physics/PhysicsWorldProvider";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { ForwardPass } from "../../../packages/rendering/src/ForwardPass";
import { prd07ForwardFog, setPrd07ForwardFog } from "../../../packages/rendering/src/atmosphere/fogUniformStore";
import { prd07WetnessState, setPrd07WetnessState } from "../../../packages/rendering/src/atmosphere/shaders/wetness.glsl";
import type { ProgramFeatures } from "../../../packages/rendering/src/contracts/program";
import { ProgramCache } from "../../../packages/rendering/src/program/ProgramCache";
import { ProgramWarmup } from "../../../packages/rendering/src/program/ProgramWarmup";
import { rendererProgramCache } from "../../../packages/rendering/src/renderer/qrSubFlags";
import type { QrFlags } from "../../../packages/rendering/src/contracts/core";
import { beginPrd07RendererOperation, bindPrd07RendererAuthority } from "../../../packages/rendering/src/vfx/Prd07RendererBridge";
import { identityMat4 } from "@aura3d/scene";
import type { RenderSource } from "../../../packages/rendering/src/contracts/renderSource";

// These are real app mounts and real Renderer frames. Only the GPU backend is
// replaced: MockRenderDevice validates commands and records bound uniforms.
class FakeCanvas {
  width = 64; height = 64; clientWidth = 64; clientHeight = 64;
  style: Record<string, string> = {}; dataset: Record<string, string> = {}; parentElement = null;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}

const noPhysics: PhysicsWorldAccess = {
  preload: async () => {},
  requireReady: () => { throw new Error("Unexpected physics world"); }
};
const canvas = () => new FakeCanvas() as unknown as HTMLCanvasElement;

type Mounted = { readonly canvas: HTMLCanvasElement | OffscreenCanvas; readonly renderer: Renderer; readonly device: MockRenderDevice;
  readonly flags: QrFlags; lose(): void; failManagedLossUnsubscribe(): void };
let mounted: Mounted[];
let oldFog: ReturnType<typeof prd07ForwardFog>;
let oldWetness: ReturnType<typeof prd07WetnessState>;

beforeEach(() => {
  mounted = [];
  oldFog = prd07ForwardFog();
  oldWetness = { ...prd07WetnessState() };
  setPrd07ForwardFog(null);
  // A deliberately different legacy value reveals accidental ambient reads.
  setPrd07WetnessState({ wetness: 0.93, puddleThreshold: 0.62, rainRipples: 0, snowCover: 0, puddleNoise: null });
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64,
    location: { search: "", href: "http://localhost/" }, addEventListener() {}, removeEventListener() {} });
  const create = Renderer.create.bind(Renderer);
  vi.spyOn(Renderer, "create").mockImplementation(async (options = {}) => {
    const renderer = await create({ ...options, backend: "mock", requiredFeatures: [] });
    const device = renderer.device as MockRenderDevice;
    // Production backend selection verifies this field; the backend is still a
    // command-only mock, with no browser, WebGL context, or GPU execution.
    Object.defineProperty(device, "kind", { value: "webgl2" });
    Object.defineProperty(device, "info", { value: { ...device.info,
      capabilities: [...(device.info.capabilities ?? []), "hdr-render-targets"] } });
    const lossListeners = new Set<() => void>();
    let nextListener = 0, failManagedUnsubscribe = false;
    Object.defineProperty(device, "generation", { value: 1 });
    Object.defineProperty(device, "onDeviceLost", { value: (listener: () => void) => {
      const managed = nextListener++ === 0;
      lossListeners.add(listener);
      return () => {
        lossListeners.delete(listener);
        if (managed && failManagedUnsubscribe) throw new Error("loss unsubscribe failed");
      };
    } });
    mounted.push({ canvas: options.canvas!, renderer, device, flags: options.qrFlags!, lose: () => {
      device.contextLost = true;
      for (const listener of [...lossListeners]) listener();
    }, failManagedLossUnsubscribe: () => { failManagedUnsubscribe = true; } });
    return renderer;
  });
});

afterEach(() => {
  setPrd07ForwardFog(oldFog);
  setPrd07WetnessState(oldWetness);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function makeApp(target: HTMLCanvasElement, flags = ["core", "vfx", "vfx.fog"]) {
  return createAuraAppWithPhysicsWorldAccess(noPhysics, target, {
    scene: scene().add(primitives.box()), autoStart: false, resize: false, diagnostics: false,
    renderer: { backend: "webgl2" }, qualityRebuild: { flags }
  });
}

function wetness(device: MockRenderDevice): number {
  const values = device.drawCommands
    .map((command) => command.uniforms?.get("u_wetness"))
    .filter((value): value is number => typeof value === "number");
  expect(values.length, "a forward draw must bind wetness").toBeGreaterThan(0);
  expect(new Set(values).size).toBe(1);
  return values[0]!;
}

/** Suspend exactly one real generated-program warmup after it has started. */
function pauseNextWarmup() {
  let reached!: () => void, resume!: () => void;
  const entered = new Promise<void>((resolve) => { reached = resolve; });
  const gate = new Promise<void>((resolve) => { resume = resolve; });
  const warm = ProgramWarmup.prototype.warm;
  let first = true;
  vi.spyOn(ProgramWarmup.prototype, "warm").mockImplementation(function (this: ProgramWarmup, input, tier) {
    const result = warm.call(this, input, tier);
    if (!first) return result;
    first = false;
    reached();
    return result.then(() => gate);
  });
  return { entered, resume };
}

async function waitForWarmup(entered: Promise<void>, frame: Promise<void>): Promise<void> {
  await Promise.race([entered, frame.then(() => { throw new Error("Frame finished before the warmup gate"); })]);
}

describe("app-bound VFX renderer frames", () => {
  it.each([false, true])("submits each app's own wetness across interleaved frames (async=%s)", async (asynchronous) => {
    const canvasA = canvas(), canvasB = canvas();
    const appA = makeApp(canvasA), appB = makeApp(canvasB);
    try {
      appA.atmosphere!.setWetness(0.2);
      appB.atmosphere!.setWetness(0.8);
      await Promise.all([appA.readyStrict(), appB.readyStrict()]);
      const a = mounted.find((entry) => entry.canvas === canvasA)!;
      const b = mounted.find((entry) => entry.canvas === canvasB)!;
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      const step = async (app: typeof appA) => asynchronous ? app.stepAsync(0) : app.step(0);
      await step(appA);
      expect(wetness(a.device)).toBe(0.2);
      await step(appB);
      expect(wetness(b.device)).toBe(0.8);
      appA.atmosphere!.setWetness(0.5);
      await step(appB);
      expect(wetness(b.device)).toBe(0.8);
      await step(appA);
      expect(wetness(a.device)).toBe(0.5);
    } finally {
      await Promise.all([appA.disposeAsync(), appB.disposeAsync()]);
    }
  });

  it.each([false, true])("warms the owning app's wet shader before the forward pass (async=%s)", async (asynchronous) => {
    // A dry legacy store makes an accidental warmup read observable even if a
    // later draw is fixed independently. The app itself remains wet.
    setPrd07WetnessState({ wetness: 0 });
    const target = canvas();
    const app = makeApp(target);
    try {
      app.atmosphere!.setWetness(0.6);
      await app.ready();
      await app.readyStrict();
      const warmed: ProgramFeatures[] = [];
      let forwardStarted = false;
      const acquire = ProgramCache.prototype.acquire;
      const precompile = ProgramCache.prototype.precompile;
      const execute = ForwardPass.prototype.execute;
      vi.spyOn(ProgramCache.prototype, "acquire").mockImplementation(function (this: ProgramCache, features) {
        if (!forwardStarted) warmed.push(features);
        return acquire.call(this, features);
      });
      vi.spyOn(ProgramCache.prototype, "precompile").mockImplementation(function (this: ProgramCache, features) {
        if (!forwardStarted) warmed.push(...features);
        return precompile.call(this, features);
      });
      vi.spyOn(ForwardPass.prototype, "execute").mockImplementation(function (this: ForwardPass, context) {
        forwardStarted = true;
        return execute.call(this, context);
      });
      if (asynchronous) await app.stepAsync(0);
      else app.step(0);
      expect(forwardStarted).toBe(true);
      expect(warmed.length, "the generated-program warmup must run before forward").toBeGreaterThan(0);
      expect(warmed.some((features) => features.features["prd07.wetness"] === true)).toBe(true);
      const entry = mounted.find((candidate) => candidate.canvas === target)!;
      expect(wetness(entry.device)).toBe(0.6);
    } finally { await app.disposeAsync(); }
  });

  it("rejects a mutated app revision after async warmup before submitting it", async () => {
    const target = canvas(), app = makeApp(target);
    let resume = () => {};
    try {
      app.atmosphere!.setWetness(0.2);
      await app.ready();
      await app.readyStrict();
      const entry = mounted.find((candidate) => candidate.canvas === target)!;
      const draws = vi.spyOn(entry.device, "draw");
      const gate = pauseNextWarmup();
      resume = gate.resume;
      const pending = app.stepAsync(0);
      // Attach a handler immediately so a deliberate rejection cannot become
      // an unhandled rejection while the warmup is suspended.
      const settled = pending.then(() => null, (error: unknown) => error);
      await waitForWarmup(gate.entered, pending);
      app.atmosphere!.setWetness(0.4);
      gate.resume();
      expect(await settled).toMatchObject({ message: expect.stringMatching(/PRD07_ATMOSPHERE_SNAPSHOT_STALE/) });
      expect(draws).not.toHaveBeenCalled();
      await app.stepAsync(0);
      expect(wetness(entry.device)).toBe(0.4);
    } finally { resume(); await app.disposeAsync(); }
  });

  it("uses one app revision for probe faces and rejects a mutation between async readbacks", async () => {
    const target = canvas(), app = makeApp(target, ["core", "lighting", "vfx", "vfx.fog"]);
    let resume = () => {};
    try {
      app.atmosphere!.setWetness(0.2);
      await app.ready();
      await app.readyStrict();
      const entry = mounted.find((candidate) => candidate.canvas === target)!;
      const observedSource = vi.spyOn(entry.renderer, "render");
      app.step(0);
      const call = observedSource.mock.calls.at(-1)!;
      const source = call[0] as RenderSource, camera = call[1];
      observedSource.mockRestore();
      const withProbe = { ...source, "prd02.probes.snapshot": {
        kind: "probe", probe: "reflection", name: "snapshot",
        options: { position: [0, 0, 2], boxHalfExtents: [2, 2, 2], resolution: 64, update: "once" }
      } };
      let reached!: () => void;
      const entered = new Promise<void>((resolve) => { reached = resolve; });
      const gate = new Promise<void>((resolve) => { resume = resolve; });
      Object.defineProperty(entry.device, "readFloatPixelsAsync", { configurable: true,
        value: async (_x: number, _y: number, width: number, height: number) => {
          reached();
          await gate;
          return new Float32Array(width * height * 4);
        } });
      const faces = vi.spyOn(entry.renderer, "renderProbeFace");
      const main = vi.spyOn(entry.renderer, "renderAsync");
      const pending = renderProductionSourceWithProbesAsync(entry.renderer, withProbe, camera, entry.flags, {}, () => false);
      const settled = pending.then(() => null, (error: unknown) => error);
      await Promise.race([entered, pending.then(() => { throw new Error("Probe capture finished before readback was held"); })]);
      expect(faces.mock.calls.map((call) => call[1])).toEqual([0]);
      app.atmosphere!.setWetness(0.6);
      resume();
      expect(await settled).toMatchObject({ message: expect.stringMatching(/PRD07_ATMOSPHERE_SNAPSHOT_STALE/) });
      expect(faces.mock.calls.map((call) => call[1])).toEqual([0]);
      expect(main).not.toHaveBeenCalled();
      main.mockRestore();
      // A periodic capture spans multiple app frames. A later revision must
      // restart at face zero instead of retaining the previous revision's face.
      Object.defineProperty(entry.device, "readFloatPixelsAsync", { configurable: true,
        value: async (_x: number, _y: number, width: number, height: number) => new Float32Array(width * height * 4) });
      faces.mockClear();
      const periodicOwner = {};
      const periodic = { ...source, "prd02.probes.periodic": {
        kind: "probe", probe: "reflection", name: "periodic",
        options: { position: [0, 0, 2], boxHalfExtents: [2, 2, 2], resolution: 64, update: { everyNFrames: 1 } }
      } };
      await renderProductionSourceWithProbesAsync(entry.renderer, periodic, camera, entry.flags, periodicOwner, () => false);
      app.atmosphere!.setWetness(0.7);
      await renderProductionSourceWithProbesAsync(entry.renderer, periodic, camera, entry.flags, periodicOwner, () => false);
      await renderProductionSourceWithProbesAsync(entry.renderer, periodic, camera, entry.flags, periodicOwner, () => false);
      expect(faces.mock.calls.map((call) => call[1])).toEqual([0, 0, 1]);
      // A completed `update: "once"` cube survives later revisions (they arrive on every scene edit): no recapture.
      faces.mockClear();
      const onceOwner = {};
      const once = { ...source, "prd02.probes.once": {
        kind: "probe", probe: "reflection", name: "once",
        options: { position: [0, 0, 2], boxHalfExtents: [2, 2, 2], resolution: 64, update: "once" }
      } };
      await renderProductionSourceWithProbesAsync(entry.renderer, once, camera, entry.flags, onceOwner, () => false);
      app.atmosphere!.setWetness(0.65);
      await renderProductionSourceWithProbesAsync(entry.renderer, once, camera, entry.flags, onceOwner, () => false);
      app.atmosphere!.setWetness(0.7);
      await renderProductionSourceWithProbesAsync(entry.renderer, once, camera, entry.flags, onceOwner, () => false);
      expect(faces.mock.calls.map((call) => call[1])).toEqual([0, 1, 2, 3, 4, 5]);
      faces.mockRestore();
      await app.stepAsync(0);
      expect(wetness(entry.device)).toBe(0.7);
    } finally { resume(); await app.disposeAsync(); }
  });

  it.each([false, true])("keeps camera-dependent fog and app wetness distinct across views (async=%s)", async (asynchronous) => {
    const target = canvas(), app = makeApp(target);
    try {
      app.atmosphere!.setWetness(0.45);
      app.atmosphere!.setFog({ mode: "absorption", absorption: [0.1, 0.2, 0.3], color: "#ff0000" });
      await app.ready();
      await app.readyStrict();
      const entry = mounted.find((candidate) => candidate.canvas === target)!;
      const observedSource = vi.spyOn(entry.renderer, "render");
      app.step(0);
      const source = observedSource.mock.calls.at(-1)?.[0] as RenderSource;
      observedSource.mockRestore();
      expect(source).toBeDefined();
      const values: Array<{ wetness: unknown; camera: unknown; fog: unknown }> = [];
      const draw = entry.device.draw.bind(entry.device);
      vi.spyOn(entry.device, "draw").mockImplementation((command) => {
        const wet = command.uniforms?.get("u_wetness");
        if (typeof wet === "number") {
          const cameraPosition = command.uniforms?.get("u_cameraPosition");
          values.push({ wetness: wet,
            camera: Array.isArray(cameraPosition) ? [...cameraPosition] : cameraPosition,
            fog: command.uniforms?.get("u_fogMode") });
        }
        return draw(command);
      });
      const matrix = identityMat4();
      const camera = { viewMatrix: matrix, projectionMatrix: matrix };
      const input = { source, views: [
        { id: "left", camera, cameraPosition: [-2, 1, 3] as const, viewport: { x: 0, y: 0, width: 32, height: 64 } },
        { id: "right", camera, cameraPosition: [2, 4, 3] as const, viewport: { x: 32, y: 0, width: 32, height: 64 } }
      ] };
      if (asynchronous) await entry.renderer.renderAsync(input);
      else entry.renderer.render(input);
      expect(values).toEqual([
        { wetness: 0.45, camera: [-2, 1, 3], fog: 5 },
        { wetness: 0.45, camera: [2, 4, 3], fog: 5 }
      ]);
    } finally { await app.disposeAsync(); }
  });

  it("serializes shared-device app frames, isolates their flags, and keeps the device until the last owner", async () => {
    const canvasA = canvas(), canvasB = canvas();
    const appA = makeApp(canvasA);
    let appB: ReturnType<typeof makeApp> | undefined;
    let resume = () => {};
    try {
      appA.atmosphere!.setWetness(0.2);
      appA.atmosphere!.setFog({ mode: "absorption", absorption: [0.1, 0.2, 0.3], color: "#ff0000" });
      await appA.ready();
      await appA.readyStrict();
      const a = mounted.find((candidate) => candidate.canvas === canvasA)!;
      // Construct the second real renderer on the same command-only device.
      // No browser or GPU context is involved in this ownership test.
      vi.mocked(Renderer.create).mockImplementation(async (options = {}) => {
        const renderer = new Renderer(a.device, { ...options, shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory());
        mounted.push({ canvas: options.canvas!, renderer, device: a.device, flags: options.qrFlags!,
          lose: a.lose, failManagedLossUnsubscribe: a.failManagedLossUnsubscribe });
        return renderer;
      });
      appB = makeApp(canvasB, ["core", "vfx", "-vfx.fog"]);
      appB.atmosphere!.setWetness(0.8);
      appB.atmosphere!.setFog({ mode: "absorption", absorption: [0.3, 0.2, 0.1], color: "#00ff00" });
      await appB.ready();
      await appB.readyStrict();
      const b = mounted.find((candidate) => candidate.canvas === canvasB)!;
      expect(b.device).toBe(a.device);
      expect(a.flags.on("A3D_QR_VFX_FOG")).toBe(true);
      expect(b.flags.on("A3D_QR_VFX_FOG")).toBe(false);
      expect(rendererProgramCache(a.device, a.flags)).not.toBe(rendererProgramCache(b.device, b.flags));
      appA.step(0);
      expect(wetness(a.device)).toBe(0.2);
      expect(a.device.drawCommands.some((command) => command.uniforms?.get("u_fogMode") === 5)).toBe(true);
      appB.step(0);
      expect(wetness(b.device)).toBe(0.8);
      expect(b.device.drawCommands.some((command) => command.uniforms?.has("u_fogMode"))).toBe(false);

      const samples: number[] = [];
      const draw = a.device.draw.bind(a.device);
      vi.spyOn(a.device, "draw").mockImplementation((command) => {
        const value = command.uniforms?.get("u_wetness");
        if (typeof value === "number") samples.push(value);
        return draw(command);
      });
      const gate = pauseNextWarmup();
      resume = gate.resume;
      const first = appA.stepAsync(0);
      const firstSettled = first.then(() => undefined, () => undefined);
      await waitForWarmup(gate.entered, first);
      const second = appB.stepAsync(0);
      const secondSettled = second.then(() => undefined, () => undefined);
      for (let index = 0; index < 4; index++) await Promise.resolve();
      expect(samples).toEqual([]);
      gate.resume();
      await Promise.all([first, second]);
      await Promise.all([firstSettled, secondSettled]);
      expect(samples).toEqual([0.2, 0.8]);

      await appA.disposeAsync();
      expect(a.device.disposed).toBe(false);
      appB.step(0);
      expect(wetness(b.device)).toBe(0.8);
      await appB.disposeAsync();
      expect(a.device.disposed).toBe(true);
    } finally {
      resume();
      await Promise.all([appA.disposeAsync(), appB?.disposeAsync()]);
    }
  });

  it.each(["loss", "disposal"] as const)("stops a suspended app after %s without affecting another app", async (reason) => {
    const canvasA = canvas(), canvasB = canvas();
    const appA = makeApp(canvasA), appB = makeApp(canvasB);
    let resume = () => {};
    try {
      appA.atmosphere!.setWetness(0.2);
      appB.atmosphere!.setWetness(0.8);
      await Promise.all([appA.ready(), appB.ready()]);
      await Promise.all([appA.readyStrict(), appB.readyStrict()]);
      const a = mounted.find((candidate) => candidate.canvas === canvasA)!;
      const b = mounted.find((candidate) => candidate.canvas === canvasB)!;
      const draws = vi.spyOn(a.device, "draw");
      const gate = pauseNextWarmup();
      resume = gate.resume;
      const pending = appA.stepAsync(0);
      const settled = pending.then(() => undefined, () => undefined);
      await waitForWarmup(gate.entered, pending);
      if (reason === "loss") a.lose();
      else appA.dispose();
      gate.resume();
      await settled;
      expect(draws).not.toHaveBeenCalled();
      await appB.stepAsync(0);
      expect(wetness(b.device)).toBe(0.8);
    } finally {
      resume();
      await Promise.all([appA.disposeAsync(), appB.disposeAsync()]);
    }
  });

  it("continues renderer and device disposal when the managed loss unsubscribe throws", async () => {
    const target = canvas(), app = makeApp(target);
    try {
      await app.ready();
      await app.readyStrict();
      const entry = mounted.find((candidate) => candidate.canvas === target)!;
      entry.failManagedLossUnsubscribe();
      expect(() => entry.renderer.dispose()).toThrow(/Renderer disposal failed/);
      expect(entry.device.disposed).toBe(true);
      expect(() => entry.renderer.dispose()).not.toThrow();
    } finally { await app.disposeAsync(); }
  });

  it("attempts both authority and device unsubscriptions even if one throws", () => {
    const renderer = {}, device = new MockRenderDevice(), owner = {}, target = {}, overlay = {};
    const offLoss = vi.fn();
    const offAuthority = vi.fn(() => { throw new Error("authority unsubscribe failed"); });
    Object.defineProperty(device, "onDeviceLost", { value: () => offLoss });
    const unbind = bindPrd07RendererAuthority(renderer, device, owner, target, {
      owner, canvas: target, overlay, isLive: () => true, capture: () => null,
      isCurrent: () => true, onRevoke: () => offAuthority
    });
    try {
      expect(() => unbind()).toThrow(/PRD07 renderer authority cleanup failed/);
      expect(offAuthority).toHaveBeenCalledTimes(1);
      expect(offLoss).toHaveBeenCalledTimes(1);
      expect(() => beginPrd07RendererOperation(renderer)).toThrow(/PRD07_RENDERER_MOUNT_REVOKED/);
      expect(() => unbind()).not.toThrow();
    } finally { device.dispose(); }
  });
});
