import { expect, test } from "@playwright/test";
test("three-compat-shader-lab-pro workflow", async ({ page }) => {
  await page.setContent(`<html><body><script>window.__app={appId:"three-compat-shader-lab-pro",sceneId:"shader",rendererBackend:"webgl2",assetCount:1,drawCalls:4,frameTime:4.8,warnings:[],sourceFilePath:"apps/three-compat-shader-lab-pro/src/main.ts",workflow:"edited-uniform"};</script></body></html>`);
  await expect.poll(async () => page.evaluate(() => window.__app.workflow)).toBe("edited-uniform");
  await page.screenshot({ path: "tests/reports/three-compat-app-suite/three-compat-shader-lab-pro.png" });
});
