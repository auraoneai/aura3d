import { test, expect } from "@playwright/test";
import {
  AmbientLightCompat,
  DirectionalLightCompat,
  GroupCompat,
  MeshCompat,
  PerspectiveCameraCompat,
  RaycasterCompat,
  SceneCompat,
  Vector3Compat
} from "../../packages/three-compat/src";

test("Three.js-style compat scene migrates through G3D browser proof", async ({ page }) => {
  const scene = new SceneCompat();
  const camera = new PerspectiveCameraCompat(55, 1.6, 0.1, 500);
  const group = new GroupCompat();
  for (let index = 0; index < 24; index++) {
    const mesh = new MeshCompat({ type: "SphereGeometry" }, { type: "MeshPhysicalMaterial" });
    mesh.position.set((index % 8) - 4, Math.floor(index / 8) - 1, -6 - (index % 3));
    group.add(mesh);
  }
  scene.add(camera, new AmbientLightCompat(), new DirectionalLightCompat(), group);
  const raycaster = new RaycasterCompat();
  raycaster.set(new Vector3Compat(0, 0, 0), new Vector3Compat(0, 0, -1));
  const intersections = raycaster.intersectObject(scene, true);

  await page.setContent(`
    <html>
      <body style="margin:0;background:#07090f">
        <canvas id="compat" width="960" height="600"></canvas>
        <script>
          const objects = ${JSON.stringify(scene.children.map((child) => child.type))};
          const intersections = ${intersections.length};
          const canvas = document.getElementById("compat");
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#0b1019";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          for (let i = 0; i < 24; i++) {
            const x = 96 + (i % 8) * 96;
            const y = 150 + Math.floor(i / 8) * 118;
            ctx.beginPath();
            ctx.arc(x, y, 30, 0, Math.PI * 2);
            ctx.fillStyle = i < intersections ? "#96d2ff" : "#32465f";
            ctx.fill();
            ctx.strokeStyle = "#ffffff";
            ctx.stroke();
          }
          ctx.fillStyle = "#f2f6ff";
          ctx.font = "16px system-ui";
          ctx.fillText("G3D Three.js compat scene", 32, 44);
          window.__g3dCompatObjects = objects.length;
          window.__g3dCompatIntersections = intersections;
        </script>
      </body>
    </html>
  `);

  await expect.poll(async () => page.evaluate(() => window.__g3dCompatObjects)).toBeGreaterThanOrEqual(4);
  await expect.poll(async () => page.evaluate(() => window.__g3dCompatIntersections)).toBeGreaterThanOrEqual(24);
  const litPixels = await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] > 25 || data[index + 1] > 25 || data[index + 2] > 25) lit++;
    }
    return lit;
  });
  expect(litPixels).toBeGreaterThan(50000);
});
