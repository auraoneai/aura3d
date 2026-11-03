import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuraApp, createGameApp, primitives, scene } from "../../../packages/engine/src/index.js";
import { createGameApp as createV5GameApp } from "../../../packages/engine/src/public/v5.js";
import { auraAppRegistry } from "../../../packages/engine/src/agent-api/app/liveApps.js";
import { installWorkerRenderer } from "../../../packages/engine/src/agent-api/app/workerRuntime.js";
import type { AuraWorkerEndpoint, AuraWorkerInput, AuraWorkerRequest, AuraWorkerResponse } from "../../../packages/engine/src/agent-api/app/workerProtocol.js";
import type { AuraCreateGameAppOptions, AuraSceneSnapshot, WebGLSceneRenderer } from "../../../packages/engine/src/agent-api/nodes/types.js";

const mainMount = vi.hoisted(() => vi.fn());

vi.mock("../../../packages/engine/src/agent-api/app/frameLoop.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../packages/engine/src/agent-api/app/frameLoop.js")>();
  return {
    ...actual,
    startProductionRender: (...args: any[]) => {
      mainMount();
      const controller = {
        render: vi.fn(), renderAsync: vi.fn(async () => {}), dispose: vi.fn(),
        deviceLost: () => false, pause: vi.fn(), resume: vi.fn()
      };
      args[12].onRendererReady("webgl2", controller);
      args[12].onFirstFrame("webgl2");
      return Promise.resolve(controller);
    }
  };
});

class Target {
  readonly listeners = new Map<string, Set<(event: any) => void>>();
  addEventListener(type: string, listener: (event: any) => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: (event: any) => void) {
    this.listeners.get(type)?.delete(listener);
  }
  emit(type: string, values: Record<string, unknown> = {}) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener({ ...values, type });
  }
  count() {
    return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0);
  }
}

class Port extends Target {
  peer?: Port;
  sent: Array<AuraWorkerRequest | AuraWorkerResponse> = [];
  terminated = 0;
  postMessage(message: AuraWorkerRequest | AuraWorkerResponse) {
    this.sent.push(message);
    queueMicrotask(() => { if (!this.terminated) this.peer?.emit("message", { data: message }); });
  }
  terminate() { this.terminated += 1; }
}

class Canvas extends Target {
  width = 8;
  height = 4;
  clientWidth = 8;
  clientHeight = 4;
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  parentElement = null;
  offscreen = {
    width: 8,
    height: 4,
    convertToBlob: vi.fn(async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }))
  };
  transfer = vi.fn(() => this.offscreen as unknown as OffscreenCanvas);
  transferControlToOffscreen() { return this.transfer(); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 8, height: 4 }; }
  hasAttribute() { return true; }
  getContext() { return null; }
}

const makeScene = (name: string) => scene().add(primitives.box({ name }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function flush() {
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
}

function fixture(factory?: (snapshot: AuraSceneSnapshot) => Promise<WebGLSceneRenderer>) {
  const host = new Port();
  const remote = new Port();
  host.peer = remote;
  remote.peer = host;
  const canvas = new Canvas();
  const frames: Array<{ input?: AuraWorkerInput }> = [];
  const render = vi.fn((_time: number) => 3);
  let lost = false;
  let loss = () => {};
  let restore = () => {};
  const renderer = {
    backend: "webgl2", diagnostics: {}, render, resize: vi.fn(), resetTemporalHistory: vi.fn(),
    deviceLost: () => lost, viewProjection: () => new Float32Array(16), dispose: vi.fn(),
    onDeviceLost: (listener: () => void) => { loss = listener; return () => { loss = () => {}; }; },
    onDeviceRestored: (listener: () => void) => { restore = listener; return () => { restore = () => {}; }; }
  } as unknown as WebGLSceneRenderer;
  const stop = installWorkerRenderer(remote as unknown as AuraWorkerEndpoint<AuraWorkerRequest, AuraWorkerResponse>, {
    createRenderer: async (_canvas, snapshot) => factory ? factory(snapshot) : renderer,
    onFrame: (frame) => { frames.push(frame); }
  });
  const createWorker = vi.fn(() => host as unknown as Worker);
  return {
    host, remote, canvas, renderer, render, frames, stop, createWorker,
    lose: () => { lost = true; loss(); },
    restore: () => { lost = false; restore(); }
  };
}

beforeEach(() => {
  mainMount.mockClear();
  vi.stubGlobal("HTMLCanvasElement", Canvas);
  vi.stubGlobal("window", Object.assign(new Target(), {
    innerWidth: 8, innerHeight: 4, devicePixelRatio: 1, location: { search: "", href: "http://localhost/" }
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("createAuraApp worker integration", () => {
  it.each([
    ["4.x", "error", createGameApp],
    ["4.x", "main-thread", createGameApp],
    ["v5", "error", createV5GameApp],
    ["v5", "main-thread", createV5GameApp]
  ] as const)("rejects %s createGameApp worker mode with %s fallback before acquiring anything", async (_entry, fallback, createGame) => {
    const f = fixture();
    const before = new Set(auraAppRegistry.all());
    let failure: unknown;
    try {
      createGame(f.canvas as unknown as HTMLCanvasElement, {
        scene: makeScene("game-worker"), autoStart: false,
        worker: { createWorker: f.createWorker, fallback }
      } as unknown as AuraCreateGameAppOptions);
    } catch (error) {
      failure = error;
    }
    const leaked = auraAppRegistry.all().filter((app) => !before.has(app));
    const observed = {
      factoryCalls: f.createWorker.mock.calls.length,
      transfers: f.canvas.transfer.mock.calls.length,
      registeredApps: leaked.length,
      canvasListeners: f.canvas.count()
    };
    await Promise.all(leaked.map((app) => app.disposeAsync()));
    await f.stop();
    expect(observed).toEqual({ factoryCalls: 0, transfers: 0, registeredApps: 0, canvasListeners: 0 });
    expect(failure).toMatchObject({
      name: "AuraWorkerError",
      code: "worker-unsupported",
      message: expect.stringMatching(/createGameApp.*worker.*(createAuraApp|main.thread)/i)
    });
  });

  it("rejects a worker option revealed by an accessor when copying game options", async () => {
    const f = fixture();
    const before = new Set(auraAppRegistry.all());
    let reads = 0;
    let failure: unknown;
    try {
      createGameApp(f.canvas as unknown as HTMLCanvasElement, {
        scene: makeScene("changing-worker"), autoStart: false,
        get worker() {
          reads += 1;
          return reads === 1 ? undefined : { createWorker: f.createWorker };
        }
      } as unknown as AuraCreateGameAppOptions);
    } catch (error) {
      failure = error;
    }
    const leaked = auraAppRegistry.all().filter((app) => !before.has(app));
    const observed = {
      factoryCalls: f.createWorker.mock.calls.length,
      transfers: f.canvas.transfer.mock.calls.length,
      registeredApps: leaked.length
    };
    await Promise.all(leaked.map((app) => app.disposeAsync()));
    await f.stop();
    expect(observed).toEqual({ factoryCalls: 0, transfers: 0, registeredApps: 0 });
    expect(failure).toMatchObject({ name: "AuraWorkerError", code: "worker-unsupported" });
  });

  it("rejects game worker mode before evaluating unrelated option getters", () => {
    const canvas = new Canvas();
    const createWorker = vi.fn();
    let workerReads = 0;
    const options = {
      get worker() {
        workerReads += 1;
        return { createWorker };
      },
      get scene(): never { throw new Error("scene should not be inspected"); }
    } as unknown as AuraCreateGameAppOptions;
    expect(() => createGameApp(canvas as unknown as HTMLCanvasElement, options)).toThrow(/createGameApp.*worker/i);
    expect(workerReads).toBe(1);
    expect(createWorker).not.toHaveBeenCalled();
    expect(canvas.transfer).not.toHaveBeenCalled();
    expect(canvas.count()).toBe(0);
  });

  it.each([null, false, 0, ""] as const)("rejects malformed JavaScript game worker option %s", (worker) => {
    expect(() => createGameApp(null, {
      scene: makeScene("invalid-game-worker"), autoStart: false, worker
    } as unknown as AuraCreateGameAppOptions)).toThrow(/createGameApp.*worker/i);
  });

  it("keeps an explicitly undefined game worker on the legacy main-thread path", () => {
    const game = createGameApp(null, {
      scene: makeScene("main-thread-game"), autoStart: false, worker: undefined
    } as unknown as AuraCreateGameAppOptions);
    try {
      game.step(0.25);
      expect(game.app.execution?.active).not.toBe("worker");
      expect(game.app.runtime.frame).toBeGreaterThan(0);
    } finally {
      game.dispose();
    }
  });

  it("preflights a real worker before settling an earlier registered main-thread app", async () => {
    const f = fixture();
    const main = createAuraApp(null, { scene: makeScene("registry-main"), autoStart: false });
    const worker = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: makeScene("registry-worker"), autoStart: false, worker: { createWorker: f.createWorker }
    });
    try {
      main.step(0.5);
      await worker.readyStrict();
      await worker.stepAsync(0.125);
      const beforeMain = { ...main.runtime };
      const beforeWorker = { ...worker.runtime };
      let failure: unknown;
      try { auraAppRegistry.settle(2, 0.25); } catch (error) { failure = error; }
      expect(main.runtime).toEqual(beforeMain);
      expect(worker.runtime).toEqual(beforeWorker);
      expect(f.frames).toHaveLength(1);
      expect(failure).toMatchObject({ message: expect.stringMatching(/settle.*worker.*stepAsync/i) });
    } finally {
      main.dispose();
      await worker.disposeAsync();
      await f.stop();
    }
  });

  it("settles an actual worker-requested app when it fell back to the main thread", async () => {
    const canvas = new Canvas();
    Object.defineProperty(canvas, "transferControlToOffscreen", { value: undefined });
    const app = createAuraApp(canvas as unknown as HTMLCanvasElement, {
      scene: makeScene("registry-fallback"), autoStart: false,
      worker: { createWorker: vi.fn(), fallback: "main-thread" }
    });
    try {
      await app.readyStrict();
      expect(app.execution).toMatchObject({ requested: "worker", active: "main-thread" });
      app.step(0.5);
      expect(auraAppRegistry.settle(3, 0.25)).toBe(1);
      expect(app.runtime).toMatchObject({ paused: true, frame: 3, time: 0.75 });
      expect(canvas.transfer).not.toHaveBeenCalled();
    } finally {
      await app.disposeAsync();
    }
  });

  it("uses a worker for the root app and settles first-frame readiness only after a submission", async () => {
    const f = fixture();
    const app = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: makeScene("first"), autoStart: false, diagnostics: false,
      worker: { createWorker: f.createWorker }
    });
    expect(app.execution).toEqual({ requested: "worker", active: "worker" });
    expect(f.canvas.transfer).toHaveBeenCalledTimes(1);
    expect(mainMount).not.toHaveBeenCalled();
    expect(app.backend).toBe("headless");
    await expect(app.readiness()).resolves.toEqual({ state: "ready", stage: "renderer", backend: "webgl2" });
    expect(app.backend).toBe("webgl2");
    const first = app.readiness({ stage: "first-frame" });
    let finished = false;
    void first.then(() => { finished = true; });
    await flush();
    expect(finished).toBe(false);
    await app.stepAsync(0.25);
    await expect(first).resolves.toEqual({ state: "ready", stage: "first-frame", backend: "webgl2" });
    expect(app.runtime).toMatchObject({ paused: true, frame: 1, time: 0.25 });
    expect(f.render).toHaveBeenCalledOnce();
    expect(() => app.step()).toThrow(/stepAsync/);
    expect(() => app.screenshot()).toThrow(/screenshotAsync/);
    expect(() => app.onFrame(() => {})).toThrow(/worker/i);
    await expect(app.screenshotAsync!()).resolves.toMatchObject({ dataUrl: "data:image/png;base64,iVBORw==", width: 8, height: 4 });
    expect(app.runtime.frame).toBe(1);
    await app.disposeAsync();
    expect(f.host.terminated).toBe(1);
    expect([f.host.count(), f.remote.count(), f.canvas.count()]).toEqual([0, 0, 0]);
  });

  it("waits for an automatic asynchronous submission before reporting its first frame", async () => {
    let next = 0;
    const callbacks = new Map<number, (time: number) => void>();
    vi.stubGlobal("requestAnimationFrame", (callback: (time: number) => void) => {
      const id = ++next;
      callbacks.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => { callbacks.delete(id); });
    const f = fixture();
    const submitted = deferred<number>();
    const renderAsync = vi.fn(() => submitted.promise);
    Object.assign(f.renderer, { renderAsync });
    const app = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: makeScene("automatic"), worker: { createWorker: f.createWorker }
    });
    await app.readyStrict();
    const first = app.readiness({ stage: "first-frame" });
    let settled = false;
    void first.then(() => { settled = true; });
    const scheduled = callbacks.entries().next().value as [number, (time: number) => void];
    expect(scheduled).toBeDefined();
    callbacks.delete(scheduled[0]);
    scheduled[1](100);
    await flush();
    expect(renderAsync).toHaveBeenCalledOnce();
    expect(settled).toBe(false);
    submitted.resolve(3);
    await expect(first).resolves.toEqual({ state: "ready", stage: "first-frame", backend: "webgl2" });
    expect(app.runtime).toMatchObject({ frame: 1, time: 0 });
    app.pause();
    await app.disposeAsync();
    expect(callbacks.size).toBe(0);
  });

  it("chooses failure or explicit main-thread fallback before transferring ownership", async () => {
    const canvas = new Canvas();
    Object.defineProperty(canvas, "transferControlToOffscreen", { value: undefined });
    const factory = vi.fn();
    expect(() => createAuraApp(canvas as unknown as HTMLCanvasElement, {
      scene: makeScene("missing"), worker: { createWorker: factory }
    })).toThrow(/worker|offscreen/i);
    expect(factory).not.toHaveBeenCalled();
    const app = createAuraApp(canvas as unknown as HTMLCanvasElement, {
      scene: makeScene("fallback"), autoStart: false, worker: { createWorker: factory, fallback: "main-thread" }
    });
    expect(app.execution).toMatchObject({ requested: "worker", active: "main-thread" });
    expect(factory).not.toHaveBeenCalled();
    expect(canvas.transfer).not.toHaveBeenCalled();
    await app.ready();
    expect(mainMount).toHaveBeenCalledOnce();
    await app.disposeAsync();
  });

  it("rejects malformed worker endpoints before transfer and closes a partially valid endpoint", async () => {
    const canvas = new Canvas();
    const terminate = vi.fn();
    const invalid = {
      postMessage: "invalid",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      terminate
    };
    const app = createAuraApp(canvas as unknown as HTMLCanvasElement, {
      scene: makeScene("invalid-endpoint"), autoStart: false,
      worker: { createWorker: () => invalid as unknown as Worker, fallback: "main-thread" }
    });
    expect(app.execution).toMatchObject({ active: "main-thread", fallbackReason: expect.stringContaining("invalid-worker") });
    expect(terminate).toHaveBeenCalledOnce();
    expect(canvas.transfer).not.toHaveBeenCalled();
    await app.ready();
    await app.disposeAsync();

    const withoutTerminate = { ...invalid, postMessage: vi.fn(), terminate: undefined };
    expect(() => createAuraApp(canvas as unknown as HTMLCanvasElement, {
      scene: makeScene("unterminable-endpoint"),
      worker: { createWorker: () => withoutTerminate as unknown as Worker }
    })).toThrow(/dedicated worker/i);
    expect(canvas.transfer).not.toHaveBeenCalled();
  });

  it("rejects unsupported host callbacks before constructing or transferring a worker", async () => {
    const f = fixture();
    expect(() => createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: makeScene("callback"), onAssetProgress: () => {},
      worker: { createWorker: f.createWorker }
    })).toThrow(/onAssetProgress.*worker/i);
    expect(f.createWorker).not.toHaveBeenCalled();
    expect(f.canvas.transfer).not.toHaveBeenCalled();
    await f.stop();
  });

  it("rejects scene-owned diagnostics and physics instead of silently omitting them", async () => {
    const f = fixture();
    const overlay = makeScene("overlay").diagnostics(true);
    expect(() => createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: overlay, worker: { createWorker: f.createWorker }
    })).toThrow(/diagnostics overlay/i);
    const withPhysics = { ...makeScene("physics").toJSON(), physics: { kind: "aura-physics-world" } } as unknown as AuraSceneSnapshot;
    expect(() => createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: withPhysics, worker: { createWorker: f.createWorker }
    })).toThrow(/scene physics/i);
    expect(f.createWorker).not.toHaveBeenCalled();
    expect(f.canvas.transfer).not.toHaveBeenCalled();
    const app = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: makeScene("plain"), autoStart: false, worker: { createWorker: f.createWorker }
    });
    await app.readyStrict();
    expect(() => app.setScene(overlay)).toThrow(/diagnostics overlay/i);
    expect(() => app.setScene(withPhysics)).toThrow(/scene physics/i);
    expect(app.scene.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ name: "plain" })]));
    await app.disposeAsync();
  });

  it("serializes scene, pause, manual step and capture without treating a remount as a first frame", async () => {
    const next = deferred<WebGLSceneRenderer>();
    const f = fixture(async (snapshot) => snapshot.nodes.some((node) => "name" in node && node.name === "second") ? next.promise : f.renderer);
    const app = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: makeScene("first"), autoStart: false, worker: { createWorker: f.createWorker }
    });
    await app.readyStrict();
    const oldFrame = app.readiness({ stage: "first-frame" });
    app.resume();
    app.setScene(makeScene("second"));
    await expect(oldFrame).resolves.toEqual({ state: "superseded" });
    const newFrame = app.readiness({ stage: "first-frame" });
    app.pause();
    const step = app.stepAsync(0.5);
    const image = app.screenshotAsync!();
    await flush();
    expect(f.render).not.toHaveBeenCalled();
    next.resolve(f.renderer);
    await step;
    await expect(newFrame).resolves.toMatchObject({ state: "ready", stage: "first-frame", backend: "webgl2" });
    await expect(image).resolves.toMatchObject({ width: 8, height: 4 });
    expect(f.render.mock.calls.map(([time]) => time)).toEqual([500, 500]);
    expect(f.host.sent.map((message) => message.type)).toEqual(expect.arrayContaining(["scene", "pause", "frame", "screenshot"]));
    await app.disposeAsync();
  });

  it("mounts the indexed worker-render capability scenario in the render worker without main-thread fallback", async () => {
    const { mountNativeCapabilityScenario } = await import("../../../examples/native-capabilities/index.js");
    const mounted: AuraSceneSnapshot[] = [];
    let f!: ReturnType<typeof fixture>;
    f = fixture(async (snapshot) => { mounted.push(snapshot); return f.renderer; });
    const asset = { kind: "model", url: "/aura-assets/subject.glb", format: "glb", hash: `sha256-${"a".repeat(64)}` } as never;
    const app = await mountNativeCapabilityScenario("worker-render", {
      target: f.canvas as unknown as HTMLCanvasElement, asset, autoStart: false, createWorker: f.createWorker
    });
    try {
      expect(f.createWorker).toHaveBeenCalledOnce();
      expect(app.execution).toMatchObject({ requested: "worker", active: "worker" });
      expect(mainMount).not.toHaveBeenCalled();
      expect(JSON.stringify(mounted[0]?.nodes)).toContain("\"subject\"");
    } finally { await app.disposeAsync(); }
  });

  it("publishes a replacement snapshot only after the worker acknowledges it", async () => {
    const next = deferred<WebGLSceneRenderer>();
    const f = fixture(async (snapshot) => snapshot.nodes.some((node) => "name" in node && node.name === "second") ? next.promise : f.renderer);
    const app = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: makeScene("first"), autoStart: false, worker: { createWorker: f.createWorker }
    });
    await app.readyStrict();
    const named = () => app.scene.nodes.flatMap((node) => "name" in node && node.name ? [node.name] : []);
    expect(named()).toContain("first");
    app.setScene(makeScene("second"));
    await flush();
    expect(named()).toContain("first");
    expect(named()).not.toContain("second");
    next.resolve(f.renderer);
    await app.readyStrict();
    expect(named()).toContain("second");
    expect(named()).not.toContain("first");
    await app.disposeAsync();
  });

  it("does not let a reentrant supersession mount an older scene after the newest one", async () => {
    const mounted: string[] = [];
    let f!: ReturnType<typeof fixture>;
    f = fixture(async (snapshot) => {
      const named = snapshot.nodes.find((node) => "name" in node && node.name);
      mounted.push(named && "name" in named ? String(named.name) : "");
      return f.renderer;
    });
    const app = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: makeScene("first"), autoStart: false, worker: { createWorker: f.createWorker }
    });
    await app.readyStrict();
    const oldFrame = app.readiness({ stage: "first-frame" });
    let replaced = false;
    app.onRenderTermination!((event) => {
      if (event.state === "superseded" && !replaced) {
        replaced = true;
        app.setScene(makeScene("latest"));
      }
    });
    app.setScene(makeScene("intermediate"));
    await expect(oldFrame).resolves.toEqual({ state: "superseded" });
    await app.readyStrict();
    await app.stepAsync(0);
    expect(mounted).toEqual(["first", "latest"]);
    expect(app.scene.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ name: "latest" })]));
    await app.disposeAsync();
  });

  it("forwards quick keyboard edges and exposes host input without inventing a worker callback", async () => {
    const f = fixture();
    const app = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: makeScene("input"), autoStart: false, worker: { createWorker: f.createWorker }
    });
    await app.readyStrict();
    const page = globalThis.window as unknown as Target;
    const input = app.input({ actions: { jump: ["Space"] }, pointer: false });
    page.emit("keydown", { code: "Space", key: " ", timeStamp: 10, repeat: false });
    page.emit("keyup", { code: "Space", key: " ", timeStamp: 11, repeat: false });
    await app.stepAsync(0.1);
    expect(f.frames.at(-1)?.input).toMatchObject({
      keys: [],
      keyEvents: [{ phase: "down", code: "Space" }, { phase: "up", code: "Space" }]
    });
    expect(input.update(0.1).actions.jump).toMatchObject({ pressed: true, held: false });
    expect(app.workerInput!()).toMatchObject({ keys: [], pointers: [] });
    await app.disposeAsync();
    expect(page.count()).toBe(0);
  });

  it("forwards pointer coordinates and preserves independent host input snapshots", async () => {
    const f = fixture();
    const app = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: makeScene("pointer"), autoStart: false, worker: { createWorker: f.createWorker }
    });
    await app.readyStrict();
    f.canvas.emit("pointerdown", { pointerId: 7, pointerType: "mouse", clientX: 4, clientY: 2, buttons: 1, pressure: 0.5, timeStamp: 10 });
    await app.stepAsync(0);
    expect(f.frames.at(-1)?.input).toMatchObject({
      pointers: [{ id: 7, x: 4, y: 2, buttons: 1 }],
      pointerEvents: [{ phase: "down", pointer: { id: 7, x: 4, y: 2 } }]
    });
    const first = app.workerInput!();
    Object.assign(first.pointers[0]!, { x: -1 });
    expect(app.workerInput!().pointers[0]?.x).toBe(4);
    f.canvas.emit("pointerup", { pointerId: 7, pointerType: "mouse", clientX: 5, clientY: 3, buttons: 0, pressure: 0, timeStamp: 11 });
    await app.stepAsync(0);
    expect(f.frames.at(-1)?.input).toMatchObject({ pointers: [], pointerEvents: [{ phase: "up", pointer: { id: 7 } }] });
    await app.disposeAsync();
    expect(f.canvas.count()).toBe(0);
  });

  it("fences a manual frame behind the latest input even if an earlier input is awaiting acknowledgement", async () => {
    const f = fixture();
    const app = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: makeScene("input-fence"), autoStart: false, worker: { createWorker: f.createWorker }
    });
    await app.readyStrict();
    const page = globalThis.window as unknown as Target;
    const send = f.remote.postMessage.bind(f.remote);
    let held: AuraWorkerResponse | undefined;
    f.remote.postMessage = (message) => {
      if (message.type === "result" && message.id === 2 && !held) { held = message; return; }
      send(message);
    };
    page.emit("keydown", { code: "KeyA", timeStamp: 10, repeat: false });
    await flush();
    expect(held).toBeDefined();
    page.emit("keyup", { code: "KeyA", timeStamp: 11, repeat: false });
    const step = app.stepAsync(0);
    await flush();
    expect(f.host.sent.some((message) => message.type === "frame")).toBe(false);
    send(held!);
    await step;
    expect(f.frames.at(-1)?.input).toMatchObject({
      keys: [], keyEvents: [{ phase: "down", code: "KeyA" }, { phase: "up", code: "KeyA" }]
    });
    await app.disposeAsync();
  });

  it("reports worker mount failure instead of attempting fallback after transfer", async () => {
    const f = fixture(async () => { throw Object.assign(new Error("mount broke"), { code: "mount-broke" }); });
    const app = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: makeScene("failure"), autoStart: false,
      worker: { createWorker: f.createWorker, fallback: "main-thread" }
    });
    await expect(app.readiness()).resolves.toMatchObject({ state: "failed" });
    expect(mainMount).not.toHaveBeenCalled();
    expect(f.canvas.transfer).toHaveBeenCalledOnce();
    await expect(app.stepAsync()).rejects.toThrow();
    await app.disposeAsync();
  });

  it("falls back on factory or scene clone failures only before transfer", async () => {
    const canvas = new Canvas();
    const app = createAuraApp(canvas as unknown as HTMLCanvasElement, {
      scene: makeScene("factory"), autoStart: false,
      worker: { createWorker: () => { throw new Error("module worker unavailable"); }, fallback: "main-thread" }
    });
    expect(app.execution).toMatchObject({ active: "main-thread", fallbackReason: expect.stringContaining("module worker unavailable") });
    expect(canvas.transfer).not.toHaveBeenCalled();
    await app.disposeAsync();

    const f = fixture();
    const noncloneable = { ...makeScene("clone").toJSON(), callback: () => undefined } as AuraSceneSnapshot;
    const cloneFallback = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: noncloneable, autoStart: false, worker: { createWorker: f.createWorker, fallback: "main-thread" }
    });
    expect(cloneFallback.execution).toMatchObject({ active: "main-thread" });
    expect(f.canvas.transfer).not.toHaveBeenCalled();
    expect(f.host.terminated).toBe(1);
    await cloneFallback.disposeAsync();
    await f.stop();
  });

  it("does not fall back when event bridge installation fails after transfer", async () => {
    const f = fixture();
    const add = f.canvas.addEventListener.bind(f.canvas);
    f.canvas.addEventListener = (type, listener) => {
      if (type === "pointerdown") throw new Error("listener unavailable");
      add(type, listener);
    };
    expect(() => createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: makeScene("listener"), worker: { createWorker: f.createWorker, fallback: "main-thread" }
    })).toThrow(/listener unavailable/);
    expect(f.canvas.transfer).toHaveBeenCalledOnce();
    expect(mainMount).not.toHaveBeenCalled();
    expect(f.host.terminated).toBe(1);
    await f.stop();
  });

  it("reports device loss and requires a new presented frame after restoration", async () => {
    const f = fixture();
    const app = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: makeScene("loss"), autoStart: false, worker: { createWorker: f.createWorker }
    });
    await app.readyStrict();
    const first = app.readiness({ stage: "first-frame" });
    const events: string[] = [];
    app.onDeviceLost(() => { events.push("lost"); });
    app.onDeviceRestored(() => { events.push("restored"); });
    f.lose();
    await flush();
    await expect(first).resolves.toMatchObject({ state: "failed", code: "device-lost" });
    expect(app.deviceLost()).toBe(true);
    f.restore();
    await flush();
    expect(events).toEqual(["lost", "restored"]);
    await expect(app.readiness()).resolves.toMatchObject({ state: "ready", backend: "webgl2" });
    const restoredFrame = app.readiness({ stage: "first-frame" });
    await app.stepAsync(0);
    await expect(restoredFrame).resolves.toMatchObject({ state: "ready", stage: "first-frame" });
    await app.disposeAsync();
  });

  it("settles readiness on a device loss discovered by capture and rejects scene replacement while lost", async () => {
    const f = fixture();
    const app = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: makeScene("loss-without-event"), autoStart: false, worker: { createWorker: f.createWorker }
    });
    await app.readyStrict();
    const first = app.readiness({ stage: "first-frame" });
    Object.assign(f.renderer, { deviceLost: () => true });
    await expect(app.screenshotAsync!()).rejects.toMatchObject({ code: "device-lost", severity: "recoverable" });
    await expect(first).resolves.toMatchObject({ state: "failed", code: "device-lost" });
    expect(app.deviceLost()).toBe(true);
    expect(() => app.setScene(makeScene("replacement"))).toThrow(/device is lost/i);
    await app.disposeAsync();
  });

  it("settles a failed recovery even when the previous renderer is restored first", async () => {
    let mounts = 0;
    let f!: ReturnType<typeof fixture>;
    f = fixture(async () => {
      mounts += 1;
      if (mounts === 2) throw new Error("recovery mount failed");
      if (mounts === 3) f.restore();
      return f.renderer;
    });
    const app = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: makeScene("recovery"), autoStart: false, worker: { createWorker: f.createWorker }
    });
    await app.readyStrict();
    f.lose();
    await flush();
    await expect(app.recoverWorker!()).rejects.toMatchObject({ code: "worker-render", severity: "recoverable" });
    expect(app.deviceLost()).toBe(false);
    await expect(app.readiness()).resolves.toMatchObject({ state: "failed", code: "worker-render" });
    app.setScene(makeScene("after-recovery"));
    await app.readyStrict();
    await app.stepAsync(0);
    await app.disposeAsync();
  });

  it("settles first-frame readiness when a capture submission fails terminally", async () => {
    const f = fixture();
    const app = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: makeScene("capture-failure"), autoStart: false, worker: { createWorker: f.createWorker }
    });
    await app.readyStrict();
    const first = app.readiness({ stage: "first-frame" });
    const terminations: string[] = [];
    app.onRenderTermination!((event) => { terminations.push(event.state); });
    Object.assign(f.renderer, { render: () => { throw new Error("capture submission failed"); } });
    await expect(app.screenshotAsync!()).rejects.toMatchObject({ code: "worker-render", severity: "terminal" });
    await expect(first).resolves.toMatchObject({ state: "failed", code: "worker-render", message: "capture submission failed" });
    expect(terminations).toEqual(["failed"]);
    await app.disposeAsync();
    await f.stop();
  });

  it("rejects malformed frame results rather than marking a frame ready", async () => {
    const f = fixture();
    const send = f.remote.postMessage.bind(f.remote);
    f.remote.postMessage = (message) => {
      if (message.type === "result" && message.result) {
        send({ ...message, result: { ...message.result, drawCalls: Number.NaN } });
      } else send(message);
    };
    const app = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: makeScene("bad-result"), autoStart: false, worker: { createWorker: f.createWorker }
    });
    await app.readyStrict();
    const first = app.readiness({ stage: "first-frame" });
    await expect(app.stepAsync(0)).rejects.toMatchObject({ code: "invalid-response" });
    await expect(first).resolves.toMatchObject({ state: "failed", code: "invalid-response" });
    expect(app.runtime.frame).toBe(0);
    await app.disposeAsync();
  });

  it("treats a completed asynchronous capture as a first frame without advancing runtime", async () => {
    const f = fixture();
    const app = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: makeScene("capture"), autoStart: false, worker: { createWorker: f.createWorker }
    });
    await app.readyStrict();
    const first = app.readiness({ stage: "first-frame" });
    await app.screenshotAsync!();
    await expect(first).resolves.toMatchObject({ state: "ready", stage: "first-frame" });
    expect(app.runtime).toMatchObject({ frame: 0, time: 0 });
    await app.disposeAsync();
  });

  it("reports a submitted capture even when PNG encoding fails, but not when capture is unavailable", async () => {
    const f = fixture();
    const app = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: makeScene("capture-readiness"), autoStart: false, worker: { createWorker: f.createWorker }
    });
    await app.readyStrict();
    const first = app.readiness({ stage: "first-frame" });
    let settled = false;
    void first.then(() => { settled = true; });
    const convert = f.canvas.offscreen.convertToBlob;
    Object.assign(f.canvas.offscreen, { convertToBlob: undefined });
    await expect(app.screenshotAsync!()).rejects.toMatchObject({ code: "screenshot-unavailable" });
    await flush();
    expect(settled).toBe(false);
    expect(f.render).not.toHaveBeenCalled();
    Object.assign(f.canvas.offscreen, { convertToBlob: convert });
    convert.mockRejectedValueOnce(new Error("PNG encoder failed"));
    await expect(app.screenshotAsync!()).rejects.toMatchObject({ code: "screenshot-failed" });
    await expect(first).resolves.toMatchObject({ state: "ready", stage: "first-frame", backend: "webgl2" });
    expect(app.runtime).toMatchObject({ frame: 0, time: 0 });
    expect(f.render).toHaveBeenCalledOnce();
    await app.disposeAsync();
  });

  it("settles pending readiness on disposal and retires a renderer that mounts late", async () => {
    const mount = deferred<WebGLSceneRenderer>();
    const f = fixture(async () => mount.promise);
    const app = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: makeScene("late"), autoStart: false, worker: { createWorker: f.createWorker }
    });
    const readiness = app.readiness();
    await flush();
    const closing = app.disposeAsync();
    await expect(readiness).resolves.toEqual({ state: "disposed" });
    mount.resolve(f.renderer);
    await closing;
    expect(f.renderer.dispose).toHaveBeenCalledOnce();
    expect(f.host.terminated).toBe(1);
    expect([f.host.count(), f.remote.count(), f.canvas.count()]).toEqual([0, 0, 0]);
  });

  it("reports both host-input and worker-renderer cleanup failures on strict disposal", async () => {
    const f = fixture();
    const app = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: makeScene("cleanup"), autoStart: false, worker: { createWorker: f.createWorker }
    });
    await app.readyStrict();
    const input = app.input({ actions: {}, autoListen: false });
    const hostFailure = new Error("input cleanup failed");
    Object.assign(input, { dispose: () => { throw hostFailure; } });
    Object.assign(f.renderer, { dispose: () => { throw new Error("renderer cleanup failed"); } });
    const failure = await app.disposeAsync().then(() => undefined, (error: unknown) => error);
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toHaveLength(2);
    expect((failure as AggregateError).errors).toContain(hostFailure);
    await expect(app.disposeAsync()).rejects.toBe(failure);
    expect([f.host.terminated, f.host.count(), f.remote.count(), f.canvas.count()]).toEqual([1, 0, 0, 0]);
  });
});
