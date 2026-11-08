import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { camera, createAuraApp, primitives, scene } from "../../../packages/engine/src/index.js";
import { installWorkerRenderer } from "../../../packages/engine/src/agent-api/app/workerRuntime.js";
import { applyWorkerNodePatch, createWorkerNodeMirror } from "../../../packages/engine/src/agent-api/app/workerNodes.js";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { normalizeSceneSnapshot } from "../../../packages/engine/src/agent-api/sceneMath.js";
import { instances } from "../../../packages/engine/src/agent-api/nodes/instances.js";
import { nodeHandleExtensionFor, registerNodeHandleExtension } from "../../../packages/engine/src/contracts/runtimeNodes.js";
import { instanceTransformsExtension } from "../../../packages/engine/src/agent-api/nodes/game/instanceTransforms.js";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags.js";
import type { AuraWorkerEndpoint, AuraWorkerRequest, AuraWorkerResponse } from "../../../packages/engine/src/agent-api/app/workerProtocol.js";
import type { AuraRuntimeNodeRegistry, AuraSceneSnapshot, WebGLSceneRenderer } from "../../../packages/engine/src/agent-api/nodes/types.js";

vi.mock("../../../packages/engine/src/agent-api/app/frameLoop.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../packages/engine/src/agent-api/app/frameLoop.js")>();
  return {
    ...actual,
    startProductionRender: (...args: any[]) => {
      const controller = { render: vi.fn(), renderAsync: vi.fn(async () => {}), dispose: vi.fn(), deviceLost: () => false, pause: vi.fn(), resume: vi.fn() };
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
  .add(primitives.box({ name: "mover" }).runtime({ id: "mover" }))
  .add(primitives.box({ name: "other" }).position(30, 0, 0).runtime({ id: "other" }));

async function flush() { for (let i = 0; i < 40; i += 1) await Promise.resolve(); }

function workerFixture() {
  const host = new Port();
  const remote = new Port();
  host.peer = remote;
  remote.peer = host;
  const canvas = new Canvas();
  const mounted: { scene?: AuraSceneSnapshot; nodes?: AuraRuntimeNodeRegistry } = {};
  const render = vi.fn((_time: number) => 1);
  const stop = installWorkerRenderer(remote as unknown as AuraWorkerEndpoint<AuraWorkerRequest, AuraWorkerResponse>, {
    // A browser-shaped stand-in for the production renderer: it exposes the
    // registry it reads, the same contract the default factory uses.
    createRenderer: async (_canvas, snapshot) => {
      mounted.scene = snapshot;
      mounted.nodes = createAuraRuntimeNodeRegistry(snapshot);
      return {
        backend: "webgl2", diagnostics: {}, render, resize: vi.fn(), resetTemporalHistory: vi.fn(),
        deviceLost: () => false, viewProjection: () => new Float32Array(16), dispose: vi.fn(),
        runtimeNodes: mounted.nodes
      } as unknown as WebGLSceneRenderer;
    }
  });
  return { host, canvas, mounted, render, stop, createWorker: () => host as unknown as Worker };
}

beforeEach(() => {
  vi.stubGlobal("HTMLCanvasElement", Canvas);
  vi.stubGlobal("window", Object.assign(new Target(), { innerWidth: 200, innerHeight: 100, devicePixelRatio: 1, location: { search: "", href: "http://localhost/" } }));
});
afterEach(() => vi.unstubAllGlobals());

describe("worker node mirror (K1)", () => {
  it("applies writes locally, records replayable ops and coalesces absolute writes", () => {
    const mirror = createWorkerNodeMirror(normalizeSceneSnapshot(boxScene()));
    const node = mirror.nodes.require("mover");
    expect(node.setPosition(1, 2, 3)).toBe(node);
    node.translate(1, 0, 0);
    node.setPosition(4, 5, 6);
    node.visible = false;
    node.setMaterial({ color: "#ff0000" } as never);
    expect(node.position).toEqual([4, 5, 6]);
    expect(mirror.pending).toBe(4);
    expect(mirror.drain()).toEqual([
      { id: "mover", call: "translate", args: [1, 0, 0] },
      { id: "mover", call: "setPosition", args: [4, 5, 6] },
      { id: "mover", set: "visible", value: false },
      { id: "mover", call: "setMaterial", args: [{ color: "#ff0000" }] }
    ]);
    expect(mirror.pending).toBe(0);
  });

  it("rejects effects that cannot be replayed in the worker", () => {
    const mirror = createWorkerNodeMirror(normalizeSceneSnapshot(boxScene()));
    const node = mirror.nodes.require("mover");
    expect(() => node.attach(mirror.nodes.require("other"))).toThrow(expect.objectContaining({ code: "worker-unsupported" }));
    expect(() => node.setUniform?.("u", (() => 1) as never)).toThrow(expect.objectContaining({ code: "worker-unsupported" }));
    expect(mirror.pending).toBe(0);
  });

  it("replays ops and camera specs on the worker registry", () => {
    const snapshot = normalizeSceneSnapshot(boxScene());
    const registry = createAuraRuntimeNodeRegistry(snapshot);
    const applied = applyWorkerNodePatch(registry, snapshot, [
      { id: "mover", call: "setPosition", args: [7, 8, 9] },
      { id: "mover", set: "rotation", value: [0, 1, 0] },
      { camera: { ...snapshot.camera, position: [1, 1, 1] } }
    ]);
    expect(applied).toBe(3);
    expect(registry.require("mover").position).toEqual([7, 8, 9]);
    expect(registry.require("mover").rotation).toEqual([0, 1, 0]);
    expect(snapshot.camera.position).toEqual([1, 1, 1]);
    expect(() => applyWorkerNodePatch(registry, snapshot, [
      { id: "missing", call: "setPosition", args: [0, 0, 0] },
      { id: "mover", call: "setPosition", args: [1, 2, 3] }
    ])).toThrow(expect.objectContaining({ code: "invalid-patch", severity: "recoverable" }));
    // The valid op after a bad one still ran.
    expect(registry.require("mover").position).toEqual([1, 2, 3]);
  });

  it("records and replays setInstanceTransforms (the extension finds its instanced node through the mirror scene)", () => {
    if (!nodeHandleExtensionFor("setInstanceTransforms")) registerNodeHandleExtension(instanceTransformsExtension);
    const flags = resolveQrFlags({ options: { A3D_QR_GAME: true } });
    const pooled = () => normalizeSceneSnapshot(scene().add(instances.box({ name: "pool", size: [1, 1, 1],
      transforms: [{ position: [0, -999, 0] }, { position: [0, -999, 0] }] }).runtime({ id: "pool" })));
    const mirror = createWorkerNodeMirror(pooled(), flags);
    const matrices = new Float32Array(32);
    matrices.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 4, 5, 1]);
    (mirror.nodes.require("pool") as unknown as { setInstanceTransforms(m: Float32Array, n: number): void }).setInstanceTransforms(matrices, 1);
    const ops = mirror.drain();
    expect(ops).toEqual([{ id: "pool", call: "setInstanceTransforms", args: [matrices, 1] }]);
    const workerScene = pooled();
    const registry = createAuraRuntimeNodeRegistry(workerScene, { flags, app: { scene: workerScene } as never });
    expect(applyWorkerNodePatch(registry, workerScene, ops)).toBe(1);
  });

  it("replays updateAttribute and keeps no undrained attribute writes on the host mirror", () => {
    const mirror = createWorkerNodeMirror(normalizeSceneSnapshot(boxScene()));
    const node = mirror.nodes.require("mover");
    node.updateAttribute!("position", { array: new Float32Array([0, 1, 0]), offset: 0 });
    const ops = mirror.drain();
    expect(ops).toEqual([{ id: "mover", call: "updateAttribute", args: ["position", { array: new Float32Array([0, 1, 0]), offset: 0 }] }]);
    expect((mirror.registry.require("mover") as unknown as { __parityL2AttributeUpdates?: unknown[] }).__parityL2AttributeUpdates).toEqual([]);
    const snapshot = normalizeSceneSnapshot(boxScene());
    const registry = createAuraRuntimeNodeRegistry(snapshot);
    expect(applyWorkerNodePatch(registry, snapshot, ops)).toBe(1);
    expect((registry.require("mover") as unknown as { __parityL2AttributeUpdates?: unknown[] }).__parityL2AttributeUpdates).toHaveLength(1);
  });

  it("picks on the host against the mirror", () => {
    const mirror = createWorkerNodeMirror(normalizeSceneSnapshot(boxScene()));
    expect(mirror.pick(100, 50, { width: 200, height: 100 })).toMatchObject({ nodeId: "mover" });
    expect(mirror.pick(2, 2, { width: 200, height: 100 })).toBeUndefined();
    mirror.nodes.require("mover").setPosition(30, 0, 0);
    mirror.nodes.require("other").setPosition(0, 0, 0);
    expect(mirror.pick(100, 50, { width: 200, height: 100 })).toMatchObject({ nodeId: "other" });
    mirror.nodes.require("other").setVisible(false);
    expect(mirror.pick(100, 50, { width: 200, height: 100 })).toBeUndefined();
  });
});

describe("worker app node patches, host frames and picking (K1-K3)", () => {
  it("sends node changes as one patch that the worker applies before its next frame", async () => {
    const f = workerFixture();
    const app = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: boxScene(), autoStart: false, worker: { createWorker: f.createWorker }
    });
    await app.readyStrict();
    expect(app.execution?.active).toBe("worker");
    const node = app.nodes.require("mover");
    node.setPosition(2, 0, 0);
    node.setRotation(0, 0.5, 0);
    await app.stepAsync(1 / 60);
    const patches = f.host.sent.filter((message) => message.type === "patch");
    expect(patches).toHaveLength(1);
    const order = f.host.sent.map((message) => message.type);
    expect(order.indexOf("patch")).toBeLessThan(order.lastIndexOf("frame"));
    expect(f.mounted.nodes!.require("mover").position).toEqual([2, 0, 0]);
    expect(f.mounted.nodes!.require("mover").rotation).toEqual([0, 0.5, 0]);
    expect(f.render).toHaveBeenCalledTimes(1);
    // x = 2 at depth 10, fov 50, aspect 2 projects to about 121 css px.
    expect(app.pick!(121, 50)).toMatchObject({ nodeId: "mover" });
    expect(app.pick!(100, 50)).toBeUndefined();
    await app.disposeAsync();
    await f.stop();
  });

  it("runs onFrame callbacks on the host in step() and presents one coalesced worker frame", async () => {
    const f = workerFixture();
    const app = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: boxScene(), autoStart: false, worker: { createWorker: f.createWorker }
    });
    await app.readyStrict();
    const seen: number[] = [];
    app.onFrame((frame) => {
      seen.push(frame.dt);
      app.nodes.require("mover").translate(1, 0, 0);
    });
    app.step(0.1);
    app.step(0.1);
    app.step(0.1);
    expect(seen).toEqual([0.1, 0.1, 0.1]);
    expect(app.nodes.require("mover").position).toEqual([3, 0, 0]);
    await flush();
    await flush();
    expect(f.mounted.nodes!.require("mover").position).toEqual([3, 0, 0]);
    // Three steps, at most two worker frames (one in flight, the rest coalesced).
    const frames = f.host.sent.filter((message) => message.type === "frame").length;
    expect(frames).toBeGreaterThanOrEqual(1);
    expect(frames).toBeLessThanOrEqual(2);
    expect(app.evidence()).toBeTruthy();
    await app.disposeAsync();
    await f.stop();
  });

  it("keeps at most one host-loop patch in flight and coalesces the rest (backpressure)", async () => {
    const f = workerFixture();
    const app = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: boxScene(), autoStart: false, worker: { createWorker: f.createWorker }
    });
    await app.readyStrict();
    app.resume(); // a running worker presents on its own clock; step() only patches
    await flush();
    app.onFrame(() => { app.nodes.require("mover").translate(1, 0, 0); app.nodes.require("other").setPosition(9, 9, 9); });
    for (let i = 0; i < 5; i += 1) app.step(1 / 60);
    expect(f.host.sent.filter((message) => message.type === "patch")).toHaveLength(1);
    // No further frame runs: the coalesced ops still go out once the in-flight patch returns.
    await flush();
    await flush();
    const patches = f.host.sent.filter((message) => message.type === "patch") as unknown as Array<{ ops: unknown[] }>;
    expect(patches).toHaveLength(2);
    // The second patch carries the four coalesced frames: translates kept, setPosition merged.
    expect(patches[1]!.ops.filter((op) => (op as { call?: string }).call === "translate")).toHaveLength(4);
    expect(patches[1]!.ops.filter((op) => (op as { call?: string }).call === "setPosition")).toHaveLength(1);
    expect(f.mounted.nodes!.require("mover").position).toEqual([5, 0, 0]);
    expect(f.mounted.nodes!.require("other").position).toEqual([9, 9, 9]);
    await app.disposeAsync();
    await f.stop();
  });

  it("drops queued ops on scene replacement and patches the new scene afterwards", async () => {
    const f = workerFixture();
    const app = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: boxScene(), autoStart: false, worker: { createWorker: f.createWorker }
    });
    await app.readyStrict();
    const stale = app.nodes.require("mover");
    stale.setPosition(5, 5, 5);
    app.setScene(boxScene());
    await app.readyStrict();
    stale.setPosition(6, 6, 6); // an old-scene handle no longer records
    app.nodes.require("other").setPosition(1, 1, 1);
    await app.stepAsync(0);
    expect(f.mounted.nodes!.require("mover").position).toEqual([0, 0, 0]);
    expect(f.mounted.nodes!.require("other").position).toEqual([1, 1, 1]);
    await app.disposeAsync();
    await f.stop();
  });

  it("holds new-scene ops until the queued scene replacement reaches the worker", async () => {
    const f = workerFixture();
    const app = createAuraApp(f.canvas as unknown as HTMLCanvasElement, {
      scene: boxScene(), autoStart: false, worker: { createWorker: f.createWorker }
    });
    await app.readyStrict();
    app.setScene(boxScene());
    // Written before the replacement was posted (no await): must not land on the old registry.
    app.nodes.require("mover").setPosition(4, 0, 0);
    app.step(0);
    await app.stepAsync(0);
    const order = f.host.sent.map((message) => message.type);
    expect(order.lastIndexOf("scene")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("patch")).toBeGreaterThan(order.lastIndexOf("scene"));
    expect(order.indexOf("patch")).toBeLessThan(order.lastIndexOf("frame"));
    expect(f.mounted.nodes!.require("mover").position).toEqual([4, 0, 0]);
    expect(app.diagnostics().errors ?? []).toEqual([]);
    await app.disposeAsync();
    await f.stop();
  });

  it("honors fallback main-thread when a lab fragment carries no createWorker", () => {
    const canvas = new Canvas();
    const app = createAuraApp(canvas as unknown as HTMLCanvasElement, {
      scene: boxScene(), autoStart: false, worker: { fallback: "main-thread" } as never
    });
    expect(app.execution).toMatchObject({ requested: "worker", active: "main-thread", fallbackReason: expect.stringMatching(/^worker-unsupported/) });
    app.dispose();
  });
});
