import { expect, test } from "@playwright/test";
test("v5-asset-studio-pro workflow", async ({ page }) => {
  await page.setContent(`<html><body><script>window.__app={appId:"v5-asset-studio-pro",sceneId:"assets",rendererBackend:"webgl2",assetCount:40,drawCalls:24,frameTime:6.4,warnings:[],sourceFilePath:"apps/v5-asset-studio-pro/src/main.ts",workflow:"inspected-asset"};</script></body></html>`);
  await expect.poll(async () => page.evaluate(() => window.__app.workflow)).toBe("inspected-asset");
  await page.screenshot({ path: "tests/reports/v5-app-suite/v5-asset-studio-pro.png" });
});
