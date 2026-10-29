import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Slingshot Siege audit-fix capture (lane G12). Remote only (tools/remote-acr/run.sh). The ACR run has no artifact egress,
 * so everything goes to the log:
 *   SS_META <json>                        luma stats + engine diagnostics per shot
 *   SS_JPG  <target> <shot> <i>/<n> <b64> canvas+HUD JPEG, chunked
 *   SS_CHECK <json>                       behaviour probes (keys, mute, ammo dock, pools, materials, result card, framing)
 * The software-GL runner presents about one frame every several seconds, so the first shot is not trusted: judge the
 * later settle shots. Gameplay probes drive the sim with the game's own `__SS_PUMP__` (app.advance, no GPU frame), so
 * they do not wait on presented frames. The spec reads only hooks that exist on the base commit, so the same file runs
 * BEFORE and AFTER; hooks added by the fix are read when present.
 */
const SETTLE_SECONDS = (process.env.SS_SETTLE ?? "25,60").split(",").map(Number);
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const READY = "document.body.dataset.aura3dReady === 'true'";
const ROUTE = "/apps/showcase-slingshot-siege/?capture=1";

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
    let sum = 0, dark = 0, clip = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const y = Math.round(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
      hist[y]!++; sum += y;
      if (y <= 8) dark++;
      if (y >= 250) clip++;
    }
    const pct = (p: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= p * n) return v; } return 255; };
    return { mean: +(sum / n).toFixed(2), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95), darkFrac: +(dark / n).toFixed(4), clipFrac: +(clip / n).toFixed(4) };
  }, png.toString("base64"));
}

async function engineInfo(page: Page) {
  return page.evaluate(() => {
    const reg = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__;
    const app = reg?.all()[0];
    if (!app) return { app: false };
    try {
      const dg = app.diagnostics?.();
      return { app: true, renderPath: dg?.renderPath?.path ?? null, quality: dg?.renderPath?.quality ?? null, drawCalls: dg?.drawCalls ?? null, triangles: dg?.triangles ?? null, frame: app.runtime?.frame ?? null };
    } catch (e) { return { app: true, diagErr: String(e) }; }
  });
}

async function grab(page: Page, target: string, id: string, extra: Record<string, unknown> = {}): Promise<void> {
  const png = await page.screenshot({ type: "png" });
  const jpg = await page.screenshot({ type: "jpeg", quality: 72 });
  const stats = await lumaStats(page, png);
  const state = await page.evaluate(() => { try { return (window as any).__SS_STATE__?.(); } catch { return null; } });
  log(`SS_META ${JSON.stringify({ target, id, ...extra, ...stats, info: await engineInfo(page), state: state ? { level: state.level, cameraState: state.cameraState, shotsUsed: state.shotsUsed, resultOpen: state.resultOpen, paused: state.paused, mode: state.mode } : null })}`);
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`SS_JPG ${target} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

const pump = (page: Page, frames: number) => page.evaluate((n) => (window as any).__SS_PUMP__(n), frames);
const state = (page: Page) => page.evaluate(() => (window as any).__SS_STATE__());
const check = (name: string, data: unknown): void => log(`SS_CHECK ${JSON.stringify({ name, data })}`);

async function holdKey(page: Page, code: string): Promise<void> {
  await page.keyboard.down(code);
  await pump(page, 2);
  await page.keyboard.up(code);
  await pump(page, 1);
}

/** Project fixed world points through the live scene camera (independent of any game hook). */
async function framing(page: Page) {
  return page.evaluate(() => {
    const app = (globalThis as any).__AURA3D_LIVE_APPS__?.all()[0];
    const cam = app?.scene?.camera ?? {};
    const canvas = document.querySelector("#app canvas") as HTMLCanvasElement | null;
    const w = canvas?.clientWidth ?? innerWidth, h = canvas?.clientHeight ?? innerHeight;
    const eye = cam.position as number[], tgt = cam.target as number[];
    const fov = ((cam.fov ?? 55) * Math.PI) / 180;
    const f = [tgt[0]! - eye[0]!, tgt[1]! - eye[1]!, tgt[2]! - eye[2]!];
    const fl = Math.hypot(f[0]!, f[1]!, f[2]!); for (let i = 0; i < 3; i++) f[i] = f[i]! / fl;
    const s = [f[1]! * 0 - f[2]! * 1, f[2]! * 0 - f[0]! * 0, f[0]! * 1 - f[1]! * 0];
    const sl = Math.hypot(s[0]!, s[1]!, s[2]!); for (let i = 0; i < 3; i++) s[i] = s[i]! / sl;
    const u = [s[1]! * f[2]! - s[2]! * f[1]!, s[2]! * f[0]! - s[0]! * f[2]!, s[0]! * f[1]! - s[1]! * f[0]!];
    const t = Math.tan(fov / 2), aspect = w / h;
    const project = (p: number[]) => {
      const d = [p[0]! - eye[0]!, p[1]! - eye[1]!, p[2]! - eye[2]!];
      const z = d[0]! * f[0]! + d[1]! * f[1]! + d[2]! * f[2]!;
      const x = (d[0]! * s[0]! + d[1]! * s[1]! + d[2]! * s[2]!) / (z * t * aspect);
      const y = (d[0]! * u[0]! + d[1]! * u[1]! + d[2]! * u[2]!) / (z * t);
      const px = (x * 0.5 + 0.5) * w, py = (0.5 - y * 0.5) * h;
      return { x: Math.round(px), y: Math.round(py), inView: z > 0 && px >= 0 && px <= w && py >= 0 && py <= h };
    };
    return {
      viewport: [w, h], camera: { position: eye, target: tgt, fov: cam.fov },
      slingPouch: project([-7.4, 1.68, 0]), slingBase: project([-7.4, 0.3, 0]),
      fortLeft: project([6.2, 0.6, 0]), fortRight: project([8.2, 0.6, 0]), fortFlag: project([7.2, 5.7, -0.6])
    };
  });
}

async function boot(page: Page, server: ExampleDevServer, name: string, width: number, height: number, query = ""): Promise<void> {
  page.on("pageerror", (e) => log(`SS_ERR ${name} pageerror ${e.message.slice(0, 300)}`));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log(`SS_CONSOLE ${name} ${m.type()} ${m.text().slice(0, 240)}`); });
  await page.setViewportSize({ width, height });
  await page.goto(`${server.origin}${ROUTE}${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY, undefined, { timeout: 420_000, polling: 500 });
}

async function settleShots(page: Page, target: string): Promise<void> {
  const loaded = Date.now();
  for (const sec of SETTLE_SECONDS) {
    const wait = sec * 1000 - (Date.now() - loaded);
    if (wait > 0) await page.waitForTimeout(wait);
    await grab(page, target, `settle-${sec}s`, { sinceReadyMs: Date.now() - loaded });
  }
}

test.describe("slingshot-siege audit fix", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("desktop 1280x720", async ({ page }) => {
    await boot(page, server, "desktop", 1280, 720);
    await settleShots(page, "desktop");
    check("desktop-framing", await framing(page));

    // SS-1: launch with Space, then the edge-triggered actions.
    await holdKey(page, "Space");
    const afterLaunch = await state(page);
    await pump(page, 12);
    const dock = await page.evaluate(() => [...document.querySelectorAll(".ss-ammo-chip")].map((c) => c.className.replace(/\s+/g, " ").trim()));
    check("ammo-dock-after-1-shot", { shotsUsed: afterLaunch.shotsUsed, dock });
    await holdKey(page, "KeyQ");
    const afterQ = await state(page);
    await pump(page, 600);
    const settled = await state(page);
    await holdKey(page, "KeyR");
    const afterR = await state(page);
    await holdKey(page, "KeyP");
    const afterP = await state(page);
    await holdKey(page, "KeyP");
    const afterP2 = await state(page);
    await holdKey(page, "KeyM");
    const afterM = await state(page);
    await holdKey(page, "KeyM");
    const afterM2 = await state(page);
    check("keys", {
      launch: { shotsUsed: afterLaunch.shotsUsed, inFlight: afterLaunch.cameraState },
      q: { abilityReadyBefore: afterLaunch.abilityReady, abilityReadyAfter: afterQ.abilityReady },
      settledShotsUsed: settled.shotsUsed,
      r: { shotsUsedAfter: afterR.shotsUsed },
      p: { pausedAfterFirst: afterP.paused, pausedAfterSecond: afterP2.paused },
      m: { modeAfterFirst: afterM.mode, modeAfterSecond: afterM2.mode }
    });

    // SS-2: mute.
    const muteBefore = await page.evaluate(() => (window as any).__SS_STATE__().audio ?? null);
    await page.evaluate(() => (document.querySelector(".ss-topbar-btn") as HTMLElement | null)?.click());
    const muteAfter = await page.evaluate(() => ({ icon: document.querySelector(".ss-topbar-btn")?.textContent, audio: (window as any).__SS_STATE__().audio ?? null, stored: localStorage.getItem("slingshot-siege-audio") }));
    check("mute", { before: muteBefore, after: muteAfter });
    await page.evaluate(() => (document.querySelector(".ss-topbar-btn") as HTMLElement | null)?.click());

    // SS-5: Gull Keep pool coverage.
    await page.evaluate(() => (window as any).__SS_LEVEL__(24));
    await pump(page, 2);
    const pool = await page.evaluate(() => {
      const app = (globalThis as any).__AURA3D_LIVE_APPS__.all()[0];
      const st = (window as any).__SS_STATE__();
      let visible = 0;
      for (const prefix of ["v-block-", "v-crate-", "v-barrel-", "v-plank-"]) {
        for (let i = 0; i < 120; i++) { const h = app.nodes.get(`${prefix}${i}`); if (h && h.visible) visible++; }
      }
      return { level: st.level, pieces: st.pieces, visiblePieceNodes: visible };
    });
    check("pool-gull-keep", pool);

    // SS-4 / SS-16: glass level then the wood level after it on the Next path.
    await page.evaluate(() => (window as any).__SS_LEVEL__(14));
    await pump(page, 2);
    const looks14 = await page.evaluate(() => (window as any).__SS_DEBUG__?.blockLooks?.(6) ?? null);
    await page.evaluate(() => (window as any).__SS_LEVEL__(15));
    await pump(page, 2);
    const looks15 = await page.evaluate(() => (window as any).__SS_DEBUG__?.blockLooks?.(8) ?? null);
    const nodeMats = await page.evaluate(() => {
      const app = (globalThis as any).__AURA3D_LIVE_APPS__.all()[0];
      return [0, 1, 2, 3].map((i) => { const s = app.nodes.get(`v-block-${i}`)?.snapshot?.(); return s?.material ? { color: s.material.color, opacity: s.material.opacity ?? null } : null; });
    });
    check("block-materials", { level14: looks14, level15: looks15, nodeMaterialsL15: nodeMats });
    await page.waitForTimeout(12_000);
    await grab(page, "desktop", "level15-first-spin");

    // SS-6 / SS-8: result card. Level 1, one launch, pump to the end, then a stray click before the button.
    await page.evaluate(() => { localStorage.removeItem("slingshot-siege-v1"); (window as any).__SS_LEVEL__(0); });
    await pump(page, 2);
    for (let shot = 0; shot < 3; shot++) {
      const s = await state(page);
      if (s.resultOpen) break;
      await holdKey(page, "Space");
      await pump(page, 600);
    }
    await pump(page, 200);
    const result = await page.evaluate(() => ({ state: (window as any).__SS_STATE__(), buttons: [...document.querySelectorAll(".ss-result [data-act]")].map((b) => (b as HTMLElement).dataset.act) }));
    check("result-open", { resultOpen: result.state.resultOpen, level: result.state.level, gulls: result.state.gulls, buttons: result.buttons });
    await page.waitForTimeout(12_000);
    await grab(page, "desktop", "result-card");
    await page.evaluate(() => (document.querySelector(".ss-result-title") as HTMLElement | null)?.click());
    const act = result.buttons.includes("next") ? "next" : "retry";
    await page.evaluate((a) => (document.querySelector(`.ss-result [data-act="${a}"]`) as HTMLElement | null)?.click(), act);
    await pump(page, 2);
    const afterClick = await state(page);
    check("result-stray-click-then-button", { clicked: act, resultOpenAfter: afterClick.resultOpen, levelAfter: afterClick.level });

    // SS-9: range mode must not write stars, and reset stays in range.
    await page.evaluate(() => { localStorage.removeItem("slingshot-siege-v1"); (document.querySelector('.ss-tab[data-mode="range"]') as HTMLElement | null)?.click(); });
    await pump(page, 2);
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => (document.querySelector("#ss-range-fire") as HTMLElement | null)?.click());
      await pump(page, 420);
    }
    await holdKey(page, "KeyR");
    const range = await page.evaluate(() => ({ state: (window as any).__SS_STATE__(), stored: localStorage.getItem("slingshot-siege-v1") }));
    check("range-mode", { level: range.state.level, mode: range.state.mode, savedStars: range.state.savedStars, stored: range.stored });
    await page.evaluate(() => (document.querySelector('.ss-tab[data-mode="siege"]') as HTMLElement | null)?.click());

    // SS-12: late topple watchdog is read from the state after a long pump on level 1.
    // AO pair (LIGHT-06) is a separate URL, below.
  });

  test("phone 390x844", async ({ page }) => {
    await boot(page, server, "phone", 390, 844);
    await settleShots(page, "phone");
    check("phone-framing-aim", await framing(page));
    await holdKey(page, "Space");
    await pump(page, 30);
    await page.waitForTimeout(12_000);
    check("phone-framing-flight", await framing(page));
    await grab(page, "phone", "shot-in-flight");
    await pump(page, 700);
    await page.waitForTimeout(12_000);
    check("phone-framing-after", { framing: await framing(page), state: await state(page) });
    await grab(page, "phone", "after-shot");
  });

  test("desktop ao-off pair", async ({ page }) => {
    await boot(page, server, "desktop-ao-off", 1280, 720, "&ao=0");
    await settleShots(page, "desktop-ao-off");
  });
});
