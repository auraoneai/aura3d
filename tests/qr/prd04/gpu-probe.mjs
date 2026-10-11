#!/usr/bin/env node
/**
 * gpu-probe.mjs — PRD-04 GPU job preflight (qr-prd04-materials.yml `gpu`).
 * Launches the same Chromium binary and args the lane specs use
 * (A3D_WEBGPU_BROWSER_EXECUTABLE + PRD04_CHROMIUM_ARGS) and records:
 *   - the unmasked WebGL2 renderer/vendor strings and a clear-colour readback;
 *   - whether WebGPU is available (navigator.gpu + requestAdapter + adapter info),
 *     which decides whether the WGSL twins can run on this runner.
 * Writes tests/reports/prd04/gpu-probe.json. Exits 1 when WebGL2 is missing or
 * the renderer is a software rasterizer (SwiftShader / llvmpipe / softpipe /
 * "Software"): a GPU job on a CPU rasterizer is not GPU evidence.
 * WebGPU absence is recorded, not fatal here — the WGSL twin spec fails on its own.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const out = resolve("tests/reports/prd04/gpu-probe.json");
const executablePath = process.env.A3D_WEBGPU_BROWSER_EXECUTABLE || undefined;
const args = (process.env.PRD04_CHROMIUM_ARGS ?? "").split(" ").filter(Boolean);

const browser = await chromium.launch({ executablePath, headless: true, args, timeout: 120_000 });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.setContent("<!doctype html><canvas id=c width=64 height=64></canvas>");
const result = await page.evaluate(async () => {
  const gl = document.getElementById("c").getContext("webgl2");
  const dbg = gl?.getExtension("WEBGL_debug_renderer_info");
  let px = null;
  if (gl) {
    gl.clearColor(0.2, 0.4, 0.8, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const a = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, a);
    px = Array.from(a);
  }
  const webgl = {
    webgl2: Boolean(gl),
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
    vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null,
    version: gl ? gl.getParameter(gl.VERSION) : null,
    floatColorBuffer: Boolean(gl?.getExtension("EXT_color_buffer_float")),
    px
  };
  const webgpu = { navigatorGpu: "gpu" in navigator, adapter: false, info: null, error: null };
  if (webgpu.navigatorGpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      webgpu.adapter = Boolean(adapter);
      if (adapter) {
        const info = adapter.info ?? (await adapter.requestAdapterInfo?.());
        webgpu.info = info
          ? { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description }
          : null;
        webgpu.isFallbackAdapter = adapter.isFallbackAdapter ?? null;
      }
    } catch (error) {
      webgpu.error = String(error);
    }
  }
  return { userAgent: navigator.userAgent, webgl, webgpu };
});
await browser.close();

const software = /swiftshader|llvmpipe|softpipe|software/i.test(String(result.webgl.renderer ?? ""));
const report = {
  executablePath: executablePath ?? "playwright default",
  args,
  ...result,
  gpuBacked: result.webgl.webgl2 && !software && result.webgl.renderer !== null,
  githubRunId: process.env.GITHUB_RUN_ID ?? null,
  runnerName: process.env.RUNNER_NAME ?? null
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.gpuBacked) {
  console.error(`WebGL renderer is not GPU-backed: ${JSON.stringify(result.webgl.renderer)}`);
  process.exit(1);
}
