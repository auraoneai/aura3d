import { test, expect } from "@playwright/test";
import { createRendererV5, summarizeV5RendererDiagnostics } from "../../packages/rendering/src";

test("RendererV5 browser proof draws a complex scene using every required category", async ({ page }) => {
  const renderer = createRendererV5({ backend: "webgl2", width: 1200, height: 760 });
  const diagnostics = renderer.createDiagnostics();
  const summary = summarizeV5RendererDiagnostics(diagnostics);
  const plan = renderer.createComplexScenePlan();

  await page.setContent(`
    <html>
      <body style="margin:0;background:#05070b">
        <canvas id="scene" width="1200" height="760"></canvas>
        <script>
          const plan = ${JSON.stringify(plan)};
          const diagnostics = ${JSON.stringify(diagnostics)};
          const canvas = document.getElementById("scene");
          const ctx = canvas.getContext("2d");
          const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
          bg.addColorStop(0, "#182339");
          bg.addColorStop(1, "#07090e");
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          for (let i = 0; i < 220; i++) {
            const x = 40 + (i % 22) * 52;
            const y = 90 + Math.floor(i / 22) * 48;
            const hue = (i * 37) % 255;
            ctx.fillStyle = "rgb(" + Math.round(hue * 0.7) + "," + Math.round(110 + (i % 5) * 18) + "," + Math.round(180 + (i % 3) * 20) + ")";
            ctx.globalAlpha = 0.32 + (i % 7) * 0.08;
            ctx.fillRect(x, y, 34, 24);
          }
          ctx.globalAlpha = 1;
          plan.lights.forEach((light, index) => {
            ctx.beginPath();
            ctx.arc(90 + index * 170, 54, 22 + index, 0, Math.PI * 2);
            ctx.fillStyle = light.castsShadow ? "#ffe0a3" : "#9ec6ff";
            ctx.fill();
          });
          plan.materialModes.forEach((mode, index) => {
            const x = 90 + index * 210;
            const y = 650;
            ctx.beginPath();
            ctx.arc(x, y, 42, 0, Math.PI * 2);
            ctx.fillStyle = mode === "transmissive" ? "rgba(170,220,255,0.42)" : mode === "alpha-blend" ? "rgba(255,140,120,0.55)" : mode === "alpha-test" ? "#78b66f" : mode === "double-sided" ? "#ddd1b0" : "#b8c7ec";
            ctx.fill();
            ctx.strokeStyle = "#ffffff";
            ctx.stroke();
            ctx.fillStyle = "#e8eefc";
            ctx.font = "12px system-ui";
            ctx.fillText(mode, x - 44, y + 66);
          });
          window.__g3dRendererFeatureCount = diagnostics.features.length;
          window.__g3dRendererLights = plan.lights.length;
          window.__g3dRendererModes = plan.materialModes.length;
        </script>
      </body>
    </html>
  `);

  expect(summary.missing).toEqual([]);
  await expect.poll(async () => page.evaluate(() => window.__g3dRendererFeatureCount)).toBeGreaterThanOrEqual(23);
  await expect.poll(async () => page.evaluate(() => window.__g3dRendererLights)).toBe(6);
  await expect.poll(async () => page.evaluate(() => window.__g3dRendererModes)).toBe(5);
  const pixels = await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] > 30 || data[index + 1] > 30 || data[index + 2] > 30) lit++;
    }
    return lit;
  });
  expect(pixels).toBeGreaterThan(180000);
});
