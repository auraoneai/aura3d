// PRD-07 P3-T3 — sky background through the frame graph (macos-14 CI).
//   flags vfx,vfx.sky: `sky.preetham` node draws — diagnostics().atmosphere
//                      .background === "sky-preetham"; sky-region luma std > 6;
//                      noon horizon out-luminates the zenith band.
//   flags vfx        : sky contributor flag off — the node's spec is ignored,
//                      background stays whatever the scene declares (NOT
//                      "sky-preetham" in diagnostics) and the sky luma std
//                      is dominated by the ground plane only (no structure).
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";

declare global {
  interface Window {
    __QR_PRD07_SKYBG__?: {
      readonly status: "ready" | "error";
      readonly flags?: readonly string[];
      readonly skyLumaStd?: number;
      readonly horizonMeanLuma?: number;
      readonly zenithMeanLuma?: number;
      readonly background?: string | null;
      readonly sunDiscLuminance?: number;
      readonly errors?: readonly string[];
      readonly error?: string;
    };
  }
}

test.describe("prd07 sky background", () => {
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
      ? `${server.origin}/tests/qr/prd07/browser/sky-background-harness.html?a3d-qr=${flags}`
      : `${server.origin}/tests/qr/prd07/browser/sky-background-harness.html`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__QR_PRD07_SKYBG__?.status === "ready" || window.__QR_PRD07_SKYBG__?.status === "error",
      undefined,
      { timeout: 120_000 }
    );
    return page.evaluate(() => window.__QR_PRD07_SKYBG__);
  }

  test("flags vfx,vfx.sky: sky draws with structure + noon gradient", async ({ page }) => {
    const result = await run(page, "vfx,vfx.sky");
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.background).toBe("sky-preetham");
    expect(result?.skyLumaStd ?? 0).toBeGreaterThan(6);
    expect(result?.horizonMeanLuma ?? 0).toBeGreaterThan(result?.zenithMeanLuma ?? Infinity);
    // P-34 — sun disc is HDR: luminance > 10 in the rgba16f readback.
    expect(result?.sunDiscLuminance ?? 0).toBeGreaterThan(10);
  });

  test("flags vfx: sky node ignored (background not sky-preetham)", async ({ page }) => {
    const result = await run(page, "vfx");
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.background).not.toBe("sky-preetham");
  });
});
