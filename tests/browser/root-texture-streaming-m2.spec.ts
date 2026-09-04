import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("M2 texture streaming + anisotropy probes", () => {
  test.setTimeout(300_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("residency funds from the texture table with over-budget telemetry", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 480 });
    await page.goto(`${server.origin}/tests/browser/root-texture-streaming-m2-harness.html`, { waitUntil: "domcontentloaded" });
    await page.click("#shoot");
    await page.waitForFunction(
      () => window.__AURA3D_M2_STREAMING__?.status === "ready" || window.__AURA3D_M2_STREAMING__?.status === "error",
      undefined,
      { timeout: 270_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_M2_STREAMING__);
    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(resolve("tests/reports/root-texture-streaming-m2.json"), `${JSON.stringify(result, null, 2)}\n`);
    await page.screenshot({ path: resolve("tests/reports/root-texture-streaming-m2.png"), fullPage: true });

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.captures?.map((capture) => capture.id)).toEqual(["funded", "starved"]);
    for (const capture of result?.captures ?? []) {
      expect(capture.drawCalls, capture.id).toBeGreaterThan(0);
      expect(capture.nonDarkPixels, capture.id).toBeGreaterThan(50);
    }

    const checks = result?.checks ?? {};
    // Funded: real bytes from the decoded table, nothing evicted.
    expect(checks.fundedOverBudget).toBe(false);
    expect(Number(checks.fundedUsed)).toBeGreaterThan(0);
    expect(Number(checks.fundedRequested)).toBeGreaterThan(0);
    expect(Number(checks.fundedResidents)).toBeGreaterThan(0);
    // The C1 upgrade landed, so the residency funds real uploads.
    expect(checks.fundedTextured).toBe(true);
    // Anisotropy requested from root with capability gating (M2b).
    expect(Number(checks.fundedAnisoMax)).toBeGreaterThanOrEqual(1);
    if (Number(checks.fundedAnisoMax) > 1) {
      expect(Number(checks.fundedAnisoUploads)).toBeGreaterThanOrEqual(1);
    }
    // Starved: 2 KiB budget trips the telemetry instead of thrashing.
    expect(checks.starvedOverBudget).toBe(true);
    expect(Number(checks.starvedOverBytes)).toBeGreaterThan(0);
    expect(Number(checks.starvedBudget)).toBe(2048);
    expect(checks.starvedWarned).toBe(true);
  });
});

declare global {
  interface Window {
    __AURA3D_M2_STREAMING__?: {
      readonly status: "ready" | "error" | "waiting";
      readonly captures?: readonly {
        readonly id: string;
        readonly drawCalls: number;
        readonly textures: {
          readonly budgetBytes: number;
          readonly usedBytes: number;
          readonly requestedBytes: number;
          readonly overBudget: boolean;
          readonly overBudgetBytes: number;
          readonly residentEntries: number;
          readonly evictedEntries: readonly string[];
        };
        readonly texturedMaterials: readonly {
          readonly nodeName: string;
          readonly status: string;
          readonly pixelBacked: boolean;
        }[];
        readonly samplerAnisotropyUploads: number;
        readonly maxTextureAnisotropy: number;
        readonly warnings: readonly string[];
        readonly checksum: number;
        readonly nonDarkPixels: number;
      }[];
      readonly checks?: Record<string, boolean | number | string>;
      readonly error?: string;
    };
  }
}
