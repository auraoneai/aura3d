import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ mounts: [] as any[] }));

vi.mock("../../../packages/engine/src/agent-api/app/frameLoop", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../packages/engine/src/agent-api/app/frameLoop")>();
  return {
    ...actual,
    startProductionRender: (...args: any[]) => new Promise((resolve, reject) => {
      harness.mounts.push({ snapshot: args[1], options: args[3], readiness: args[12], signal: args[13], resolve, reject });
    })
  };
});

import { createAuraApp, primitives, scene } from "../../../packages/engine/src";

class FakeCanvas {
  width = 64; height = 64; style: Record<string, string> = {}; dataset: Record<string, string> = {}; parentElement = null;
  clientWidth = 64; clientHeight = 64;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function makeController(idle: Promise<void> = Promise.resolve()) {
  const lostListeners = new Set<() => void>();
  const restoredListeners = new Set<() => void>();
  let lost = false;
  const controller = {
    render: vi.fn(), dispose: vi.fn(), whenIdle: vi.fn(() => idle), busy: () => false,
    onDeviceLost(listener: () => void) { lostListeners.add(listener); return () => { lostListeners.delete(listener); }; },
    onDeviceRestored(listener: () => void) { restoredListeners.add(listener); return () => { restoredListeners.delete(listener); }; },
    deviceLost: () => lost,
    lose() { lost = true; for (const listener of [...lostListeners]) listener(); },
    markLost() { lost = true; },
    restore() { lost = false; for (const listener of [...restoredListeners]) listener(); }
  };
  return controller;
}

const makeScene = (name: string) => scene().add(primitives.box({ name }).runtime({ id: name }));
const makeApp = (backend: "webgpu" | "webgl2" | "auto" = "webgpu") => createAuraApp(
  new FakeCanvas() as unknown as HTMLCanvasElement,
  { scene: makeScene("initial"), renderer: { backend }, autoStart: false, resize: false, diagnostics: false }
);
const flush = async () => { for (let i = 0; i < 32; i += 1) await Promise.resolve(); };
function readyMount(index: number, controller = makeController(), backend: "webgpu" | "webgl2" = "webgpu") {
  const mount = harness.mounts[index]!;
  mount.readiness.onRendererReady(backend, controller);
  mount.readiness.onFirstFrame(backend);
  mount.resolve(controller);
  return controller;
}

beforeEach(() => {
  harness.mounts.length = 0;
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { search: "", href: "http://localhost/" }, addEventListener() {}, removeEventListener() {} });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("WebGPU app device recovery", () => {
  it("waits for the old renderer and reports restoration only after a replacement frame", async () => {
    const app = makeApp("auto");
    const events: string[] = [];
    app.onDeviceLost(() => events.push("lost"));
    app.onDeviceRestored(() => events.push(`restored:${app.deviceLost()}`));
    const idle = deferred();
    const old = readyMount(0, makeController(idle.promise));
    await app.ready();
    const node = app.nodes.require("initial");
    node.setPosition(2, 3, 4);
    old.lose();
    expect(events).toEqual(["lost"]);
    expect(app.deviceLost()).toBe(true);
    await flush();
    expect(old.dispose).toHaveBeenCalledTimes(1);
    expect(harness.mounts).toHaveLength(1);
    idle.resolve();
    await flush();
    expect(harness.mounts).toHaveLength(2);
    expect(harness.mounts[1].options.renderer).toMatchObject({ backend: "webgpu", allowFallback: false });
    const replacement = makeController();
    harness.mounts[1].readiness.onRendererReady("webgpu", replacement);
    expect(app.deviceLost()).toBe(true);
    expect(events).toEqual(["lost"]);
    harness.mounts[1].readiness.onFirstFrame("webgpu");
    expect(events).toEqual(["lost", "restored:false"]);
    expect(app.deviceLost()).toBe(false);
    expect(app.nodes.require("initial")).toBe(node);
    expect(node.snapshot().position).toEqual([2, 3, 4]);
    harness.mounts[1].readiness.onFirstFrame("webgpu");
    expect(events).toHaveLength(2);
    harness.mounts[1].resolve(replacement);
    await app.ready();
    app.dispose();
  });

  it("lets a loss listener replace the scene without a duplicate automatic mount", async () => {
    const app = makeApp();
    const old = readyMount(0);
    await app.ready();
    const events: string[] = [];
    app.onDeviceLost(() => { events.push("lost"); app.setScene(makeScene("replacement")); });
    app.onDeviceRestored(() => events.push("restored"));
    old.lose();
    await flush();
    expect(harness.mounts).toHaveLength(2);
    expect(harness.mounts[1].snapshot.nodes[0].name).toBe("replacement");
    readyMount(1);
    await app.ready();
    await flush();
    expect(harness.mounts).toHaveLength(2);
    expect(events).toEqual(["lost", "restored"]);
    app.dispose();
  });

  it("fences a restored-listener scene change and later supersession until the replacement retires", async () => {
    const app = makeApp();
    const old = readyMount(0);
    await app.ready();
    const idle = deferred();
    const replacement = makeController(idle.promise);
    app.onDeviceRestored(() => app.setScene(makeScene("listener scene")));
    old.lose();
    await flush();
    expect(harness.mounts).toHaveLength(2);
    harness.mounts[1].readiness.onRendererReady("webgpu", replacement);
    harness.mounts[1].readiness.onFirstFrame("webgpu");
    expect(replacement.dispose).toHaveBeenCalledTimes(1);
    // A later change must not bypass the already-pending WebGPU retirement.
    app.setScene(makeScene("latest scene"));
    harness.mounts[1].resolve(replacement);
    await flush();
    expect(harness.mounts).toHaveLength(2);
    idle.resolve();
    await flush();
    expect(harness.mounts).toHaveLength(3);
    expect(harness.mounts[2].snapshot.nodes[0].name).toBe("latest scene");
    readyMount(2);
    await app.ready();
    expect(replacement.dispose).toHaveBeenCalledTimes(1);
    app.dispose();
  });

  it("fences an initial pending WebGPU mount when setScene supersedes it", async () => {
    const app = makeApp();
    const first = harness.mounts[0];
    app.setScene(makeScene("next scene"));
    await flush();
    expect(first.signal.aborted).toBe(true);
    expect(harness.mounts).toHaveLength(1);
    const stale = makeController();
    first.resolve(stale);
    await flush();
    expect(stale.dispose).toHaveBeenCalledTimes(1);
    expect(harness.mounts).toHaveLength(2);
    expect(harness.mounts[1].snapshot.nodes[0].name).toBe("next scene");
    readyMount(1);
    await app.ready();
    app.dispose();
  });

  it("does not recover after disposal or accept a stale replacement result", async () => {
    const app = makeApp();
    const old = readyMount(0);
    await app.ready();
    const restored = vi.fn();
    app.onDeviceRestored(restored);
    old.lose();
    await flush();
    expect(harness.mounts).toHaveLength(2);
    app.dispose();
    expect(harness.mounts[1].signal.aborted).toBe(true);
    const stale = makeController();
    harness.mounts[1].readiness.onRendererReady("webgpu", stale);
    harness.mounts[1].readiness.onFirstFrame("webgpu");
    harness.mounts[1].resolve(stale);
    await flush();
    expect(stale.dispose).toHaveBeenCalledTimes(1);
    expect(restored).not.toHaveBeenCalled();
  });

  it("reports frame-detected loss once even when the native loss event arrives later", async () => {
    const app = makeApp();
    const old = readyMount(0);
    await app.ready();
    const lost = vi.fn();
    app.onDeviceLost(() => { throw new Error("loss listener failed"); });
    app.onDeviceLost(lost);
    old.markLost();
    harness.mounts[0].readiness.onDeviceLossDetected();
    old.lose();
    expect(lost).toHaveBeenCalledTimes(1);
    expect(app.diagnostics().errors.some(message => message.includes("DEVICE_LOSS_LISTENER_FAILED:") && message.includes("loss listener failed"))).toBe(true);
    await flush();
    expect(harness.mounts).toHaveLength(2);
    readyMount(1);
    await app.ready();
    app.dispose();
  });

  it("reports compute cleanup failures, retires remaining buffers and still recovers", async () => {
    const app = makeApp();
    const old = readyMount(0);
    await app.ready();
    const lost = vi.fn();
    app.onDeviceLost(lost);
    const first = vi.fn(() => { throw new Error("first native destroy failed"); });
    const second = vi.fn();
    const third = vi.fn(() => { throw new Error("third native destroy failed"); });
    const destroy = [first, second, third];
    let index = 0;
    const device = {
      queue: { submit() {}, writeBuffer() {} },
      createShaderModule() {}, createComputePipeline() {}, createBindGroup() {}, createCommandEncoder() {},
      createBuffer({ size }: { size: number }) { return { size, destroy: destroy[index++]! }; }
    };
    app.compute.bind(device as never);
    app.compute.buffer({ size: 4 });
    app.compute.buffer({ size: 4 });
    app.compute.buffer({ size: 4 });
    expect(() => old.lose()).not.toThrow();
    expect(lost).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(third).toHaveBeenCalledTimes(1);
    expect(app.diagnostics().errors.some(message => message.includes("Compute resource cleanup failed (2 errors)")
      && message.includes("first native destroy failed") && message.includes("third native destroy failed"))).toBe(true);
    await flush();
    expect(harness.mounts).toHaveLength(2);
    readyMount(1);
    await app.ready();
    expect(app.deviceLost()).toBe(false);
    expect(app.diagnostics().errors.some(message => message.includes("Compute resource cleanup failed (2 errors)"))).toBe(true);
    app.dispose();
  });

  it("does not loop when a replacement WebGPU device is lost before its first frame", async () => {
    const app = makeApp();
    const old = readyMount(0);
    await app.ready();
    const lost = vi.fn();
    const restored = vi.fn();
    app.onDeviceLost(lost);
    app.onDeviceRestored(restored);
    old.lose();
    await flush();
    expect(harness.mounts).toHaveLength(2);
    const replacement = makeController();
    harness.mounts[1].readiness.onRendererReady("webgpu", replacement);
    replacement.lose();
    harness.mounts[1].readiness.onFirstFrame("webgpu");
    harness.mounts[1].resolve(replacement);
    await flush();
    expect(lost).toHaveBeenCalledTimes(2);
    expect(restored).not.toHaveBeenCalled();
    expect(app.deviceLost()).toBe(true);
    expect(await app.readiness({ stage: "first-frame" })).toMatchObject({ state: "failed" });
    expect(harness.mounts).toHaveLength(2);
    app.setScene(makeScene("manual retry"));
    await flush();
    expect(harness.mounts).toHaveLength(3);
    readyMount(2);
    await app.ready();
    expect(restored).toHaveBeenCalledTimes(1);
    app.dispose();
  });

  it("keeps failures visible and permits an explicit retry without a retry loop", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const app = makeApp();
    const old = readyMount(0);
    await app.ready();
    const restored = vi.fn();
    app.onDeviceRestored(restored);
    old.lose();
    await flush();
    expect(harness.mounts).toHaveLength(2);
    harness.mounts[1].reject(new Error("replacement unavailable"));
    await app.ready();
    await flush();
    expect(await app.readiness()).toMatchObject({ state: "failed" });
    expect(app.deviceLost()).toBe(true);
    expect(restored).not.toHaveBeenCalled();
    expect(harness.mounts).toHaveLength(2);
    app.setScene(makeScene("retry"));
    await flush();
    expect(harness.mounts).toHaveLength(3);
    readyMount(2);
    await app.ready();
    expect(restored).toHaveBeenCalledTimes(1);
    app.dispose();
  });

  it("does not configure a replacement after the previous renderer fails teardown", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const app = makeApp();
    const old = readyMount(0);
    await app.ready();
    old.dispose.mockImplementation(() => { throw new Error("teardown failed"); });
    old.lose();
    await flush();
    await app.ready();
    expect(await app.readiness()).toMatchObject({ state: "failed" });
    expect(app.deviceLost()).toBe(true);
    expect(harness.mounts).toHaveLength(1);
    app.setScene(makeScene("retry"));
    await flush();
    await app.ready();
    expect(await app.readiness()).toMatchObject({ state: "failed" });
    expect(harness.mounts).toHaveLength(1);
    app.dispose();
  });

  it("keeps the existing WebGL restored-event remount behavior", async () => {
    const app = makeApp("webgl2");
    const old = readyMount(0, makeController(), "webgl2");
    await app.ready();
    const lost = vi.fn();
    const restored = vi.fn();
    app.onDeviceLost(lost);
    app.onDeviceRestored(restored);
    old.lose();
    await flush();
    expect(lost).toHaveBeenCalledTimes(1);
    expect(harness.mounts).toHaveLength(1);
    old.restore();
    await flush();
    expect(restored).toHaveBeenCalledTimes(1);
    expect(harness.mounts).toHaveLength(2);
    readyMount(1, makeController(), "webgl2");
    await app.ready();
    app.dispose();
  });

  it("does not add a WebGPU retirement wait to ordinary WebGL scene changes", async () => {
    const app = makeApp("webgl2");
    const idle = deferred();
    const old = readyMount(0, makeController(idle.promise), "webgl2");
    await app.ready();
    app.setScene(makeScene("next scene"));
    expect(old.dispose).toHaveBeenCalledTimes(1);
    expect(harness.mounts).toHaveLength(2);
    readyMount(1, makeController(), "webgl2");
    await app.ready();
    idle.resolve();
    app.dispose();
  });
});
