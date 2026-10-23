import { existsSync, readFileSync } from "node:fs";
import { test, type Browser, type Page } from "@playwright/test";

/**
 * Deterministic parity baseline for the deployed Aura Slam 3D page (apps/showcase-top-tennis).
 * Method: the game ships `window.advanceTime(ms)` (manual stepping at a fixed 1/60 s) and the sim is seeded from game
 * time only. The page is booted WITHOUT ?autoplay, then in one synchronous evaluate the match is configured and launched
 * and `advanceTime` is called per step, so the real-time rAF loop never interleaves. Engine events are captured by
 * wrapping `window.TennisEngine.create` before the game scripts run.
 * Results are printed to the log as SLAM_DATA chunks / SLAM_FRAME chunks; tools/aura-slam/extract.mjs decodes them.
 */
const BASE = (process.env.SLAM_BASE ?? "https://aura3d.auraone.ai").replace(/\/$/, "");
const URL = `${BASE}/apps/showcase-top-tennis/`;
const MODE_FILE = "tests/browser/aura-slam-mode.txt";
const MODE = (process.env.SLAM_MODE ?? (existsSync(MODE_FILE) ? readFileSync(MODE_FILE, "utf8").trim() : "all")).split(/[\s,]+/);
const SESSIONS = Number(process.env.SLAM_SESSIONS ?? 2);

interface Scenario { id: string; difficulty: string; venue: string; autoplay: boolean; maxSteps: number; policy: "none" | "human" }
const SCENARIOS: Scenario[] = [
  { id: "auto-beginner-hard", difficulty: "beginner", venue: "hard", autoplay: true, maxSteps: 90000, policy: "none" },
  { id: "auto-club-grass", difficulty: "club", venue: "grass", autoplay: true, maxSteps: 90000, policy: "none" },
  { id: "auto-pro-clay", difficulty: "pro", venue: "clay", autoplay: true, maxSteps: 90000, policy: "none" },
  { id: "auto-legend-hard", difficulty: "legend", venue: "hard", autoplay: true, maxSteps: 90000, policy: "none" },
  { id: "auto-beginner-moon", difficulty: "beginner", venue: "moon", autoplay: true, maxSteps: 90000, policy: "none" },
  { id: "manual-human-policy", difficulty: "beginner", venue: "hard", autoplay: false, maxSteps: 6000, policy: "human" }
];
const VENUES = ["hard", "grass", "clay", "desert", "beach", "moon"];

function out(tag: string, name: string, payload: unknown, chunk = 60000): void {
  const s = typeof payload === "string" ? payload : JSON.stringify(payload);
  const n = Math.max(1, Math.ceil(s.length / chunk));
  for (let i = 0; i < n; i++) console.log(`${tag} ${name} ${i + 1}/${n} ${s.slice(i * chunk, (i + 1) * chunk)}`);
}

const INIT = () => {
  const w = window as any;
  w.__slamEvents = []; w.__slamRenders = 0; w.__slamStep = 0;
  let te: any;
  const wrap = (f: any) => {
    if (!f || typeof f.create !== "function") return f;
    return new Proxy(f, {
      get(target, prop) {
        if (prop !== "create") return target[prop];
        return (opts: any) => {
          const o = { ...opts }; const oe = o.onEvent; let ref: any = null;
          o.onEvent = (e: any) => {
            try {
              w.__slamEvents.push({ step: w.__slamStep, t: ref?.state?.time ?? null, type: e.type, side: e.side ?? null, shot: e.shot ?? null, won: e.won ?? null,
                args: Array.isArray(e.args) ? e.args.map((a: any) => (typeof a === "number" ? +a.toFixed(4) : a)) : null,
                contact: e.contact ? { x: +e.contact.x.toFixed(4), y: +e.contact.y.toFixed(4), speedKph: e.contact.speedKph ?? null, vz: e.contact.verticalSpeed != null ? +e.contact.verticalSpeed.toFixed(4) : null, venue: e.contact.venue ?? null, stroke: e.contact.stroke ?? null } : null });
            } catch { /* ignore */ }
            return oe?.(e);
          };
          ref = target.create(o);
          return ref;
        };
      }
    });
  };
  Object.defineProperty(window, "TennisEngine", { configurable: true, get: () => te, set: (v) => { te = wrap(v); } });
  let ts: any;
  Object.defineProperty(window, "TennisScene", { configurable: true, get: () => ts, set: (v) => {
    ts = v && typeof v.createRenderer === "function" ? new Proxy(v, { get(t, p) { if (p !== "createRenderer") return t[p]; return (c: any) => { const r = t.createRenderer(c); const orig = r.render; r.render = (...a: any[]) => { w.__slamRenders++; return orig.apply(r, a); }; return r; }; } }) : v;
  } });
};

async function openPage(browser: Browser, viewport: { width: number; height: number }, dsf = 1): Promise<{ page: Page; close: () => Promise<void>; errors: string[] }> {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dsf });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  await page.addInitScript(INIT);
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", null, { timeout: 240_000 });
  await page.bringToFront();
  await page.waitForFunction(() => { const d = (window as any).TennisMenu?.debug?.(); return !!d && !(d.introRemaining > 0); }, null, { timeout: 60_000 }).catch(() => undefined);
  await page.waitForTimeout(400);
  return { page, close: () => context.close(), errors };
}

async function runWithRetry(browser: Browser, sc: Scenario, opts: { stopAt?: number; capturePredicates?: boolean; record?: boolean }, viewport = { width: 320, height: 180 }) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const o = await openPage(browser, viewport);
    const res = await runScenario(o.page, sc, opts);
    if (!res.configMismatch) return { ...o, res, attempts: attempt };
    console.log(`SLAM_NOTE config mismatch ${sc.id} attempt ${attempt} ${JSON.stringify(res.configMismatch)}`);
    await o.close();
  }
  throw new Error(`could not apply scenario config for ${sc.id}`);
}

/** Runs one scenario synchronously inside the page. `stopAt` (steps) lets frame sessions stop at a recorded step. */
async function runScenario(page: Page, sc: Scenario, opts: { stopAt?: number; capturePredicates?: boolean; record?: boolean }): Promise<any> {
  return page.evaluate(({ sc, opts }) => {
    const w = window as any;
    const ctl = w.__TOP_TENNIS_CONTROL__;
    const FIX = 1000 / 60;
    // --- configure through the same UI hooks a player uses
    const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
    const menu0 = w.TennisMenu.debug();
    q(`[data-difficulty="${sc.difficulty}"]`)?.click();
    const vb = q(`[data-aura-venue="${sc.venue}"]`);
    if (vb) vb.click(); else w.TennisLocal.selectVenue(sc.venue);
    const auto = document.getElementById("aura-btn-auto") as HTMLElement | null;
    if (auto && auto.classList.contains("active") !== sc.autoplay) auto.click();
    w.__slamEvents.length = 0; w.__slamStep = 0;
    const renders0 = w.__slamRenders;
    w.TennisMenu.launch();
    const st = () => ctl.getState();
    {
      const s0 = st();
      const autoOn = !!document.getElementById("aura-btn-auto")?.classList.contains("active");
      if (s0.venue !== sc.venue || s0.difficulty !== sc.difficulty || s0.mode !== "playing" || autoOn !== sc.autoplay) {
        return { configMismatch: { venue: s0.venue, difficulty: s0.difficulty, mode: s0.mode, autoOn, menu0, menu1: w.TennisMenu.debug() } };
      }
    }
    const r = (v: number) => Math.round(v * 1e6) / 1e6;
    const snap = () => {
      const s = st(), b = s.ball, p = s.player, a = s.ai;
      return [r(s.time), s.mode, s.phase, s.server, s.serveNumber, s.score.playerPoints, s.score.aiPoints, s.score.playerGames, s.score.aiGames, s.rallyHits, s.tiebreak ? 1 : 0,
        r(b.x), r(b.y), r(b.z), r(b.vx), r(b.vy), r(b.vz), b.active ? 1 : 0, b.bounceCount, b.lastHit, r(b.speedKph ?? 0),
        r(p.x), r(p.y), r(p.vx), r(p.vy), r(p.swing), p.stroke, r(p.moveBlend), r(p.stride),
        r(a.x), r(a.y), r(a.vx), r(a.vy), r(a.swing), a.stroke, r(a.moveBlend), r(a.stride), s.message || "", r(s.energy ?? 0)];
    };
    // FNV-1a (two 32-bit lanes) over a stable string form of each snapshot
    let h1 = 0x811c9dc5 | 0, h2 = 0x01000193 | 0;
    const feed = (str: string) => { for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ (c + 31), 2246822519 | 0); } };
    const trace: any[] = []; const sampled: any[] = []; const timeline: any[] = []; const inputs: any[] = []; const preds: any[] = [];
    const held = new Set<string>();
    const key = (code: string, down: boolean, step: number) => {
      if (down === held.has(code)) return; if (down) held.add(code); else held.delete(code);
      inputs.push({ step, code, down });
      document.body.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, key: code, bubbles: true, cancelable: true }));
    };
    // deterministic scripted "human" policy (state-only): move toward the ball's landing spot, hit when close, serve at once
    const policy = (step: number) => {
      const s = st(); const b = s.ball; const p = s.player;
      if (s.mode !== "playing") { return; }
      if (s.phase === "serve" && s.server === "player") { if (step % 90 === 30) { key("Space", true, step); } else key("Space", false, step); return; }
      if (s.phase === "serveToss") { key("Space", false, step); return; }
      if (s.phase === "rally" && b.active && b.lastHit === "ai" && b.vy > 0) {
        const tx = Math.max(-0.92, Math.min(0.92, b.targetX ?? b.x)), ty = Math.max(0.68, Math.min(1.06, (b.targetY ?? 0.82) + 0.08));
        key("KeyD", tx - p.x > 0.05, step); key("KeyA", tx - p.x < -0.05, step); key("KeyS", ty - p.y > 0.05, step); key("KeyW", ty - p.y < -0.05, step);
        const d = Math.hypot((b.x - p.x) * 1.05, b.y - p.y);
        if (d <= 0.3 && p.swing <= 0 && p.swingCooldown <= 0 && step % 4 === 0) key("Space", true, step); else if (step % 4 === 2) key("Space", false, step);
      } else { for (const c of ["KeyA", "KeyD", "KeyW", "KeyS"]) key(c, false, step); if (step % 4 === 2) key("Space", false, step); }
    };
    const seen = new Set<string>(); let prevGames = 0; let prevPoints = 0;
    const mark = (name: string, step: number) => { if (!seen.has(name)) { seen.add(name); preds.push({ name, step }); } };
    const t0 = performance.now();
    feed(JSON.stringify(snap())); if (opts.record) trace.push(snap());
    let step = 0; const maxSteps = opts.stopAt ?? sc.maxSteps;
    // first advance call switches the game into manual stepping (before any rAF can run)
    for (step = 1; step <= maxSteps; step++) {
      w.__slamStep = step;
      if (sc.policy === "human") policy(step);
      w.advanceTime(FIX);
      const row = snap(); feed(JSON.stringify(row));
      const s = st();
      if (opts.record) trace.push(row);
      if (step % 10 === 0 || step < 200) sampled.push([step, ...row]);
      const games = s.score.playerGames + s.score.aiGames, pts = s.score.playerPoints + s.score.aiPoints;
      if (games !== prevGames || (pts !== prevPoints)) { timeline.push({ step, t: r(s.time), pg: s.score.playerGames, ag: s.score.aiGames, pp: s.score.playerPoints, ap: s.score.aiPoints, phase: s.phase, winner: s.pointWinner ?? null, tb: s.tiebreak }); }
      if (opts.capturePredicates) {
        if (step === 1) mark("serve-ready", step);
        if (s.phase === "serveToss" && s.ball.z >= 0.55) mark("serve-toss", step);
        if (s.phase === "rally" && s.ball.active && Math.abs(s.ball.y) < 0.14 && s.rallyHits >= 2) mark("rally-near-net", step);
        if (s.phase === "rally" && s.ball.active && s.ball.z < 0.16 && s.ball.bounceCount >= 1) mark("ball-at-bounce", step);
        if (s.phase === "serveFault") mark("serve-fault", step);
        if (s.phase === "point") mark("point-won", step);
        if (games > prevGames && games >= 1) mark("game-won", step);
        if (s.mode === "gameover") mark("match-over", step);
      }
      prevGames = games; prevPoints = pts;
      if (s.mode === "gameover") { step++; break; }
    }
    const steps = step - 1;
    const s = st();
    const ev = w.__slamEvents.slice();
    const counts: Record<string, number> = {}; for (const e of ev) counts[e.type] = (counts[e.type] ?? 0) + 1;
    const deep = (o: any, depth = 0, acc: Record<string, number> = {}): Record<string, number> => {
      if (!o || depth > 4 || typeof o !== "object") return acc;
      for (const k of Object.keys(o).slice(0, 60)) { const v = (o as any)[k]; if (typeof v === "number" && /drawCalls|triangles|textures|geometries|programs|nodes/i.test(k)) acc[k] = v; else if (v && typeof v === "object") deep(v, depth + 1, acc); }
      return acc;
    };
    let diag: any = null; try { diag = deep(w.__AURA3D_SHOWCASE_TOP_TENNIS__?.app?.diagnostics?.()); } catch { /* ignore */ }
    return {
      scenario: sc.id, steps, finalMode: s.mode, finalPhase: s.phase, winner: s.winner ?? null, matchWon: s.matchWon ?? null,
      score: { pg: s.score.playerGames, ag: s.score.aiGames, pp: s.score.playerPoints, ap: s.score.aiPoints }, stats: s.stats,
      digest: `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`,
      renders: w.__slamRenders - renders0, msPerStep: (performance.now() - t0) / Math.max(1, steps), eventCounts: counts, events: opts.record || opts.capturePredicates ? ev : ev.slice(0, 0), eventCount: ev.length,
      timeline, inputs, preds, sampled: opts.capturePredicates || opts.record ? sampled : [], trace: opts.record ? trace : undefined, diag,
      focus: document.hasFocus(), difficulty: s.difficulty, venue: s.venue, heap: (performance as any).memory?.usedJSHeapSize ?? null
    };
  }, { sc, opts });
}

const imageMetrics = async (lab: Page, png: Buffer) => lab.evaluate(async (b64: string) => {
  const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
  const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data; const n = d.length / 4;
  const lh = new Array(32).fill(0), rh = new Array(32).fill(0), gh = new Array(32).fill(0), bh = new Array(32).fill(0);
  let sr = 0, sg = 0, sb = 0, sl = 0; const luma = new Float32Array(n);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const R = d[i]!, G = d[i + 1]!, B = d[i + 2]!, L = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    luma[p] = L; sl += L; sr += R; sg += G; sb += B; lh[Math.min(31, L >> 3)]++; rh[R >> 3]++; gh[G >> 3]++; bh[B >> 3]++;
  }
  let edges = 0; const W = c.width, H = c.height;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; const gx = -luma[i - W - 1]! - 2 * luma[i - 1]! - luma[i + W - 1]! + luma[i - W + 1]! + 2 * luma[i + 1]! + luma[i + W + 1]!;
    const gy = -luma[i - W - 1]! - 2 * luma[i - W]! - luma[i - W + 1]! + luma[i + W - 1]! + 2 * luma[i + W]! + luma[i + W + 1]!;
    if (Math.hypot(gx, gy) > 96) edges++;
  }
  const norm = (a: number[]) => a.map((v) => +(v / n).toFixed(6));
  return { width: W, height: H, meanLuma: +(sl / n).toFixed(3), meanRGB: [+(sr / n).toFixed(3), +(sg / n).toFixed(3), +(sb / n).toFixed(3)], edgeDensity: +(edges / n).toFixed(6), lumaHist: norm(lh), rHist: norm(rh), gHist: norm(gh), bHist: norm(bh) };
}, png.toString("base64"));

test.describe.configure({ mode: "serial" });

test("aura slam state reference", async ({ browser }) => {
  test.skip(!MODE.includes("state") && !MODE.includes("all"), "mode");
  test.setTimeout(3_000_000);
  const ids = (process.env.SLAM_SCENARIOS ?? "").split(",").filter(Boolean);
  const only = existsSync("tests/browser/aura-slam-scenarios.txt") ? readFileSync("tests/browser/aura-slam-scenarios.txt", "utf8").trim().split(/[\s,]+/) : ids;
  const list = SCENARIOS.filter((s) => only.length === 0 || only.includes(s.id));
  for (const sc of list) {
    const sessions: any[] = [];
    for (let k = 0; k < SESSIONS; k++) {
      const { close, errors, res, attempts } = await runWithRetry(browser, sc, { record: sc.policy === "human" && k === 0, capturePredicates: true });
      res.errors = errors.slice(0, 5); res.session = k; res.attempts = attempts;
      sessions.push(res);
      await close();
    }
    const a = sessions[0]; const same = sessions.every((s) => s.digest === a.digest && s.steps === a.steps);
    const divergence = sessions.slice(1).map((s) => {
      const n = Math.min(a.sampled.length, s.sampled.length); let first = -1; let maxAbs = 0;
      for (let i = 0; i < n; i++) {
        const ra = a.sampled[i], rb = s.sampled[i];
        for (let j = 0; j < ra.length; j++) {
          if (typeof ra[j] === "number" && typeof rb[j] === "number") { const d = Math.abs(ra[j] - rb[j]); if (d > 0 && first < 0) first = i; if (d > maxAbs) maxAbs = d; }
          else if (ra[j] !== rb[j] && first < 0) first = i;
        }
      }
      return { session: s.session, firstDivergentSample: first, firstDivergentStep: first >= 0 ? a.sampled[first][0] : null, maxAbsSampled: maxAbs };
    });
    const summary = { scenario: sc.id, sessions: sessions.map((s) => ({ session: s.session, digest: s.digest, steps: s.steps, finalMode: s.finalMode, score: s.score, renders: s.renders, msPerStep: +s.msPerStep.toFixed(4), eventCount: s.eventCount, errors: s.errors, focus: s.focus, difficulty: s.difficulty, venue: s.venue, attempts: s.attempts })), identical: same, divergence };
    out("SLAM_DATA", `${sc.id}.summary`, summary);
    const ref = { ...a, session: undefined, errors: undefined };
    out("SLAM_DATA", `${sc.id}.reference`, ref, 80000);
  }
});

test("aura slam render frames", async ({ browser }) => {
  test.skip(!MODE.includes("frames") && !MODE.includes("all"), "mode");
  test.setTimeout(3_000_000);
  // 1) find capture steps on a pure state run, 2) replay to each step on a fresh page and capture at 1280x720 and 640x360
  const base: Scenario = SCENARIOS[0]!;
  const probe = await runWithRetry(browser, base, { capturePredicates: true });
  const pred = probe.res;
  await probe.close();
  out("SLAM_DATA", "frames.predicates", { preds: pred.preds, steps: pred.steps, digest: pred.digest });
  const lab = await (await browser.newContext()).newPage();
  const sizes = [{ name: "1280x720", width: 1280, height: 720, dsf: 1 }, { name: "640x360", width: 640, height: 360, dsf: 1 }, { name: "mobile-390x844", width: 390, height: 844, dsf: 2 }];
  const metrics: any[] = [];
  const grab = async (name: string, sc: Scenario, stopAt: number, size: (typeof sizes)[number], menuOnly = false) => {
    let page!: Page; let close!: () => Promise<void>; let errors!: string[]; let run: any = null;
    const t0 = Date.now();
    if (menuOnly) { ({ page, close, errors } = await openPage(browser, { width: 320, height: 180 })); await page.waitForTimeout(500); }
    else { const r = await runWithRetry(browser, sc, { stopAt }); ({ page, close, errors } = r); run = r.res; }
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.waitForTimeout(900);
    const r0 = Date.now();
    await page.evaluate(() => (window as any).advanceTime(1000 / 60));
    await page.waitForTimeout(600);
    const png = await page.screenshot({ type: "png" });
    const jpg = await page.screenshot({ type: "jpeg", quality: 82 });
    const m = await imageMetrics(lab, png);
    const dbg = await page.evaluate(async () => {
      const w = window as any; let dbg: any = null; try { dbg = JSON.parse(w.render_game_to_text()).graphics; } catch { /* ignore */ }
      const deep = (o: any, depth = 0, acc: Record<string, number> = {}): Record<string, number> => {
        if (!o || depth > 5 || typeof o !== "object") return acc;
        for (const k of Object.keys(o).slice(0, 80)) { const v = o[k]; if (typeof v === "number" && /drawCalls|triangles|textures|geometries|programs|nodes|frameMs|fps/i.test(k)) acc[k] = v; else if (v && typeof v === "object") deep(v, depth + 1, acc); }
        return acc;
      };
      const eng = w.__AURA3D_SHOWCASE_TOP_TENNIS__?.app; const calls: Record<string, any> = {};
      for (const fn of ["diagnostics", "evidence", "info", "stats", "quality"]) { try { let v = typeof eng?.[fn] === "function" ? eng[fn]() : eng?.[fn]; if (v && typeof v.then === "function") v = await v; if (v) calls[fn] = deep(v); } catch { /* ignore */ } }
      let evid: any = null; try { evid = deep(w.__AURA3D_SHOWCASE_TOP_TENNIS__?.evidence); } catch { /* ignore */ }
      return { dbg, calls, evid, appKeys: eng ? Object.keys(eng).slice(0, 60) : null, renders: w.__slamRenders, heap: (performance as any).memory?.usedJSHeapSize ?? null };
    });
    metrics.push({ name, size: size.name, step: stopAt, digestAtStep: run?.digest ?? null, renderMs: Date.now() - r0, wallMs: Date.now() - t0, errors: errors.slice(0, 3), ...m, graphics: dbg.dbg, engineStats: dbg.calls, evidenceStats: dbg.evid, appKeys: dbg.appKeys, renders: dbg.renders, heap: dbg.heap, bytes: jpg.length });
    out("SLAM_FRAME", `${name}__${size.name}`, jpg.toString("base64"), 60000);
    await close();
  };
  const want = ["serve-ready", "serve-toss", "rally-near-net", "ball-at-bounce", "serve-fault", "point-won", "game-won", "match-over"];
  for (const size of sizes.slice(0, 2)) {
    await grab("menu", base, 0, size, true);
    for (const w of want) { const p = pred.preds.find((x: any) => x.name === w); if (p) await grab(w, base, p.step, size); }
  }
  for (const v of VENUES) await grab(`venue-${v}-serve-ready`, { ...base, venue: v }, 1, sizes[0]!);
  const mob = pred.preds.filter((x: any) => ["serve-ready", "rally-near-net", "point-won"].includes(x.name));
  for (const p of mob) await grab(p.name, base, p.step, sizes[2]!);
  out("SLAM_DATA", "frames.metrics", metrics, 80000);
});
