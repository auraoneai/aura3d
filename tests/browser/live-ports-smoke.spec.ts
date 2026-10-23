import { existsSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * Smoke test for the DEPLOYED port pages (https://aura3d.auraone.ai/apps/showcase-<slug>-port/).
 * The port specs run against the Vite dev server; this one exercises the production build: entry script present,
 * assets/CSS/fonts load, a WebGL canvas boots and draws non-blank pixels, no console/page errors.
 * Remote-runner friendly: results and downsized screenshots are printed into the log (no artifact egress).
 */
const BASE = (process.env.LIVE_BASE ?? "https://aura3d.auraone.ai").replace(/\/$/, "");
const ALL_SLUGS = [
  "strange-orbit", "splat-rush", "serpentine-sky-run", "drift-and-deliver", "heatsink", "ninja-runner",
  "last-train", "roadster-hours", "where-the-wind-wanders", "silt-and-signal", "cloud-runner"
];
// LIVE_SLUGS (env) or an optional tests/browser/live-slugs.txt (remote runs cannot forward env) narrows the run.
const SLUGS_FILE = "tests/browser/live-slugs.txt";
const SLUGS = (process.env.LIVE_SLUGS ?? (existsSync(SLUGS_FILE) ? readFileSync(SLUGS_FILE, "utf8").replace(/\s+/g, ",") : ALL_SLUGS.join(",")))
  .split(",").map((x) => x.trim()).filter(Boolean);
const START_SELECTOR: Record<string, string> = {
  "splat-rush": "#btn-start",
  "silt-and-signal": "#start-button",
  "cloud-runner": "button[data-a='play']",
  "where-the-wind-wanders": "#wwui-begin"
};
const DEFAULT_START = "#start, button#play, [data-action='start'], button.primary";
const BOOT_WAIT_MS = Number(process.env.LIVE_BOOT_WAIT_MS ?? 9000);

interface PixelStats { width: number; height: number; nonBlackFraction: number; distinctColors: number; lumaStdDev: number }

async function pixelStats(page: Page, png: Buffer): Promise<PixelStats> {
  return page.evaluate(async (b64: string) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let nonBlack = 0; let sum = 0; let sum2 = 0; const seen = new Set<number>(); const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i]!; const g = d[i + 1]!; const b = d[i + 2]!;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (luma > 8) nonBlack++;
      sum += luma; sum2 += luma * luma;
      seen.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
    }
    const mean = sum / n;
    return { width: c.width, height: c.height, nonBlackFraction: nonBlack / n, distinctColors: seen.size, lumaStdDev: Math.sqrt(Math.max(0, sum2 / n - mean * mean)) };
  }, png.toString("base64"));
}

interface FrameDiff { changedFraction: number; meanAbsLuma: number }

async function frameDiff(page: Page, a: Buffer, b: Buffer): Promise<FrameDiff> {
  return page.evaluate(async ([ax, bx]: [string, string]) => {
    const load = async (b64: string) => {
      const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
      const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0); return ctx.getImageData(0, 0, c.width, c.height).data;
    };
    const [da, db] = [await load(ax), await load(bx)];
    let changed = 0; let sum = 0; const n = da.length / 4;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.abs((da[i]! + da[i + 1]! + da[i + 2]!) - (db[i]! + db[i + 1]! + db[i + 2]!)) / 3;
      if (d > 6) changed++;
      sum += d;
    }
    return { changedFraction: changed / n, meanAbsLuma: sum / n };
  }, [a.toString("base64"), b.toString("base64")] as [string, string]);
}

/** Numeric leaves of the port's `window.__AURA_<GAME>__` state (first state-like accessor found), plus visible HUD text. */
async function gameSnapshot(page: Page): Promise<{ nums: Record<string, number>; hud: string; hook: string | null; accessor: string | null; drawCalls: number | null; accessorErrors: string[] }> {
  return page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const hook = Object.keys(w).find((k) => /^__AURA_(?!PORT_MODULES|LIVE_APPS|ROUTE_READY)[A-Z0-9_]+__$/.test(k) && !/ERROR/.test(k)) ?? null;
    const nums: Record<string, number> = {};
    let accessor: string | null = null;
    const accessorErrors: string[] = [];
    const flatten = (value: unknown, path: string, depth: number): void => {
      if (typeof value === "number" && Number.isFinite(value)) { nums[path] = value; return; }
      if (depth >= 3 || value === null || typeof value !== "object") return;
      if (Array.isArray(value)) { value.slice(0, 12).forEach((v, i) => flatten(v, `${path}[${i}]`, depth + 1)); return; }
      for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 60)) flatten(v, `${path}.${k}`, depth + 1);
    };
    if (hook) {
      const h = w[hook] as Record<string, unknown>;
      for (const name of ["state", "snapshot", "getState", "summary", "stats", "metrics", "diag"]) {
        const member = h?.[name];
        try {
          const value = typeof member === "function" ? (member as () => unknown)() : member;
          if (value && typeof value === "object") { accessor = name; flatten(value, name, 0); break; }
        } catch (error) { accessorErrors.push(`${name}: ${String((error as Error)?.message ?? error).slice(0, 120)}`); }
      }
    }
    let drawCalls: number | null = null;
    if (hook) {
      const h = w[hook] as Record<string, unknown>;
      const found: number[] = [];
      const walk = (value: unknown, depth: number): void => {
        if (depth > 3 || value === null || typeof value !== "object") return;
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          if (/^drawCalls$/i.test(k) && typeof v === "number") found.push(v);
          else if (typeof v === "object") walk(v, depth + 1);
        }
      };
      for (const name of ["diagnostics", "info", "diag", "state", "snapshot", "frame", "stats", "metrics", "routeHealth"]) {
        const member = h?.[name];
        try { walk(typeof member === "function" ? (member as () => unknown)() : member, 0); } catch { /* accessor needs arguments */ }
      }
      if (found.length) drawCalls = Math.max(...found);
    }
    const hud = Array.from(document.body.querySelectorAll("*"))
      .filter((el) => el.children.length === 0 && el.tagName !== "SCRIPT" && el.tagName !== "STYLE" && (el as HTMLElement).offsetParent !== null)
      .map((el) => (el.textContent ?? "").trim()).filter(Boolean).join("|").slice(0, 600);
    return { nums, hud, hook, accessor, drawCalls, accessorErrors };
  });
}

function changedNumbers(a: Record<string, number>, b: Record<string, number>): string[] {
  return Object.keys(b).filter((k) => k in a && Math.abs(a[k]! - b[k]!) > 1e-6).slice(0, 10).map((k) => `${k}:${a[k]!.toFixed(2)}->${b[k]!.toFixed(2)}`);
}

/** Hold the documented control keys (steer, jump, boost, act) for a few seconds while the game runs. */
const PLAY_KEYS: Record<string, string[]> = {
  // Last Train starts docked: Enter/E open the doors, W is the throttle, P hands the train to its autopilot.
  "last-train": ["Enter", "KeyE", "KeyW", "KeyP", "Space"]
};
async function playFor(page: Page, ms: number, slug: string): Promise<void> {
  const keys = PLAY_KEYS[slug] ?? ["ArrowRight", "ArrowLeft", "ArrowUp", "Space", "KeyD", "KeyA", "KeyW", "ShiftLeft"];
  const end = Date.now() + ms; let i = 0;
  while (Date.now() < end) {
    const key = keys[i++ % keys.length]!;
    await page.keyboard.down(key); await page.waitForTimeout(260); await page.keyboard.up(key);
  }
}

/** Screenshot with every DOM element but the canvases hidden, so overlays/HUD cannot make a blank scene look rendered. */
async function frameRate(page: Page): Promise<number | null> {
  return page.evaluate(() => new Promise<number>((resolve) => {
    let n = 0; const start = performance.now();
    const tick = (): void => { n++; if (performance.now() - start >= 2000) resolve(n / ((performance.now() - start) / 1000)); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }));
}

async function canvasOnlyShot(page: Page): Promise<Buffer> {
  await page.addStyleTag({ content: "html.__canvas-only *{visibility:hidden !important} html.__canvas-only canvas{visibility:visible !important}" });
  await page.evaluate(() => document.documentElement.classList.add("__canvas-only"));
  const shot = await page.screenshot({ type: "png" });
  await page.evaluate(() => document.documentElement.classList.remove("__canvas-only"));
  return shot;
}

/** A blocked page main thread stalls every Playwright call; turn that into a recorded result instead of a test timeout. */
async function guarded<T>(label: string, work: Promise<T>, ms: number, fallback: T, hung: string[]): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((resolve) => { timer = setTimeout(() => { hung.push(`${label} blocked >${ms / 1000}s`); resolve(fallback); }, ms); });
  try { return await Promise.race([work, timeout]); } finally { if (timer) clearTimeout(timer); }
}

for (const slug of SLUGS) {
  test(`live port boots: ${slug}`, async ({ page }) => {
    test.setTimeout(420_000);
    const t0 = Date.now();
    const hung: string[] = [];
    const step = (name: string): void => console.log(`STEP ${slug} ${name} +${Math.round((Date.now() - t0) / 1000)}s`);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    const badResponses: string[] = [];
    const bridgeWarnings: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
      if (/production GLTF bridge|unsafe-url|unsafe model|skipped by the production/i.test(m.text())) bridgeWarnings.push(m.text().slice(0, 240));
    });
    page.on("pageerror", (e) => pageErrors.push(String(e.message ?? e).slice(0, 300)));
    page.on("requestfailed", (r) => failedRequests.push(`${r.url().slice(0, 160)} :: ${r.failure()?.errorText ?? "?"}`));
    page.on("response", (r) => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url().slice(0, 160)}`); });

    const url = `${BASE}/apps/showcase-${slug}-port/`;
    const response = await page.goto(url, { waitUntil: "load", timeout: 90_000 });
    const status = response?.status() ?? 0;

    const scripts = await page.evaluate(() => Array.from(document.querySelectorAll("script[src]")).map((s) => (s as HTMLScriptElement).src));
    await page.waitForTimeout(BOOT_WAIT_MS);

    const canvasInfo = await page.evaluate(() => {
      const canvases = Array.from(document.querySelectorAll("canvas"));
      return canvases.map((c) => ({ id: c.id, width: c.width, height: c.height, hasWebgl: (() => { try { return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } })() }));
    });
    const hooks = await page.evaluate(() => Object.keys(window).filter((k) => /^__AURA_|^__orbit|^__AURA|^__PORT/i.test(k)).slice(0, 12));

    const shot1 = await page.screenshot({ type: "png" });
    const stats1 = await pixelStats(page, shot1);

    // Press the real start control once enabled (boot can take a while on software GL), then play and prove the game advances.
    let started = false;
    let startNote = "";
    step("booted");
    const fpsBoot = await guarded("fps(boot)", frameRate(page), 45_000, null, hung);
    const snapBefore = await gameSnapshot(page);
    const findStart = () => page.evaluate(([sel, fallback]) => {
      const visible = (el: Element) => (el as HTMLElement).offsetParent !== null || getComputedStyle(el).position === "fixed";
      let el = document.querySelector(sel) as HTMLButtonElement | null;
      if (!el || !visible(el)) {
        el = (Array.from(document.querySelectorAll("button, [role='button'], a.btn")) as HTMLButtonElement[])
          .find((b) => visible(b) && new RegExp(fallback, "i").test(`${b.textContent ?? ""} ${b.id}`)) ?? null;
      }
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { id: el.id, text: (el.textContent ?? "").trim().slice(0, 40), disabled: !!el.disabled, x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
    }, [START_SELECTOR[slug] ?? DEFAULT_START, "^\\s*(start|play|begin|tap|go)\\b|start|begin the"] as [string, string]);
    const deadline = Date.now() + 45_000;
    let target = await findStart();
    while ((!target || target.disabled || target.w < 2) && Date.now() < deadline) { await page.waitForTimeout(1000); target = await findStart(); }
    if (target && !target.disabled) {
      // Real pointer events at the control's centre: Playwright's click() waits on rAF-based stability, which starves on software GL.
      await page.mouse.move(target.x, target.y);
      await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up();
      started = true; startNote = `clicked #${target.id} "${target.text}"`;
    } else {
      // Auto-start / key-start / hook-start games: try the documented keys, then the hook's own begin/start.
      for (const key of ["Enter", "Space"]) { await page.keyboard.press(key); await page.waitForTimeout(400); }
      const viaHook = await page.evaluate(() => {
        const w = window as unknown as Record<string, Record<string, unknown>>;
        const hook = Object.keys(w).find((k) => /^__AURA_(?!PORT_MODULES|LIVE_APPS|ROUTE_READY)[A-Z0-9_]+__$/.test(k) && !/ERROR/.test(k));
        const h = hook ? w[hook] : null;
        for (const name of ["begin", "start", "startPlay", "play"]) {
          const fn = h?.[name];
          if (typeof fn === "function") { try { (fn as () => unknown)(); return `${hook}.${name}()`; } catch { /* next */ } }
        }
        return null;
      });
      started = true; startNote = `no start button; pressed Enter/Space${viaHook ? ` and called ${viaHook}` : ""}`;
      const buttons = await page.evaluate(() => Array.from(document.querySelectorAll("button, [role='button']")).slice(0, 14).map((b) => `${b.id || "-"}:${(b.textContent ?? "").trim().slice(0, 24)}:${(b as HTMLElement).offsetParent ? "v" : "h"}${(b as HTMLButtonElement).disabled ? "d" : ""}`));
      startNote += `; buttons=${JSON.stringify(buttons)}`;
    }
    step("started");
    await page.waitForTimeout(1500);
    const snapStart = await gameSnapshot(page);
    const shot2 = await page.screenshot({ type: "png" });
    const stats2 = await pixelStats(page, shot2);
    step("playing");
    await guarded("playFor", playFor(page, 6000, slug), 90_000, undefined, hung);
    step("played");
    const fpsPlay = await guarded("fps(play)", frameRate(page), 45_000, null, hung);
    const snapPlay = await gameSnapshot(page);
    const shot3 = await page.screenshot({ type: "png" });
    const stats3 = await pixelStats(page, shot3);
    const startDiff = await frameDiff(page, shot1, shot2);
    const playDiff = await frameDiff(page, shot2, shot3);
    const stateChanged = changedNumbers(snapStart.nums, snapPlay.nums);
    const hudChanged = snapStart.hud !== snapPlay.hud || snapBefore.hud !== snapStart.hud;
    step("canvas-shot");
    const canvasShot = await guarded("canvasOnlyShot", canvasOnlyShot(page), 90_000, shot3, hung);
    const canvasStats = await pixelStats(page, canvasShot);
    const errorsAfterStart = pageErrors.length + consoleErrors.length;
    const jpeg = await page.screenshot({ type: "jpeg", quality: 45, scale: "css" });

    const summary = {
      slug, url, status, scripts: scripts.map((s) => s.replace(BASE, "")), canvases: canvasInfo, hooks, started, startNote, errorsAfterStart, fpsBoot, fpsPlay, hung,
      beforeStart: stats1, afterStart: stats2, afterPlay: stats3, canvasOnly: canvasStats, drawCalls: snapPlay.drawCalls, bridgeWarnings: bridgeWarnings.slice(0, 4),
      progress: { hook: snapPlay.hook, accessorErrors: snapPlay.accessorErrors, accessor: snapPlay.accessor, stateChanged, numericFields: Object.keys(snapPlay.nums).length, hudChanged, hudBefore: snapBefore.hud.slice(0, 120), hudAfter: snapPlay.hud.slice(0, 120), startDiff, playDiff },
      consoleErrors: consoleErrors.slice(0, 8), pageErrors: pageErrors.slice(0, 8),
      failedRequests: failedRequests.slice(0, 8), badResponses: badResponses.slice(0, 8)
    };
    console.log(`SMOKE_JSON ${JSON.stringify(summary)}`);
    console.log(`SMOKE_IMG ${slug} ${jpeg.toString("base64")}`);

    expect(status, "page status").toBe(200);
    expect(scripts.length, "entry script tag present").toBeGreaterThan(0);
    expect(canvasInfo.length, "a canvas exists").toBeGreaterThan(0);
    const best = stats2.distinctColors >= stats1.distinctColors ? stats2 : stats1;
    expect(best.nonBlackFraction, "canvas draws non-black pixels").toBeGreaterThan(0.02);
    expect(best.distinctColors, "frame has more than a flat colour").toBeGreaterThan(24);
    expect(hung, "page main thread stays responsive (software GL)").toEqual([]);
    expect(bridgeWarnings, "no production-bridge model rejection warnings").toEqual([]);
    expect(canvasStats.nonBlackFraction, "canvas-only pixels are not blank").toBeGreaterThan(0.03);
    expect(canvasStats.distinctColors, "canvas-only frame is more than a flat colour").toBeGreaterThan(24);
    if (snapPlay.drawCalls !== null) expect(snapPlay.drawCalls, "drawCalls > 0").toBeGreaterThan(0);
    expect(startDiff.changedFraction + playDiff.changedFraction > 0.01 || stateChanged.length > 0, "frames change or hook state advances after Start / while input is applied").toBe(true);
    expect(stateChanged.length > 0 || hudChanged, `game state or HUD advances after Start (hook ${snapPlay.hook}, ${Object.keys(snapPlay.nums).length} numeric fields)`).toBe(true);
    expect(pageErrors, "no uncaught page errors").toEqual([]);
    expect(consoleErrors, "no console errors").toEqual([]);
    expect(badResponses, "no 4xx/5xx responses").toEqual([]);
  });
}
