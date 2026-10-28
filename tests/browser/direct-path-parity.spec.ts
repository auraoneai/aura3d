import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Direct path vs HDR path, frame for frame (beat-three.js PRD section 6: "no visual regressions by surprise").
 *
 * The default route (`quality: "auto"`, no post, no `output`) writes straight to the canvas; `?aura3d-render=production`
 * forces the HDR chain on the same page. The two frames must agree: mean abs diff <= 2/255 and no pixel off by more than
 * 6/255 away from silhouettes. Silhouette pixels are measured separately: the canvas MSAA resolves in display space
 * where the HDR chain resolves in linear light, so a hard edge between very different colours legitimately differs by
 * more; those pixels are reported (EDGE_*) and capped.
 *
 * Remote only (tools/remote-acr/run.sh), software WebGL2. Prints DIRECT_PARITY lines.
 */
const MEAN_TOLERANCE = 2;
const INTERIOR_TOLERANCE = 6;
// Silhouette pixels: MSAA resolves in display space on the direct path (three.js r185 does the same on its default framebuffer) and in
// linear light on the HDR chain, so a hard edge legitimately differs. Capped, not hidden: at most 0.5% of the frame is over 6/255 and
// no pixel is more than 64/255 off (measured 0.1% to 0.3% and 48 on the worst scene).
const EDGE_FRACTION_TOLERANCE = 0.005;
const EDGE_MAX_TOLERANCE = 64;
const WIDTH = 640;
const HEIGHT = 360;

interface Stats { meanAbsDiff: number; interiorMax: number; edgeMax: number; edgePixels: number; edgeOverTolerance: number; pixelsOver6: number; nonBackground: number; meanLumaProduction: number; meanLumaDirect: number; renderPathDirect?: unknown; renderPathProduction?: unknown }

function compare(production: Buffer, direct: Buffer): Stats {
  const pixels = WIDTH * HEIGHT;
  const luma = (buf: Buffer, p: number): number => 0.2126 * buf[p * 4]! + 0.7152 * buf[p * 4 + 1]! + 0.0722 * buf[p * 4 + 2]!;
  // A silhouette pixel has a neighbour (within 2 px) that differs in ANY channel by more than 12: chromatic edges count too.
  const isEdge = (p: number): boolean => {
    const x = p % WIDTH;
    const y = Math.floor(p / WIDTH);
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if ((dx === 0 && dy === 0) || nx < 0 || ny < 0 || nx >= WIDTH || ny >= HEIGHT) continue;
        const q = ny * WIDTH + nx;
        for (let c = 0; c < 3; c += 1) if (Math.abs(production[q * 4 + c]! - production[p * 4 + c]!) > 12) return true;
      }
    }
    return false;
  };
  let sum = 0;
  let interiorMax = 0;
  let edgeMax = 0;
  let edgePixels = 0;
  let edgeOver = 0;
  let over6 = 0;
  let nonBackground = 0;
  let lumaP = 0;
  let lumaD = 0;
  for (let p = 0; p < pixels; p += 1) {
    let pixelMax = 0;
    for (let c = 0; c < 3; c += 1) {
      const d = Math.abs(production[p * 4 + c]! - direct[p * 4 + c]!);
      sum += d;
      if (d > pixelMax) pixelMax = d;
    }
    if (pixelMax > 6) over6 += 1;
    if (isEdge(p)) {
      edgePixels += 1;
      if (pixelMax > edgeMax) edgeMax = pixelMax;
      if (pixelMax > 6) edgeOver += 1;
    } else if (pixelMax > interiorMax) {
      interiorMax = pixelMax;
    }
    if (Math.abs(production[p * 4]! - production[0]!) > 8 || Math.abs(production[p * 4 + 1]! - production[1]!) > 8 || Math.abs(production[p * 4 + 2]! - production[2]!) > 8) nonBackground += 1;
    lumaP += luma(production, p);
    lumaD += luma(direct, p);
  }
  return {
    meanAbsDiff: Math.round((sum / (pixels * 3)) * 1000) / 1000,
    interiorMax,
    edgeMax,
    edgePixels,
    edgeOverTolerance: edgeOver,
    pixelsOver6: over6,
    nonBackground,
    meanLumaProduction: Math.round((lumaP / pixels) * 10) / 10,
    meanLumaDirect: Math.round((lumaD / pixels) * 10) / 10
  };
}

async function harnessPixels(page: Page, origin: string, scene: string, render: "auto" | "production"): Promise<{ pixels: Buffer; renderPath: unknown; problems: string[] }> {
  const problems: string[] = [];
  page.on("console", (m) => { if ((m.type() === "warning" || m.type() === "error") && !/GPU stall due to ReadPixels/.test(m.text())) problems.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`));
  const render_ = render === "production" ? "&aura3d-render=production" : "";
  await page.goto(`${origin}/tests/browser/frame-cost-harness.html?scene=${scene}${render_}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean((window as unknown as { __FRAME_COST__?: unknown }).__FRAME_COST__), undefined, { timeout: 180_000 });
  const result = await page.evaluate(async () => {
    const w = window as unknown as {
      __FRAME_COST__: { ready: boolean; errors: string[]; stepOnce(): void };
      __FC__: { app: { capture(o: { type: "image-bitmap" }): Promise<ImageBitmap>; diagnostics(): { renderPath?: unknown } } };
    };
    if (!w.__FRAME_COST__.ready) return { error: w.__FRAME_COST__.errors.join(" | ") };
    for (let i = 0; i < 6; i += 1) w.__FRAME_COST__.stepOnce();
    const bitmap = await w.__FC__.app.capture({ type: "image-bitmap" });
    const scratch = document.createElement("canvas");
    scratch.width = bitmap.width;
    scratch.height = bitmap.height;
    const ctx = scratch.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, scratch.width, scratch.height).data;
    let binary = "";
    for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
    return { base64: btoa(binary), renderPath: w.__FC__.app.diagnostics().renderPath };
  });
  if ("error" in result) throw new Error(String(result.error));
  return { pixels: Buffer.from(result.base64, "base64"), renderPath: result.renderPath, problems };
}

async function skinnedPixels(page: Page, origin: string, render: "auto" | "production"): Promise<{ pixels: Buffer; problems: string[] }> {
  const problems: string[] = [];
  page.on("console", (m) => { if ((m.type() === "warning" || m.type() === "error") && !/GPU stall due to ReadPixels/.test(m.text())) problems.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`));
  const glb = readFileSync(new URL("../../fixtures/threejs-parity/assets/character/soldier.glb", import.meta.url));
  await page.route("**/model.glb", (route) => route.fulfill({ status: 200, contentType: "model/gltf-binary", body: glb }));
  await page.goto(`${origin}/tests/browser/exposure-skinned-harness.html${render === "production" ? "?aura3d-render=production" : ""}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean((window as { __BENCH__?: { ready?: boolean } }).__BENCH__?.ready), undefined, { timeout: 300_000 });
  const base64 = await page.evaluate(() => {
    const api = (window as unknown as { __BENCH__: { frame(dt: number): void } }).__BENCH__;
    for (let i = 0; i < 24; i += 1) api.frame(1 / 60);
    // Same task as the render, so the (non-preserved) drawing buffer is still populated.
    api.frame(1 / 60);
    const canvas = document.querySelector("canvas")!;
    const scratch = document.createElement("canvas");
    scratch.width = canvas.width;
    scratch.height = canvas.height;
    const ctx = scratch.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(canvas, 0, 0);
    const data = ctx.getImageData(0, 0, scratch.width, scratch.height).data;
    let binary = "";
    for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
    return btoa(binary);
  });
  return { pixels: Buffer.from(base64, "base64"), problems };
}

test.describe("direct path vs HDR path (software WebGL2)", () => {
  test.setTimeout(20 * 60_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const scene of ["cube", "lit", "fog", "pbr"] as const) {
    test(`${scene}: same frame on both paths`, async ({ browser }) => {
      const contextA = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
      const contextB = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
      const production = await harnessPixels(await contextA.newPage(), server.origin, scene, "production");
      const direct = await harnessPixels(await contextB.newPage(), server.origin, scene, "auto");
      const stats = { scene, ...compare(production.pixels, direct.pixels), renderPathDirect: direct.renderPath, renderPathProduction: production.renderPath };
      console.log(`DIRECT_PARITY ${JSON.stringify(stats)}`);
      expect((direct.renderPath as { path?: string } | undefined)?.path, "the default route takes the direct path").toBe("direct");
      expect((production.renderPath as { path?: string } | undefined)?.path).toBe("hdr-msaa");
      expect([...production.problems, ...direct.problems]).toEqual([]);
      expect(stats.nonBackground, "the frame contains the scene").toBeGreaterThan(5000);
      expect(stats.meanAbsDiff, "mean abs diff (0..255)").toBeLessThanOrEqual(MEAN_TOLERANCE);
      expect(stats.interiorMax, "largest interior difference (0..255)").toBeLessThanOrEqual(INTERIOR_TOLERANCE);
      expect(stats.pixelsOver6 / (WIDTH * HEIGHT), "fraction of the frame more than 6/255 off (silhouettes only)").toBeLessThanOrEqual(EDGE_FRACTION_TOLERANCE);
      expect(stats.edgeMax, "largest silhouette difference (0..255)").toBeLessThanOrEqual(EDGE_MAX_TOLERANCE);
      await contextA.close();
      await contextB.close();
    });
  }

  test("skinned character: same frame on both paths", async ({ browser }) => {
    const contextA = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    const contextB = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    const production = await skinnedPixels(await contextA.newPage(), server.origin, "production");
    const direct = await skinnedPixels(await contextB.newPage(), server.origin, "auto");
    const stats = { scene: "skinned-character", ...compare(production.pixels, direct.pixels) };
    console.log(`DIRECT_PARITY ${JSON.stringify(stats)}`);
    expect([...production.problems, ...direct.problems]).toEqual([]);
    expect(stats.nonBackground).toBeGreaterThan(5000);
    expect(stats.meanAbsDiff).toBeLessThanOrEqual(MEAN_TOLERANCE);
    expect(stats.interiorMax).toBeLessThanOrEqual(INTERIOR_TOLERANCE);
    expect(stats.pixelsOver6 / (WIDTH * HEIGHT)).toBeLessThanOrEqual(EDGE_FRACTION_TOLERANCE);
    expect(stats.edgeMax).toBeLessThanOrEqual(EDGE_MAX_TOLERANCE);
    await contextA.close();
    await contextB.close();
  });
});
