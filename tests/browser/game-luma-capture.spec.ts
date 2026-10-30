import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { glMetaInPage, glPairInPage, type LumaPixelRect } from "./game-luma-stats";
import { GAME_LUMA_TARGETS, type GameLumaTarget } from "./game-luma-targets";

/**
 * Game-level luma capture at steady state for every live game and every lighting variant (park, court, course, venue,
 * stage, world, theme, chapter, band, floor, circuit, district, sky). Used for the 4.3.7-vs-4.5.0 lighting comparison
 * (audit LIGHT-02, RH-03, RH-11) and the GU47 before/after look captures. Remote only (tools/remote-acr/run.sh); the ACR
 * run has no artifact egress, so output goes to the log:
 *   GL_META <json>                         one row per shot: the v1 luma stats (mean, p5/p50/p95, darkFrac, clipFrac, 3x3
 *                                          grid means), engine `info`, then the GL_META v2 fields (`gl: 2`): per-frame,
 *                                          per-cell and per-crop RGB, hue, stddev, percentiles, Laplacian variance and
 *                                          edge density, histograms (tests/browser/game-luma-stats.ts documents them)
 *   GL_PAIR <json>                         with GL_PAIR_MS=<ms>: a second screenshot <ms> after each shot and the
 *                                          frame, per-cell and per-crop difference (mean |dY|, changed fraction, SSIM)
 *   GL_JPG  <target> <shot> <i>/<n> <b64>  canvas-only JPEG, chunked (`<shot>-pair` for the second shot of a pair)
 *   GL_LFS  <target> <path>                a binary asset served as a Git LFS pointer stub (lesson V1: black frame)
 * Decode with evidence/audit-fix/e5/decode-luma.mjs (frames and v1 table) and tools/look-metrics/region-luma.mjs (cells,
 * crops, bands, pairs, before/after compare).
 * Crops: a game publishes named rects normalised to its main canvas in `window.__AURA_QA__.crops` or as a `crops` extra on
 * its QA hook (`window.__AURA_<NAME>__.crops`); a target may also declare static `crops`.
 * Target names are `<inventory slug>--<variant> @g<N>`: select a run group with `--grep=@g3`, or one game with
 * `--grep=aura-diamond-3d--` (the ACR step runs SPECS through /bin/sh, so no parentheses or pipes in a grep).
 * tests/browser/game-luma-targets.ts is the single target list; tests/unit/game-luma-targets.test.ts checks that every
 * live game in docs/workflows/game-inventory.json has at least one target.
 * The software-GL runner presents about one frame every 5 to 10 s, and a baked environment probe lands several seconds
 * after the first frame, so the shots start at 25 s after ready (GL_SETTLE overrides; the 4.5.0 harness also took a 3 s shot,
 * which read the analytic floor probe): judge the 25 s and 60 s shots. One screenshot per shot; on the runner a shot costs
 * 50 to 110 s, so a target takes about 4 minutes (twice that with GL_PAIR_MS). GL_TEX_WAIT_S=<s> waits up to <s> seconds
 * before each shot while the app reports textured materials still pending (lesson R4); every row records
 * `info.texPending` either way.
 */

const SETTLE_SECONDS = (process.env.GL_SETTLE ?? "25,60").split(",").map(Number);
const PAIR_MS = Math.max(0, Number(process.env.GL_PAIR_MS ?? 0) || 0);
const TEX_WAIT_MS = Math.max(0, Number(process.env.GL_TEX_WAIT_S ?? 0) || 0) * 1000;
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";
const READY = "document.body.dataset.aura3dReady === 'true' || Boolean(window.__AURA3D_LIVE_APPS__ && window.__AURA3D_LIVE_APPS__.all().some((a) => (a.diagnostics?.().drawCalls ?? 0) > 0))";
const BINARY_ASSET = /\.(glb|gltf|bin|hdr|exr|ktx2|basis|png|jpe?g|webp|avif|mp3|ogg|wav)$/i;
const LFS_POINTER = "version https://git-lfs.github.com/spec/v1";

async function engineInfo(page: Page) {
  return page.evaluate(() => {
    const reg = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__;
    const app = reg?.all()[0];
    if (!app) return { app: false };
    try {
      const dg = app.diagnostics?.();
      const rows: { status?: string }[] = dg?.renderer?.runtime?.texturedMaterials ?? [];
      let triangles: number | null = typeof dg?.triangles === "number" ? dg.triangles : null;
      if (triangles === null) {
        try { const info = typeof app.info === "function" ? app.info() : app.info; triangles = info?.render?.triangles ?? null; } catch { /* info is optional */ }
      }
      return {
        app: true, renderPath: dg?.renderPath?.path ?? null, drawCalls: dg?.drawCalls ?? null,
        triangles, textureBytes: typeof dg?.textureBytes === "number" ? dg.textureBytes : null,
        texPending: rows.filter((r) => r?.status === "pending").length, texTotal: rows.length
      };
    } catch (e) { return { app: true, diagErr: String(e) }; }
  });
}

/** GL_TEX_WAIT_S: wait (bounded) while the app still reports pending textured materials. */
async function waitForTextures(page: Page): Promise<void> {
  if (TEX_WAIT_MS <= 0) return;
  const pending = "(() => { const a = window.__AURA3D_LIVE_APPS__?.all()[0]; const rows = a?.diagnostics?.()?.renderer?.runtime?.texturedMaterials ?? []; return !rows.some((r) => r && r.status === 'pending'); })()";
  await page.waitForFunction(pending, undefined, { timeout: TEX_WAIT_MS, polling: 2000 }).catch(() => undefined);
}

function logJpeg(target: string, id: string, b64: string): void {
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`GL_JPG ${target} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

async function screenshotCanvas(page: Page): Promise<Buffer> {
  return page.screenshot({ type: "png" });
}

async function grab(page: Page, target: GameLumaTarget, id: string, extra: Record<string, unknown>): Promise<void> {
  await waitForTextures(page);
  const handle = await page.addStyleTag({ content: CANVAS_ONLY });
  await page.waitForTimeout(250);
  const png = await screenshotCanvas(page);
  const shotAt = Date.now();
  // Crops are read in the page right after the screenshot; the JPEG is encoded there from the same pixels (a second
  // page.screenshot costs another presented frame, which is tens of seconds per shot on the software-GL runner).
  const meta = await page.evaluate(glMetaInPage, { png: png.toString("base64"), crops: target.crops ?? [] });
  const info = await engineInfo(page);
  // GL_META v1 fields keep their names and order (decode-luma.mjs); the v2 fields follow `info`.
  log(`GL_META ${JSON.stringify({ target: target.name, id, ...extra, ...meta.v1, info, ...meta.v2 })}`);
  logJpeg(target.name, id, meta.jpeg);
  if (PAIR_MS > 0) await pair(page, target, id, png, shotAt, meta.rects, extra);
  await handle.evaluate((el) => el.remove());
}

async function pair(page: Page, target: GameLumaTarget, id: string, first: Buffer, firstAt: number, rects: readonly LumaPixelRect[], extra: Record<string, unknown>): Promise<void> {
  const wait = PAIR_MS - (Date.now() - firstAt);
  if (wait > 0) await page.waitForTimeout(wait);
  if (target.pairAdvance) await target.pairAdvance(page);
  const second = await screenshotCanvas(page);
  const elapsedMs = Date.now() - firstAt;
  const { diff, jpeg } = await page.evaluate(glPairInPage, { a: first.toString("base64"), b: second.toString("base64"), rects });
  log(`GL_PAIR ${JSON.stringify({ target: target.name, id, slug: extra.slug, variant: extra.variant, gapMs: PAIR_MS, elapsedMs, diff })}`);
  logJpeg(target.name, `${id}-pair`, jpeg);
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
      page.on("response", (r) => {
        const path = new URL(r.url()).pathname;
        if (r.status() >= 400) { log(`GL_HTTP ${target.name} ${r.status()} ${path}`); return; }
        // Lesson V1: an LFS pointer stub (a ~130-byte text file) served in place of a model or texture blanks the scene.
        if (r.status() !== 200 || !BINARY_ASSET.test(path)) return;
        const length = Number(r.headers()["content-length"] ?? NaN);
        if (Number.isFinite(length) && length > 1024) return;
        void r.body().then((body) => { if (body.length <= 1024 && body.toString("latin1").startsWith(LFS_POINTER)) log(`GL_LFS ${target.name} ${path}`); }).catch(() => undefined);
      });
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
        await grab(page, target, `settle-${sec}s`, { slug: target.slug, variant: target.variant, sinceReadyMs: Date.now() - loaded });
      }
      log(`GL_DONE ${target.name}`);
    });
  }
});
