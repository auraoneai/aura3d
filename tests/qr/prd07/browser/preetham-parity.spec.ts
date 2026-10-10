// PRD-07 P3-T1/P3-T3 (#245) — GPU Preetham 16-direction spec: the §6.1
// preetham sky program drawn into an rgba16f target must match the CPU
// `evaluateSky` mirror within 2 % luminance at 16 spread directions.
// rgba16f readback goes through `readFloatPixels` (RenderDevice.ts:483).
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";

declare global {
  interface Window {
    __QR_PRD07_SKYPAR__?: {
      readonly status: "ready" | "error";
      readonly samples?: readonly {
        readonly dir: readonly [number, number, number];
        readonly gpu: readonly [number, number, number];
        readonly cpu: readonly [number, number, number];
        readonly relLuma: number;
        readonly relRgb: number;
      }[];
      readonly maxRelLuma?: number;
      readonly maxRelRgb?: number;
      readonly error?: string;
    };
  }
}

test.describe("prd07 preetham gpu parity", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("16 directions: GPU sky ≈ CPU mirror within 2% luminance", async ({ page }) => {
    await page.goto(`${server.origin}/tests/qr/prd07/browser/preetham-parity-harness.html`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(
      () => window.__QR_PRD07_SKYPAR__?.status === "ready" || window.__QR_PRD07_SKYPAR__?.status === "error",
      undefined,
      { timeout: 90_000 }
    );
    const result = await page.evaluate(() => window.__QR_PRD07_SKYPAR__);
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.samples).toHaveLength(16);
    const worst = result?.samples?.reduce((a, b) => (b.relLuma > a.relLuma ? b : a));
    expect(
      result?.maxRelLuma ?? 1,
      `worst dir ${JSON.stringify(worst?.dir)} gpu=${worst?.gpu} cpu=${worst?.cpu}`
    ).toBeLessThanOrEqual(0.02);
  });
});
