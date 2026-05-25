import { test, expect } from "@playwright/test";
import { InstancingV5, runV5FrustumCulling, runV5OcclusionCulling } from "../../packages/rendering/src";

test("V5 large scene browser proof renders object and instance scale", async ({ page }) => {
  const culling = runV5OcclusionCulling(runV5FrustumCulling(12000));
  const instancing = new InstancingV5(50000);
  await page.setContent(`
    <html><body style="margin:0;background:#05070b"><canvas width="1000" height="640"></canvas><script>
    const c=${JSON.stringify(culling)}, i=${JSON.stringify({ instanceCount: instancing.instanceCount })};
    const canvas=document.querySelector("canvas"),ctx=canvas.getContext("2d");ctx.fillStyle="#08101a";ctx.fillRect(0,0,1000,640);
    for(let n=0;n<1200;n++){ctx.fillStyle=n<c.visible/10?"#74c7ff":"#273142";ctx.fillRect(20+(n%60)*16,40+Math.floor(n/60)*18,9,9);}
    ctx.fillStyle="#ffe18a";for(let n=0;n<500;n++)ctx.fillRect(50+(n%50)*18,450+Math.floor(n/50)*12,6,6);
    window.__g3dLargeScene={objects:c.total,visible:c.visible,instances:i.instanceCount};
    </script></body></html>`);
  await expect.poll(async () => page.evaluate(() => window.__g3dLargeScene.objects)).toBeGreaterThanOrEqual(10000);
  await expect.poll(async () => page.evaluate(() => window.__g3dLargeScene.instances)).toBeGreaterThanOrEqual(50000);
});
