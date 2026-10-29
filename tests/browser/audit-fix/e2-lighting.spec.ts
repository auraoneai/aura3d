import { test, type Page } from "@playwright/test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Audit lane E2 (lighting and forward pass): steady-state luma of every game the hemisphere (LIGHT-05/08), runtime look
 * fill (LIGHT-04) and SSAO-normals changes reach. Remote only (tools/remote-acr/run.sh); the ACR run has no artifact
 * egress, so output goes to the log:
 *   E2_META <json>                         luma stats (whole frame and top/middle/bottom thirds) + engine diagnostics
 *   E2_JPG  <target> <shot> <i>/<n> <b64>  canvas-only JPEG, chunked
 * Targets carry a shard prefix (s1-..s7-, p1-..p4-, about three per shard) so one image can run as parallel `--grep=sN-` shards inside the 3600 s task
 * limit. The software-GL runner presents about one frame every 5 to 10 s and HDRI/baked probes land seconds after the
 * first frame: judge the last shot, never the first.
 * Ports load their example page (the app wrapper imports the same `examples/<dir>/main.ts`, and the dev server's app
 * bundle breaks the examples' `new URL("./assets/...", import.meta.url)` model paths). App-level `public/aura-assets`
 * files the dev server does not resolve (Cross Hop's GLBs) are served from the app's public tree by a route fallback.
 */
const SETTLE_SECONDS = (process.env.E2_SETTLE ?? "30,75").split(",").map(Number);
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";
const READY = "document.body.dataset.aura3dReady === 'true' || Boolean(window.__AURA3D_LIVE_APPS__ && window.__AURA3D_LIVE_APPS__.all().some((a) => (a.diagnostics?.().drawCalls ?? 0) > 0))";

interface Target { readonly name: string; readonly url: string; readonly rows: string }

const TARGETS: readonly Target[] = [
  // LIGHT-05: authored hemisphere next to an environment node.
  { name: "s1-roadster-rush", url: "/apps/showcase-roadster-rush/", rows: "LIGHT-05" },
  { name: "s1-heatsink", url: "/apps/showcase-heatsink/", rows: "LIGHT-05" },
  { name: "s1-teleoperator", url: "/apps/showcase-teleoperator/", rows: "LIGHT-05" },
  { name: "s2-slingshot-siege", url: "/apps/showcase-slingshot-siege/", rows: "LIGHT-05" },
  { name: "p3-cloud-runner-port", url: "/examples/kid-goku-beyond-the-clouds-port/index.html", rows: "LIGHT-05 SSAO" },
  { name: "p3-drift-and-deliver-port", url: "/examples/drift-and-deliver-port/index.html", rows: "LIGHT-05" },
  { name: "p2-ninja-runner-port", url: "/examples/ninja-runner-port/index.html", rows: "LIGHT-05" },
  { name: "p2-silt-and-signal-port", url: "/examples/silt-and-signal-port/index.html", rows: "LIGHT-05" },
  { name: "s3-links-stAuroras", url: "/apps/showcase-aura-links-3d/?course=stAuroras", rows: "LIGHT-05" },
  { name: "s4-links-cinderRim", url: "/apps/showcase-aura-links-3d/?course=cinderRim", rows: "LIGHT-05" },
  { name: "s4-links-neonBay", url: "/apps/showcase-aura-links-3d/?course=neonBay", rows: "LIGHT-08" },
  { name: "s4-links-mareCourse", url: "/apps/showcase-aura-links-3d/?course=mareCourse", rows: "LIGHT-08" },
  // LIGHT-08: lights-only scenes whose hemisphere was a flat mean.
  { name: "p1-heatsink-port", url: "/examples/heatsink-port/index.html", rows: "LIGHT-08" },
  { name: "p1-splat-rush-port", url: "/examples/splat-rush-port/index.html", rows: "LIGHT-08" },
  { name: "p1-serpentine-sky-run-port", url: "/examples/saiyan-snake-way-port/index.html", rows: "LIGHT-08" },
  { name: "p2-strange-orbit-port", url: "/examples/strange-orbit-port/index.html", rows: "LIGHT-08" },
  { name: "s6-top-tennis", url: "/apps/showcase-top-tennis/", rows: "LIGHT-08" },
  { name: "s6-bunker-zero", url: "/apps/showcase-bunker-zero/", rows: "LIGHT-08 SSAO" },
  { name: "s7-dot-dash-3d", url: "/apps/showcase-dot-dash-3d/", rows: "LIGHT-08 SSAO" },
  // LIGHT-04: a look swapped in at runtime next to an authored ambient.
  { name: "p4-crosshop-theme3", url: "/apps/showcase-cross-hop/?theme=3", rows: "LIGHT-04" },
  { name: "p4-crosshop-theme4", url: "/apps/showcase-cross-hop/?theme=4", rows: "LIGHT-04" },
  // SSAO normals input.
  { name: "p3-last-train-port", url: "/examples/last-train-port/index.html", rows: "SSAO" }
];

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
  log(`E2_META ${JSON.stringify({ target: target.name, rows: target.rows, id, ...extra, ...stats, info: await engineInfo(page) })}`);
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`E2_JPG ${target.name} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

test.describe("e2 lighting capture", () => {
  // Heavy scenes (Shadowstep Gauntlet) need more than 15 min at one frame every several seconds.
  test.setTimeout(1_800_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const target of TARGETS) {
    test(`${target.name}`, async ({ page }) => {
      page.on("pageerror", (e) => log(`E2_ERR ${target.name} pageerror ${e.message.slice(0, 300)}`));
      page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log(`E2_CONSOLE ${target.name} ${m.type()} ${m.text().slice(0, 240)}`); });
      page.on("response", (r) => { if (r.status() >= 400) log(`E2_HTTP ${target.name} ${r.status()} ${r.url().replace(server.origin, "").slice(0, 200)}`); });
      page.on("requestfailed", (r) => log(`E2_REQFAIL ${target.name} ${r.url().replace(server.origin, "").slice(0, 200)} ${r.failure()?.errorText ?? ""}`));
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
        log(`E2_ERR ${target.name} not-ready ${JSON.stringify(state)}`);
      }
      const loaded = Date.now();
      for (const sec of SETTLE_SECONDS) {
        const wait = sec * 1000 - (Date.now() - loaded);
        if (wait > 0) await page.waitForTimeout(wait);
        await grab(page, target, `settle-${sec}s`, { sinceReadyMs: Date.now() - loaded });
      }
      log(`E2_DONE ${target.name}`);
    });
  }
});
