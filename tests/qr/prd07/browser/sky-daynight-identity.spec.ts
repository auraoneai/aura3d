// PRD-07 P3-T3/T4 — sky.dayNight on the real renderer (macos-14 CI).
//   flags none vs flags vfx        : frame checksums identical — with the
//                                    A3D_QR_VFX_SKY flag off the sky node
//                                    draws nothing and the tagged legacy
//                                    primitives render unchanged (§6.5
//                                    identity vs the 85aafcd0 build).
//   flags vfx,vfx.sky              : sky node draws (checksum differs),
//                                    diagnostics().atmosphere.background ===
//                                    "sky-preetham", zero visible
//                                    prd07.legacySky.* nodes, sky-region
//                                    luma std > 6, and at hour 10 the horizon
//                                    band out-luminates the zenith band.
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";

declare global {
  interface Window {
    __QR_PRD07_SKY__?: {
      readonly status: "ready" | "error";
      readonly flags?: readonly string[];
      readonly checksum?: number;
      readonly skyLumaStd?: number;
      readonly horizonMeanLuma?: number;
      readonly zenithMeanLuma?: number;
      readonly background?: string | null;
      readonly visibleLegacyNodes?: number;
      readonly errors?: readonly string[];
      readonly error?: string;
    };
  }
}

test.describe("prd07 sky.dayNight identity + draw", () => {
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
      ? `${server.origin}/tests/qr/prd07/browser/sky-daynight-harness.html?a3d-qr=${flags}`
      : `${server.origin}/tests/qr/prd07/browser/sky-daynight-harness.html`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__QR_PRD07_SKY__?.status === "ready" || window.__QR_PRD07_SKY__?.status === "error",
      undefined,
      { timeout: 120_000 }
    );
    return page.evaluate(() => window.__QR_PRD07_SKY__);
  }

  test("flags vfx (sky flag off): identical to flags none", async ({ page }) => {
    const off = await run(page, "");
    expect(off?.status, off?.error).toBe("ready");
    const vfx = await run(page, "vfx");
    expect(vfx?.status, vfx?.error).toBe("ready");
    expect(vfx?.checksum).toBe(off?.checksum);
    expect(vfx?.visibleLegacyNodes).toBeGreaterThan(0);
    expect(vfx?.background).not.toBe("sky-preetham");
  });

  test("flags vfx,vfx.sky: real sky draws, legacy prims hidden", async ({ page }) => {
    const off = await run(page, "");
    const on = await run(page, "vfx,vfx.sky");
    expect(on?.status, on?.error).toBe("ready");
    expect(on?.background).toBe("sky-preetham");
    expect(on?.visibleLegacyNodes).toBe(0);
    expect(on?.checksum).not.toBe(off?.checksum);
    // P3-T3: the real sky has structure (std > 6) and a noon-sun gradient.
    expect(on?.skyLumaStd ?? 0).toBeGreaterThan(6);
    expect(on?.horizonMeanLuma ?? 0).toBeGreaterThan(on?.zenithMeanLuma ?? Infinity);
  });
});
