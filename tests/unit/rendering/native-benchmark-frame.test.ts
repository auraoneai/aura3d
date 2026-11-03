import { afterEach, describe, expect, it, vi } from "vitest";
import { identityMat4 } from "@aura3d/scene";
import { createAuraApp, primitives, scene } from "../../../packages/engine/src/public/index";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { ForwardPass, type ForwardPassOptions } from "../../../packages/rendering/src/ForwardPass";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { registerFrameContributor } from "../../../packages/rendering/src/contracts/frameGraph";
import { registerBenchmarkNonSceneContributor } from "../../../packages/rendering/src/renderer/FrameGraph";

class FakeCanvas {
  width = 64; height = 64; clientWidth = 64; clientHeight = 64;
  style: Record<string, string> = {}; dataset: Record<string, string> = {}; parentElement = null;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {} removeEventListener() {}
}
const camera = { viewProjectionMatrix: identityMat4(), layerMask: 1 };
const flags = { values: { A3D_QR_CORE: true }, on: (name: string) => name === "A3D_QR_CORE" };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("armed benchmark frame snapshots", () => {
  it.each([false, true])("captures the post-collect order and rejects changes to submitted resources (async=%s)", async asynchronous => {
    const renderer = await Renderer.create({ backend: "mock", width: 64, height: 64, qrFlags: flags });
    const geometry = Geometry.triangle(), material = new UnlitMaterial();
    const unregister = registerFrameContributor({ id: "prd01.benchmark-collect", owner: "prd01", flag: "A3D_QR_CORE", phases: ["collect"],
      collect(items) { return items.map(item => ({ ...item, label: `${item.label}:collected` })); } });
    const source = { renderItems: [
      { geometry, material, label: "later", renderOrder: 2, modelMatrix: identityMat4() },
      { geometry, material, label: "first", renderOrder: 1, modelMatrix: identityMat4() }
    ] };
    const draw = async () => { if (asynchronous) await renderer.renderAsync(source, camera); else renderer.render(source, camera); };
    const disarm = renderer.armBenchmarkMaskFrame();
    try {
      expect(renderer.benchmarkMaskFrame()).toBeNull();
      await draw();
      const frame = renderer.benchmarkMaskFrame();
      expect(frame && "items" in frame).toBe(true);
      if (!frame || !("items" in frame)) throw new Error("expected frame");
      expect(frame.items.map(item => item.label)).toEqual(["first:collected", "later:collected"]);
      expect(frame.layerMask).toBe(1);
      expect(frame.viewProjectionMatrix).toEqual(Array.from(camera.viewProjectionMatrix));
      expect(Object.isFrozen(frame.items)).toBe(true);
      expect(Object.isFrozen(frame.items[0]!.modelMatrix)).toBe(true);
      geometry.indexBuffer!.data[0] = 2; // Even an unmarked direct CPU write invalidates the snapshot.
      expect(renderer.benchmarkMaskFrame()).toBeNull();
      await draw();
      geometry.vertexBuffer.setAttribute(0, "position", [-0.25, -0.5, 0]);
      expect(renderer.benchmarkMaskFrame()).toBeNull();
      await draw();
      material.setParameter("u_color", [0, 1, 0, 1]);
      expect(renderer.benchmarkMaskFrame()).toBeNull();
      await draw();
      (material.renderState as { cullMode: string }).cullMode = "front";
      expect(renderer.benchmarkMaskFrame()).toBeNull();
      (material.renderState as { cullMode: string }).cullMode = "back";
      await draw();
      geometry.indexBuffer!.dispose();
      expect(renderer.benchmarkMaskFrame()).toBeNull();
    } finally { disarm(); unregister(); renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("rejects additional contributor passes and multiview instead of guessing their identities", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 64, height: 64, qrFlags: flags });
    const geometry = Geometry.triangle(), material = new UnlitMaterial();
    const unregister = registerFrameContributor({ id: "prd01.benchmark-extra", owner: "prd01", flag: "A3D_QR_CORE", phases: ["after-opaque"],
      passes: () => [{ name: "prd01.benchmark-extra", reads: [], writes: [], execute() {} }] });
    const disarm = renderer.armBenchmarkMaskFrame();
    try {
      const source = { renderItems: [{ geometry, material }] };
      renderer.render(source, camera);
      expect(renderer.benchmarkMaskFrame()).toMatchObject({ unsupported: expect.stringContaining("contributor geometry") });
      unregister();
      renderer.render({ source, views: [
        { id: "left", camera, viewport: { x: 0, y: 0, width: 32, height: 64 } },
        { id: "right", camera, viewport: { x: 32, y: 0, width: 32, height: 64 } }
      ] });
      expect(renderer.benchmarkMaskFrame()).toMatchObject({ unsupported: expect.stringContaining("multi-view") });
    } finally { disarm(); unregister(); renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it.each(["shadows", "post-hdr"] as const)("rejects an untrusted custom %s pass", async phase => {
    const renderer = await Renderer.create({ backend: "mock", width: 64, height: 64, qrFlags: flags });
    const geometry = Geometry.triangle(), material = new UnlitMaterial();
    const unregister = registerFrameContributor({ id: `prd01.benchmark-custom-${phase}`, owner: "prd01", flag: "A3D_QR_CORE", phases: [phase],
      passes: () => [{ name: `prd01.benchmark-custom-${phase}`, reads: [], writes: [], execute() {} }] });
    const disarm = renderer.armBenchmarkMaskFrame();
    try {
      renderer.render({ renderItems: [{ geometry, material }], ...(phase === "post-hdr" ? { postprocess: { sampleCount: 1, toneMapping: { operator: "linear" as const } } } : {}) }, camera);
      expect(renderer.benchmarkMaskFrame()).toMatchObject({ unsupported: expect.stringContaining("contributor geometry") });
    } finally { disarm(); unregister(); renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("does not transfer a provider's non-scene proof to a same-ID replacement", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 64, height: 64, qrFlags: flags });
    const geometry = Geometry.triangle(), material = new UnlitMaterial();
    const trusted = { id: "prd01.benchmark-proof", owner: "prd01" as const, flag: "A3D_QR_CORE" as const, phases: ["shadows" as const],
      passes: () => [{ name: "prd01.benchmark-proof", reads: [], writes: [], execute() {} }] };
    registerBenchmarkNonSceneContributor(trusted, ["shadows"]);
    const disarm = renderer.armBenchmarkMaskFrame();
    let unregister = registerFrameContributor(trusted);
    try {
      renderer.render({ renderItems: [{ geometry, material }] }, camera);
      expect(renderer.benchmarkMaskFrame()).toHaveProperty("items");
      unregister();
      unregister = registerFrameContributor({ ...trusted });
      renderer.render({ renderItems: [{ geometry, material }] }, camera);
      expect(renderer.benchmarkMaskFrame()).toMatchObject({ unsupported: expect.stringContaining("contributor geometry") });
    } finally { disarm(); unregister(); renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("tracks index writes and disposal without changing failed or empty updates", () => {
    const geometry = Geometry.triangle(), index = geometry.indexBuffer!;
    const before = index.revision;
    expect(() => index.setIndices(0, [999999])).toThrow();
    index.setIndices(0, []);
    expect(index.revision).toBe(before);
    index.setIndices(0, [2]);
    expect(index.revision).toBe(before + 1);
    geometry.dispose();
    expect(index.revision).toBe(before + 2);
  });

  it("preserves wind-labelled draw identities when static optimizers are enabled", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 64, height: 64 });
    const geometry = Geometry.triangle(), material = new UnlitMaterial();
    const original = ForwardPass.prototype.execute;
    const drawn: ForwardPassOptions["items"][number][] = [];
    const execute = vi.spyOn(ForwardPass.prototype, "execute").mockImplementation(function (this: ForwardPass, context) {
      drawn.push(...(this as unknown as { options: ForwardPassOptions }).options.items);
      return original.call(this, context);
    });
    try {
      const source = { staticBatching: true, staticMeshConsolidation: true, renderItems: [
        { geometry, material, label: "prd10.wind:oak", modelMatrix: identityMat4() },
        { geometry, material, label: "prd10.wind:pine", modelMatrix: identityMat4() }
      ] };
      renderer.render(source, camera);
      expect(drawn.map(item => item.label)).toEqual(["prd10.wind:oak", "prd10.wind:pine"]);
      expect(drawn.every(item => item.instanceTransforms === undefined)).toBe(true);
      expect(renderer.getDiagnostics().drawCalls).toBe(2);
    } finally { execute.mockRestore(); renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("exposes only an armed, successful, idle public-root frame and revokes it on dispose", async () => {
    vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
    vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { href: "http://localhost/", search: "" }, addEventListener() {}, removeEventListener() {} });
    const create = Renderer.create.bind(Renderer);
    vi.spyOn(Renderer, "create").mockImplementation(async options => {
      const renderer = await create({ ...options, backend: "mock", requiredFeatures: [] });
      const device = renderer.device as MockRenderDevice;
      Object.defineProperty(device, "kind", { value: "webgl2" });
      Object.defineProperty(device, "info", { value: { ...device.info, capabilities: [...(device.info.capabilities ?? []), "hdr-render-targets"] } });
      return renderer;
    });
    const canvas = new FakeCanvas() as unknown as HTMLCanvasElement;
    const app = createAuraApp(canvas, { scene: scene().add(primitives.box({ name: "box" })), autoStart: false, resize: false, diagnostics: false, pixelRatio: 1, strict: true });
    try {
      await app.ready();
      const renderer = (app as unknown as Record<symbol, Record<symbol, () => unknown>>)[Symbol.for("a3d.prd01.renderer")]!;
      const arm = renderer[Symbol.for("a3d.benchmark.armFrameSnapshot")]!;
      const last = renderer[Symbol.for("a3d.benchmark.lastFrame")]!;
      expect(() => last()).toThrow(/BENCHMARK_FRAME_UNAVAILABLE/);
      const disarm = arm() as () => void;
      expect(() => last()).toThrow(/BENCHMARK_FRAME_UNAVAILABLE/);
      await app.stepAsync(0);
      const frame = last() as { device: unknown; canvas: HTMLCanvasElement; width: number; height: number; source: { renderItems: readonly unknown[] }; camera: { viewProjectionMatrix: readonly number[] } };
      expect(frame).toMatchObject({ canvas, width: 64, height: 64 });
      expect(frame.source.renderItems).toHaveLength(1);
      expect(frame.camera.viewProjectionMatrix).toHaveLength(16);
      expect(Object.isFrozen(frame.source.renderItems)).toBe(true);
      disarm(); disarm();
      expect(() => last()).toThrow(/BENCHMARK_FRAME_UNAVAILABLE/);
      app.dispose();
      expect(() => last()).toThrow(/BENCHMARK_FRAME_DISPOSED/);
    } finally { app.dispose(); }
  });
});
