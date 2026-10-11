import { expect, test } from "@playwright/test";

/**
 * Lane 03 GPU lane guard. Records the WebGL2 unmasked renderer string and,
 * when `A3D_REQUIRE_HW_GPU=1` (set by the post-quality `browser-gpu` job),
 * fails if it is a software rasterizer (SwiftShader, llvmpipe, softpipe,
 * Microsoft Basic Render) or WebGL2 is unavailable. Not a pixel test.
 */
test("WebGL2 runs on a hardware GPU", async ({ page }) => {
  await page.setContent("<canvas id=c width=8 height=8></canvas>");
  const info = await page.evaluate(() => {
    const gl = (document.getElementById("c") as HTMLCanvasElement).getContext("webgl2");
    if (!gl) return { webgl2: false, vendor: "", renderer: "" };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      webgl2: true,
      vendor: String(ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)),
      renderer: String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
    };
  });
  console.log("[gpu-probe]", JSON.stringify(info));
  expect(info.webgl2, "WebGL2 context").toBe(true);
  if (process.env.A3D_REQUIRE_HW_GPU === "1") {
    expect(info.renderer, `software renderer: ${info.renderer}`).not.toMatch(/swiftshader|llvmpipe|softpipe|basic render/i);
  }
});
