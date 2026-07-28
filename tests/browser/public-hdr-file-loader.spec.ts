import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

declare global {
  interface Window {
    __AURA3D_PUBLIC_HDR_FILE_LOADER__?: {
      readonly status: "ready" | "error";
      readonly source?: string;
      readonly radianceSize?: readonly [number, number];
      readonly cubeFaceCount?: number;
      readonly drawCalls?: number;
      readonly centerPixel?: readonly number[];
      readonly claimBoundary: string;
      readonly error?: string;
    };
  }
}

test.describe("public HDR file loader", () => {
  test.setTimeout(60_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("fetches a real Radiance file into an HDR-lit reflective render", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/public-hdr-file-loader-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_PUBLIC_HDR_FILE_LOADER__?.status === "ready" ||
        window.__AURA3D_PUBLIC_HDR_FILE_LOADER__?.status === "error",
      undefined,
      { timeout: 30_000 }
    );
    const result = await page.evaluate(() => window.__AURA3D_PUBLIC_HDR_FILE_LOADER__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.source).toBe("/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr");
    expect(result?.radianceSize).toEqual([1024, 512]);
    expect(result?.cubeFaceCount).toBe(6);
    expect(result?.drawCalls).toBe(1);
    const [r = 0, g = 0, b = 0, a = 0] = result?.centerPixel ?? [];
    expect(r + g + b).toBeGreaterThan(100);
    expect(a).toBe(255);
    expect(result?.claimBoundary).toMatch(/does not claim EXR.*createAuraApp exposure/i);
  });
});
