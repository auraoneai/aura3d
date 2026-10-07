// PRD-07 P5-T1 — §8.3 GPU particle sim parity: 50,000 particles under
// gravity only for 60 steps; the WebGL2 rgba32f ping-pong sim must track the
// fp32 CPU mirror (identical formula) within 1mm on positions. On a context
// without EXT_color_buffer_float the spec only checks the availability gate.
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";

declare global {
  interface Window {
    __QR_PRD07_GPUSIM__?: {
      readonly status: "ready" | "error";
      readonly floatAvailable?: boolean;
      readonly capacity?: number;
      readonly steps?: number;
      readonly maxPosDiff?: number;
      readonly maxVelDiff?: number;
      readonly error?: string;
    };
  }
}

test.describe("prd07 gpu sim parity", () => {
  test.setTimeout(300_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("50k particles, gravity only, 60 steps: GPU within 1mm of CPU mirror", async ({ page }) => {
    await page.goto(`${server.origin}/tests/qr/prd07/browser/gpu-sim-parity-harness.html`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(
      () => window.__QR_PRD07_GPUSIM__?.status === "ready" || window.__QR_PRD07_GPUSIM__?.status === "error",
      undefined,
      { timeout: 240_000 }
    );
    const result = await page.evaluate(() => window.__QR_PRD07_GPUSIM__);
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.floatAvailable, "EXT_color_buffer_float missing — CPU fallback path").toBe(true);
    expect(result?.capacity).toBe(50_000);
    expect(result?.steps).toBe(60);
    expect(result?.maxPosDiff ?? Infinity, "position drift").toBeLessThanOrEqual(0.001);
    expect(result?.maxVelDiff ?? Infinity, "velocity drift").toBeLessThanOrEqual(0.01);
  });
});
