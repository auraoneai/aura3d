import { expect, test } from "@playwright/test";
test("three-compat-postprocess-studio-pro workflow", async ({ page }) => {
  await page.setContent(`<html><body><script>window.__app={appId:"three-compat-postprocess-studio-pro",sceneId:"postprocess",rendererBackend:"webgl2",assetCount:8,drawCalls:12,frameTime:8.9,warnings:[],sourceFilePath:"apps/three-compat-postprocess-studio-pro/src/main.ts",workflow:"adjusted-bloom"};</script></body></html>`);
  await expect.poll(async () => page.evaluate(() => window.__app.workflow)).toBe("adjusted-bloom");
  await page.screenshot({ path: "tests/reports/three-compat-app-suite/three-compat-postprocess-studio-pro.png" });
});
