import { afterEach, describe, expect, it, vi } from "vitest";
import { TextureHandle, texture } from "../../../packages/engine/src/agent-api/nodes/texture.js";
import { createWorkerRenderer, installWorkerRenderer } from "../../../packages/engine/src/agent-api/app/workerRuntime.js";
import { createWorkerNodeMirror } from "../../../packages/engine/src/agent-api/app/workerNodes.js";
import type { AuraWorkerEndpoint, AuraWorkerHostEndpoint, AuraWorkerRequest, AuraWorkerResponse } from "../../../packages/engine/src/agent-api/app/workerProtocol.js";
import type { AuraSceneSnapshot, WebGLSceneRenderer } from "../../../packages/engine/src/agent-api/nodes/types.js";

/** A 2D-canvas stand-in: drawImage copies a source's `pixels`, getImageData/putImageData read and write them. */
class Fake2D {
  constructor(readonly canvas: FakeCanvas) {}
  globalCompositeOperation = "source-over";
  drawImage(source: { pixels: Uint8ClampedArray }): void { this.canvas.pixels = new Uint8ClampedArray(source.pixels); }
  getImageData(_x: number, _y: number, width: number, height: number) {
    return { data: new Uint8ClampedArray(this.canvas.pixels.subarray(0, width * height * 4)) };
  }
  putImageData(image: { data: Uint8ClampedArray }): void { this.canvas.pixels = new Uint8ClampedArray(image.data); }
}
class FakeCanvas {
  pixels: Uint8ClampedArray;
  constructor(public width: number, public height: number) { this.pixels = new Uint8ClampedArray(width * height * 4); }
  getContext(kind: string) { return kind === "2d" ? new Fake2D(this) : null; }
}
class FakeImageData {
  constructor(readonly data: Uint8ClampedArray, readonly width: number, readonly height: number) {}
}

class HostCanvas {
  width = 8; height = 8; transfers = 0;
  transferControlToOffscreen(): OffscreenCanvas { this.transfers++; return { width: this.width, height: this.height } as OffscreenCanvas; }
}
class Port {
  peer?: Port;
  readonly listeners = new Map<string, Set<(event: any) => void>>();
  terminated = 0;
  postMessage(message: any, transfer: Transferable[] = []): void {
    const cloned = message.type === "init"
      ? { ...structuredClone({ ...message, canvas: undefined }, { transfer: transfer.slice(1) }), canvas: message.canvas }
      : structuredClone(message, { transfer });
    queueMicrotask(() => { if (!this.terminated) this.peer?.emit("message", { data: cloned }); });
  }
  addEventListener(type: string, listener: (event: any) => void): void {
    const list = this.listeners.get(type) ?? new Set(); list.add(listener); this.listeners.set(type, list);
  }
  removeEventListener(type: string, listener: (event: any) => void): void { this.listeners.get(type)?.delete(listener); }
  emit(type: string, event: unknown): void { for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event); }
  terminate(): void { this.terminated++; }
}
const render = (): WebGLSceneRenderer => ({
  backend: "webgl2", diagnostics: {}, render: () => 1, resize: () => {}, resetTemporalHistory: () => {},
  viewProjection: () => new Float32Array(16), onDeviceLost: () => () => {}, onDeviceRestored: () => () => {},
  deviceLost: () => false, dispose: () => {}, whenDisposed: () => Promise.resolve()
}) as unknown as WebGLSceneRenderer;
const snapshot = (handle: unknown): AuraSceneSnapshot => ({
  schema: "aura3d-scene-snapshot/1.0", background: "#000", camera: {}, diagnostics: { enabled: false },
  nodes: [{ kind: "primitive", name: "board", material: { texture: handle, normal: handle } }]
}) as unknown as AuraSceneSnapshot;

afterEach(() => { vi.unstubAllGlobals(); });

describe("live canvas textures across the worker boundary", () => {
  it("snapshots a texture.canvas source, rebuilds it on an OffscreenCanvas and forwards host repaints as texture ops", async () => {
    vi.stubGlobal("OffscreenCanvas", FakeCanvas);
    vi.stubGlobal("ImageData", FakeImageData);
    const board = new FakeCanvas(2, 1);
    board.pixels.set([10, 20, 30, 255, 40, 50, 60, 255]);
    const handle = texture.canvas({ canvas: board as unknown as HTMLCanvasElement, colorSpace: "srgb" });
    handle.anisotropy = 8;
    handle.needsUpdate = true;
    const host = new Port(), remote = new Port(); host.peer = remote; remote.peer = host;
    let captured!: TextureHandle;
    const stop = installWorkerRenderer(remote as unknown as AuraWorkerEndpoint<AuraWorkerRequest, AuraWorkerResponse>, {
      createRenderer: async (_canvas, scene) => {
        captured = (scene.nodes[0] as any).material.texture;
        expect((scene.nodes[0] as any).material.normal).toBe(captured);
        return render();
      }
    });
    const app = createWorkerRenderer({ canvas: new HostCanvas() as unknown as HTMLCanvasElement, worker: host as unknown as AuraWorkerHostEndpoint,
      scene: snapshot(handle), autoStart: false, bridgeEvents: false });
    try {
      await app.ready;
      const workerTexture = captured.texture;
      // Same upload interpretation as the host's canvas texture.
      expect(workerTexture.source).toBeInstanceOf(FakeCanvas);
      expect(workerTexture).toMatchObject({ width: 2, height: 1, colorSpace: "srgb", flipY: true, generateMipmaps: true, dynamic: true });
      expect([...(workerTexture.source as unknown as FakeCanvas).pixels]).toEqual([10, 20, 30, 255, 40, 50, 60, 255]);
      expect(captured.anisotropy).toBe(8);

      // Host mirror: no op until the page repaints and marks the texture.
      const mirror = createWorkerNodeMirror(snapshot(handle));
      expect(mirror.pending).toBe(0);
      board.pixels.set([1, 2, 3, 255, 4, 5, 6, 255]);
      handle.needsUpdate = true;
      expect(mirror.pending).toBe(1);
      const ops = mirror.drain();
      expect(ops).toHaveLength(1);
      expect(ops[0]).toMatchObject({ texture: handle.id, width: 2, height: 1 });
      expect(mirror.pending).toBe(0);
      // A second repaint is a new revision even though the host never uploads.
      handle.needsUpdate = true;
      expect(mirror.pending).toBe(1);
      mirror.drain();

      const revision = workerTexture.revision;
      await app.patch(ops);
      expect([...(workerTexture.source as unknown as FakeCanvas).pixels]).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
      expect(workerTexture.revision).toBeGreaterThan(revision);
      // A size change is rejected (the worker texture keeps its allocation).
      await expect(app.patch([{ texture: handle.id, width: 1, height: 1, data: new Uint8ClampedArray(4) }])).rejects.toThrow(/2x1 RGBA8/);
      mirror.dispose();
    } finally {
      await app.dispose();
      await stop();
    }
    expect(captured.texture.disposed).toBe(true);
    handle.dispose();
  });

  it("keeps rejecting live video sources", () => {
    vi.stubGlobal("OffscreenCanvas", FakeCanvas);
    const video = Object.assign(new FakeCanvas(2, 2), { videoWidth: 2, videoHeight: 2, currentTime: 0, readyState: 4 });
    const handle = texture.video({ video: video as unknown as HTMLVideoElement });
    const host = new Port();
    const canvas = new HostCanvas();
    expect(() => createWorkerRenderer({ canvas: canvas as unknown as HTMLCanvasElement, worker: host as unknown as AuraWorkerHostEndpoint,
      scene: snapshot(handle), bridgeEvents: false })).toThrow(/Live texture handles cannot cross worker realms/);
    expect(canvas.transfers).toBe(0);
    handle.dispose();
  });
});
