import type { AuraApp, AuraScreenshot } from "../agent-api/index.js";

export async function captureAuraAppScreenshot(app: AuraApp): Promise<AuraScreenshot> {
  return app.screenshot();
}

export function assertAuraScreenshotNotBlank(screenshot: AuraScreenshot): void {
  if (screenshot.width <= 0 || screenshot.height <= 0) throw new Error("Aura3D screenshot is blank because width or height is zero.");
  if (!screenshot.dataUrl.startsWith("data:image/png")) throw new Error("Aura3D screenshot must be a PNG data URL.");
}
