import { test, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Audit lane G14 (Cross Hop): steady-state captures and live state checks for the CH-* fixes. Remote only
 * (tools/remote-acr/run.sh with EXTRA_DIRS=apps/showcase-cross-hop); the ACR run has no artifact egress, so output goes
 * to the log:
 *   CH_META  <json>                         luma stats (whole frame and thirds) + game beacon + engine diagnostics
 *   CH_STATE <json>                         game beacon at a named step of a scripted check
 *   CH_JPG   <target> <shot> <i>/<n> <b64>  JPEG (canvas only, or the full page with HUD for `-hud` shots), chunked
 * The software-GL runner presents about one frame every several seconds, so judge the later shots, never the first.
 * Targets carry a shard prefix (sa-, sb-) so each shard fits the ACR task limit: SPECS="... --grep=sa-".
 * EXTRA_DIRS must include apps/showcase-port-shared (main.ts imports its quickbar.css).
 * Cross Hop's GLBs live in apps/showcase-cross-hop/public/aura-assets, which the example dev server does not resolve:
 * a route fallback serves them from the app's public tree.
 */
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";
const READY = "document.body.dataset.aura3dReady === 'true' || Boolean(window.__AURA3D_LIVE_APPS__ && window.__AURA3D_LIVE_APPS__.all().some((a) => (a.diagnostics?.().drawCalls ?? 0) > 0))";
const APP = "/apps/showcase-cross-hop/";
const APP_PUBLIC = join(process.cwd(), "apps", "showcase-cross-hop", "public");

async function installAssetFallback(page: Page): Promise<void> {
  await page.route(/\/aura-assets\//, async (route) => {
    const response = await route.fetch();
    if (response.status() !== 404) return route.fulfill({ response });
    const file = join(APP_PUBLIC, new URL(route.request().url()).pathname.replace(/^\//, ""));
    if (!existsSync(file)) return route.fulfill({ response });
    return route.fulfill({ status: 200, body: readFileSync(file), headers: { "content-type": file.endsWith(".glb") ? "model/gltf-binary" : "application/octet-stream" } });
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
    const colours = new Set<number>();
    let sum = 0, dark = 0, clip = 0, rs = 0, gs = 0, bs = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const y = Math.round(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
      hist[y]!++; sum += y; rs += d[i]!; gs += d[i + 1]!; bs += d[i + 2]!;
      if (y <= 8) dark++;
      if (y >= 250) clip++;
      colours.add(((d[i]! >> 5) << 6) | ((d[i + 1]! >> 5) << 3) | (d[i + 2]! >> 5));
      const row = Math.floor(i / 4 / c.width);
      const band = Math.min(2, Math.floor((row * 3) / c.height));
      third[band]! += y; thirdN[band]! += 1;
    }
    const pct = (p: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= p * n) return v; } return 255; };
    return {
      w: c.width, h: c.height,
      mean: +(sum / n).toFixed(2), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95),
      darkFrac: +(dark / n).toFixed(4), clipFrac: +(clip / n).toFixed(4), coarseColours: colours.size,
      rgb: [+(rs / n).toFixed(1), +(gs / n).toFixed(1), +(bs / n).toFixed(1)],
      top: +(third[0]! / Math.max(1, thirdN[0]!)).toFixed(2), mid: +(third[1]! / Math.max(1, thirdN[1]!)).toFixed(2), bottom: +(third[2]! / Math.max(1, thirdN[2]!)).toFixed(2)
    };
  }, png.toString("base64"));
}

async function beacon(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const b = (window as unknown as { __AURA3D_CROSS_HOP__?: Record<string, unknown> }).__AURA3D_CROSS_HOP__;
    const reg = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__;
    const app = reg?.all()[0];
    let diag: Record<string, unknown> = {};
    // First `textureBytes` anywhere in the diagnostics tree (materials diagnostics), for the restart-loop leak check.
    const findKey = (o: unknown, key: string, depth = 0): unknown => {
      if (!o || typeof o !== "object" || depth > 4) return undefined;
      if (key in (o as Record<string, unknown>)) return (o as Record<string, unknown>)[key];
      for (const v of Object.values(o as Record<string, unknown>)) { const f = findKey(v, key, depth + 1); if (f !== undefined) return f; }
      return undefined;
    };
    try {
      const dg = app?.diagnostics?.();
      diag = { renderPath: dg?.renderPath?.path ?? null, bloomFusion: dg?.renderPath?.bloomFusion ?? null, drawCalls: dg?.drawCalls ?? null, textureBytes: findKey(dg, "textureBytes") ?? null };
    } catch (e) { diag = { diagErr: String(e) }; }
    const active = document.activeElement;
    return {
      frame: b?.frame ?? null, state: b?.state ?? null, events: b?.events ?? null, look: b?.look ?? null,
      deadCard: !document.getElementById("ch-dead")?.classList.contains("hidden"),
      deathText: document.getElementById("ch-death-sub")?.textContent ?? null,
      focused: active && active !== document.body ? `${active.tagName.toLowerCase()}#${active.id}` : null,
      ...diag
    };
  });
}

async function grab(page: Page, target: string, id: string, hud = false): Promise<void> {
  const handle = hud ? null : await page.addStyleTag({ content: CANVAS_ONLY });
  await page.waitForTimeout(250);
  const png = await page.screenshot({ type: "png" });
  const jpg = await page.screenshot({ type: "jpeg", quality: 72 });
  await handle?.evaluate((el) => el.remove());
  const stats = await lumaStats(page, png);
  log(`CH_META ${JSON.stringify({ target, id, ...stats, game: await beacon(page) })}`);
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`CH_JPG ${target} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

async function state(page: Page, target: string, step: string): Promise<Record<string, unknown>> {
  const b = await beacon(page);
  log(`CH_STATE ${JSON.stringify({ target, step, t: Date.now(), ...b })}`);
  return b;
}

/** Poll the game beacon until `pred` holds or `ms` elapses; returns the last beacon. */
async function until(page: Page, pred: (b: any) => boolean, ms: number): Promise<any> {
  const end = Date.now() + ms;
  let b = await beacon(page);
  while (!pred(b) && Date.now() < end) { await page.waitForTimeout(1000); b = await beacon(page); }
  return b;
}

async function open(page: Page, target: string, query: string, width: number, height: number): Promise<number> {
  page.on("pageerror", (e) => log(`CH_ERR ${target} pageerror ${e.message.slice(0, 300)}`));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log(`CH_CONSOLE ${target} ${m.type()} ${m.text().slice(0, 240)}`); });
  page.on("response", (r) => { if (r.status() >= 400) log(`CH_HTTP ${target} ${r.status()} ${r.url().slice(0, 200)}`); });
  await installAssetFallback(page);
  await page.setViewportSize({ width, height });
  await page.goto(`${serverOrigin}${APP}${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY, undefined, { timeout: 420_000, polling: 500 });
  return Date.now();
}

async function settle(page: Page, loaded: number, sec: number): Promise<void> {
  const wait = sec * 1000 - (Date.now() - loaded);
  if (wait > 0) await page.waitForTimeout(wait);
}

let serverOrigin = "";

test.describe("cross hop audit capture", () => {
  test.setTimeout(2_400_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); serverOrigin = server.origin; });
  test.afterAll(async () => { await server.close(); });

  // Steady-state look of a played run (autopilot) on desktop and phone.
  for (const [name, w, h] of [["sa-desk-play", 1280, 720], ["sa-phone-play", 390, 844]] as const) {
    test(name, async ({ page }) => {
      const loaded = await open(page, name, "?seed=7&autoplay=1", w, h);
      for (const sec of [30, 90]) { await settle(page, loaded, sec); await grab(page, name, `settle-${sec}s`); }
      await grab(page, name, "settle-90s-hud", true);
      log(`CH_DONE ${name}`);
    });
  }

  // CH-10 / LIGHT-04: Emberline and Neon District looks added at runtime next to the authored ambient.
  for (const theme of [3, 4]) {
    const name = `sa-desk-theme${theme}`;
    test(name, async ({ page }) => {
      const loaded = await open(page, name, `?seed=7&theme=${theme}`, 1280, 720);
      // Keep the critter alive on row 0 (the hawk comes there after a 3 s grace since CH-17, and the death card fades
      // the frame by 25%): step left and back to column 0 before each shot, so the camera pose matches a run that
      // never moved.
      for (const sec of [30, 75]) {
        await settle(page, loaded, sec - 20);
        await page.keyboard.press("ArrowLeft");
        await until(page, (b) => b.state?.mode !== "run" || (b.state?.time ?? 0) > 0, 1000);
        await page.waitForTimeout(8000);
        await page.keyboard.press("ArrowRight");
        await settle(page, loaded, sec);
        await grab(page, name, `settle-${sec}s`);
      }
      log(`CH_DONE ${name}`);
    });
  }

  // RP-05 game side: the same theme 0 run with the 4.3.7 render path and bloom passes pinned.
  test("sa-desk-production", async ({ page }) => {
    const name = "sa-desk-production";
    const loaded = await open(page, name, "?seed=7&autoplay=1&aura3d-render=production", 1280, 720);
    for (const sec of [30, 90]) { await settle(page, loaded, sec); await grab(page, name, `settle-${sec}s`); }
    log(`CH_DONE ${name}`);
  });

  // RH-05: retake the inventory's evidence screens (same names and sizes as evidence/cross-hop/screens/final).
  for (const [vw, w, h] of [["1280", 1280, 720], ["390", 390, 844]] as const) {
    const name = `sc-screens-${vw}`;
    test(name, async ({ page }) => {
      let loaded = await open(page, name, "?autostart=0", w, h);
      await settle(page, loaded, 25);
      await grab(page, name, `${vw}-01-title`, true);
      await page.evaluate(() => (document.querySelector('#ch-menu button[data-m="quick"]') as HTMLElement | null)?.click());
      await page.waitForTimeout(30_000);
      await grab(page, name, `${vw}-02-early`, true);
      for (let i = 0; i < 3; i++) { await page.keyboard.press("ArrowUp"); await page.waitForTimeout(8_000); }
      await grab(page, name, `${vw}-03-action`, true);
      await page.goto(`${serverOrigin}${APP}?seed=7&autoplay=1`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(READY, undefined, { timeout: 420_000, polling: 500 });
      loaded = Date.now();
      await settle(page, loaded, 90);
      await grab(page, name, `${vw}-04-mid`, true);
      log(`CH_DONE ${name}`);
    });
  }
  test("sc-screens-card", async ({ page }) => {
    const name = "sc-screens-card";
    const loaded = await open(page, name, "?seed=7&autoplay=1", 1440, 900);
    await settle(page, loaded, 90);
    await grab(page, name, "card-2x", true);
    log(`CH_DONE ${name}`);
  });

  // Drill frame (Train Dodges through the Timing School menu) and the 20-restart texture-bytes loop.
  test("sd-desk-drill-restarts", async ({ page }) => {
    const name = "sd-desk-drill-restarts";
    const loaded = await open(page, name, "?autostart=0", 1280, 720);
    await settle(page, loaded, 10);
    await page.evaluate(() => (document.querySelector('#ch-menu button[data-m="school"]') as HTMLElement | null)?.click());
    await page.waitForTimeout(2000);
    await page.evaluate(() => (document.querySelector('button[data-drill="train-dodges"]') as HTMLElement | null)?.click());
    await page.waitForTimeout(40_000);
    await grab(page, name, "drill-train-dodges-hud", true);
    await state(page, name, "drill");
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("KeyR");
      await page.waitForTimeout(6_000);
      const b = await state(page, name, `restart-${i + 1}`);
      if (i === 19) log(`CH_TEXBYTES ${JSON.stringify({ restarts: 20, textureBytes: b.textureBytes })}`);
    }
    log(`CH_DONE ${name}`);
  });

  // CH-6 restart look, CH-7 Space re-clicking the focused button, death card, CH-9 restart lockout.
  test("sb-desk-flow", async ({ page }) => {
    const name = "sb-desk-flow";
    const loaded = await open(page, name, "?seed=7&mode=tour&theme=4", 1280, 720);
    await settle(page, loaded, 40);
    await grab(page, name, "neon-tour");
    // CH-6: Quick Play from the quick bar after a Neon District run. A real click, so the button keeps focus (CH-7).
    await page.click("#ch-bar-quick");
    await page.waitForTimeout(40_000);
    await grab(page, name, "quick-after-neon");
    await state(page, name, "quick-after-neon");
    // CH-7: one hop, then Space. With the bug, Space also activates the focused Quick Play button and restarts the run.
    await page.keyboard.press("ArrowUp");
    await until(page, (b) => (b.state?.row ?? 0) >= 1 && b.state?.mode === "run", 60_000);
    await state(page, name, "after-arrowup");
    await page.keyboard.press("Space");
    await page.waitForTimeout(20_000);
    await state(page, name, "after-space");
    // Death card: hop off row 0 (the base build never sends the hawk to row 0), then stand still until the hawk takes
    // the critter (HAWK_KILL 5.2 s of game time).
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(15_000);
    await state(page, name, "before-hawk-wait");
    const dead = await until(page, (b) => b.state?.mode === "dead", 1_200_000);
    await state(page, name, "dead");
    if (dead.state?.mode === "dead") {
      await grab(page, name, "death-card-hud", true);
      // CH-9: a key press right after death must not skip the card.
      await page.keyboard.press("ArrowLeft");
      await page.waitForTimeout(4000);
      await state(page, name, "dead+key+4s");
      await page.waitForTimeout(40_000);
      await page.keyboard.press("ArrowLeft");
      await page.waitForTimeout(20_000);
      await state(page, name, "dead+key-late");
    }
    log(`CH_DONE ${name}`);
  });
});
