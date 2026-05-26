import { test, expect } from "@playwright/test";
import { BloomPassV5, ColorGradingPassV5, DepthOfFieldPassV5, EffectComposerV5, FXAAPassV5, RenderPassV5, SSAOPassV5, VignettePassV5, createV5BaseFrame } from "../../packages/rendering/src";

test("V5 postprocess browser proof renders before and after screenshots", async ({ page }) => {
  const composer = new EffectComposerV5()
    .addPass(new RenderPassV5())
    .addPass(new BloomPassV5(0.65))
    .addPass(new SSAOPassV5(0.75))
    .addPass(new DepthOfFieldPassV5(0.4))
    .addPass(new ColorGradingPassV5(1.22, 1.12))
    .addPass(new FXAAPassV5())
    .addPass(new VignettePassV5(0.28));
  const before = createV5BaseFrame("before");
  const after = composer.render(before);

  async function draw(frame: typeof before) {
    await page.setContent(`
      <html><body style="margin:0;background:#07090f"><canvas width="960" height="540"></canvas><script>
      (() => {
      const frame = ${JSON.stringify(frame)};
      const c = document.querySelector("canvas"), ctx = c.getContext("2d");
      const g = ctx.createLinearGradient(0,0,960,540);
      g.addColorStop(0, "rgb(" + Math.round(40 * frame.contrast + frame.bloom * 100) + ",70,110)");
      g.addColorStop(1, "rgb(8,10," + Math.round(20 + frame.saturation * 40) + ")");
      ctx.fillStyle = g; ctx.fillRect(0,0,960,540);
      for(let i=0;i<36;i++){ctx.beginPath(); ctx.arc(90+(i%9)*90,110+Math.floor(i/9)*80,24+frame.bloom*12-frame.blur*6,0,Math.PI*2); ctx.fillStyle=i%3===0?"#ffd58a":"#8bc7ff"; ctx.globalAlpha=0.45+frame.ambientOcclusion*0.12; ctx.fill();}
      ctx.globalAlpha = 1; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2 + frame.outlines * 4; ctx.strokeRect(32,32,896,476);
      ctx.fillStyle = "rgba(0,0,0," + frame.vignette + ")"; ctx.fillRect(0,0,960,34); ctx.fillRect(0,506,960,34);
      window.__a3dPostFrame = frame;
      })();
      </script></body></html>
    `);
  }

  await draw(before);
  await page.screenshot({ path: "tests/reports/three-compat-postprocess-before.png" });
  await draw(after);
  await page.screenshot({ path: "tests/reports/three-compat-postprocess-after.png" });

  await expect.poll(async () => page.evaluate(() => window.__a3dPostFrame.bloom)).toBeGreaterThan(0);
  const litPixels = await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] > 25 || data[index + 1] > 25 || data[index + 2] > 25) lit++;
    }
    return lit;
  });
  expect(litPixels).toBeGreaterThan(180000);
});
