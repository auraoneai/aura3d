import { expect, test, type Page } from "@playwright/test";
import { frameDistance, imageStats, type ImageStats } from "../../tools/crayon-capture/heatsink-judge-lib";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Remote: PUBLIC_ASSETS="showcaseStadiumSeats.afb44897.glb rooftopScoreboardRigMeshy.866123b7.glb rooftopFloodlightTowerMeshy.1bfcdd0b.glb" SPECS="@headed-xvfb <this spec>" tools/remote-acr/run.sh
 * Same comparison as aura-slam-native-vs-live at 640x360 and mobile 390x844, plus a court-line mask alignment (remote only).
 * Native Aura Slam vs the LIVE page, like for like. For each venue the live page is loaded
 * (https://aura3d.auraone.ai/apps/showcase-top-tennis/?venue=<v>), its full sim state is read from
 * `__TOP_TENNIS_CONTROL__.getState()` and its canvas screenshotted; the native renderer then draws that exact state with the
 * M-POSE pose solver. Everything is logged as `SLAMV_FILE <path> <i> <n> <base64>` (jpeg) and `SLAMV_METRICS <json>`; rebuild the
 * files with tools/aura-slam/extract-frames.mjs. Override the live origin with SLAM_LIVE_ORIGIN.
 */
const LIVE = process.env.SLAM_LIVE_ORIGIN ?? "https://aura3d.auraone.ai";
const VENUES = ["hard", "grass", "clay", "desert", "beach", "moon"] as const;
const FILE_CHUNK = 15000;

type Rgba = { width: number; height: number; data: Uint8Array };

function emit(path: string, jpeg: Buffer): void {
  const b64 = jpeg.toString("base64");
  const n = Math.ceil(b64.length / FILE_CHUNK);
  for (let i = 0; i < n; i++) console.log(`SLAMV_FILE ${path} ${i} ${n} ${b64.slice(i * FILE_CHUNK, (i + 1) * FILE_CHUNK)}`);
}

async function toJpeg(page: Page, png: Buffer, quality = 0.9): Promise<Buffer> {
  const b64 = await page.evaluate(async ([data, q]) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
    const cv = new OffscreenCanvas(bmp.width, bmp.height);
    cv.getContext("2d")!.drawImage(bmp, 0, 0);
    const blob = await cv.convertToBlob({ type: "image/jpeg", quality: q as number });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, [png.toString("base64"), quality] as const);
  return Buffer.from(b64, "base64");
}

async function decode(page: Page, png: Buffer): Promise<Rgba> {
  const out = await page.evaluate(async (data: string) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
    const cv = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = cv.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    let s = "";
    for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode(...d.subarray(i, i + 0x8000));
    return { width: bmp.width, height: bmp.height, b64: btoa(s) };
  }, png.toString("base64"));
  return { width: out.width, height: out.height, data: new Uint8Array(Buffer.from(out.b64, "base64")) };
}


const SIZES = [{ name: "640", width: 640, height: 360 }, { name: "mobile", width: 390, height: 844 }] as const;

function lineMask(img: Rgba): Uint8Array {
  const m = new Uint8Array(img.width * img.height);
  const top = Math.floor(img.height * 0.08);
  for (let y = top; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const i = (y * img.width + x) * 4;
    const r = img.data[i]!, g = img.data[i + 1]!, b = img.data[i + 2]!;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mn > 150 && mx - mn < 60) m[y * img.width + x] = 1;
  }
  return m;
}

function crop(img: Rgba, y: number, h: number): Rgba {
  return { width: img.width, height: h, data: img.data.subarray(y * img.width * 4, (y + h) * img.width * 4) };
}

function covered(a: Uint8Array, b: Uint8Array, w: number, h: number, r: number): number {
  let hit = 0, total = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!a[y * w + x]) continue;
    total++;
    let ok = false;
    for (let dy = -r; dy <= r && !ok; dy++) for (let dx = -r; dx <= r; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy >= 0 && yy < h && xx >= 0 && xx < w && b[yy * w + xx]) { ok = true; break; }
    }
    if (ok) hit++;
  }
  return total ? hit / total : 1;
}

test.describe("aura-slam native vs live at small sizes", () => {
  test.setTimeout(3_300_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("640x360 and mobile frames and metrics for all venues", async ({ browser }) => {
    const errors: string[] = [];
    let rows = 0;
    for (const size of SIZES) {
      const viewport = { width: size.width, height: size.height };
      const liveCtx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      const live = await liveCtx.newPage();
      const nativeCtx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      const native = await nativeCtx.newPage();
      native.on("pageerror", (e) => errors.push(e.message));
      native.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      for (const venue of VENUES) {
        await live.goto(`${LIVE}/apps/showcase-top-tennis/?venue=${venue}`, { waitUntil: "domcontentloaded" });
        await live.waitForFunction(() => {
          const w = window as unknown as { __TOP_TENNIS_CONTROL__?: unknown; __AURA3D_GAME_EVIDENCE__?: { framesRendered?: number } };
          return Boolean(w.__TOP_TENNIS_CONTROL__) && (w.__AURA3D_GAME_EVIDENCE__?.framesRendered ?? 0) >= 6;
        }, undefined, { timeout: 900_000, polling: 1000 });
        await live.waitForTimeout(3000);
        const state = await live.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __TOP_TENNIS_CONTROL__: { getState(): unknown } }).__TOP_TENNIS_CONTROL__.getState())));
        await live.evaluate(() => {
          let best: HTMLCanvasElement | null = null;
          for (const c of Array.from(document.querySelectorAll("canvas"))) if (!best || c.width * c.height > best.width * best.height) best = c;
          document.body.style.visibility = "hidden";
          if (best) best.style.visibility = "visible";
        });
        // On portrait the live page lays its HUD out above the canvas, pushing the canvas down and clipping its bottom edge; compare only the visible rows.
        const rect = await live.evaluate(() => {
          let best: HTMLCanvasElement | null = null;
          for (const c of Array.from(document.querySelectorAll("canvas"))) if (!best || c.width * c.height > best.width * best.height) best = c;
          const r = best!.getBoundingClientRect();
          return { y: r.y, height: r.height };
        });
        const offset = Math.max(0, Math.round(rect.y));
        const livePng = await live.screenshot({ type: "png" });
        await native.goto(`${server.origin}/examples/aura-slam/view/harness.html?venue=${venue}&pose=real`, { waitUntil: "domcontentloaded" });
        await native.waitForFunction(() => (window as unknown as { __AURA_SLAM_RENDER__?: { ready(): boolean } }).__AURA_SLAM_RENDER__?.ready() === true, undefined, { timeout: 900_000 });
        await native.evaluate((s) => (window as unknown as { __AURA_SLAM_RENDER__: { showState(s: unknown): Promise<void> } }).__AURA_SLAM_RENDER__.showState(s), state);
        await native.waitForFunction(() => ((window as unknown as { __AURA_SLAM_RENDER__: { drawCalls(): number | null } }).__AURA_SLAM_RENDER__.drawCalls() ?? 0) > 0, undefined, { timeout: 900_000, polling: 1000 });
        await native.waitForTimeout(4000);
        await native.evaluate((s) => (window as unknown as { __AURA_SLAM_RENDER__: { showState(s: unknown): Promise<void> } }).__AURA_SLAM_RENDER__.showState(s), state);
        await native.waitForTimeout(1500);
        const png = await native.screenshot({ type: "png" });
        const drawCalls = await native.evaluate(() => (window as unknown as { __AURA_SLAM_RENDER__: { drawCalls(): number | null } }).__AURA_SLAM_RENDER__.drawCalls());
        const liveFull = await decode(native, livePng);
        const nativeFull = await decode(native, png);
        const visibleRows = Math.min(liveFull.height - offset, nativeFull.height - offset, Math.round(rect.height - Math.max(0, -rect.y)));
        const la = crop(liveFull, offset, visibleRows);
        const na = crop(nativeFull, 0, visibleRows);
        const a = imageStats(la);
        const b = imageStats(na);
        const d = frameDistance(a as ImageStats, b as ImageStats);
        const ml = lineMask(la), mn = lineMask(na);
        const row = {
          size: size.name, venue, drawCalls, liveCanvasOffsetY: offset, comparedRows: visibleRows,
          lumaJsd: +d.lumaJsd.toFixed(4), rgbJsd: +d.rgbJsd.toFixed(4),
          edgeRatio: +(b.edgeDensity / Math.max(1e-9, a.edgeDensity)).toFixed(3),
          lumaDelta: +(b.lumaMean - a.lumaMean).toFixed(2),
          lineRecall2px: +covered(ml, mn, la.width, la.height, 2).toFixed(3),
          linePrecision2px: +covered(mn, ml, la.width, la.height, 2).toFixed(3),
        };
        console.log(`SLAMV_METRICS ${JSON.stringify(row)}`);
        emit(`sizes/${size.name}-${venue}-live.jpg`, await toJpeg(native, livePng, 0.9));
        emit(`sizes/${size.name}-${venue}-native.jpg`, await toJpeg(native, png, 0.9));
        rows++;
      }
      await liveCtx.close();
      await nativeCtx.close();
    }
    console.log(`SLAMV_SUMMARY ${JSON.stringify({ errors: errors.filter((e) => !/favicon/.test(e)).slice(0, 8), rows })}`);
    expect(rows).toBe(SIZES.length * VENUES.length);
    expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
  });
});
