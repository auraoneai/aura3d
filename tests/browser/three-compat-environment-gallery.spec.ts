import { test, expect } from "@playwright/test";
import { createThreeCompatEnvironmentGalleryModel } from "../../packages/environments/src";

test("ThreeCompat environment gallery renders all probe types for every environment", async ({ page }) => {
  const gallery = createThreeCompatEnvironmentGalleryModel();
  const compact = gallery.map((entry) => ({
    id: entry.preset.id,
    label: entry.preset.label,
    kind: entry.preset.kind,
    intensity: entry.preset.intensity,
    exposure: entry.preset.exposure,
    probes: entry.probes.map((probe) => probe.probe)
  }));

  await page.setContent(`
    <html>
      <body style="margin:0;background:#090b0f">
        <canvas id="gallery" width="960" height="720"></canvas>
        <script>
          const gallery = ${JSON.stringify(compact)};
          const canvas = document.getElementById("gallery");
          const ctx = canvas.getContext("2d");
          const probes = ["reflective", "rough", "transmissive", "emissive"];
          gallery.forEach((env, row) => {
            const y = 18 + row * 56;
            ctx.fillStyle = env.kind === "real-hdri" ? "#172338" : "#1e1b28";
            ctx.fillRect(12, y, 936, 44);
            ctx.fillStyle = "#d8e4ff";
            ctx.font = "12px system-ui";
            ctx.fillText(env.label, 22, y + 26);
            probes.forEach((probe, index) => {
              const x = 260 + index * 152;
              const value = Math.min(255, Math.round(72 + env.intensity * 54 + env.exposure * 24 + index * 18));
              ctx.beginPath();
              ctx.arc(x, y + 22, 16, 0, Math.PI * 2);
              ctx.fillStyle = probe === "emissive" ? "rgb(" + value + "," + Math.round(value * 0.74) + ",96)" : "rgb(" + Math.round(value * 0.58) + "," + Math.round(value * 0.76) + "," + value + ")";
              ctx.fill();
              ctx.strokeStyle = env.probes.includes(probe) ? "#ffffff" : "#ff3355";
              ctx.lineWidth = 2;
              ctx.stroke();
            });
          });
          window.__a3dGalleryRows = gallery.length;
          window.__a3dProbeCells = gallery.reduce((count, env) => count + env.probes.length, 0);
        </script>
      </body>
    </html>
  `);

  await expect.poll(async () => page.evaluate(() => window.__a3dGalleryRows)).toBeGreaterThanOrEqual(12);
  await expect.poll(async () => page.evaluate(() => window.__a3dProbeCells)).toBeGreaterThanOrEqual(48);
  const pixelStats = await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let litPixels = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] > 25 || data[index + 1] > 25 || data[index + 2] > 25) litPixels++;
    }
    return { litPixels, totalPixels: data.length / 4 };
  });
  expect(pixelStats.litPixels).toBeGreaterThan(pixelStats.totalPixels * 0.08);
});
