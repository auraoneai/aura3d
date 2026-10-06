// PRD-07 P4-T7 — background fog: the sky pass evaluates a3dApplyFog at
// backgroundDistance, so a fogged far-plane geometry pixel and the fogged
// horizon sky pixel converge to the same colour (≤3/255). Flag-off sentinel:
// no fog anywhere — the far wall shows its lit material colour instead.
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";

declare global {
  interface Window {
    __QR_PRD07_FOGBG__?: {
      readonly status: "ready" | "error";
      readonly flags?: readonly string[];
      readonly skyBand?: readonly [number, number, number];
      readonly boxBand?: readonly [number, number, number];
      readonly delta?: number;
      readonly errors?: readonly string[];
      readonly error?: string;
    };
  }
}

test.describe("prd07 fog background match", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  async function run(page: import("@playwright/test").Page, flags: string) {
    const url = flags
      ? `${server.origin}/tests/qr/prd07/browser/fog-background-harness.html?a3d-qr=${flags}`
      : `${server.origin}/tests/qr/prd07/browser/fog-background-harness.html`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__QR_PRD07_FOGBG__?.status === "ready" || window.__QR_PRD07_FOGBG__?.status === "error",
      undefined,
      { timeout: 120_000 }
    );
    return page.evaluate(() => window.__QR_PRD07_FOGBG__);
  }

  test("flags vfx,vfx.sky,vfx.fog: far-plane geometry pixel matches fogged horizon ≤3/255", async ({ page }) => {
    const result = await run(page, "vfx,vfx.sky,vfx.fog");
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.delta ?? Infinity).toBeLessThanOrEqual(3);
  });

  test("flags vfx,vfx.sky (fog off): far wall and horizon differ", async ({ page }) => {
    const result = await run(page, "vfx,vfx.sky");
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.delta ?? 0).toBeGreaterThan(8);
  });
});
