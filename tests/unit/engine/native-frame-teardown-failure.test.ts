import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  renderer: undefined as any,
  labelDispose: undefined as undefined | (() => void)
}));
vi.mock("../../../packages/engine/src/agent-api/app/mountRenderer", () => ({
  createProductionSceneRenderer: async () => state.renderer
}));
vi.mock("../../../packages/engine/src/agent-api/compiler/labels", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../packages/engine/src/agent-api/compiler/labels")>(),
  createSceneLabelLayer: () => ({ setLabels() {}, setOcclusionTest() {}, update() {}, snapshot: () => [], dispose: () => state.labelDispose?.() })
}));

import { startProductionRender } from "../../../packages/engine/src/agent-api/app/frameLoop";
import { createInitialDiagnostics } from "../../../packages/engine/src/agent-api/diagnostics";
import { primitives, scene } from "../../../packages/engine/src";

class FakeCanvas {
  width = 64; height = 64; style: Record<string, string> = {}; dataset: Record<string, string> = {}; parentElement = null;
  clientWidth = 64; clientHeight = 64;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
const flush = async () => { for (let i = 0; i < 16; i += 1) await Promise.resolve(); };
const flatten = (error: unknown): unknown[] => error instanceof AggregateError ? error.errors.flatMap(flatten) : [error];

function mount(options: { readonly async?: boolean; readonly atmosphere?: () => () => void } = {}) {
  const snapshot = scene().add(primitives.box({ name: "teardown" })).toJSON();
  return startProductionRender(new FakeCanvas() as unknown as HTMLCanvasElement, snapshot,
    createInitialDiagnostics(snapshot, undefined), { autoStart: false, resize: false, ...(options.async ? { frameMode: "async" } : {}) } as never,
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
    options.atmosphere ? { subscribePrd07Atmosphere: options.atmosphere } : undefined);
}

beforeEach(() => {
  state.labelDispose = undefined;
  vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, addEventListener() {}, removeEventListener: vi.fn() });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("frame controller teardown failures", () => {
  it("drains later unsubscribe, label and renderer cleanup and preserves all failures", async () => {
    const resourceError = new Error("resource unsubscribe failed");
    const diagnosticsError = new Error("diagnostics freeze failed");
    const labelError = new Error("label cleanup failed");
    const rendererError = new Error("renderer cleanup failed");
    const retirementError = new Error("renderer retirement failed");
    let failDiagnostics = false;
    const resourceUnsubscribe = vi.fn(() => { throw resourceError; });
    const atmosphereUnsubscribe = vi.fn();
    const labelDispose = vi.fn(() => { throw labelError; });
    const rendererDispose = vi.fn(() => { throw rendererError; });
    const whenDisposed = vi.fn(async () => { throw retirementError; });
    state.labelDispose = labelDispose;
    state.renderer = {
      backend: "webgl2", get diagnostics() { if (failDiagnostics) throw diagnosticsError; return undefined; },
      render: () => 1, viewProjection: () => new Float32Array(16), deviceLost: () => false,
      dispose: rendererDispose, whenDisposed, onResourceChange: () => resourceUnsubscribe
    };
    const controller = await mount({ atmosphere: () => atmosphereUnsubscribe });
    failDiagnostics = true;
    let thrown: unknown;
    try { controller.dispose(); } catch (error) { thrown = error; }
    expect(flatten(thrown)).toEqual(expect.arrayContaining([resourceError, diagnosticsError, labelError, rendererError]));
    expect(resourceUnsubscribe).toHaveBeenCalledTimes(1);
    expect(atmosphereUnsubscribe).toHaveBeenCalledTimes(1);
    expect(labelDispose).toHaveBeenCalledTimes(1);
    expect(rendererDispose).toHaveBeenCalledTimes(1);
    expect(window.removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    let idleFailure: unknown;
    try { await controller.whenIdle!(); } catch (error) { idleFailure = error; }
    expect(flatten(idleFailure)).toEqual(expect.arrayContaining([retirementError, diagnosticsError, labelError, rendererError]));
    expect(whenDisposed).toHaveBeenCalledTimes(1);
    expect(() => controller.dispose()).toThrow(rendererError);
    expect(rendererDispose).toHaveBeenCalledTimes(2);
    expect(resourceUnsubscribe).toHaveBeenCalledTimes(1);
    expect(atmosphereUnsubscribe).toHaveBeenCalledTimes(1);
    expect(labelDispose).toHaveBeenCalledTimes(1);
    let retryIdleFailure: unknown;
    try { await controller.whenIdle!(); } catch (error) { retryIdleFailure = error; }
    expect(flatten(retryIdleFailure)).toEqual(expect.arrayContaining([diagnosticsError, labelError, rendererError, retirementError]));
    expect(whenDisposed).toHaveBeenCalledTimes(2);
  });

  it("defers renderer cleanup until an in-flight frame settles and exposes its failure through whenIdle", async () => {
    const unsubscribeError = new Error("unsubscribe failed");
    const labelError = new Error("deferred label failed");
    const gate = deferred<number>();
    const labelDispose = vi.fn(() => { throw labelError; });
    const rendererDispose = vi.fn();
    let submissions = 0;
    state.labelDispose = labelDispose;
    state.renderer = {
      backend: "webgl2", diagnostics: undefined, render: () => 1,
      renderAsync: () => ++submissions === 1 ? Promise.resolve(1) : gate.promise,
      viewProjection: () => new Float32Array(16), deviceLost: () => false,
      dispose: rendererDispose, whenDisposed: vi.fn(async () => {}),
      onResourceChange: () => () => { throw unsubscribeError; }
    };
    const controller = await mount({ async: true });
    const frame = controller.renderAsync!(() => 10);
    await flush();
    expect(controller.busy!()).toBe(true);
    expect(() => controller.dispose()).toThrow(unsubscribeError);
    expect(rendererDispose).not.toHaveBeenCalled();
    gate.resolve(1);
    await frame;
    expect(labelDispose).toHaveBeenCalledTimes(1);
    expect(rendererDispose).toHaveBeenCalledTimes(1);
    await expect(controller.whenIdle!()).rejects.toBe(labelError);
    expect(() => controller.dispose()).not.toThrow();
  });

  it("retains a mount failure when cleanup also throws", async () => {
    const mountError = new Error("initial frame failed");
    const unsubscribeError = new Error("unsubscribe failed");
    const rendererError = new Error("renderer cleanup failed");
    const whenDisposed = vi.fn(async () => {});
    state.renderer = {
      backend: "webgl2", diagnostics: undefined, render: () => { throw mountError; },
      viewProjection: () => new Float32Array(16), deviceLost: () => false,
      dispose: () => { throw rendererError; }, whenDisposed,
      onResourceChange: () => () => { throw unsubscribeError; }
    };
    let thrown: unknown;
    try { await mount(); } catch (error) { thrown = error; }
    expect(flatten(thrown)).toEqual(expect.arrayContaining([mountError, unsubscribeError, rendererError]));
    expect(whenDisposed).toHaveBeenCalledTimes(1);
  });
});
