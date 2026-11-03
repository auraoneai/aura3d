import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("native drawing pipelines", () => {
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("renders one authored scene through deferred, meshlet and visibility paths", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/rendering-webgpu-harness.html`);
    const report = await page.evaluate(async () => {
      // Native API is intentionally described structurally; DOM's bundled TS
      // libraries do not yet include all WebGPU declarations.
      const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<any> } }).gpu;
      if (!gpu) return { unsupported: "navigator.gpu is unavailable", results: [], adapter: "", errors: [] as string[] };
      const adapter = await gpu.requestAdapter();
      if (!adapter) return { unsupported: "WebGPU adapter unavailable", results: [], adapter: "", errors: [] as string[] };
      const device = await adapter.requestDevice();
      // This source barrel corresponds to the public @aura3d/rendering/webgpu subpath.
      const pipelinesPath = "/packages/rendering/src/webgpu.ts";
      const geometryPath = "/packages/rendering/src/Geometry.ts";
      const materialPath = "/packages/rendering/src/UnlitMaterial.ts";
      const [{ DeferredPipeline, MeshletPipeline, VisibilityBufferPipeline, nativeDrawingSceneFromRenderItems }, { Geometry }, { UnlitMaterial }] = await Promise.all([
        import(pipelinesPath), import(geometryPath), import(materialPath)
      ]);
      const shiftedModel = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 2,0,0,1]);
      const scene = nativeDrawingSceneFromRenderItems([
        { geometry: Geometry.triangle(), material: new UnlitMaterial({ color: [1, .25, .125, 1] }) },
        { geometry: Geometry.triangle(), material: new UnlitMaterial({ color: [.125, 1, .25, 1] }), modelMatrix: shiftedModel }
      ]);
      const texture = device.createTexture({ size: [64, 64, 1], format: "rgba8unorm", usage: 0x10 | 0x01 });
      const identity = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
      const constructors = [DeferredPipeline, MeshletPipeline, VisibilityBufferPipeline];
      const results = [] as { requested: string; active: string; drawCalls: number; triangles: number; computeDispatches?: number; center: number[]; movedCenter: number[]; corner: number[] }[];
      const nativeErrors: string[] = [];
      try {
        for (const Constructor of constructors) {
          device.pushErrorScope("validation");
          const pipeline = new Constructor(device, { outputFormat: "rgba8unorm", maxVertices: 3, maxTriangles: 1 });
          const surface = { view: texture.createView(), width: 64, height: 64 };
          const sampleFrame = async (viewProjection: number[]) => {
            const diagnostics = pipeline.render({ scene, viewProjection, surface, clearColor: [0,0,0,1] });
            const readback = device.createBuffer({ size: 64 * 256, usage: 0x01 | 0x08 });
            const encoder = device.createCommandEncoder();
            encoder.copyTextureToBuffer({ texture }, { buffer: readback, bytesPerRow: 256 }, [64,64,1]);
            device.queue.submit([encoder.finish()]);
            await readback.mapAsync(0x01);
            const pixels = new Uint8Array(readback.getMappedRange());
            const sample = (x: number, y: number) => Array.from(pixels.slice(y * 256 + x * 4, y * 256 + x * 4 + 4));
            const result = { diagnostics, center: sample(32,32), corner: sample(2,2) };
            readback.unmap(); readback.destroy();
            return result;
          };
          const first = await sampleFrame(identity);
          const moved = [...identity]; moved[12] = -2;
          const second = await sampleFrame(moved);
          results.push({ ...first.diagnostics, center: first.center, movedCenter: second.center, corner: first.corner });
          pipeline.dispose();
          const error = await device.popErrorScope();
          if (error) nativeErrors.push(String(error.message));
        }
        await device.queue.onSubmittedWorkDone();
        return { unsupported: "", results, adapter: adapter.info?.description || adapter.info?.device || "adapter available (identity withheld)", errors: nativeErrors };
      } finally { texture.destroy(); device.destroy(); }
    });
    test.skip(Boolean(report.unsupported), report.unsupported);
    await testInfo.attach("native-drawing-pipeline-report", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
    expect(errors).toEqual([]);
    expect(report.errors).toEqual([]);
    expect(report.adapter).toBeTruthy();
    expect(report.results.map(result => result.active)).toEqual(["deferred", "meshlet", "visibility"]);
    for (const result of report.results) {
      expect(result.triangles).toBe(2);
      expect(result.drawCalls).toBeGreaterThan(0);
      expect(result.corner).toEqual([0,0,0,255]);
      expect(result.center[0]).toBeGreaterThan(245);
      expect(result.center[1]).toBeGreaterThan(55);
      expect(result.center[1]).toBeLessThan(75);
      expect(result.center[2]).toBeGreaterThan(25);
      expect(result.center[2]).toBeLessThan(40);
      expect(result.movedCenter[0]).toBeGreaterThan(25);
      expect(result.movedCenter[0]).toBeLessThan(40);
      expect(result.movedCenter[1]).toBeGreaterThan(245);
      expect(result.movedCenter[2]).toBeGreaterThan(55);
      expect(result.movedCenter[2]).toBeLessThan(75);
      if (result.active === "meshlet") expect(result.computeDispatches).toBe(1);
    }
    for (const result of report.results.slice(1)) for (let channel = 0; channel < 4; channel++) {
      expect(Math.abs(result.center[channel]! - report.results[0]!.center[channel]!)).toBeLessThanOrEqual(2);
      expect(Math.abs(result.movedCenter[channel]! - report.results[0]!.movedCenter[channel]!)).toBeLessThanOrEqual(2);
    }
  });
});
