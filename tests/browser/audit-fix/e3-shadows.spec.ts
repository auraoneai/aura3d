import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Audit lane E3 (SI-1, SI-5): steady-state capture of games with spread instanced shadow casters. Remote only
 * (tools/remote-acr/run.sh). Pattern copied from tests/browser/game-luma-capture.spec.ts; the run has no artifact egress, so output goes
 * to the log:
 *   E3_META <json>                         luma stats, a 4x4 grid of mean luma, and the sun shadow diagnostics row per shot
 *   E3_JPG  <target> <shot> <i>/<n> <b64>  canvas-only JPEG, chunked
 * The first shot is not trusted (software GL, probes land late): judge the later ones.
 */
const SETTLE_SECONDS = (process.env.E3_SETTLE ?? "5,30,60").split(",").map(Number);
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";
const READY = "document.body.dataset.aura3dReady === 'true' || Boolean(window.__AURA3D_LIVE_APPS__ && window.__AURA3D_LIVE_APPS__.all().some((a) => (a.diagnostics?.().drawCalls ?? 0) > 0))";

interface Target { readonly name: string; readonly url: string; }

const TARGETS: readonly Target[] = [
  { name: "links-default", url: "/apps/showcase-aura-links-3d/index.html" },
  { name: "crosshop", url: "/apps/showcase-cross-hop/" },
  // Shadowstep Gauntlet opts into the 4.3.0 shadow fit (__A3D_SHADOW_FIT__ = "current"), where cascades hug the frustum slice: this is
  // where a centre-picked cascade leaves spread instanced scenery unshadowed.
  { name: "ninja", url: "/apps/showcase-ninja-runner-port/" }
];

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
    const grid = new Float64Array(16);
    const gridN = new Float64Array(16);
    let sum = 0, dark = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const y = Math.round(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
      hist[y]!++; sum += y;
      if (y <= 8) dark++;
      const px = (i / 4) % c.width, py = Math.floor(i / 4 / c.width);
      const cell = Math.min(3, Math.floor((py / c.height) * 4)) * 4 + Math.min(3, Math.floor((px / c.width) * 4));
      grid[cell]! += y; gridN[cell]! += 1;
    }
    const pct = (p: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= p * n) return v; } return 255; };
    return {
      mean: +(sum / n).toFixed(2), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95), darkFrac: +(dark / n).toFixed(4),
      grid: Array.from(grid, (s, i) => +(s / Math.max(1, gridN[i]!)).toFixed(2))
    };
  }, png.toString("base64"));
}

async function engineInfo(page: Page) {
  return page.evaluate(() => {
    const reg = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__;
    const app = reg?.all()[0];
    if (!app) return { app: false };
    try {
      const dg = app.diagnostics?.();
      return { app: true, renderPath: dg?.renderPath?.path ?? null, drawCalls: dg?.drawCalls ?? null, shadows: dg?.shadows?.shadows ?? null };
    } catch (e) { return { app: true, diagErr: String(e) }; }
  });
}

async function grab(page: Page, target: string, id: string, extra: Record<string, unknown>): Promise<void> {
  const handle = await page.addStyleTag({ content: CANVAS_ONLY });
  await page.waitForTimeout(250);
  const png = await page.screenshot({ type: "png" });
  const jpg = await page.screenshot({ type: "jpeg", quality: 70 });
  await handle.evaluate((el) => el.remove());
  const stats = await lumaStats(page, png);
  log(`E3_META ${JSON.stringify({ target, id, ...extra, ...stats, info: await engineInfo(page) })}`);
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`E3_JPG ${target} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

test.describe("e3 shadows capture", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const target of TARGETS) {
    test(`${target.name}`, async ({ page }) => {
      page.on("pageerror", (e) => log(`E3_ERR ${target.name} pageerror ${e.message.slice(0, 300)}`));
      page.on("console", (m) => { if (m.type() === "error") log(`E3_CONSOLE ${target.name} ${m.text().slice(0, 200)}`); });
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`${server.origin}${target.url}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(READY, undefined, { timeout: 420_000, polling: 500 });
      const loaded = Date.now();
      for (const sec of SETTLE_SECONDS) {
        const wait = sec * 1000 - (Date.now() - loaded);
        if (wait > 0) await page.waitForTimeout(wait);
        await grab(page, target.name, `settle-${sec}s`, { sinceReadyMs: Date.now() - loaded });
      }
      log(`E3_DONE ${target.name}`);
    });
  }
});
