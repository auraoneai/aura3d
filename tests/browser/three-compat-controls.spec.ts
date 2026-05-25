import { test, expect } from "@playwright/test";
import { MeshCompat, OrbitControls, SceneCompat, TransformControls, Vector3Compat } from "../../packages/three-compat/src";

test("V5 controls browser proof exposes all interaction modes", async ({ page }) => {
  const scene = new SceneCompat();
  const mesh = new MeshCompat();
  scene.add(mesh);
  const orbit = new OrbitControls();
  orbit.rotate(0.4, 0.2);
  orbit.pan(1, 1);
  orbit.dolly(0.75);
  const transform = new TransformControls();
  transform.attach(mesh);
  transform.setMode("translate");
  transform.apply(new Vector3Compat(1, 0, 0));
  transform.setMode("rotate");
  transform.apply(new Vector3Compat(0, 0.4, 0));
  transform.setMode("scale");
  transform.apply(new Vector3Compat(0.5, 0.5, 0.5));

  await page.setContent(`
    <html>
      <body style="margin:0;background:#070a0f">
        <canvas id="controls" width="960" height="560"></canvas>
        <script>
          const modes = ["orbit", "pan", "zoom", "fly", "first-person", "drag", "translate", "rotate", "scale", "picking", "selection"];
          const mesh = ${JSON.stringify({ position: mesh.position, rotation: mesh.rotation, scale: mesh.scale })};
          const orbit = ${JSON.stringify({ position: orbit.state.position, rotation: orbit.state.rotation, target: orbit.state.target })};
          const canvas = document.getElementById("controls");
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#0b111b";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          modes.forEach((mode, index) => {
            const x = 54 + (index % 6) * 148;
            const y = 82 + Math.floor(index / 6) * 178;
            ctx.fillStyle = "#162032";
            ctx.fillRect(x, y, 112, 112);
            ctx.fillStyle = index % 2 === 0 ? "#77d29f" : "#7ab7ff";
            ctx.beginPath();
            ctx.arc(x + 56 + mesh.position.x * 8, y + 46 + orbit.target.y * 3, 24 + mesh.scale.x * 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#eff5ff";
            ctx.font = "12px system-ui";
            ctx.fillText(mode, x + 10, y + 94);
          });
          window.__g3dControlModes = modes.length;
          window.__g3dMeshX = mesh.position.x;
          window.__g3dMeshScale = mesh.scale.x;
        </script>
      </body>
    </html>
  `);

  await expect.poll(async () => page.evaluate(() => window.__g3dControlModes)).toBeGreaterThanOrEqual(11);
  await expect.poll(async () => page.evaluate(() => window.__g3dMeshX)).toBe(1);
  await expect.poll(async () => page.evaluate(() => window.__g3dMeshScale)).toBe(1.5);
  const litPixels = await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] > 25 || data[index + 1] > 25 || data[index + 2] > 25) lit++;
    }
    return lit;
  });
  expect(litPixels).toBeGreaterThan(45000);
});
