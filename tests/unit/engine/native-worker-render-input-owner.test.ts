import { afterEach, describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd01.js";
import { Renderer, type RenderSource } from "../../../packages/rendering/src/Renderer.js";
import { createWorkerRenderer, installWorkerRenderer } from "../../../packages/engine/src/agent-api/app/workerRuntime.js";
import type { AuraWorkerEndpoint, AuraWorkerHostEndpoint, AuraWorkerRequest, AuraWorkerResponse } from "../../../packages/engine/src/agent-api/app/workerProtocol.js";
import * as flagsModule from "../../../packages/engine/src/contracts/flags.js";
import * as rendererModule from "../../../packages/engine/src/agent-api/compiler/renderer.js";
import { frameUsesLegacyModelMatrix, setPrd01ModelMatrixCache } from "../../../packages/engine/src/agent-api/compiler/renderInput.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import type { AuraPrimitiveNode, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types.js";

class FakeOffscreenCanvas {
  constructor(public width: number, public height: number) {}
  getContext(kind: string) {
    return kind === "webgl2" ? { MAX_TEXTURE_SIZE: 0x0d33, getParameter: () => 4096 } : null;
  }
}

class Port {
  peer?: Port;
  readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>();
  terminated = 0;
  postMessage(message: AuraWorkerRequest | AuraWorkerResponse, transfer: Transferable[] = []): void {
    const copy = message.type === "init"
      ? { ...structuredClone({ ...message, canvas: undefined }, { transfer: transfer.slice(1) }), canvas: message.canvas }
      : structuredClone(message, { transfer });
    queueMicrotask(() => { if (!this.terminated) this.peer?.emit(copy); });
  }
  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    const entries = this.listeners.get(type) ?? new Set(); entries.add(listener); this.listeners.set(type, entries);
  }
  removeEventListener(type: string, listener: (event: MessageEvent) => void): void { this.listeners.get(type)?.delete(listener); }
  emit(data: unknown): void { for (const listener of [...(this.listeners.get("message") ?? [])]) listener({ data } as MessageEvent); }
  terminate(): void { this.terminated++; }
}

function snapshot(name: string, pivot: boolean): AuraSceneSnapshot {
  const node = {
    kind: "primitive", primitive: "box", name,
    quaternion: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
    ...(pivot ? { pivot: [1, 0, 0] } : {}),
    instances: [{}], instanceColors: ["orange"]
  } as AuraPrimitiveNode;
  return { ...scene().toJSON(), nodes: [node] };
}

afterEach(() => {
  setPrd01ModelMatrixCache(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("worker render-input ownership", () => {
  it.each([
    [true, false], [true, true], [false, false], [false, true]
  ])("owns and releases its frame cache (core=%s compiler=%s)", async (core, compiler) => {
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
    vi.stubGlobal("WebGL2RenderingContext", undefined);
    vi.stubGlobal("document", undefined);
    setPrd01ModelMatrixCache(null);
    const flags = flagsModule.resolveQrFlags({ options: {
      A3D_QR_CORE: core, A3D_QR_COMPILER: compiler, A3D_QR_CORE_GENERATOR: false,
      A3D_QR_CORE_OUTPUT: false, A3D_QR_LIGHTING: false, A3D_QR_POST: false, A3D_QR_VFX: false
    } });
    vi.spyOn(flagsModule, "resolveQrFlags").mockReturnValue(flags);
    const originalMount = rendererModule.createProductionRuntimeSceneRenderer;
    const owners: object[] = [];
    vi.spyOn(rendererModule, "createProductionRuntimeSceneRenderer").mockImplementation((...args) => {
      expect(args[7]?.ownRenderInputCache).toBe(true);
      owners.push(args[7]!.runtimeOwner!);
      return originalMount(...args);
    });
    const create = Renderer.create.bind(Renderer);
    const devices: Renderer[] = [];
    vi.spyOn(Renderer, "create").mockImplementation(async options => {
      const renderer = await create({ ...options, backend: "mock", requiredFeatures: [] });
      Object.defineProperty(renderer.device, "kind", { value: "webgl2" });
      Object.defineProperty(renderer.device, "info", { value: {
        ...renderer.device.info, capabilities: [...(renderer.device.info.capabilities ?? []), "hdr-render-targets"]
      } });
      vi.spyOn(renderer, "renderAsync");
      devices.push(renderer);
      return renderer;
    });
    const host = new Port(), remote = new Port(); host.peer = remote; remote.peer = host;
    const stop = installWorkerRenderer(remote as unknown as AuraWorkerEndpoint<AuraWorkerRequest, AuraWorkerResponse>);
    const target = new FakeOffscreenCanvas(8, 8) as unknown as OffscreenCanvas;
    const worker = createWorkerRenderer({
      canvas: target, worker: host as unknown as AuraWorkerHostEndpoint,
      scene: snapshot("first", core), renderer: { backend: "webgl2" }, autoStart: false
    });
    try {
      await worker.ready;
      expect(owners).toHaveLength(1);
      expect(frameUsesLegacyModelMatrix(owners[0]!)).toBe(!core);
      await worker.step(0.016, 1);
      const source = vi.mocked(devices[0]!.renderAsync).mock.calls[0]![0] as RenderSource;
      const item = [...(source.collectRenderItems?.() ?? [])][0]!;
      expect(item.modelMatrix![0]).toBeCloseTo(core ? 0 : 1);
      expect(item.modelMatrix![2]).toBeCloseTo(core ? -1 : 0);
      expect(item.instanceColors![0]).toBeCloseTo(1);

      await worker.setScene(snapshot("next", core));
      expect(owners).toHaveLength(2);
      expect(owners[1]).not.toBe(owners[0]);
      expect(frameUsesLegacyModelMatrix(owners[0]!)).toBe(true);
      expect(frameUsesLegacyModelMatrix(owners[1]!)).toBe(!core);
      await worker.step(0.016, 2);
      const next = vi.mocked(devices[1]!.renderAsync).mock.calls[0]![0] as RenderSource;
      expect([...(next.collectRenderItems?.() ?? [])][0]!.modelMatrix![2]).toBeCloseTo(core ? -1 : 0);
    } finally {
      await worker.dispose();
      await stop();
    }
    expect(frameUsesLegacyModelMatrix(owners[1]!)).toBe(true);
  });

  it("releases a worker-owned cache when renderer creation fails", async () => {
    const owner = {};
    const flags = flagsModule.resolveQrFlags({ options: { A3D_QR_CORE: true } });
    setPrd01ModelMatrixCache(null);
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
    vi.spyOn(Renderer, "create").mockImplementation(async () => {
      expect(frameUsesLegacyModelMatrix(owner)).toBe(false);
      throw new Error("mock device failure");
    });
    await expect(rendererModule.createProductionRuntimeSceneRenderer(
      new FakeOffscreenCanvas(8, 8) as unknown as OffscreenCanvas, snapshot("failure", false),
      { backend: "webgl2" }, undefined, flags, undefined, undefined, { runtimeOwner: owner, ownRenderInputCache: true }
    )).rejects.toThrow(/mock device failure/);
    expect(frameUsesLegacyModelMatrix(owner)).toBe(true);
  });
});
