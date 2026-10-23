import { expect, test, type Page } from "@playwright/test";
import { frameDistance, imageStats, type ImageStats } from "../../tools/crayon-capture/heatsink-judge-lib";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Native Aura Slam vs the LIVE page, like for like (remote only). For each venue the live page is loaded
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

interface Tile { png: Buffer; label: string }

/** Compose labelled tiles into a grid and return it as a JPEG. */
async function sheet(page: Page, tiles: readonly Tile[], cols: number, tileW: number, tileH: number, caption?: string[]): Promise<Buffer> {
  const rows = Math.ceil(tiles.length / cols);
  const pad = 22;
  const b64 = await page.evaluate(async ({ tiles, cols, rows, tileW, tileH, pad, caption }) => {
    const cv = new OffscreenCanvas(cols * tileW, rows * (tileH + pad));
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.font = "13px sans-serif";
    for (let i = 0; i < tiles.length; i++) {
      const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${tiles[i]!.png}`)).blob());
      const x = (i % cols) * tileW;
      const y = Math.floor(i / cols) * (tileH + pad);
      ctx.drawImage(bmp, x, y + pad, tileW, tileH);
      ctx.fillStyle = "#e8ecf4";
      ctx.fillText(tiles[i]!.label, x + 6, y + 15);
      if (caption?.[i]) { ctx.fillStyle = "#9bd0ff"; ctx.fillText(caption[i]!, x + Math.floor(tileW * 0.36), y + 15); }
    }
    const blob = await cv.convertToBlob({ type: "image/jpeg", quality: 0.88 });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, { tiles: tiles.map((t) => ({ png: t.png.toString("base64"), label: t.label })), cols, rows, tileW, tileH, pad, caption });
  return Buffer.from(b64, "base64");
}

test.describe("aura-slam native vs live", () => {
  test.setTimeout(3_300_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("native frames for all venues, live frames and metrics for the same states", async ({ browser }) => {
    const errors: string[] = [];
    const nativeTiles: Tile[] = [];
    const pairs: Array<{ live: Tile; native: Tile; venue: string; caption: string }> = [];
    const metrics: Array<Record<string, unknown>> = [];
    const states: Record<string, unknown> = {};

    // Phase A: live page, 1280x720.
    const liveCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const live = await liveCtx.newPage();
    const liveErrors: string[] = [];
    live.on("pageerror", (e) => liveErrors.push(e.message));
    const livePng: Record<string, Buffer> = {};
    for (const venue of VENUES) {
      await live.goto(`${LIVE}/apps/showcase-top-tennis/?venue=${venue}`, { waitUntil: "domcontentloaded" });
      await live.waitForFunction(() => {
        const w = window as unknown as { __TOP_TENNIS_CONTROL__?: unknown; __AURA3D_GAME_EVIDENCE__?: { framesRendered?: number } };
        return Boolean(w.__TOP_TENNIS_CONTROL__) && (w.__AURA3D_GAME_EVIDENCE__?.framesRendered ?? 0) >= 6;
      }, undefined, { timeout: 900_000, polling: 1000 });
      await live.waitForTimeout(3000);
      states[venue] = await live.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __TOP_TENNIS_CONTROL__: { getState(): unknown } }).__TOP_TENNIS_CONTROL__.getState())));
      emit(`states/${venue}.json`, Buffer.from(JSON.stringify(states[venue])));
      // Show only the game canvas so the comparison is 3D against 3D (the live page overlays its HUD in DOM).
      await live.evaluate(() => {
        let best: HTMLCanvasElement | null = null;
        for (const c of Array.from(document.querySelectorAll("canvas"))) if (!best || c.width * c.height > best.width * best.height) best = c;
        document.body.style.visibility = "hidden";
        if (best) best.style.visibility = "visible";
      });
      livePng[venue] = await live.screenshot({ type: "png" });
      emit(`live-frames/${venue}.jpg`, await toJpeg(live, livePng[venue]!, 0.92));
    }
    await liveCtx.close();
    if (process.env.SLAMV_STATES_ONLY === "1") return;

    // Phase B: native renderer on the same states.
    const nativeCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const native = await nativeCtx.newPage();
    native.on("pageerror", (e) => errors.push(e.message));
    native.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    for (const size of [{ width: 1280, height: 720 }, { width: 640, height: 360 }] as const) {
      await native.setViewportSize(size);
      for (const venue of VENUES) {
        await native.goto(`${server.origin}/examples/aura-slam/view/harness.html?venue=${venue}&pose=real&trace=1`, { waitUntil: "domcontentloaded" });
        await native.waitForFunction(() => (window as unknown as { __AURA_SLAM_RENDER__?: { ready(): boolean } }).__AURA_SLAM_RENDER__?.ready() === true, undefined, { timeout: 900_000 });
        await native.evaluate((s) => (window as unknown as { __AURA_SLAM_RENDER__: { showState(s: unknown): Promise<void> } }).__AURA_SLAM_RENDER__.showState(s), states[venue]);
        await native.waitForFunction(() => ((window as unknown as { __AURA_SLAM_RENDER__: { drawCalls(): number | null } }).__AURA_SLAM_RENDER__.drawCalls() ?? 0) > 0, undefined, { timeout: 900_000, polling: 1000 });
        if (size.width === 1280) console.log(`SLAMV_SCAN ${venue} ${JSON.stringify(await native.evaluate((s) => (window as unknown as { __AURA_SLAM_RENDER__: { scan(s: unknown): unknown } }).__AURA_SLAM_RENDER__.scan(s), states[venue]))}`);
        await native.waitForTimeout(4000);
        // Re-draw the same state after textures settle so the frame is the settled one.
        await native.evaluate((s) => (window as unknown as { __AURA_SLAM_RENDER__: { showState(s: unknown): Promise<void> } }).__AURA_SLAM_RENDER__.showState(s), states[venue]);
        if (size.width === 1280) console.log(`SLAMV_TRACE ${venue} ${JSON.stringify(await native.evaluate(() => (window as unknown as { __AURA_SLAM_RENDER__: { traced(): string[] } }).__AURA_SLAM_RENDER__.traced()))}`);
        await native.waitForTimeout(1500);
        const png = await native.screenshot({ type: "png" });
        const drawCalls = await native.evaluate(() => (window as unknown as { __AURA_SLAM_RENDER__: { drawCalls(): number | null } }).__AURA_SLAM_RENDER__.drawCalls());
        const suffix = size.width === 1280 ? "" : "-640";
        emit(`native-frames/${venue}${suffix}.jpg`, await toJpeg(native, png, 0.92));
        if (size.width === 1280) {
          nativeTiles.push({ png, label: venue });
          const a = imageStats(await decode(native, livePng[venue]!));
          const b = imageStats(await decode(native, png));
          const d = frameDistance(a as ImageStats, b as ImageStats);
          const row = { venue, drawCalls, lumaJsd: +d.lumaJsd.toFixed(4), rgbJsd: +d.rgbJsd.toFixed(4), paletteDistance: +d.paletteDistance.toFixed(4), edgeRatio: +(b.edgeDensity / Math.max(1e-9, a.edgeDensity)).toFixed(3), lumaLive: +a.lumaMean.toFixed(2), lumaNative: +b.lumaMean.toFixed(2), lumaDelta: +(b.lumaMean - a.lumaMean).toFixed(2) };
          metrics.push(row);
          console.log(`SLAMV_METRICS ${JSON.stringify(row)}`);
          pairs.push({ live: { png: livePng[venue]!, label: `LIVE ${venue}` }, native: { png, label: `NATIVE ${venue}` }, venue, caption: `lumaJSD ${row.lumaJsd}  rgbJSD ${row.rgbJsd}  edge x${row.edgeRatio}  dLuma ${row.lumaDelta}` });
        }
      }
    }
    emit("native-contact-sheet.jpg", await sheet(native, nativeTiles, 3, 640, 360));
    const pairTiles: Tile[] = [];
    const captions: string[] = [];
    for (const p of pairs) { pairTiles.push(p.live, p.native); captions.push("", p.caption); }
    emit("native-vs-live-sheet.jpg", await sheet(native, pairTiles, 2, 640, 360, captions));
    console.log(`SLAMV_SUMMARY ${JSON.stringify({ errors: errors.filter((e) => !/favicon/.test(e)).slice(0, 8), liveErrors: liveErrors.slice(0, 4), venues: metrics.length })}`);
    await nativeCtx.close();
    expect(metrics.length).toBe(VENUES.length);
    expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
  });
});
