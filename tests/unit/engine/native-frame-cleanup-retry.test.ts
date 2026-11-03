import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuraRuntimeNodeRegistry, WebGLRenderController } from "../../../packages/engine/src/agent-api/nodes/types";

const state = vi.hoisted(() => ({
  renderers: [] as ReturnType<typeof sceneRenderer>[],
  controllers: [] as WebGLRenderController[],
  labelDisposals: [] as ReturnType<typeof vi.fn>[],
  diagnosticsFreezes: [] as ReturnType<typeof vi.fn>[],
  lightingReleases: [] as ReturnType<typeof vi.fn>[]
}));

vi.mock("../../../packages/engine/src/agent-api/app/mountRenderer", () => ({
  createProductionSceneRenderer: async () => {
    const renderer = state.renderers.shift();
    if (!renderer) throw new Error("No scene renderer queued");
    return renderer;
  }
}));

vi.mock("../../../packages/engine/src/agent-api/app/frameLoop", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../packages/engine/src/agent-api/app/frameLoop")>();
  return {
    ...actual,
    startProductionRender: (...args: Parameters<typeof actual.startProductionRender>) =>
      actual.startProductionRender(...args).then((controller) => {
        state.controllers.push(controller);
        return controller;
      })
  };
});

vi.mock("../../../packages/engine/src/agent-api/diagnostics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../packages/engine/src/agent-api/diagnostics")>();
  return {
    ...actual,
    bindLazyFrameDiagnostics: (...args: Parameters<typeof actual.bindLazyFrameDiagnostics>) => {
      const binding = actual.bindLazyFrameDiagnostics(...args);
      const freeze = vi.fn(() => binding.freeze());
      state.diagnosticsFreezes.push(freeze);
      return { ...binding, freeze };
    }
  };
});

vi.mock("../../../packages/engine/src/agent-api/compiler/labels", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../packages/engine/src/agent-api/compiler/labels")>(),
  createSceneLabelLayer: () => {
    const dispose = vi.fn();
    state.labelDisposals.push(dispose);
    return { setLabels() {}, setOcclusionTest() {}, update() {}, snapshot: () => [], dispose };
  }
}));

vi.mock("../../../packages/engine/src/agent-api/app/advancedLightingState", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../packages/engine/src/agent-api/app/advancedLightingState")>();
  return {
    ...actual,
    setAdvancedLightingInvalidator: (...args: Parameters<typeof actual.setAdvancedLightingInvalidator>) => {
      const release = actual.setAdvancedLightingInvalidator(...args);
      const tracked = vi.fn(() => release());
      state.lightingReleases.push(tracked);
      return tracked;
    }
  };
});

import { createAuraApp, primitives, scene } from "../../../packages/engine/src";
import { startProductionRender } from "../../../packages/engine/src/agent-api/app/frameLoop";
import { createInitialDiagnostics } from "../../../packages/engine/src/agent-api/diagnostics";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { createLeanCoreShaderLibrary } from "../../../packages/rendering/src/ShaderLibraryCore";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";

class FakeCanvas {
  width = 64; height = 64; clientWidth = 64; clientHeight = 64;
  style = {}; dataset = {}; parentElement = null;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}

function sceneRenderer(native?: Renderer) {
  const unsubscribe = vi.fn();
  const diagnostics = createInitialDiagnostics(scene().add(primitives.box()).toJSON(), undefined).renderer;
  let resourceChanged: (() => void) | undefined;
  return {
    backend: "webgl2" as const,
    diagnostics,
    auraRenderer: native,
    render: vi.fn(() => 1),
    renderAsync: vi.fn(async () => 1),
    viewProjection: () => new Float32Array(16),
    deviceLost: () => false,
    dispose: vi.fn(() => native?.dispose()),
    whenDisposed: undefined as undefined | (() => Promise<void>),
    onResourceChange: vi.fn((listener: () => void) => {
      resourceChanged = listener;
      return () => { unsubscribe(); resourceChanged = undefined; };
    }),
    notify: () => resourceChanged?.(),
    unsubscribe
  };
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const ticks = async () => { for (let index = 0; index < 24; index += 1) await Promise.resolve(); };
const leaves = (error: unknown): unknown[] => error instanceof AggregateError ? error.errors.flatMap(leaves) : [error];
const caught = (work: () => void): unknown => {
  try { work(); } catch (error) { return error; }
  throw new Error("Expected cleanup to fail");
};

async function mount(
  renderer: ReturnType<typeof sceneRenderer>,
  options: { readonly async?: boolean; readonly canvas?: FakeCanvas; readonly runtimeNodes?: AuraRuntimeNodeRegistry;
    readonly atmosphere?: () => () => void } = {}
) {
  const snapshot = scene().add(primitives.box({ name: "cleanup" })).toJSON();
  state.renderers.push(renderer);
  return startProductionRender((options.canvas ?? new FakeCanvas()) as unknown as HTMLCanvasElement, snapshot,
    createInitialDiagnostics(snapshot, undefined), { scene: snapshot, autoStart: false, resize: false, ...(options.async ? { frameMode: "async" as const } : {}) },
    undefined, undefined, undefined, options.runtimeNodes ?? {} as AuraRuntimeNodeRegistry,
    undefined, undefined, undefined, undefined, undefined, undefined, undefined,
    options.atmosphere ? { subscribePrd07Atmosphere: options.atmosphere } : undefined);
}

beforeEach(() => {
  state.renderers.length = 0;
  state.controllers.length = 0;
  state.labelDisposals.length = 0;
  state.diagnosticsFreezes.length = 0;
  state.lightingReleases.length = 0;
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", {
    innerWidth: 64, innerHeight: 64, location: { search: "", href: "https://frame.example.test/" },
    addEventListener: vi.fn(), removeEventListener: vi.fn()
  });
  vi.stubGlobal("document", {
    hidden: false, body: { dataset: {} }, addEventListener: vi.fn(), removeEventListener: vi.fn()
  });
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("frame-controller renderer cleanup retry", () => {
  it("retries the real native device owner published by the app without replaying other cleanup", async () => {
    const failure = new Error("native device cleanup failed");
    const device = new MockRenderDevice();
    const native = new Renderer(device, { width: 64, height: 64, shaderLibrary: createLeanCoreShaderLibrary() }, new TemporalHistory());
    const disposeDevice = device.dispose.bind(device);
    const deviceDispose = vi.spyOn(device, "dispose").mockImplementationOnce(() => { throw failure; }).mockImplementation(disposeDevice);
    const renderer = sceneRenderer(native);
    state.renderers.push(renderer);
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: scene().add(primitives.box({ name: "real-app" })), autoStart: false, resize: false, diagnostics: false
    });
    try {
      await app.ready();
      const controller = state.controllers[0]!;
      expect(controller).toBeDefined();
      app.dispose();
      await expect(app.disposeAsync()).rejects.toSatisfy((error: unknown) => leaves(error).includes(failure));
      expect(device.disposed).toBe(false);
      expect(renderer.dispose).toHaveBeenCalledTimes(1);
      expect(state.diagnosticsFreezes[0]).toHaveBeenCalledTimes(1);
      expect(state.labelDisposals[0]).toHaveBeenCalledTimes(1);
      expect(state.lightingReleases[0]).toHaveBeenCalledTimes(1);
      expect(renderer.unsubscribe).toHaveBeenCalledTimes(1);

      controller.dispose();
      controller.dispose();
      expect(device.disposed).toBe(true);
      expect(deviceDispose).toHaveBeenCalledTimes(2);
      expect(renderer.dispose).toHaveBeenCalledTimes(2);
      expect(state.diagnosticsFreezes[0]).toHaveBeenCalledTimes(1);
      expect(state.labelDisposals[0]).toHaveBeenCalledTimes(1);
      expect(state.lightingReleases[0]).toHaveBeenCalledTimes(1);
      expect(renderer.unsubscribe).toHaveBeenCalledTimes(1);
      await expect(controller.whenIdle!()).resolves.toBeUndefined();
    } finally {
      app.dispose();
      deviceDispose.mockRestore();
      native.dispose();
    }
  });

  it("does not release during an in-flight failed frame and preserves its original rejection", async () => {
    const frameFailure = new Error("frame failed");
    const cleanupFailure = new Error("first native cleanup failed");
    const frame = deferred<number>();
    const renderer = sceneRenderer();
    renderer.renderAsync.mockImplementationOnce(async () => 1).mockImplementationOnce(() => frame.promise);
    renderer.dispose.mockImplementationOnce(() => { throw cleanupFailure; });
    const atmosphereUnsubscribe = vi.fn();
    const controller = await mount(renderer, { async: true, atmosphere: () => atmosphereUnsubscribe });
    const submission = controller.renderAsync!(() => 20);
    const frameRejection = expect(submission).rejects.toBe(frameFailure);
    await ticks();
    expect(controller.busy!()).toBe(true);
    controller.dispose();
    controller.dispose();
    const firstIdle = controller.whenIdle!();
    expect(renderer.dispose).not.toHaveBeenCalled();
    expect(state.diagnosticsFreezes[0]).not.toHaveBeenCalled();
    expect(state.labelDisposals[0]).not.toHaveBeenCalled();

    frame.reject(frameFailure);
    await frameRejection;
    await expect(firstIdle).rejects.toBe(cleanupFailure);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(state.diagnosticsFreezes[0]).toHaveBeenCalledTimes(1);
    expect(state.labelDisposals[0]).toHaveBeenCalledTimes(1);
    controller.dispose();
    controller.dispose();
    expect(renderer.dispose).toHaveBeenCalledTimes(2);
    expect(atmosphereUnsubscribe).toHaveBeenCalledTimes(1);
    expect(renderer.unsubscribe).toHaveBeenCalledTimes(1);
    expect(state.lightingReleases[0]).toHaveBeenCalledTimes(1);
    expect(state.diagnosticsFreezes[0]).toHaveBeenCalledTimes(1);
    expect(state.labelDisposals[0]).toHaveBeenCalledTimes(1);
    expect(window.removeEventListener).toHaveBeenCalledTimes(1);
    expect(document.removeEventListener).toHaveBeenCalledTimes(1);
    await expect(controller.whenIdle!()).resolves.toBeUndefined();
  });

  it("observes asynchronous retirement failure, retries after it settles, and waits for the retry", async () => {
    const firstRetirement = deferred(), secondRetirement = deferred();
    const failure = new Error("asynchronous native retirement failed");
    const renderer = sceneRenderer();
    renderer.whenDisposed = vi.fn().mockReturnValueOnce(firstRetirement.promise).mockReturnValueOnce(secondRetirement.promise);
    const controller = await mount(renderer);
    controller.dispose();
    const firstIdle = controller.whenIdle!();
    const firstFailure = expect(firstIdle).rejects.toBe(failure);
    controller.dispose();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    firstRetirement.reject(failure);
    await firstFailure;

    controller.dispose();
    expect(renderer.dispose).toHaveBeenCalledTimes(2);
    let done = false;
    const retryIdle = controller.whenIdle!().then(() => { done = true; });
    await ticks();
    expect(done).toBe(false);
    secondRetirement.resolve();
    await retryIdle;
    expect(done).toBe(true);
    controller.dispose();
    expect(renderer.dispose).toHaveBeenCalledTimes(2);
    expect(state.diagnosticsFreezes[0]).toHaveBeenCalledTimes(1);
    expect(state.labelDisposals[0]).toHaveBeenCalledTimes(1);
    expect(renderer.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("records asynchronous retirement failure even when no idle waiter was attached", async () => {
    const retirement = deferred(), failure = new Error("unobserved retirement failure");
    const renderer = sceneRenderer();
    renderer.whenDisposed = vi.fn().mockReturnValueOnce(retirement.promise).mockResolvedValueOnce(undefined);
    const controller = await mount(renderer);
    controller.dispose();
    retirement.reject(failure);
    await ticks();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    controller.dispose();
    expect(renderer.dispose).toHaveBeenCalledTimes(2);
    await expect(controller.whenIdle!()).resolves.toBeUndefined();
    expect(renderer.whenDisposed).toHaveBeenCalledTimes(2);
  });

  it("coalesces a retry behind pending retirement without erasing an earlier idle waiter's error", async () => {
    const firstRetirement = deferred(), secondRetirement = deferred();
    const failure = new Error("synchronous native failure");
    const renderer = sceneRenderer();
    renderer.dispose.mockImplementationOnce(() => { throw failure; });
    renderer.whenDisposed = vi.fn().mockReturnValueOnce(firstRetirement.promise).mockReturnValueOnce(secondRetirement.promise);
    const controller = await mount(renderer);
    expect(caught(() => controller.dispose())).toBe(failure);
    const beforeRetry = expect(controller.whenIdle!()).rejects.toBe(failure);
    controller.dispose();
    controller.dispose();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    let retryFinished = false;
    const afterRetry = controller.whenIdle!().then(() => { retryFinished = true; });
    firstRetirement.resolve();
    await beforeRetry;
    await ticks();
    expect(renderer.dispose).toHaveBeenCalledTimes(2);
    expect(retryFinished).toBe(false);
    secondRetirement.resolve();
    await afterRetry;
    expect(retryFinished).toBe(true);
    expect(state.diagnosticsFreezes[0]).toHaveBeenCalledTimes(1);
    expect(state.labelDisposals[0]).toHaveBeenCalledTimes(1);
    expect(renderer.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("preserves the first renderer error across unsuccessful retries, then clears it on success", async () => {
    const first = new Error("first native failure"), second = new Error("second native failure");
    const renderer = sceneRenderer();
    renderer.dispose.mockImplementationOnce(() => { throw first; }).mockImplementationOnce(() => { throw second; });
    const controller = await mount(renderer);
    expect(caught(() => controller.dispose())).toBe(first);
    const retryError = caught(() => controller.dispose());
    expect(leaves(retryError)).toEqual([first, second]);
    expect((retryError as AggregateError).cause).toBe(first);
    const idleFailure = await controller.whenIdle!().catch((error: unknown) => error);
    expect(leaves(idleFailure)).toEqual([first, second]);
    controller.dispose();
    expect(renderer.dispose).toHaveBeenCalledTimes(3);
    await expect(controller.whenIdle!()).resolves.toBeUndefined();
  });

  it("retains an undefined thrown value as a real cleanup failure", async () => {
    const renderer = sceneRenderer();
    renderer.dispose.mockImplementationOnce(() => { throw undefined; });
    const controller = await mount(renderer);
    expect(caught(() => controller.dispose())).toBeUndefined();
    await expect(controller.whenIdle!()).rejects.toBeUndefined();
    controller.dispose();
    expect(renderer.dispose).toHaveBeenCalledTimes(2);
    await expect(controller.whenIdle!()).resolves.toBeUndefined();
  });

  it("keeps an independent label failure visible after the renderer retry succeeds", async () => {
    const labelFailure = new Error("label cleanup failed"), rendererFailure = new Error("renderer cleanup failed");
    const renderer = sceneRenderer();
    renderer.dispose.mockImplementationOnce(() => { throw rendererFailure; });
    const controller = await mount(renderer);
    state.labelDisposals[0]!.mockImplementation(() => { throw labelFailure; });
    expect(leaves(caught(() => controller.dispose()))).toEqual([labelFailure, rendererFailure]);
    controller.dispose();
    await expect(controller.whenIdle!()).rejects.toBe(labelFailure);
    expect(state.labelDisposals[0]).toHaveBeenCalledTimes(1);
    expect(state.diagnosticsFreezes[0]).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(2);
  });

  it("guards reentrant cleanup and lets an idle call made inside disposal observe that attempt", async () => {
    const failure = new Error("reentrant renderer failure");
    const renderer = sceneRenderer();
    const controller = await mount(renderer);
    let reentrantIdle: Promise<void> | undefined;
    state.labelDisposals[0]!.mockImplementation(() => controller.dispose());
    renderer.whenDisposed = vi.fn(() => { controller.dispose(); return Promise.resolve(); });
    renderer.dispose
      .mockImplementationOnce(() => {
        controller.dispose();
        reentrantIdle = controller.whenIdle!();
        throw failure;
      })
      .mockImplementationOnce(() => { controller.dispose(); });
    expect(caught(() => controller.dispose())).toBe(failure);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    await expect(reentrantIdle).rejects.toBe(failure);
    controller.dispose();
    expect(renderer.dispose).toHaveBeenCalledTimes(2);
    expect(renderer.whenDisposed).toHaveBeenCalledTimes(2);
    expect(state.labelDisposals[0]).toHaveBeenCalledTimes(1);
    expect(state.lightingReleases[0]).toHaveBeenCalledTimes(1);
    await expect(controller.whenIdle!()).resolves.toBeUndefined();
  });

  it("does not retire resources reentrantly while a synchronous renderer frame is still running", async () => {
    const frameFailure = new Error("synchronous frame failed"), cleanupFailure = new Error("native cleanup failed");
    const renderer = sceneRenderer();
    const controller = await mount(renderer);
    let reentrantIdle: Promise<void> | undefined;
    renderer.dispose.mockImplementationOnce(() => { throw cleanupFailure; });
    renderer.render.mockImplementationOnce(() => {
      controller.dispose();
      controller.dispose();
      reentrantIdle = controller.whenIdle!();
      expect(renderer.dispose).not.toHaveBeenCalled();
      expect(state.labelDisposals[0]).not.toHaveBeenCalled();
      expect(state.diagnosticsFreezes[0]).not.toHaveBeenCalled();
      throw frameFailure;
    });
    expect(caught(() => controller.render(30))).toBe(frameFailure);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    await expect(reentrantIdle).rejects.toBe(cleanupFailure);
    await expect(controller.whenIdle!()).rejects.toBe(cleanupFailure);
    controller.dispose();
    expect(renderer.dispose).toHaveBeenCalledTimes(2);
    await expect(controller.whenIdle!()).resolves.toBeUndefined();
  });

  it("isolates a replacement app sharing the old canvas and device during retry", async () => {
    const failure = new Error("old device cleanup failed");
    const canvas = new FakeCanvas(), device = new MockRenderDevice();
    const disposeDevice = device.dispose.bind(device);
    const deviceDispose = vi.spyOn(device, "dispose").mockImplementationOnce(() => { throw failure; }).mockImplementation(disposeDevice);
    const createNative = () => new Renderer(device, { width: 64, height: 64, shaderLibrary: createLeanCoreShaderLibrary() }, new TemporalHistory());
    const oldNative = createNative(), oldRenderer = sceneRenderer(oldNative);
    const oldAtmosphere = vi.fn(), newAtmosphere = vi.fn();
    let replacementNative: Renderer | undefined;
    try {
      const oldController = await mount(oldRenderer, { canvas, atmosphere: () => oldAtmosphere });
      expect(leaves(caught(() => oldController.dispose()))).toContain(failure);
      replacementNative = createNative();
      const replacementRenderer = sceneRenderer(replacementNative);
      const peerFrame = deferred<number>();
      replacementRenderer.renderAsync.mockImplementationOnce(async () => 1).mockImplementationOnce(() => peerFrame.promise);
      const replacement = await mount(replacementRenderer, { canvas, async: true, atmosphere: () => newAtmosphere });
      const pendingPeerFrame = replacement.renderAsync!(() => 25);
      await ticks();
      expect(replacement.busy!()).toBe(true);
      oldController.dispose();
      expect(oldRenderer.dispose).toHaveBeenCalledTimes(2);
      expect(deviceDispose).toHaveBeenCalledTimes(1);
      expect(device.disposed).toBe(false);
      expect(replacement.busy!()).toBe(true);
      expect(newAtmosphere).not.toHaveBeenCalled();
      expect(replacementRenderer.unsubscribe).not.toHaveBeenCalled();
      expect(state.lightingReleases[0]).toHaveBeenCalledTimes(1);
      expect(state.lightingReleases[1]).not.toHaveBeenCalled();
      peerFrame.resolve(1);
      await pendingPeerFrame;
      replacement.render(30);
      expect(replacementRenderer.renderAsync).toHaveBeenCalledTimes(2);
      expect(replacementRenderer.render).toHaveBeenCalledTimes(1);
      replacement.dispose();
      expect(deviceDispose).toHaveBeenCalledTimes(2);
      expect(device.disposed).toBe(true);
      expect(oldAtmosphere).toHaveBeenCalledTimes(1);
      expect(newAtmosphere).toHaveBeenCalledTimes(1);
    } finally {
      deviceDispose.mockRestore();
      oldNative.dispose();
      replacementNative?.dispose();
    }
  });
});
