// PRD-07 P2-T8 — juice auto-mount on the real renderer (macos-14 CI).
// A Neon-style scene calls game.effects() with no nodes() call:
//   flags `vfx`:  hitSpark changes ≥0.15% of a 64×64 centre region in
//                 frames N+1..N+3 (the §6.3.4 adoption realm bound the
//                 controller to the app).
//   flags none: 0 pixels change — the unbound path draws nothing.
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";

declare global {
  interface Window {
    __QR_PRD07_JUICE__?: {
      readonly status: "ready" | "error";
      readonly flags?: readonly string[];
      readonly changedFractions?: readonly number[];
      readonly maxChangedFraction?: number;
      readonly liveParticles?: number;
      readonly unboundReason?: string | null;
      readonly regionPixels?: number;
      readonly errors?: readonly string[];
      readonly error?: string;
    };
  }
}

test.describe("prd07 juice automount", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("flags vfx: hitSpark changes ≥0.15% of the 64×64 region", async ({ page }) => {
    await page.goto(`${server.origin}/tests/qr/prd07/browser/juice-automount-harness.html?a3d-qr=vfx`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__QR_PRD07_JUICE__?.status === "ready" || window.__QR_PRD07_JUICE__?.status === "error",
      undefined,
      { timeout: 90_000 }
    );
    const result = await page.evaluate(() => window.__QR_PRD07_JUICE__);
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.unboundReason ?? null).toBeNull();
    // ≥0.15% of 64×64 = ≥7 changed pixels, in at least one of frames N+1..N+3.
    expect(result?.maxChangedFraction ?? 0).toBeGreaterThanOrEqual(0.0015);
    expect(result?.liveParticles ?? 0).toBeGreaterThan(0);
  });

  test("flags none: hitSpark changes 0 pixels", async ({ page }) => {
    await page.goto(`${server.origin}/tests/qr/prd07/browser/juice-automount-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__QR_PRD07_JUICE__?.status === "ready" || window.__QR_PRD07_JUICE__?.status === "error",
      undefined,
      { timeout: 90_000 }
    );
    const result = await page.evaluate(() => window.__QR_PRD07_JUICE__);
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.maxChangedFraction ?? 1).toBe(0);
  });
});
