import { createElement } from "react";
import { describe, expect, test, vi } from "vitest";
import { defineAuraAssets, scene as auraScene } from "../../../packages/engine/src";
import {
  R3F_MIGRATION_NOT_PARITY,
  R3F_TO_AURA_MIGRATION_TABLE,
  Model,
  Scene,
  buildSceneFromChildren,
  cameraControlsRecipe,
  createAuraAssetResource,
  createFrameScheduler,
  environmentPresetRecipe,
  eventInteractionNodes,
  resourceForDescriptors,
  transformGizmoRecipe,
  type AuraFrameInfo
} from "../../../packages/react/src";

const assets = defineAuraAssets({
  product: {
    type: "model",
    format: "glb",
    url: "/aura-assets/product.12345678.glb",
    hash: "sha256-product"
  }
} as const);

const FRAME: AuraFrameInfo = {
  dt: 1 / 60,
  fixedDt: 1 / 60,
  time: 0.016,
  frame: 1,
  alpha: 1,
  paused: false,
  source: "manual",
  substep: 0,
  substeps: 1
};

function fakeHost() {
  const state = {
    listener: undefined as ((frame: AuraFrameInfo) => void) | undefined,
    releases: 0
  };
  return {
    state,
    host: {
      onFrame(callback: (frame: AuraFrameInfo) => void): () => void {
        state.listener = callback;
        return () => {
          state.listener = undefined;
          state.releases += 1;
        };
      }
    }
  };
}

describe("V1 useAuraFrame scheduler", () => {
  test("dispatches in priority order with shared host subscription", () => {
    const { host, state } = fakeHost();
    const scheduler = createFrameScheduler(host);
    const order: string[] = [];
    const releaseLow = scheduler.subscribe(() => order.push("low"), 10);
    scheduler.subscribe(() => order.push("high"), -1);
    scheduler.subscribe(() => order.push("mid"), 5);
    expect(scheduler.subscriberCount()).toBe(3);
    state.listener?.(FRAME);
    expect(order).toEqual(["high", "mid", "low"]);
    releaseLow();
    expect(scheduler.subscriberCount()).toBe(2);
    expect(state.releases).toBe(0);
  });

  test("releases the host subscription when the last subscriber leaves", () => {
    const { host, state } = fakeHost();
    const scheduler = createFrameScheduler(host);
    const first = scheduler.subscribe(() => {});
    const second = scheduler.subscribe(() => {});
    first();
    expect(state.releases).toBe(0);
    second();
    expect(state.releases).toBe(1);
    expect(scheduler.subscriberCount()).toBe(0);
  });

  test("rejects non-finite priorities and tolerates double release", () => {
    const { host, state } = fakeHost();
    const scheduler = createFrameScheduler(host);
    expect(() => scheduler.subscribe(() => {}, Number.NaN)).toThrow();
    const release = scheduler.subscribe(() => {});
    release();
    release();
    expect(state.releases).toBe(1);
  });

  test("does not publish a callback from a render that never commits", async () => {
    type Effect = () => void | (() => void);
    type Hook = { value?: unknown; dependencies?: readonly unknown[]; cleanup?: () => void };
    const hooks: Hook[] = [];
    const { host, state } = fakeHost();
    let cursor = 0;
    let layoutEffects: (() => void)[] = [];
    let effects: (() => void)[] = [];
    const register = (setup: Effect, dependencies: readonly unknown[] | undefined, layout: boolean) => {
      const hook = hooks[cursor] ?? (hooks[cursor] = {});
      cursor++;
      const same = dependencies !== undefined && hook.dependencies !== undefined &&
        dependencies.length === hook.dependencies.length && dependencies.every((value, index) => Object.is(value, hook.dependencies?.[index]));
      if (!same) {
        (layout ? layoutEffects : effects).push(() => {
          hook.cleanup?.();
          const cleanup = setup();
          hook.cleanup = typeof cleanup === "function" ? cleanup : undefined;
          hook.dependencies = dependencies;
        });
      }
    };
    vi.resetModules();
    vi.doMock("react", async (importOriginal) => {
      const actual = await importOriginal<typeof import("react")>();
      return {
        ...actual,
        useContext: () => host,
        useRef<T>(initial: T) {
          const hook = hooks[cursor] ?? (hooks[cursor] = {});
          cursor++;
          if (!("value" in hook)) hook.value = { current: initial };
          return hook.value;
        },
        useEffect: (setup: Effect, dependencies?: readonly unknown[]) => register(setup, dependencies, false),
        useLayoutEffect: (setup: Effect, dependencies?: readonly unknown[]) => register(setup, dependencies, true)
      };
    });
    vi.doMock("@aura3d/engine", () => ({
      camera: {}, createAuraApp: vi.fn(), effects: {}, environments: {}, interactions: {}, lights: {}, model: vi.fn(), scene: vi.fn()
    }));
    try {
      const adapter = await import("../../../packages/react/src/index");
      vi.stubGlobal("window", {});
      const initial = vi.fn();
      const abandoned = vi.fn();
      const committed = vi.fn();
      const render = (callback: (frame: AuraFrameInfo) => void) => {
        cursor = 0;
        layoutEffects = [];
        effects = [];
        adapter.useAuraFrame(callback);
      };
      const commit = () => {
        for (const effect of layoutEffects) effect();
        for (const effect of effects) effect();
      };
      render(initial);
      commit();
      state.listener?.(FRAME);
      render(abandoned); // A concurrent React render may be discarded before effects commit.
      state.listener?.(FRAME);
      expect(initial).toHaveBeenCalledTimes(2);
      expect(abandoned).not.toHaveBeenCalled();
      render(committed);
      commit();
      state.listener?.(FRAME);
      expect(committed).toHaveBeenCalledOnce();
      for (const hook of hooks) hook.cleanup?.();
      expect(state.releases).toBe(1);
    } finally {
      vi.unstubAllGlobals();
      vi.doUnmock("react");
      vi.doUnmock("@aura3d/engine");
    }
  });
});

describe("V1 suspense asset boundary", () => {
  test("suspends while pending, resolves with evidence, shares flights", async () => {
    let resolveLoad!: (value: { ok: boolean; loaded: string[]; failed: [] }) => void;
    const loader = () =>
      new Promise<{ ok: boolean; loaded: string[]; failed: [] }>((resolve) => {
        resolveLoad = resolve;
      });
    const resource = createAuraAssetResource([{ id: "hero", url: "/aura-assets/hero.glb" }], loader);
    let thrown: unknown;
    try {
      resource.read();
    } catch (promise) {
      thrown = promise;
    }
    expect(thrown instanceof Promise).toBe(true);
    expect(resource.preload()).toBe(thrown);
    resolveLoad({ ok: true, loaded: ["hero"], failed: [] });
    const evidence = await resource.preload();
    expect(evidence.ok).toBe(true);
    expect(resource.read()).toBe(evidence);
  });

  test("throws failures to an error boundary instead of hiding them", async () => {
    const resource = createAuraAssetResource([{ id: "hero", url: "/aura-assets/hero.glb" }], async () => {
      throw new Error("HTTP 404 for /aura-assets/hero.glb");
    });
    await expect(resource.preload()).rejects.toThrow("HTTP 404");
    expect(() => resource.read()).toThrow("HTTP 404");
  });

  test("validates descriptors fail-closed", () => {
    expect(() => createAuraAssetResource([])).toThrow();
    expect(() => createAuraAssetResource([{ id: "", url: "/x.glb" }])).toThrow();
    expect(() =>
      createAuraAssetResource([
        { id: "a", url: "/a.glb" },
        { id: "a", url: "/b.glb" }
      ])
    ).toThrow();
  });

  test("shares one resource per descriptor set", () => {
    const descriptors = [{ id: "hero", url: "/aura-assets/hero.glb" }];
    expect(resourceForDescriptors(descriptors)).toBe(resourceForDescriptors(descriptors));
  });
});

describe("V1 events and drei recipes", () => {
  test("event interaction nodes engage pointer + hover picking", () => {
    const [pointer, hover] = eventInteractionNodes("crate");
    expect(pointer.toJSON().mode).toBe("pointer");
    expect(hover.toJSON().mode).toBe("hover");
  });

  test("camera-controls recipe binds an orbit camera and interaction", () => {
    const snapshot = cameraControlsRecipe({ distance: 6, target: "hero" })(auraScene()).toJSON();
    expect(snapshot.camera.mode).toBe("orbit");
    expect(snapshot.nodes.some((node) => node.kind === "interaction" && node.mode === "orbit")).toBe(true);
  });

  test("environment-preset recipe adds a catalog IBL node", () => {
    const snapshot = environmentPresetRecipe("nightCinematic")(auraScene()).toJSON();
    expect(snapshot.nodes.some((node) => node.kind === "environment")).toBe(true);
  });

  test("transform-gizmo recipe binds drag-vector plus hover-select", () => {
    const snapshot = transformGizmoRecipe("crate")(auraScene()).toJSON();
    const modes = snapshot.nodes.filter((node) => node.kind === "interaction").map((node) => node.mode);
    expect(modes).toContain("drag-vector");
    expect(modes).toContain("hover");
    expect(() => transformGizmoRecipe("")).toThrow();
  });

  test("<Model> with suspendOnLoad still declares its typed asset", () => {
    const tree = createElement(
      Scene,
      { background: "#08111f" },
      createElement(Model, {
        asset: assets.product,
        suspendOnLoad: [{ id: "product", url: "/aura-assets/product.12345678.glb" }],
        fallback: "loading"
      })
    );
    const snapshot = buildSceneFromChildren(tree).toJSON();
    expect(snapshot.nodes.some((node) => node.kind === "model")).toBe(true);
  });
});

describe("V1 R3F migration table", () => {
  test("covers the components plus hooks with no parity wording", () => {
    const auras = R3F_TO_AURA_MIGRATION_TABLE.map((row) => row.aura);
    expect(auras.some((aura) => aura.includes("AuraCanvas"))).toBe(true);
    expect(auras.some((aura) => aura.includes("useAuraFrame"))).toBe(true);
    expect(auras.some((aura) => aura.includes("useAuraApp"))).toBe(true);
    expect(auras.some((aura) => aura.includes("cameraControlsRecipe"))).toBe(true);
    expect(auras.some((aura) => aura.includes("environmentPresetRecipe"))).toBe(true);
    expect(auras.some((aura) => aura.includes("transformGizmoRecipe"))).toBe(true);
    const text = JSON.stringify(R3F_TO_AURA_MIGRATION_TABLE);
    // Boundary statements ("no X parity beyond ...") are honest; positive claims are not.
    expect(text).not.toMatch(/R3F parity|drei parity|full parity|complete parity|reaches parity|parity with/i);
    expect(text).toContain("no postprocess parity beyond the covered set");
    expect(R3F_MIGRATION_NOT_PARITY).toMatch(/not an R3F-parity claim/);
  });
});
