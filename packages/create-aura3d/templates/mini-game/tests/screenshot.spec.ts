import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("Aura3D mini game screenshot shows a playable collect-and-dodge scene", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 15_000 }).toBe("true");
  const canvas = page.locator("canvas");
  const profile = await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    const gl = target.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) return { error: "missing-webgl2", robotArmorPixels: 0, robotJointPixels: 0, boostPixels: 0, coinPixels: 0, hazardPixels: 0, portalPixels: 0, cyanTrailPixels: 0, arenaPixels: 0, uniqueBuckets: 0 };
    const pixels = new Uint8Array(target.width * target.height * 4);
    gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const buckets = new Set<string>();
    let robotArmorPixels = 0;
    let robotJointPixels = 0;
    let boostPixels = 0;
    let coinPixels = 0;
    let hazardPixels = 0;
    let portalPixels = 0;
    let cyanTrailPixels = 0;
    let arenaPixels = 0;
    for (let y = 0; y < target.height; y += 4) {
      for (let x = 0; x < target.width; x += 4) {
        if (x > target.width * 0.76 && y > target.height * 0.74) continue;
        const offset = (y * target.width + x) * 4;
        const r = pixels[offset] ?? 0;
        const g = pixels[offset + 1] ?? 0;
        const b = pixels[offset + 2] ?? 0;
        const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
        if (luminance > 32) buckets.add(`${r >> 5}-${g >> 5}-${b >> 5}`);
        const inPlayerWindow = x > target.width * 0.2 && x < target.width * 0.42 && y > target.height * 0.34 && y < target.height * 0.7;
        if (inPlayerWindow && r > 120 && g > 118 && b > 86 && Math.abs(r - g) < 70) robotArmorPixels += 1;
        if (inPlayerWindow && r < 95 && g < 115 && b < 125 && luminance > 18) robotJointPixels += 1;
        if (inPlayerWindow && r > 150 && g > 80 && b < 82) boostPixels += 1;
        if (r > 170 && g > 130 && b < 110) coinPixels += 1;
        if (r > 165 && g < 125 && b < 145) hazardPixels += 1;
        if (r > 165 && g > 95 && b < 125) portalPixels += 1;
        if (g > 140 && b > 150 && r < 150) cyanTrailPixels += 1;
        if (g > 42 && b > 50 && b > r * 1.08 && luminance > 24 && luminance < 100) arenaPixels += 1;
      }
    }
    return { robotArmorPixels, robotJointPixels, boostPixels, coinPixels, hazardPixels, portalPixels, cyanTrailPixels, arenaPixels, uniqueBuckets: buckets.size };
  });
  const screenshot = await page.screenshot({ fullPage: false });
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/screenshot.png"), screenshot);
  writeFileSync(resolve("tests/reports/screenshot.json"), `${JSON.stringify({ bytes: screenshot.byteLength, profile }, null, 2)}\n`);
  expect(profile.error).toBeUndefined();
  expect(profile.robotArmorPixels).toBeGreaterThan(90);
  expect(profile.robotJointPixels).toBeGreaterThan(18);
  expect(profile.boostPixels).toBeGreaterThan(8);
  expect(profile.coinPixels).toBeGreaterThan(35);
  expect(profile.hazardPixels).toBeGreaterThan(45);
  expect(profile.portalPixels).toBeGreaterThan(45);
  expect(profile.cyanTrailPixels).toBeGreaterThan(90);
  expect(profile.arenaPixels).toBeGreaterThan(600);
  expect(profile.uniqueBuckets).toBeGreaterThan(22);
  expect(screenshot.byteLength).toBeGreaterThan(1000);
});
