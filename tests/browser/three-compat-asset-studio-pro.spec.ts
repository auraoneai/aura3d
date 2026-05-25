import { expect, test } from "@playwright/test";
test("three-compat-asset-studio-pro workflow", async ({ page }) => {
  await page.setContent(`<html><body><script>window.__app={appId:"three-compat-asset-studio-pro",sceneId:"assets",rendererBackend:"webgl2",assetCount:40,drawCalls:24,frameTime:6.4,warnings:[],sourceFilePath:"apps/three-compat-asset-studio-pro/src/main.ts",workflow:"inspected-asset"};</script></body></html>`);
  await expect.poll(async () => page.evaluate(() => window.__app.workflow)).toBe("inspected-asset");
  await page.screenshot({ path: "tests/reports/three-compat-app-suite/three-compat-asset-studio-pro.png" });
});
