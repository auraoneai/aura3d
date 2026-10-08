// PRD-06 §16 I-row — `taa-skinned-ghosting` (T2.5).
// Runs in the lane workflow and reports its value; the ≤ 2 px ghost-trail
// gate is §17.1 integrated acceptance only because `TemporalHistory.prepare`
// rejects skinned items until C-14 (the post lane's velocity consumer
// contract, Q-03-1) is real. This spec asserts the harness produced an
// honest report — either `supported: false` carrying the thrown
// TEMPORAL_UNSUPPORTED_GEOMETRY, or a real trailPx measurement once the
// consumer lands — and must not gate the lane.
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";

interface TaaGhostingReport {
  readonly done?: boolean;
  readonly error?: string;
  readonly stack?: string;
  readonly flags?: unknown;
  readonly frames?: number;
  readonly supported?: boolean;
  readonly unsupportedError?: string;
  readonly trailPx?: number | null;
  readonly trailGatePx?: number;
  readonly dependency?: string;
  readonly gating?: string;
}

declare global {
  interface Window { __AURA3D_QR_TAA_SKINNED_GHOSTING__?: TaaGhostingReport }
}

test.describe("PRD-06 TAA skinned ghosting (reported, C-14 pending)", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("reports the TAA-over-skinning dependency or the trail measurement", async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${server.origin}/tests/qr/prd06/browser/taa-skinned-ghosting-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const result = window.__AURA3D_QR_TAA_SKINNED_GHOSTING__;
        return result?.done === true || result?.error !== undefined;
      },
      undefined,
      { timeout: 60_000 }
    );
    const result = await page.evaluate(() => window.__AURA3D_QR_TAA_SKINNED_GHOSTING__);
    await testInfo.attach("taa-skinned-ghosting-report", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
    expect(result?.error, result?.error).toBeUndefined();
    expect(result?.done).toBe(true);
    expect(pageErrors).toEqual([]);

    if (result?.supported === true) {
      // C-14 real: the harness measured a trail — reported only (the ≤ 2 px
      // gate applies at §17.1 checkpoints, not in lane CI).
      expect(typeof result.trailPx).toBe("number");
      expect(result.trailPx!).toBeGreaterThanOrEqual(0);
    } else {
      // C-14 pending: the report names the thrown admission error so the
      // checkpoint sees the real dependency, not a vacuous pass.
      expect(result?.supported).toBe(false);
      expect(result?.unsupportedError, "expected the TemporalHistory skinned-item rejection").toContain("TEMPORAL_UNSUPPORTED_GEOMETRY");
      expect(result?.trailPx).toBeNull();
      expect(result?.dependency).toContain("C-14");
    }
  });
});
