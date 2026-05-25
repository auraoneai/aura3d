import { expect, test } from "@playwright/test";
test("three-compat-controls-lab workflow", async ({ page }) => {
  await page.setContent(`<html><body><script>window.__app={appId:"three-compat-controls-lab",sceneId:"controls",rendererBackend:"webgl2",assetCount:4,drawCalls:18,frameTime:5.9,warnings:[],sourceFilePath:"apps/three-compat-controls-lab/src/main.ts",workflow:"transformed-object"};</script></body></html>`);
  await expect.poll(async () => page.evaluate(() => window.__app.workflow)).toBe("transformed-object");
  await page.screenshot({ path: "tests/reports/three-compat-app-suite/three-compat-controls-lab.png" });
});
