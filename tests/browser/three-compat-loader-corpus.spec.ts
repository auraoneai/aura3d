import { test, expect } from "@playwright/test";
import { ThreeCompatGLTFLoader, HDRLoaderThreeCompat, KTX2LoaderThreeCompat, OBJLoaderThreeCompat, TextureLoaderThreeCompat } from "../../packages/assets/src";

test("three-compat loader corpus browser proof renders loader diagnostics", async ({ page }) => {
  const diagnostics = [
    new ThreeCompatGLTFLoader().load("fixtures/asset-corpus/damaged-helmet.glb").diagnostic,
    new OBJLoaderThreeCompat().load("fixtures/three-compat/loaders/sample.obj").diagnostic,
    new HDRLoaderThreeCompat().load("fixtures/environment-corpus/hdri/studio_small_08_1k.hdr"),
    new KTX2LoaderThreeCompat().load("tests/assets/corpus/ktx2/Rib_N.ktx2"),
    new TextureLoaderThreeCompat().load("fixtures/external-parity-assets/product/external-parity-product-speaker/screenshot-baseline.svg")
  ];

  await page.setContent(`
    <html>
      <body style="margin:0;background:#070a0f">
        <canvas id="loaders" width="960" height="520"></canvas>
        <script>
          const diagnostics = ${JSON.stringify(diagnostics)};
          const canvas = document.getElementById("loaders");
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#0b111b";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          diagnostics.forEach((diagnostic, index) => {
            const x = 40;
            const y = 40 + index * 86;
            const width = Math.max(90, Math.min(820, diagnostic.bytes / 3000));
            ctx.fillStyle = diagnostic.status === "loaded" ? "#4fb782" : "#b7574f";
            ctx.fillRect(x, y, width, 42);
            ctx.fillStyle = "#eaf2ff";
            ctx.font = "14px system-ui";
            ctx.fillText(diagnostic.loader + " " + diagnostic.status + " " + diagnostic.bytes + " bytes", x + 12, y + 27);
          });
          window.__a3dLoaderDiagnostics = diagnostics.length;
          window.__a3dLoadedDiagnostics = diagnostics.filter((diagnostic) => diagnostic.status === "loaded").length;
        </script>
      </body>
    </html>
  `);

  await expect.poll(async () => page.evaluate(() => window.__a3dLoaderDiagnostics)).toBe(5);
  await expect.poll(async () => page.evaluate(() => window.__a3dLoadedDiagnostics)).toBe(5);
  const litPixels = await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] > 25 || data[index + 1] > 25 || data[index + 2] > 25) lit++;
    }
    return lit;
  });
  expect(litPixels).toBeGreaterThan(25000);
});
