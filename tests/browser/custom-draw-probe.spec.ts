import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

interface Rgb { readonly r: number; readonly g: number; readonly b: number }
interface R { readonly id: string; readonly center: Rgb; readonly corner: Rgb; readonly lit: number; readonly grid: number[]; readonly extra?: { warnings?: string[]; errors?: number; drawCalls?: number } }

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
  "beam-amount-0-then-setUniform-1": (r) => r.lit > 500,
  // port-condition beam cases are judged pairwise below (lamp on must differ from lamp off); a0 only has to render without error
  // an additive transparent draw must survive the bloom + FXAA post chain
  "additive-quad-bloomaa": (r) => r.lit > 500
};
const BISECT = ["orig", "vert-no-normal", "frag-amount-only", "frag-uv-only", "frag-road-only", "frag-near-only", "frag-facing-only", "frag-orig-fixed-camera", "frag-vN-debug", "frag-vT-debug"];
for (const v of BISECT) EXPECT[`port-bisect-${v}`] = (r) => r.lit > 500;
const GEOM = ["full", "no-normals", "no-uvs", "no-indices", "u16-indices", "positions-only", "full-nocull", "full-opaque", "triangle"];
for (const v of GEOM) EXPECT[`port-geom-${v}`] = (r) => r.lit > 500;
const PCAM = ["front-tri-custom", "front-tri-default", "lookplusz-origin-tri-custom", "far-tri-custom", "far-tri-default", "far-quad-default", "offset-lookminusz-tri-custom", "far-pbr-box"];
for (const v of PCAM) EXPECT[`pcam-${v}`] = (r) => r.lit > 200;
// Before the fix a custom VERTEX stage ignored the camera (identity view/projection): the same triangle filled ~61k of 76.8k pixels and
// vanished for any camera away from the origin. With the camera applied it must look like the default-vertex triangle (~8.5k pixels).
EXPECT["pcam-front-tri-custom"] = (r) => r.lit > 5000 && r.lit < 15000;
// fov 56 here vs 40 for `front`: the same triangle covers (tan20/tan28)^2 of the area, about 4.0k pixels
EXPECT["pcam-lookplusz-origin-tri-custom"] = (r) => r.lit > 3000 && r.lit < 6000;
EXPECT["pcam-front-tri-default"] = (r) => r.lit > 5000 && r.lit < 15000;
EXPECT["pcam-far-quad-default"] = (r) => r.lit > 100;
const PORT_VARIANTS = ["plain", "bloomaa", "lights", "neutral", "update", "full"];
for (const v of PORT_VARIANTS) EXPECT[`port-beam-${v}-a0`] = () => true;
for (const v of PORT_VARIANTS) EXPECT[`port-beam-${v}-a1`] = () => true;
/** Largest per-cell luma difference between lamp-on and lamp-off frames (16x12 grid). */
const gridDiff = (a: R, b: R) => Math.max(...a.grid.map((value, i) => Math.abs(value - (b.grid[i] ?? 0))));

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
    const byId = new Map(results.map((r) => [r.id, r] as const));
    for (const v of PORT_VARIANTS) {
      const off = byId.get(`port-beam-${v}-a0`)!, on = byId.get(`port-beam-${v}-a1`)!;
      const d = gridDiff(on, off);
      console.log(`CDP_PAIR port-beam-${v} maxCellLumaDiff=${d} litOff=${off.lit} litOn=${on.lit} warnOn=${JSON.stringify(on.extra?.warnings ?? [])} errOn=${on.extra?.errors} callsOff=${off.extra?.drawCalls} callsOn=${on.extra?.drawCalls}`);
      expect.soft(d, `port-beam-${v}: lamp-on frame must differ from lamp-off`).toBeGreaterThan(8);
    }
    for (const r of results) expect.soft(EXPECT[r.id]?.(r) ?? false, `${r.id}: ${JSON.stringify(r)}`).toBe(true);
    expect(pageErrors).toEqual([]);
  });
});
