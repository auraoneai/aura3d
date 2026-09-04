import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * PART D2 50k-instance scatter scene (muse3jsparity-PRD): the scatter plan
 * admits 50,000 of 60,000 seeded candidates inside the cull distance with
 * wind applied, and the mounted scene holds the pre-declared frame budget
 * (maxDraws 32 / maxTriangles 2,000,000 / maxTextures 16) with a median
 * frame at or under 50ms. Triangles are computed from admitted instances at
 * 12 tris/box (box topology) and labeled as such; everything else is
 * measured in-page.
 */

const REPORT_PATH = "tests/reports/scatter-50k.json";
const ARTIFACTS = {
  gust: "tests/reports/scatter-50k/scatter-gust.png",
} as const;

interface Scatter50kResult {
  readonly status: "ready" | "error" | "waiting";
  readonly plan?: {
    readonly admittedInstances: number;
    readonly culledInstances: number;
    readonly meshInstances: number;
    readonly impostorInstances: number;
    readonly shadowCasters: number;
    readonly windStrength: number;
    readonly withinBudget: boolean;
  };
  readonly admission?: {
    readonly candidates: number;
    readonly submitted: number;
    readonly culled: number;
    readonly maxSubmittedDistance: number;
    readonly minShedDistance: number;
    readonly cullDistance: number;
    readonly grassInstances: number;
    readonly shrubInstances: number;
  };
  readonly wind?: {
    readonly calmTime: number;
    readonly gustTime: number;
    readonly changedPixels: number;
    readonly maxGrassOffset: number;
    readonly maxShrubOffset: number;
    readonly grassAmplitude: number;
    readonly shrubAmplitude: number;
  };
  readonly budget?: {
    readonly draws: number;
    readonly triangles: number;
    readonly trianglesComputed: boolean;
    readonly trisPerInstance: number;
    readonly textures: number;
    readonly overBudget: boolean;
    readonly lodBias: number;
    readonly shedDraws: number;
  };
  readonly runtime?: {
    readonly drawCalls: number;
    readonly fps: number;
    readonly backend: string;
    readonly frustumTestedObjects: number;
    readonly culledObjects: number;
    readonly visibleObjects: number;
    readonly nativeInstancedSubmissions: number;
  };
  readonly frames?: { readonly frames: number; readonly p50Ms: number; readonly p95Ms: number; readonly maxMs: number };
  readonly foregroundPixels?: number;
  readonly checksum?: number;
  readonly error?: string;
}

test.describe("50k-instance scatter holds budget with wind + culling (PART D2)", () => {
  test.setTimeout(240_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("admits 50k inside the cull distance, sways with wind, holds budget", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    await page.setViewportSize({ width: 1024, height: 680 });
    await page.goto(`${server.origin}/tests/browser/scatter-50k-harness.html`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(
      () =>
        window.__AURA3D_SCATTER_50K__?.status === "ready" ||
        window.__AURA3D_SCATTER_50K__?.status === "error",
      undefined,
      { timeout: 180_000 }
    );

    const result = (await page.evaluate(() => window.__AURA3D_SCATTER_50K__)) as Scatter50kResult;
    mkdirSync(resolve("tests/reports/scatter-50k"), { recursive: true });
    writeFileSync(resolve(REPORT_PATH), `${JSON.stringify({ ...result, pageErrors }, null, 2)}\n`);
    await page.locator("#scatter").screenshot({ path: resolve(ARTIFACTS.gust) });

    expect(result.status, result.error).toBe("ready");
    if (result.status !== "ready" || !result.plan || !result.admission || !result.wind || !result.budget || !result.runtime || !result.frames) return;
    expect(pageErrors).toEqual([]);

    // Scale: 50k admitted of 60k candidates, plan within budget.
    expect(result.plan.admittedInstances).toBe(50000);
    expect(result.plan.culledInstances).toBe(10000);
    expect(result.plan.withinBudget).toBe(true);
    expect(result.plan.windStrength).toBeGreaterThan(0);
    expect(result.admission.submitted).toBe(50000);
    expect(result.admission.culled).toBe(10000);
    expect(result.admission.grassInstances + result.admission.shrubInstances).toBe(50000);

    // Culling: every submitted instance sits inside the cull distance, and
    // every shed instance sits farther than every submitted one (sorted
    // admission). Engine frustum telemetry counts whole nodes (3), not
    // instances, so per-instance culling is proven by the admission sort,
    // not by the engine counter (retained as-is).
    expect(result.admission.maxSubmittedDistance).toBeLessThanOrEqual(result.admission.cullDistance);
    expect(result.admission.minShedDistance).toBeGreaterThanOrEqual(result.admission.maxSubmittedDistance);
    expect(result.runtime.frustumTestedObjects).toBeGreaterThan(0);
    expect(result.runtime.nativeInstancedSubmissions).toBeGreaterThan(0);

    // Wind: per-layer gust offsets are non-trivial and move pixels.
    expect(result.wind.maxGrassOffset).toBeGreaterThan(0.01);
    expect(result.wind.maxShrubOffset).toBeGreaterThan(0.01);
    expect(result.wind.changedPixels).toBeGreaterThan(1000);

    // Budget: measured draws + computed triangles + zero texture maps hold
    // the pre-declared caps. The frame gate is a collapse guard, not a
    // render-cost probe: headless rAF is display-paced (p50 ~= 16.7ms means
    // the 50k-instance scene fits inside the frame, not that it costs 16ms).
    expect(result.budget.trianglesComputed).toBe(true);
    expect(result.budget.triangles).toBe(50000 * 12);
    expect(result.budget.overBudget).toBe(false);
    expect(result.budget.lodBias).toBe(0);
    expect(result.budget.draws).toBeLessThanOrEqual(32);
    expect(result.frames.frames).toBe(90);
    expect(result.frames.p50Ms).toBeLessThanOrEqual(50);

    // The field actually renders.
    expect(result.foregroundPixels).toBeGreaterThan(50000);
  });
});
