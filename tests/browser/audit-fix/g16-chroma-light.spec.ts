import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Lane G16 (Chroma Roll, LIGHT-01): backdrop GLB lighting at the evidence "roll" state, steady state. Remote only
 * (tools/remote-acr/run.sh); the run has no artifact egress, so output goes to the log:
 *   GL_META <json>                         luma stats, game state and engine environment per shot
 *   GL_JPG  <target> <shot> <i>/<n> <b64>  full-page JPEG at 1440x900, chunked (same framing as card@2x.jpg)
 * The state is the one `evidence/splat-rush-port/screens/final/card@2x.jpg` was taken at (shotsb-chroma "roll":
 * begin, 45 idle steps, 420 autopilot steps; frameCount 466), driven through the manual QA hooks so the frame is
 * deterministic. The sim is frozen (`manual=1`), so the later shots are the same game state after the environment
 * probe has settled: judge those, never the first. Calibration runs patched backdrop.ts in a temporary worktree to read
 * `g16n=n<intensity>` and listed those variants here; the shipped game ignores the parameter.
 */
const SETTLE_MS = [0, 30_000, 60_000];
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const VARIANTS = (process.env.G16_VARIANTS ?? "ship").split(",");

interface Api { ready(): boolean; begin(): void; stepFrames(n: number): void; extras?: { runAutopilot(n: number): unknown }; runAutopilot?(n: number): unknown; state(): unknown }

async function lumaStats(page: Page, png: Buffer) {
  return page.evaluate(async (b64) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
    return { mean: +(sum / (d.length / 4)).toFixed(2), w: c.width, h: c.height };
  }, png.toString("base64"));
}

async function engineInfo(page: Page) {
  return page.evaluate(() => {
    const reg = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__;
    const app = reg?.all()[0];
    if (!app) return { app: false };
    try {
      const dg = app.diagnostics?.();
      return { app: true, renderPath: dg?.renderPath?.path ?? null, drawCalls: dg?.drawCalls ?? null, environment: JSON.stringify(dg?.environment ?? null).slice(0, 400) };
    } catch (e) { return { app: true, diagErr: String(e) }; }
  });
}

async function grab(page: Page, target: string, id: string): Promise<void> {
  const png = await page.screenshot({ type: "png" });
  const jpg = await page.screenshot({ type: "jpeg", quality: 92 });
  const state = await page.evaluate(() => {
    const api = (window as unknown as { __AURA_SPLAT_RUSH__: Api }).__AURA_SPLAT_RUSH__;
    const s = api.state() as Record<string, unknown>;
    return { frameCount: s.frameCount, score: s.score, distance: s.distance };
  });
  log(`GL_META ${JSON.stringify({ target, id, ...(await lumaStats(page, png)), state, info: await engineInfo(page) })}`);
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`GL_JPG ${target} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

test.describe("g16 chroma light", () => {
  test.setTimeout(1_800_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const variant of VARIANTS) {
    test(`g16-${variant}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => log(`GL_ERR ${variant} pageerror ${e.message.slice(0, 300)}`));
      page.on("console", (m) => { if (m.type() === "error") log(`GL_CONSOLE ${variant} ${m.text().slice(0, 200)}`); });
      const q = variant === "ship" ? "" : `&g16n=${variant}`;
      await page.goto(`${server.origin}/examples/splat-rush-port/index.html?manual=1${q}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => (window as unknown as { __AURA_SPLAT_RUSH__?: Api }).__AURA_SPLAT_RUSH__?.ready() === true, undefined, { timeout: 900_000, polling: 1000 });
      await page.evaluate(() => {
        const api = (window as unknown as { __AURA_SPLAT_RUSH__: Api & Record<string, any> }).__AURA_SPLAT_RUSH__;
        api.begin();
        api.stepFrames(45);
        api.runAutopilot(420);
      });
      const t0 = Date.now();
      for (const ms of SETTLE_MS) {
        const wait = ms - (Date.now() - t0);
        if (wait > 0) await page.waitForTimeout(wait);
        await grab(page, variant, `settle-${ms / 1000}s`);
      }
      log(`GL_DONE ${variant}`);
      await ctx.close();
    });
  }
});
