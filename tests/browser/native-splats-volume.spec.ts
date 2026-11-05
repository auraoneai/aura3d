import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Phase B pixel tests. The data is generated here from numeric values, so these
 * fixtures do not depend on a third-party model or a screenshot baseline. The
 * assertions sample the subject, its transparent background, and an opaque
 * depth mask; a canvas that merely clears successfully cannot satisfy them.
 */
test.describe("native Gaussian splats and scalar volumes", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("loaded splats reorder as the camera moves, blend with depth, resize, and release their resources", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async ({ renderingUrl, assetsUrl }) => {
      const rendering = await import(renderingUrl);
      const assets = await import(assetsUrl);
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      document.body.appendChild(canvas);
      const device = rendering.WebGL2Device.create({ canvas, antialias: false, alpha: true, preserveDrawingBuffer: true });
      const gl = canvas.getContext("webgl2")!;
      const baseline = device.getDiagnostics();

      // Independent 32-byte SPLAT records: two translucent, overlapping red
      // and blue Gaussians at different depths, plus an off-screen green one.
      const bytes = new Uint8Array(3 * 32);
      const binary = new DataView(bytes.buffer);
      const records = [
        { position: [0, 0, -1.5], color: [255, 0, 0, 144] },
        { position: [0, 0, -2.5], color: [0, 0, 255, 144] },
        { position: [20, 0, -2], color: [0, 255, 0, 255] }
      ];
      records.forEach((record, i) => {
        const offset = i * 32;
        for (let axis = 0; axis < 3; axis++) {
          binary.setFloat32(offset + axis * 4, record.position[axis], true);
          binary.setFloat32(offset + 12 + axis * 4, 0.28, true);
        }
        bytes.set(record.color, offset + 24);
        bytes.set([255, 128, 128, 128], offset + 28); // identity, quantized wxyz
      });
      const cloud = await assets.parseGaussianSplat(bytes, "splat");
      const buffers: WebGLBuffer[] = [];
      const programs: WebGLProgram[] = [];
      const createBuffer = gl.createBuffer.bind(gl);
      const createProgram = gl.createProgram.bind(gl);
      gl.createBuffer = () => { const value = createBuffer(); if (value) buffers.push(value); return value; };
      gl.createProgram = () => { const value = createProgram(); if (value) programs.push(value); return value; };
      let splats: InstanceType<typeof rendering.GaussianSplatRenderer>;
      try {
        splats = new rendering.GaussianSplatRenderer(device, cloud);
      } catch (error) {
        gl.createBuffer = createBuffer;
        gl.createProgram = createProgram;
        throw error;
      }

      const front = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      // Camera at z=-4 looking toward +z; the same samples swap depth order.
      const back = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, -4, 1];
      const projection = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -0.2, 0, 0, 0, 0, 1];
      const frame = (viewMatrix: number[], occludeLeft = false) => {
        device.beginFrame(canvas.width, canvas.height);
        let info: { visibleCount: number; order: Uint32Array; backend: string; colorSpace: string };
        try {
          device.clear([0, 0, 0, 0]);
          if (occludeLeft) {
            // Simulate a nearer opaque surface across half the subject. Only
            // depth is cleared here so the unobstructed half still blends.
            gl.enable(gl.SCISSOR_TEST);
            gl.scissor(0, 0, canvas.width / 2, canvas.height);
            gl.depthMask(true);
            gl.clearDepth(0);
            gl.clear(gl.DEPTH_BUFFER_BIT);
            gl.disable(gl.SCISSOR_TEST);
            gl.clearDepth(1);
          }
          info = splats.draw({ viewMatrix, projectionMatrix: projection, viewport: [canvas.width, canvas.height] });
        } finally {
          device.endFrame();
        }
        const pixels: Uint8Array = device.readPixels(0, 0, canvas.width, canvas.height);
        const sample = (fractionX: number, fractionY: number) => {
          const x = Math.floor(canvas.width * fractionX);
          const y = Math.floor(canvas.height * fractionY);
          const offset = (y * canvas.width + x) * 4;
          return Array.from(pixels.slice(offset, offset + 4));
        };
        return { visibleCount: info.visibleCount, order: Array.from(info.order), backend: info.backend, colorSpace: info.colorSpace,
          center: sample(0.5, 0.5), left: sample(0.46, 0.5), right: sample(0.54, 0.5), background: sample(0.02, 0.02),
          lastError: device.getDiagnostics().lastError };
      };

      const fromFront = frame(front);
      const fromBack = frame(back);
      const occluded = frame(front, true);
      canvas.width = 80;
      canvas.height = 64;
      const resized = frame(front);
      const during = device.getDiagnostics();
      gl.createBuffer = createBuffer;
      gl.createProgram = createProgram;
      splats.dispose();
      splats.dispose();
      const after = device.getDiagnostics();
      let disposedError = "";
      try { splats.draw({ viewMatrix: front, projectionMatrix: projection, viewport: [80, 64] }); }
      catch (error) { disposedError = error instanceof Error ? error.message : String(error); }
      const allocated = { buffers: buffers.length, programs: programs.length };
      const live = { buffers: buffers.filter((buffer) => gl.isBuffer(buffer)).length, programs: programs.filter((program) => gl.isProgram(program)).length };
      const glError = gl.getError();
      device.dispose();
      canvas.remove();
      return { asset: { count: cloud.count, format: cloud.metadata.format }, fromFront, fromBack, occluded, resized,
        baseline, during, after, disposedError, allocated, live, glError };
    }, { renderingUrl: `${server.origin}/packages/rendering/src/index.ts`, assetsUrl: `${server.origin}/packages/assets/src/browser-index.ts` });

    expect(result.asset).toEqual({ count: 3, format: "splat" });
    expect(result.fromFront).toMatchObject({ visibleCount: 2, order: [1, 0], backend: "webgl2" });
    expect(result.fromBack).toMatchObject({ visibleCount: 2, order: [0, 1], backend: "webgl2" });
    expect(result.fromFront.center[0]).toBeGreaterThan(result.fromFront.center[2] + 25);
    expect(result.fromBack.center[2]).toBeGreaterThan(result.fromBack.center[0] + 25);
    expect(result.fromFront.center[1]).toBeLessThan(3);
    expect(result.fromFront.center[3]).toBeGreaterThan(0);
    expect(result.fromFront.center[3]).toBeLessThan(255);
    expect(result.fromFront.background).toEqual([0, 0, 0, 0]);
    expect([result.fromFront.lastError, result.fromBack.lastError, result.occluded.lastError, result.resized.lastError]).toEqual([null, null, null, null]);
    expect(result.occluded.left[0]).toBeLessThan(3);
    expect(result.occluded.left[2]).toBeLessThan(3);
    expect(result.occluded.right[0]).toBeGreaterThan(50);
    expect(result.resized.center[0]).toBeGreaterThan(result.resized.center[2] + 25);
    expect(result.during.buffers).toBeGreaterThan(result.baseline.buffers);
    expect(result.after.buffers).toBe(result.baseline.buffers);
    expect(result.after.shaders).toBe(result.baseline.shaders);
    expect(result.allocated.buffers).toBeGreaterThanOrEqual(2);
    expect(result.allocated.programs).toBeGreaterThanOrEqual(1);
    expect(result.live).toEqual({ buffers: 0, programs: 0 });
    expect(result.disposedError).toMatch(/disposed/i);
    expect(result.glError).toBe(0);
    expect(errors).toEqual([]);
  });

  test("native WebGPU draws the same camera-dependent splat ordering", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async ({ renderingUrl, assetsUrl }) => {
      const rendering = await import(renderingUrl);
      const assets = await import(assetsUrl);
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      document.body.appendChild(canvas);
      // Do not silently substitute WebGL or a CPU mock when this backend is
      // unavailable. The acceptance run records that as a missing WebGPU case.
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
      if (!gpu) { canvas.remove(); return { unsupported: "navigator.gpu is unavailable" }; }
      if (!await gpu.requestAdapter()) { canvas.remove(); return { unsupported: "WebGPU adapter unavailable" }; }
      const device = await rendering.createRenderDevice({ backend: "webgpu", canvas });
      const bytes = new Uint8Array(64);
      const binary = new DataView(bytes.buffer);
      for (let i = 0; i < 2; i++) {
        const offset = i * 32;
        binary.setFloat32(offset + 8, i === 0 ? -1.5 : -2.5, true);
        for (let axis = 0; axis < 3; axis++) binary.setFloat32(offset + 12 + axis * 4, 0.28, true);
        bytes.set(i === 0 ? [255, 0, 0, 144] : [0, 0, 255, 144], offset + 24);
        bytes.set([255, 128, 128, 128], offset + 28);
      }
      const cloud = await assets.parseGaussianSplat(bytes, "splat");
      const splats = new rendering.GaussianSplatRenderer(device, cloud);
      const target = device.createRenderTarget({ width: 64, height: 64, label: "native-splat-webgpu-pixels" });
      device.setRenderTarget(target);
      const front = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      const back = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, -4, 1];
      const projection = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -0.2, 0, 0, 0, 0, 1];
      const frame = async (viewMatrix: number[]) => {
        device.beginFrame(64, 64);
        let info: { visibleCount: number; order: Uint32Array; backend: string };
        try {
          device.clear([0, 0, 0, 0]);
          info = splats.draw({ viewMatrix, projectionMatrix: projection, viewport: [64, 64] });
        } finally {
          device.endFrame();
        }
        const center: Uint8Array = await device.readPixelsAsync(32, 32, 1, 1);
        return { visibleCount: info.visibleCount, order: Array.from(info.order), backend: info.backend, center: Array.from(center) };
      };
      const fromFront = await frame(front);
      const fromBack = await frame(back);
      const diagnostics = device.getDiagnostics();
      const adapter = device.info;
      splats.dispose();
      target.dispose();
      device.dispose();
      canvas.remove();
      return { fromFront, fromBack, diagnostics, adapter };
    }, { renderingUrl: `${server.origin}/packages/rendering/src/index.ts`, assetsUrl: `${server.origin}/packages/assets/src/browser-index.ts` });

    if ("unsupported" in result) { test.skip(true, result.unsupported); return; }
    expect(result.fromFront).toMatchObject({ visibleCount: 2, order: [1, 0], backend: "webgpu" });
    expect(result.fromBack).toMatchObject({ visibleCount: 2, order: [0, 1], backend: "webgpu" });
    expect(result.fromFront.center[0]).toBeGreaterThan(result.fromFront.center[2] + 20);
    expect(result.fromBack.center[2]).toBeGreaterThan(result.fromBack.center[0] + 20);
    expect(result.fromFront.center[3]).toBeGreaterThan(0);
    expect(result.diagnostics.nativeSubmissions).toBeGreaterThan(0);
    expect(result.diagnostics.lastError).toBeNull();
    expect(result.adapter.renderer).toBeTruthy();
    expect(errors).toEqual([]);
  });

  test("volume raymarching and slices honor color, clipping, depth, resize, and disposal", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async ({ renderingUrl, volumetricsUrl }) => {
      const rendering = await import(renderingUrl);
      const volumetrics = await import(volumetricsUrl) as typeof import("@aura3d/rendering/volumetrics");
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      document.body.appendChild(canvas);
      const device = rendering.WebGL2Device.create({ canvas, antialias: false, alpha: true, preserveDrawingBuffer: true });
      const gl = canvas.getContext("webgl2")!;

      // The x-gradient is constant in y and z. The left side is red and the
      // right blue, with nonzero but translucent transfer-function alpha.
      const dimensions = [8, 4, 4] as const;
      const data = new Float32Array(dimensions[0] * dimensions[1] * dimensions[2]);
      for (let z = 0; z < dimensions[2]; z++) for (let y = 0; y < dimensions[1]; y++) for (let x = 0; x < dimensions[0]; x++) {
        data[x + dimensions[0] * (y + dimensions[1] * z)] = x / (dimensions[0] - 1);
      }
      const redBlue = [
        { value: 0, color: [1, 0, 0, 0.15] },
        { value: 1, color: [0, 0, 1, 0.15] }
      ] as const;

      // Capture the renderer's own native resources, not resources the test
      // creates later for an opaque depth copy. Deleted objects must no longer
      // be live in this same context after disposal.
      const textures: WebGLTexture[] = [];
      const programs: WebGLProgram[] = [];
      const arrays: WebGLVertexArrayObject[] = [];
      const createTexture = gl.createTexture.bind(gl);
      const createProgram = gl.createProgram.bind(gl);
      const createVertexArray = gl.createVertexArray.bind(gl);
      gl.createTexture = () => { const value = createTexture(); if (value) textures.push(value); return value; };
      gl.createProgram = () => { const value = createProgram(); if (value) programs.push(value); return value; };
      gl.createVertexArray = () => { const value = createVertexArray(); if (value) arrays.push(value); return value; };
      let volume: InstanceType<typeof volumetrics.VolumeRenderer>;
      try {
        volume = volumetrics.VolumeRenderer.fromDevice(device, { dimensions, data, domain: [0, 1], transfer: redBlue, sampleCount: 64 });
      } finally {
        gl.createTexture = createTexture;
        gl.createProgram = createProgram;
        gl.createVertexArray = createVertexArray;
      }

      // Map the local unit cube to the middle 80% of clip space. This is an
      // orthographic camera looking through the cube in the +z direction.
      const viewProjectionMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      const modelMatrix = [1.6, 0, 0, 0, 0, 1.6, 0, 0, 0, 0, 1.6, 0, -0.8, -0.8, -0.8, 1];
      type Mode = { type: "raymarch" } | { type: "slice"; axis: "z"; position: number };
      const frame = (mode: Mode, depth?: WebGLTexture) => {
        device.beginFrame(canvas.width, canvas.height);
        try {
          device.clear([0, 0, 0, 0]);
          volume.draw({ viewProjectionMatrix, modelMatrix, mode, sceneDepth: depth });
        } finally {
          device.endFrame();
        }
        const pixels: Uint8Array = device.readPixels(0, 0, canvas.width, canvas.height);
        const sample = (fractionX: number, fractionY: number) => {
          const x = Math.floor(canvas.width * fractionX);
          const y = Math.floor(canvas.height * fractionY);
          const offset = (y * canvas.width + x) * 4;
          return Array.from(pixels.slice(offset, offset + 4));
        };
        return { left: sample(0.35, 0.5), right: sample(0.65, 0.5), background: sample(0.02, 0.02), lastError: device.getDiagnostics().lastError };
      };

      const ray = frame({ type: "raymarch" });
      const slice = frame({ type: "slice", axis: "z", position: 0.5 });
      volume.setClipPlanes([[1, 0, 0, -0.5]]);
      const clipped = frame({ type: "raymarch" });
      volume.setClipPlanes([]);

      // A separate depth texture represents opaque geometry in the left half
      // of the screen, in front of the volume; the right half remains visible.
      const depth = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, depth);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const depthValues = new Uint8Array(canvas.width * canvas.height);
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        depthValues[y * canvas.width + x] = x < canvas.width / 2 ? 0 : 255;
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, canvas.width, canvas.height, 0, gl.RED, gl.UNSIGNED_BYTE, depthValues);
      gl.bindTexture(gl.TEXTURE_2D, null);
      const occluded = frame({ type: "raymarch" }, depth);
      gl.deleteTexture(depth);

      volume.updateTransferFunction([
        { value: 0, color: [0, 1, 0, 0.15] },
        { value: 1, color: [0, 1, 0, 0.15] }
      ]);
      const updated = frame({ type: "slice", axis: "z", position: 0.5 });
      canvas.width = 80;
      canvas.height = 64;
      const resized = frame({ type: "slice", axis: "z", position: 0.5 });
      const beforeDispose = volume.getDiagnostics();
      volume.dispose();
      volume.dispose();
      const afterDispose = volume.getDiagnostics();
      let disposedError = "";
      try { volume.draw({ viewProjectionMatrix, modelMatrix }); }
      catch (error) { disposedError = error instanceof Error ? error.message : String(error); }
      const liveResources = {
        textures: textures.filter((texture) => gl.isTexture(texture)).length,
        programs: programs.filter((program) => gl.isProgram(program)).length,
        arrays: arrays.filter((array) => gl.isVertexArray(array)).length
      };
      const allocated = { textures: textures.length, programs: programs.length, arrays: arrays.length };
      const glError = gl.getError();
      device.dispose();
      canvas.remove();
      return { ray, slice, clipped, occluded, updated, resized, beforeDispose, afterDispose, disposedError, allocated, liveResources, glError };
    }, {
      renderingUrl: `${server.origin}/packages/rendering/src/index.ts`,
      volumetricsUrl: `${server.origin}/packages/rendering/src/volumetrics.ts`
    });

    expect(result.ray.left[0]).toBeGreaterThan(result.ray.left[2] + 35);
    expect(result.ray.right[2]).toBeGreaterThan(result.ray.right[0] + 35);
    expect(result.ray.background).toEqual([0, 0, 0, 0]);
    expect(result.slice.left[0]).toBeGreaterThan(result.slice.left[2] + 5);
    expect(result.slice.right[2]).toBeGreaterThan(result.slice.right[0] + 5);
    expect(result.slice.left[3]).toBeGreaterThan(10);
    expect(result.slice.left[3]).toBeLessThan(128);
    expect(result.clipped.left[0]).toBeLessThan(3);
    expect(result.clipped.left[2]).toBeLessThan(3);
    expect(result.clipped.right[2]).toBeGreaterThan(35);
    expect(result.occluded.left[0]).toBeLessThan(3);
    expect(result.occluded.right[2]).toBeGreaterThan(35);
    expect(result.updated.left[1]).toBeGreaterThan(result.updated.left[0] + 15);
    expect(result.updated.right[1]).toBeGreaterThan(result.updated.right[2] + 15);
    expect(result.resized.left[1]).toBeGreaterThan(15);
    expect(result.resized.right[1]).toBeGreaterThan(15);
    expect([result.ray.lastError, result.slice.lastError, result.clipped.lastError, result.occluded.lastError, result.updated.lastError, result.resized.lastError]).toEqual([null, null, null, null, null, null]);
    expect(result.beforeDispose).toMatchObject({ backend: "webgl2", dimensions: [8, 4, 4], voxelCount: 128, disposed: false });
    expect(result.beforeDispose.gpuBytes).toBeGreaterThan(0);
    expect(result.afterDispose).toMatchObject({ disposed: true, gpuBytes: 0, retainedCpuBytes: 0 });
    expect(result.disposedError).toMatch(/disposed/i);
    expect(result.allocated.textures).toBeGreaterThanOrEqual(3);
    expect(result.allocated.programs).toBeGreaterThanOrEqual(1);
    expect(result.allocated.arrays).toBeGreaterThanOrEqual(1);
    expect(result.liveResources).toEqual({ textures: 0, programs: 0, arrays: 0 });
    expect(result.glError).toBe(0);
    expect(errors).toEqual([]);
  });
});
