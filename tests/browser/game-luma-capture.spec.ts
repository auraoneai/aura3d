import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Game-level luma capture at steady state (4.5.0 look-fill regression gate). Remote only (tools/remote-acr/run.sh); the ACR run has
 * no artifact egress, so output goes to the log:
 *   GL_META <json>                         luma stats + engine diagnostics per shot
 *   GL_JPG  <target> <shot> <i>/<n> <b64>  canvas-only JPEG, chunked
 * Select targets with `--grep=<prefix>` in SPECS. The software-GL runner presents about one frame every 5 to 10 s, and a baked
 * environment probe lands several seconds after the first frame, so the FIRST shot is deliberately not trusted: judge the later ones.
 */
const SETTLE_SECONDS = (process.env.GL_SETTLE ?? "3,25,60").split(",").map(Number);
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";
const READY = "document.body.dataset.aura3dReady === 'true' || Boolean(window.__AURA3D_LIVE_APPS__ && window.__AURA3D_LIVE_APPS__.all().some((a) => (a.diagnostics?.().drawCalls ?? 0) > 0))";

interface Target { readonly name: string; readonly url: string; prepare?(page: Page): Promise<void>; }

const pipsWorld = (world: string) => async (page: Page): Promise<void> => {
  // Open the atlas and pick the world through the page's own buttons (element.click, so the title overlay cannot intercept it).
  await page.evaluate(() => (document.getElementById("aura-btn-atlas") as HTMLElement | null)?.click());
  await page.waitForTimeout(500);
  await page.evaluate((w) => (document.querySelector(`.pbl-atlas-card[data-world="${w}"]`) as HTMLElement | null)?.click(), world);
};

const TARGETS: readonly Target[] = [
  { name: "diamond-skyline", url: "/apps/showcase-aura-diamond-3d/index.html?park=skyline" },
  { name: "diamond-lunar", url: "/apps/showcase-aura-diamond-3d/index.html?park=lunar" },
  { name: "diamond-sandlot", url: "/apps/showcase-aura-diamond-3d/index.html?park=sandlot" },
  { name: "pips-w6", url: "/apps/showcase-pips-big-leap/", prepare: pipsWorld("w6") },
  { name: "pips-w1", url: "/apps/showcase-pips-big-leap/", prepare: pipsWorld("w1") },
  { name: "hoops-shanghai", url: "/apps/showcase-aura-hoops-3d/index.html?court=shanghai" },
  { name: "hoops-orbit", url: "/apps/showcase-aura-hoops-3d/index.html?court=orbit" },
  { name: "hoops-rucker", url: "/apps/showcase-aura-hoops-3d/index.html?court=rucker" },
  { name: "crosshop", url: "/apps/showcase-cross-hop/" },
  { name: "dotdash", url: "/apps/showcase-dot-dash-3d/" }
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

async function grab(page: Page, target: string, id: string, extra: Record<string, unknown>): Promise<void> {
  const handle = await page.addStyleTag({ content: CANVAS_ONLY });
  await page.waitForTimeout(250);
  const png = await page.screenshot({ type: "png" });
  const jpg = await page.screenshot({ type: "jpeg", quality: 70 });
  await handle.evaluate((el) => el.remove());
  const stats = await lumaStats(page, png);
  log(`GL_META ${JSON.stringify({ target, id, ...extra, ...stats, info: await engineInfo(page) })}`);
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`GL_JPG ${target} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

test.describe("game luma capture", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const target of TARGETS) {
    test(`${target.name}`, async ({ page }) => {
      page.on("pageerror", (e) => log(`GL_ERR ${target.name} pageerror ${e.message.slice(0, 300)}`));
      page.on("console", (m) => { if (m.type() === "error") log(`GL_CONSOLE ${target.name} ${m.text().slice(0, 200)}`); });
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`${server.origin}${target.url}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(READY, undefined, { timeout: 420_000, polling: 500 });
      if (target.prepare) await target.prepare(page);
      const loaded = Date.now();
      for (const sec of SETTLE_SECONDS) {
        const wait = sec * 1000 - (Date.now() - loaded);
        if (wait > 0) await page.waitForTimeout(wait);
        await grab(page, target.name, `settle-${sec}s`, { sinceReadyMs: Date.now() - loaded });
      }
      log(`GL_DONE ${target.name}`);
    });
  }
});
