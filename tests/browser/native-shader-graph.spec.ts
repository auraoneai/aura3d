import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

type Backend = "webgl2" | "webgpu";
type GraphFailure = { readonly name: string; readonly message: string; readonly diagnostics: readonly string[] };
interface FrameStats {
  readonly pixels: readonly number[];
  readonly mean: readonly [number, number, number];
  readonly foreground: number;
  readonly centroidX: number | null;
  readonly png: string;
}
interface MaterialEvidence {
  readonly backend: string;
  readonly selection: unknown;
  readonly adapter: unknown;
  readonly drawCalls: number;
  readonly shaderFailures: readonly unknown[];
  readonly baseline: FrameStats;
  readonly variants: Readonly<Record<string, FrameStats>>;
  readonly errors: { readonly cycle: GraphFailure; readonly type: GraphFailure };
  readonly disposedError: string;
}

const delta = (a: FrameStats, b: FrameStats): number => {
  let sum = 0;
  for (let i = 0; i < a.pixels.length; i += 1) sum += Math.abs(a.pixels[i]! - b.pixels[i]!);
  return sum / a.pixels.length;
};

/**
 * Phase B only. These are browser/renderer tests, not compiler snapshots or an
 * injected GPU mock. Each backend is an explicit request with fallback disabled;
 * the WebGPU run must be scheduled on a browser with an adapter. Failure to get
 * an adapter is an unavailable acceptance environment, not a passing WebGPU run.
 */
test.describe("native shader graph on the root renderer", () => {
  test.setTimeout(240_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const backend of ["webgl2", "webgpu"] as const) {
    test(`${backend}: all material channels affect the rendered frame`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      await page.goto(`${server.origin}/tests/browser/rendering-webgpu-harness.html`);
      const result = await page.evaluate(async (requested: Backend): Promise<MaterialEvidence> => {
        const root = "/packages/engine/src/public/index.ts";
        const { camera, createAuraApp, lights, material, primitives, scene } = await import(root);
        let adapterInfo: Record<string, unknown> | null = null;
        if (requested === "webgpu") {
          const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ info?: { vendor?: string; architecture?: string; device?: string; description?: string }; isFallbackAdapter?: boolean } | null> } }).gpu;
          const adapter = await gpu?.requestAdapter();
          if (!adapter) throw new Error("WEBGPU_ACCEPTANCE_UNAVAILABLE: no browser WebGPU adapter");
          adapterInfo = { source: "preflight", vendor: adapter.info?.vendor ?? null, architecture: adapter.info?.architecture ?? null,
            device: adapter.info?.device ?? null, description: adapter.info?.description ?? null, isFallbackAdapter: adapter.isFallbackAdapter ?? null };
        }
        const constant = (id: string, type: string, value: number | number[]) => ({ id, op: "constant", type, value });
        const baseGraph = {
          version: 1,
          stage: "material",
          nodes: [
            { id: "baseColor", op: "uniform", type: "vec3", resource: "baseColor" },
            { id: "surfaceNormal", op: "uniform", type: "vec3", resource: "surfaceNormal" },
            { id: "roughness", op: "uniform", type: "f32", resource: "roughness" },
            { id: "metalness", op: "uniform", type: "f32", resource: "metalness" },
            { id: "emissive", op: "uniform", type: "vec3", resource: "emissive" },
            { id: "opacity", op: "uniform", type: "f32", resource: "opacity" },
            { id: "position", op: "input", type: "vec3", name: "positionLocal" },
            { id: "shift", op: "uniform", type: "vec3", resource: "shift" },
            { id: "shifted", op: "add", type: "vec3", inputs: ["position", "shift"] }
          ],
          resources: [
            { name: "baseColor", kind: "uniform", type: "vec3" },
            { name: "surfaceNormal", kind: "uniform", type: "vec3" },
            { name: "roughness", kind: "uniform", type: "f32" },
            { name: "metalness", kind: "uniform", type: "f32" },
            { name: "emissive", kind: "uniform", type: "vec3" },
            { name: "opacity", kind: "uniform", type: "f32" },
            { name: "shift", kind: "uniform", type: "vec3" }
          ],
          outputs: { color: "baseColor", normal: "surfaceNormal", roughness: "roughness", metalness: "metalness", emissive: "emissive", opacity: "opacity", position: "shifted" }
        };
        const values: Record<string, number | number[]> = {
          baseColor: [0.58, 0.23, 0.09], surfaceNormal: [0, 0, 1], roughness: 0.06,
          metalness: 0, emissive: [0, 0, 0], opacity: 1, shift: [0, 0, 0]
        };
        const failure = (graph: unknown): GraphFailure => {
          try { material.node({ graph, uniforms: values }); } catch (error) {
            const e = error as { name?: string; message?: string; diagnostics?: readonly { code?: string }[] };
            return { name: e.name ?? "", message: e.message ?? "", diagnostics: (e.diagnostics ?? []).map((entry) => entry.code ?? "") };
          }
          return { name: "no-error", message: "", diagnostics: [] };
        };
        const invalidCycle = failure({ version: 1, stage: "material", nodes: [
          { id: "a", op: "add", type: "vec3", inputs: ["b", "b"] },
          { id: "b", op: "add", type: "vec3", inputs: ["a", "a"] }
        ], outputs: { color: "a" } });
        const invalidType = failure({ version: 1, stage: "material", nodes: [constant("bad", "f32", 0.5)], outputs: { normal: "bad" } });
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 160;
        document.body.append(canvas);
        const app = createAuraApp(canvas, {
          autoStart: false, resize: false, pixelRatio: 1, strict: true,
          renderer: { qualityProfile: "production", backend: requested, allowFallback: false, shaderFailures: "throw" },
          output: { toneMapping: "none", dither: false },
          scene: scene().background("#000000")
            .camera(camera.perspective({ position: [0, 0, 4], target: [0, 0, 0], fov: 42 }))
            .add(lights.hemisphere({ intensity: 0.12 }))
            .add(lights.directional({ position: [4, 2, 5], intensity: 3 }))
            .add(primitives.sphere({ name: "probe", size: 2, castShadow: false,
              material: material.node({ graph: baseGraph, uniforms: values, transparent: true, depthWrite: false }) }).runtime({ id: "probe" }))
        });
        try {
          await app.ready();
          if (app.backend !== requested) throw new Error(`BACKEND_MISMATCH:${requested}:${app.backend}`);
          const handle = app.nodes.require("probe");
          if (typeof handle.setUniform !== "function") throw new Error("GRAPH_UNIFORM_UPDATES_UNAVAILABLE");
          const frame = async (): Promise<FrameStats> => {
            await app.stepAsync(1 / 60);
            const blob = await app.capture?.({ type: "png-blob" });
            if (!(blob instanceof Blob)) throw new Error("GRAPH_CAPTURE_UNAVAILABLE");
            const bitmap = await createImageBitmap(blob);
            const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
            const context = surface.getContext("2d");
            if (!context) throw new Error("GRAPH_CAPTURE_2D_UNAVAILABLE");
            context.drawImage(bitmap, 0, 0);
            bitmap.close();
            const image = context.getImageData(0, 0, surface.width, surface.height);
            const pixels: number[] = [];
            const sum = [0, 0, 0]; let foreground = 0; let xSum = 0;
            for (let y = 0; y < surface.height; y += 1) for (let x = 0; x < surface.width; x += 1) {
              const offset = (y * surface.width + x) * 4;
              const r = image.data[offset]!; const g = image.data[offset + 1]!; const b = image.data[offset + 2]!;
              pixels.push(r, g, b); sum[0] += r; sum[1] += g; sum[2] += b;
              if (r + g + b > 36) { foreground += 1; xSum += x; }
            }
            const bytes = new Uint8Array(await blob.arrayBuffer());
            let raw = ""; for (const byte of bytes) raw += String.fromCharCode(byte);
            const count = surface.width * surface.height;
            return { pixels, mean: [sum[0]! / count, sum[1]! / count, sum[2]! / count], foreground, centroidX: foreground ? xSum / foreground : null, png: btoa(raw) };
          };
          const baseline = await frame();
          const variants: Record<string, FrameStats> = {};
          const changes: Readonly<Record<string, readonly [string, number | number[]]>> = {
            color: ["baseColor", [0.05, 0.18, 0.9]],
            normal: ["surfaceNormal", [-1, 0, 0]],
            roughness: ["roughness", 1],
            metalness: ["metalness", 1],
            emissive: ["emissive", [0.5, 0.5, 0.5]],
            opacity: ["opacity", 0.2],
            position: ["shift", [0.7, 0, 0]]
          };
          for (const [channel, [name, next]] of Object.entries(changes)) {
            handle.setUniform(name, next);
            variants[channel] = await frame();
            handle.setUniform(name, values[name]);
            // Confirm each comparison starts from the same material state.
            const reset = await frame();
            let resetDelta = 0;
            for (let i = 0; i < reset.pixels.length; i += 1) resetDelta += Math.abs(reset.pixels[i]! - baseline.pixels[i]!);
            if (resetDelta / reset.pixels.length > 2) throw new Error(`GRAPH_UNIFORM_RESET_FAILED:${channel}`);
          }
          const diagnostic = app.diagnostics();
          const actualBackend = app.backend;
          if (requested === "webgl2") {
            const gl = canvas.getContext("webgl2");
            const debug = gl?.getExtension("WEBGL_debug_renderer_info");
            adapterInfo = { source: "active-context", vendor: gl?.getParameter(debug?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR) ?? null,
              renderer: gl?.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) ?? null };
          }
          await app.disposeAsync();
          let disposedError = "";
          try { await app.stepAsync(0); } catch (error) { disposedError = String(error); }
          return { backend: actualBackend, selection: diagnostic.backendSelection, adapter: adapterInfo, drawCalls: diagnostic.drawCalls,
            shaderFailures: diagnostic.shaderFailures ?? [], baseline, variants,
            errors: { cycle: invalidCycle, type: invalidType }, disposedError };
        } finally {
          app.dispose();
          canvas.remove();
        }
      }, backend);
      test.info().annotations.push({ type: "backend-selection", description: JSON.stringify(result.selection) });
      test.info().annotations.push({ type: "adapter", description: JSON.stringify(result.adapter) });
      await test.info().attach(`${backend}-graph-baseline.png`, { body: Buffer.from(result.baseline.png, "base64"), contentType: "image/png" });
      await test.info().attach(`${backend}-graph-normal.png`, { body: Buffer.from(result.variants.normal!.png, "base64"), contentType: "image/png" });
      expect(result.backend).toBe(backend);
      expect(result.selection).toMatchObject({ requested: backend, active: backend, deviceLost: false });
      expect(result.drawCalls).toBeGreaterThan(0);
      expect(result.shaderFailures).toEqual([]);
      expect(result.baseline.foreground).toBeGreaterThan(2_000);
      for (const channel of ["color", "normal", "roughness", "metalness", "emissive", "opacity"] as const) {
        expect(delta(result.baseline, result.variants[channel]!), `${channel} graph output did not change pixels`).toBeGreaterThan(0.5);
      }
      expect(result.variants.position!.centroidX).not.toBeNull();
      expect(result.baseline.centroidX).not.toBeNull();
      expect(result.variants.position!.centroidX! - result.baseline.centroidX!).toBeGreaterThan(7);
      expect(`${result.errors.cycle.message} ${result.errors.cycle.diagnostics.join(" ")}`).toMatch(/cycle/i);
      expect(`${result.errors.type.message} ${result.errors.type.diagnostics.join(" ")}`).toMatch(/type|normal/i);
      expect(result.errors.cycle.name).not.toBe("no-error");
      expect(result.errors.type.name).not.toBe("no-error");
      expect(result.disposedError).toMatch(/dispos/i);
      expect(errors).toEqual([]);
    });
  }
});

test.describe("native graph texture sampling", () => {
  test.setTimeout(180_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const backend of ["webgl2", "webgpu"] as const) {
    test(`${backend}: authored texels and independent mip updates reach material pixels`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      await page.goto(`${server.origin}/tests/browser/rendering-webgpu-harness.html`);
      const result = await page.evaluate(async (requested: Backend) => {
        const root = "/packages/engine/src/public/index.ts";
        const { camera, createAuraApp, geometry, material, scene, texture } = await import(root);
        if (requested === "webgpu") {
          const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
          if (!await gpu?.requestAdapter()) throw new Error("WEBGPU_ACCEPTANCE_UNAVAILABLE: no browser WebGPU adapter");
        }
        const image = texture.data({ width: 2, height: 1, data: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]), colorSpace: "linear" });
        image.minFilter = "nearest"; image.magFilter = "nearest"; image.generateMipmaps = false;
        const graph = { version: 1, stage: "material", resources: [{ name: "map", kind: "texture2d" }], nodes: [
          { id: "uv", op: "input", type: "vec2", name: "uv0" },
          { id: "sample", op: "textureSample", type: "vec4", resource: "map", inputs: ["uv"] }
        ], outputs: { color: "sample" } };
        const quad = geometry.dynamic({
          positions: new Float32Array([-1.2, -1.2, 0, 1.2, -1.2, 0, 1.2, 1.2, 0, -1.2, 1.2, 0]),
          uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), indices: [0, 1, 2, 0, 2, 3]
        });
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = 160; document.body.append(canvas);
        const app = createAuraApp(canvas, {
          autoStart: false, resize: false, pixelRatio: 1, strict: true,
          renderer: { qualityProfile: "production", backend: requested, allowFallback: false, shaderFailures: "throw" },
          output: { toneMapping: "none", dither: false },
          scene: scene().background("#000000")
            .camera(camera.perspective({ position: [0, 0, 4], target: [0, 0, 0], fov: 42 }))
            .add(geometry.custom(quad, { name: "texture-probe", material: material.node({ graph, uniforms: { map: image } }) }))
        });
        const sample = async (): Promise<{ left: number[]; right: number[]; png: string }> => {
          await app.stepAsync(1 / 60);
          const blob = await app.capture?.({ type: "png-blob" });
          if (!(blob instanceof Blob)) throw new Error("GRAPH_CAPTURE_UNAVAILABLE");
          const bitmap = await createImageBitmap(blob);
          const surface = new OffscreenCanvas(bitmap.width, bitmap.height); const context = surface.getContext("2d");
          if (!context) throw new Error("GRAPH_CAPTURE_2D_UNAVAILABLE");
          context.drawImage(bitmap, 0, 0); bitmap.close();
          const pixels = context.getImageData(0, 0, surface.width, surface.height);
          const mean = (centerX: number): number[] => {
            const out = [0, 0, 0]; let count = 0;
            for (let y = 75; y < 85; y += 1) for (let x = centerX - 5; x < centerX + 5; x += 1) {
              const offset = (y * pixels.width + x) * 4;
              for (let channel = 0; channel < 3; channel += 1) out[channel]! += pixels.data[offset + channel]!;
              count += 1;
            }
            return out.map((value) => value / count);
          };
          const bytes = new Uint8Array(await blob.arrayBuffer()); let raw = "";
          for (const byte of bytes) raw += String.fromCharCode(byte);
          return { left: mean(55), right: mean(105), png: btoa(raw) };
        };
        try {
          await app.ready();
          if (app.backend !== requested) throw new Error(`BACKEND_MISMATCH:${requested}:${app.backend}`);
          const before = await sample();
          image.updateMip(0, new Uint8Array([0, 255, 0, 255, 255, 255, 0, 255]));
          const after = await sample();
          const diagnostics = app.diagnostics();
          const actualBackend = app.backend;
          await app.disposeAsync(); image.dispose();
          let disposedError = "";
          try { image.updateMip(0, new Uint8Array(8)); } catch (error) { disposedError = String(error); }
          return { backend: actualBackend, drawCalls: diagnostics.drawCalls, shaderFailures: diagnostics.shaderFailures ?? [], before, after, disposedError };
        } finally { app.dispose(); image.dispose(); canvas.remove(); }
      }, backend);
      await test.info().attach(`${backend}-graph-texture-before.png`, { body: Buffer.from(result.before.png, "base64"), contentType: "image/png" });
      await test.info().attach(`${backend}-graph-texture-after.png`, { body: Buffer.from(result.after.png, "base64"), contentType: "image/png" });
      expect(result.backend).toBe(backend);
      expect(result.drawCalls).toBeGreaterThan(0);
      expect(result.shaderFailures).toEqual([]);
      expect(result.before.left[0]!).toBeGreaterThan(190);
      expect(result.before.left[2]!).toBeLessThan(35);
      expect(result.before.right[2]!).toBeGreaterThan(190);
      expect(result.before.right[0]!).toBeLessThan(35);
      expect(result.after.left[1]!).toBeGreaterThan(190);
      expect(result.after.left[0]!).toBeLessThan(35);
      expect(result.after.right[0]!).toBeGreaterThan(190);
      expect(result.after.right[1]!).toBeGreaterThan(190);
      expect(result.after.right[2]!).toBeLessThan(35);
      expect(result.disposedError).toMatch(/dispos/i);
      expect(errors).toEqual([]);
    });
  }
});

test.describe("native graph compute", () => {
  test.setTimeout(180_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("the selected root WebGPU device dispatches a serialized graph and reads exact bytes", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(`${server.origin}/tests/browser/rendering-webgpu-harness.html`);
    const result = await page.evaluate(async () => {
      const root = "/packages/engine/src/public/index.ts";
      const { camera, createAuraApp, material, primitives, scene, shaderGraph } = await import(root);
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ info?: unknown; isFallbackAdapter?: boolean } | null> } }).gpu;
      const adapter = await gpu?.requestAdapter();
      if (!adapter) throw new Error("WEBGPU_ACCEPTANCE_UNAVAILABLE: no browser WebGPU adapter");
      const preflightAdapter = { info: adapter.info ?? null, isFallbackAdapter: adapter.isFallbackAdapter ?? null };
      const visible = { version: 1, stage: "material", nodes: [
        { id: "c", op: "constant", type: "vec3", value: [0.2, 0.6, 0.9] }
      ], outputs: { color: "c" } };
      const computeGraph = { version: 1, stage: "compute", workgroupSize: [8, 1, 1],
        resources: [{ name: "out", kind: "storage-buffer", type: "f32", access: "read_write", binding: 0 }],
        nodes: [
          { id: "gid", op: "input", type: "uvec3", name: "globalInvocationId" },
          { id: "index", op: "swizzle", type: "u32", inputs: ["gid"], components: "x" },
          { id: "answer", op: "constant", type: "f32", value: 0.75 }
        ], statements: [{ op: "store", resource: "out", index: "index", value: "answer" }] };
      const roundTrip = shaderGraph.deserialize(shaderGraph.serialize(computeGraph));
      const compiled = shaderGraph.compile(roundTrip, "wgsl");
      if (!compiled.compute) throw new Error("GRAPH_COMPUTE_STAGE_MISSING");
      let webglError = "";
      try { shaderGraph.compile(roundTrip, "glsl"); } catch (error) { webglError = String(error); }
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 96; document.body.append(canvas);
      const app = createAuraApp(canvas, {
        autoStart: false, resize: false, pixelRatio: 1, strict: true,
        renderer: { qualityProfile: "production", backend: "webgpu", allowFallback: false, shaderFailures: "throw" },
        scene: scene().background("#000000")
          .camera(camera.perspective({ position: [0, 0, 4], target: [0, 0, 0], fov: 42 }))
          .add(primitives.box({ name: "compute-device-probe", material: material.node({ graph: visible }) }))
      });
      try {
        await app.ready();
        if (app.backend !== "webgpu") throw new Error(`BACKEND_MISMATCH:webgpu:${app.backend}`);
        await app.stepAsync(1 / 60);
        if (!app.compute.available) throw new Error("ROOT_SELECTED_DEVICE_COMPUTE_UNAVAILABLE");
        const output = app.compute.buffer({ size: 8 * 4, label: "graph-compute-output" });
        const pipeline = app.compute.pipeline({ wgsl: compiled.compute, bindings: [{ binding: 0, type: "storage" }] });
        const dispatch = app.compute.dispatch({ pipeline, bindings: [{ binding: 0, buffer: output }], items: [8] });
        await app.compute.idle();
        const outputValues = Array.from(new Float32Array(await output.read()));
        const diagnostic = app.diagnostics();
        output.dispose(); pipeline.dispose();
        let disposedError = "";
        try { await output.read(); } catch (error) { disposedError = String(error); }
        const backend = app.backend;
        await app.disposeAsync();
        return { backend, preflightAdapter, selection: diagnostic.backendSelection, drawCalls: diagnostic.drawCalls,
          shaderFailures: diagnostic.shaderFailures ?? [], outputValues, dispatch, webglError, disposedError };
      } finally { app.dispose(); canvas.remove(); }
    });
    test.info().annotations.push({ type: "webgpu-preflight-adapter", description: JSON.stringify(result.preflightAdapter) });
    test.info().annotations.push({ type: "backend-selection", description: JSON.stringify(result.selection) });
    expect(result.backend).toBe("webgpu");
    expect(result.drawCalls).toBeGreaterThan(0);
    expect(result.shaderFailures).toEqual([]);
    expect(result.dispatch.workgroups).toEqual([1, 1, 1]);
    expect(result.dispatch.invocations).toBe(8);
    expect(result.outputValues).toEqual(Array(8).fill(0.75));
    expect(result.webglError).toMatch(/unsupported-backend|WebGL2.*compute/i);
    expect(result.disposedError).toMatch(/dispos/i);
    expect(errors).toEqual([]);
  });
});

test.describe("native GPU index sorting", () => {
  test.setTimeout(180_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("dispatches stable ascending and descending sorts on a non-power-of-two input", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/rendering-webgpu-harness.html`);
    const result = await page.evaluate(async () => {
      const path = "/packages/rendering/src/webgpu.ts";
      const { createNativeGpuSort } = await import(path);
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<any> } }).gpu;
      const adapter = await gpu?.requestAdapter();
      if (!adapter) throw new Error("WEBGPU_ACCEPTANCE_UNAVAILABLE: no browser WebGPU adapter");
      const device = await adapter.requestDevice();
      const keys = new Float32Array([3, -2, 3, NaN, 0, -0, 10]);
      const input = device.createBuffer({ size: keys.byteLength, usage: 0x80 | 0x04 | 0x08 });
      const indices = device.createBuffer({ size: keys.byteLength, usage: 0x80 | 0x04 | 0x08 });
      const staging = device.createBuffer({ size: keys.byteLength, usage: 0x01 | 0x08 });
      device.queue.writeBuffer(input, 0, keys);
      const sorter = await createNativeGpuSort(device, { maxItems: 8 });
      const read = async (): Promise<number[]> => {
        const encoder = device.createCommandEncoder();
        encoder.copyBufferToBuffer(indices, 0, staging, 0, keys.byteLength);
        device.queue.submit([encoder.finish()]);
        await staging.mapAsync(1);
        const data = Array.from(new Uint32Array(staging.getMappedRange().slice(0)));
        staging.unmap();
        return data;
      };
      try {
        const descending = sorter.sort({ keys: input, indices, count: keys.length, direction: "descending" });
        await descending.completion; await descending.safeToRelease;
        const descendingIndices = await read();
        const ascending = sorter.sort({ keys: input, indices, count: keys.length, direction: "ascending" });
        await ascending.completion; await ascending.safeToRelease;
        const ascendingIndices = await read();
        let limitError = "";
        try { sorter.sort({ keys: input, indices, count: 9 }); } catch (error) { limitError = String(error); }
        await sorter.dispose();
        let disposedError = "";
        try { sorter.sort({ keys: input, indices, count: keys.length }); } catch (error) { disposedError = String(error); }
        return { preflightAdapter: { info: adapter.info ?? null, isFallbackAdapter: adapter.isFallbackAdapter ?? null },
          descendingIndices, ascendingIndices, limitError, disposedError };
      } finally { await sorter.dispose(); input.destroy(); indices.destroy(); staging.destroy(); device.destroy(); }
    });
    test.info().annotations.push({ type: "webgpu-adapter", description: JSON.stringify(result.preflightAdapter) });
    // Equal keys and signed zero retain input order; NaN sorts last in both directions.
    expect(result.descendingIndices).toEqual([6, 0, 2, 4, 5, 1, 3]);
    expect(result.ascendingIndices).toEqual([1, 4, 5, 0, 2, 6, 3]);
    expect(result.limitError).toMatch(/count|limit|8/i);
    expect(result.disposedError).toMatch(/dispos/i);
  });
});

test.describe("graph resource lifetime on device loss", () => {
  test.setTimeout(180_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("WebGL2 context restoration rebuilds a graph and its texture", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/rendering-webgpu-harness.html`);
    const result = await page.evaluate(async () => {
      const root = "/packages/engine/src/public/index.ts";
      const { camera, createAuraApp, geometry, material, scene, texture } = await import(root);
      const pixels = new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]);
      const image = texture.data({ width: 2, height: 1, data: pixels, colorSpace: "linear" });
      image.minFilter = "nearest"; image.magFilter = "nearest"; image.generateMipmaps = false;
      const graph = { version: 1, stage: "material", resources: [{ name: "map", kind: "texture2d" }], nodes: [
        { id: "uv", op: "input", type: "vec2", name: "uv0" },
        { id: "sample", op: "textureSample", type: "vec4", resource: "map", inputs: ["uv"] }
      ], outputs: { color: "sample" } };
      const quad = geometry.dynamic({ positions: new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]),
        uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), indices: [0, 1, 2, 0, 2, 3] });
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 96; document.body.append(canvas);
      const app = createAuraApp(canvas, {
        autoStart: false, resize: false, pixelRatio: 1, strict: true,
        renderer: { qualityProfile: "production", backend: "webgl2", allowFallback: false, shaderFailures: "throw" },
        scene: scene().background("#000000").camera(camera.perspective({ position: [0, 0, 4], target: [0, 0, 0], fov: 42 }))
          .add(geometry.custom(quad, { name: "restore-probe", material: material.node({ graph, uniforms: { map: image } }) }))
      });
      const timeout = (label: string): Promise<never> => new Promise((_, reject) => setTimeout(() => reject(new Error(`DEVICE_EVENT_TIMEOUT:${label}`)), 10_000));
      try {
        await app.ready(); await app.stepAsync(1 / 60);
        if (app.backend !== "webgl2") throw new Error(`BACKEND_MISMATCH:webgl2:${app.backend}`);
        const gl = canvas.getContext("webgl2");
        const extension = gl?.getExtension("WEBGL_lose_context");
        if (!extension) throw new Error("WEBGL_CONTEXT_LOSS_ACCEPTANCE_UNAVAILABLE: WEBGL_lose_context missing");
        const grab = async (): Promise<readonly [number, number, number]> => {
          const blob = await app.capture?.({ type: "png-blob" });
          if (!(blob instanceof Blob)) throw new Error("GRAPH_CAPTURE_UNAVAILABLE");
          const bitmap = await createImageBitmap(blob);
          const surface = new OffscreenCanvas(bitmap.width, bitmap.height); const context = surface.getContext("2d");
          if (!context) throw new Error("GRAPH_CAPTURE_2D_UNAVAILABLE");
          context.drawImage(bitmap, 0, 0); bitmap.close();
          const pixel = context.getImageData(35, 48, 1, 1).data;
          return [pixel[0]!, pixel[1]!, pixel[2]!];
        };
        const before = await grab();
        let lostCount = 0; let restoredCount = 0;
        let lostResolve: () => void = () => undefined; let restoredResolve: () => void = () => undefined;
        const lost = new Promise<void>((resolve) => { lostResolve = resolve; });
        const restored = new Promise<void>((resolve) => { restoredResolve = resolve; });
        const offLost = app.onDeviceLost(() => { lostCount += 1; lostResolve(); });
        const offRestored = app.onDeviceRestored(() => { restoredCount += 1; restoredResolve(); });
        extension.loseContext();
        await Promise.race([lost, timeout("lost")]);
        const wasLost = app.deviceLost();
        extension.restoreContext();
        await Promise.race([restored, timeout("restored")]);
        await app.stepAsync(1 / 60);
        const after = await grab();
        const diagnostics = app.diagnostics(); offLost(); offRestored();
        return { before, after, wasLost, stillLost: app.deviceLost(), lostCount, restoredCount,
          backend: app.backend, shaderFailures: diagnostics.shaderFailures ?? [], drawCalls: diagnostics.drawCalls };
      } finally { await app.disposeAsync(); image.dispose(); canvas.remove(); }
    });
    expect(result.backend).toBe("webgl2");
    expect(result.wasLost).toBe(true);
    expect(result.stillLost).toBe(false);
    expect(result.lostCount).toBe(1);
    expect(result.restoredCount).toBe(1);
    expect(result.drawCalls).toBeGreaterThan(0);
    expect(result.shaderFailures).toEqual([]);
    expect(result.before[0]).toBeGreaterThan(190);
    expect(result.after[0]).toBeGreaterThan(190);
    expect(Math.abs(result.after[0] - result.before[0])).toBeLessThan(8);
  });

  test("a lost WebGPU graph device rejects its old work and a fresh root app renders again", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/rendering-webgpu-harness.html`);
    const result = await page.evaluate(async () => {
      const root = "/packages/engine/src/public/index.ts";
      const { camera, createAuraApp, material, primitives, scene } = await import(root);
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<any> } }).gpu;
      const adapter = await gpu?.requestAdapter();
      if (!adapter) throw new Error("WEBGPU_ACCEPTANCE_UNAVAILABLE: no browser WebGPU adapter");
      const prototype = Object.getPrototypeOf(adapter) as Record<string, unknown>;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "requestDevice");
      if (!descriptor || typeof descriptor.value !== "function" || !descriptor.configurable) throw new Error("WEBGPU_DEVICE_OBSERVER_UNAVAILABLE");
      const original = descriptor.value as (...args: unknown[]) => Promise<any>;
      const devices: any[] = [];
      // Instrumentation delegates to the actual adapter and actual GPUDevice.
      Object.defineProperty(prototype, "requestDevice", { ...descriptor, value: async function(this: unknown, ...args: unknown[]) {
        const device = await Reflect.apply(original, this, args); devices.push(device); return device;
      } });
      const graph = { version: 1, stage: "material", nodes: [{ id: "color", op: "constant", type: "vec3", value: [0.8, 0.2, 0.1] }], outputs: { color: "color" } };
      const create = () => {
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = 96; document.body.append(canvas);
        const app = createAuraApp(canvas, { autoStart: false, resize: false, pixelRatio: 1, strict: true,
          renderer: { qualityProfile: "production", backend: "webgpu", allowFallback: false, shaderFailures: "throw" },
          scene: scene().background("#000000").camera(camera.perspective({ position: [0, 0, 4], target: [0, 0, 0], fov: 42 }))
            .add(primitives.box({ name: "loss-probe", material: material.node({ graph }) })) });
        return { app, canvas };
      };
      let first: ReturnType<typeof create> | undefined; let second: ReturnType<typeof create> | undefined;
      try {
        first = create(); await first.app.ready(); await first.app.stepAsync(1 / 60);
        if (first.app.backend !== "webgpu" || devices.length !== 1) throw new Error(`WEBGPU_ROOT_DEVICE_NOT_OBSERVED:${first.app.backend}:${devices.length}`);
        const drawBefore = first.app.diagnostics().drawCalls;
        let notify!: () => void;
        const notified = new Promise<void>((resolve) => { notify = resolve; });
        const unsubscribe = first.app.onDeviceLost(notify);
        const native = devices[0]; native.destroy();
        const loss = await native.lost;
        await Promise.race([notified, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("DEVICE_EVENT_TIMEOUT:lost")), 10_000))]);
        const lostFlag = first.app.deviceLost(); let oldRenderError = "";
        try { await first.app.stepAsync(0); } catch (error) { oldRenderError = String(error); }
        unsubscribe(); first.app.dispose(); first.canvas.remove(); first = undefined;
        second = create(); await second.app.ready(); await second.app.stepAsync(1 / 60);
        const blob = await second.app.capture?.({ type: "png-blob" });
        if (!(blob instanceof Blob)) throw new Error("GRAPH_CAPTURE_UNAVAILABLE");
        const bitmap = await createImageBitmap(blob);
        const surface = new OffscreenCanvas(bitmap.width, bitmap.height); const context = surface.getContext("2d");
        if (!context) throw new Error("GRAPH_CAPTURE_2D_UNAVAILABLE");
        context.drawImage(bitmap, 0, 0); bitmap.close();
        const pixel = context.getImageData(48, 48, 1, 1).data;
        const diagnostic = second.app.diagnostics();
        return { adapter: { info: adapter.info ?? null, isFallbackAdapter: adapter.isFallbackAdapter ?? null },
          reason: loss.reason, lostFlag, oldRenderError, drawBefore, replacementDrawCalls: diagnostic.drawCalls,
          replacementBackend: second.app.backend, replacementPixel: [pixel[0], pixel[1], pixel[2]], shaderFailures: diagnostic.shaderFailures ?? [],
          replacedDevice: Number(devices.length) === 2 && devices[0] !== devices[1] };
      } finally {
        first?.app.dispose(); first?.canvas.remove(); second?.app.dispose(); second?.canvas.remove();
        Object.defineProperty(prototype, "requestDevice", descriptor);
      }
    });
    test.info().annotations.push({ type: "webgpu-adapter", description: JSON.stringify(result.adapter) });
    expect(result.reason).toBe("destroyed");
    expect(result.lostFlag).toBe(true);
    expect(result.oldRenderError).toMatch(/lost|dispos|unavailable/i);
    expect(result.drawBefore).toBeGreaterThan(0);
    expect(result.replacementBackend).toBe("webgpu");
    expect(result.replacementDrawCalls).toBeGreaterThan(0);
    expect(result.replacedDevice).toBe(true);
    expect(result.replacementPixel[0]!).toBeGreaterThan(result.replacementPixel[2]! + 30);
    expect(result.shaderFailures).toEqual([]);
  });
});

test.describe("root compute and graph render sharing", () => {
  test.setTimeout(180_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("compute writes the same storage texture a material graph samples, without CPU re-upload", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(`${server.origin}/tests/browser/rendering-webgpu-harness.html`);
    const result = await page.evaluate(async () => {
      const root = "/packages/engine/src/public/index.ts";
      const { camera, createAuraApp, geometry, material, scene, shaderGraph, texture } = await import(root);
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<any> } }).gpu;
      const adapter = await gpu?.requestAdapter();
      if (!adapter) throw new Error("WEBGPU_ACCEPTANCE_UNAVAILABLE: no browser WebGPU adapter");
      const shared = texture.storage({ width: 2, height: 1, format: "rgba8" });
      const sampleGraph = { version: 1, stage: "material", resources: [{ name: "map", kind: "texture2d" }], nodes: [
        { id: "uv", op: "input", type: "vec2", name: "uv0" },
        { id: "sample", op: "textureSample", type: "vec4", resource: "map", inputs: ["uv"] }
      ], outputs: { color: "sample" } };
      const writerGraph = (left: number[], right: number[]) => ({ version: 1, stage: "compute", workgroupSize: [1, 1, 1],
        resources: [{ name: "image", kind: "storage-texture", access: "write", format: "rgba8unorm", binding: 0 }],
        nodes: [
          { id: "leftXY", op: "constant", type: "vec2", value: [0, 0] },
          { id: "rightXY", op: "constant", type: "vec2", value: [1, 0] },
          { id: "left", op: "constant", type: "vec4", value: left },
          { id: "right", op: "constant", type: "vec4", value: right }
        ], statements: [
          { op: "textureStore", resource: "image", coordinates: "leftXY", value: "left" },
          { op: "textureStore", resource: "image", coordinates: "rightXY", value: "right" }
        ] });
      const quad = geometry.dynamic({ positions: new Float32Array([-1.2, -1.2, 0, 1.2, -1.2, 0, 1.2, 1.2, 0, -1.2, 1.2, 0]),
        uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), indices: [0, 1, 2, 0, 2, 3] });
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 160; document.body.append(canvas);
      const app = createAuraApp(canvas, {
        autoStart: false, resize: false, pixelRatio: 1, strict: true,
        renderer: { qualityProfile: "production", backend: "webgpu", allowFallback: false, shaderFailures: "throw" },
        output: { toneMapping: "none", dither: false },
        scene: scene().background("#000000").camera(camera.perspective({ position: [0, 0, 4], target: [0, 0, 0], fov: 42 }))
          .add(geometry.custom(quad, { name: "shared-texture-probe", material: material.node({ graph: sampleGraph, uniforms: { map: shared } }) }))
      });
      const sample = async (): Promise<{ left: number[]; right: number[]; png: string }> => {
        await app.stepAsync(1 / 60);
        const blob = await app.capture?.({ type: "png-blob" });
        if (!(blob instanceof Blob)) throw new Error("GRAPH_CAPTURE_UNAVAILABLE");
        const bitmap = await createImageBitmap(blob); const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = surface.getContext("2d"); if (!context) throw new Error("GRAPH_CAPTURE_2D_UNAVAILABLE");
        context.drawImage(bitmap, 0, 0); bitmap.close();
        const pixels = context.getImageData(0, 0, surface.width, surface.height);
        const rgb = (x: number) => { const i = (80 * pixels.width + x) * 4; return [pixels.data[i]!, pixels.data[i + 1]!, pixels.data[i + 2]!]; };
        const bytes = new Uint8Array(await blob.arrayBuffer()); let raw = "";
        for (const byte of bytes) raw += String.fromCharCode(byte);
        return { left: rgb(55), right: rgb(105), png: btoa(raw) };
      };
      try {
        await app.ready();
        if (app.backend !== "webgpu" || !app.compute.available) throw new Error(`ROOT_SHARED_DEVICE_UNAVAILABLE:${app.backend}`);
        const createWriter = (left: number[], right: number[]) => {
          const compiled = shaderGraph.compile(writerGraph(left, right), "wgsl");
          if (!compiled.compute) throw new Error("GRAPH_COMPUTE_STAGE_MISSING");
          return app.compute.pipeline({ wgsl: compiled.compute, bindings: [{ binding: 0, type: "storage-texture" }] });
        };
        const firstPipeline = createWriter([1, 0, 0, 1], [0, 0, 1, 1]);
        const secondPipeline = createWriter([0, 1, 0, 1], [1, 1, 0, 1]);
        const dispatch = (pipeline: unknown) => app.compute.dispatch({ pipeline, bindings: [{ binding: 0, texture: shared }], items: [1] });
        const firstDispatch = dispatch(firstPipeline);
        // Submission order on the selected device must make the compute write visible to this draw.
        const first = await sample();
        const secondDispatch = dispatch(secondPipeline);
        const second = await sample();
        await app.compute.idle();
        const diagnostic = app.diagnostics(); const backend = app.backend;
        firstPipeline.dispose(); secondPipeline.dispose();
        await app.disposeAsync(); shared.dispose();
        let disposedError = "";
        try { dispatch(firstPipeline); } catch (error) { disposedError = String(error); }
        return { backend, selection: diagnostic.backendSelection, drawCalls: diagnostic.drawCalls,
          shaderFailures: diagnostic.shaderFailures ?? [], first, second, firstDispatch, secondDispatch, disposedError,
          adapter: { source: "preflight", vendor: adapter.info?.vendor ?? null, architecture: adapter.info?.architecture ?? null,
            device: adapter.info?.device ?? null, description: adapter.info?.description ?? null, isFallbackAdapter: adapter.isFallbackAdapter ?? null } };
      } finally { app.dispose(); shared.dispose(); canvas.remove(); }
    });
    test.info().annotations.push({ type: "adapter", description: JSON.stringify(result.adapter) });
    test.info().annotations.push({ type: "backend-selection", description: JSON.stringify(result.selection) });
    await test.info().attach("webgpu-shared-first.png", { body: Buffer.from(result.first.png, "base64"), contentType: "image/png" });
    await test.info().attach("webgpu-shared-second.png", { body: Buffer.from(result.second.png, "base64"), contentType: "image/png" });
    expect(result.backend).toBe("webgpu");
    expect(result.selection).toMatchObject({ requested: "webgpu", active: "webgpu", deviceLost: false });
    expect(result.drawCalls).toBeGreaterThan(0);
    expect(result.shaderFailures).toEqual([]);
    expect(result.firstDispatch.workgroups).toEqual([1, 1, 1]);
    expect(result.secondDispatch.workgroups).toEqual([1, 1, 1]);
    expect(result.first.left[0]!).toBeGreaterThan(190);
    expect(result.first.left[2]!).toBeLessThan(35);
    expect(result.first.right[2]!).toBeGreaterThan(190);
    expect(result.first.right[0]!).toBeLessThan(35);
    expect(result.second.left[1]!).toBeGreaterThan(190);
    expect(result.second.left[0]!).toBeLessThan(35);
    expect(result.second.right[0]!).toBeGreaterThan(190);
    expect(result.second.right[1]!).toBeGreaterThan(190);
    expect(result.second.right[2]!).toBeLessThan(35);
    expect(result.disposedError).toMatch(/dispos|webgpu|unavailable/i);
    expect(errors).toEqual([]);
  });
});
