#!/usr/bin/env node
/**
 * GPU preflight for qr-prd08-camera.yml browser-gpu (Codex review on #1236).
 *
 * The job can run on macOS (Metal) or on the Linux L4 pools (Vulkan ANGLE).
 * If Chromium cannot reach the GPU it silently falls back to a software
 * rasterizer (SwiftShader / llvmpipe), and the timer-query / pixel evidence
 * would then describe the CPU, not the GPU. This launches Chromium with the
 * same CHROME_ARGS the specs use, reads the unmasked WebGL renderer, writes
 * it to tests/reports/prd08/renderer.txt, and exits non-zero on a software
 * renderer or a missing WebGL2 context.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", ...(process.env.CHROME_ARGS ?? "").split(/\s+/).filter(Boolean)];
const browser = await chromium.launch({ headless: true, args });
try {
  const page = await browser.newPage();
  const info = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return { webgl2: false, renderer: "", vendor: "" };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      webgl2: true,
      renderer: String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
      vendor: String(ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)),
      timerQuery: Boolean(gl.getExtension("EXT_disjoint_timer_query_webgl2"))
    };
  });
  const dir = resolve("tests/reports/prd08");
  mkdirSync(dir, { recursive: true });
  const line = `runner=${process.env.QRC_RUNNER ?? "unknown"} webgl2=${info.webgl2} vendor=${info.vendor} renderer=${info.renderer} timerQuery=${info.timerQuery ?? false}`;
  writeFileSync(resolve(dir, "renderer.txt"), `${line}\n`);
  console.log(`[prd08 gpu-preflight] ${line}`);
  if (!info.webgl2) {
    console.error("::error::no WebGL2 context: the browser-gpu evidence would not be GPU evidence");
    process.exit(1);
  }
  if (/swiftshader|llvmpipe|softpipe|software/i.test(`${info.renderer} ${info.vendor}`)) {
    console.error(`::error::software rasterizer (${info.renderer}): refusing to record GPU evidence on this host`);
    process.exit(1);
  }
} finally {
  await browser.close();
}
