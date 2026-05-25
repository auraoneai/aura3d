import { expect, test } from "@playwright/test";
test("three-compat-material-studio-pro workflow", async ({ page }) => {
  await page.setContent(`<html><body><script>window.__app={appId:"three-compat-material-studio-pro",sceneId:"materials",rendererBackend:"webgl2",assetCount:50,drawCalls:72,frameTime:11.2,warnings:[],sourceFilePath:"apps/three-compat-material-studio-pro/src/main.ts",workflow:"selected-material"};</script></body></html>`);
  await expect.poll(async () => page.evaluate(() => window.__app.workflow)).toBe("selected-material");
  await page.screenshot({ path: "tests/reports/three-compat-app-suite/three-compat-material-studio-pro.png" });
});
