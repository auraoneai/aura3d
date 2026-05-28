import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("Aura3D cinematic scene screenshot is non-empty", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready")).toBe("true");
  const canvas = page.locator("canvas");
  const profile = await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    const gl = target.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) return { error: "missing-webgl2", cyanPixels: 0, amberPixels: 0, rainPixels: 0, centerHeroPixels: 0, uniqueBuckets: 0 };
    const pixels = new Uint8Array(target.width * target.height * 4);
    gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const buckets = new Set<string>();
    let cyanPixels = 0;
    let amberPixels = 0;
    let rainPixels = 0;
    let centerHeroPixels = 0;
    for (let y = 0; y < target.height; y += 4) {
      for (let x = 0; x < target.width; x += 4) {
        if (x > target.width * 0.76 && y > target.height * 0.74) continue;
        const offset = (y * target.width + x) * 4;
        const r = pixels[offset] ?? 0;
        const g = pixels[offset + 1] ?? 0;
        const b = pixels[offset + 2] ?? 0;
        const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
        if (luminance > 30) buckets.add(`${r >> 5}-${g >> 5}-${b >> 5}`);
        if (b > 110 && g > 90 && b > r * 1.22) cyanPixels += 1;
        if (r > 160 && g > 105 && b < 125) amberPixels += 1;
        if (r > 165 && g > 185 && b > 205) rainPixels += 1;
        if (x > target.width * 0.35 && x < target.width * 0.66 && y > target.height * 0.32 && y < target.height * 0.76 && luminance > 85) centerHeroPixels += 1;
      }
    }
    return { cyanPixels, amberPixels, rainPixels, centerHeroPixels, uniqueBuckets: buckets.size };
  });
  expect(profile.error).toBeUndefined();
  expect(profile.cyanPixels).toBeGreaterThan(220);
  expect(profile.amberPixels).toBeGreaterThan(8);
  expect(profile.rainPixels).toBeGreaterThan(70);
  expect(profile.centerHeroPixels).toBeGreaterThan(420);
  expect(profile.uniqueBuckets).toBeGreaterThan(18);
  const screenshot = await canvas.screenshot();
  expect(screenshot.byteLength).toBeGreaterThan(1000);
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/screenshot.png"), screenshot);
  writeFileSync(resolve("tests/reports/screenshot.json"), `${JSON.stringify({ bytes: screenshot.byteLength, profile }, null, 2)}\n`);
});
