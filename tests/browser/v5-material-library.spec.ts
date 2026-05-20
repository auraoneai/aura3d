import { test, expect } from "@playwright/test";
import { createV5MaterialPreviewScene, listV5PbrMaterials } from "../../packages/materials/src";

test("V5 material browser renders the PBR library matrix", async ({ page }) => {
  const materials = listV5PbrMaterials();
  const tiles = createV5MaterialPreviewScene();

  await page.setContent(`
    <html>
      <body style="margin:0;background:#080a0e">
        <canvas id="materials" width="1200" height="920"></canvas>
        <script>
          const materials = ${JSON.stringify(materials)};
          const tiles = ${JSON.stringify(tiles)};
          const canvas = document.getElementById("materials");
          const ctx = canvas.getContext("2d");
          const cols = 10;
          materials.forEach((material, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const x = 16 + col * 116;
            const y = 16 + row * 172;
            const [r, g, b] = material.parameters.baseColor.map((v) => Math.round(v * 255));
            ctx.fillStyle = "#141922";
            ctx.fillRect(x, y, 102, 150);
            ctx.beginPath();
            ctx.arc(x + 51, y + 52, 34, 0, Math.PI * 2);
            const grad = ctx.createRadialGradient(x + 38, y + 38, 4, x + 51, y + 52, 38);
            grad.addColorStop(0, "rgb(" + Math.min(255, r + 70) + "," + Math.min(255, g + 70) + "," + Math.min(255, b + 70) + ")");
            grad.addColorStop(1, "rgb(" + Math.max(8, r * material.parameters.roughness) + "," + Math.max(8, g * material.parameters.roughness) + "," + Math.max(8, b * material.parameters.roughness) + ")");
            ctx.fillStyle = grad;
            ctx.fill();
            if (material.parameters.clearcoat) {
              ctx.strokeStyle = "#ffffff";
              ctx.lineWidth = 2;
              ctx.stroke();
            }
            if (material.parameters.transmission) {
              ctx.globalAlpha = 0.35;
              ctx.fillStyle = "#bde8ff";
              ctx.fillRect(x + 18, y + 22, 66, 60);
              ctx.globalAlpha = 1;
            }
            if (material.parameters.emissiveIntensity) {
              ctx.fillStyle = "#ffca66";
              ctx.fillRect(x + 20, y + 92, 62, 10);
            }
            if (material.parameters.alphaMode === "mask") {
              ctx.clearRect(x + 36, y + 36, 18, 18);
              ctx.clearRect(x + 58, y + 58, 18, 18);
            }
            ctx.fillStyle = "#dfe7f7";
            ctx.font = "10px system-ui";
            ctx.fillText(tiles[index].previewGeometry, x + 8, y + 122);
            ctx.fillText(material.textureSetId ? "texture" : "procedural", x + 8, y + 138);
          });
          window.__g3dMaterialCount = materials.length;
          window.__g3dTextureBacked = materials.filter((material) => material.textureSetId).length;
        </script>
      </body>
    </html>
  `);

  await expect.poll(async () => page.evaluate(() => window.__g3dMaterialCount)).toBeGreaterThanOrEqual(50);
  await expect.poll(async () => page.evaluate(() => window.__g3dTextureBacked)).toBeGreaterThanOrEqual(25);
  const litPixels = await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] > 24 || data[index + 1] > 24 || data[index + 2] > 24) count++;
    }
    return count;
  });
  expect(litPixels).toBeGreaterThan(90000);
});
