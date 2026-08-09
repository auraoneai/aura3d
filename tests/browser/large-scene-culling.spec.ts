import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readProductionPngStats } from "../../tools/production-runtime-report-bridge/pngStats";
import { startExampleDevServer } from "./example-dev-server";

const REPORT = "tests/reports/geometry-instancing-lod-text/large-scene-culling.json";

test("measures frustum and static-BVH strategy on a real 1,600-object browser scene", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  const server = await startExampleDevServer();
  try {
    await page.goto(`${server.origin}/tests/browser/large-scene-culling-harness.html`);
    await page.waitForFunction(() => window.__AURA3D_LARGE_SCENE_CULLING__?.status !== undefined, undefined, { timeout: 90_000 });
    const result = await page.evaluate(() => window.__AURA3D_LARGE_SCENE_CULLING__);
    expect(result, result?.error).toMatchObject({ status: "ready", renderer: "webgl2", objectCount: 1600 });
    if (!result || result.status !== "ready") return;
    expect(result.culled.scene).toMatchObject({ submittedObjects: 1600, frustumTestedObjects: 1600 });
    expect(result.culled.scene.culledObjects).toBeGreaterThan(1200);
    expect(result.culled.scene.visibleObjects).toBeGreaterThan(25);
    expect(result.culled.scene.visibleObjects).toBeLessThan(400);
    expect(result.culled.drawCalls).toBe(result.culled.scene.visibleObjects);
    expect(result.unculled.scene).toMatchObject({ submittedObjects: 1600, visibleObjects: 1600, culledObjects: 0, frustumTestedObjects: 0 });
    expect(result.unculled.drawCalls).toBe(1600);
    expect(result.culled.drawCalls).toBeLessThan(result.unculled.drawCalls / 4);
    expect(result.culled.nonBackgroundPixels).toBeGreaterThan(1_000);
    expect(result.bvh.build.objectCount).toBe(1600);
    expect(result.bvh.query.culledObjects).toBeGreaterThan(1200);
    expect(result.bvh.query.leafTests).toBeLessThan(800);
    expect(result.bvh.query.rejectedNodes).toBeGreaterThan(0);
    expect(result.occlusionStrategy).toMatchObject({ implemented: false, mode: "none-no-gpu-occlusion-query-or-hiz" });
    expect(result.occlusionStrategy.boundary).toContain("does not implement or claim GPU occlusion queries");
    expect(errors).toEqual([]);

    const artifacts: Record<string, unknown> = {};
    for (const [name, dataUrl] of [["large-scene-culled", result.culled.dataUrl], ["large-scene-unculled", result.unculled.dataUrl]]) {
      const path = `tests/reports/geometry-instancing-lod-text/${name}.png`;
      writePng(path, dataUrl);
      artifacts[name] = { path, size: statSync(resolve(path)).size, pixels: readProductionPngStats(resolve(path)) };
    }
    const clean = structuredClone(result);
    delete clean.culled.dataUrl;
    delete clean.unculled.dataUrl;
    writeJson(REPORT, { ...clean, artifacts, generatedAt: new Date().toISOString() });
  } finally {
    await server.close();
  }
});

function writePng(path: string, dataUrl: string): void { mkdirSync(dirname(resolve(path)), { recursive: true }); writeFileSync(resolve(path), Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64")); }
function writeJson(path: string, value: unknown): void { mkdirSync(dirname(resolve(path)), { recursive: true }); writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`); }
