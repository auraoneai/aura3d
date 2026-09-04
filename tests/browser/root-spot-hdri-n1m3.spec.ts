import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("N1 spot + M3 HDRI rotation probes", () => {
  test.setTimeout(300_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("authored spot changes pixels; HDRI rotation changes pixels with diagnostics", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 480 });
    await page.goto(`${server.origin}/tests/browser/root-spot-hdri-n1m3-harness.html`, { waitUntil: "domcontentloaded" });
    await page.click("#shoot");
    await page.waitForFunction(
      () => window.__AURA3D_N1M3_SPOT_HDRI__?.status === "ready" || window.__AURA3D_N1M3_SPOT_HDRI__?.status === "error",
      undefined,
      { timeout: 270_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_N1M3_SPOT_HDRI__);
    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(resolve("tests/reports/root-spot-hdri-n1m3.json"), `${JSON.stringify(result, null, 2)}\n`);
    await page.screenshot({ path: resolve("tests/reports/root-spot-hdri-n1m3.png"), fullPage: true });

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.captures?.map((capture) => capture.id)).toEqual([
      "spot-off",
      "spot-on",
      "hdri-rot0",
      "hdri-rot035"
    ]);
    for (const capture of result?.captures ?? []) {
      expect(capture.drawCalls, capture.id).toBeGreaterThan(0);
      // The unlit room is near-black by design (fill lights only); the spot
      // and HDRI variants carry the brightness. 50 proves real pixels drew.
      expect(capture.nonDarkPixels, capture.id).toBeGreaterThan(50);
    }

    // N1: the authored spot must change real pixels.
    expect(result?.checks?.spotNodesOff).toBe(0);
    expect(result?.checks?.spotNodesOn).toBe(1);
    expect(Number(result?.checks?.spotDiff ?? 0)).toBeGreaterThan(50);
    // M3: HDRI rotation must change real pixels with diagnostics to match.
    expect(result?.checks?.hdriBacked0).toBe(true);
    expect(result?.checks?.hdriBacked35).toBe(true);
    expect(result?.checks?.hdriRotation0).toBe(0);
    expect(result?.checks?.hdriRotation35).toBeCloseTo(0.35, 5);
    expect(Number(result?.checks?.rotationDiff ?? 0)).toBeGreaterThan(0);
  });
});

declare global {
  interface Window {
    __AURA3D_N1M3_SPOT_HDRI__?: {
      readonly status: "ready" | "error" | "waiting";
      readonly captures?: readonly {
        readonly id: string;
        readonly drawCalls: number;
        readonly nodeCount: number;
        readonly spotNodes: number;
        readonly environment: {
          readonly preset?: string;
          readonly iblPixelBacked: boolean;
          readonly hdriStatus: string;
          readonly hdriRotation?: number;
        };
        readonly checksum: number;
        readonly nonDarkPixels: number;
        readonly meta: Record<string, string | number | boolean>;
      }[];
      readonly checks?: Record<string, boolean | number | string>;
      readonly error?: string;
    };
  }
}
