import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test.setTimeout(60_000);

test("Aura3D mini game screenshot shows a readable playable scene", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 45_000 }).toBe("true");

  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(550);
  await page.keyboard.up("ArrowRight");

  const state = await page.evaluate(() =>
    (window as unknown as {
      readonly __AURA3D_MINI_GAME__?: {
        readonly score: number;
        readonly look?: { readonly id: string };
        readonly player: { readonly x: number };
      };
    }).__AURA3D_MINI_GAME__
  );
  expect(state?.player.x ?? 0).toBeGreaterThan(0.8);
  expect(state?.look?.id).toBe("outdoor-day");

  const canvas = page.locator("canvas");
  const profile = await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    const gl = target.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) return { error: "missing-webgl2", brightPixels: 0, warmPixels: 0, uniqueBuckets: 0 };
    const pixels = new Uint8Array(target.width * target.height * 4);
    gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const buckets = new Set<string>();
    let brightPixels = 0;
    let warmPixels = 0;
    for (let y = 0; y < target.height; y += 4) {
      for (let x = 0; x < target.width; x += 4) {
        const offset = (y * target.width + x) * 4;
        const r = pixels[offset] ?? 0;
        const g = pixels[offset + 1] ?? 0;
        const b = pixels[offset + 2] ?? 0;
        const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
        if (luminance > 30) {
          brightPixels += 1;
          buckets.add(`${r >> 5}-${g >> 5}-${b >> 5}`);
        }
        if (r > 130 && g > 105 && b < 155 && r >= g * 0.9) warmPixels += 1;
      }
    }
    return { brightPixels, warmPixels, uniqueBuckets: buckets.size };
  });

  // Subject coverage: the hero + level geometry must occupy a visible frame
  // region (regression/hygiene gate, not a quality claim). Pixels were
  // sampled on a 4px stride, so multiply back to a full-frame fraction.
  const bbox = await canvas.boundingBox();
  const canvasPixels = await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    return target.width * target.height;
  });
  const nonBlank = (profile.brightPixels * 16) / Math.max(1, canvasPixels);
  const screenshot = await page.screenshot({ fullPage: false });
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/screenshot.png"), screenshot);
  writeFileSync(resolve("tests/reports/screenshot.json"), `${JSON.stringify({ bytes: screenshot.byteLength, profile, nonBlank, bbox, state }, null, 2)}\n`);

  expect(profile.error).toBeUndefined();
  expect(profile.brightPixels).toBeGreaterThan(900);
  expect(profile.warmPixels).toBeGreaterThan(10);
  expect(profile.uniqueBuckets).toBeGreaterThan(10);
  expect(nonBlank).toBeGreaterThan(0.02);
  expect(screenshot.byteLength).toBeGreaterThan(1000);
});
