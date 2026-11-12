import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebGLRenderController } from "../../../packages/engine/src/agent-api/nodes/types";

type Hooks = NonNullable<Parameters<typeof import("../../../packages/engine/src/agent-api/app/frameLoop")["startProductionRender"]>[12]>;

const harness = vi.hoisted(() => ({
  queue: [] as Array<{ controller: WebGLRenderController & { backend?: "webgl2" | "webgpu" }; mount?: Promise<WebGLRenderController>; onStart?: () => void }>,
  hooks: [] as Hooks[]
}));

// The real-app integration lives in native-app-disposal-retry.test.ts. This
// narrow seam controls whenIdle independently from dispose so ordering and
// distinct synchronous/asynchronous errors are observable.
vi.mock("../../../packages/engine/src/agent-api/app/frameLoop", async (original) => {
  const actual = await original<typeof import("../../../packages/engine/src/agent-api/app/frameLoop")>();
  return {
    ...actual,
    startProductionRender: (...args: Parameters<typeof actual.startProductionRender>) => {
      const entry = harness.queue.shift();
      if (!entry) throw new Error("Missing synthetic controller");
      const hooks = args[12]!;
      harness.hooks.push(hooks);
      entry.onStart?.();
      const backend = entry.controller.backend ?? "webgl2";
      hooks.onRendererReady(backend, entry.controller);
      hooks.onFirstFrame(backend);
      return entry.mount ?? Promise.resolve(entry.controller);
    }
  };
});

import { createAuraApp, primitives, scene } from "../../../packages/engine/src";
import type { AuraApp } from "../../../packages/engine/src/agent-api/nodes/types";
import type { MutableAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";

class FakeCanvas {
  width = 64; height = 64; clientWidth = 64; clientHeight = 64;
  style = {}; dataset = {}; parentElement = null;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext(_kind?: string): unknown { return null; }
  addEventListener() {}
  removeEventListener() {}
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function contains(error: unknown, target: unknown): boolean {
  if (Object.is(error, target)) return true;
  if (error instanceof AggregateError && error.errors.some((entry) => contains(entry, target))) return true;
  return error instanceof Error && error.cause !== undefined && contains(error.cause, target);
}

function rejected(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => { throw new Error("Expected failure"); },
    (error: unknown) => error
  );
}

function controller(dispose: () => void, whenIdle: () => Promise<void>): WebGLRenderController {
  return { render() {}, dispose, whenIdle, diagnostics: () => undefined };
}

const apps: AuraApp[] = [];
function makeApp(value: WebGLRenderController, mount?: Promise<WebGLRenderController>): AuraApp {
  harness.queue.push({ controller: value, mount });
  const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
    scene: scene().add(primitives.box({ name: "first" })), autoStart: false, resize: false, diagnostics: false
  });
  apps.push(app);
  return app;
}

beforeEach(() => {
  harness.queue.length = 0;
  harness.hooks.length = 0;
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", {
    innerWidth: 64, innerHeight: 64, location: { search: "", href: "http://localhost/" },
    addEventListener() {}, removeEventListener() {}
  });
});

afterEach(async () => {
  for (const app of apps.splice(0)) await app.disposeAsync().catch(() => undefined);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("app controller retirement ordering", () => {
  it("calls whenIdle in the disposal stack and preserves both synchronous and asynchronous failures", async () => {
    const syncError = new Error("synchronous controller failure");
    const idleError = new Error("asynchronous idle failure");
    const firstIdle = deferred<void>();
    const events: string[] = [];
    let attempt = 0;
    const dispose = vi.fn(() => {
      attempt += 1;
      events.push(`dispose:${attempt}`);
      if (attempt === 1) throw syncError;
    });
    const whenIdle = vi.fn(() => {
      const observed = attempt;
      events.push(`idle:${observed}`);
      return observed === 1 ? firstIdle.promise : Promise.resolve();
    });
    const app = makeApp(controller(dispose, whenIdle));
    await app.readyStrict();
    const first = rejected(app.disposeAsync());
    expect(events).toEqual(["dispose:1", "idle:1"]);
    app.dispose();
    app.dispose();
    const simultaneous = app.disposeAsync();
    expect(events).toEqual(["dispose:1", "idle:1"]);
    firstIdle.reject(idleError);
    const firstError = await first;
    expect(contains(firstError, syncError)).toBe(true);
    expect(contains(firstError, idleError)).toBe(true);
    await simultaneous;
    expect(events).toEqual(["dispose:1", "idle:1", "dispose:2", "idle:2"]);
    await app.disposeAsync();
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  it("coalesces pending retries and skips them when the original cleanup succeeds", async () => {
    const idle = deferred<void>();
    const dispose = vi.fn();
    const whenIdle = vi.fn(() => idle.promise);
    const app = makeApp(controller(dispose, whenIdle));
    await app.readyStrict();
    const first = app.disposeAsync();
    app.dispose();
    app.dispose();
    const second = app.disposeAsync();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(whenIdle).toHaveBeenCalledTimes(1);
    idle.resolve();
    await Promise.all([first, second]);
    await app.disposeAsync();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(whenIdle).toHaveBeenCalledTimes(1);
  });

  it("does not recursively enqueue another retry when cleanup reenters dispose", async () => {
    const firstError = new Error("first retirement");
    const retryError = new Error("second retirement");
    let attempt = 0;
    let app!: AuraApp;
    const dispose = vi.fn(() => {
      attempt += 1;
      app.dispose();
      if (attempt === 1) throw firstError;
      if (attempt === 2) throw retryError;
    });
    app = makeApp(controller(dispose, () => Promise.resolve()));
    await app.readyStrict();
    const first = rejected(app.disposeAsync());
    app.dispose();
    const second = rejected(app.disposeAsync());
    expect(contains(await first, firstError)).toBe(true);
    const retryFailure = await second;
    expect(contains(retryFailure, firstError)).toBe(true);
    expect(contains(retryFailure, retryError)).toBe(true);
    for (let index = 0; index < 12; index += 1) await Promise.resolve();
    expect(dispose).toHaveBeenCalledTimes(2);
    await app.disposeAsync();
    expect(dispose).toHaveBeenCalledTimes(3);
  });

  it("captures a reentrant waiter registered before the first controller retirement", async () => {
    const error = new Error("terminal callback cleanup");
    let attempt = 0;
    const dispose = vi.fn(() => { if (++attempt === 1) throw error; });
    const whenIdle = vi.fn(() => attempt === 1 ? Promise.reject(error) : Promise.resolve());
    const app = makeApp(controller(dispose, whenIdle));
    await app.readyStrict();
    let nested: Promise<unknown> | undefined;
    app.onRenderTermination?.((event) => {
      if (event.state === "disposed") nested = rejected(app.disposeAsync());
    });
    const outer = rejected(app.disposeAsync());
    expect(nested).toBeDefined();
    expect(contains(await outer, error)).toBe(true);
    expect(contains(await nested!, error)).toBe(true);
    expect(dispose).toHaveBeenCalledTimes(1);
    await app.disposeAsync();
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  it("retains a failed superseded controller without letting stale callbacks replace the new one", async () => {
    const error = new Error("superseded cleanup");
    let oldAttempt = 0;
    const oldDispose = vi.fn(() => { if (++oldAttempt === 1) throw error; });
    const oldIdle = vi.fn(() => oldAttempt === 1 ? Promise.reject(error) : Promise.resolve());
    const old = controller(oldDispose, oldIdle);
    const app = makeApp(old);
    await app.readyStrict();
    const stale = harness.hooks[0]!;
    const nextDispose = vi.fn();
    const nextRender = vi.fn();
    const next: WebGLRenderController = {
      ...controller(nextDispose, () => Promise.resolve()), render: nextRender
    };
    harness.queue.push({ controller: next });
    app.setScene(scene().add(primitives.box({ name: "replacement" })));
    await app.readyStrict();
    for (let index = 0; index < 12; index += 1) await Promise.resolve();
    expect(oldDispose).toHaveBeenCalledTimes(1);
    stale.onRendererReady("webgl2", old);
    stale.onFirstFrame("webgl2");
    stale.onTerminalFrameFailure?.(new Error("stale frame"));
    stale.onDeviceLossDetected?.();
    app.step(0);
    expect(nextRender).toHaveBeenCalledTimes(1);
    expect(nextDispose).not.toHaveBeenCalled();
    expect(app.renderTermination?.()).toBeUndefined();

    app.dispose();
    expect(nextDispose).toHaveBeenCalledTimes(1);
    await app.disposeAsync();
    expect(oldDispose).toHaveBeenCalledTimes(2);
    expect(nextDispose).toHaveBeenCalledTimes(1);
    stale.onRendererReady("webgl2", old);
    await app.disposeAsync();
    expect(oldDispose).toHaveBeenCalledTimes(2);
    expect(nextDispose).toHaveBeenCalledTimes(1);
  });

  it("reports a non-retryable app sibling failure without repeating it", async () => {
    const dispose = vi.fn();
    const app = makeApp(controller(dispose, () => Promise.resolve()));
    await app.readyStrict();
    const error = new Error("registry cleanup failure");
    const nodesDispose = vi.spyOn(app.nodes as MutableAuraRuntimeNodeRegistry, "dispose")
      .mockImplementationOnce(() => { throw error; });
    expect(contains(await rejected(app.disposeAsync()), error)).toBe(true);
    expect(contains(await rejected(app.disposeAsync()), error)).toBe(true);
    expect(nodesDispose).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("survives a restore remount racing device loss, a late mount and disposal, then retries the failed resource", async () => {
    const restoreListeners = new Set<() => void>();
    const lossListeners = new Set<() => void>();
    const firstDispose = vi.fn();
    const first: WebGLRenderController = {
      ...controller(firstDispose, () => Promise.resolve()),
      onDeviceRestored: (listener: () => void) => { restoreListeners.add(listener); return () => restoreListeners.delete(listener); },
      onDeviceLost: (listener: () => void) => { lossListeners.add(listener); return () => lossListeners.delete(listener); }
    } as WebGLRenderController;
    const app = makeApp(first);
    await app.readyStrict();
    const appLoss = vi.fn();
    app.onDeviceLost(appLoss);
    const appRestored = vi.fn();
    app.onDeviceRestored(appRestored);
    expect(restoreListeners.size).toBeGreaterThan(0);
    // The restored context remounts through a mount that is still pending...
    const error = new Error("replacement cleanup failed");
    let attempt = 0;
    const replacementDispose = vi.fn(() => { if (++attempt === 1) throw error; });
    const replacement = controller(replacementDispose, () => attempt === 1 ? Promise.reject(error) : Promise.resolve());
    const replacementMount = deferred<WebGLRenderController>();
    harness.queue.push({ controller: replacement, mount: replacementMount.promise });
    for (const listener of [...restoreListeners]) listener();
    expect(harness.hooks).toHaveLength(2);
    expect(appRestored).toHaveBeenCalledTimes(1);
    const staleHooks = harness.hooks[0]!;
    // ...while the old mount reports a loss and the app is disposed.
    staleHooks.onDeviceLossDetected?.();
    for (const listener of [...lossListeners]) listener();
    expect(app.renderTermination?.()?.state).not.toBe("device-lost");
    const readiness = app.readiness({ stage: "first-frame" });
    const pending = rejected(app.disposeAsync());
    await expect(readiness).resolves.toMatchObject({ state: expect.stringMatching(/^(ready|disposed)$/) });
    expect(restoreListeners.size).toBe(0);
    // A restore or mount completion after disposal never remounts or resurrects.
    for (const listener of [...restoreListeners]) listener();
    replacementMount.resolve(replacement);
    expect(contains(await pending, error)).toBe(true);
    expect(harness.hooks).toHaveLength(2);
    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(replacementDispose).toHaveBeenCalledTimes(1);
    await expect(app.readiness()).resolves.toEqual({ state: "disposed" });
    // The failed resource stays owned and is retried exactly once more.
    await app.disposeAsync();
    expect(replacementDispose).toHaveBeenCalledTimes(2);
    await app.disposeAsync();
    expect(replacementDispose).toHaveBeenCalledTimes(2);
    expect(firstDispose).toHaveBeenCalledTimes(1);
  });

  it("does not lose a failed controller when a pending mount resolves after disposal", async () => {
    const error = new Error("late mount cleanup");
    let attempt = 0;
    const dispose = vi.fn(() => { if (++attempt === 1) throw error; });
    const value = controller(dispose, () => attempt === 1 ? Promise.reject(error) : Promise.resolve());
    const mount = deferred<WebGLRenderController>();
    const app = makeApp(value, mount.promise);
    const pending = rejected(app.disposeAsync());
    mount.resolve(value);
    expect(contains(await pending, error)).toBe(true);
    expect(dispose).toHaveBeenCalledTimes(1);
    await app.disposeAsync();
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  it("defers WebGPU canvas retirement across setScene and skips blanking unconfigure when the incoming scene reconfigures", async () => {
    const events: string[] = [];
    const gpuCtx = {
      configure: () => { events.push("configure"); },
      unconfigure: () => { events.push("unconfigure"); }
    };
    class WebGPUCanvas extends FakeCanvas {
      override getContext(kind?: string) {
        return kind === "webgpu" ? gpuCtx : null;
      }
    }
    const firstMount = deferred<WebGLRenderController>();
    const firstController: WebGLRenderController & { backend: "webgpu" } = {
      backend: "webgpu",
      render() {},
      pause: () => { events.push("pause:first"); },
      dispose: () => { events.push("dispose:first"); gpuCtx.unconfigure(); },
      whenIdle: () => { events.push("idle:first"); return Promise.resolve(); },
      diagnostics: () => undefined
    };
    const secondMount = deferred<WebGLRenderController>();
    const secondController: WebGLRenderController & { backend: "webgpu" } = {
      backend: "webgpu",
      render() {},
      pause: () => { events.push("pause:second"); },
      dispose: () => { events.push("dispose:second"); gpuCtx.unconfigure(); },
      whenIdle: () => { events.push("idle:second"); return Promise.resolve(); },
      diagnostics: () => undefined
    };

    harness.queue.push(
      { controller: firstController, onStart: () => gpuCtx.configure() },
      { controller: secondController, onStart: () => gpuCtx.configure() }
    );
    const canvas = new WebGPUCanvas();

    const app = createAuraApp(canvas as unknown as HTMLCanvasElement, {
      scene: scene().add(primitives.box({ name: "first" })), autoStart: false, resize: false, diagnostics: false
    });
    apps.push(app);
    await app.ready();
    events.length = 0;

    app.setScene(scene().add(primitives.sphere({ name: "second" })));
    await app.ready();

    expect(events).toContain("pause:first");
    expect(events).toContain("dispose:first");
    expect(events).toContain("configure");
    expect(events).not.toContain("unconfigure");

    // Final app disposal still calls unconfigure() cleanly because no replacement scene configures the swapchain.
    await app.disposeAsync();
    expect(events).toContain("dispose:second");
    expect(events).toContain("unconfigure");
  });
});
