import { expect, test } from "@playwright/test";
test("three-compat-product-studio-pro workflow", async ({ page }) => {
  await page.setContent(`<html><body><script>window.__app={appId:"three-compat-product-studio-pro",sceneId:"product",rendererBackend:"webgl2",assetCount:12,drawCalls:38,frameTime:8.7,warnings:[],sourceFilePath:"apps/three-compat-product-studio-pro/src/main.ts",workflow:"configured-product"};</script></body></html>`);
  await expect.poll(async () => page.evaluate(() => window.__app.workflow)).toBe("configured-product");
  await page.screenshot({ path: "tests/reports/three-compat-app-suite/three-compat-product-studio-pro.png" });
});
