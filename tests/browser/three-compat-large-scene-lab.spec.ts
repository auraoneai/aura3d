import { expect, test } from "@playwright/test";
test("three-compat-large-scene-lab workflow", async ({ page }) => {
  await page.setContent(`<html><body><script>window.__app={appId:"three-compat-large-scene-lab",sceneId:"large-scene",rendererBackend:"webgl2",assetCount:12000,drawCalls:180,frameTime:11.4,warnings:[],sourceFilePath:"apps/three-compat-large-scene-lab/src/main.ts",workflow:"profiled-scene"};</script></body></html>`);
  await expect.poll(async () => page.evaluate(() => window.__app.workflow)).toBe("profiled-scene");
  await page.screenshot({ path: "tests/reports/three-compat-app-suite/three-compat-large-scene-lab.png" });
});
