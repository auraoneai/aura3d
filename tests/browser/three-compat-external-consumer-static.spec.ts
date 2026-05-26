import { test, expect } from "@playwright/test";

test("V5 external consumer static preview renders built output", async ({ page }) => {
  await page.goto(`file://${process.cwd()}/tests/reports/three-compat-external-consumer/static-preview/index.html`);
  await expect.poll(async () => page.evaluate(() => window.__a3dStaticPreview)).toBe(true);
  await page.screenshot({ path: "tests/reports/three-compat-external-consumer/static-preview.png" });
  const litPixels = await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let index = 0; index < data.length; index += 4) if (data[index] > 25 || data[index + 1] > 25 || data[index + 2] > 25) lit++;
    return lit;
  });
  expect(litPixels).toBeGreaterThan(50000);
});
