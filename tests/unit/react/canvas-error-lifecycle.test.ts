import { afterEach, describe, expect, it, vi } from "vitest";

type Effect = () => void | (() => void);
type Hook = {
  value?: unknown;
  dependencies?: readonly unknown[];
  setup?: Effect;
  cleanup?: () => void;
};
type TestApp = {
  readiness(options: { stage: "renderer"; signal: AbortSignal }): Promise<unknown>;
  dispose(): void;
  setScene(): void;
};

async function harness(creation: Error | TestApp) {
  const hooks: Hook[] = [];
  const effects = new Set<number>();
  let position = 0;
  let mounted = false;
  let updatesAfterUnmount = 0;
  const canvas = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };
  const next = (): Hook => {
    const index = position++;
    return hooks[index] ?? (hooks[index] = {});
  };
  const same = (left?: readonly unknown[], right?: readonly unknown[]) =>
    left !== undefined && right !== undefined && left.length === right.length &&
    left.every((value, index) => Object.is(value, right[index]));
  const register = (setup: Effect, dependencies?: readonly unknown[]) => {
    const index = position;
    const hook = next();
    if (!same(hook.dependencies, dependencies)) {
      hook.dependencies = dependencies;
      hook.setup = setup;
      effects.add(index);
    }
  };

  vi.resetModules();
  vi.doMock("react", async (importOriginal) => {
    const actual = await importOriginal<typeof import("react")>();
    return {
      ...actual,
      useRef<T>(initial: T) {
        const hook = next();
        if (!("value" in hook)) hook.value = { current: initial };
        return hook.value;
      },
      useState<T>(initial: T | (() => T)) {
        const hook = next();
        if (!("value" in hook)) hook.value = typeof initial === "function" ? (initial as () => T)() : initial;
        return [hook.value, (value: T) => {
          if (!mounted) updatesAfterUnmount++;
          hook.value = value;
        }];
      },
      useMemo<T>(factory: () => T, dependencies?: readonly unknown[]) {
        const hook = next();
        if (!same(hook.dependencies, dependencies)) {
          hook.value = factory();
          hook.dependencies = dependencies;
        }
        return hook.value;
      },
      useEffect: register,
      useLayoutEffect: register
    };
  });
  vi.doMock("@aura3d/engine", () => ({
    camera: {},
    createAuraApp: () => {
      if (creation instanceof Error) throw creation;
      return creation;
    },
    effects: {},
    environments: {},
    interactions: {},
    lights: {},
    model: vi.fn(),
    scene: () => ({})
  }));
  const { AuraCanvas } = await import("../../../packages/react/src/index");

  return {
    render(props: Parameters<typeof AuraCanvas>[0]) {
      position = 0;
      const tree = AuraCanvas(props) as unknown as {
        props: { children: readonly [{ props: { ref: { current: unknown } } }, unknown] };
      };
      tree.props.children[0].props.ref.current = canvas;
      return tree;
    },
    commit() {
      mounted = true;
      for (const index of effects) {
        const hook = hooks[index]!;
        hook.cleanup?.();
        const cleanup = hook.setup?.();
        hook.cleanup = typeof cleanup === "function" ? cleanup : undefined;
      }
      effects.clear();
    },
    unmount() {
      mounted = false;
      for (const hook of hooks) hook.cleanup?.();
    },
    updatesAfterUnmount: () => updatesAfterUnmount,
    canvas
  };
}

afterEach(() => {
  vi.doUnmock("react");
  vi.doUnmock("@aura3d/engine");
});

describe("canvas readiness error delivery", () => {
  it("does not rethrow a handled failure when the handler is removed later", async () => {
    const failure = new Error("renderer creation failed");
    const onError = vi.fn();
    const canvas = await harness(failure);
    try {
      canvas.render({ onError });
      canvas.commit();
      expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
      expect(() => canvas.render({})).not.toThrow();
    } finally {
      canvas.unmount();
    }
  });

  it("does not silently suppress an unhandled failure when a handler appears during a later render", async () => {
    const failure = new Error("renderer creation failed");
    const onError = vi.fn();
    const canvas = await harness(failure);
    try {
      canvas.render({});
      canvas.commit();
      expect(() => canvas.render({ onError })).toThrow(failure);
      expect(onError).not.toHaveBeenCalled();
    } finally {
      canvas.unmount();
    }
  });

  it("does not treat a null JavaScript handler as a delivered failure", async () => {
    const failure = new Error("renderer creation failed");
    const canvas = await harness(failure);
    try {
      canvas.render({ onError: null as unknown as (error: unknown) => void });
      canvas.commit();
      expect(() => canvas.render({})).toThrow(failure);
    } finally {
      canvas.unmount();
    }
  });

  it("routes an error thrown by the failure callback to the render boundary", async () => {
    const failure = new Error("renderer creation failed");
    const handlerFailure = new Error("reporting failed");
    const onError = vi.fn(() => { throw handlerFailure; });
    const canvas = await harness(failure);
    try {
      canvas.render({ onError });
      expect(() => canvas.commit()).not.toThrow();
      expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
      expect(() => canvas.render({ onError })).toThrow(handlerFailure);
    } finally {
      canvas.unmount();
    }
  });

  it("routes an asynchronous readiness callback failure to the render boundary", async () => {
    const handlerFailure = new Error("reporting failed");
    const onError = vi.fn(() => { throw handlerFailure; });
    const app = {
      readiness: vi.fn(async () => ({ state: "failed", code: "renderer-failed", message: "renderer failed" })),
      dispose: vi.fn(),
      setScene: vi.fn()
    };
    const canvas = await harness(app);
    try {
      canvas.render({ onError });
      canvas.commit();
      for (let step = 0; step < 12; step++) await Promise.resolve();
      expect(onError).toHaveBeenCalledOnce();
      expect(() => canvas.render({ onError })).toThrow(handlerFailure);
    } finally {
      canvas.unmount();
    }
    expect(app.dispose).toHaveBeenCalledOnce();
  });

  it("aborts pending renderer readiness and ignores a late completion after unmount", async () => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise<unknown>((done) => { resolve = done; });
    const app = {
      readiness: vi.fn((_options: { stage: "renderer"; signal: AbortSignal }) => pending),
      dispose: vi.fn(),
      setScene: vi.fn()
    };
    const onReady = vi.fn();
    const onError = vi.fn();
    const canvas = await harness(app);
    canvas.render({ onReady, onError });
    canvas.commit();
    for (let step = 0; step < 4; step++) await Promise.resolve();
    const signal = app.readiness.mock.calls[0]?.[0].signal;
    expect(signal?.aborted).toBe(false);
    canvas.unmount();
    expect(signal?.aborted).toBe(true);
    resolve({ state: "ready", stage: "renderer", backend: "webgl2" });
    for (let step = 0; step < 12; step++) await Promise.resolve();
    expect(onReady).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(canvas.updatesAfterUnmount()).toBe(0);
    expect(canvas.canvas.removeEventListener).toHaveBeenCalledTimes(3);
    expect(app.dispose).toHaveBeenCalledOnce();
  });
});
