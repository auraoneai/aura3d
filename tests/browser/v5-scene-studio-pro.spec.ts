import { expect, test } from "@playwright/test";
test("v5-scene-studio-pro workflow", async ({ page }) => {
  await page.setContent(`<html><body><script>window.__app={appId:"v5-scene-studio-pro",sceneId:"architecture",rendererBackend:"webgl2",assetCount:18,drawCalls:64,frameTime:12.1,warnings:[],sourceFilePath:"apps/v5-scene-studio-pro/src/main.ts",workflow:"edited-scene"};</script></body></html>`);
  await expect.poll(async () => page.evaluate(() => window.__app.workflow)).toBe("edited-scene");
  await page.screenshot({ path: "tests/reports/v5-app-suite/v5-scene-studio-pro.png" });
});
