import { test, type Browser, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Lane G16 (Chroma Roll, `splat-rush-port`) audit fixes: before/after steady-state captures. Remote only
 * (tools/remote-acr/run.sh, never local Playwright). The run has no artifact egress, so everything goes to the log:
 *   GL_META <json>                         luma, pure-white share, game state, draw calls, texture bytes per shot
 *   GL_JPG  <target> <shot> <i>/<n> <b64>  full-page JPEG, chunked
 *   GL_HIT  <json>                         C3 hit test: the element under the mute button's centre and corners
 * States are driven through the manual QA hooks (the shotsb-chroma states the evidence screens use), so every frame is
 * deterministic; the sim is frozen, and each state is shot again after SETTLE_MS: judge the later shots. Hooks that
 * exist only after the fixes (`setting`, `pause`, `restart`, `presentation`) are optional so the same spec runs on the base.
 */
const SETTLE_MS = Number(process.env.G16_SETTLE_MS ?? 20_000);
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const PARTS = (process.env.G16_PARTS ?? "desk,phone,card,app,popups").split(",");

type Api = Record<string, any>;
const hook = (): Api => (window as unknown as { __AURA_SPLAT_RUSH__: Api }).__AURA_SPLAT_RUSH__;

async function frameStats(page: Page, png: Buffer) {
  return page.evaluate(async (b64) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0, white = 0, dark = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
      sum += l;
      if (d[i]! >= 254 && d[i + 1]! >= 254 && d[i + 2]! >= 254) white++;
      if (l < 16) dark++;
    }
    const n = d.length / 4;
    return { mean: +(sum / n).toFixed(2), whitePct: +((100 * white) / n).toFixed(2), darkPct: +((100 * dark) / n).toFixed(2), w: c.width, h: c.height };
  }, png.toString("base64"));
}

async function engineInfo(page: Page) {
  return page.evaluate(() => {
    const api = (window as unknown as { __AURA_SPLAT_RUSH__?: Record<string, any> }).__AURA_SPLAT_RUSH__;
    let dg: any = null;
    try { dg = api?.diagnostics?.(); } catch { dg = null; }
    const found: Record<string, unknown> = {};
    const walk = (v: unknown, path: string, depth: number): void => {
      if (depth > 4 || v === null || typeof v !== "object") return;
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (/^(drawCalls|textureBytes|bufferBytes|programCompiles|programs|triangles|pixelRatio|path)$/.test(k) && (typeof x === "number" || typeof x === "string")) found[`${path}${k}`] = x;
        else if (typeof x === "object" && !Array.isArray(x)) walk(x, `${path}${k}.`, depth + 1);
      }
    };
    walk(dg, "", 0);
    let pres: unknown = null;
    try { pres = api?.presentation?.() ?? null; } catch { pres = null; }
    const canvas = document.getElementById("world") as HTMLCanvasElement | null;
    return { diag: found, presentation: pres, backing: canvas ? [canvas.width, canvas.height] : null, nodes: api?.nodeCount?.() ?? null, popupsInDom: document.getElementById("popups")?.children.length ?? null };
  });
}

async function grab(page: Page, target: string, id: string): Promise<void> {
  const png = await page.screenshot({ type: "png" });
  const jpg = await page.screenshot({ type: "jpeg", quality: 92 });
  const state = await page.evaluate(() => {
    const s = (window as unknown as { __AURA_SPLAT_RUSH__: Record<string, any> }).__AURA_SPLAT_RUSH__.state() as Record<string, unknown>;
    return { phase: s.phase, frameCount: s.frameCount, score: s.score, distance: s.distance, lives: s.lives, combo: s.combo };
  });
  log(`GL_META ${JSON.stringify({ target, id, ...(await frameStats(page, png)), state, info: await engineInfo(page) })}`);
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`GL_JPG ${target} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

async function open(browser: Browser, server: ExampleDevServer, path: string, viewport: { width: number; height: number }, mobile: boolean, target: string) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => log(`GL_ERR ${target} pageerror ${e.message.slice(0, 300)}`));
  page.on("console", (m) => { if (m.type() === "error") log(`GL_CONSOLE ${target} ${m.text().slice(0, 200)}`); });
  const t0 = Date.now();
  await page.goto(`${server.origin}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (window as unknown as { __AURA_SPLAT_RUSH__?: Api }).__AURA_SPLAT_RUSH__?.ready() === true, undefined, { timeout: 1_200_000, polling: 1000 });
  log(`GL_BOOT ${target} ${Date.now() - t0}ms`);
  return page;
}

const drive = (page: Page, code: string) => page.evaluate((src) => new Function("api", src)((window as unknown as { __AURA_SPLAT_RUSH__: Api }).__AURA_SPLAT_RUSH__), code);

/** The shotsb-chroma states behind evidence/splat-rush-port/screens/final. */
const STATES: { name: string; code: string }[] = [
  { name: "title", code: "" },
  { name: "early", code: "api.begin(); api.stepFrames(45);" },
  { name: "roll", code: "api.runAutopilot(420);" },
  { name: "mid-action", code: "api.runAutopilot(700);" },
  { name: "results", code: 'api.reset(); api.idleUntil("gameOver", 4000);' }
];

async function shootStates(page: Page, target: string): Promise<void> {
  for (const st of STATES) {
    if (st.code) await drive(page, st.code);
    await grab(page, target, `${st.name}-0s`);
    await page.waitForTimeout(SETTLE_MS);
    await grab(page, target, `${st.name}-settled`);
  }
}

test.describe("g16 splat-rush-port audit", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  if (PARTS.includes("desk")) test("desk 1280x720", async ({ browser }) => {
    const page = await open(browser, server, "/examples/splat-rush-port/index.html?manual=1", { width: 1280, height: 720 }, false, "desk");
    await shootStates(page, "desk");
    await page.context().close();
  });

  if (PARTS.includes("phone")) test("phone 390x844", async ({ browser }) => {
    const page = await open(browser, server, "/examples/splat-rush-port/index.html?manual=1", { width: 390, height: 844 }, true, "phone");
    await shootStates(page, "phone");
    await page.context().close();
  });

  /* card@2x framing (1440x900): the roll state at 0/30/60 s, then the states the fixes add (symbols, reduced motion, pause) */
  if (PARTS.includes("card")) test("card 1440x900", async ({ browser }) => {
    const page = await open(browser, server, "/examples/splat-rush-port/index.html?manual=1", { width: 1440, height: 900 }, false, "card");
    await drive(page, "api.begin(); api.stepFrames(45); api.runAutopilot(420);");
    for (const ms of [0, 30_000, 60_000]) {
      if (ms) await page.waitForTimeout(30_000);
      await grab(page, "card", `roll-${ms / 1000}s`);
    }
    const extras = await drive(page, "return { setting: typeof api.setting, pause: typeof api.pause };") as { setting: string; pause: string };
    if (extras.setting === "function") {
      await drive(page, 'api.setting("symbols", true);');
      await page.waitForTimeout(SETTLE_MS);
      await grab(page, "card", "symbols-settled");
      await drive(page, 'api.setting("symbols", false); api.setting("motion", true); api.stepFrames(1);');
      await page.waitForTimeout(SETTLE_MS);
      await grab(page, "card", "reduced-settled");
      await drive(page, 'api.setting("motion", false); api.stepFrames(1);');
    }
    if (extras.pause === "function") {
      await page.evaluate(() => (window as unknown as { __AURA_SPLAT_RUSH__: Api }).__AURA_SPLAT_RUSH__.pause(true));
      await page.waitForTimeout(3000);
      await grab(page, "card", "paused");
    }
    await page.context().close();
  });

  /* C3: the shipped app page (with the credit link) at desktop and phone size; layout only */
  if (PARTS.includes("app")) test("app hit test", async ({ browser }) => {
    for (const [w, h, mobile] of [[1440, 900, false], [1280, 720, false], [390, 844, true]] as const) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await page.goto(`${server.origin}/apps/showcase-splat-rush-port/index.html`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(4000);
      const hit = await page.evaluate(() => {
        const out: Record<string, unknown> = {};
        for (const id of ["btn-mute", "btn-pause"]) {
          const el = document.getElementById(id);
          if (!el) { out[id] = "missing"; continue; }
          const r = el.getBoundingClientRect();
          const pts: [string, number, number][] = [["centre", r.left + r.width / 2, r.top + r.height / 2], ["tl", r.left + 6, r.top + 6], ["tr", r.right - 6, r.top + 6], ["bl", r.left + 10, r.bottom - 10], ["br", r.right - 10, r.bottom - 10]];
          out[id] = { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], hits: Object.fromEntries(pts.map(([k, x, y]) => { const e = document.elementFromPoint(x, y) as HTMLElement | null; return [k, e ? (e.id || e.tagName) : null]; })) };
        }
        const credit = document.querySelector(".aura-credit") as HTMLElement | null;
        const link = credit?.querySelector("a")?.getBoundingClientRect();
        out.credit = credit ? { className: credit.className, link: link ? [Math.round(link.left), Math.round(link.top), Math.round(link.width), Math.round(link.height)] : null } : null;
        return out;
      });
      log(`GL_HIT ${JSON.stringify({ viewport: [w, h], ...hit })}`);
      await ctx.close();
    }
  });

  /* C2: popups keep showing across restarts (after only: needs the `restart` and `presentation` hooks) */
  if (PARTS.includes("popups")) test("popups across restarts", async ({ browser }) => {
    const page = await open(browser, server, "/examples/splat-rush-port/index.html?manual=1", { width: 1280, height: 720 }, false, "popups");
    const has = await drive(page, "return typeof api.restart === 'function';");
    if (!has) { log("GL_POPUPS base build has no restart hook"); await page.context().close(); return; }
    const rows = await page.evaluate(() => {
      const api = (window as unknown as { __AURA_SPLAT_RUSH__: Api }).__AURA_SPLAT_RUSH__;
      const out: unknown[] = [];
      api.begin();
      for (let run = 0; run < 3; run++) {
        if (run > 0) api.restart();
        for (let k = 0; k < 40 && api.state().phase !== "gameOver"; k++) {
          api.runAutopilot(60, k > 12 ? [0, 1, 2, 3] : []);
          const p = api.presentation();
          out.push({ run, k, phase: api.state().phase, popupSeq: p.popupSeq, popupsShown: p.popupsShown, inDom: document.getElementById("popups")!.children.length, ye: api.state().ye });
        }
      }
      return out;
    });
    log(`GL_POPUPS ${JSON.stringify(rows)}`);
    await grab(page, "popups", "after-3-runs");
    await page.context().close();
  });
});
