import { test, expect } from "@playwright/test";
import { ShaderMaterialThreeCompat } from "../../packages/rendering/src";

test("ThreeCompat shader lab renders custom shader material and diagnostics", async ({ page }) => {
  const material = new ShaderMaterialThreeCompat(
    "void main() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); }",
    "precision highp float; out vec4 fragColor; void main() { fragColor = vec4(0.2, 0.7, 1.0, 1.0); }"
  ).setUniform("uTime", 2).setUniform("uIntensity", 0.85);
  const diagnostics = material.diagnose();

  await page.setContent(`
    <html><body style="margin:0;background:#07090f"><canvas width="960" height="540"></canvas><script>
    const diagnostics = ${JSON.stringify(diagnostics)};
    const uniforms = ${JSON.stringify(material.uniforms.entries())};
    const canvas = document.querySelector("canvas"), ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0,0,960,540);
    gradient.addColorStop(0, diagnostics.pass ? "#102340" : "#401020");
    gradient.addColorStop(1, "#1f88d2");
    ctx.fillStyle = gradient; ctx.fillRect(0,0,960,540);
    for(let i=0;i<48;i++){ctx.fillStyle="hsl("+(190+i*4)+",70%,56%)";ctx.fillRect(40+(i%12)*74,120+Math.floor(i/12)*76,46,46);}
    ctx.fillStyle="#eef6ff";ctx.font="18px system-ui";ctx.fillText("Shader diagnostics: "+diagnostics.pass,36,48);ctx.fillText("Uniforms: "+uniforms.length,36,78);
    window.__a3dShaderPass = diagnostics.pass;
    window.__a3dUniformCount = uniforms.length;
    </script></body></html>
  `);

  await expect.poll(async () => page.evaluate(() => window.__a3dShaderPass)).toBe(true);
  await expect.poll(async () => page.evaluate(() => window.__a3dUniformCount)).toBe(2);
  const litPixels = await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] > 25 || data[index + 1] > 25 || data[index + 2] > 25) lit++;
    }
    return lit;
  });
  expect(litPixels).toBeGreaterThan(160000);
});
