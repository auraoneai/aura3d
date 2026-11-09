// 5.5.1 P4: a worker app's diagnostics().fps counts the frames the worker presented.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { camera, createAuraApp, primitives, scene } from "../../../packages/engine/src/index.js";
import { installWorkerRenderer } from "../../../packages/engine/src/agent-api/app/workerRuntime.js";
import type { AuraWorkerEndpoint, AuraWorkerFrameResult, AuraWorkerRequest, AuraWorkerResponse } from "../../../packages/engine/src/agent-api/app/workerProtocol.js";
import type { WebGLSceneRenderer } from "../../../packages/engine/src/agent-api/nodes/types.js";

class Target {
  readonly listeners = new Map<string, Set<(event: any) => void>>();
  addEventListener(type: string, listener: (event: any) => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: (event: any) => void) { this.listeners.get(type)?.delete(listener); }
  emit(type: string, values: Record<string, unknown> = {}) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener({ ...values, type });
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
  width = 200;
  height = 100;
  clientWidth = 200;
  clientHeight = 100;
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  parentElement = null;
  offscreen = { width: 200, height: 100, convertToBlob: vi.fn(async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })) };
  transferControlToOffscreen() { return this.offscreen as unknown as OffscreenCanvas; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 200, height: 100 }; }
  hasAttribute() { return true; }
  getContext() { return null; }
}

const boxScene = () => scene()
  .camera(camera.perspective({ position: [0, 0, 10], target: [0, 0, 0], fov: 50 }))
  .add(primitives.box({ name: "mover" }).runtime({ id: "mover" }));

async function flush() { for (let i = 0; i < 60; i += 1) await Promise.resolve(); }

/** The worker clock: each presented frame reads the next value. */
let clock = 0;

function workerFixture() {
  const host = new Port();
  const remote = new Port();
  host.peer = remote;
  remote.peer = host;
  const canvas = new Canvas();
  const stop = installWorkerRenderer(remote as unknown as AuraWorkerEndpoint<AuraWorkerRequest, AuraWorkerResponse>, {
    createRenderer: async () => ({
      backend: "webgl2", diagnostics: {}, render: vi.fn(() => 1), resize: vi.fn(), resetTemporalHistory: vi.fn(),
      deviceLost: () => false, viewProjection: () => new Float32Array(16), dispose: vi.fn()
    }) as unknown as WebGLSceneRenderer
  });
  return { host, remote, canvas, stop, createWorker: () => host as unknown as Worker };
}

const frameResults = (port: Port) => port.sent.flatMap((message) => {
  if (message.type === "presented") return [message.result];
  if (message.type === "result" && message.result && "drawCalls" in message.result) return [message.result as AuraWorkerFrameResult];
  return [];
});

beforeEach(() => {
  clock = 0;
  vi.stubGlobal("HTMLCanvasElement", Canvas);
  vi.stubGlobal("window", Object.assign(new Target(), { innerWidth: 200, innerHeight: 100, devicePixelRatio: 1, location: { search: "", href: "http://localhost/" } }));
  vi.spyOn(performance, "now").mockImplementation(() => clock);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("worker fps (5.5.1 P4)", () => {
  it("reports each manual frame's presentation time and turns it into diagnostics().fps", async () => {
    const f = workerFixture();
    const app = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: boxScene(), autoStart: false, worker: { createWorker: f.createWorker }
    });
    await app.ready();
    expect(app.diagnostics().fps).toBe(0);
    // 21 frames, 25 ms apart on the worker clock: 40 fps.
    for (let i = 0; i < 21; i += 1) {
      clock = 1000 + i * 25;
      await app.stepAsync(1 / 60);
    }
    const results = frameResults(f.remote);
    expect(results.length).toBeGreaterThanOrEqual(21);
    expect(results.at(-1)).toMatchObject({ source: "manual", presentedAt: 1500 });
    expect(app.diagnostics().fps).toBe(40);
    expect(app.runtime.frame).toBe(21);
    app.dispose();
    await f.stop();
  });

  it("counts automatic presented messages over a rolling one-second window", async () => {
    const f = workerFixture();
    const app = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: boxScene(), autoStart: false, worker: { createWorker: f.createWorker }
    });
    await app.ready();
    await app.stepAsync(0);
    const frame = (presentedAt: number | undefined): AuraWorkerResponse => ({
      type: "presented", id: 0,
      result: { backend: "webgl2", drawCalls: 1, width: 200, height: 100, time: 0, deltaSeconds: 1 / 60, source: "automatic", ...(presentedAt === undefined ? {} : { presentedAt }) }
    });
    // A slow phase (10 fps) followed by a fast one (100 fps): the window drops the slow frames.
    for (let i = 1; i <= 10; i += 1) { f.host.emit("message", { data: frame(i * 100) }); await flush(); }
    expect(app.diagnostics().fps).toBe(10);
    for (let i = 1; i <= 150; i += 1) { f.host.emit("message", { data: frame(1000 + i * 10) }); await flush(); }
    expect(app.diagnostics().fps).toBe(100);
    // Capture-only frames are not presentation and do not count.
    for (let i = 1; i <= 5; i += 1) { f.host.emit("message", { data: { ...frame(2500 + i), type: "capture-presented" } }); await flush(); }
    expect(app.diagnostics().fps).toBe(100);
    app.dispose();
    await f.stop();
  });

  it("falls back to the host clock when a worker does not report presentedAt", async () => {
    const f = workerFixture();
    const app = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: boxScene(), autoStart: false, worker: { createWorker: f.createWorker }
    });
    await app.ready();
    const result = { backend: "webgl2", drawCalls: 1, width: 200, height: 100, time: 0, deltaSeconds: 1 / 60, source: "automatic" as const };
    for (let i = 0; i <= 20; i += 1) {
      clock = 5000 + i * 20;
      f.host.emit("message", { data: { type: "presented", id: 0, result } });
      await flush();
    }
    expect(app.diagnostics().fps).toBe(50);
    app.dispose();
    await f.stop();
  });
});
