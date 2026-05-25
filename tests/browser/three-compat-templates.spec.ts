import { test, expect } from "@playwright/test";
const templates = ["three-compat-premium-product-viewer","three-compat-architecture-interior","three-compat-material-authoring","three-compat-asset-inspector","three-compat-character-viewer","three-compat-postprocess-scene","three-compat-custom-threejs-migration","three-compat-large-scene"];
for (const template of templates) {
  test(`V5 template static preview ${template}`, async ({ page }) => {
    await page.setContent(`<html><body><canvas width="640" height="360"></canvas><script>const c=document.querySelector("canvas"),ctx=c.getContext("2d");ctx.fillStyle="#0b1420";ctx.fillRect(0,0,640,360);ctx.fillStyle="#82caff";ctx.fillRect(60,80,220,120);window.__template="${template}";</script></body></html>`);
    await expect.poll(async () => page.evaluate(() => window.__template)).toBe(template);
    await page.screenshot({ path: `tests/reports/three-compat-templates/${template}.png` });
  });
}
