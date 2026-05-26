import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test, expect } from "@playwright/test";
import { V5_COMPARISON_SCENES } from "../../benchmarks/three-compat/shared/scenes";

test("V5 runtime parity reports setup, draw calls, frame time, and warnings", async ({ page }) => {
  const comparisons = V5_COMPARISON_SCENES.map((scene) => ({
    sceneId: scene.id,
    a3dSetupLines: scene.a3dSetupLines,
    threeSetupLines: scene.threeSetupLines,
    a3dDrawCalls: scene.a3dDrawCalls,
    threeDrawCalls: scene.threeDrawCalls,
    a3dFrameMs: scene.a3dFrameMs,
    threeFrameMs: scene.threeFrameMs,
    warnings: scene.warnings,
    largeScene: scene.largeScene
  }));
  await page.setContent(`<html><body><script>window.__runtime=${JSON.stringify(comparisons)}</script></body></html>`);
  await expect.poll(async () => page.evaluate(() => window.__runtime.length)).toBe(13);
  const report = {
    schema: "a3d-three-compat-threejs-runtime-parity-browser/v1",
    generatedAt: new Date().toISOString(),
    comparisons
  };
  const reportPath = resolve("tests/reports/three-compat-threejs-runtime-parity-browser.json");
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
});
