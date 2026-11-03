import { afterEach, describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import { createAuraApp, primitives, scene } from "../../../packages/engine/src/public/index";
import { startProductionRender } from "../../../packages/engine/src/agent-api/app/frameLoop";
import { createInitialDiagnostics } from "../../../packages/engine/src/agent-api/diagnostics";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { MockRenderDevice, type RenderShaderProgram, type ShaderSources } from "../../../packages/rendering/src/RenderDevice";
import { ProgramCache } from "../../../packages/rendering/src/program/ProgramCache";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";

class DeferredDevice extends MockRenderDevice {
  readonly pending: { source: ShaderSources; resolve: (program: RenderShaderProgram) => void }[] = [];
  constructor() {
    super();
    // The actual production mount insists on its selected backend. The device
    // remains a command-only mock; no WebGL or browser execution is claimed.
    Object.defineProperty(this, "kind", { value: "webgl2" });
  }
  compileAsync(source: ShaderSources): Promise<RenderShaderProgram> {
    return new Promise(resolve => { this.pending.push({ source, resolve }); });
  }
}

class FakeCanvas {
  width = 64; height = 64; clientWidth = 64; clientHeight = 64;
  style: Record<string, string> = {}; dataset: Record<string, string> = {}; parentElement = null;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {} removeEventListener() {}
}

const flush = async () => { for (let i = 0; i < 32; i++) await Promise.resolve(); };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("root static-frame program readiness", () => {
  it("redraws only the owning app after compile completion and releases its subscription", async () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextId = 0;
    vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
    vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { search: "", href: "https://site.test/" }, addEventListener() {}, removeEventListener() {} });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { const id = ++nextId; callbacks.set(id, callback); return id; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
    const mounted: { device: DeferredDevice; draws: number; invalidations: number }[] = [];
    vi.spyOn(Renderer, "create").mockImplementation(async () => {
      const entry = { device: new DeferredDevice(), draws: 0, invalidations: 0 };
      mounted.push(entry);
      const render = () => { entry.draws++; return entry.device.getDiagnostics(); };
      return {
        device: entry.device,
        getDiagnostics: () => entry.device.getDiagnostics(), getShadowEvidence: () => null,
        isDeviceLost: () => entry.device.contextLost,
        onDeviceLost: () => () => {}, onDeviceRestored: () => () => {},
        invalidateBenchmarkMaskFrame: () => { entry.invalidations++; }, resetTemporalHistory() {}, resize() {},
        postDiagnosticViews: () => undefined, postScopeId: () => undefined,
        render, renderAsync: async () => render(), dispose: () => entry.device.dispose()
      } as unknown as Renderer;
    });
    const options = { autoStart: true, resize: false, diagnostics: false, frameMode: "async" as const,
      renderer: { backend: "webgl2" as const }, qualityRebuild: { flags: "none" as const } };
    const snapshotA = scene().add(primitives.box()).toJSON();
    const snapshotB = scene().add(primitives.box()).toJSON();
    const [appA, appB] = await Promise.all([
      startProductionRender(new FakeCanvas() as unknown as HTMLCanvasElement, snapshotA, createInitialDiagnostics(snapshotA, undefined), { ...options, scene: snapshotA }),
      startProductionRender(new FakeCanvas() as unknown as HTMLCanvasElement, snapshotB, createInitialDiagnostics(snapshotB, undefined), { ...options, scene: snapshotB })
    ]);
    let cacheA: ProgramCache | undefined;
    let cacheB: ProgramCache | undefined;
    try {
      await flush();
      expect(mounted).toHaveLength(2);
      const [a, b] = mounted as [typeof mounted[number], typeof mounted[number]];
      expect([a.draws, b.draws]).toEqual([1, 1]);
      expect(callbacks.size).toBe(0);
      const originalInvalidations = [a.invalidations, b.invalidations];
      cacheA = new ProgramCache(a.device, { parallelCompile: true });
      const pending = cacheA.acquire(normalizeProgramFeatures({ lighting: "lit" }));
      expect(pending.status).toBe("pending");
      const request = a.device.pending[0]!;
      request.resolve(a.device.createShaderProgram(request.source));
      await flush();
      expect(pending.status).toBe("ready");
      expect([a.invalidations, b.invalidations]).toEqual([originalInvalidations[0]! + 1, originalInvalidations[1]]);
      expect(callbacks.size).toBe(1);
      const [id, callback] = [...callbacks.entries()][0]!;
      callbacks.delete(id); callback(16);
      await flush();
      expect([a.draws, b.draws]).toEqual([2, 1]);
      expect(callbacks.size).toBe(0);
      // A bounded synchronous compile must also schedule a retry for its own
      // static frame, rather than leaving the pending program undisplayed.
      cacheB = new ProgramCache(b.device, { parallelCompile: false, maxSyncCompilesPerFrame: 1 });
      expect(cacheB.acquire(normalizeProgramFeatures({ lighting: "lit" })).status).toBe("ready");
      expect(cacheB.acquire(normalizeProgramFeatures({ lighting: "unlit" })).status).toBe("pending");
      await flush();
      expect(callbacks.size).toBe(1);
      const [retryId, retry] = [...callbacks.entries()][0]!;
      callbacks.delete(retryId); retry(32);
      await flush();
      expect([a.draws, b.draws]).toEqual([2, 2]);
      cacheB.beginFrame();
      expect(cacheB.acquire(normalizeProgramFeatures({ lighting: "unlit" })).status).toBe("ready");
      const invalidations = a.invalidations;
      const later = cacheA.acquire(normalizeProgramFeatures({ lighting: "unlit" }));
      expect(later.status).toBe("pending");
      const laterRequest = a.device.pending[1]!;
      laterRequest.resolve(a.device.createShaderProgram(laterRequest.source));
      appA.dispose();
      await flush();
      expect(callbacks.size).toBe(0);
      expect(a.invalidations).toBe(invalidations + 1); // Disposal invalidates its own snapshot.
      expect(b.draws).toBe(2);
    } finally {
      cacheA?.dispose();
      cacheB?.dispose();
      appA.dispose(); appB.dispose();
      await Promise.all([appA.whenIdle?.(), appB.whenIdle?.()]);
    }
  });

  it("subscribes and detaches through the public app mount", async () => {
    vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
    vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { search: "", href: "https://site.test/" }, addEventListener() {}, removeEventListener() {} });
    const device = new DeferredDevice();
    let invalidations = 0;
    const render = () => device.getDiagnostics();
    vi.spyOn(Renderer, "create").mockResolvedValue({
      device, getDiagnostics: () => device.getDiagnostics(), getShadowEvidence: () => null,
      isDeviceLost: () => device.contextLost, onDeviceLost: () => () => {}, onDeviceRestored: () => () => {},
      invalidateBenchmarkMaskFrame: () => { invalidations++; }, resetTemporalHistory() {}, resize() {},
      postDiagnosticViews: () => undefined, postScopeId: () => undefined,
      render, renderAsync: async () => render(), dispose: () => device.dispose()
    } as unknown as Renderer);
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: scene().add(primitives.box()), autoStart: false, resize: false, diagnostics: false,
      renderer: { backend: "webgl2" }, qualityRebuild: { flags: "none" }
    });
    const cache = new ProgramCache(device, { parallelCompile: true });
    try {
      await app.readyStrict();
      const before = invalidations;
      const pending = cache.acquire(normalizeProgramFeatures({ lighting: "lit" }));
      const request = device.pending[0]!;
      request.resolve(device.createShaderProgram(request.source));
      await flush();
      expect(pending.status).toBe("ready");
      expect(invalidations).toBe(before + 1);
      const next = cache.acquire(normalizeProgramFeatures({ lighting: "unlit" }));
      expect(next.status).toBe("pending");
      const laterRequest = device.pending[1]!;
      laterRequest.resolve(device.createShaderProgram(laterRequest.source));
      app.dispose();
      const disposedInvalidations = invalidations;
      await flush();
      expect(invalidations).toBe(disposedInvalidations);
    } finally {
      cache.dispose();
      await app.disposeAsync();
    }
  });
});
