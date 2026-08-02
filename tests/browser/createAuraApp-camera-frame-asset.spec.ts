import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportPath = "tests/reports/createAuraApp-camera-frame-asset/camera-frame-asset.json";
const screenshotPath = "tests/reports/createAuraApp-camera-frame-asset/camera-frame-asset.png";

test.describe("createAuraApp camera frameAsset contract", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("camera.frameAsset frames typed GLBs through the public root API", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/createAuraApp-camera-frame-asset-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as any).__AURA3D_CAMERA_FRAME_ASSET_CONTRACT__ || (window as any).__AURA3D_CAMERA_FRAME_ASSET_ERROR__), undefined, { timeout: 20_000 });

    const harnessError = await page.evaluate(() => (window as any).__AURA3D_CAMERA_FRAME_ASSET_ERROR__);
    if (harnessError) throw new Error(String(harnessError));

    const evidence = await page.evaluate(() => (window as any).__AURA3D_CAMERA_FRAME_ASSET_CONTRACT__);
    mkdirSync(dirname(resolve(reportPath)), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    writeFileSync(resolve(reportPath), `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      screenshotPath,
      evidence
    }, null, 2)}\n`);

    expect(evidence?.imports).toEqual(["@aura3d/engine", "../../src/aura-assets"]);
    expect(evidence?.asset).toBe("assets.robotcand");
    expect(evidence?.cases?.map((entry: { id: string }) => entry.id)).toEqual([
      "targetHeight",
      "targetMaxDimension",
      "targetLength",
      "default"
    ]);
    for (const frameCase of evidence?.cases ?? []) {
      expect(frameCase.renderer.runtimeBackend).toBe("production-runtime");
      expect(frameCase.renderer.drawCalls).toBeGreaterThan(0);
      expect(frameCase.camera.mode).toBe("orbit");
      expect(frameCase.camera.distance).toBeGreaterThan(0);
      expect(frameCase.pixels.nonBackgroundPixels).toBeGreaterThan(1200);
      expect(frameCase.pixels.colorBuckets).toBeGreaterThan(5);
      // Every sizing option must frame without clipping, including `targetLength`.
      //
      // `targetLength` used to clip because `camera.frameAsset` is synchronous and can
      // only read manifest `boundsMetadata`, while the production bridge sizes models
      // from the bounds computed from the loaded GLB. Those disagreed non-uniformly
      // because the CLI recorded bounds in mesh-local space and ignored node
      // transforms: for `robotcand` it reported an extent of [30.3, 24.1, 15.3] against
      // a real [15.9, 25.1, 10.0]. Height nearly agreed, so height-based framing looked
      // fine, but `targetLength` divides by max(x, z) and was off by ~1.9x.
      //
      // Both halves are now fixed — the CLI computes scene-space bounds and the
      // manifests were regenerated — so framing and rendering agree and no case is
      // allowed to clip. `auraProductionBoundsProbes()` still exposes the per-asset
      // metadata-versus-loaded comparison at runtime if they ever diverge again.
      expect(frameCase.pixels.clipped, `${frameCase.id} clipped`).toBe(false);
      expect(frameCase.pass, `${frameCase.id} failed`).toBe(true);
    }
    expect(evidence?.pass).toBe(true);
    expect(errors).toEqual([]);
  });
});
