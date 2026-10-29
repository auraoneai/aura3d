import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Audit lane G17 (Serpentine Sky Run): steady-state in-run capture for LIGHT-01 (neutral-room IBL on the PBR runner and
 * the Meshy props), C1 (one GL error froze the renderer) and C2 (QA hook name). Remote only (tools/remote-acr/run.sh);
 * the ACR run has no artifact egress, so output goes to the log:
 *   SSR_META <json>                         luma stats (whole frame, thirds, runner crop, verge crops) + hook and engine state
 *   SSR_JPG  <variant> <shot> <i>/<n> <b64> canvas-only JPEG, chunked
 * The page loads the example (the app wrapper imports the same main.ts) with `?manual=1&autostart=1`, steps the pure
 * simulation a fixed number of idle steps (deterministic, so every variant shows the same road position), then keeps
 * presenting. The software-GL runner draws one frame every several seconds: judge the later shots, never the first.
 * The hook is looked up under both names so the same spec runs on the base (`__AURA_SAIYAN_SNAKE_WAY__`), on v4.3.7 and
 * on the lane branch (`__AURA_SERPENTINE_SKY_RUN__`).
 */
const SETTLE_SECONDS = (process.env.SSR_SETTLE ?? "20,50").split(",").map(Number);
const STEPS = Number(process.env.SSR_STEPS ?? 360);
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";
const HOOK = "(window.__AURA_SERPENTINE_SKY_RUN__ ?? window.__AURA_SAIYAN_SNAKE_WAY__)";
const ERROR = "(window.__AURA_SERPENTINE_SKY_RUN_ERROR__ ?? window.__AURA_SAIYAN_SNAKE_WAY_ERROR__ ?? null)";

interface Variant { readonly name: string; readonly query: string }
/** `env=<n>` is the lane's calibration override of the neutral-environment intensity (world.ts); base and v4.3.7 ignore it. */
const VARIANTS: readonly Variant[] = [
  { name: "v-default", query: "" },
  { name: "v-phone", query: "" },
  { name: "v-env0", query: "&env=0" },
  { name: "v-env1", query: "&env=1" },
  { name: "v-env080", query: "&env=0.8" },
  { name: "v-env060", query: "&env=0.6" },
  { name: "v-env045", query: "&env=0.45" },
  { name: "v-diag", query: "&diag=1" },
  // RP-05: fused bloom (quality auto) against the production chain on the same build
  { name: "v-prod", query: "&aura3d-render=production" }
];

/** Crops as fractions of the frame: x0, y0, x1, y1. The runner sits on the centre line, feet near 79% of the height. */
const CROPS: Readonly<Record<string, readonly [number, number, number, number]>> = {
  runner: [0.44, 0.42, 0.56, 0.82],
  vergeLeft: [0.0, 0.35, 0.3, 0.75],
  vergeRight: [0.7, 0.35, 1.0, 0.75]
};

async function lumaStats(page: Page, png: Buffer) {
  return page.evaluate(async ({ b64, crops }) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const w = c.width, h = c.height;
    const hist = new Uint32Array(256);
    const third = [0, 0, 0], thirdN = [0, 0, 0];
    const cropSum: Record<string, number> = {}, cropN: Record<string, number> = {};
    for (const k of Object.keys(crops)) { cropSum[k] = 0; cropN[k] = 0; }
    let sum = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const y = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
      hist[Math.round(y)]!++; sum += y;
      const px = (i / 4) % w, row = Math.floor(i / 4 / w);
      const band = Math.min(2, Math.floor((row * 3) / h));
      third[band]! += y; thirdN[band]! += 1;
      for (const [k, [x0, y0, x1, y1]] of Object.entries(crops)) {
        if (px >= x0 * w && px < x1 * w && row >= y0 * h && row < y1 * h) { cropSum[k]! += y; cropN[k]! += 1; }
      }
    }
    const pct = (p: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= p * n) return v; } return 255; };
    const crop: Record<string, number> = {};
    for (const k of Object.keys(crops)) crop[k] = +(cropSum[k]! / Math.max(1, cropN[k]!)).toFixed(2);
    return {
      mean: +(sum / n).toFixed(2), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95),
      top: +(third[0]! / thirdN[0]!).toFixed(2), mid: +(third[1]! / thirdN[1]!).toFixed(2), bottom: +(third[2]! / thirdN[2]!).toFixed(2),
      crop
    };
  }, { b64: png.toString("base64"), crops: CROPS });
}

async function pageState(page: Page) {
  return page.evaluate(`(() => {
    const h = ${HOOK};
    const reg = window.__AURA3D_LIVE_APPS__;
    const app = reg && reg.all()[0];
    let diag = null;
    try {
      const dg = app && app.diagnostics ? app.diagnostics() : null;
      diag = dg ? { renderPath: dg.renderPath ? dg.renderPath.path : null, drawCalls: dg.drawCalls ?? null, environment: dg.environment ? { preset: dg.environment.preset, intensity: dg.environment.intensity } : null, warnings: (dg.warnings || []).map(String).filter((w) => /environment|hemisphere|GL|error|deprecat/i.test(w)).slice(0, 6), degradations: (dg.degradations || []).map((d) => d.code + ":" + String(d.message || "").slice(0, 160)).slice(0, 12), quality: app.quality && app.quality.tier ? String(app.quality.tier) : null } : null;
    } catch (e) { diag = { err: String(e) }; }
    let state = null, meta = null;
    try { const s = h.state(); state = { s: s.s, phase: s.phase, laneTarget: s.laneTarget, hasLane: "lane" in s, frame: s.frame }; } catch (e) { state = { err: String(e) }; }
    try { meta = h.meta ? h.meta() : null; } catch (e) { meta = { err: String(e) }; }
    return {
      hook: window.__AURA_SERPENTINE_SKY_RUN__ ? "__AURA_SERPENTINE_SKY_RUN__" : window.__AURA_SAIYAN_SNAKE_WAY__ ? "__AURA_SAIYAN_SNAKE_WAY__" : null,
      error: ${ERROR},
      loadingVisible: !document.getElementById("loading").classList.contains("hidden"),
      state, meta, diag
    };
  })()`);
}

async function grab(page: Page, variant: Variant, id: string, extra: Record<string, unknown>): Promise<void> {
  const handle = await page.addStyleTag({ content: CANVAS_ONLY });
  await page.waitForTimeout(250);
  const png = await page.screenshot({ type: "png" });
  const jpg = await page.screenshot({ type: "jpeg", quality: 72 });
  await handle.evaluate((el) => el.remove());
  const stats = await lumaStats(page, png);
  log(`SSR_META ${JSON.stringify({ variant: variant.name, id, ...extra, ...stats, page: await pageState(page) })}`);
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`SSR_JPG ${variant.name} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

test.describe("g17 serpentine sky run capture", () => {
  test.setTimeout(1_800_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const variant of VARIANTS) {
    test(`${variant.name}`, async ({ page }) => {
      page.on("pageerror", (e) => log(`SSR_ERR ${variant.name} pageerror ${e.message.slice(0, 300)}`));
      page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log(`SSR_CONSOLE ${variant.name} ${m.type()} ${m.text().slice(0, 400)}`); });
      page.on("response", (r) => { if (r.status() >= 400) log(`SSR_HTTP ${variant.name} ${r.status()} ${r.url().replace(server.origin, "").slice(0, 200)}`); });
      await page.setViewportSize(variant.name === "v-phone" ? { width: 390, height: 844 } : { width: 1280, height: 720 });
      await page.goto(`${server.origin}/examples/saiyan-snake-way-port/index.html?manual=1&autostart=1${variant.query}`, { waitUntil: "domcontentloaded" });
      try {
        await page.waitForFunction(`Boolean(${HOOK} && ${HOOK}.ready === true) || Boolean(${ERROR})`, undefined, { timeout: 600_000, polling: 1000 });
      } catch {
        log(`SSR_ERR ${variant.name} not-ready ${JSON.stringify(await pageState(page).catch((e) => ({ evalError: String(e) })))}`);
        return;
      }
      // Idle steps from the check-in line: the runner stays in the centre lane and the first gap (s = 754.5) is far ahead.
      await page.evaluate(`${HOOK}.stepFrames(${STEPS})`);
      const stepped = Date.now();
      for (const sec of SETTLE_SECONDS) {
        const wait = sec * 1000 - (Date.now() - stepped);
        if (wait > 0) await page.waitForTimeout(wait);
        await grab(page, variant, `settle-${sec}s`, { sinceStepMs: Date.now() - stepped, steps: STEPS });
      }
      log(`SSR_DONE ${variant.name}`);
    });
  }
});
