import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("J2 native WebGPU spot shadows — projective PCF pixel proof", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("spot shadow map renders natively and darkens a localized off-center patch", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto(`${server.origin}/tests/browser/webgpu-spot-shadow-j2-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const state = (window as unknown as { __AURA3D_J2_WEBGPU_SPOT__?: { status?: string } }).__AURA3D_J2_WEBGPU_SPOT__;
        return state?.status === "ready" || state?.status === "error";
      },
      undefined,
      { timeout: 180_000 }
    );

    const result = await page.evaluate(() => (window as unknown as { __AURA3D_J2_WEBGPU_SPOT__?: Record<string, unknown> }).__AURA3D_J2_WEBGPU_SPOT__);
    mkdirSync(resolve("tests/reports/webgpu-spot-shadow-j2"), { recursive: true });
    writeFileSync(resolve("tests/reports/webgpu-spot-shadow-j2/j2-spot-result.json"), `${JSON.stringify({ ...result, pageErrors, consoleErrors }, null, 2)}\n`);
    await page.screenshot({ path: resolve("tests/reports/webgpu-spot-shadow-j2/j2-spot-capture.png") });

    expect(result?.["status"], String(result?.["error"] ?? pageErrors.join("\n"))).toBe("ready");
    expect(result?.["backend"]).toBe("webgpu");
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(result?.["galleryPanelCount"]).toBe(5);

    // Depth leg: the natively rendered shadow target carries a real depth
    // gradient (far clear + nearer casters), not flat clear color.
    expect(result?.["depthRendered"]).toBe(true);
    expect(Number(result?.["depthCasterCount"])).toBeGreaterThanOrEqual(2);
    const depthStats = result?.["depthStats"] as { min: number; max: number; uniqueValues: number; farFraction: number };
    expect(depthStats.uniqueValues).toBeGreaterThan(4);
    expect(depthStats.min).toBeLessThan(200);
    expect(depthStats.farFraction).toBeGreaterThan(0.2);

    // Shadow leg: thousands of pixels drop vs unshadowed, but far from the
    // whole frame (a global dimmer — the old center-sample stub — fails this).
    const dropCount = Number(result?.["shadowDropCount"]);
    expect(dropCount).toBeGreaterThan(500);
    expect(Number(result?.["dropFraction"])).toBeLessThan(0.4);

    // Localization leg: the drop centroid sits off frame-center (the caster
    // is offset +x), which a fullscreen dimmer or mirrored lookup cannot do.
    expect(Number(result?.["centroidOffCenterPx"])).toBeGreaterThan(40);
    // Depth leg (B1 methodology): the drop bounding box spans the caster's
    // own dark silhouette plus lit floor, so its mean is dilution-prone by
    // construction. Depth is gated on the fixed shadow-core receiver patch
    // instead — the same bar as the accepted GL proof (B1 spot patch > 6).
    // A mirrored lookup misses the fixed +x patch; a stub/dimmer fails the
    // centroid, drop-fraction, and lit-corner legs above and below.
    expect(Number(result?.["shadowCorePatchDrop"])).toBeGreaterThan(6);

    // Filtering leg: single-tap also shadows, and the 9-tap PCF kernel
    // differs from single-tap (the kernel is really sampled).
    expect(Number(result?.["singleTapDropCount"])).toBeGreaterThan(200);
    expect(Number(result?.["pcfVsSingleDiffCount"])).toBeGreaterThan(20);

    // Preservation leg: the lit corner agrees between shadowed/unshadowed.
    expect(Number(result?.["litCornerDeltaPcfVsUnshadowed"])).toBeLessThan(4);

    // Binding leg: the spot map bound as a REAL native texture (not the
    // white fallback) on the shadowed frame.
    expect(Number(result?.["pcfShadowBindings"])).toBeGreaterThanOrEqual(1);

    // Frame-health legs.
    const pcf = result?.["pcf"] as { drawCalls: number; lastError: string | null; nonBlackPixels: number };
    expect(pcf.lastError).toBeNull();
    expect(pcf.drawCalls).toBeGreaterThanOrEqual(2);
    expect(pcf.nonBlackPixels).toBeGreaterThan(40_000);
  });
});
