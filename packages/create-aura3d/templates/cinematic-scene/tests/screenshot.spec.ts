import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test.setTimeout(60_000);

test("Aura3D cinematic scene screenshot shows the rainy neon hero prompt", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 45_000 }).toBe("true");
  const canvas = page.locator("canvas");
  const profile = await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    const gl = target.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) return { error: "missing-webgl2", cyanPixels: 0, amberPixels: 0, rainPixels: 0, wetReflectionPixels: 0, centerHeroPixels: 0, darkAlleyPixels: 0, uniqueBuckets: 0 };
    const pixels = new Uint8Array(target.width * target.height * 4);
    gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const buckets = new Set<string>();
    let cyanPixels = 0;
    let amberPixels = 0;
    let rainPixels = 0;
    let wetReflectionPixels = 0;
    let centerHeroPixels = 0;
    let darkAlleyPixels = 0;
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
        if (y < target.height * 0.36 && ((b > 95 && g > 65 && b > r * 1.12) || (r > 105 && g > 62 && b < 95))) wetReflectionPixels += 1;
        if (x > target.width * 0.32 && x < target.width * 0.68 && y > target.height * 0.26 && y < target.height * 0.78 && luminance > 75) centerHeroPixels += 1;
        if (luminance > 8 && luminance < 36 && b >= r && x > target.width * 0.08 && x < target.width * 0.92) darkAlleyPixels += 1;
      }
    }
    return { cyanPixels, amberPixels, rainPixels, wetReflectionPixels, centerHeroPixels, darkAlleyPixels, uniqueBuckets: buckets.size };
  });
  const screenshot = await page.screenshot({ fullPage: false });
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/screenshot.png"), screenshot);
  writeFileSync(resolve("tests/reports/screenshot.json"), `${JSON.stringify({ bytes: screenshot.byteLength, profile }, null, 2)}\n`);
  expect(profile.error).toBeUndefined();
  expect(profile.cyanPixels).toBeGreaterThan(320);
  expect(profile.amberPixels).toBeGreaterThan(20);
  expect(profile.rainPixels).toBeGreaterThan(90);
  expect(profile.wetReflectionPixels).toBeGreaterThan(60);
  expect(profile.centerHeroPixels).toBeGreaterThan(600);
  // Measured 174 on 2026-06-10 after engine lighting/material updates (neutral-gray
  // default fallback, bloom retune) brightened the alley floor slightly.
  expect(profile.darkAlleyPixels).toBeGreaterThan(150);
  expect(profile.uniqueBuckets).toBeGreaterThan(22);
  expect(screenshot.byteLength).toBeGreaterThan(1000);
});
