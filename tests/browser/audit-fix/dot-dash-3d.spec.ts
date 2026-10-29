import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Audit lane G13 (Glint Courier, `dot-dash-3d`): steady-state luma of the live route, for the LIGHT-03 hemisphere retune.
 * Remote only (tools/remote-acr/run.sh); the ACR run has no artifact egress, so output goes to the log:
 *   G13_META <json>                         luma stats (whole frame, thirds, mean RGB) + engine diagnostics per shot
 *   G13_JPG  <target> <shot> <i>/<n> <b64>  canvas-only JPEG, chunked
 * Same viewport (1280x720) and settle times (30 s, 75 s after ready) as the lane E2 capture, so the numbers compare with
 * `docs/audits/lanes/e2.md`. The software-GL runner presents about one frame every several seconds: judge the 75 s shot.
 * `g13-hemi-*` targets pass `?g13hemi=<intensity>`, which only a measurement build reads (the shipped game ignores it);
 * `g13-live` is the route as shipped.
 */
const SETTLE_SECONDS = (process.env.G13_SETTLE ?? "30,75").split(",").map(Number);
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";
const READY = "document.body.dataset.aura3dReady === 'true' || Boolean(window.__AURA3D_LIVE_APPS__ && window.__AURA3D_LIVE_APPS__.all().some((a) => (a.diagnostics?.().drawCalls ?? 0) > 0))";
const ROUTE = "/apps/showcase-dot-dash-3d/";

interface Target { readonly name: string; readonly url: string }

const TARGETS: readonly Target[] = [
  { name: "g13-live", url: ROUTE },
  ...["0.85", "0.6", "0.4", "0.2", "0"].map((v) => ({ name: `g13-hemi-${v}`, url: `${ROUTE}?g13hemi=${v}` }))
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
    const third = [0, 0, 0];
    const thirdN = [0, 0, 0];
    let sum = 0, dark = 0, r = 0, g = 0, b = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const y = Math.round(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
      hist[y]!++; sum += y; r += d[i]!; g += d[i + 1]!; b += d[i + 2]!;
      if (y < 12) dark++;
      const row = Math.floor(i / 4 / c.width);
      const band = Math.min(2, Math.floor((row * 3) / c.height));
      third[band]! += y; thirdN[band]! += 1;
    }
    const pct = (p: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= p * n) return v; } return 255; };
    return {
      mean: +(sum / n).toFixed(2), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95), darkBelow12: +(dark / n).toFixed(4),
      rgb: [+(r / n).toFixed(1), +(g / n).toFixed(1), +(b / n).toFixed(1)],
      top: +(third[0]! / Math.max(1, thirdN[0]!)).toFixed(2), mid: +(third[1]! / Math.max(1, thirdN[1]!)).toFixed(2), bottom: +(third[2]! / Math.max(1, thirdN[2]!)).toFixed(2)
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
      return { app: true, renderPath: dg?.renderPath?.path ?? null, bloomFusion: dg?.renderPath?.bloomFusion ?? null, drawCalls: dg?.drawCalls ?? null, fps: dg?.fps ?? null };
    } catch (e) { return { app: true, diagErr: String(e) }; }
  });
}

async function grab(page: Page, target: Target, id: string, extra: Record<string, unknown>): Promise<void> {
  const handle = await page.addStyleTag({ content: CANVAS_ONLY });
  await page.waitForTimeout(250);
  const png = await page.screenshot({ type: "png" });
  const jpg = await page.screenshot({ type: "jpeg", quality: 70 });
  await handle.evaluate((el) => el.remove());
  const stats = await lumaStats(page, png);
  log(`G13_META ${JSON.stringify({ target: target.name, id, ...extra, ...stats, info: await engineInfo(page) })}`);
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`G13_JPG ${target.name} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

test.describe("g13 dot-dash-3d capture", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const target of TARGETS) {
    test(target.name, async ({ page }) => {
      page.on("pageerror", (e) => log(`G13_ERR ${target.name} pageerror ${e.message.slice(0, 300)}`));
      page.on("console", (m) => { if (m.type() === "error") log(`G13_CONSOLE ${target.name} ${m.text().slice(0, 240)}`); });
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`${server.origin}${target.url}`, { waitUntil: "domcontentloaded" });
      try {
        await page.waitForFunction(READY, undefined, { timeout: 360_000, polling: 500 });
      } catch {
        log(`G13_ERR ${target.name} not-ready`);
      }
      const loaded = Date.now();
      for (const sec of SETTLE_SECONDS) {
        const wait = sec * 1000 - (Date.now() - loaded);
        if (wait > 0) await page.waitForTimeout(wait);
        await grab(page, target, `settle-${sec}s`, { sinceReadyMs: Date.now() - loaded });
      }
      log(`G13_DONE ${target.name}`);
    });
  }
});
