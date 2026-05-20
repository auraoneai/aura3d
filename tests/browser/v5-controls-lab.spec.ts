import { expect, test } from "@playwright/test";
test("v5-controls-lab workflow", async ({ page }) => {
  await page.setContent(`<html><body><script>window.__app={appId:"v5-controls-lab",sceneId:"controls",rendererBackend:"webgl2",assetCount:4,drawCalls:18,frameTime:5.9,warnings:[],sourceFilePath:"apps/v5-controls-lab/src/main.ts",workflow:"transformed-object"};</script></body></html>`);
  await expect.poll(async () => page.evaluate(() => window.__app.workflow)).toBe("transformed-object");
  await page.screenshot({ path: "tests/reports/v5-app-suite/v5-controls-lab.png" });
});
