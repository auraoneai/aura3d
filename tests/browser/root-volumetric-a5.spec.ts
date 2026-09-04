import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("A5 volumetric fog probes", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("volumetric-fog node adds forward inscatter plus the inscatter pass", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 480 });
    await page.goto(`${server.origin}/tests/browser/root-volumetric-a5-harness.html`, { waitUntil: "domcontentloaded" });
    await page.click("#shoot");
    await page.waitForFunction(
      () => window.__AURA3D_A5_VOLUMETRIC__?.status === "ready" || window.__AURA3D_A5_VOLUMETRIC__?.status === "error",
      undefined,
      { timeout: 120_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_A5_VOLUMETRIC__);
    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(resolve("tests/reports/root-volumetric-a5.json"), `${JSON.stringify(result, null, 2)}\n`);
    await page.screenshot({ path: resolve("tests/reports/root-volumetric-a5-contact-sheet.png"), fullPage: true });

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.captures?.map((capture) => capture.id)).toEqual([
      "fog-depth",
      "fog-volumetric",
      "fog-volumetric-off"
    ]);
    for (const capture of result?.captures ?? []) {
      expect(capture.drawCalls, capture.id).toBeGreaterThan(0);
      expect(capture.nodeCount, capture.id).toBeGreaterThan(0);
      expect(capture.image.nonDarkPixels, capture.id).toBeGreaterThan(500);
    }

    // Forward inscatter: the volumetric node must change real pixels vs plain fog.
    expect(Number(result?.checks?.volumetricDiff ?? 0)).toBeGreaterThan(50);
    // Quality "off" keeps exp2-only output: near-identical to plain fog.
    expect(Number(result?.checks?.qualityOffDiff ?? 0)).toBeLessThan(Number(result?.checks?.volumetricDiff ?? 0));
    // Diagnostics labels.
    expect(result?.checks?.depthPreset).toBe("depth");
    expect(result?.checks?.volumetricPreset).toBe("volumetric");
    expect(result?.checks?.offPreset).toBe("volumetric");
    // The DISTINCT node submits the inscatter pass; quality "off" submits nothing.
    expect(result?.checks?.volumetricPassSubmitted).toBe(true);
    expect(result?.checks?.offPassSubmitted).toBe(false);
  });
});

declare global {
  interface Window {
    __AURA3D_A5_VOLUMETRIC__?: {
      readonly status: "ready" | "error" | "waiting";
      readonly captures?: readonly {
        readonly id: string;
        readonly drawCalls: number;
        readonly nodeCount: number;
        readonly fogPreset: string;
        readonly fogEnabled: boolean;
        readonly actualPasses: readonly string[];
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
