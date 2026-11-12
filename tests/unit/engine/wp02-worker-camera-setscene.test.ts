import { afterEach, describe, expect, it, vi } from "vitest";
import "../../../packages/engine/src/lanes/prd02.js";
import { labels, lights, primitives, scene } from "../../../packages/engine/src";
import { isCoarsePointerDevice, mediaMatches, setWorkerCoarsePointer } from "../../../packages/engine/src/agent-api/platform.js";
import { applyWorkerNodePatch, coalesceKey, collectWorkerPatchTransferables } from "../../../packages/engine/src/agent-api/app/workerPatch.js";
import { createWorkerNodeMirror } from "../../../packages/engine/src/agent-api/app/workerNodes.js";
import { createWorkerRootApp } from "../../../packages/engine/src/agent-api/app/workerRootApp.js";
import { createWorkerRenderer, installWorkerRenderer } from "../../../packages/engine/src/agent-api/app/workerRuntime.js";
import { createAuraCameraController } from "../../../packages/engine/src/agent-api/camera/extension.js";
import { sampleCameraFrame } from "../../../packages/engine/src/agent-api/compiler/camera.js";
import type { AuraWorkerEndpoint, AuraWorkerHostEndpoint, AuraWorkerRequest, AuraWorkerResponse } from "../../../packages/engine/src/agent-api/app/workerProtocol.js";
import type { AuraApp, AuraCameraSpec, AuraRuntimeNodeRegistry, AuraSceneSnapshot, WebGLSceneRenderer } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { buildWorld as buildStrangeOrbitWorld } from "../../../examples/strange-orbit-port/world";

class Port {
  peer?: Port;
  listeners = new Map<string, Set<(event: any) => void>>();
  messages: any[] = [];
  transfers: Transferable[][] = [];
  terminated = 0;
  postMessage(message: any, transfer: Transferable[] = []): void {
    this.transfers.push(transfer);
    const cloned = message.type === "scene" ? structuredClone(message, { transfer })
      : message.type === "init" ? { ...structuredClone({ ...message, canvas: undefined }, { transfer: transfer.slice(1) }), canvas: message.canvas }
      : message.type === "patch" ? structuredClone(message, { transfer })
      : message;
    this.messages.push(cloned);
    queueMicrotask(() => { if (!this.terminated) this.peer?.emit("message", { data: cloned }); });
  }
  addEventListener(type: string, listener: (event: any) => void): void {
    const entries = this.listeners.get(type) ?? new Set();
    entries.add(listener);
    this.listeners.set(type, entries);
  }
  removeEventListener(type: string, listener: (event: any) => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  terminate(): void { this.terminated++; }
  emit(type: string, event: unknown): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
}

class TransferableDomCanvas {
  width = 300;
  height = 150;
  clientWidth = 800;
  clientHeight = 400;
  style: Record<string, string> = {};
  parentElement: unknown = null;
  rectCalls = 0;
  listeners = new Map<string, Set<(event: any) => void>>();
  transferControlToOffscreen(): OffscreenCanvas {
    return { width: this.width, height: this.height } as OffscreenCanvas;
  }
  getBoundingClientRect(): DOMRect {
    this.rectCalls += 1;
    return { left: 10, top: 20, width: 800, height: 400 } as DOMRect;
  }
  addEventListener(type: string, listener: (event: any) => void): void {
    const entries = this.listeners.get(type) ?? new Set();
    entries.add(listener);
    this.listeners.set(type, entries);
  }
  removeEventListener(type: string, listener: (event: any) => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  emit(type: string, event: Record<string, unknown> = {}): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener({ ...event, type });
  }
}

const makePorts = (): [Port, Port] => {
  const host = new Port();
  const remote = new Port();
  host.peer = remote;
  remote.peer = host;
  return [host, remote];
};

function stubRenderer(): WebGLSceneRenderer {
  const vp = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
  return {
    backend: "webgpu" as WebGLSceneRenderer["backend"],
    diagnostics: {} as WebGLSceneRenderer["diagnostics"],
    render: () => 2,
    resize: () => undefined,
    resetTemporalHistory: () => undefined,
    viewProjection: () => vp,
    onDeviceLost: () => () => undefined,
    onDeviceRestored: () => () => undefined,
    deviceLost: () => false,
    dispose: () => undefined
  };
}

afterEach(() => {
  setWorkerCoarsePointer(undefined);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("WP-02 worker coarsePointer, K1-K4 patches/backpressure/labels, camera guards & strange-orbit backend", () => {
  it("propagates coarsePointer from main thread into OffscreenCanvas worker and resets on stop", async () => {
    vi.stubGlobal("window", {
      devicePixelRatio: 2,
      matchMedia: (query: string) => ({ matches: query === "(pointer: coarse)" }),
      addEventListener() {},
      removeEventListener() {}
    });
    vi.stubGlobal("navigator", { maxTouchPoints: 5 });

    const [host, remote] = makePorts();
    let observedInWorker = { coarse: false, media: false };
    const stop = installWorkerRenderer(remote as unknown as AuraWorkerEndpoint<AuraWorkerRequest, AuraWorkerResponse>, {
      createRenderer: async () => {
        // Simulate worker global without window.matchMedia
        const savedWindow = globalThis.window;
        vi.stubGlobal("window", undefined);
        try {
          observedInWorker = {
            coarse: isCoarsePointerDevice(),
            media: mediaMatches("(pointer: coarse)")
          };
        } finally {
          vi.stubGlobal("window", savedWindow);
        }
        return stubRenderer();
      }
    });

    const canvas = new TransferableDomCanvas();
    const snap = scene().add(primitives.box({ name: "hero" })).toJSON() as AuraSceneSnapshot;
    const handle = createWorkerRenderer({
      canvas: canvas as unknown as HTMLCanvasElement,
      worker: host as unknown as AuraWorkerHostEndpoint,
      scene: snap,
      autoStart: false,
      bridgeEvents: false
    });
    await handle.ready;
    expect(observedInWorker).toEqual({ coarse: true, media: true });
    expect(host.messages[0]?.coarsePointer).toBe(true);

    await handle.dispose();
    await stop();
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("navigator", { maxTouchPoints: 0 });
    expect(isCoarsePointerDevice()).toBe(false);
  });

  it("caches workerNodes closures, coalesces K1-K4 patch ops, transfers owned buffers without detaching caller views, and replays add/remove/clear", () => {
    const initial = scene()
      .add(primitives.box({ name: "box" }).runtime({ id: "box" }))
      .add(lights.point({ name: "lamp", position: [0, 3, 0] }).runtime({ id: "lamp" }))
      .toJSON() as AuraSceneSnapshot;
    const mirror = createWorkerNodeMirror(initial, { on: () => true } as any);
    const box = mirror.nodes.get("box")!;
    const lamp = mirror.nodes.get("lamp")!;

    // Zero per-access closure allocation on hot proxy lookups
    expect(box.setPosition).toBe(box.setPosition);
    expect(box.updateAttribute).toBe(box.updateAttribute);

    // Coalescing across material/light/attribute/app ops + partial setLight merge + setMaterial sub-setter pruning
    box.setColor?.("#ff0000");
    box.setOpacity?.(0.5);
    box.setMaterial({ kind: "pbr", color: "#00ff00" } as any);
    lamp.setLight?.({ color: "#ffffff", intensity: 2 } as any);
    lamp.setLight?.({ intensity: 5 } as any);

    const callerPositions = new Float32Array([1, 2, 3, 4, 5, 6]);
    box.updateAttribute?.("position", { array: callerPositions, offset: 0 });
    callerPositions[0] = 99;
    const secondPositions = new Float32Array([10, 20, 30, 40, 50, 60]);
    box.updateAttribute?.("position", { array: secondPositions, offset: 0 });

    const ops = mirror.drain();
    // setColor & setOpacity before setMaterial were pruned; the two setLight calls merged; the two updateAttribute(position,0) calls coalesced!
    expect(ops.filter((op) => "call" in op && (op.call === "setColor" || op.call === "setOpacity"))).toHaveLength(0);
    const lightOps = ops.filter((op) => "call" in op && op.call === "setLight");
    expect(lightOps).toHaveLength(1);
    expect((lightOps[0] as any).args[0]).toEqual({ color: "#ffffff", intensity: 5 });

    const attrOps = ops.filter((op) => "call" in op && op.call === "updateAttribute");
    expect(attrOps).toHaveLength(1);
    const transfers = collectWorkerPatchTransferables(ops);
    expect(transfers.length).toBe(1);
    // Caller arrays remain completely intact (not detached or aliased)
    expect(callerPositions.byteLength).toBe(24);
    expect(secondPositions.byteLength).toBe(24);

    // Coalesce keys for app calls and camera
    expect(coalesceKey({ app: "setOutput", args: [{ exposure: 1.2 }] })).toBe("\u0000app\u0000setOutput");
    expect(coalesceKey({ camera: { mode: "perspective", fov: 60 } as AuraCameraSpec })).toBe("camera");

    // Structural add / remove / clear replay
    const added = mirror.nodes.add!(primitives.sphere({ name: "spawned" }));
    expect(mirror.scene.nodes.some((n: any) => n.name === "spawned")).toBe(true);
    expect(mirror.nodes.remove!(added.id)).toBe(true);
    expect(mirror.scene.nodes.some((n: any) => n.name === "spawned")).toBe(false);
    (mirror.nodes as any).clear();
    expect(mirror.scene.nodes).toHaveLength(0);

    const replayTargetScene = structuredClone(initial);
    const structuralCalls: string[] = [];
    const mockRegistry = {
      get: () => undefined,
      add: (spec: any) => { structuralCalls.push(`add:${spec.name}`); return { id: "s1" }; },
      remove: (id: string) => { structuralCalls.push(`remove:${id}`); return true; },
      clear: () => { structuralCalls.push("clear"); }
    } as unknown as AuraRuntimeNodeRegistry;
    applyWorkerNodePatch(mockRegistry, replayTargetScene, mirror.drain());
    expect(structuralCalls).toEqual(["add:spawned", `remove:${added.id}`, "clear"]);
  });

  it("caps in-flight patches across 250+ synchronous advance() calls without overflowing MAX_PENDING_REQUESTS and accepts label scenes", async () => {
    vi.stubGlobal("HTMLCanvasElement", TransferableDomCanvas);
    vi.stubGlobal("window", {
      innerWidth: 800,
      innerHeight: 400,
      devicePixelRatio: 1,
      location: { search: "", href: "http://localhost/" },
      addEventListener() {},
      removeEventListener() {}
    });

    const [host, remote] = makePorts();
    installWorkerRenderer(remote as unknown as AuraWorkerEndpoint<AuraWorkerRequest, AuraWorkerResponse>, {
      createRenderer: async () => stubRenderer()
    });

    const canvas = new TransferableDomCanvas();
    const labelScene = scene()
      .add(primitives.box({ name: "hero" }).runtime({ id: "hero" }))
      .add(labels.billboard("P1", { name: "tag", position: [0, 2, 0] }));

    const result = createWorkerRootApp(canvas as unknown as HTMLCanvasElement, {
      scene: labelScene,
      autoStart: false,
      resize: false,
      worker: { createWorker: () => host as unknown as Worker }
    });
    expect(result.kind).toBe("worker");
    const app = (result as { kind: "worker"; app: AuraApp }).app;
    await app.ready();

    const stringifySpy = vi.spyOn(JSON, "stringify");
    const hero = app.nodes.get("hero")!;
    for (let i = 0; i < 260; i++) {
      hero.setPosition(i * 0.1, 1, 0);
      app.advance(1 / 120);
    }
    // JSON.stringify must never be called per-frame to diff scene.camera
    expect(stringifySpy).not.toHaveBeenCalled();

    await expect(app.stepAsync(1 / 60)).resolves.toBeUndefined();
    await app.disposeAsync();
  });

  it("caches getBoundingClientRect across repeated pointermove events until resize invalidates it", async () => {
    const winTarget = new TransferableDomCanvas();
    vi.stubGlobal("window", {
      devicePixelRatio: 1,
      addEventListener: winTarget.addEventListener.bind(winTarget),
      removeEventListener: winTarget.removeEventListener.bind(winTarget)
    });

    const [host, remote] = makePorts();
    installWorkerRenderer(remote as unknown as AuraWorkerEndpoint<AuraWorkerRequest, AuraWorkerResponse>, {
      createRenderer: async () => stubRenderer()
    });
    const canvas = new TransferableDomCanvas();
    const handle = createWorkerRenderer({
      canvas: canvas as unknown as HTMLCanvasElement,
      worker: host as unknown as AuraWorkerHostEndpoint,
      scene: scene().add(primitives.box({ name: "b" })).toJSON() as AuraSceneSnapshot,
      autoStart: false,
      bridgeEvents: true
    });
    await handle.ready;

    canvas.rectCalls = 0;
    for (let i = 0; i < 25; i++) {
      canvas.emit("pointermove", { pointerId: 1, pointerType: "mouse", clientX: 50 + i, clientY: 60, buttons: 0, pressure: 0 });
    }
    expect(canvas.rectCalls).toBe(1);

    winTarget.emit("resize");
    canvas.emit("pointermove", { pointerId: 1, pointerType: "mouse", clientX: 90, clientY: 60, buttons: 0, pressure: 0 });
    expect(canvas.rectCalls).toBe(2);

    await handle.dispose();
  });

  it("reads tracked worker CSS size for camera.aspect and guards applyPose + sampleCameraFrame against NaN, collinear up, and 180-deg target crossings", async () => {
    const [host, remote] = makePorts();
    installWorkerRenderer(remote as unknown as AuraWorkerEndpoint<AuraWorkerRequest, AuraWorkerResponse>, {
      createRenderer: async () => stubRenderer()
    });
    // Backing canvas stays frozen at 300x150 after transferControlToOffscreen, while resized viewport is 1600x400 (aspect = 4).
    const canvas = new TransferableDomCanvas();
    canvas.clientWidth = 0;
    canvas.clientHeight = 0;
    const workerHandle = createWorkerRenderer({
      canvas: canvas as unknown as HTMLCanvasElement,
      worker: host as unknown as AuraWorkerHostEndpoint,
      scene: scene().add(primitives.box({ name: "b" })).toJSON() as AuraSceneSnapshot,
      autoStart: false,
      bridgeEvents: false
    });
    await workerHandle.ready;
    await workerHandle.resize({ width: 1600, height: 400, pixelRatio: 1 });

    const cameraSpec: Record<string, unknown> = {
      mode: "perspective",
      position: [0, 2, 8],
      target: [0, 1, 0],
      up: [0, 1, 0],
      fov: 60,
      near: 0.1,
      far: 500
    };
    const fakeApp = {
      canvas: canvas as unknown as HTMLCanvasElement,
      scene: { nodes: [], camera: cameraSpec },
      diagnostics: () => ({ renderSize: [1600, 400] }),
      cutCamera() {}
    } as unknown as AuraApp;
    const controller = createAuraCameraController(fakeApp);
    controller.setPose({ position: [0, 0, 5], target: [0, 0, 0], up: [0, 1, 0], fov: 60 }, { cut: true });
    controller.update(0, 0);
    const vp = controller.evidence().viewProjection;
    expect(vp[5]! / vp[0]!).toBeCloseTo(4, 5);

    // Valid vertical view ray switches collinear [0, 1, 0] up to [0, 0, 1]
    controller.setPose({ position: [0, 10, 0], target: [0, 0, 0], up: [0, 1, 0], fov: 55 }, { cut: true });
    controller.update(0, 0);
    expect(cameraSpec.up).toEqual([0, 0, 1]);

    // Eye == target pushes target out to >= 0.05 along previous view ray; NaN pose retains lastValidPose
    controller.setPose({ position: [2, 3, 4], target: [2, 3, 4], up: [0, 1, 0], fov: 55 }, { cut: true });
    controller.update(0, 0);
    const guardedTarget = cameraSpec.target as [number, number, number];
    expect(Math.hypot(guardedTarget[0] - 2, guardedTarget[1] - 3, guardedTarget[2] - 4)).toBeGreaterThanOrEqual(0.0499);

    const prevPos = [...(cameraSpec.position as number[])];
    controller.setPose({ position: [Number.NaN, 0, 0], target: [0, 0, 0], up: [0, 1, 0], fov: Number.NaN }, { cut: true });
    controller.update(0, 0);
    expect(cameraSpec.position).toEqual(prevPos);
    expect(Number.isFinite(cameraSpec.fov)).toBe(true);

    // Follow-camera 180° turn interpolation never crosses directly through target at midpoint
    const followSpec: AuraCameraSpec = {
      mode: "follow",
      targetNode: "hero",
      offset: [0, 0, -10],
      offsetMode: "target-yaw",
      smoothing: 0.5
    } as AuraCameraSpec;
    const targetIdentity = {};
    let heroYaw = 0;
    const runtimeNodes = {
      get: () => ({ id: "hero", name: "hero", tags: [], visible: true, position: [0, 0, 0] as const, rotation: [0, heroYaw, 0] as const }),
      all: () => []
    } as unknown as AuraRuntimeNodeRegistry;
    const followSnapshot = { camera: followSpec, nodes: [] } as unknown as AuraSceneSnapshot;
    const startFrame = sampleCameraFrame(followSnapshot, followSpec, 0, runtimeNodes);
    heroYaw = Math.PI; // 180° snap: desired eye jumps from [0, 0, -10] to [0, 0, +10] across target [0, 0, 0]
    const midFrame = sampleCameraFrame(
      followSnapshot,
      followSpec,
      100,
      runtimeNodes,
      startFrame
    );
    expect(midFrame.eye.every(Number.isFinite)).toBe(true);
    // Exact midpoint test: smoothing = 0.5 at 60 Hz => deltaTime = 1000 / 60 ms gives amount = 0.5
    const exactHalfTimeMs = 1000 / 60;
    const halfFrame = sampleCameraFrame(
      followSnapshot,
      followSpec,
      exactHalfTimeMs,
      runtimeNodes,
      startFrame
    );
    const distAtHalf = Math.hypot(
      halfFrame.eye[0] - halfFrame.target[0],
      halfFrame.eye[1] - halfFrame.target[1],
      halfFrame.eye[2] - halfFrame.target[2]
    );
    expect(distAtHalf).toBeGreaterThan(5);

    await workerHandle.dispose();
  });

  it("treats auto backend as sprite-quads in strange-orbit-port when WebGPU is active and falls back to points on ?backend=webgl2", () => {
    vi.stubGlobal("window", { location: { search: "" } });
    vi.stubGlobal("navigator", { gpu: {} });
    const webgpuAutoNodes = buildStrangeOrbitWorld({ vehicle: "bike", rider: 0, quality: "low" }).scene.toJSON().nodes as readonly any[];
    const starsWebGPU = webgpuAutoNodes.find((n) => n.name === "stars");

    vi.stubGlobal("window", { location: { search: "?backend=webgl2" } });
    const webgl2Nodes = buildStrangeOrbitWorld({ vehicle: "bike", rider: 0, quality: "low" }).scene.toJSON().nodes as readonly any[];
    const starsWebGL2 = webgl2Nodes.find((n) => n.name === "stars");
    expect(starsWebGPU?.geometry?.positions?.length).toBe((starsWebGL2?.geometry?.positions?.length ?? 0) * 4);
    expect(starsWebGPU?.geometry?.indices?.length).toBe((starsWebGL2?.geometry?.indices?.length ?? 0) * 6);
  });
});
