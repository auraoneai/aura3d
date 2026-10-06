// PRD-07 P1-T19 — production particles on the real renderer (macos-14 CI).
// flags `vfx`: the fountain draws — ≥1.5% warm pixels in the fountain region
// and diagnostics().effects.nodes[0].drawCalls ≥ 1.
// flags none: the sentinel run — zero particle draw and the
// EFFECT_ZERO_PIXELS report keeps the old bug visible.
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";

declare global {
  interface Window {
    __QR_PRD07_FOUNTAIN__?: {
      readonly status: "ready" | "error";
      readonly flags?: readonly string[];
      readonly drawCalls?: number;
      readonly liveParticles?: number;
      readonly batches?: number;
      readonly nodeDrawCalls?: number;
      readonly zeroPixelFrames?: number;
      readonly pixelBacked?: readonly string[];
      readonly warmFraction?: number;
      readonly warmPixels?: number;
      readonly regionPixels?: number;
      readonly deviceReadbacks?: number;
      readonly errors?: readonly string[];
      readonly error?: string;
    };
  }
}

test.describe("prd07 particles production", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("flags vfx: fountain draws ≥1.5% warm pixels and ≥1 draw call", async ({ page }) => {
    await page.goto(`${server.origin}/tests/qr/prd07/browser/particles-production-harness.html?a3d-qr=vfx`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__QR_PRD07_FOUNTAIN__?.status === "ready" || window.__QR_PRD07_FOUNTAIN__?.status === "error",
      undefined,
      { timeout: 60_000 }
    );
    const result = await page.evaluate(() => window.__QR_PRD07_FOUNTAIN__);
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.nodeDrawCalls ?? 0).toBeGreaterThanOrEqual(1);
    expect(result?.liveParticles ?? 0).toBeGreaterThan(0);
    expect(result?.pixelBacked ?? []).toContain("particles");
    expect(result?.warmFraction ?? 0).toBeGreaterThanOrEqual(0.015);
    expect((result?.errors ?? []).filter((e) => !e.startsWith("EXPOSURE") && !e.startsWith("WARN"))).toEqual([]);
    // C-28: zero GPU readbacks over the whole run.
    expect(result?.deviceReadbacks ?? 0).toBe(0);
  });

  test("flags none: no particle draws and no warm pixels (flag-off sentinel)", async ({ page }) => {
    await page.goto(`${server.origin}/tests/qr/prd07/browser/particles-production-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__QR_PRD07_FOUNTAIN__?.status === "ready" || window.__QR_PRD07_FOUNTAIN__?.status === "error",
      undefined,
      { timeout: 60_000 }
    );
    const result = await page.evaluate(() => window.__QR_PRD07_FOUNTAIN__);
    expect(result?.status, result?.error).toBe("ready");
    // Flag-off = the old bug itself: the scene requests a fountain and nothing
    // draws. The flag-off frame must stay bit-identical to 85aafcd0, so this
    // documents the deficit rather than asserting the sentinel (EFFECT_ZERO_PIXELS
    // is flag-on diagnostics, covered by the unit suite).
    expect(result?.nodeDrawCalls ?? 0).toBe(0);
    expect(result?.pixelBacked ?? []).not.toContain("particles");
    expect(result?.warmFraction ?? 1).toBeLessThan(0.001);
  });
});
