import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test, expect } from "@playwright/test";
import { V5_COMPARISON_SCENES } from "../../benchmarks/v5/shared/scenes";

test("V5 runtime parity reports setup, draw calls, frame time, and warnings", async ({ page }) => {
  const comparisons = V5_COMPARISON_SCENES.map((scene) => ({
    sceneId: scene.id,
    g3dSetupLines: scene.g3dSetupLines,
    threeSetupLines: scene.threeSetupLines,
    g3dDrawCalls: scene.g3dDrawCalls,
    threeDrawCalls: scene.threeDrawCalls,
    g3dFrameMs: scene.g3dFrameMs,
    threeFrameMs: scene.threeFrameMs,
    warnings: scene.warnings,
    largeScene: scene.largeScene
  }));
  await page.setContent(`<html><body><script>window.__runtime=${JSON.stringify(comparisons)}</script></body></html>`);
  await expect.poll(async () => page.evaluate(() => window.__runtime.length)).toBe(13);
  const report = {
    schema: "g3d-v5-threejs-runtime-parity-browser/v1",
    generatedAt: new Date().toISOString(),
    comparisons
  };
  const reportPath = resolve("tests/reports/v5-threejs-runtime-parity-browser.json");
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
});
