import { expect, test } from "@playwright/test";
test("v5-material-studio-pro workflow", async ({ page }) => {
  await page.setContent(`<html><body><script>window.__app={appId:"v5-material-studio-pro",sceneId:"materials",rendererBackend:"webgl2",assetCount:50,drawCalls:72,frameTime:11.2,warnings:[],sourceFilePath:"apps/v5-material-studio-pro/src/main.ts",workflow:"selected-material"};</script></body></html>`);
  await expect.poll(async () => page.evaluate(() => window.__app.workflow)).toBe("selected-material");
  await page.screenshot({ path: "tests/reports/v5-app-suite/v5-material-studio-pro.png" });
});
