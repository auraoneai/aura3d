import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Audit lane E2 (lighting and forward pass): steady-state luma of every game the hemisphere (LIGHT-05/08), runtime look
 * fill (LIGHT-04) and SSAO-normals changes reach. Remote only (tools/remote-acr/run.sh); the ACR run has no artifact
 * egress, so output goes to the log:
 *   E2_META <json>                         luma stats (whole frame and top/middle/bottom thirds) + engine diagnostics
 *   E2_JPG  <target> <shot> <i>/<n> <b64>  canvas-only JPEG, chunked
 * Targets carry a shard prefix (s1-..s4-) so one image can run as parallel `--grep=sN-` shards inside the 3600 s task
 * limit. The software-GL runner presents about one frame every 5 to 10 s and HDRI/baked probes land seconds after the
 * first frame: judge the last shot, never the first.
 */
const SETTLE_SECONDS = [30, 75];
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
  { name: "s1-slingshot-siege", url: "/apps/showcase-slingshot-siege/", rows: "LIGHT-05" },
  { name: "s1-cloud-runner-port", url: "/apps/showcase-cloud-runner-port/", rows: "LIGHT-05 SSAO" },
  { name: "s1-drift-and-deliver-port", url: "/apps/showcase-drift-and-deliver-port/", rows: "LIGHT-05" },
  { name: "s2-ninja-runner-port", url: "/apps/showcase-ninja-runner-port/", rows: "LIGHT-05" },
  { name: "s2-silt-and-signal-port", url: "/apps/showcase-silt-and-signal-port/", rows: "LIGHT-05" },
  { name: "s2-links-stAuroras", url: "/apps/showcase-aura-links-3d/?course=stAuroras", rows: "LIGHT-05" },
  { name: "s2-links-cinderRim", url: "/apps/showcase-aura-links-3d/?course=cinderRim", rows: "LIGHT-05" },
  { name: "s2-links-neonBay", url: "/apps/showcase-aura-links-3d/?course=neonBay", rows: "LIGHT-08" },
  { name: "s2-links-mareCourse", url: "/apps/showcase-aura-links-3d/?course=mareCourse", rows: "LIGHT-08" },
  // LIGHT-08: lights-only scenes whose hemisphere was a flat mean.
  { name: "s3-heatsink-port", url: "/apps/showcase-heatsink-port/", rows: "LIGHT-08" },
  { name: "s3-splat-rush-port", url: "/apps/showcase-splat-rush-port/", rows: "LIGHT-08" },
  { name: "s3-serpentine-sky-run-port", url: "/apps/showcase-serpentine-sky-run-port/", rows: "LIGHT-08" },
  { name: "s3-strange-orbit-port", url: "/apps/showcase-strange-orbit-port/", rows: "LIGHT-08" },
  { name: "s3-top-tennis", url: "/apps/showcase-top-tennis/", rows: "LIGHT-08" },
  { name: "s4-bunker-zero", url: "/apps/showcase-bunker-zero/", rows: "LIGHT-08 SSAO" },
  { name: "s4-dot-dash-3d", url: "/apps/showcase-dot-dash-3d/", rows: "LIGHT-08 SSAO" },
  // LIGHT-04: a look swapped in at runtime next to an authored ambient.
  { name: "s4-crosshop-theme3", url: "/apps/showcase-cross-hop/?theme=3", rows: "LIGHT-04" },
  { name: "s4-crosshop-theme4", url: "/apps/showcase-cross-hop/?theme=4", rows: "LIGHT-04" },
  // SSAO normals input.
  { name: "s4-last-train-port", url: "/apps/showcase-last-train-port/", rows: "SSAO" }
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
        post: post ? { requested: post.requestedPasses, submitted: post.submittedPasses, dropped: post.droppedPasses, missing: post.missingInputs } : null,
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
  test.setTimeout(900_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const target of TARGETS) {
    test(`${target.name}`, async ({ page }) => {
      page.on("pageerror", (e) => log(`E2_ERR ${target.name} pageerror ${e.message.slice(0, 300)}`));
      page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log(`E2_CONSOLE ${target.name} ${m.type()} ${m.text().slice(0, 240)}`); });
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`${server.origin}${target.url}`, { waitUntil: "domcontentloaded" });
      try {
        await page.waitForFunction(READY, undefined, { timeout: 360_000, polling: 500 });
      } catch {
        log(`E2_ERR ${target.name} not-ready`);
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
