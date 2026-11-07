import { afterEach, describe, expect, it, vi } from "vitest";

// Drive the real AuraCanvas through a small hook host (no DOM, no GPU): handle, live-data, isolation,
// multi-instance, StrictMode replay and dispose cleanup for the React embedding lane (R-01..R-05, R-11).

type Effect = () => void | (() => void);
type Hook = { value?: unknown; dependencies?: readonly unknown[]; setup?: Effect; cleanup?: () => void };

function fakeNode() {
  return {
    setPosition: vi.fn(), setRotation: vi.fn(), setScale: vi.fn(), setVisible: vi.fn(), setMaterial: vi.fn(),
    setText: vi.fn(), setMorphTargets: vi.fn(), setInstanceMatrices: vi.fn()
  };
}

function fakeApp() {
  const node = fakeNode();
  const frameListeners = new Set<(frame: unknown) => void>();
  const app = {
    node,
    nodes: { get: (id: string) => (id === "box" ? node : undefined), require: (id: string) => node, has: (id: string) => id === "box" },
    readiness: vi.fn(async () => ({ state: "ready", stage: "renderer", backend: "webgl2" })),
    dispose: vi.fn(),
    setScene: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    screenshot: vi.fn(() => ({ ok: true })),
    input: vi.fn((options: unknown) => ({ options })),
    onFrame: vi.fn((callback: (frame: unknown) => void) => { frameListeners.add(callback); return () => frameListeners.delete(callback); }),
    frameListeners
  };
  return app;
}

async function host() {
  const hooks: Hook[] = [];
  const pending = new Set<number>();
  const pendingLayout = new Set<number>();
  let position = 0;
  const canvas = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const same = (a?: readonly unknown[], b?: readonly unknown[]) => a !== undefined && b !== undefined && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const next = (): Hook => { const i = position++; return hooks[i] ?? (hooks[i] = {}); };
  const apps: ReturnType<typeof fakeApp>[] = [];
  const createApp = vi.fn((_canvas: unknown, _options: unknown) => { const app = fakeApp(); apps.push(app); return app; });
  vi.resetModules();
  vi.doMock("react", async (importOriginal) => {
    const actual = await importOriginal<typeof import("react")>();
    return {
      ...actual,
      useRef<T>(initial: T) { const h = next(); if (!("value" in h)) h.value = { current: initial }; return h.value; },
      useState<T>(initial: T) {
        const h = next();
        if (!("value" in h)) h.value = initial;
        return [h.value, (v: T) => { h.value = v; }];
      },
      useMemo<T>(factory: () => T, deps?: readonly unknown[]) {
        const h = next();
        if (!same(h.dependencies, deps)) { h.value = factory(); h.dependencies = deps; }
        return h.value;
      },
      useEffect(setup: Effect, deps?: readonly unknown[]) {
        const i = position; const h = next();
        if (!same(h.dependencies, deps)) { h.dependencies = deps; h.setup = setup; pending.add(i); }
      },
      useLayoutEffect(setup: Effect, deps?: readonly unknown[]) {
        const i = position; const h = next();
        if (!same(h.dependencies, deps)) { h.dependencies = deps; h.setup = setup; pendingLayout.add(i); }
      }
    };
  });
  vi.doMock("@aura3d/engine", () => ({
    camera: {}, effects: {}, environments: {}, interactions: {}, lights: {}, model: vi.fn(),
    scene: () => { const b = { background: vi.fn(() => b), toJSON: () => ({}) }; return b; },
    createAuraApp: createApp
  }));
  const adapter = await import("../../../packages/react/src/index");
  const run = (queue: Set<number>) => {
    for (const i of queue) { const h = hooks[i]!; h.cleanup?.(); const c = h.setup?.(); h.cleanup = typeof c === "function" ? c : undefined; }
    queue.clear();
  };
  const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  return {
    adapter, canvas, createApp, apps,
    mount(props: Parameters<typeof adapter.AuraCanvas>[0]) {
      position = 0;
      const tree = adapter.AuraCanvas(props) as unknown as { props: { children: readonly [{ props: { ref?: { current: unknown }; tabIndex?: number } }] } };
      tree.props.children[0].props.ref!.current = canvas;
      run(pendingLayout); run(pending);
      return tree;
    },
    unmount() { for (const h of hooks) { h.cleanup?.(); h.cleanup = undefined; } },
    strictReplay() {
      for (const h of hooks) { h.cleanup?.(); h.cleanup = undefined; }
      for (const h of hooks) { const c = h.setup?.(); h.cleanup = typeof c === "function" ? c : undefined; }
    },
    flush
  };
}

afterEach(() => { vi.doUnmock("react"); vi.doUnmock("@aura3d/engine"); vi.resetModules(); });

describe("AuraCanvas imperative handle (R-01)", () => {
  it("publishes a stable handle after ready, equal app everywhere, and clears it on unmount", async () => {
    const h = await host();
    const handleRef = { current: null as unknown as import("../../../packages/react/src/index").AuraCanvasHandle | null };
    const canvasRef = { current: null as unknown };
    const onAppChange = vi.fn();
    const onReady = vi.fn();
    h.mount({ handleRef, canvasRef: canvasRef as never, onAppChange, onReady });
    expect(canvasRef.current).toBe(h.canvas);
    expect(handleRef.current).toBeNull();
    await h.flush();
    const handle = handleRef.current!;
    expect(handle).toBeTruthy();
    expect(handle.app).toBe(h.apps[0]);
    expect(onAppChange).toHaveBeenCalledWith(h.apps[0]);
    expect(onReady).toHaveBeenCalledWith(h.apps[0]);
    expect(handle.canvas).toBe(h.canvas);
    h.unmount();
    expect(handleRef.current).toBeNull();
    expect(canvasRef.current).toBeNull();
    expect(handle.disposed).toBe(true);
    expect(onAppChange).toHaveBeenLastCalledWith(undefined);
    expect(h.apps[0]!.dispose).toHaveBeenCalledOnce();
  });

  it("accepts a callback handleRef", async () => {
    const h = await host();
    const seen: unknown[] = [];
    h.mount({ handleRef: (value) => { seen.push(value); } });
    await h.flush();
    expect(seen.some((value) => value !== null && typeof value === "object")).toBe(true);
    h.unmount();
    expect(seen.at(-1)).toBeNull();
  });
});

describe("live-data channel (R-03)", () => {
  it("writes node patches without setScene or any re-render, and tolerates missing nodes", async () => {
    const h = await host();
    const handleRef = { current: null as unknown as import("../../../packages/react/src/index").AuraCanvasHandle | null };
    h.mount({ handleRef });
    await h.flush();
    const handle = handleRef.current!;
    const app = h.apps[0]!;
    const matrices = new Float32Array(32);
    for (let i = 0; i < 20; i++) {
      expect(handle.update("box", { position: [i, 0, 0], rotation: [0, i, 0], scale: 2, visible: true })).toBe(true);
    }
    expect(handle.writeInstances("box", matrices, 2)).toBe(true);
    expect(handle.update("missing", { position: [0, 0, 0] })).toBe(false);
    expect(app.node.setPosition).toHaveBeenCalledTimes(20);
    expect(app.node.setPosition).toHaveBeenLastCalledWith(19, 0, 0);
    expect(app.node.setInstanceMatrices).toHaveBeenCalledWith(matrices, 2, undefined);
    expect(app.setScene).not.toHaveBeenCalled();
    expect(h.createApp).toHaveBeenCalledTimes(1);
  });

  it("onFrame subscriptions end with the handle and the handle goes inert after dispose", async () => {
    const h = await host();
    const handleRef = { current: null as unknown as import("../../../packages/react/src/index").AuraCanvasHandle | null };
    h.mount({ handleRef });
    await h.flush();
    const handle = handleRef.current!;
    const app = h.apps[0]!;
    const off = handle.onFrame(() => {});
    handle.onFrame(() => {});
    expect(app.frameListeners.size).toBe(2);
    off();
    expect(app.frameListeners.size).toBe(1);
    h.unmount();
    expect(app.frameListeners.size).toBe(0);
    expect(handle.update("box", { position: [1, 1, 1] })).toBe(false);
    expect(app.node.setPosition).not.toHaveBeenCalled();
    handle.pause();
    expect(app.pause).not.toHaveBeenCalled();
    expect(handle.onFrame(() => {})).toBeTypeOf("function");
    expect(app.frameListeners.size).toBe(0);
  });

  it("applyAuraNodePatch maps every patch field to the node handle", async () => {
    const h = await host();
    const node = fakeNode();
    const app = { nodes: { get: () => node } } as never;
    h.adapter.applyAuraNodePatch(app, "x", { scale: [1, 2, 3], text: "hi", morphTargets: { a: 1 }, material: { color: "red" } as never });
    expect(node.setScale).toHaveBeenCalledWith([1, 2, 3]);
    expect(node.setText).toHaveBeenCalledWith("hi");
    expect(node.setMorphTargets).toHaveBeenCalledWith({ a: 1 });
    expect(node.setMaterial).toHaveBeenCalled();
  });

  it("warns once in development about a large declarative prop array", async () => {
    const h = await host();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const big = new Array(5000).fill(0);
    h.adapter.sceneChildrenKey([{ $$typeof: Symbol.for("react.transitional.element"), type: h.adapter.Model, props: { big }, key: null, ref: null } as never]);
    h.adapter.sceneChildrenKey([{ $$typeof: Symbol.for("react.transitional.element"), type: h.adapter.Model, props: { big }, key: null, ref: null } as never]);
    expect(warn.mock.calls.filter((call) => String(call[0]).includes("handle.update")).length).toBeLessThanOrEqual(1);
    warn.mockRestore();
  });
});

describe("engine-built scene prop", () => {
  it("mounts the supplied builder and does not call setScene when the same builder re-renders", async () => {
    const h = await host();
    const builder = { toJSON: () => ({ marker: 1 }) } as never;
    h.mount({ scene: builder });
    expect((h.createApp.mock.calls[0]![1] as { scene: unknown }).scene).toBe(builder);
    h.mount({ scene: builder });
    await h.flush();
    expect(h.apps[0]!.setScene).not.toHaveBeenCalled();
    expect(h.createApp).toHaveBeenCalledTimes(1);
  });
});

describe("page isolation (R-02, R-05, R-11)", () => {
  it("mounts with route state and URL flags off by default and a focusable-but-not-tab-stop canvas", async () => {
    const h = await host();
    const tree = h.mount({});
    const options = h.createApp.mock.calls[0]![1] as { routeState: boolean; qualityRebuild: { allowUrlFlags: boolean } };
    expect(options.routeState).toBe(false);
    expect(options.qualityRebuild.allowUrlFlags).toBe(false);
    expect(tree.props.children[0].props.tabIndex).toBe(-1);
  });

  it("opts back in to the legacy globals and URL flags explicitly", async () => {
    const h = await host();
    h.mount({ routeState: true, allowUrlFlags: true });
    const options = h.createApp.mock.calls[0]![1] as { routeState: boolean; qualityRebuild: { allowUrlFlags: boolean } };
    expect(options.routeState).toBe(true);
    expect(options.qualityRebuild.allowUrlFlags).toBe(true);
  });

  it("handle.input targets the canvas, not the page window, unless overridden", async () => {
    const h = await host();
    const handleRef = { current: null as unknown as import("../../../packages/react/src/index").AuraCanvasHandle | null };
    h.mount({ handleRef });
    await h.flush();
    handleRef.current!.input({ actions: {} } as never);
    expect(h.apps[0]!.input).toHaveBeenCalledWith({ target: h.canvas, actions: {} });
    const other = {};
    handleRef.current!.input({ actions: {}, target: other as never });
    expect(h.apps[0]!.input).toHaveBeenLastCalledWith({ actions: {}, target: other });
  });

  it("scopes pointer listeners to the canvas and removes them on dispose", async () => {
    const h = await host();
    h.mount({ onPointerDown: () => {} });
    expect(h.canvas.addEventListener.mock.calls.map((call) => call[0]).sort()).toEqual(["pointerdown", "pointermove", "pointerup"]);
    h.unmount();
    expect(h.canvas.removeEventListener).toHaveBeenCalledTimes(3);
  });
});

const serverSpecifier: string = "react-dom/server";

describe("lifecycle (R-07 neighbourhood: StrictMode, multi-instance, SSR)", () => {
  it("leaves one live app and one live handle after a StrictMode replay", async () => {
    const h = await host();
    const handleRef = { current: null as unknown as import("../../../packages/react/src/index").AuraCanvasHandle | null };
    h.mount({ handleRef });
    h.strictReplay();
    await h.flush();
    const live = h.apps.filter((app) => app.dispose.mock.calls.length === 0);
    expect(live).toHaveLength(1);
    expect(handleRef.current?.app).toBe(live[0]);
  });

  it("two instances keep independent handles and apps", async () => {
    const a = await host();
    const refA = { current: null as unknown as import("../../../packages/react/src/index").AuraCanvasHandle | null };
    a.mount({ handleRef: refA });
    await a.flush();
    const b = await host();
    const refB = { current: null as unknown as import("../../../packages/react/src/index").AuraCanvasHandle | null };
    b.mount({ handleRef: refB });
    await b.flush();
    expect(refA.current!.app).not.toBe(refB.current!.app);
    a.unmount();
    expect(refA.current).toBeNull();
    expect(refB.current).not.toBeNull();
    expect(b.apps[0]!.dispose).not.toHaveBeenCalled();
  });

  it("renders to a string on the server without touching window and without creating an app", async () => {
    vi.doUnmock("react");
    vi.doUnmock("@aura3d/engine");
    vi.resetModules();
    const { createElement } = await import("react");
    const { renderToString } = (await import(/* @vite-ignore */ serverSpecifier)) as { renderToString(node: unknown): string };
    expect(typeof window).toBe("undefined");
    const adapter = await import("../../../packages/react/src/index");
    const html = renderToString(createElement(adapter.AuraCanvasWithRef, { ref: { current: null } }));
    expect(html).toContain("<canvas");
    expect(html).toContain('tabindex="-1"');
  }, 240_000);
});
