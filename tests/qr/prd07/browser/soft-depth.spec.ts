// PRD-07 P1-T10 — soft particles against a real scene-depth RenderTarget:
// a plane at 2m viewZ, particle at 1.9m keeps alpha ×0.2857 (±1/255),
// a particle beyond 2m contributes zero alpha (remote macos-14 runner).
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";

declare global {
  interface Window {
    __QR_PRD07_SOFT_DEPTH__?: {
      readonly status: "ready" | "error";
      readonly alphaAt1_9?: number;
      readonly alphaAt2_1?: number;
      readonly depthValue?: number;
      readonly error?: string;
    };
  }
}

test.describe("prd07 soft depth", () => {
  test.setTimeout(60_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("particle alpha is faded by scene depth gap", async ({ page }) => {
    await page.goto(`${server.origin}/tests/qr/prd07/browser/soft-depth-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__QR_PRD07_SOFT_DEPTH__ !== undefined, undefined, { timeout: 30_000 });
    const result = await page.evaluate(() => window.__QR_PRD07_SOFT_DEPTH__);
    expect(result?.status, result?.error).toBe("ready");
    // Centre texel alpha = depth-gap term: 0.1 gap / 0.35 softDistance = 0.2857 (±1/255
    // LSB on the rgba8 readback: 0.2857 ± 0.0039 → (0.2818, 0.2896)).
    expect(result?.alphaAt1_9 ?? -1).toBeGreaterThan(0.2818);
    expect(result?.alphaAt1_9 ?? -1).toBeLessThan(0.2896);
    expect(result?.alphaAt2_1 ?? 1).toBe(0);
  });
});
