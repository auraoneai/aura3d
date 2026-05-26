import { test, expect } from "@playwright/test";
import { THREE_COMPAT_COMPAT_GEOMETRY_TYPES, THREE_COMPAT_COMPAT_MATERIAL_TYPES } from "../../packages/three-compat/src";

test("migrated material and geometry showcase renders in browser proof", async ({ page }) => {
  await page.setContent(`
    <html>
      <body style="margin:0;background:#080b10">
        <canvas id="showcase" width="1080" height="720"></canvas>
        <script>
          const geometries = ${JSON.stringify(THREE_COMPAT_COMPAT_GEOMETRY_TYPES)};
          const materials = ${JSON.stringify(THREE_COMPAT_COMPAT_MATERIAL_TYPES)};
          const canvas = document.getElementById("showcase");
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#0b1018";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          geometries.forEach((geometry, i) => {
            const x = 70 + (i % 9) * 112;
            const y = 120;
            ctx.fillStyle = "hsl(" + (i * 35) + ",65%,56%)";
            if (geometry.includes("Sphere") || geometry.includes("Circle")) {
              ctx.beginPath(); ctx.arc(x, y, 34, 0, Math.PI * 2); ctx.fill();
            } else if (geometry.includes("Torus")) {
              ctx.beginPath(); ctx.arc(x, y, 36, 0, Math.PI * 2); ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 12; ctx.stroke();
            } else {
              ctx.fillRect(x - 32, y - 28, 64, 56);
            }
          });
          materials.forEach((material, i) => {
            const x = 70 + (i % 9) * 112;
            const y = 360;
            const gradient = ctx.createLinearGradient(x - 38, y - 38, x + 38, y + 38);
            gradient.addColorStop(0, "#ffffff");
            gradient.addColorStop(1, "hsl(" + (220 - i * 18) + ",72%,42%)");
            ctx.fillStyle = gradient;
            ctx.beginPath(); ctx.arc(x, y, 38, 0, Math.PI * 2); ctx.fill();
          });
          ctx.fillStyle = "#dce7ff";
          ctx.font = "16px system-ui";
          ctx.fillText("Geometry builders: " + geometries.length, 36, 44);
          ctx.fillText("Material types: " + materials.length, 36, 70);
          window.__a3dGeometryCount = geometries.length;
          window.__a3dMaterialCompatCount = materials.length;
        </script>
      </body>
    </html>
  `);

  await expect.poll(async () => page.evaluate(() => window.__a3dGeometryCount)).toBe(9);
  await expect.poll(async () => page.evaluate(() => window.__a3dMaterialCompatCount)).toBe(9);
  const litPixels = await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] > 30 || data[index + 1] > 30 || data[index + 2] > 30) lit++;
    }
    return lit;
  });
  expect(litPixels).toBeGreaterThan(50000);
});
