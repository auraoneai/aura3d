// PRD-07 P1-T9 — every particle program define combination compiles + links
// on real WebGL2 (remote macos-14 runner).
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";

declare global {
  interface Window {
    __QR_PRD07_SHADER__?: {
      readonly status: "ready" | "error";
      readonly combinations?: number;
      readonly failures?: readonly { key: string; stage: string; log: string }[];
      readonly error?: string;
    };
  }
}

test.describe("prd07 particle shader compile", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("all define combinations compile and link on WebGL2", async ({ page }) => {
    await page.goto(`${server.origin}/tests/qr/prd07/browser/particle-shader-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__QR_PRD07_SHADER__ !== undefined, undefined, { timeout: 60_000 });
    const result = await page.evaluate(() => window.__QR_PRD07_SHADER__);
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.combinations ?? 0).toBe(256);
    expect(result?.failures ?? []).toEqual([]);
  });
});
