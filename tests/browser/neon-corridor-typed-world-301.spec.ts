import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

test("actual Neon Corridor route exposes its typed primary world", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const server = await startExampleDevServer();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/examples/neon-corridor-strike/?worldProbe=1`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 90_000 }).toBe("true");
    const capture = (visible: boolean) => page.evaluate((visible) =>
      (window as any).__AURA3D_CORRIDOR_WORLD_PROBE__.capture(visible), visible);
    const visible = await capture(true);
    const hidden = await capture(false);
    const restored = await capture(true);
    expect(visible.imported.assetId).toBe("neonCorridorContainmentWorld");
    expect(visible.imported.renderItemCount).toBeGreaterThan(0);
    expect(visible.diagnostics.backend).toBe("production-runtime");
    let changedPixels = 0;
    for (let i = 0; i < visible.pixels.length; i += 4) {
      if (Math.abs(visible.pixels[i] - hidden.pixels[i]) + Math.abs(visible.pixels[i + 1] - hidden.pixels[i + 1]) + Math.abs(visible.pixels[i + 2] - hidden.pixels[i + 2]) > 12) changedPixels++;
    }
    // A primary environment must contribute substantial actual-frame area.
    expect(changedPixels / (visible.width * visible.height)).toBeGreaterThan(0.05);
    expect(restored.imported.renderItemCount).toBeGreaterThan(0);
    await testInfo.attach("typed-world-visibility.json", { body: JSON.stringify({ changedPixels, width: visible.width, height: visible.height, imported: visible.imported, diagnostics: visible.diagnostics }, null, 2), contentType: "application/json" });
    await testInfo.attach("actual-corridor.png", { body: await page.screenshot(), contentType: "image/png" });
  } finally {
    await server.close();
  }
});
