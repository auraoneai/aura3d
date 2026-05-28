import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("Aura3D mini game screenshot is non-empty", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready")).toBe("true");
  const canvas = page.locator("canvas");
  const profile = await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    const gl = target.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) return { error: "missing-webgl2", limePixels: 0, goldPixels: 0, redPixels: 0, orangePixels: 0, cyanPixels: 0, uniqueBuckets: 0 };
    const pixels = new Uint8Array(target.width * target.height * 4);
    gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const buckets = new Set<string>();
    let limePixels = 0;
    let goldPixels = 0;
    let redPixels = 0;
    let orangePixels = 0;
    let cyanPixels = 0;
    for (let y = 0; y < target.height; y += 4) {
      for (let x = 0; x < target.width; x += 4) {
        if (x > target.width * 0.76 && y > target.height * 0.74) continue;
        const offset = (y * target.width + x) * 4;
        const r = pixels[offset] ?? 0;
        const g = pixels[offset + 1] ?? 0;
        const b = pixels[offset + 2] ?? 0;
        const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
        if (luminance > 32) buckets.add(`${r >> 5}-${g >> 5}-${b >> 5}`);
        if (g > 160 && r > 110 && b < 150) limePixels += 1;
        if (r > 170 && g > 130 && b < 110) goldPixels += 1;
        if (r > 165 && g < 150 && b < 165) redPixels += 1;
        if (r > 165 && g > 105 && b < 135) orangePixels += 1;
        if (g > 145 && b > 150 && r < 145) cyanPixels += 1;
      }
    }
    return { limePixels, goldPixels, redPixels, orangePixels, cyanPixels, uniqueBuckets: buckets.size };
  });
  expect(profile.error).toBeUndefined();
  expect(profile.limePixels).toBeGreaterThan(45);
  expect(profile.goldPixels).toBeGreaterThan(25);
  expect(profile.redPixels).toBeGreaterThan(35);
  expect(profile.orangePixels).toBeGreaterThan(40);
  expect(profile.cyanPixels).toBeGreaterThan(80);
  expect(profile.uniqueBuckets).toBeGreaterThan(18);
  const screenshot = await canvas.screenshot();
  expect(screenshot.byteLength).toBeGreaterThan(1000);
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/screenshot.png"), screenshot);
  writeFileSync(resolve("tests/reports/screenshot.json"), `${JSON.stringify({ bytes: screenshot.byteLength, profile }, null, 2)}\n`);
});
