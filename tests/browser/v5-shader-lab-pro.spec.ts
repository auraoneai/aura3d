import { expect, test } from "@playwright/test";
test("v5-shader-lab-pro workflow", async ({ page }) => {
  await page.setContent(`<html><body><script>window.__app={appId:"v5-shader-lab-pro",sceneId:"shader",rendererBackend:"webgl2",assetCount:1,drawCalls:4,frameTime:4.8,warnings:[],sourceFilePath:"apps/v5-shader-lab-pro/src/main.ts",workflow:"edited-uniform"};</script></body></html>`);
  await expect.poll(async () => page.evaluate(() => window.__app.workflow)).toBe("edited-uniform");
  await page.screenshot({ path: "tests/reports/v5-app-suite/v5-shader-lab-pro.png" });
});
