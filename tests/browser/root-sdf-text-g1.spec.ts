import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("G1 SDF world-text probes", () => {
  test.setTimeout(300_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("SDF quads render pixel-backed with live occlusion and LOD fade", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 480 });
    await page.goto(`${server.origin}/tests/browser/root-sdf-text-g1-harness.html`, { waitUntil: "domcontentloaded" });
    await page.click("#shoot");
    await page.waitForFunction(
      () => window.__AURA3D_G1_SDF_TEXT__?.status === "ready" || window.__AURA3D_G1_SDF_TEXT__?.status === "error",
      undefined,
      { timeout: 270_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_G1_SDF_TEXT__);
    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(resolve("tests/reports/root-sdf-text-g1.json"), `${JSON.stringify(result, null, 2)}\n`);
    await page.screenshot({ path: resolve("tests/reports/root-sdf-text-g1.png"), fullPage: true });

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.captures?.map((capture) => capture.id)).toEqual([
      "sdf-near",
      "mesh",
      "sdf-occluded",
      "sdf-hidden",
      "sdf-far"
    ]);
    for (const capture of result?.captures ?? []) {
      expect(capture.drawCalls, capture.id).toBeGreaterThan(0);
    }

    const checks = result?.checks ?? {};
    // The SDF path renders (differs from the extruded mesh) with real pixels.
    expect(Number(checks.sdfMeshDiff ?? 0)).toBeGreaterThan(50);
    expect(Number(result?.captures?.find((capture) => capture.id === "sdf-near")?.nonDarkPixels ?? 0)).toBeGreaterThan(50);
    // Pixel backing: atlas uploaded + quads submitted, 4 quads for AURA.
    expect(checks.nearBacked).toBe(true);
    expect(Number(checks.nearQuads)).toBe(4);
    expect(Number(checks.nearOpacity)).toBeCloseTo(1, 5);
    // Occlusion dims through the shared scene test (DOM layer mirrors 0.35).
    expect(Number(checks.occludedOpacity)).toBeCloseTo(0.35, 5);
    expect(Number(checks.occludedDimmer ?? 0)).toBeGreaterThan(0);
    // Hide policy submits nothing: no backing claim, pixels change.
    expect(checks.hiddenBacked).toBe(false);
    expect(Number(checks.hiddenDelta ?? 0)).toBeGreaterThan(0);
    // LOD fade: fully faded far away.
    expect(Number(checks.farOpacity)).toBe(0);
    expect(Number(checks.farDelta ?? 0)).toBeGreaterThan(0);
  });
});

declare global {
  interface Window {
    __AURA3D_G1_SDF_TEXT__?: {
      readonly status: "ready" | "error" | "waiting";
      readonly captures?: readonly {
        readonly id: string;
        readonly drawCalls: number;
        readonly text: {
          readonly sdfTexts: number;
          readonly textPixelBacked: boolean;
          readonly quadCount: number;
          readonly lastOpacity: number;
          readonly reason: string;
        };
        readonly checksum: number;
        readonly nonDarkPixels: number;
      }[];
      readonly checks?: Record<string, boolean | number | string>;
      readonly error?: string;
    };
  }
}
