import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

interface Rgb { readonly r: number; readonly g: number; readonly b: number }
interface R { readonly id: string; readonly center: Rgb; readonly corner: Rgb; readonly lit: number; readonly extra?: { warnings?: string[]; errors?: number; drawCalls?: number } }

/**
 * Expected pixel behaviour per case. Output is identity tone-mapped but still sRGB-encoded, so a linear 0.5 reads ~188 and a
 * linear 0.25 reads ~137. `lit` = pixels with channel sum > 30 on the 320x240 frame. The 20-unit sphere is viewed from OUTSIDE
 * (camera at y=40), so `front` and `back` both show red at the centre (near face vs far inner face) and only `double` fills
 * the same silhouette; the 900 and 3400 spheres surround the camera (far plane 4200).
 */
const srgb = (linear: number) => Math.round(255 * (linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055));
const near = (value: number, expected: number, tol = 6) => Math.abs(value - expected) <= tol;
const EXPECT: Record<string, (r: R) => boolean> = {
  "opaque-red": (r) => r.center.r > 250 && r.center.g < 10,
  "alpha-half-red": (r) => near(r.center.r, srgb(0.5)) && r.center.g < 10,
  "additive-grey": (r) => near(r.center.r, srgb(0.5)) && near(r.center.g, srgb(0.5)),
  "additive-grey-alpha-half": (r) => near(r.center.r, srgb(0.25)),
  "alpha-over-opaque-green": (r) => near(r.center.r, srgb(0.5)) && near(r.center.g, srgb(0.5)) && r.center.b < 10,
  // depthWrite:false on an opaque nearer quad: the later, farther green quad is NOT depth-rejected, so green wins.
  "depthwrite-off-opaque-behind": (r) => r.center.g > 250 && r.center.r < 10,
  "unused-uniforms-red": (r) => r.center.r > 250 && r.center.g < 10,
  "sky-back-20": (r) => r.center.r > 250 && r.corner.r < 10,
  "sky-double-20": (r) => r.center.r > 250 && r.corner.r < 10,
  "sky-front-20": (r) => r.center.r > 250 && r.corner.r < 10,
  "sky-back-900": (r) => r.center.r > 250 && r.corner.r > 250,
  "sky-double-900": (r) => r.center.r > 250 && r.corner.r > 250,
  "sky-front-900": (r) => r.lit === 0,
  "sky-back-3400": (r) => r.center.r > 250 && r.corner.r > 250,
  "sky-double-3400": (r) => r.center.r > 250 && r.corner.r > 250,
  "sky-front-3400": (r) => r.lit === 0,
  "sky-back-3400-moved-to-eye": (r) => r.center.r > 250 && r.corner.r > 250,
  "sky-back-900-uniforms-heavy": (r) => r.center.r > 250 && r.corner.r > 250,
  "additive-cone-primitive": (r) => r.lit > 500,
  "beam-amount-0": (r) => r.lit === 0,
  "beam-amount-1-initial": (r) => r.lit > 500,
  "beam-amount-0-then-setUniform-1": (r) => r.lit > 500
};

test.describe("material.custom draw probe matrix", () => {
  test.setTimeout(600_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("every case draws what its render state says", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.goto(`${server.origin}/examples/custom-draw-probe/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as unknown as { __CDP_READY__?: boolean }).__CDP_READY__ === true, undefined, { timeout: 120_000 });
    const ids = await page.evaluate(() => (window as unknown as { __CDP__: { ids: string[] } }).__CDP__.ids);
    const results: R[] = [];
    for (const id of ids) {
      const r = (await page.evaluate(`window.__CDP__.run(${JSON.stringify(id)})`)) as R;
      results.push(r);
      const ok = EXPECT[id]?.(r) ?? false;
      console.log(`CDP_RESULT ${ok ? "OK  " : "FAIL"} ${JSON.stringify(r)}`);
    }
    console.log(`CDP_SUMMARY ${JSON.stringify(results.map((r) => ({ id: r.id, ok: EXPECT[r.id]?.(r) ?? false })))}`);
    for (const r of results) expect.soft(EXPECT[r.id]?.(r) ?? false, `${r.id}: ${JSON.stringify(r)}`).toBe(true);
    expect(pageErrors).toEqual([]);
  });
});
