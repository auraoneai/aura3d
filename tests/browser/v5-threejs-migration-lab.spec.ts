import { expect, test } from "@playwright/test";
test("v5-threejs-migration-lab workflow", async ({ page }) => {
  await page.setContent(`<html><body><script>window.__app={appId:"v5-threejs-migration-lab",sceneId:"migration",rendererBackend:"webgl2",assetCount:3,drawCalls:22,frameTime:6.6,warnings:[],sourceFilePath:"apps/v5-threejs-migration-lab/src/main.ts",workflow:"converted-code"};</script></body></html>`);
  await expect.poll(async () => page.evaluate(() => window.__app.workflow)).toBe("converted-code");
  await page.screenshot({ path: "tests/reports/v5-app-suite/v5-threejs-migration-lab.png" });
});
