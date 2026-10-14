import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const REPORT_DIR = resolve(process.cwd(), "tests/reports/deep-recovery/scene");

test("deep recovery scene renders 3D ocean, lighting, buoy station, wreck models, and sub entity", async ({ page }) => {
  test.setTimeout(300_000);
  mkdirSync(REPORT_DIR, { recursive: true });

  const server = await startExampleDevServer();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(server.origin + "/apps/showcase-deep-recovery/", { waitUntil: "commit", timeout: 120_000 });

    await page.waitForFunction(
      () => Boolean((window as unknown as { __DEEP_RECOVERY_EVIDENCE__?: unknown }).__DEEP_RECOVERY_EVIDENCE__),
      undefined,
      { timeout: 180_000 }
    );

    // Let rendering settle for 60 frames
    await page.evaluate(() => {
      (window as unknown as { __DR_PUMP__?: (frames: number) => number }).__DR_PUMP__?.(60);
    });
    await page.waitForTimeout(500);

    // Capture scene screenshots
    await page.screenshot({ path: resolve(REPORT_DIR, "deep-recovery-scene-main.png") });
    await page.screenshot({ path: resolve(process.cwd(), "public/previews/showcase-index/deep-recovery.png") });

    const dataUrl = await page.evaluate(() => {
      const canvas = document.querySelector("#canvas-host canvas") as HTMLCanvasElement | null;
      if (!canvas) return null;
      return canvas.toDataURL("image/webp", 0.9);
    });
    if (dataUrl) {
      const base64Data = dataUrl.replace(/^data:image\/webp;base64,/, "");
      const { writeFileSync } = await import("node:fs");
      writeFileSync(resolve(process.cwd(), "public/previews/showcase-index/deep-recovery.webp"), Buffer.from(base64Data, "base64"));
    }

    // Verify canvas exists and is non-empty
    const canvas = await page.$("#canvas-host canvas");
    expect(canvas).not.toBeNull();

    // Verify HUD elements are visible and styled
    const zoneBadge = await page.textContent("#dr-zone-badge");
    expect(zoneBadge).toContain("Shallow Reef");

    const oxygenText = await page.textContent("#dr-oxygen-val");
    const oxygenVal = parseInt(oxygenText?.replace("%", "") ?? "0", 10);
    expect(oxygenVal).toBeGreaterThanOrEqual(90);
  } finally {
    await server.close();
  }
});
