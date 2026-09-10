/** Shared browser GL device-class detection.
 *
 * The PRD requires measured performance acceptance to name the surface it was
 * measured on: "software adapters do not establish native hardware performance".
 * Hosted CI runners expose SwiftShader/llvmpipe, so a frame-time budget that was
 * calibrated on real hardware cannot be asserted there without turning a known
 * environment property into a false product regression. Routes still have to
 * render, animate and stay finite on software GL; only the hardware-calibrated
 * budget comparison is scoped to hardware.
 */
import type { Browser, Page } from "@playwright/test";

export interface GlDeviceClass {
  readonly source: "cdp-systeminfo-glrenderer";
  readonly glRenderer: string;
  readonly unmaskedRenderer: string;
  readonly rendererIdentified: boolean;
  readonly softwareRasterizer: boolean;
  readonly hardwareAccelerated: boolean;
  readonly claimBoundary: string;
}

const SOFTWARE_GL = /swiftshader|llvmpipe|software rasterizer|softwarerasterizer|mesa offscreen/i;

export async function readGlDeviceClass(browser: Browser, page: Page): Promise<GlDeviceClass> {
  let glRenderer = "";
  try {
    const cdp = await browser.newBrowserCDPSession();
    try {
      const info = await cdp.send("SystemInfo.getInfo") as {
        gpu?: { auxAttributes?: Record<string, unknown> };
      };
      glRenderer = String(info.gpu?.auxAttributes?.glRenderer ?? "");
    } finally {
      await cdp.detach();
    }
  } catch {
    glRenderer = "";
  }
  const unmaskedRenderer = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return "";
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    return debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? "") : "";
  }).catch(() => "");
  const combined = `${glRenderer} ${unmaskedRenderer}`;
  const rendererIdentified = combined.trim().length > 0;
  // An unreadable renderer string is not evidence of hardware acceleration.
  // Hosted runners can hide `WEBGL_debug_renderer_info` and refuse the CDP
  // SystemInfo domain, and treating that silence as "hardware" asserted a
  // hardware-calibrated frame budget against SwiftShader. Only a positively
  // identified non-software renderer establishes hardware performance.
  const softwareRasterizer = !rendererIdentified || SOFTWARE_GL.test(combined);
  return {
    source: "cdp-systeminfo-glrenderer",
    glRenderer,
    unmaskedRenderer,
    rendererIdentified,
    softwareRasterizer,
    hardwareAccelerated: rendererIdentified && !SOFTWARE_GL.test(combined),
    claimBoundary: softwareRasterizer
      ? rendererIdentified
        ? "Software GL rasterizer: functional and visual evidence only; hardware-calibrated frame budgets are not asserted here."
        : "Unidentified GL renderer: functional and visual evidence only; hardware-calibrated frame budgets are not asserted here."
      : "Hardware GL renderer: hardware-calibrated frame budgets are asserted."
  };
}
