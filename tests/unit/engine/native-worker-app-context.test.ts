import { afterEach, describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd01.js";
import "../../../packages/engine/src/lanes/prd07.js";
import { Renderer } from "../../../packages/rendering/src/Renderer.js";
import { createWorkerRenderer, installWorkerRenderer } from "../../../packages/engine/src/agent-api/app/workerRuntime.js";
import type { AuraWorkerEndpoint, AuraWorkerHostEndpoint, AuraWorkerRequest, AuraWorkerResponse } from "../../../packages/engine/src/agent-api/app/workerProtocol.js";
import * as flagsModule from "../../../packages/engine/src/contracts/flags.js";
import * as rendererModule from "../../../packages/engine/src/agent-api/compiler/renderer.js";
import { authoredPostContextFor } from "../../../packages/engine/src/agent-api/postBridge.js";
import { createProductionRuntimeEnvironmentFog, prd07FogRuntimeState } from "../../../packages/engine/src/agent-api/compiler/fog.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import type { AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types.js";

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

/** A linear fog the legacy (no-atmosphere) path turns into an exp2 approximation. */
function fogScene(): AuraSceneSnapshot {
  return {
    ...scene().toJSON(),
    nodes: [
      { kind: "primitive", primitive: "box", name: "box" },
      { kind: "effect", effect: "fog", name: "court fog", mode: "linear", color: "#4a4a62", near: 28, far: 210, density: 0.0094, intensity: 0.85 }
    ]
  } as unknown as AuraSceneSnapshot;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("worker renderer app context (main-thread app extensions mirrored in the worker realm)", () => {
  it("records the authored post context for its canvas and binds the PRD-07 atmosphere to its runtime owner", async () => {
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
    vi.stubGlobal("WebGL2RenderingContext", undefined);
    vi.stubGlobal("document", undefined);
    const flags = flagsModule.resolveQrFlags({ options: {
      A3D_QR_CORE: true, A3D_QR_COMPILER: true, A3D_QR_CORE_GENERATOR: false, A3D_QR_CORE_OUTPUT: false,
      A3D_QR_LIGHTING: false, A3D_QR_POST: true, A3D_QR_VFX: true, A3D_QR_VFX_FOG: true
    } });
    vi.spyOn(flagsModule, "resolveQrFlags").mockReturnValue(flags);
    const originalMount = rendererModule.createProductionRuntimeSceneRenderer;
    const mounts: { canvas: unknown; owner: object; authority: unknown }[] = [];
    vi.spyOn(rendererModule, "createProductionRuntimeSceneRenderer").mockImplementation((...args) => {
      const owner = args[7]!.runtimeOwner!;
      // Both contexts exist before the compiler's first frame.
      expect(authoredPostContextFor(args[0] as never)?.flags.post).toBe(true);
      expect(prd07FogRuntimeState(owner)).not.toBeNull();
      mounts.push({ canvas: args[0], owner, authority: args[7]!.getPrd07MountAuthority });
      return originalMount(...args);
    });
    const create = Renderer.create.bind(Renderer);
    vi.spyOn(Renderer, "create").mockImplementation(async options => {
      const renderer = await create({ ...options, backend: "mock", requiredFeatures: [] });
      Object.defineProperty(renderer.device, "kind", { value: "webgl2" });
      Object.defineProperty(renderer.device, "info", { value: {
        ...renderer.device.info, capabilities: [...(renderer.device.info.capabilities ?? []), "hdr-render-targets"]
      } });
      return renderer;
    });
    const host = new Port(), remote = new Port(); host.peer = remote; remote.peer = host;
    const stop = installWorkerRenderer(remote as unknown as AuraWorkerEndpoint<AuraWorkerRequest, AuraWorkerResponse>);
    const target = new FakeOffscreenCanvas(8, 8) as unknown as OffscreenCanvas;
    const worker = createWorkerRenderer({
      canvas: target, worker: host as unknown as AuraWorkerHostEndpoint,
      scene: fogScene(), renderer: { backend: "webgl2" }, autoStart: false
    });
    let owner: object | undefined;
    try {
      await worker.ready;
      expect(mounts).toHaveLength(1);
      owner = mounts[0]!.owner;
      expect(typeof mounts[0]!.authority).toBe("function");
      // The compiler resolves the authored linear fog through the live atmosphere, as on the main thread.
      const fog = createProductionRuntimeEnvironmentFog(fogScene(), [], 8, 8, owner);
      expect(fog).not.toBe(false);
      expect((fog as { mode: string }).mode).toBe("linear");
    } finally {
      await worker.dispose();
      await stop();
    }
    expect(prd07FogRuntimeState(owner)).toBeNull();
  });
});
