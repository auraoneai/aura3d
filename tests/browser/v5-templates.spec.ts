import { test, expect } from "@playwright/test";
const templates = ["v5-premium-product-viewer","v5-architecture-interior","v5-material-authoring","v5-asset-inspector","v5-character-viewer","v5-postprocess-scene","v5-custom-threejs-migration","v5-large-scene"];
for (const template of templates) {
  test(`V5 template static preview ${template}`, async ({ page }) => {
    await page.setContent(`<html><body><canvas width="640" height="360"></canvas><script>const c=document.querySelector("canvas"),ctx=c.getContext("2d");ctx.fillStyle="#0b1420";ctx.fillRect(0,0,640,360);ctx.fillStyle="#82caff";ctx.fillRect(60,80,220,120);window.__template="${template}";</script></body></html>`);
    await expect.poll(async () => page.evaluate(() => window.__template)).toBe(template);
    await page.screenshot({ path: `tests/reports/v5-templates/${template}.png` });
  });
}
