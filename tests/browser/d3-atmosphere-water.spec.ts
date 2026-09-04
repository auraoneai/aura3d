import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("D3 atmosphere and water probes", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("day/night, wetness, precipitation, and wake pairs show real pixel deltas", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1080 });
    await page.goto(`${server.origin}/tests/browser/d3-atmosphere-water-harness.html`, { waitUntil: "domcontentloaded" });
    await page.click("#shoot");
    await page.waitForFunction(
      () => window.__AURA3D_D3_ATMOSPHERE_WATER__?.status === "ready" || window.__AURA3D_D3_ATMOSPHERE_WATER__?.status === "error",
      undefined,
      { timeout: 120_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_D3_ATMOSPHERE_WATER__);
    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(resolve("tests/reports/d3-atmosphere-water.json"), `${JSON.stringify(result, null, 2)}\n`);
    await page.screenshot({ path: resolve("tests/reports/d3-atmosphere-water-contact-sheet.png"), fullPage: true });

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.captures?.map((capture) => capture.id)).toEqual([
      "sky-day",
      "sky-night",
      "ground-dry",
      "ground-wet",
      "precip-clear",
      "precip-rain",
      "precip-snow",
      "water-calm",
      "water-wake",
      "storm-dark",
      "storm-flash"
    ]);
    for (const capture of result?.captures ?? []) {
      expect(capture.drawCalls, capture.id).toBeGreaterThan(0);
      expect(capture.nodeCount, capture.id).toBeGreaterThan(0);
      expect(capture.image.nonDarkPixels, capture.id).toBeGreaterThan(500);
    }

    // Box 1: day/night cycle with sun+stars+clouds.
    expect(Number(result?.checks?.dayNightDiff ?? 0)).toBeGreaterThan(50);
    // Box 2: rain/snow + wetness darkening.
    expect(Number(result?.checks?.wetDiff ?? 0)).toBeGreaterThan(50);
    expect(Number(result?.checks?.rainDiff ?? 0)).toBeGreaterThan(50);
    expect(Number(result?.checks?.snowDiff ?? 0)).toBeGreaterThan(50);
    expect(result?.checks?.wetAlbedo).not.toBe(result?.checks?.dryAlbedo);
    expect(Number(result?.checks?.wetPuddles ?? 0)).toBeGreaterThan(0);
    expect(Number(result?.checks?.rainDrops ?? 0)).toBeGreaterThan(0);
    expect(Number(result?.checks?.snowDrops ?? 0)).toBeGreaterThan(0);
    // Box 3: ocean foam + wake hooks.
    expect(Number(result?.checks?.wakeDiff ?? 0)).toBeGreaterThan(50);
    expect(Number(result?.checks?.foamCount ?? 0)).toBeGreaterThan(0);
    expect(Number(result?.checks?.wakeSegments ?? 0)).toBeGreaterThan(0);
    expect(result?.checks?.buoyancyObject).toBe("marker-buoy");
    // Lightning hook must have found a real flash frame.
    expect(Number(result?.checks?.flashElapsed ?? -1)).toBeGreaterThanOrEqual(0);
    expect(Number(result?.checks?.flashDiff ?? 0)).toBeGreaterThan(10);
  });
});

declare global {
  interface Window {
    __AURA3D_D3_ATMOSPHERE_WATER__?: {
      readonly status: "ready" | "error" | "waiting";
      readonly captures?: readonly {
        readonly id: string;
        readonly drawCalls: number;
        readonly nodeCount: number;
        readonly image: {
          readonly nonDarkPixels: number;
          readonly nonLightPixels: number;
          readonly colorBuckets: number;
          readonly spatialChecksum: number;
        };
        readonly meta: Record<string, string | number | boolean>;
      }[];
      readonly checks?: Record<string, boolean | number | string>;
      readonly error?: string;
    };
  }
}
