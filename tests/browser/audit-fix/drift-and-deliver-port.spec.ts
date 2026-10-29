import { test, type Page } from "@playwright/test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Audit lane G18 (Gridlock Courier, drift-and-deliver-port): steady-state luma of the HDRI frame against the hemisphere
 * "sky-fill" intensity, for the LIGHT-05 retune (the engine now adds an authored hemisphere next to an environment).
 * Remote only (tools/remote-acr/run.sh); the ACR run has no artifact egress, so output goes to the log:
 *   G18_META <json>                         luma stats (whole frame and top/middle/bottom thirds) + engine diagnostics
 *   G18_JPG  <target> <shot> <i>/<n> <b64>  canvas-only JPEG, chunked
 * The software-GL runner presents about one frame every 5 to 10 s and the HDRI lands after the first frame: judge the
 * last shot. Pattern copied from tests/browser/audit-fix/e2-lighting.spec.ts (lane E2) and game-luma-capture.spec.ts.
 */
const SETTLE_SECONDS = (process.env.G18_SETTLE ?? "45,90").split(",").map(Number);
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";
const READY = "document.body.dataset.aura3dReady === 'true' || Boolean(window.__AURA3D_LIVE_APPS__ && window.__AURA3D_LIVE_APPS__.all().some((a) => (a.diagnostics?.().drawCalls ?? 0) > 0))";

interface Target { readonly name: string; readonly url: string; readonly rows: string }

const TARGETS: readonly Target[] = [
  { name: "g18-default", url: "/examples/drift-and-deliver-port/index.html", rows: "LIGHT-05 retune (shipped default)" },
  { name: "g18-sf000", url: "/examples/drift-and-deliver-port/index.html?skyfill=0", rows: "no hemisphere (the 4.5.0 frame)" },
  { name: "g18-sf060", url: "/examples/drift-and-deliver-port/index.html?skyfill=0.6", rows: "sweep" },
  { name: "g18-sf170", url: "/examples/drift-and-deliver-port/index.html?skyfill=1.7", rows: "authored 1.7 next to the HDRI" },
  { name: "g18-noenv", url: "/examples/drift-and-deliver-port/index.html?env=0", rows: "heal rung no-env (lights-only)" }
];
// Pick targets with `--grep=g18-<name>`.

const REPO_ROOT = process.cwd();
/** First existing `apps/<app>/public/<path>` for a root-relative asset path. */
function appPublicFile(path: string): string | undefined {
  const appsDir = join(REPO_ROOT, "apps");
  if (!existsSync(appsDir)) return undefined;
  for (const app of readdirSync(appsDir)) {
    const file = join(appsDir, app, "public", path);
    if (existsSync(file)) return file;
  }
  return undefined;
}

async function installAssetFallback(page: Page): Promise<void> {
  await page.route(/\/(aura-assets|fonts)\//, async (route) => {
    const response = await route.fetch();
    if (response.status() !== 404) return route.fulfill({ response });
    const path = new URL(route.request().url()).pathname.replace(/^\//, "");
    const file = appPublicFile(path);
    if (!file) return route.fulfill({ response });
    const type = file.endsWith(".glb") ? "model/gltf-binary" : file.endsWith(".css") ? "text/css" : "application/octet-stream";
    return route.fulfill({ status: 200, body: readFileSync(file), headers: { "content-type": type } });
  });
}

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
    let sum = 0, dark = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const y = Math.round(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
      hist[y]!++; sum += y;
      if (y <= 8) dark++;
      const row = Math.floor(i / 4 / c.width);
      const band = Math.min(2, Math.floor((row * 3) / c.height));
      third[band]! += y; thirdN[band]! += 1;
    }
    const pct = (p: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= p * n) return v; } return 255; };
    return {
      mean: +(sum / n).toFixed(2), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95), darkFrac: +(dark / n).toFixed(4),
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
      const post = dg?.post;
      const warnings = (dg?.warnings ?? []).filter((w: unknown) => /hemisphere|contact|ssao|environment|look fill/i.test(String(w))).slice(0, 6);
      return {
        app: true,
        renderPath: dg?.renderPath?.path ?? null,
        drawCalls: dg?.drawCalls ?? null,
        post: post ? { pipeline: post.pipeline, requested: post.requestedPasses, submitted: post.submittedPasses, dropped: post.droppedPasses, missing: post.missingInputs, stagesRan: post.stagesRan ?? null, skipped: (post.skipped ?? []).slice(0, 8) } : null,
        warnings
      };
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
  log(`G18_META ${JSON.stringify({ target: target.name, rows: target.rows, id, ...extra, ...stats, info: await engineInfo(page) })}`);
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`G18_JPG ${target.name} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

test.describe("g18 drift-and-deliver-port sky-fill capture", () => {
  test.setTimeout(1_800_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const target of TARGETS) {
    test(`${target.name}`, async ({ page }) => {
      page.on("pageerror", (e) => log(`G18_ERR ${target.name} pageerror ${e.message.slice(0, 300)}`));
      page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log(`G18_CONSOLE ${target.name} ${m.type()} ${m.text().slice(0, 240)}`); });
      page.on("response", (r) => { if (r.status() >= 400) log(`G18_HTTP ${target.name} ${r.status()} ${r.url().replace(server.origin, "").slice(0, 200)}`); });
      page.on("requestfailed", (r) => log(`G18_REQFAIL ${target.name} ${r.url().replace(server.origin, "").slice(0, 200)} ${r.failure()?.errorText ?? ""}`));
      await installAssetFallback(page);
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`${server.origin}${target.url}`, { waitUntil: "domcontentloaded" });
      try {
        await page.waitForFunction(READY, undefined, { timeout: 360_000, polling: 500 });
      } catch {
        const state = await page.evaluate(() => ({
          title: document.title,
          ready: document.body?.dataset.aura3dReady ?? null,
          apps: (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): unknown[] } }).__AURA3D_LIVE_APPS__?.all().length ?? null,
          canvases: document.querySelectorAll("canvas").length,
          text: (document.body?.innerText ?? "").replace(/\s+/g, " ").slice(0, 200)
        })).catch((e) => ({ evalError: String(e) }));
        log(`G18_ERR ${target.name} not-ready ${JSON.stringify(state)}`);
      }
      const loaded = Date.now();
      for (const sec of SETTLE_SECONDS) {
        const wait = sec * 1000 - (Date.now() - loaded);
        if (wait > 0) await page.waitForTimeout(wait);
        await grab(page, target, `settle-${sec}s`, { sinceReadyMs: Date.now() - loaded });
      }
      log(`G18_DONE ${target.name}`);
    });
  }
});
