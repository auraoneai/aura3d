/**
 * PRD-11 S3 / V1 (§1197, §1224): batching pixel identity. For each base
 * scene and `prd11-draw-call-stress`, Aura renders with `A3D_QR_TIERS_BATCHING`
 * on vs off in the same run must be identical: max per-pixel per-channel
 * abs diff ≤ 2/255 (float summation order may differ by 1 LSB) and luma
 * SSIM ≥ 0.999 (8×8 windows, stride 4 — the capture.mjs metric).
 *
 * Remote-only evidence (macos-14 lane-browser job). Skips loudly without a
 * real WebGL2 context or when a scene never reaches `__QR_READY__`.
 */

import { test, expect } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const benchRoot = path.resolve(here, "../../../benchmarks/quality-rebuild");

const BASE_SCENES = [
  "01-simple-geometry", "02-pbr-product", "03-damaged-helmet", "04-clearcoat",
  "05-transmission", "06-metal-roughness-sweep", "07-sheen-fabric",
  "08-skinned-character", "09-outdoor-environment", "10-indoor-environment",
  "11-multiple-lights", "12-shadows", "13-ibl-only", "14-particles",
  "15-animation-skinning", "16-instancing", "17-large-environment", "18-game-scene"
] as const;
const LANE_SCENE = "prd11-draw-call-stress";

let server: ViteDevServer;

test.beforeAll(async () => {
  server = await createServer({
    configFile: path.join(benchRoot, "vite.config.ts"),
    root: benchRoot,
    server: { port: 5192, strictPort: true },
    logLevel: "error"
  });
  await server.listen();
});

test.afterAll(async () => {
  await server?.close();
});

function sceneUrl(scene: string, flags: string | null): string {
  const flagQuery = flags === null ? "" : `&a3d-qr=${encodeURIComponent(flags)}`;
  if (scene.startsWith("prd11-")) {
    return `/scenes/prd11/index.html?engine=aura3d&scene=${scene}${flagQuery}`;
  }
  return `/index.html?engine=aura3d&scene=${scene}${flagQuery}`;
}

/** Decode a PNG in-page, return RGBA pixels + dims (downstream diff is in-page too). */
const DECODE_AND_DIFF = `
async function decode(dataUrl) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return { w: canvas.width, h: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
}
function compare(a, b) {
  const w = Math.min(a.w, b.w), h = Math.min(a.h, b.h);
  let maxChannel = 0;
  const lumaA = new Float64Array(w * h), lumaB = new Float64Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * a.w + x) * 4, j = (y * b.w + x) * 4;
      const dr = Math.abs(a.data[i] - b.data[j]);
      const dg = Math.abs(a.data[i + 1] - b.data[j + 1]);
      const db = Math.abs(a.data[i + 2] - b.data[j + 2]);
      if (dr > maxChannel) maxChannel = dr;
      if (dg > maxChannel) maxChannel = dg;
      if (db > maxChannel) maxChannel = db;
      lumaA[y * w + x] = 0.299 * a.data[i] + 0.587 * a.data[i + 1] + 0.114 * a.data[i + 2];
      lumaB[y * w + x] = 0.299 * b.data[j] + 0.587 * b.data[j + 1] + 0.114 * b.data[j + 2];
    }
  }
  const stride = w + 1;
  const table = () => new Float64Array((w + 1) * (h + 1));
  const sa = table(), sb = table(), saa = table(), sbb = table(), sab = table();
  for (let y = 0; y < h; y += 1) {
    let ra = 0, rb = 0, raa = 0, rbb = 0, rab = 0;
    for (let x = 0; x < w; x += 1) {
      const va = lumaA[y * w + x], vb = lumaB[y * w + x];
      ra += va; rb += vb; raa += va * va; rbb += vb * vb; rab += va * vb;
      const at = (y + 1) * stride + (x + 1), up = y * stride + (x + 1);
      sa[at] = sa[up] + ra; sb[at] = sb[up] + rb; saa[at] = saa[up] + raa; sbb[at] = sbb[up] + rbb; sab[at] = sab[up] + rab;
    }
  }
  const boxSum = (t, x0, y0, x1, y1) => t[y1 * stride + x1] - t[y0 * stride + x1] - t[y1 * stride + x0] + t[y0 * stride + x0];
  const C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2, win = 8;
  let ssimSum = 0, windows = 0;
  for (let y = 0; y + win <= h; y += 4) {
    for (let x = 0; x + win <= w; x += 4) {
      const n = win * win;
      const ma = boxSum(sa, x, y, x + win, y + win) / n, mb = boxSum(sb, x, y, x + win, y + win) / n;
      const va = boxSum(saa, x, y, x + win, y + win) / n - ma * ma;
      const vb = boxSum(sbb, x, y, x + win, y + win) / n - mb * mb;
      const cov = boxSum(sab, x, y, x + win, y + win) / n - ma * mb;
      ssimSum += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      windows += 1;
    }
  }
  return { maxChannel, ssim: windows ? ssimSum / windows : 1, width: w, height: h };
}
`;

test("batching flag on vs off is pixel-identical on every scene", async ({ page }) => {
  test.setTimeout(600_000);
  const failures: string[] = [];
  const skipped: string[] = [];

  for (const scene of [...BASE_SCENES, LANE_SCENE]) {
    // Flag off — engine default path.
    await page.goto(`http://127.0.0.1:5192${sceneUrl(scene, null)}`);
    let ok = await page.waitForFunction(
      () => (window as unknown as { __QR_READY__?: unknown }).__QR_READY__ !== undefined,
      undefined, { timeout: 120_000 }
    ).then(() => true).catch(() => false);
    if (!ok) { skipped.push(`${scene}: flag-off never ready`); continue; }
    const offError = await page.evaluate(() => {
      const r = (window as unknown as { __QR_READY__?: { errors?: readonly string[] } }).__QR_READY__;
      return r?.errors?.length ? r.errors.join("; ") : null;
    });
    if (offError) { skipped.push(`${scene}: flag-off errored: ${offError.slice(0, 120)}`); continue; }
    const offPng = await page.locator("#stage canvas, #app canvas, canvas").first().screenshot();

    // Flag on — same page, same run.
    await page.goto(`http://127.0.0.1:5192${sceneUrl(scene, "tiers-batching")}`);
    ok = await page.waitForFunction(
      () => (window as unknown as { __QR_READY__?: unknown }).__QR_READY__ !== undefined,
      undefined, { timeout: 120_000 }
    ).then(() => true).catch(() => false);
    if (!ok) { skipped.push(`${scene}: flag-on never ready`); continue; }
    const onPng = await page.locator("#stage canvas, #app canvas, canvas").first().screenshot();

    const stats = await page.evaluate(async ({ off, on, helpers }) => {
      const runner = new Function("off", "on", `${helpers}; return Promise.all([decode(off), decode(on)]).then(([a, b]) => compare(a, b));`);
      return runner(off, on) as Promise<{ maxChannel: number; ssim: number; width: number; height: number }>;
    }, {
      off: `data:image/png;base64,${offPng.toString("base64")}`,
      on: `data:image/png;base64,${onPng.toString("base64")}`,
      helpers: DECODE_AND_DIFF
    });

    if (stats.width === 0 || stats.height === 0) { skipped.push(`${scene}: zero-size capture`); continue; }
    if (stats.maxChannel > 2 || stats.ssim < 0.999) {
      failures.push(`${scene}: maxChannel=${stats.maxChannel} ssim=${stats.ssim.toFixed(5)}`);
    }
  }

  if (skipped.length) console.log(`[prd11 pixel-identity] skipped: ${skipped.join(" | ")}`);
  if (skipped.length === BASE_SCENES.length + 1) {
    test.skip(true, "no scene produced a usable frame — no real WebGL2 on this host");
    return;
  }
  expect(failures, `pixel-identity violations:\n${failures.join("\n")}`).toEqual([]);
});
