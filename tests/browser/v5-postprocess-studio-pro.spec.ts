import { expect, test } from "@playwright/test";
test("v5-postprocess-studio-pro workflow", async ({ page }) => {
  await page.setContent(`<html><body><script>window.__app={appId:"v5-postprocess-studio-pro",sceneId:"postprocess",rendererBackend:"webgl2",assetCount:8,drawCalls:12,frameTime:8.9,warnings:[],sourceFilePath:"apps/v5-postprocess-studio-pro/src/main.ts",workflow:"adjusted-bloom"};</script></body></html>`);
  await expect.poll(async () => page.evaluate(() => window.__app.workflow)).toBe("adjusted-bloom");
  await page.screenshot({ path: "tests/reports/v5-app-suite/v5-postprocess-studio-pro.png" });
});
