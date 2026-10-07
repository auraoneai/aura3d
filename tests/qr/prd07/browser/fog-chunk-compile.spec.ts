// PRD-07 P4-T2 — `a3d_prd07_fog` chunk + sky fog program variants compile and
// link on real WebGL2 (macos-14 CI). Covers the standalone chunk, the
// FOG_VOLUMETRIC froxel path, and every sky model × {fog off, fog on}.
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";

declare global {
  interface Window {
    __QR_PRD07_FOG_SHADER__?: {
      readonly status: "ready" | "error";
      readonly combinations?: number;
      readonly failures?: readonly { key: string; stage: string; log: string }[];
      readonly error?: string;
    };
  }
}

test.describe("prd07 fog chunk compile", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("fog chunk + sky fog variants compile and link on WebGL2", async ({ page }) => {
    await page.goto(`${server.origin}/tests/qr/prd07/browser/fog-chunk-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__QR_PRD07_FOG_SHADER__ !== undefined, undefined, { timeout: 60_000 });
    const result = await page.evaluate(() => window.__QR_PRD07_FOG_SHADER__);
    expect(result?.status, result?.error).toBe("ready");
    // 2 chunk variants + 4 sky models × {fog off, on} = 10.
    expect(result?.combinations ?? 0).toBe(10);
    expect(result?.failures ?? [{ key: "x", stage: "x", log: "no result" }]).toEqual([]);
  });
});
