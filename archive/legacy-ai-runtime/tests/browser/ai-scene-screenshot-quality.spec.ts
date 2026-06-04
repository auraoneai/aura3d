import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readProductionPngStats } from "../../tools/production-runtime-report-bridge/pngStats";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { waitForAISceneRuntime } from "./ai-scene-route-helper";

const SCREENSHOT_ROUTES = [
  {
    path: "/apps/aura-prompt-to-scene/",
    output: "tests/reports/ai-scene/screenshots/prompt-to-scene.png"
  },
  {
    path: "/apps/aura-scene-diff-editor/",
    output: "tests/reports/ai-scene/screenshots/scene-patch-after.png"
  },
  {
    path: "/apps/aura-cinematic-prompt-lab/",
    output: "tests/reports/ai-scene/screenshots/scene-patch-before.png"
  }
] as const;

test.describe("AI scene screenshot quality", () => {
  test.setTimeout(90_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("captures colorful nonblank evidence screenshots", async ({ page }) => {
    const evidence = [];
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const route of SCREENSHOT_ROUTES) {
      await page.goto(`${server.origin}${route.path}`, { waitUntil: "domcontentloaded" });
      await waitForAISceneRuntime(page);
      mkdirSync(dirname(resolve(route.output)), { recursive: true });
      await page.screenshot({ path: route.output, fullPage: false });
      const stats = readProductionPngStats(resolve(route.output));
      const pass = stats.width >= 1_000
        && stats.height >= 700
        && stats.nonBlackPixels > stats.width * stats.height * 0.05
        && stats.uniqueColorBuckets >= 18
        && stats.localContrast >= 2;
      evidence.push({ path: route.path, screenshot: route.output, stats, pass });
      expect(pass, `${route.path} screenshot quality failed: ${JSON.stringify(stats, null, 2)}`).toBe(true);
    }

    const report = {
      schema: "a3d-ai-scene-screenshot-quality",
      generatedAt: new Date().toISOString(),
      pass: evidence.every((entry) => entry.pass),
      inputs: {
        routes: SCREENSHOT_ROUTES.map((route) => route.path),
        requiredFiles: SCREENSHOT_ROUTES.map((route) => route.output),
        requiredReports: [],
        environment: { A3D_AI_SCENE_PROVIDER_MODE: "mock", A3D_AI_SCENE_NETWORK: "disabled" }
      },
      evidence,
      providerMode: "mock",
      networkUsed: false,
      blockedClaims: [],
      unsupportedCases: evidence.filter((entry) => !entry.pass).map((entry) => ({
        id: entry.path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, ""),
        severity: "blocked",
        detail: `${entry.path} did not pass screenshot quality thresholds.`,
        nextAction: "Improve route framing, color, or rendered detail."
      }))
    };
    mkdirSync(resolve("tests/reports/ai-scene"), { recursive: true });
    writeFileSync(resolve("tests/reports/ai-scene/quality.json"), `${JSON.stringify(report, null, 2)}\n`);
  });
});
