#!/usr/bin/env node
/**
 * Lane-01 GPU job renderer check (qr-prd01-core.yml `gpu`). Launches Chromium
 * exactly as the lane specs do (QR_PRD01_CHANNEL + QR_PRD01_CHROME_ARGS, see
 * playwright.config.ts), prints the WebGL2 renderer string, and fails when
 * there is no WebGL2 context or the renderer is software (SwiftShader /
 * llvmpipe): GPU evidence must never come from a software rasterizer.
 * Equivalent to tools/quality-rebuild-capture/gpu-renderer.mjs (#956); switch
 * to it once that lands on main.
 */
import { chromium } from "@playwright/test";

const args = (process.env.QR_PRD01_CHROME_ARGS ?? "").split(/\s+/).filter(Boolean);
const channel = process.env.QR_PRD01_CHANNEL || undefined;
const browser = await chromium.launch({ ...(channel ? { channel } : {}), args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", ...args] });
try {
  const page = await browser.newPage();
  const probe = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      renderer: String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
      vendor: String(ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)),
      floatColorBuffer: gl.getExtension("EXT_color_buffer_float") !== null,
      maxSamples: gl.getParameter(gl.MAX_SAMPLES)
    };
  });
  console.log(`browser: ${browser.version()} channel=${channel ?? "default"} args=${args.join(" ")}`);
  if (!probe) {
    console.error("::error::no WebGL2 context on this runner");
    process.exitCode = 1;
  } else if (/swiftshader|llvmpipe|software/i.test(probe.renderer)) {
    console.error(`::error::software renderer (${probe.renderer}); not a GPU run`);
    process.exitCode = 1;
  } else {
    console.log(`renderer: ${probe.renderer}`);
    console.log(`vendor: ${probe.vendor} floatColorBuffer=${probe.floatColorBuffer} maxSamples=${probe.maxSamples}`);
  }
} finally {
  await browser.close();
}
