import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { GAME_LUMA_TARGETS } from "./game-luma-targets";

/**
 * Game-level luma capture at steady state for every live game and every lighting variant (park, court, course, venue,
 * stage, world, theme). Used for the 4.3.7-vs-4.5.0 lighting comparison (audit LIGHT-02, RH-03, RH-11). Remote only
 * (tools/remote-acr/run.sh); the ACR run has no artifact egress, so output goes to the log:
 *   GL_META <json>                         luma stats, a 3x3 region grid and engine diagnostics per shot
 *   GL_JPG  <target> <shot> <i>/<n> <b64>  canvas-only JPEG, chunked
 * Target names are `<inventory slug>--<variant> @g<N>`: select a run group with `--grep=@g3`, or one game with
 * `--grep=aura-diamond-3d--` (the ACR step runs SPECS through /bin/sh, so no parentheses or pipes in a grep).
 * tests/browser/game-luma-targets.ts is the single target list; tests/unit/game-luma-targets.test.ts checks that every
 * live game in docs/workflows/game-inventory.json has at least one target.
 * The software-GL runner presents about one frame every 5 to 10 s, and a baked environment probe lands several seconds
 * after the first frame, so the shots start at 25 s after ready (GL_SETTLE overrides; the 4.5.0 harness also took a 3 s shot,
 * which read the analytic floor probe): judge the 25 s and 60 s shots. One screenshot per shot; on the runner a shot costs
 * 50 to 110 s, so a target takes about 4 minutes.
 */

const SETTLE_SECONDS = (process.env.GL_SETTLE ?? "25,60").split(",").map(Number);
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";
const READY = "document.body.dataset.aura3dReady === 'true' || Boolean(window.__AURA3D_LIVE_APPS__ && window.__AURA3D_LIVE_APPS__.all().some((a) => (a.diagnostics?.().drawCalls ?? 0) > 0))";

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
    const grid = new Float64Array(9);
    const gridN = new Uint32Array(9);
    let sum = 0, dark = 0, clip = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const y = Math.round(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
      hist[y]!++; sum += y;
      if (y <= 8) dark++;
      if (y >= 250) clip++;
      const p = i / 4;
      const gx = Math.min(2, Math.floor(((p % c.width) * 3) / c.width));
      const gy = Math.min(2, Math.floor((Math.floor(p / c.width) * 3) / c.height));
      grid[gy * 3 + gx]! += y; gridN[gy * 3 + gx]!++;
    }
    const pct = (p: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= p * n) return v; } return 255; };
    // The JPEG is encoded here from the same pixels: a second page.screenshot costs another presented frame, which is
    // tens of seconds per shot on the software-GL runner.
    const jpeg = c.toDataURL("image/jpeg", 0.7).slice("data:image/jpeg;base64,".length);
    return {
      stats: {
        mean: +(sum / n).toFixed(2), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95),
        darkFrac: +(dark / n).toFixed(4), clipFrac: +(clip / n).toFixed(4),
        grid: Array.from(grid, (v, k) => +(v / Math.max(1, gridN[k]!)).toFixed(1))
      },
      jpeg
    };
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

async function grab(page: Page, target: string, id: string, extra: Record<string, unknown>): Promise<void> {
  const handle = await page.addStyleTag({ content: CANVAS_ONLY });
  await page.waitForTimeout(250);
  const png = await page.screenshot({ type: "png" });
  await handle.evaluate((el) => el.remove());
  const { stats, jpeg: b64 } = await lumaStats(page, png);
  log(`GL_META ${JSON.stringify({ target, id, ...extra, ...stats, info: await engineInfo(page) })}`);
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`GL_JPG ${target} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

test.describe("game luma capture", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const target of GAME_LUMA_TARGETS) {
    test(`${target.name} @${target.group}`, async ({ page }) => {
      page.on("pageerror", (e) => log(`GL_ERR ${target.name} pageerror ${e.message.slice(0, 300)}`));
      page.on("console", (m) => { if (m.type() === "error") log(`GL_CONSOLE ${target.name} ${m.text().slice(0, 200)}`); });
      page.on("response", (r) => { if (r.status() >= 400) log(`GL_HTTP ${target.name} ${r.status()} ${new URL(r.url()).pathname}`); });
      await page.setViewportSize({ width: 1280, height: 720 });
      const started = Date.now();
      await page.goto(`${server.origin}${target.url}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(READY, undefined, { timeout: 420_000, polling: 500 });
      if (target.prepare) await target.prepare(page);
      const loaded = Date.now();
      log(`GL_READY ${target.name} ${loaded - started}ms`);
      for (const sec of SETTLE_SECONDS) {
        const wait = sec * 1000 - (Date.now() - loaded);
        if (wait > 0) await page.waitForTimeout(wait);
        await grab(page, target.name, `settle-${sec}s`, { slug: target.slug, variant: target.variant, sinceReadyMs: Date.now() - loaded });
      }
      log(`GL_DONE ${target.name}`);
    });
  }
});
