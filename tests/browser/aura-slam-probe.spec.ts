import { test } from "@playwright/test";

/** Discovery probe for the deployed Aura Slam 3D page (remote runner; results printed into the log). */
const BASE = (process.env.SLAM_BASE ?? "https://aura3d.auraone.ai").replace(/\/$/, "");
const URL = `${BASE}/apps/showcase-top-tennis/`;

function out(tag: string, value: unknown): void {
  console.log(`SLAM_PROBE ${tag} ${JSON.stringify(value)}`);
}

test("probe", async ({ browser }) => {
  test.setTimeout(900_000);
  const context = await browser.newContext({ viewport: { width: 320, height: 180 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  await page.addInitScript(() => {
    (window as any).__slamEvents = [];
    (window as any).__slamRenders = 0;
    let te: any;
    const wrap = (f: any) => {
      if (!f || typeof f.create !== "function") return f;
      return new Proxy(f, {
        get(target, prop) {
          if (prop !== "create") return target[prop];
          return (opts: any) => {
            const o = { ...opts };
            const oe = o.onEvent;
            let engineRef: any = null;
            o.onEvent = (e: any) => {
              try {
                (window as any).__slamEvents.push({ t: engineRef?.state?.time ?? null, type: e.type, side: e.side ?? null, shot: e.shot ?? null, won: e.won ?? null, args: Array.isArray(e.args) ? e.args.map((a: any) => (typeof a === "number" ? +a.toFixed(4) : a)) : null, contact: e.contact ?? null });
              } catch { /* ignore */ }
              return oe?.(e);
            };
            engineRef = target.create(o);
            return engineRef;
          };
        }
      });
    };
    Object.defineProperty(window, "TennisEngine", { configurable: true, get: () => te, set: (v) => { te = wrap(v); } });
    let ts: any;
    Object.defineProperty(window, "TennisScene", {
      configurable: true,
      get: () => ts,
      set: (v) => {
        ts = v && typeof v.createRenderer === "function" ? new Proxy(v, { get(t, p) { if (p !== "createRenderer") return t[p]; return (c: any) => { const r = t.createRenderer(c); const orig = r.render; r.render = (...a: any[]) => { (window as any).__slamRenders++; return orig.apply(r, a); }; return r; }; } }) : v;
      }
    });
  });
  const t0 = Date.now();
  await page.goto(`${URL}?autoplay=1`, { waitUntil: "load" });
  await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", null, { timeout: 240_000 });
  out("boot", { ms: Date.now() - t0, errors });

  const info = await page.evaluate(() => {
    const w = window as any;
    const buttons = Array.from(document.querySelectorAll("button, [role=button], a.button, .venue-btn, [data-difficulty]")).slice(0, 80).map((b: any) => ({ id: b.id || null, cls: String(b.className).slice(0, 60), text: (b.textContent || "").trim().slice(0, 40), data: { ...b.dataset }, hidden: b.hidden || b.closest(".hidden") !== null }));
    const st = w.__TOP_TENNIS_CONTROL__?.getState?.();
    const keys = (o: any) => (o ? Object.keys(o).slice(0, 80) : null);
    let rgt: any = null; try { rgt = JSON.parse(w.render_game_to_text()); } catch (e) { rgt = String(e); }
    return {
      windowKeys: Object.keys(w).filter((k) => /Tennis|TOP_TENNIS|slam|render_game|advanceTime/.test(k)),
      menuKeys: keys(w.TennisMenu), menuDebug: w.TennisMenu?.debug?.() ?? null,
      localKeys: keys(w.TennisLocal), localSettings: w.TennisLocal?.settings?.() ?? null,
      stateKeys: keys(st), ballKeys: keys(st?.ball), playerKeys: keys(st?.player), aiKeys: keys(st?.ai), scoreKeys: keys(st?.score),
      mode: st?.mode, phase: st?.phase, difficulty: st?.difficulty, venue: st?.venue,
      buttons, rgtKeys: keys(rgt), engineKeys: keys(w.__TOP_TENNIS_CONTROL__?.getEngine?.()),
      tennisEngineKeys: keys(w.TennisEngine), venueBtns: Array.from(document.querySelectorAll(".venue-btn")).map((b: any) => b.dataset.venue),
      diffBtns: Array.from(document.querySelectorAll("[data-difficulty]")).map((b: any) => b.dataset.difficulty),
      fixedDt: 1 / 60
    };
  });
  out("info", info);
  const startState = await page.evaluate(() => {
    const w = window as any;
    return JSON.stringify(w.__TOP_TENNIS_CONTROL__.getState(), (k, v) => (typeof v === "number" ? +v.toFixed(4) : v)).slice(0, 6000);
  });
  out("startState", startState);

  // Enter manual stepping first (menu update is inert) so the realtime rAF loop never updates the sim again.
  await page.evaluate(() => (window as any).advanceTime(1000 / 60));
  const launched = await page.evaluate(() => {
    const w = window as any;
    try { w.TennisMenu?.launch?.(); } catch (e) { return { err: String(e) }; }
    const s = w.__TOP_TENNIS_CONTROL__.getState();
    return { mode: s.mode, phase: s.phase, difficulty: s.difficulty, venue: s.venue, manual: true };
  });
  out("launched", launched);

  const timing = await page.evaluate(() => {
    const w = window as any;
    const out: any[] = [];
    const snap = () => {
      const s = w.__TOP_TENNIS_CONTROL__.getState();
      return { t: +s.time.toFixed(4), mode: s.mode, phase: s.phase, server: s.server, sn: s.serveNumber, pg: s.score.playerGames, ag: s.score.aiGames, pp: s.score.playerPoints, ap: s.score.aiPoints, rh: s.rallyHits, bx: +s.ball.x.toFixed(3), by: +s.ball.y.toFixed(3), bz: +s.ball.z.toFixed(3), act: s.ball.active, px: +s.player.x.toFixed(3), py: +s.player.y.toFixed(3), ax: +s.ai.x.toFixed(3), ay: +s.ai.y.toFixed(3), msg: s.message, renders: w.__slamRenders };
    };
    const t0 = performance.now();
    for (let i = 0; i < 1500; i++) {
      w.advanceTime(1000 / 60);
      if (i % 50 === 0 || i < 5) out.push({ i, ...snap() });
    }
    return { ms: performance.now() - t0, samples: out, events: w.__slamEvents.slice(0, 40), eventCount: w.__slamEvents.length };
  });
  out("timing", timing);
  out("errors", errors);
  await context.close();
});
