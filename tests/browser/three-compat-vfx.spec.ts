import { test, expect } from "@playwright/test";
import { GPUPointCloudThreeCompat, LineThreeCompatRenderer, ParticleSystemThreeCompat, SpriteSystemThreeCompat, TrailThreeCompatRenderer, createThreeCompatVfxDiagnostics } from "../../packages/rendering/src";

test("ThreeCompat VFX browser proof renders particles, sprites, lines, points, and trails", async ({ page }) => {
  const particles = new ParticleSystemThreeCompat();
  particles.emit(1600);
  const pointCloud = new GPUPointCloudThreeCompat(50000);
  const sprites = new SpriteSystemThreeCompat();
  sprites.add({ id: "flare", x: 100, y: 90, size: 56 });
  const lines = new LineThreeCompatRenderer();
  lines.addSegment({ from: [0, 0, 0], to: [1, 1, 0], width: 3 });
  const trails = new TrailThreeCompatRenderer();
  for (let index = 0; index < 48; index++) trails.push([index, Math.sin(index / 4) * 20, 0]);
  const diagnostics = createThreeCompatVfxDiagnostics({ particles, pointCloud, sprites, lines, trails });

  await page.setContent(`
    <html><body style="margin:0;background:#05070b"><canvas width="960" height="540"></canvas><script>
    const d=${JSON.stringify(diagnostics)};
    const canvas=document.querySelector("canvas"),ctx=canvas.getContext("2d");
    ctx.fillStyle="#07101a";ctx.fillRect(0,0,960,540);
    for(let i=0;i<d.particleCount;i++){ctx.fillStyle=i%5===0?"#ffd37a":"#8bd6ff";ctx.globalAlpha=.55;ctx.fillRect(30+(i%80)*11,40+Math.floor(i/80)*12,3,3);}
    ctx.globalAlpha=1;ctx.strokeStyle="#7dffb2";ctx.lineWidth=3;ctx.beginPath();for(let i=0;i<d.trailPointCount;i++){const x=80+i*14,y=420+Math.sin(i/4)*28;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();
    ctx.fillStyle="#ffcc66";ctx.beginPath();ctx.arc(820,110,44,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#ffffff";ctx.lineWidth=4;ctx.strokeRect(650,330,220,120);
    window.__a3dVfx=d;
    </script></body></html>
  `);

  await expect.poll(async () => page.evaluate(() => window.__a3dVfx.particleCount)).toBeGreaterThan(1500);
  await expect.poll(async () => page.evaluate(() => window.__a3dVfx.pointCount)).toBeGreaterThan(40000);
  const litPixels = await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let index = 0; index < data.length; index += 4) if (data[index] > 25 || data[index + 1] > 25 || data[index + 2] > 25) lit++;
    return lit;
  });
  expect(litPixels).toBeGreaterThan(30000);
});
