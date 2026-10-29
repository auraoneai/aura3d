import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Lamplight Line (last-train-port) audit fix D-07 / RP-07. Remote only (tools/remote-acr/run.sh); never local Playwright.
 *
 * Loads the plain page (no `?capture=1` / `?qa=1`, so the drawing buffer is not preserved, as on the live site), lets it settle,
 * then calls `window.__AURA_LAST_TRAIN__.pixels()` in its own evaluate, a later task than any render. Before the fix it read a
 * cleared canvas (mean 0, litFraction 0). The run has no artifact egress, so output goes to the log:
 *   GL_META <json>                         pixels() result, page-screenshot luma stats and engine diagnostics per shot
 *   GL_JPG  <target> <shot> <i>/<n> <b64>  canvas-only JPEG, chunked
 * The first shot is not trusted (environment bake lands seconds after first frame): judge the later ones.
 */
const SETTLE_SECONDS = (process.env.GL_SETTLE ?? "5,25,60").split(",").map(Number);
const CHUNK = 16000;
const URL_PATH = "/examples/last-train-port/";
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";

interface Pixels { width: number; height: number; litFraction: number; mean: number }

async function lumaStats(page: Page, png: Buffer) {
  return page.evaluate(async (b64) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const hist = new Uint32Array(256);
    let sum = 0, dark = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const y = Math.round(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
      hist[y]!++; sum += y;
      if (y <= 8) dark++;
    }
    const pct = (p: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= p * n) return v; } return 255; };
    return { mean: +(sum / n).toFixed(2), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95), darkFrac: +(dark / n).toFixed(4) };
  }, png.toString("base64"));
}

async function engineInfo(page: Page) {
  return page.evaluate(() => {
    const reg = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__;
    const app = reg?.all()[0];
    if (!app) return { app: false };
    try { const dg = app.diagnostics?.(); return { app: true, renderPath: dg?.renderPath?.path ?? null, drawCalls: dg?.drawCalls ?? null }; } catch (e) { return { app: true, diagErr: String(e) }; }
  });
}

/** pixels() in its own task, then a page screenshot as the reference for what is really on screen. */
async function grab(page: Page, id: string, extra: Record<string, unknown>): Promise<Pixels> {
  const pixels = await page.evaluate(() => (window as unknown as { __AURA_LAST_TRAIN__: { pixels(): Pixels } }).__AURA_LAST_TRAIN__.pixels());
  const handle = await page.addStyleTag({ content: CANVAS_ONLY });
  await page.waitForTimeout(250);
  const png = await page.screenshot({ type: "png" });
  const jpg = await page.screenshot({ type: "jpeg", quality: 70 });
  await handle.evaluate((el) => el.remove());
  const stats = await lumaStats(page, png);
  log(`GL_META ${JSON.stringify({ target: "last-train", id, ...extra, pixels, screenshot: stats, info: await engineInfo(page) })}`);
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`GL_JPG last-train ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
  return pixels;
}

test.describe("audit-fix last-train-port", () => {
  test.setTimeout(1_800_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("pixels() QA hook reads a lit canvas on the plain page (D-07)", async ({ page }) => {
    page.on("pageerror", (e) => log(`GL_ERR last-train pageerror ${e.message.slice(0, 300)}`));
    page.on("console", (m) => { if (m.type() === "error") log(`GL_CONSOLE last-train ${m.text().slice(0, 200)}`); });
    await page.setViewportSize({ width: 640, height: 360 });
    await page.goto(`${server.origin}${URL_PATH}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const w = window as unknown as { __AURA_LAST_TRAIN__?: { ready(): boolean }; __AURA_LAST_TRAIN_ERROR__?: string };
      return w.__AURA_LAST_TRAIN__?.ready() === true || Boolean(w.__AURA_LAST_TRAIN_ERROR__);
    }, undefined, { timeout: 420_000, polling: 500 });
    const bootError = await page.evaluate(() => (window as unknown as { __AURA_LAST_TRAIN_ERROR__?: string }).__AURA_LAST_TRAIN_ERROR__ ?? null);
    expect(bootError).toBeNull();
    const loaded = Date.now();
    const shots: Pixels[] = [];
    for (const sec of SETTLE_SECONDS) {
      const wait = sec * 1000 - (Date.now() - loaded);
      if (wait > 0) await page.waitForTimeout(wait);
      shots.push(await grab(page, `settle-${sec}s`, { sinceReadyMs: Date.now() - loaded }));
    }
    log("GL_DONE last-train");
    // Steady state only: the later shots.
    for (const px of shots.slice(1)) {
      expect(px.mean, "pixels() mean at steady state").toBeGreaterThan(20);
      expect(px.litFraction, "pixels() lit fraction at steady state").toBeGreaterThan(0.5);
    }
  });
});
