/**
 * J2 render-bundle hardware measurement (PART J open box: `render-bundles`).
 *
 * Measures, on the REAL adapter in this browser, whether executing one
 * pre-recorded `GPURenderBundle` with N static repeat draws is cheaper than
 * re-encoding the same N draws every frame. Writes wall-clock numbers to
 * `tests/reports/webgpu-parity/render-bundle-measurement.json` and feeds them
 * to `screenWebGPURenderBundlePrototype` — structure alone never adopts.
 *
 * Workload: 4096 static draws of distinct triangles from one vertex buffer
 * (draws differ by firstVertex only, no per-draw uniforms), mirroring the
 * D1/P2-style static-repeat workload the screen models. Both arms submit the
 * same draws to the same 256x256 target and await `onSubmittedWorkDone` per
 * frame, so the medians compare end-to-end frame cost, not just encoding.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { screenWebGPURenderBundlePrototype } from "../../packages/rendering/src/production-runtime";

const DRAWS = 4096;
const WARMUP_FRAMES = 10;
const MEASURED_FRAMES = 60;

test.describe("J2 render-bundle hardware measurement", () => {
  test.setTimeout(180_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("measures bundle-execute vs re-encoded draws on the real adapter", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/rendering-webgpu-harness.html`, { waitUntil: "domcontentloaded" });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const measurement = await page.evaluate(async ({ draws, warmupFrames, measuredFrames }) => {
      const gpu = (navigator as unknown as { gpu?: GPU }).gpu;
      if (!gpu?.requestAdapter) {
        return { available: false as const, cause: "navigator.gpu.requestAdapter is not exposed by this browser/runtime" };
      }
      let adapter: GPUAdapter | null = null;
      try {
        adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
      } catch (error) {
        return { available: false as const, cause: `requestAdapter threw: ${error instanceof Error ? error.message : String(error)}` };
      }
      if (!adapter) return { available: false as const, cause: "navigator.gpu.requestAdapter returned null" };
      const adapterInfo = `vendor=${adapter.info?.vendor ?? "unknown"} arch=${adapter.info?.architecture ?? "unknown"}`;
      let device: GPUDevice;
      try {
        device = await adapter.requestDevice();
      } catch (error) {
        return { available: false as const, cause: `requestDevice threw: ${error instanceof Error ? error.message : String(error)}` };
      }
      try {
        // 4096 distinct small triangles covering the target so the frame is non-empty.
        const vertsPerTri = 3;
        const positions = new Float32Array(draws * vertsPerTri * 2);
        let seed = 0x9e3779b9;
        const rand = (): number => {
          seed = (Math.imul(seed ^ (seed >>> 15), seed | 1) >>> 0) || 1;
          seed ^= seed + Math.imul(seed ^ (seed >>> 7), seed | 61);
          return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296;
        };
        for (let tri = 0; tri < draws; tri += 1) {
          const cx = rand() * 2 - 1;
          const cy = rand() * 2 - 1;
          const r = 0.01 + rand() * 0.03;
          for (let v = 0; v < vertsPerTri; v += 1) {
            const angle = (v / vertsPerTri) * Math.PI * 2 + rand();
            positions.set([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r], (tri * vertsPerTri + v) * 2);
          }
        }
        const vertexBuffer = device.createBuffer({
          size: positions.byteLength,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(vertexBuffer, 0, positions);

        const pipeline = device.createRenderPipeline({
          layout: "auto",
          vertex: {
            module: device.createShaderModule({
              code: `@vertex fn vs(@location(0) pos: vec2<f32>) -> @builtin(position) vec4<f32> { return vec4<f32>(pos, 0.0, 1.0); }`
            }),
            entryPoint: "vs",
            buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }] }]
          },
          fragment: {
            module: device.createShaderModule({
              code: `@fragment fn fs() -> @location(0) vec4<f32> { return vec4<f32>(0.9, 0.45, 0.1, 1.0); }`
            }),
            entryPoint: "fs",
            targets: [{ format: "rgba8unorm" }]
          },
          primitive: { topology: "triangle-list" }
        });

        const SIZE = 256;
        const target = device.createTexture({
          size: [SIZE, SIZE, 1],
          format: "rgba8unorm",
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
        });
        const encodeDirect = (): GPUCommandBuffer => {
          const encoder = device.createCommandEncoder();
          const pass = encoder.beginRenderPass({
            colorAttachments: [{
              view: target.createView(),
              loadOp: "clear",
              storeOp: "store",
              clearValue: { r: 0.01, g: 0.012, b: 0.02, a: 1 }
            }]
          });
          pass.setPipeline(pipeline);
          pass.setVertexBuffer(0, vertexBuffer);
          for (let tri = 0; tri < draws; tri += 1) pass.draw(vertsPerTri, 1, tri * vertsPerTri, 0);
          pass.end();
          return encoder.finish();
        };

        // One recorded bundle holding the same static draws.
        const bundleEncoder = device.createRenderBundleEncoder({
          colorFormats: ["rgba8unorm" as GPUTextureFormat]
        });
        bundleEncoder.setPipeline(pipeline);
        bundleEncoder.setVertexBuffer(0, vertexBuffer);
        for (let tri = 0; tri < draws; tri += 1) bundleEncoder.draw(vertsPerTri, 1, tri * vertsPerTri, 0);
        const bundle = bundleEncoder.finish();
        const encodeBundle = (): GPUCommandBuffer => {
          const encoder = device.createCommandEncoder();
          const pass = encoder.beginRenderPass({
            colorAttachments: [{
              view: target.createView(),
              loadOp: "clear",
              storeOp: "store",
              clearValue: { r: 0.01, g: 0.012, b: 0.02, a: 1 }
            }]
          });
          pass.executeBundles([bundle]);
          pass.end();
          return encoder.finish();
        };

        const timeFrames = async (encode: () => GPUCommandBuffer, frames: number): Promise<number[]> => {
          const samples: number[] = [];
          for (let frame = 0; frame < frames; frame += 1) {
            const before = performance.now();
            device.queue.submit([encode()]);
            await device.queue.onSubmittedWorkDone();
            samples.push(performance.now() - before);
          }
          return samples;
        };
        const median = (values: number[]): number => {
          const sorted = [...values].sort((a, b) => a - b);
          return sorted[Math.floor(sorted.length / 2)] ?? 0;
        };

        await timeFrames(encodeDirect, warmupFrames);
        const directSamples = await timeFrames(encodeDirect, measuredFrames);
        await timeFrames(encodeBundle, warmupFrames);
        const bundleSamples = await timeFrames(encodeBundle, measuredFrames);

        // Pixel sanity: the bundled frame must actually paint (COPY_SRC readback).
        device.queue.submit([encodeBundle()]);
        const readback = device.createBuffer({ size: SIZE * SIZE * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        const copyEncoder = device.createCommandEncoder();
        copyEncoder.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow: SIZE * 4 }, [SIZE, SIZE, 1]);
        device.queue.submit([copyEncoder.finish()]);
        await readback.mapAsync(GPUMapMode.READ);
        const bytes = new Uint8Array(readback.getMappedRange());
        const byteLength = bytes.length;
        let nonZeroBytes = 0;
        for (let i = 0; i < bytes.length; i += 1) if (bytes[i] !== 0) nonZeroBytes += 1;
        readback.unmap();

        device.destroy();
        return {
          available: true as const,
          adapter: adapterInfo,
          draws,
          warmupFrames,
          measuredFrames,
          medianDirectMs: median(directSamples),
          medianBundleMs: median(bundleSamples),
          nonZeroReadbackBytes: nonZeroBytes,
          readbackByteLength: byteLength
        };
      } catch (error) {
        try { device.destroy(); } catch { /* ignore secondary failure */ }
        return { available: false as const, cause: `measurement threw: ${error instanceof Error ? error.message : String(error)}` };
      }
    }, { draws: DRAWS, warmupFrames: WARMUP_FRAMES, measuredFrames: MEASURED_FRAMES });

    expect(measurement.available, `BLOCKED-with-cause: ${!measurement.available ? measurement.cause : "n/a"}`).toBe(true);
    if (!measurement.available) return;
    expect(measurement.nonZeroReadbackBytes).toBeGreaterThan(0);

    const screen = screenWebGPURenderBundlePrototype({
      totalDraws: DRAWS,
      staticRepeatDraws: DRAWS,
      measuredExecuteMs: measurement.medianBundleMs,
      measuredDrawMs: measurement.medianDirectMs
    });

    const report = {
      schema: "a3d-webgpu-render-bundle-measurement",
      generatedAt: new Date().toISOString(),
      workload: `${DRAWS} static repeat draws (distinct triangles, firstVertex-varying, no per-draw uniforms) on a 256x256 offscreen target`,
      adapter: measurement.adapter,
      frames: { warmup: WARMUP_FRAMES, measured: MEASURED_FRAMES, sync: "queue.onSubmittedWorkDone per frame" },
      medianDirectMs: measurement.medianDirectMs,
      medianBundleExecuteMs: measurement.medianBundleMs,
      executeVsDrawRatio:
        measurement.medianDirectMs > 0 ? measurement.medianBundleMs / measurement.medianDirectMs : null,
      pixelSanity: {
        nonZeroReadbackBytes: measurement.nonZeroReadbackBytes,
        readbackByteLength: measurement.readbackByteLength
      },
      screen,
      pageErrors
    };
    mkdirSync(resolve("tests/reports/webgpu-parity"), { recursive: true });
    writeFileSync(resolve("tests/reports/webgpu-parity/render-bundle-measurement.json"), `${JSON.stringify(report, null, 2)}\n`);

    expect(report.executeVsDrawRatio).not.toBeNull();
    expect(screen.verdict).toBe("adopt-candidate");
    expect(screen.estimatedExecuteVsDrawRatio).toBeLessThan(1);
  });
});
