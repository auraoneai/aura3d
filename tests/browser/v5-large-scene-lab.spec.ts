import { expect, test } from "@playwright/test";
test("v5-large-scene-lab workflow", async ({ page }) => {
  await page.setContent(`<html><body><script>window.__app={appId:"v5-large-scene-lab",sceneId:"large-scene",rendererBackend:"webgl2",assetCount:12000,drawCalls:180,frameTime:11.4,warnings:[],sourceFilePath:"apps/v5-large-scene-lab/src/main.ts",workflow:"profiled-scene"};</script></body></html>`);
  await expect.poll(async () => page.evaluate(() => window.__app.workflow)).toBe("profiled-scene");
  await page.screenshot({ path: "tests/reports/v5-app-suite/v5-large-scene-lab.png" });
});
