import { expect, test } from "@playwright/test";
import { realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import sharp from "sharp";
import { type Plugin, type ViteDevServer } from "vite";
import { createServer } from "./native-vite-server";
import { installedAuraPackageAliases } from "./installed-package-resolve";

const moduleName = "virtual:aura3d-native-gpu-render-compute";
const moduleId = `\0${moduleName}`;
const fixture = String.raw`
import { createAuraApp, scene, camera, lights, material, primitives } from "@aura3d/engine";
window.__nativeGpuEngine = { createAuraApp, scene, camera, lights, material, primitives };
`;

function fixturePlugin(): Plugin {
  return {
    name: "native-gpu-render-compute-fixture",
    resolveId(id) { return id === moduleName ? moduleId : undefined; },
    load(id) { return id === moduleId ? fixture : undefined; },
    configureServer(server) {
      server.middlewares.use("/wp03-native-gpu.html", (_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end('<!doctype html><html><body><script type="module" src="/@id/__x00__virtual:aura3d-native-gpu-render-compute"></script></body></html>');
      });
    }
  };
}

/** Phase B: exercise the public root app on an actual native WebGPU device. */
test.describe("root WebGPU render and compute", () => {
  let server: ViteDevServer;
  let origin: string;
  test.beforeAll(async () => {
    const candidate = process.env.A3D_INSTALLED_PACKAGE_ROOT;
    if (!candidate) throw new Error("A3D_INSTALLED_PACKAGE_ROOT must identify the validated packed candidate consumer");
    const aliases = installedAuraPackageAliases();
    const engine = aliases.find(alias => alias.find === "@aura3d/engine");
    const candidateRoot = realpathSync(resolve(candidate));
    if (!engine || !realpathSync(engine.replacement).startsWith(`${candidateRoot}${sep}`)) {
      throw new Error("Expected @aura3d/engine from the packed candidate consumer");
    }
    server = await createServer({ root: process.cwd(), logLevel: "error", resolve: { alias: [...aliases] },
      server: { fs: { allow: [process.cwd(), resolve(candidate)] } }, plugins: [fixturePlugin()] });
    await server.listen(0);
    origin = server.resolvedUrls?.local[0] ?? "";
    if (!origin) throw new Error("Candidate test server has no local origin");
  });
  test.afterAll(async () => { await server.close(); });

  test("uses the selected device for dispatch and changes rendered pixels", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto(`${origin}/wp03-native-gpu.html`);
    await page.waitForFunction(() => Boolean((window as unknown as { __nativeGpuEngine?: unknown }).__nativeGpuEngine));
    const result = await page.evaluate(async () => {
      const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
      if (!gpu || !await gpu.requestAdapter()) return { unsupported: "No WebGPU adapter", error: "" };
      try {
        const { createAuraApp, scene, camera, lights, material, primitives } = (window as unknown as { __nativeGpuEngine: typeof import("../../packages/engine/src/public/index") }).__nativeGpuEngine;
        const canvas = document.createElement("canvas");
        canvas.id = "native-gpu-scene";
        canvas.width = 256; canvas.height = 256;
        canvas.style.width = "256px"; canvas.style.height = "256px";
        document.body.append(canvas);
        const authored = scene().background("#101018")
          .camera(camera.perspective({ position: [0, 0, 4], target: [0, 0, 0], fov: 45 }))
          .add(primitives.box({ name: "gpu-box", size: 1, material: material.pbr({ color: "#e84b22", roughness: 0.7 }) }).runtime({ id: "gpu-box" }))
          .add(lights.directional({ position: [2, 4, 3], intensity: 2 }));
        const app = createAuraApp(canvas, { scene: authored, autoStart: false, resize: false, pixelRatio: 1, strict: true, renderer: { backend: "webgpu", allowFallback: false } });
        await app.ready();
        await app.stepAsync(0);
        const renderer = (app as unknown as Record<symbol, any>)[Symbol.for("a3d.prd01.renderer")];
        const pipeline = app.compute.pipeline({
          wgsl: "@group(0) @binding(0) var<storage, read_write> values: array<u32>; @compute @workgroup_size(1) fn main() { values[0] = 37u; }",
          bindings: [{ binding: 0, type: "storage" }], workgroupSize: [1]
        });
        const buffer = app.compute.buffer({ size: 4 });
        const sharedDevice = buffer.owner.device === renderer?.device?.nativeGpuDevice;
        const dispatch = app.compute.dispatch({ pipeline, bindings: { 0: buffer }, workgroups: [1] });
        await app.compute.idle();
        const value = new Uint32Array(await buffer.read())[0];
        const diagnostics = app.diagnostics();
        (window as unknown as { __nativeGpuApp: unknown }).__nativeGpuApp = app;
        return {
          unsupported: "", error: "", backend: app.backend, sharedDevice, value,
          invocations: dispatch.invocations,
          adapter: renderer?.device?.info?.renderer,
          backendSelection: diagnostics.renderer?.backendSelection,
          deviceDiagnostics: renderer?.getDiagnostics()
        };
      } catch (error) {
        return { unsupported: "", error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
      }
    });
    test.skip(Boolean(result.unsupported), result.unsupported);
    expect(result.error).toBe("");
    expect(result.backend).toBe("webgpu");
    expect(result.adapter).toBeTruthy();
    expect(result.sharedDevice).toBe(true);
    expect(result.value).toBe(37);
    expect(result.invocations).toBe(1);
    expect(result.backendSelection).toMatchObject({ requested: "webgpu", active: "webgpu", deviceLost: false });
    expect(result.deviceDiagnostics?.nativeSubmissions).toBeGreaterThan(0);
    const before = await page.locator("#native-gpu-scene").screenshot();
    await page.evaluate(async () => {
      const app = (window as unknown as { __nativeGpuApp: any }).__nativeGpuApp;
      app.nodes.require("gpu-box").setPosition(1, 0, 0);
      await app.stepAsync(0);
    });
    const after = await page.locator("#native-gpu-scene").screenshot();
    const first = await sharp(before).ensureAlpha().raw().toBuffer();
    const second = await sharp(after).ensureAlpha().raw().toBuffer();
    let changed = 0;
    for (let i = 0; i < first.length; i += 4) {
      if (Math.abs(first[i]! - second[i]!) + Math.abs(first[i + 1]! - second[i + 1]!) + Math.abs(first[i + 2]! - second[i + 2]!) > 15) changed++;
    }
    expect(changed).toBeGreaterThan(100);
    expect(pageErrors).toEqual([]);
    await testInfo.attach("webgpu-render-compute", { body: JSON.stringify({ ...result, changedPixels: changed }, null, 2), contentType: "application/json" });
    await testInfo.attach("webgpu-before", { body: before, contentType: "image/png" });
    await testInfo.attach("webgpu-after", { body: after, contentType: "image/png" });
    await page.evaluate(() => (window as unknown as { __nativeGpuApp: { dispose(): void } }).__nativeGpuApp.dispose());
  });
});
