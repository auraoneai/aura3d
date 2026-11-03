import { createHash } from "node:crypto";
import { createElement } from "react";
// @ts-ignore -- the workspace does not currently install @types/react-dom.
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { defineAuraAssets } from "../../../packages/engine/src";
import {
  AuraCanvas,
  Effect,
  Model,
  Scene,
  buildSceneFromChildren,
  createAuraAssetResource,
  resourceForDescriptors,
  type AuraAssetPreloadEvidence,
  type AuraAssetPreloadFn
} from "../../../packages/react/src";

const asset = defineAuraAssets({
  product: { type: "model", format: "glb", url: "/product.glb", hash: "sha256-product" }
} as const).product;

const descriptor = { id: "product", url: "/product.glb" } as const;
const success: AuraAssetPreloadEvidence = { ok: true, loaded: ["product"], failed: [] };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("React server rendering", () => {
  test("imports and renders a nested model without a DOM, fetching, or claiming readiness", () => {
    // This module and the adapter were imported in Vitest's Node environment,
    // before any window or document was supplied.
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    const loader = vi.fn<AuraAssetPreloadFn>(async () => success);
    const ready = vi.fn();
    const html = renderToString(
      createElement(
        AuraCanvas,
        { onReady: ready },
        createElement(
          Scene,
          null,
          createElement(Model, {
            asset,
            suspendOnLoad: [descriptor],
            fallback: createElement("span", { "data-loading": "product" }, "Loading"),
            loader
          })
        )
      )
    );
    expect(html).toContain("<canvas");
    expect(html).toContain('data-loading="product"');
    expect(loader).not.toHaveBeenCalled();
    expect(ready).not.toHaveBeenCalled();
  });
});

describe("declarative effect size", () => {
  test("preserves rain scalar, range, and default sizes without changing fog dimensions", () => {
    const range = [0.03, 0.07] as const;
    const nodes = buildSceneFromChildren(createElement(
      Scene,
      null,
      createElement(Effect, { type: "rain", size: 0.04, name: "light rain", radius: 12, seed: 7 }),
      createElement(Effect, { type: "rain", size: range, intensity: 0.6 }),
      createElement(Effect, { type: "rain" }),
      createElement(Effect, { type: "fog", size: [3, 4, 5] })
    )).toJSON().nodes;

    expect(nodes).toHaveLength(4);
    expect(nodes[0]).toMatchObject({ effect: "rain", size: 0.04, name: "light rain", radius: 12, seed: 7 });
    expect(nodes[1]).toMatchObject({ effect: "rain", size: range, intensity: 0.6 });
    expect(nodes[2]).toMatchObject({ effect: "rain" });
    expect(nodes[2]).not.toHaveProperty("size");
    expect(nodes[3]).toMatchObject({ effect: "fog", size: [3, 4, 5] });
  });

  test("rejects fog-volume dimensions for rain instead of silently ignoring them", () => {
    const rain = createElement(Effect, { type: "rain", size: [3, 4, 5] });
    expect(() => buildSceneFromChildren(rain)).toThrow(/rain size.*scalar.*\[min, max\]/i);
  });
});

// Drive the actual AuraCanvas component and its effects with a small hook host.
// No browser, renderer, or graphics device is started. The real React peer,
// client hydration and error boundary remain browser acceptance tests.
async function canvasHarness(apps: ({ readiness?(options: { stage: "renderer"; signal: AbortSignal }): Promise<unknown>; dispose(): void; setScene(): void } | Error)[]) {
  type Effect = () => void | (() => void);
  type Hook = {
    value?: unknown;
    dependencies?: readonly unknown[];
    setup?: Effect;
    cleanup?: () => void;
  };
  const hooks: Hook[] = [];
  const pending = new Set<number>();
  const pendingLayout = new Set<number>();
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  let position = 0;
  let mounted = false;
  let stateUpdatesAfterUnmount = 0;
  let appIndex = 0;
  const canvas = {
    addEventListener(type: string, listener: (event: unknown) => void) {
      const group = listeners.get(type) ?? new Set();
      group.add(listener);
      listeners.set(type, group);
    },
    removeEventListener(type: string, listener: (event: unknown) => void) {
      listeners.get(type)?.delete(listener);
    }
  };
  const sameDependencies = (left?: readonly unknown[], right?: readonly unknown[]) =>
    left !== undefined && right !== undefined && left.length === right.length && left.every((item, index) => Object.is(item, right[index]));
  const nextHook = (): Hook => {
    const index = position++;
    return hooks[index] ?? (hooks[index] = {});
  };
  const createApp = vi.fn(() => {
    const app = apps[appIndex++];
    if (!app) throw new Error("Unexpected app mount");
    if (app instanceof Error) throw app;
    return app;
  });

  vi.resetModules();
  vi.doMock("react", async (importOriginal) => {
    const actual = await importOriginal<typeof import("react")>();
    return {
      ...actual,
      useRef<T>(initial: T) {
        const hook = nextHook();
        if (!("value" in hook)) hook.value = { current: initial };
        return hook.value;
      },
      useState<T>(initial: T | (() => T)) {
        const hook = nextHook();
        if (!("value" in hook)) hook.value = typeof initial === "function" ? (initial as () => T)() : initial;
        return [hook.value, (next: T | ((current: T) => T)) => {
          if (!mounted) stateUpdatesAfterUnmount++;
          hook.value = typeof next === "function" ? (next as (current: T) => T)(hook.value as T) : next;
        }];
      },
      useMemo<T>(factory: () => T, dependencies?: readonly unknown[]) {
        const hook = nextHook();
        if (!sameDependencies(hook.dependencies, dependencies)) {
          hook.value = factory();
          hook.dependencies = dependencies;
        }
        return hook.value;
      },
      useEffect(setup: Effect, dependencies?: readonly unknown[]) {
        const index = position;
        const hook = nextHook();
        if (!sameDependencies(hook.dependencies, dependencies)) {
          hook.dependencies = dependencies;
          hook.setup = setup;
          pending.add(index);
        }
      },
      useLayoutEffect(setup: Effect, dependencies?: readonly unknown[]) {
        const index = position;
        const hook = nextHook();
        if (!sameDependencies(hook.dependencies, dependencies)) {
          hook.dependencies = dependencies;
          hook.setup = setup;
          pendingLayout.add(index);
        }
      }
    };
  });
  vi.doMock("@aura3d/engine", () => ({
    camera: {},
    effects: {},
    environments: {},
    interactions: {},
    lights: {},
    model: vi.fn(),
    scene: () => {
      const builder = { background: vi.fn(() => builder), toJSON: () => ({}) };
      return builder;
    },
    createAuraApp: createApp
  }));
  const adapter = await import("../../../packages/react/src/index");

  function render(props: Parameters<typeof adapter.AuraCanvas>[0]) {
    position = 0;
    const tree = adapter.AuraCanvas(props);
    const provider = tree as unknown as { props: { children: readonly [{ props: { ref?: { current: unknown } }; ref?: { current: unknown } }, unknown] } };
    const canvasElement = provider.props.children[0];
    const ref = canvasElement.props.ref ?? canvasElement.ref;
    if (!ref) throw new Error("AuraCanvas did not provide a canvas ref");
    ref.current = canvas;
    return tree;
  }

  function runEffects(queue: Set<number>) {
    for (const index of queue) {
      const hook = hooks[index]!;
      hook.cleanup?.();
      const cleanup = hook.setup?.();
      hook.cleanup = typeof cleanup === "function" ? cleanup : undefined;
    }
    queue.clear();
  }

  function commit() {
    runEffects(pendingLayout);
    runEffects(pending);
  }

  function cleanup() {
    for (const hook of hooks) {
      hook.cleanup?.();
      hook.cleanup = undefined;
    }
  }

  return {
    mount(props: Parameters<typeof adapter.AuraCanvas>[0]) {
      mounted = true;
      render(props);
      commit();
    },
    render,
    commit,
    commitLayout() { runEffects(pendingLayout); },
    strictEffectsReplay() {
      cleanup();
      for (const hook of hooks) {
        const result = hook.setup?.();
        hook.cleanup = typeof result === "function" ? result : undefined;
      }
    },
    unmount() {
      mounted = false;
      cleanup();
    },
    dispatch(type: string, event: unknown) {
      for (const listener of listeners.get(type) ?? []) listener(event);
    },
    listenerCount() {
      return [...listeners.values()].reduce((count, group) => count + group.size, 0);
    },
    stateUpdatesAfterUnmount: () => stateUpdatesAfterUnmount,
    createApp,
    Scene: adapter.Scene
  };
}

type ReadinessOutcome =
  | { state: "ready"; stage: "renderer"; backend: "webgl2" }
  | { state: "failed"; code: string; message: string }
  | { state: "cancelled" | "disposed" };

const readyOutcome = { state: "ready", stage: "renderer", backend: "webgl2" } as const;

function fakeApp(ready: Promise<void>, outcome: ReadinessOutcome = readyOutcome) {
  return {
    readiness: vi.fn((_options: { stage: "renderer"; signal: AbortSignal }) => ready.then(() => outcome)),
    dispose: vi.fn(),
    setScene: vi.fn()
  };
}

async function flushPromises() {
  for (let step = 0; step < 6; step++) await Promise.resolve();
}

afterEach(() => {
  vi.doUnmock("react");
  vi.doUnmock("@aura3d/engine");
});

describe("canvas mount effect", () => {
  test("calls the latest onReady only after readiness and updates event handlers without remount", async () => {
    const gate = deferred<void>();
    const app = fakeApp(gate.promise);
    const harness = await canvasHarness([app]);
    const initialReady = vi.fn();
    const currentReady = vi.fn();
    const initialPointer = vi.fn();
    const currentPointer = vi.fn();
    harness.mount({ onReady: initialReady, onPointerDown: initialPointer });
    expect(initialReady).not.toHaveBeenCalled();
    harness.render({ onReady: currentReady, onPointerDown: currentPointer });
    harness.commit();
    expect(harness.createApp).toHaveBeenCalledTimes(1);
    harness.dispatch("pointerdown", { type: "pointerdown" });
    expect(initialPointer).not.toHaveBeenCalled();
    expect(currentPointer).toHaveBeenCalledTimes(1);
    gate.resolve();
    await flushPromises();
    expect(initialReady).not.toHaveBeenCalled();
    expect(currentReady).toHaveBeenCalledOnce();
    expect(currentReady).toHaveBeenCalledWith(app);
    expect(app.readiness).toHaveBeenCalledWith({ stage: "renderer", signal: expect.any(AbortSignal) });
    harness.unmount();
    expect(app.dispose).toHaveBeenCalledOnce();
    expect(harness.listenerCount()).toBe(0);
    expect(harness.stateUpdatesAfterUnmount()).toBe(0);
  });

  test("an abandoned render cannot replace the committed readiness callback", async () => {
    const gate = deferred<void>();
    const app = fakeApp(gate.promise);
    const harness = await canvasHarness([app]);
    const committed = vi.fn();
    const abandoned = vi.fn();
    harness.mount({ onReady: committed });
    await flushPromises();
    // React may start a render and abandon it before any effects commit.
    harness.render({ onReady: abandoned });
    gate.resolve();
    await flushPromises();
    expect(committed).toHaveBeenCalledWith(app);
    expect(abandoned).not.toHaveBeenCalled();
    harness.unmount();
  });

  test("does not announce a superseded renderer between layout and scene effects", async () => {
    vi.stubGlobal("window", {});
    try {
      const firstGate = deferred<void>();
      const secondGate = deferred<void>();
      const app = fakeApp(firstGate.promise);
      app.readiness
        .mockImplementationOnce(() => firstGate.promise.then(() => readyOutcome))
        .mockImplementationOnce(() => secondGate.promise.then(() => readyOutcome));
      const harness = await canvasHarness([app]);
      const onReady = vi.fn();
      harness.mount({ onReady, children: createElement(harness.Scene, { background: "#000000" }) });
      await flushPromises();
      harness.render({ onReady, children: createElement(harness.Scene, { background: "#ffffff" }) });
      harness.commitLayout();
      firstGate.resolve();
      await flushPromises();
      expect(onReady).not.toHaveBeenCalled();
      harness.commit();
      await flushPromises();
      expect(app.setScene).toHaveBeenCalledOnce();
      secondGate.resolve();
      await flushPromises();
      expect(onReady).toHaveBeenCalledOnce();
      expect(onReady).toHaveBeenCalledWith(app);
      harness.unmount();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("ignores a late successful completion after unmount", async () => {
    const gate = deferred<void>();
    const app = fakeApp(gate.promise);
    const harness = await canvasHarness([app]);
    const onReady = vi.fn();
    const onError = vi.fn();
    harness.mount({ onReady, onError });
    await flushPromises();
    const signal = app.readiness.mock.calls[0]?.[0].signal;
    expect(signal?.aborted).toBe(false);
    harness.unmount();
    expect(signal?.aborted).toBe(true);
    gate.resolve();
    await flushPromises();
    expect(onReady).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(harness.stateUpdatesAfterUnmount()).toBe(0);
    expect(app.dispose).toHaveBeenCalledOnce();
  });

  test("waits for the latest scene and aborts superseded renderer readiness", async () => {
    const firstGate = deferred<void>();
    const secondGate = deferred<void>();
    const app = fakeApp(firstGate.promise);
    app.readiness
      .mockImplementationOnce(() => firstGate.promise.then(() => readyOutcome))
      .mockImplementationOnce(() => secondGate.promise.then(() => readyOutcome));
    const harness = await canvasHarness([app]);
    const onReady = vi.fn();
    harness.mount({ onReady, children: createElement(harness.Scene, { background: "#000000" }) });
    await flushPromises();
    const firstSignal = app.readiness.mock.calls[0]?.[0].signal;
    expect(firstSignal?.aborted).toBe(false);
    harness.render({ onReady, children: createElement(harness.Scene, { background: "#ffffff" }) });
    harness.commit();
    await flushPromises();
    expect(app.setScene).toHaveBeenCalledOnce();
    expect(firstSignal?.aborted).toBe(true);
    expect(app.readiness).toHaveBeenCalledTimes(2);
    firstGate.resolve();
    await flushPromises();
    expect(onReady).not.toHaveBeenCalled();
    secondGate.resolve();
    await flushPromises();
    expect(onReady).toHaveBeenCalledOnce();
    expect(onReady).toHaveBeenCalledWith(app);
    harness.unmount();
  });

  test("withholds the app context while a changed scene's renderer is mounting", async () => {
    const nextMount = deferred<void>();
    const app = fakeApp(Promise.resolve());
    app.readiness
      .mockImplementationOnce(async () => readyOutcome)
      .mockImplementationOnce(() => nextMount.promise.then(() => readyOutcome));
    const harness = await canvasHarness([app]);
    const onReady = vi.fn();
    const props = (background: string) => ({ onReady, children: createElement(harness.Scene, { background }) });
    const contextValue = (tree: ReturnType<typeof harness.render>) => (tree as unknown as { props: { value?: unknown } }).props.value;

    harness.mount(props("#000000"));
    await flushPromises();
    expect(contextValue(harness.render(props("#000000")))).toBe(app);
    expect(onReady).toHaveBeenCalledOnce();

    expect(contextValue(harness.render(props("#ffffff")))).toBeUndefined();
    harness.commit();
    await flushPromises();
    expect(app.setScene).toHaveBeenCalledOnce();
    expect(contextValue(harness.render(props("#ffffff")))).toBeUndefined();
    expect(onReady).toHaveBeenCalledOnce();

    nextMount.resolve();
    await flushPromises();
    expect(contextValue(harness.render(props("#ffffff")))).toBe(app);
    expect(onReady).toHaveBeenCalledOnce();
    harness.unmount();
  });

  test("withholds the previous app as soon as mount options change", async () => {
    const nextMount = deferred<void>();
    const first = fakeApp(Promise.resolve());
    const second = fakeApp(nextMount.promise);
    const harness = await canvasHarness([first, second]);
    const onReady = vi.fn();
    const contextValue = (tree: ReturnType<typeof harness.render>) => (tree as unknown as { props: { value?: unknown } }).props.value;

    harness.mount({ onReady, pixelRatio: 1 });
    await flushPromises();
    expect(contextValue(harness.render({ onReady, pixelRatio: 1 }))).toBe(first);
    expect(contextValue(harness.render({ onReady, pixelRatio: 2 }))).toBeUndefined();
    harness.commit();
    expect(first.dispose).toHaveBeenCalledOnce();
    await flushPromises();
    expect(contextValue(harness.render({ onReady, pixelRatio: 2 }))).toBeUndefined();
    nextMount.resolve();
    await flushPromises();
    expect(contextValue(harness.render({ onReady, pixelRatio: 2 }))).toBe(second);
    expect(onReady).toHaveBeenCalledTimes(2);
    harness.unmount();
    expect(second.dispose).toHaveBeenCalledOnce();
  });

  test("reports a live failure and suppresses an unmounted failure", async () => {
    const live = deferred<void>();
    const late = deferred<void>();
    const first = fakeApp(live.promise);
    const second = fakeApp(late.promise);
    const onReady = vi.fn();
    const onError = vi.fn();
    const harness = await canvasHarness([first, second]);
    harness.mount({ onReady, onError });
    const liveError = new Error("renderer failed");
    live.reject(liveError);
    await flushPromises();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(liveError);
    expect(onReady).not.toHaveBeenCalled();
    harness.unmount();

    const secondHarness = await canvasHarness([second]);
    const lateError = vi.fn();
    secondHarness.mount({ onReady, onError: lateError });
    await flushPromises();
    secondHarness.unmount();
    late.reject(new Error("too late"));
    await flushPromises();
    expect(lateError).not.toHaveBeenCalled();
    expect(secondHarness.stateUpdatesAfterUnmount()).toBe(0);
  });

  test("reports a synchronous app creation failure through onError", async () => {
    const error = new Error("renderer setup failed");
    const harness = await canvasHarness([error]);
    const onReady = vi.fn();
    const onError = vi.fn();
    harness.mount({ onReady, onError });
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(error);
    expect(onReady).not.toHaveBeenCalled();
    harness.unmount();
    expect(harness.stateUpdatesAfterUnmount()).toBe(0);
  });

  test("accepts a legacy engine only after ready and diagnostics confirm a mounted WebGL2 renderer", async () => {
    const gate = deferred<void>();
    const legacyApp = {
      ready: vi.fn(() => gate.promise),
      diagnostics: vi.fn(() => ({ backend: "webgl2", renderer: { runtime: { mounted: true } } })),
      dispose: vi.fn(),
      setScene: vi.fn()
    };
    const harness = await canvasHarness([legacyApp]);
    const onReady = vi.fn();
    const onError = vi.fn();
    harness.mount({ onReady, onError });
    await flushPromises();
    expect(onReady).not.toHaveBeenCalled();
    expect(legacyApp.diagnostics).not.toHaveBeenCalled();
    gate.resolve();
    await flushPromises();
    expect(onReady).toHaveBeenCalledOnce();
    expect(onReady).toHaveBeenCalledWith(legacyApp);
    expect(onError).not.toHaveBeenCalled();
    harness.unmount();
    expect(legacyApp.dispose).toHaveBeenCalledOnce();
    expect(harness.stateUpdatesAfterUnmount()).toBe(0);
  });

  test.each([
    { backend: "webgl2", renderer: { runtime: { mounted: false } } },
    { backend: "headless", renderer: { runtime: { mounted: true } } },
    { backend: "webgl2" }
  ])("rejects a legacy ready() settlement without confirmed renderer mount", async (diagnostics) => {
    const legacyApp = { ready: vi.fn(async () => undefined), diagnostics: vi.fn(() => diagnostics), dispose: vi.fn(), setScene: vi.fn() };
    const harness = await canvasHarness([legacyApp]);
    const onReady = vi.fn();
    const onError = vi.fn();
    harness.mount({ onReady, onError });
    await flushPromises();
    expect(onReady).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ name: "AuraCanvasReadinessError", state: "failed", code: "legacy-renderer-unavailable" });
    harness.unmount();
  });

  test("rejects a legacy engine without diagnostics through the same readiness boundary", async () => {
    const legacyApp = { ready: vi.fn(async () => undefined), dispose: vi.fn(), setScene: vi.fn() };
    const harness = await canvasHarness([legacyApp]);
    const onReady = vi.fn();
    const onError = vi.fn();
    harness.mount({ onReady, onError });
    await flushPromises();
    expect(onReady).not.toHaveBeenCalled();
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ name: "AuraCanvasReadinessError", state: "failed", code: "legacy-renderer-unavailable" });
    harness.unmount();
  });

  test("sanitizes a rejected legacy ready() before notifying the boundary", async () => {
    const legacyApp = { ready: vi.fn(async () => { throw new Error("private-asset-url?token=example"); }), diagnostics: vi.fn(), dispose: vi.fn(), setScene: vi.fn() };
    const harness = await canvasHarness([legacyApp]);
    const onReady = vi.fn();
    const onError = vi.fn();
    harness.mount({ onReady, onError });
    await flushPromises();
    expect(onReady).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
    const error = onError.mock.calls[0]?.[0] as Error & { state: string; code: string };
    expect(error).toMatchObject({ name: "AuraCanvasReadinessError", state: "failed", code: "legacy-renderer-unavailable" });
    expect(error.message).not.toContain("private-asset-url");
    expect(legacyApp.diagnostics).not.toHaveBeenCalled();
    harness.unmount();
  });

  test("ignores a legacy readiness completion after unmount", async () => {
    const gate = deferred<void>();
    const legacyApp = {
      ready: vi.fn(() => gate.promise),
      diagnostics: vi.fn(() => ({ backend: "webgl2", renderer: { runtime: { mounted: true } } })),
      dispose: vi.fn(),
      setScene: vi.fn()
    };
    const harness = await canvasHarness([legacyApp]);
    const onReady = vi.fn();
    const onError = vi.fn();
    harness.mount({ onReady, onError });
    await flushPromises();
    harness.unmount();
    gate.resolve();
    await flushPromises();
    expect(onReady).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(legacyApp.diagnostics).not.toHaveBeenCalled();
    expect(legacyApp.dispose).toHaveBeenCalledOnce();
    expect(harness.stateUpdatesAfterUnmount()).toBe(0);
  });

  test("surfaces an asynchronous failure in render when no onError is supplied", async () => {
    const gate = deferred<void>();
    const harness = await canvasHarness([fakeApp(gate.promise)]);
    harness.mount({});
    const error = new Error("mount failed");
    gate.reject(error);
    await flushPromises();
    expect(() => harness.render({})).toThrow(error);
    harness.unmount();
  });

  test.each<ReadinessOutcome>([
    { state: "failed", code: "renderer-mount-failed", message: "renderer unavailable" },
    { state: "cancelled" },
    { state: "disposed" }
  ])("reports readiness $state rather than calling onReady", async (outcome) => {
    const app = fakeApp(Promise.resolve(), outcome);
    const harness = await canvasHarness([app]);
    const onReady = vi.fn();
    const onError = vi.fn();
    harness.mount({ onReady, onError });
    await flushPromises();
    expect(onReady).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      name: "AuraCanvasReadinessError",
      state: outcome.state,
      code: outcome.state === "failed" ? outcome.code : outcome.state
    });
    harness.unmount();
  });

  test("disposes StrictMode's first mount and reports only the live mount", async () => {
    const firstGate = deferred<void>();
    const secondGate = deferred<void>();
    const first = fakeApp(firstGate.promise);
    const second = fakeApp(secondGate.promise);
    const harness = await canvasHarness([first, second]);
    const onReady = vi.fn();
    harness.mount({ onReady });
    harness.strictEffectsReplay();
    expect(first.dispose).toHaveBeenCalledOnce();
    firstGate.resolve();
    await flushPromises();
    expect(onReady).not.toHaveBeenCalled();
    secondGate.resolve();
    await flushPromises();
    expect(onReady).toHaveBeenCalledOnce();
    expect(onReady).toHaveBeenCalledWith(second);
    harness.unmount();
    expect(second.dispose).toHaveBeenCalledOnce();
    expect(harness.listenerCount()).toBe(0);
    expect(harness.stateUpdatesAfterUnmount()).toBe(0);
  });
});

async function modelHarness() {
  type Effect = () => void | (() => void);
  type Hook = { value?: unknown; dependencies?: readonly unknown[]; setup?: Effect; cleanup?: () => void };
  type Host = { hooks: Hook[]; position: number; pending: Set<number>; mounted: boolean; lateUpdates: number; contexts: Map<unknown, unknown> };
  let active: Host;
  const sameDependencies = (left?: readonly unknown[], right?: readonly unknown[]) =>
    left !== undefined && right !== undefined && left.length === right.length && left.every((item, index) => Object.is(item, right[index]));
  const nextHook = () => {
    const index = active.position++;
    return active.hooks[index] ?? (active.hooks[index] = {});
  };

  vi.resetModules();
  vi.doMock("react", async (importOriginal) => {
    const actual = await importOriginal<typeof import("react")>();
    return {
      ...actual,
      useSyncExternalStore(_subscribe: unknown, getSnapshot: () => unknown) { return getSnapshot(); },
      useContext(context: unknown) { return active.contexts.get(context); },
      useRef<T>(initial: T) {
        const hook = nextHook();
        if (!("value" in hook)) hook.value = { current: initial };
        return hook.value;
      },
      useMemo<T>(factory: () => T, dependencies?: readonly unknown[]) {
        const hook = nextHook();
        if (!sameDependencies(hook.dependencies, dependencies)) {
          hook.value = factory();
          hook.dependencies = dependencies;
        }
        return hook.value;
      },
      useState<T>(initial: T | (() => T)) {
        const host = active;
        const hook = nextHook();
        if (!("value" in hook)) hook.value = typeof initial === "function" ? (initial as () => T)() : initial;
        return [hook.value, (next: T | ((current: T) => T)) => {
          if (!host.mounted) host.lateUpdates++;
          hook.value = typeof next === "function" ? (next as (current: T) => T)(hook.value as T) : next;
        }];
      },
      useEffect(setup: Effect, dependencies?: readonly unknown[]) {
        const index = active.position;
        const hook = nextHook();
        if (!sameDependencies(hook.dependencies, dependencies)) {
          hook.dependencies = dependencies;
          hook.setup = setup;
          active.pending.add(index);
        }
      }
    };
  });
  vi.doMock("@aura3d/engine", () => ({
    camera: {}, createAuraApp: vi.fn(), effects: {}, environments: {}, interactions: {}, lights: {}, model: vi.fn(), scene: vi.fn()
  }));
  const adapter = await import("../../../packages/react/src/index");
  function canvasScope() {
    const host: Host = { hooks: [], position: 0, pending: new Set(), mounted: false, lateUpdates: 0, contexts: new Map() };
    active = host;
    const tree = adapter.AuraCanvas({});
    const provider = (tree as unknown as { props: { children: readonly [unknown, { type: { _context?: unknown }; props: { value: object } }] } }).props.children[1];
    return new Map([[provider.type._context ?? provider.type, provider.props.value]]);
  }
  function instance(props: Parameters<typeof adapter.Model>[0], contexts = new Map<unknown, unknown>()) {
    const host: Host = { hooks: [], position: 0, pending: new Set(), mounted: false, lateUpdates: 0, contexts };
    const commit = () => {
      for (const index of host.pending) {
        const hook = host.hooks[index]!;
        hook.cleanup?.();
        const cleanup = hook.setup?.();
        hook.cleanup = typeof cleanup === "function" ? cleanup : undefined;
      }
      host.pending.clear();
    };
    const cleanup = () => {
      for (const hook of host.hooks) {
        hook.cleanup?.();
        hook.cleanup = undefined;
      }
    };
    return {
      mount() {
        active = host;
        host.mounted = true;
        host.position = 0;
        adapter.Model(props);
        commit();
      },
      rerender(nextProps: Parameters<typeof adapter.Model>[0]) {
        active = host;
        host.position = 0;
        adapter.Model(nextProps);
        commit();
      },
      strictEffectsReplay() {
        cleanup();
        for (const hook of host.hooks) {
          const result = hook.setup?.();
          hook.cleanup = typeof result === "function" ? result : undefined;
        }
      },
      unmount() {
        host.mounted = false;
        cleanup();
      },
      lateUpdates: () => host.lateUpdates
    };
  }
  return { canvasScope, instance, resourceForDescriptors: adapter.resourceForDescriptors };
}

describe("model preload effect ownership", () => {
  test("two committed models share a flight and cancel it only after the last unmounts", async () => {
    const operation = deferred<AuraAssetPreloadEvidence>();
    const signals: AbortSignal[] = [];
    const loader = vi.fn<AuraAssetPreloadFn>((_descriptors, options) => {
      if (options?.signal) signals.push(options.signal);
      return operation.promise;
    });
    const harness = await modelHarness();
    const props = { asset, suspendOnLoad: [descriptor], loader, securityContext: {} };
    const first = harness.instance(props);
    const second = harness.instance(props);
    first.mount();
    second.mount();
    expect(loader).toHaveBeenCalledOnce();
    expect(signals[0]?.aborted).toBe(false);
    first.unmount();
    expect(signals[0]?.aborted).toBe(false);
    second.unmount();
    await flushPromises();
    expect(signals[0]?.aborted).toBe(true);
    operation.resolve(success);
    await flushPromises();
    expect(first.lateUpdates()).toBe(0);
    expect(second.lateUpdates()).toBe(0);
  });

  test("StrictMode's effect replay reuses the owned flight and final unmount aborts it", async () => {
    const signals: AbortSignal[] = [];
    const loader: AuraAssetPreloadFn = (_descriptors, options) => {
      if (options?.signal) signals.push(options.signal);
      return new Promise(() => undefined);
    };
    const harness = await modelHarness();
    const model = harness.instance({ asset, suspendOnLoad: [descriptor], loader });
    model.mount();
    model.strictEffectsReplay();
    await flushPromises();
    expect(signals).toHaveLength(1);
    expect(signals[0]?.aborted).toBe(false);
    model.unmount();
    await flushPromises();
    expect(signals[0]?.aborted).toBe(true);
    expect(model.lateUpdates()).toBe(0);
  });

  test("a model re-added to the same canvas starts a fresh flight after its last owner cancels", async () => {
    const oldOperation = deferred<AuraAssetPreloadEvidence>();
    const newOperation = deferred<AuraAssetPreloadEvidence>();
    const signals: AbortSignal[] = [];
    const loader = vi.fn<AuraAssetPreloadFn>((_descriptors, options) => {
      signals.push(options!.signal);
      return signals.length === 1 ? oldOperation.promise : newOperation.promise;
    });
    const harness = await modelHarness();
    const scope = harness.canvasScope();
    const context = {};
    const props = { asset, suspendOnLoad: [descriptor], loader, securityContext: context };
    const first = harness.instance(props, scope);
    first.mount();
    first.unmount();
    await flushPromises();
    expect(signals[0]?.aborted).toBe(true);

    const second = harness.instance(props, scope);
    second.mount();
    expect(loader).toHaveBeenCalledTimes(2);
    expect(signals[1]?.aborted).toBe(false);
    const resource = harness.resourceForDescriptors([descriptor], loader, context);
    newOperation.resolve(success);
    await flushPromises();
    expect(resource.read()).toEqual(success);

    // The first loader deliberately ignores cancellation. Its late result must
    // not replace the result belonging to the newly mounted model.
    oldOperation.resolve({ ok: false, loaded: [], failed: [{ id: "product", message: "stale" }] });
    await flushPromises();
    expect(resource.read()).toEqual(success);
    second.unmount();
    expect(first.lateUpdates()).toBe(0);
    expect(second.lateUpdates()).toBe(0);
  });

  test("mutating a descriptor in place creates a new request and cancels the old owner", async () => {
    const signals: AbortSignal[] = [];
    const requested: { readonly id: string; readonly url: string; readonly hash?: string }[][] = [];
    const loader: AuraAssetPreloadFn = (descriptors, options) => {
      requested.push([...descriptors]);
      if (options?.signal) signals.push(options.signal);
      return new Promise(() => undefined);
    };
    const descriptors = [{ id: "mutable", url: "/before.glb", hash: `sha256-${"a".repeat(64)}` }];
    const props = { asset, suspendOnLoad: descriptors, loader };
    const harness = await modelHarness();
    const model = harness.instance(props);
    model.mount();
    descriptors[0]!.url = "/after.glb";
    descriptors[0]!.hash = `sha256-${"b".repeat(64)}`;
    model.rerender(props);
    await flushPromises();
    expect(requested).toEqual([
      [{ id: "mutable", url: "/before.glb", hash: `sha256-${"a".repeat(64)}` }],
      [{ id: "mutable", url: "/after.glb", hash: `sha256-${"b".repeat(64)}` }]
    ]);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
    model.unmount();
    await flushPromises();
    expect(signals[1]?.aborted).toBe(true);
    expect(model.lateUpdates()).toBe(0);
  });
});

describe("model security partitions", () => {
  test("default fetch is shared within one canvas and fetched independently for each other canvas", async () => {
    const fetchMock = vi.fn((_url: unknown, _init: unknown) => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const harness = await modelHarness();
      const firstScope = harness.canvasScope();
      const secondScope = harness.canvasScope();
      const props = { asset, suspendOnLoad: [{ id: "default-scope", url: "/default-scope.glb" }] };
      const models = [harness.instance(props, firstScope), harness.instance(props, firstScope), harness.instance(props, secondScope)];
      for (const model of models) model.mount();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      for (const model of models) model.unmount();
      await flushPromises();
      const fetchSignals = fetchMock.mock.calls.map((call) => (call[1] as { signal: AbortSignal }).signal);
      expect(fetchSignals.every((signal) => signal.aborted)).toBe(true);
      expect(models.every((model) => model.lateUpdates() === 0)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("custom loaders default to model isolation, and an explicit security context can share", async () => {
    const loader = vi.fn<AuraAssetPreloadFn>(() => new Promise(() => undefined));
    const harness = await modelHarness();
    const firstScope = harness.canvasScope();
    const secondScope = harness.canvasScope();
    const props = { asset, suspendOnLoad: [{ id: "custom-scope", url: "/custom-scope.glb" }], loader };
    const sameCanvas = [harness.instance(props, firstScope), harness.instance(props, firstScope), harness.instance(props, secondScope)];
    for (const model of sameCanvas) model.mount();
    expect(loader).toHaveBeenCalledTimes(3);
    const sharedSecurityContext = {};
    const explicitlyShared = [
      harness.instance({ ...props, securityContext: sharedSecurityContext }, firstScope),
      harness.instance({ ...props, securityContext: sharedSecurityContext }, secondScope)
    ];
    for (const model of explicitlyShared) model.mount();
    expect(loader).toHaveBeenCalledTimes(4);
    for (const model of [...sameCanvas, ...explicitlyShared]) model.unmount();
    await flushPromises();
    expect([...sameCanvas, ...explicitlyShared].every((model) => model.lateUpdates() === 0)).toBe(true);
  });

  test("standalone models without an explicit context remain isolated", async () => {
    const loader = vi.fn<AuraAssetPreloadFn>(() => new Promise(() => undefined));
    const harness = await modelHarness();
    const props = { asset, suspendOnLoad: [{ id: "standalone", url: "/standalone.glb" }], loader };
    const first = harness.instance(props);
    const second = harness.instance(props);
    first.mount();
    second.mount();
    expect(loader).toHaveBeenCalledTimes(2);
    first.unmount();
    second.unmount();
    await flushPromises();
  });

  test("an owned model keeps its flight across rerenders when the shared lookup cache is full", async () => {
    const signals: AbortSignal[] = [];
    const loader = vi.fn<AuraAssetPreloadFn>((_descriptors, options) => {
      signals.push(options!.signal);
      return new Promise(() => undefined);
    });
    const harness = await modelHarness();
    const props = { asset, suspendOnLoad: [descriptor], loader };
    const models = Array.from({ length: 129 }, () => harness.instance(props));
    for (const model of models) model.mount();
    expect(loader).toHaveBeenCalledTimes(129);

    // The first committed lookup has been evicted from the bounded cache,
    // but the model still owns the resource and must not restart its load.
    models[0]!.rerender(props);
    expect(loader).toHaveBeenCalledTimes(129);
    expect(signals[0]?.aborted).toBe(false);

    for (const model of models) model.unmount();
    await flushPromises();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(models.every((model) => model.lateUpdates() === 0)).toBe(true);
  });

  test("a disposed shared model resource is replaced on the next render", async () => {
    const loader = vi.fn<AuraAssetPreloadFn>(() => new Promise(() => undefined));
    const harness = await modelHarness();
    const context = {};
    const props = { asset, suspendOnLoad: [descriptor], loader, securityContext: context };
    const model = harness.instance(props);
    model.mount();
    const oldResource = harness.resourceForDescriptors([descriptor], loader, context);
    oldResource.dispose();
    model.rerender(props);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(harness.resourceForDescriptors([descriptor], loader, context)).not.toBe(oldResource);
    model.unmount();
    await flushPromises();
    expect(model.lateUpdates()).toBe(0);
  });

  test("same-canvas custom Models do not share a loader after credentials change", async () => {
    const pendingA = deferred<AuraAssetPreloadEvidence>();
    const pendingB = deferred<AuraAssetPreloadEvidence>();
    const calls: { tenant: string; signal: AbortSignal }[] = [];
    let tenant = "A";
    const loader: AuraAssetPreloadFn = (_descriptors, options) => {
      calls.push({ tenant, signal: options!.signal });
      return tenant === "A" ? pendingA.promise : pendingB.promise;
    };
    const harness = await modelHarness();
    const scope = harness.canvasScope();
    const props = { asset, suspendOnLoad: [descriptor], loader };
    const first = harness.instance(props, scope);
    const second = harness.instance(props, scope);
    first.mount();
    tenant = "B";
    second.mount();
    expect(calls.map((call) => call.tenant)).toEqual(["A", "B"]);
    first.unmount();
    await flushPromises();
    expect(calls[0]?.signal.aborted).toBe(true);
    expect(calls[1]?.signal.aborted).toBe(false);
    pendingB.resolve(success);
    pendingA.resolve({ ok: false, loaded: [], failed: [{ id: "product", message: "stale" }] });
    await flushPromises();
    second.unmount();
    expect(first.lateUpdates()).toBe(0);
    expect(second.lateUpdates()).toBe(0);
  });

  test("rotating an explicit model context starts a fresh flight and ignores a late old result", async () => {
    const pendingA = deferred<AuraAssetPreloadEvidence>();
    const pendingB = deferred<AuraAssetPreloadEvidence>();
    const calls: { tenant: string; signal: AbortSignal }[] = [];
    let tenant = "A";
    const loader: AuraAssetPreloadFn = (_descriptors, options) => {
      calls.push({ tenant, signal: options!.signal });
      return tenant === "A" ? pendingA.promise : pendingB.promise;
    };
    const contextA = {};
    const contextB = {};
    const harness = await modelHarness();
    const model = harness.instance({ asset, suspendOnLoad: [descriptor], loader, securityContext: contextA });
    model.mount();
    tenant = "B";
    model.rerender({ asset, suspendOnLoad: [descriptor], loader, securityContext: contextB });
    await flushPromises();
    expect(calls.map((call) => call.tenant)).toEqual(["A", "B"]);
    expect(calls[0]?.signal.aborted).toBe(true);
    expect(calls[1]?.signal.aborted).toBe(false);
    const current = harness.resourceForDescriptors([descriptor], loader, contextB);
    pendingB.resolve(success);
    await flushPromises();
    expect(current.read()).toBe(success);
    pendingA.resolve({ ok: false, loaded: [], failed: [{ id: "product", message: "stale" }] });
    await flushPromises();
    expect(current.read()).toBe(success);
    model.unmount();
    expect(model.lateUpdates()).toBe(0);
    current.dispose();
  });

  test("an explicitly invalid model context is rejected instead of using the canvas scope", async () => {
    const loader = vi.fn<AuraAssetPreloadFn>(async () => success);
    const harness = await modelHarness();
    const model = harness.instance({
      asset,
      suspendOnLoad: [descriptor],
      loader,
      securityContext: null as unknown as object
    }, harness.canvasScope());
    expect(() => model.mount()).toThrow(/securityContext.*object identity/i);
    expect(loader).not.toHaveBeenCalled();
  });
});

describe("preload resource identity and ownership", () => {
  test("rejects empty or conflicting explicitly supplied SHA-256 aliases", () => {
    expect(() => createAuraAssetResource([{ ...descriptor, hash: "" }])).toThrow();
    expect(() => createAuraAssetResource([{ ...descriptor, sha256: "" }])).toThrow();
    expect(() => createAuraAssetResource([{ ...descriptor, hash: "a".repeat(64), sha256: "b".repeat(64) }])).toThrow();
  });

  test("custom shared lookups require an explicit security context", () => {
    const loader = vi.fn<AuraAssetPreloadFn>(async () => success);
    expect(() => resourceForDescriptors([descriptor], loader)).toThrow(/securityContext.*createAuraAssetResource/i);
    expect(() => resourceForDescriptors([descriptor], loader, null as unknown as object)).toThrow(/securityContext.*object identity/i);
    expect(loader).not.toHaveBeenCalled();
  });

  test("rotated contexts isolate a custom loader's pending, ready, and failed evidence", async () => {
    const pendingA = deferred<AuraAssetPreloadEvidence>();
    const pendingB = deferred<AuraAssetPreloadEvidence>();
    const failure = new Error("tenant B request failed");
    const signalByTenant = new Map<string, AbortSignal>();
    let tenant = "A";
    const loader = vi.fn<AuraAssetPreloadFn>((_descriptors, options) => {
      const selectedTenant = tenant;
      signalByTenant.set(selectedTenant, options!.signal);
      return selectedTenant === "A" ? pendingA.promise : pendingB.promise;
    });
    const contextA = {};
    const contextB = {};
    const resourceA = resourceForDescriptors([descriptor], loader, contextA);
    const requestA = resourceA.preload();
    tenant = "B";
    const resourceB = resourceForDescriptors([descriptor], loader, contextB);
    const requestB = resourceB.preload();
    expect(resourceB).not.toBe(resourceA);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(signalByTenant.get("A")).not.toBe(signalByTenant.get("B"));
    const evidenceA: AuraAssetPreloadEvidence = { ok: true, loaded: ["product"], failed: [] };
    const results = [expect(requestA).resolves.toBe(evidenceA), expect(requestB).rejects.toBe(failure)];
    pendingA.resolve(evidenceA);
    pendingB.reject(failure);
    await Promise.all(results);
    expect(resourceA.read()).toBe(evidenceA);
    expect(() => resourceB.read()).toThrow(failure);
    resourceA.dispose();
    resourceB.dispose();
  });

  test("cancelling one context cannot cancel a different context's custom flight", async () => {
    const pendingA = deferred<AuraAssetPreloadEvidence>();
    const pendingB = deferred<AuraAssetPreloadEvidence>();
    const signals: AbortSignal[] = [];
    const loader = vi.fn<AuraAssetPreloadFn>((_descriptors, options) => {
      signals.push(options!.signal);
      return signals.length === 1 ? pendingA.promise : pendingB.promise;
    });
    const resourceA = resourceForDescriptors([descriptor], loader, {});
    const resourceB = resourceForDescriptors([descriptor], loader, {});
    const ownerA = new AbortController();
    const ownerB = new AbortController();
    const requestA = resourceA.preload({ signal: ownerA.signal });
    const requestB = resourceB.preload({ signal: ownerB.signal });
    ownerA.abort();
    await expect(requestA).rejects.toMatchObject({ name: "AbortError" });
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
    pendingB.resolve(success);
    await expect(requestB).resolves.toBe(success);
    pendingA.resolve({ ok: false, loaded: [], failed: [{ id: "product", message: "stale" }] });
    await flushPromises();
    expect(resourceB.read()).toBe(success);
    resourceA.dispose();
    resourceB.dispose();
  });

  test("shares only with the same loader, request context, descriptor order and digest", () => {
    const loaderA: AuraAssetPreloadFn = async () => success;
    const loaderB: AuraAssetPreloadFn = async () => success;
    const contextA = {};
    const contextB = {};
    const first = resourceForDescriptors([descriptor], loaderA, contextA);
    const same = resourceForDescriptors([{ ...descriptor }], loaderA, contextA);
    const otherLoader = resourceForDescriptors([descriptor], loaderB, contextA);
    const otherContext = resourceForDescriptors([descriptor], loaderA, contextB);
    const digestA = resourceForDescriptors([{ ...descriptor, hash: `sha256-${"a".repeat(64)}` }], loaderA, contextA);
    const digestB = resourceForDescriptors([{ ...descriptor, hash: `sha256-${"b".repeat(64)}` }], loaderA, contextA);
    const two = [descriptor, { id: "environment", url: "/studio.hdr" }] as const;
    const forward = resourceForDescriptors(two, loaderA, contextA);
    const backward = resourceForDescriptors([...two].reverse(), loaderA, contextA);
    expect(same).toBe(first);
    expect(otherLoader).not.toBe(first);
    expect(otherContext).not.toBe(first);
    expect(digestA).not.toBe(digestB);
    expect(forward).not.toBe(backward);
    for (const resource of [first, otherLoader, otherContext, digestA, digestB, forward, backward]) resource.dispose();
  });

  test("does not collide when descriptor ids and URLs contain separators", () => {
    const loader: AuraAssetPreloadFn = async (descriptors) => ({ ok: true, loaded: descriptors.map((item) => item.id), failed: [] });
    const context = {};
    const one = resourceForDescriptors([{ id: "a@b", url: "c" }], loader, context);
    const two = resourceForDescriptors([{ id: "a", url: "b@c" }], loader, context);
    expect(one).not.toBe(two);
    one.dispose();
    two.dispose();
  });

  test("copies descriptor identity before a caller can mutate it", async () => {
    const mutable = { id: "product", url: "/first.glb", hash: `sha256-${"a".repeat(64)}` };
    const loader = vi.fn<AuraAssetPreloadFn>(async () => success);
    const resource = resourceForDescriptors([mutable], loader, {});
    mutable.url = "/other.glb";
    mutable.hash = `sha256-${"b".repeat(64)}`;
    await resource.preload();
    expect(loader.mock.calls[0]?.[0]).toEqual([{ id: "product", url: "/first.glb", hash: `sha256-${"a".repeat(64)}` }]);
    resource.dispose();
  });

  test("eviction is bounded, retains stay usable, and explicit disposal removes a cached entry", async () => {
    const loader: AuraAssetPreloadFn = async (descriptors) => ({ ok: true, loaded: descriptors.map((item) => item.id), failed: [] });
    const context = {};
    const oldestDescriptor = [{ id: "oldest", url: "/oldest" }];
    const oldest = resourceForDescriptors(oldestDescriptor, loader, context);
    const retained = resourceForDescriptors([{ id: "retained", url: "/retained" }], loader, context);
    const release = retained.retain();
    await retained.preload();
    for (let index = 0; index < 512; index++) {
      resourceForDescriptors([{ id: `churn-${index}`, url: `/churn-${index}` }], loader, context);
    }
    expect(resourceForDescriptors(oldestDescriptor, loader, context)).not.toBe(oldest);
    expect(retained.read()).toEqual({ ok: true, loaded: ["retained"], failed: [] });
    release();
    release();
    const explicitDescriptor = [{ id: "explicit", url: "/explicit" }];
    const explicit = resourceForDescriptors(explicitDescriptor, loader, context);
    explicit.dispose();
    const replacement = resourceForDescriptors(explicitDescriptor, loader, context);
    expect(replacement).not.toBe(explicit);
    replacement.dispose();
    retained.dispose();
  });

  test("cache pressure preserves both cancellable and ordinary active preload callers", async () => {
    const operation = deferred<void>();
    const loaderSignals = new Map<string, AbortSignal>();
    const loader: AuraAssetPreloadFn = (descriptors, options) => {
      const id = descriptors[0]!.id;
      if (options?.signal) loaderSignals.set(id, options.signal);
      return operation.promise.then(() => ({ ok: true, loaded: [id], failed: [] }));
    };
    const context = {};
    const firstDescriptor = [{ id: "active-cancellable", url: "/active-cancellable" }];
    const secondDescriptor = [{ id: "active-ordinary", url: "/active-ordinary" }];
    const first = resourceForDescriptors(firstDescriptor, loader, context);
    const second = resourceForDescriptors(secondDescriptor, loader, context);
    const controller = new AbortController();
    const waits = [first.preload({ signal: controller.signal }), second.preload()];
    for (const wait of waits) void wait.catch(() => undefined);
    try {
      for (let index = 0; index < 160; index++) {
        resourceForDescriptors([{ id: `pressure-${index}`, url: `/pressure-${index}` }], loader, context);
      }
      expect(loaderSignals.get("active-cancellable")?.aborted).toBe(false);
      expect(loaderSignals.get("active-ordinary")?.aborted).toBe(false);
      expect(resourceForDescriptors(firstDescriptor, loader, context)).toBe(first);
      expect(resourceForDescriptors(secondDescriptor, loader, context)).toBe(second);
      operation.resolve();
      await expect(Promise.all(waits)).resolves.toEqual([
        { ok: true, loaded: ["active-cancellable"], failed: [] },
        { ok: true, loaded: ["active-ordinary"], failed: [] }
      ]);
    } finally {
      first.dispose();
      second.dispose();
    }
  });

  test("evicting an entry when every cache slot has a live waiter does not cancel that waiter", async () => {
    const operation = deferred<void>();
    const signals: AbortSignal[] = [];
    const loader: AuraAssetPreloadFn = (descriptors, options) => {
      if (options?.signal) signals.push(options.signal);
      return operation.promise.then(() => ({ ok: true, loaded: descriptors.map(({ id }) => id), failed: [] }));
    };
    const context = {};
    const resources: ReturnType<typeof resourceForDescriptors>[] = [];
    const waits: Promise<AuraAssetPreloadEvidence>[] = [];
    try {
      for (let index = 0; index < 129; index++) {
        const resource = resourceForDescriptors([{ id: `owned-${index}`, url: `/owned-${index}` }], loader, context);
        const controller = new AbortController();
        resources.push(resource);
        const wait = resource.preload({ signal: controller.signal });
        void wait.catch(() => undefined);
        waits.push(wait);
      }
      expect(signals).toHaveLength(129);
      expect(signals.every((signal) => !signal.aborted)).toBe(true);
      operation.resolve();
      const results = await Promise.all(waits);
      expect(results).toHaveLength(129);
      expect(results[0]).toEqual({ ok: true, loaded: ["owned-0"], failed: [] });
      expect(results[128]).toEqual({ ok: true, loaded: ["owned-128"], failed: [] });
    } finally {
      for (const resource of resources) resource.dispose();
    }
  });
});

describe("preload failures, cancellation and retry", () => {
  test("a failed evidence result reaches the boundary and can be retried", async () => {
    const loader = vi.fn()
      .mockResolvedValueOnce({ ok: false, loaded: [], failed: [{ id: "product", message: "temporarily unavailable" }] })
      .mockResolvedValueOnce(success);
    const resource = createAuraAssetResource([descriptor], loader);
    await expect(resource.preload()).rejects.toBeInstanceOf(Error);
    expect(() => resource.read()).toThrow();
    await expect(resource.retry()).resolves.toEqual(success);
    expect(resource.read()).toEqual(success);
    expect(loader).toHaveBeenCalledTimes(2);
    resource.dispose();
  });

  test("a synchronous loader exception becomes a retryable failure", async () => {
    let attempt = 0;
    const resource = createAuraAssetResource([descriptor], () => {
      if (++attempt === 1) throw new Error("loader unavailable");
      return Promise.resolve(success);
    });
    await expect(resource.preload()).rejects.toThrow("loader unavailable");
    expect(() => resource.read()).toThrow("loader unavailable");
    await expect(resource.retry()).resolves.toEqual(success);
    resource.dispose();
  });

  test("a loader's own AbortError stays failed until an explicit retry", async () => {
    const failure = Object.assign(new Error("loader cancelled independently"), { name: "AbortError" });
    const loader = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(success);
    const resource = createAuraAssetResource([descriptor], loader);
    await expect(resource.preload()).rejects.toBe(failure);
    await expect(resource.preload()).rejects.toBe(failure);
    expect(loader).toHaveBeenCalledTimes(1);
    await expect(resource.retry()).resolves.toEqual(success);
    expect(loader).toHaveBeenCalledTimes(2);
    resource.dispose();
  });

  test("aborting one subscriber leaves another subscriber's shared flight intact", async () => {
    const operation = deferred<AuraAssetPreloadEvidence>();
    let loaderSignal: AbortSignal | undefined;
    const loader: AuraAssetPreloadFn = (_descriptors, options) => {
      loaderSignal = options?.signal;
      return operation.promise;
    };
    const resource = createAuraAssetResource([descriptor], loader);
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = resource.preload({ signal: firstController.signal });
    const second = resource.preload({ signal: secondController.signal });
    firstController.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(loaderSignal?.aborted).toBe(false);
    operation.resolve(success);
    await expect(second).resolves.toEqual(success);
    expect(resource.read()).toEqual(success);
    resource.dispose();
  });

  test("a cancelled subscriber cannot abort an ordinary unsignalled preload", async () => {
    const operation = deferred<AuraAssetPreloadEvidence>();
    let loaderSignal: AbortSignal | undefined;
    const resource = createAuraAssetResource([descriptor], (_descriptors, options) => {
      loaderSignal = options?.signal;
      return operation.promise;
    });
    const ordinary = resource.preload();
    const controller = new AbortController();
    const cancellable = resource.preload({ signal: controller.signal });
    controller.abort();
    await expect(cancellable).rejects.toMatchObject({ name: "AbortError" });
    expect(loaderSignal?.aborted).toBe(false);
    operation.resolve(success);
    await expect(ordinary).resolves.toEqual(success);
    resource.dispose();
  });

  test("the last cancelled subscriber aborts the loader and retry ignores a late old result", async () => {
    const oldOperation = deferred<AuraAssetPreloadEvidence>();
    const newOperation = deferred<AuraAssetPreloadEvidence>();
    const freshEvidence: AuraAssetPreloadEvidence = { ok: true, loaded: ["product"], failed: [] };
    const signals: AbortSignal[] = [];
    const loader: AuraAssetPreloadFn = (_descriptors, options) => {
      if (options?.signal) signals.push(options.signal);
      return signals.length === 1 ? oldOperation.promise : newOperation.promise;
    };
    const resource = createAuraAssetResource([descriptor], loader);
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = resource.preload({ signal: firstController.signal });
    const second = resource.preload({ signal: secondController.signal });
    firstController.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(signals[0]?.aborted).toBe(false);
    secondController.abort();
    await expect(second).rejects.toMatchObject({ name: "AbortError" });
    expect(signals[0]?.aborted).toBe(true);
    const retry = resource.retry();
    newOperation.resolve(freshEvidence);
    await expect(retry).resolves.toEqual(freshEvidence);
    oldOperation.resolve({ ok: false, loaded: [], failed: [{ id: "product", message: "stale failure" }] });
    await Promise.resolve();
    expect(resource.read()).toEqual(freshEvidence);
    resource.dispose();
  });

  test("dispose settles a flight even if its loader ignores cancellation, and rejects late completion", async () => {
    const operation = deferred<AuraAssetPreloadEvidence>();
    const resource = createAuraAssetResource([descriptor], () => operation.promise);
    const pending = resource.preload();
    const cancelled = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    resource.dispose();
    await cancelled;
    operation.resolve(success);
    await Promise.resolve();
    expect(() => resource.read()).toThrow();
  });
});

describe("default fetch preload", () => {
  test("verifies declared SHA-256 bytes and fails a mismatched digest", async () => {
    const bytes = new TextEncoder().encode("independent fixture");
    const digest = createHash("sha256").update(bytes).digest("hex");
    const fetchMock = vi.fn(async () => new Response(bytes));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const valid = createAuraAssetResource([{ ...descriptor, hash: `sha256-${digest}` }]);
      await expect(valid.preload()).resolves.toMatchObject({ ok: true, loaded: ["product"] });
      expect(fetchMock).toHaveBeenCalledWith(descriptor.url, expect.objectContaining({ credentials: "omit", signal: expect.any(AbortSignal) }));
      const invalid = createAuraAssetResource([{ ...descriptor, hash: `sha256-${"0".repeat(64)}` }]);
      await expect(invalid.preload()).rejects.toBeInstanceOf(Error);
      expect(() => invalid.read()).toThrow();
      valid.dispose();
      invalid.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
