import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Lane E4 (animation, physics and API) before/after smoke on the live game its changes reach: Aura FC 3D passes an
 * `animation` key to `model()`, which `model()` never read and now reports as OPTION_IGNORED (anim-phys-06). No E4 change
 * is meant to move pixels; this run proves the game still boots, draws the same frame at steady state, and logs the new
 * diagnostic. Pattern copied from tests/browser/game-luma-capture.spec.ts (no artifact egress, so output goes to the log):
 *   GL_META <json>                         luma stats + engine diagnostics per shot
 *   GL_JPG  <target> <shot> <i>/<n> <b64>  canvas-only JPEG, chunked
 * Judge the later shots; the first is not steady state on the software-GL runner.
 */
const SETTLE_SECONDS = (process.env.GL_SETTLE ?? "3,25,60").split(",").map(Number);
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";
const READY = "document.body.dataset.aura3dReady === 'true' || Boolean(window.__AURA3D_LIVE_APPS__ && window.__AURA3D_LIVE_APPS__.all().some((a) => (a.diagnostics?.().drawCalls ?? 0) > 0))";

interface Target { readonly name: string; readonly url: string; }

const TARGETS: readonly Target[] = [
  { name: "e4-fc", url: "/apps/showcase-aura-fc-3d/index.html" }
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
    try {
      const dg = app.diagnostics?.();
      const text = (value: unknown): string[] => (Array.isArray(value) ? value : []).map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry)));
      const optionIgnored = [...text(dg?.degradations), ...text(dg?.warnings)].filter((line) => line.includes("OPTION_IGNORED") || line.includes("option-ignored")).map((line) => line.slice(0, 160));
      return { app: true, renderPath: dg?.renderPath?.path ?? null, drawCalls: dg?.drawCalls ?? null, optionIgnored };
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
  log(`GL_META ${JSON.stringify({ target, id, ...extra, ...stats, info: await engineInfo(page) })}`);
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`GL_JPG ${target} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

test.describe("e4 engine smoke", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const target of TARGETS) {
    test(`${target.name}`, async ({ page }) => {
      page.on("pageerror", (e) => log(`GL_ERR ${target.name} pageerror ${e.message.slice(0, 300)}`));
      page.on("console", (m) => { if (m.type() === "error" || m.text().includes("OPTION_IGNORED")) log(`GL_CONSOLE ${target.name} ${m.type()} ${m.text().slice(0, 200)}`); });
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`${server.origin}${target.url}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(READY, undefined, { timeout: 420_000, polling: 500 });
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
