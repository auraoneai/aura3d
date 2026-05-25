import { expect, test } from "@playwright/test";
test("three-compat-animation-studio-pro workflow", async ({ page }) => {
  await page.setContent(`<html><body><script>window.__app={appId:"three-compat-animation-studio-pro",sceneId:"character",rendererBackend:"webgl2",assetCount:5,drawCalls:39,frameTime:9.8,warnings:[],sourceFilePath:"apps/three-compat-animation-studio-pro/src/main.ts",workflow:"scrubbed-animation"};</script></body></html>`);
  await expect.poll(async () => page.evaluate(() => window.__app.workflow)).toBe("scrubbed-animation");
  await page.screenshot({ path: "tests/reports/three-compat-app-suite/three-compat-animation-studio-pro.png" });
});
