import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Apex Overdrive (roadster-rush) audit fix capture, before and after. Remote only (tools/remote-acr/run.sh, software WebGL2).
 * The run has no artifact egress, so everything goes to the log:
 *   GL_META <json>                         luma stats (canvas only), probe numbers and engine diagnostics per shot
 *   GL_JPG  <target> <shot> <i>/<n> <b64>  full-page JPEG (HUD included), chunked
 *   GL_PROBE <json>                        state probes (audio, pause, pools) that need no frame
 * Every state is shot twice; the frame loop presents about one frame every few seconds and the baked environment lands
 * after the first frames, so judge the second shot (`.b`).
 */
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";
const BASE = "/apps/showcase-roadster-rush/";

async function frames(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __AURA3D_GAME_EVIDENCE__?: { framesRendered?: number } }).__AURA3D_GAME_EVIDENCE__?.framesRendered ?? 0);
}

/** Present one frame of the current (manually stepped) state and wait until the loop has drawn it a few times. */
async function settle(page: Page, extraFrames = 3): Promise<void> {
  const before = await frames(page);
  await page.evaluate(() => (window as unknown as { __AURA3D_SHOWCASE_ROADSTER_RUSH__?: { app?: { step(dt: number): void } } }).__AURA3D_SHOWCASE_ROADSTER_RUSH__?.app?.step(1 / 60));
  try {
    await page.waitForFunction((n) => ((window as unknown as { __AURA3D_GAME_EVIDENCE__?: { framesRendered?: number } }).__AURA3D_GAME_EVIDENCE__?.framesRendered ?? 0) >= n, before + extraFrames, { timeout: 6 * 60_000, polling: 500 });
  } catch { /* capture anyway; the meta line records the frame count */ }
  await page.waitForTimeout(400);
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
    let sum = 0, dark = 0, clip = 0, sat = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i]!, g = d[i + 1]!, b = d[i + 2]!;
      const y = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
      hist[y]!++; sum += y;
      if (y < 12) dark++;
      if (y >= 250) clip++;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      sat += mx === 0 ? 0 : (mx - mn) / mx;
    }
    const pct = (p: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= p * n) return v; } return 255; };
    return { mean: +(sum / n).toFixed(2), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95), darkFrac: +(dark / n).toFixed(4), clipFrac: +(clip / n).toFixed(4), meanSat: +(sat / n).toFixed(4) };
  }, png.toString("base64"));
}

/** Simulation entities within 120 m ahead against what the renderer draws, plus audio, draw calls and diagnostics. */
async function probe(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const g = w.__GAME__?.game;
    const hook = w.__AURA3D_SHOWCASE_ROADSTER_RUSH__;
    if (!g || !hook) return { ok: false };
    const pz = g.player.position.z;
    const within = (arr: Array<{ z: number }>) => arr.filter((e) => pz - e.z >= 0 && pz - e.z <= 120).length;
    const sim = {
      ground: within(g.traffic.vehicles),
      heavy: within(g.traffic.vehicles.filter((v: { type: string }) => ["boxtruck", "bus", "carrier"].includes(v.type))),
      sky: within(g.traffic.skyCars),
      bolts: within(g.traffic.pickups.filter((p: { kind: string }) => p.kind === "bolt")),
      powerups: within(g.traffic.pickups.filter((p: { kind: string }) => p.kind !== "bolt")),
      gantries: within(g.world.gantries.map((x: { position: { z: number } }) => ({ z: x.position.z })))
    };
    let drawn: unknown = hook.evidence?.drawn ?? null;
    if (!drawn) {
      // previous build: one node per drawn entity; count visible ones within 120 m ahead (z is camera-relative there)
      const count = (prefix: string): number => {
        let n = 0;
        for (let i = 0; i < 400; i++) {
          const h = hook.app.nodes.get(`${prefix}${i}`);
          if (!h) break;
          const z = (h.position as number[])[2]!;
          if (h.visible && z <= 0.5 && z >= -120) n++;
        }
        return n;
      };
      let ground = 0, heavy = 0;
      for (const t of ["sedan", "hatch", "suv", "taxi", "van", "pickup", "boxtruck", "bus", "carrier"]) {
        const n = count(`traffic-${t}-`);
        ground += n;
        if (["boxtruck", "bus", "carrier"].includes(t)) heavy += n;
      }
      drawn = { ground, heavy, sky: count("sky-car-"), bolts: count("pickup-bolt-"), powerups: count("pickup-power-"), gantries: count("gantry-beam-") };
    }
    let diag: Record<string, unknown> = {};
    try {
      const d = hook.app.diagnostics();
      const lights = d?.lights ?? d?.lighting ?? null;
      diag = {
        renderPath: d?.renderPath?.path ?? d?.renderPath ?? null,
        drawCalls: d?.drawCalls ?? null,
        passes: d?.passes ?? d?.renderPasses ?? d?.post?.passes ?? null,
        lights: lights ? JSON.stringify(lights).slice(0, 1500) : null,
        effects: d?.effects ? JSON.stringify(d.effects).slice(0, 800) : null,
        keys: Object.keys(d ?? {}).slice(0, 60)
      };
    } catch (e) { diag = { err: String(e) }; }
    const ctx = g.audio?.manager?.context;
    return {
      ok: true,
      mode: g.mode,
      paused: g.paused,
      assisted: g.assisted ?? null,
      distance: Math.round(g.distance),
      score: Math.floor(g.score),
      best: g.best,
      audio: ctx?.state ?? null,
      drawCalls: g.getState().drawCalls,
      sim,
      drawn,
      trafficYaw: hook.evidence?.trafficYawOffset ?? null,
      titleVisible: Boolean(document.querySelector(".rr-title:not(.rr-hidden)")),
      diag
    };
  });
}

async function shoot(page: Page, target: string, id: string, extra: Record<string, unknown> = {}): Promise<void> {
  const handle = await page.addStyleTag({ content: CANVAS_ONLY });
  await page.waitForTimeout(200);
  const png = await page.screenshot({ type: "png" });
  await handle.evaluate((el) => el.remove());
  await page.waitForTimeout(200);
  const jpg = await page.screenshot({ type: "jpeg", quality: 84 });
  const stats = await lumaStats(page, png);
  log(`GL_META ${JSON.stringify({ target, id, frames: await frames(page), ...extra, ...stats, probe: await probe(page) })}`);
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`GL_JPG ${target} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

/** Shoot a state twice: `.a` right after it is presented, `.b` a few frames later (the one to judge). */
async function shootState(page: Page, target: string, id: string): Promise<void> {
  await settle(page);
  await shoot(page, target, `${id}.a`);
  await settle(page, 3);
  await shoot(page, target, `${id}.b`);
}

const takeManual = (page: Page) => page.evaluate(() => {
  const g = (window as unknown as Record<string, any>).__GAME__.game;
  g.manual = true;
  g.mode = "title";
  g.start();
  g.manual = true;
});

const run = (page: Page, steps: number, opts: { shieldEvery?: number; weave?: boolean } = {}) => page.evaluate(({ steps, shieldEvery, weave }) => {
  const g = (window as unknown as Record<string, any>).__GAME__.game;
  g.manual = true;
  for (let i = 0; i < steps; i++) {
    if (shieldEvery && i % shieldEvery === 0) g.triggerAction("pickup", { kind: "shield" });
    if (weave && i % 30 === 0) g.triggerAction(i % 60 === 0 ? "left" : "right");
    g.simStep(1 / 60);
    if (g.mode === "gameover" && shieldEvery) g.start();
  }
  g.manual = true;
}, { steps, shieldEvery: opts.shieldEvery ?? 0, weave: opts.weave ?? false });

const scenario = (page: Page, name: string) => page.evaluate((n) => {
  const w = window as unknown as Record<string, any>;
  w.__AURA3D_SHOWCASE_ROADSTER_RUSH__.triggerScenario(n);
  w.__GAME__.game.manual = true;
}, name);

async function boot(page: Page, query: string): Promise<boolean> {
  await page.goto(`${server.origin}${BASE}${query}`, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 25 * 60_000, polling: 1000 });
    return true;
  } catch {
    log(`GL_PROBE ${JSON.stringify({ query, ready: false })}`);
    return false;
  }
}

let server: ExampleDevServer;

test.describe("audit-fix roadster-rush", () => {
  test.setTimeout(3_300_000);
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const [mode, w, h] of [["desktop", 1280, 720], ["phone", 390, 844]] as const) {
    test(`roadster-rush ${mode}`, async ({ browser }) => {
      const target = `${w}x${h}`;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(mode === "phone" ? { hasTouch: true, isMobile: true } : {}) });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(`pageerror ${e.message.slice(0, 300)}`));
      page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()} ${m.text().slice(0, 240)}`); });
      page.on("response", (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url().slice(0, 160)}`); });
      if (!(await boot(page, "?seed=42"))) return;
      // title: whatever the page shows before any input
      await page.waitForTimeout(2000);
      await shootState(page, target, "title");
      log(`GL_PROBE ${JSON.stringify({ target, step: "boot", ...(await probe(page)) })}`);
      // first gesture: does the first input start sound (RR-5)?
      if (mode === "phone") await page.touchscreen.tap(Math.round(w / 2), Math.round(h / 2));
      else await page.keyboard.press("Space");
      await page.waitForTimeout(1500);
      log(`GL_PROBE ${JSON.stringify({ target, step: "after-first-gesture", ...(await probe(page)) })}`);
      // tab hidden (RR-9)
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.waitForTimeout(800);
      log(`GL_PROBE ${JSON.stringify({ target, step: "hidden", ...(await probe(page)) })}`);
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.waitForTimeout(500);
      log(`GL_PROBE ${JSON.stringify({ target, step: "visible-again", ...(await probe(page)) })}`);

      // deterministic states, manual stepping from a fresh seed-42 run
      await takeManual(page);
      await run(page, 60);
      await shootState(page, target, "gameplay-early");
      await page.evaluate(() => (window as unknown as Record<string, any>).__GAME__.game.triggerAction("pickup", { kind: "shield" }));
      await scenario(page, "ramp");
      await run(page, 30);
      await shootState(page, target, "key-ramp");
      if (mode === "desktop") {
        await run(page, 480);
        await shootState(page, target, "mid-drive");
      }
      // dense traffic: 50 s more of play, kept alive with a shield (RR-1, RR-4, RR-E1)
      await run(page, 3000, { shieldEvery: 120, weave: true });
      await shootState(page, target, "dense-50s");
      await scenario(page, "sky");
      await run(page, 45);
      await shootState(page, target, "sky");
      // a real crash and the results card (assisted runs do not set the best score after the fix)
      await page.evaluate(() => {
        const g = (window as unknown as Record<string, any>).__GAME__.game;
        g.player.shieldTimer = 0; g.player.rocketTimer = 0; g.player.graceTimer = 0;
        g.triggerAction("crash");
        g.manual = true;
        for (let i = 0; i < 240 && g.mode !== "gameover"; i++) g.simStep(1 / 60);
        g.manual = true;
      });
      await shootState(page, target, "results");
      log(`GL_PROBE ${JSON.stringify({ target, step: "errors", errors: errors.slice(0, 30), errorCount: errors.length })}`);
      await ctx.close();
    });
  }

  test("roadster-rush bloom: auto against production chain (RP-05, game side)", async ({ browser }) => {
    for (const [tag, query] of [["auto", "?seed=42&capture=1"], ["production", "?seed=42&capture=1&aura3d-render=production"]] as const) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await ctx.newPage();
      if (await boot(page, query)) {
        await takeManual(page);
        await run(page, 60);
        await shootState(page, `bloom-${tag}`, "gameplay-early");
      }
      await ctx.close();
    }
  });

  test("roadster-rush card", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 720, height: 450 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    if (await boot(page, "?seed=42&capture=1")) {
      await takeManual(page);
      await page.evaluate(() => (window as unknown as Record<string, any>).__GAME__.game.triggerAction("pickup", { kind: "shield" }));
      await scenario(page, "ramp");
      await run(page, 90);
      await shootState(page, "1440x900", "card.2x");
      const png = await page.screenshot({ type: "png" });
      const b64 = await page.evaluate(async (p) => {
        const img = new Image(); img.src = `data:image/png;base64,${p}`; await img.decode();
        const c = document.createElement("canvas"); c.width = 720; c.height = 450;
        const g2 = c.getContext("2d")!; g2.imageSmoothingQuality = "high"; g2.drawImage(img, 0, 0, 720, 450);
        return c.toDataURL("image/jpeg", 0.9).split(",")[1]!;
      }, png.toString("base64"));
      const n = Math.ceil(b64.length / CHUNK);
      for (let i = 0; i < n; i++) log(`GL_JPG 720x450 card.1x ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
    }
    await ctx.close();
  });
});
