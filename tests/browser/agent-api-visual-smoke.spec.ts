import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("agent API visual smoke helpers", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders helper smoke frames and exercises mini-golf shot state", async ({ page }) => {
    await page.setViewportSize({ width: 1040, height: 720 });
    await page.goto(`${server.origin}/tests/browser/agent-api-visual-smoke-harness.html`, { waitUntil: "domcontentloaded" });
    await page.click("#shoot");
    const hoverProbe = page.locator("#hover-probe");
    await expect(hoverProbe).toBeVisible({ timeout: 10_000 });
    await hoverProbe.hover();
    await page.waitForFunction(
      () => window.__AURA3D_AGENT_VISUAL_SMOKE__?.status === "ready" || window.__AURA3D_AGENT_VISUAL_SMOKE__?.status === "error",
      undefined,
      { timeout: 90_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_AGENT_VISUAL_SMOKE__);
    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(resolve("tests/reports/agent-api-visual-smoke.json"), `${JSON.stringify(result, null, 2)}\n`);
    await page.screenshot({ path: resolve("tests/reports/agent-api-visual-smoke-contact-sheet.png"), fullPage: true });

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.captures?.map((capture) => capture.id)).toEqual([
      "physics",
      "particles",
      "solar",
      "neon-a",
      "neon-b",
      "chart-default",
      "chart-selected",
      "mini-golf",
      "materials",
      "city-day",
      "city-night",
      "humanoid-a",
      "humanoid-b",
      "product"
    ]);
    for (const capture of result?.captures ?? []) {
      expect(capture.drawCalls, capture.id).toBeGreaterThan(0);
      expect(capture.image.nonDarkPixels, capture.id).toBeGreaterThan(500);
      expect(capture.image.nonLightPixels, capture.id).toBeGreaterThan(500);
      expect(capture.image.colorBuckets, capture.id).toBeGreaterThan(4);
    }

    expect(result?.checks?.physicsContactsVisible).toBe(true);
    expect(result?.checks?.physicsFpsP50MeetsFloor).toBe(true);
    expect(result?.checks?.particleArcVisible).toBe(true);
    expect(result?.checks?.solarLabelsReadable).toBe(true);
    expect(result?.checks?.solarOrbitLabelsAttached).toBe(true);
    expect(Number(result?.checks?.neonFrameDiff ?? 0)).toBeGreaterThan(20);
    expect(result?.checks?.chartHoverDiff).toBeTruthy();
    expect(result?.checks?.browserHoverSimulated).toBe(true);
    expect(result?.checks?.golfBallMoved).toBe(true);
    expect(result?.checks?.golfScoreChanged).toBe(true);
    expect(result?.checks?.materialClassesDistinct).toBe(true);
    expect(Number(result?.checks?.cityDayNightDiff ?? 0)).toBeGreaterThan(20);
    expect(result?.checks?.humanoidConnected).toBe(true);
    expect(Number(result?.checks?.humanoidFrameDiff ?? 0)).toBeGreaterThan(0);
    expect(result?.checks?.productSeated).toBe(true);
  });

  test("renders local Aura helper versus raw Three.js comparison app", async ({ page }) => {
    await page.setViewportSize({ width: 1040, height: 392 });
    await page.goto(`${server.origin}/tests/browser/agent-api-side-by-side-comparison.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_SIDE_BY_SIDE_COMPARISON__?.status === "ready" || window.__AURA3D_SIDE_BY_SIDE_COMPARISON__?.status === "error",
      undefined,
      { timeout: 45_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_SIDE_BY_SIDE_COMPARISON__);
    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(resolve("tests/reports/agent-api-side-by-side-comparison.json"), `${JSON.stringify(result, null, 2)}\n`);
    await page.screenshot({ path: resolve("tests/reports/agent-api-side-by-side-comparison.png"), fullPage: true });

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.auraDrawCalls ?? 0).toBeGreaterThan(0);
    expect(result?.auraNonDarkPixels ?? 0).toBeGreaterThan(500);
    expect(result?.threeChildren ?? 0).toBeGreaterThan(10);
    expect(result?.threeNonDarkPixels ?? 0).toBeGreaterThan(500);
  });
});

declare global {
  interface Window {
    __AURA3D_AGENT_VISUAL_SMOKE__?: {
      readonly status: "ready" | "error" | "waiting";
      readonly captures?: readonly {
        readonly id: string;
        readonly drawCalls: number;
        readonly image: {
          readonly nonDarkPixels: number;
          readonly nonLightPixels: number;
          readonly colorBuckets: number;
        };
      }[];
      readonly checks?: Record<string, boolean | number>;
      readonly error?: string;
    };
  }

  interface Window {
    __AURA3D_SIDE_BY_SIDE_COMPARISON__?: {
      readonly status: "ready" | "error" | "waiting";
      readonly auraDrawCalls?: number;
      readonly auraNonDarkPixels?: number;
      readonly threeChildren?: number;
      readonly threeNonDarkPixels?: number;
      readonly error?: string;
    };
  }
}
