#!/usr/bin/env node
/**
 * Print the WebGL2 renderer string Chromium gets with QR_CHROMIUM_ARGS, and
 * fail when there is no WebGL2 context or the renderer is software
 * (SwiftShader / llvmpipe): a GPU suite must never run on a software GPU.
 */
import { chromium } from "@playwright/test";

const args = (process.env.QR_CHROMIUM_ARGS ?? "").split(/\s+/).filter(Boolean);
const browser = await chromium.launch({ args });
try {
  const page = await browser.newPage();
  const renderer = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  });
  if (!renderer) {
    console.error("::error::no WebGL2 context on this runner");
    process.exitCode = 1;
  } else if (/swiftshader|llvmpipe|software/i.test(renderer)) {
    console.error(`::error::software renderer (${renderer}); not a GPU run`);
    process.exitCode = 1;
  } else {
    console.log(`renderer: ${renderer}`);
  }
} finally {
  await browser.close();
}
