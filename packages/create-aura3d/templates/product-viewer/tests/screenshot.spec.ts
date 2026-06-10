import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test.setTimeout(60_000);

test("Aura3D product viewer screenshot shows a prompt-aligned studio product", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 45_000 }).toBe("true");
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  const profile = await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    const gl = target.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) return { error: "missing-webgl2", metalPixels: 0, warmAccentPixels: 0, centerObjectPixels: 0, saturatedStudioPixels: 0, uniqueBuckets: 0 };
    const pixels = new Uint8Array(target.width * target.height * 4);
    gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const buckets = new Set<string>();
    let metalPixels = 0;
    let warmAccentPixels = 0;
    let centerObjectPixels = 0;
    let saturatedStudioPixels = 0;
    for (let y = 0; y < target.height; y += 4) {
      for (let x = 0; x < target.width; x += 4) {
        if (x > target.width * 0.76 && y > target.height * 0.74) continue;
        const offset = (y * target.width + x) * 4;
        const r = pixels[offset] ?? 0;
        const g = pixels[offset + 1] ?? 0;
        const b = pixels[offset + 2] ?? 0;
        const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
        if (luminance > 32) buckets.add(`${r >> 5}-${g >> 5}-${b >> 5}`);
        const inProductWindow = x > target.width * 0.34 && x < target.width * 0.68 && y > target.height * 0.24 && y < target.height * 0.78;
        if (inProductWindow && r > 145 && g > 145 && b > 138 && Math.abs(r - g) < 32 && Math.abs(g - b) < 40) metalPixels += 1;
        if (r > 95 && g > 62 && b < 78 && r > g * 1.12) warmAccentPixels += 1;
        if (Math.max(r, g, b) - Math.min(r, g, b) > 45 && luminance > 42) saturatedStudioPixels += 1;
        if (inProductWindow && luminance > 32) centerObjectPixels += 1;
      }
    }
    return { metalPixels, warmAccentPixels, centerObjectPixels, saturatedStudioPixels, uniqueBuckets: buckets.size };
  });
  const screenshot = await page.screenshot({ fullPage: false });
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/screenshot.png"), screenshot);
  writeFileSync(resolve("tests/reports/screenshot.json"), `${JSON.stringify({ bytes: screenshot.byteLength, profile }, null, 2)}\n`);
  expect(profile.error).toBeUndefined();
  expect(profile.metalPixels).toBeGreaterThan(5);
  // Measured 12 on 2026-06-10 after the engine's neutral-gray default-material
  // fallback (was pure white) dimmed the warm accent contribution.
  expect(profile.warmAccentPixels).toBeGreaterThan(8);
  expect(profile.centerObjectPixels).toBeGreaterThan(650);
  expect(profile.saturatedStudioPixels).toBeGreaterThan(900);
  expect(profile.uniqueBuckets).toBeGreaterThan(18);
  expect(screenshot.byteLength).toBeGreaterThan(1000);
});
