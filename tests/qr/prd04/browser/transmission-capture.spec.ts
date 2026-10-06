/**
 * transmission-capture.spec.ts — PRD-04 P4-4. With
 * `A3D_QR_MATERIALS` + `A3D_QR_MATERIALS_TRANSMISSION` on and
 * `transmission=env` (the E22 real path while C-02 `programCacheSlot` is still
 * a stub), `prd04-transmission` activates the lane capture target:
 * `materials.transmissionTargetActive === true`, full mip chain,
 * C-28 `readbacks === 0`. `prd04-ktx2` (damagedHelmet — no transmission
 * material) leaves it inactive. macos-14 CI only.
 */
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";
import { RESOLUTION } from "../../../../benchmarks/quality-rebuild/shared/types";

const FLAGS = "materials,materials.transmission";

interface TransmissionExtra {
  readonly materials?: { readonly transmissionTargetActive?: boolean };
  readonly transmission?: {
    readonly targetActive: boolean;
    readonly mipCount: number;
    readonly readbacks: number;
    readonly format: string | null;
    readonly sourceCopied: boolean;
  };
}

async function loadScene(page: import("@playwright/test").Page, origin: string, sceneId: string) {
  await page.goto(
    `${origin}/tests/qr/prd04/harness/prd04-capture.html?engine=aura3d&scene=${sceneId}&flags=${FLAGS}&transmission=env`,
    { waitUntil: "domcontentloaded" }
  );
  await page.waitForFunction(
    () => (window as any).__QR_READY__ !== undefined || (window as any).__QR_ERROR__ !== undefined,
    undefined,
    { timeout: 120_000 }
  );
  const error = await page.evaluate(() => (window as any).__QR_ERROR__ ?? null);
  expect(error, `${sceneId} harness error`).toBeNull();
  return page.evaluate(() => (window as any).__QR_READY__ as { extra?: TransmissionExtra });
}

test.describe("PRD-04 transmission capture (P4-4)", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("prd04-transmission activates the capture target with a full mip chain", async ({ page }) => {
    const payload = await loadScene(page, server.origin, "prd04-transmission");
    const expectedMips = Math.floor(Math.log2(Math.max(RESOLUTION.width, RESOLUTION.height))) + 1;

    expect(payload.extra?.materials?.transmissionTargetActive).toBe(true);
    expect(payload.extra?.transmission?.targetActive).toBe(true);
    expect(payload.extra?.transmission?.mipCount).toBe(expectedMips);
    expect(payload.extra?.transmission?.readbacks).toBe(0);
    expect(["rgba16f", "rgba8"]).toContain(payload.extra?.transmission?.format);
  });

  test("prd04-ktx2 (damagedHelmet, no transmission) leaves the target inactive", async ({ page }) => {
    const payload = await loadScene(page, server.origin, "prd04-ktx2");
    expect(payload.extra?.materials?.transmissionTargetActive).toBe(false);
    expect(payload.extra?.transmission?.targetActive).toBe(false);
    expect(payload.extra?.transmission?.readbacks).toBe(0);
  });
});
