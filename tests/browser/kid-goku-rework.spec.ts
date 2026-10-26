import { spawn, type ChildProcess } from "node:child_process";
import { expect, test } from "@playwright/test";

/**
 * Cumulus Dash leg motion. Remote-only (tools/remote-acr/run.sh); never local Playwright. Serves a production-style Vite build of the
 * game's app route (tests/browser/kid-goku-vite.cloud.config.ts): both dev servers leave the page on "loading" on the runner, because the asset
 * pipeline retries the road textures forever. No request routing: Playwright routes stall the asset worker's fetches. Logs `KG_REWORK_GAIT` rows and `KG_REWORK_FRAME <name> <base64 jpeg>` frames: a ramp from standing to a
 * jog (walk and run), a sprint strip across two stride cycles, a jump and the landing.
 */
const PORT = 5188;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const LAB = "/apps/showcase-cloud-runner-port/?manual=1";
interface Gait { clip: string; phase: number; rate: number; weight?: number; cadence?: number; stance?: number; lean?: number; groundSpeed: number }
interface Api {
  ready: boolean;
  begin(): void;
  snapshot(): { phase: string; speed: number; jump: number };
  stepFrames(n: number, input?: Record<string, unknown>): string[];
  play(n: number, input?: Record<string, unknown>): string[];
  frame(w?: number, h?: number, q?: number): Promise<string>;
  gait?(): Gait | null;
  errors(): string[];
}
declare global { interface Window { __AURA_KID_GOKU__?: Api; __AURA_CUMULUS_DASH__?: Api } }
// installQaHooks("kid-goku") publishes `__AURA_KID_GOKU__`; the pre-rename global was `__AURA_CUMULUS_DASH__`, so both are read

test.describe("kid-goku rework: leg motion", () => {
  test.setTimeout(2_700_000);
  let vite: ChildProcess | undefined;
  test.beforeAll(async () => {
    test.setTimeout(1_800_000);
    // production-style build of the app route (hashed assets), then serve it: the dev servers never finish loading this page on the runner
    await new Promise<void>((resolve, reject) => {
      const build = spawn("node_modules/.bin/vite", ["build", "--config", "tests/browser/kid-goku-vite.cloud.config.ts"], { cwd: process.cwd(), stdio: "inherit" });
      build.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`vite build exited ${code}`))));
    });
    vite = spawn("node_modules/.bin/vite", ["preview", "--config", "tests/browser/kid-goku-vite.cloud.config.ts"], { cwd: process.cwd(), stdio: "ignore" });
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) { try { const r = await fetch(`${ORIGIN}/apps/showcase-cloud-runner-port/`); if (r.ok) return; } catch { /* not up yet */ } await new Promise((res) => setTimeout(res, 1000)); }
    throw new Error("vite preview did not start");
  });
  test.afterAll(() => { vite?.kill(); });

  test("walk-to-sprint ramp, sprint strip, jump and landing show planted feet with measured gait", async ({ browser }) => {
    const errors: string[] = [];
    const tail: string[] = [];
    const ctx = await browser.newContext({ viewport: { width: 360, height: 270 }, deviceScaleFactor: 1.5 });
    const page = await ctx.newPage();
    const pending = new Map<string, number>();
    page.on("request", (r) => pending.set(r.url(), Date.now()));
    page.on("requestfinished", (r) => pending.delete(r.url()));
    page.on("requestfailed", (r) => { pending.delete(r.url()); tail.push(`requestfailed: ${r.url().slice(0, 200)}`); });
    page.on("response", (r) => { if (r.status() >= 400) tail.push(`http ${r.status()}: ${r.url().slice(0, 200)}`); });
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); else if (tail.length < 80 && !/GL Driver Message/.test(m.text())) tail.push(`${m.type()}: ${m.text().slice(0, 240)}`); });
    await page.goto(`${ORIGIN}${LAB}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    const probe = setInterval(() => { void page.evaluate(() => ({ hook: Boolean(window.__AURA_KID_GOKU__ ?? window.__AURA_CUMULUS_DASH__), hud: document.getElementById("hud")?.textContent?.slice(0, 80) ?? null, res: performance.getEntriesByType("resource").length, t: Math.round(performance.now() / 1000), pathTex: performance.getEntriesByType("resource").filter((e) => /path-(color|normal)/.test(e.name)).map((e) => ({ n: e.name.slice(-22), d: Math.round(e.duration), s: (e as PerformanceResourceTiming).transferSize })) })).then((d) => console.log(`KG_REWORK_BOOT_PROBE ${JSON.stringify({ ...d, pending: [...pending.keys()].map((u) => u.slice(-80)).slice(0, 8), tail: tail.filter((x) => !x.startsWith("mapped")).slice(-5) })}`)).catch(() => undefined); }, 60_000);
    try { await page.waitForFunction(() => (window.__AURA_KID_GOKU__ ?? window.__AURA_CUMULUS_DASH__)?.ready === true, undefined, { timeout: 600_000 }); } catch (e) { console.log(`KG_REWORK_BOOT_FAIL ${JSON.stringify({ errors, tail: tail.filter((x) => !x.startsWith("mapped")).slice(-30), mapped: tail.filter((x) => x.startsWith("mapped")).length })}`); throw e; } finally { clearInterval(probe); }
    console.log(`KG_REWORK_BOOT_OK ${JSON.stringify({ assets: tail.filter((t) => t.startsWith("fetched") || t.startsWith("missing")) })}`);

    const IDLE = { steer: 0, jump: false, pole: false, glider: false, brake: false };
    const rows: Gait[] = [];
    const grab = async (name: string, steps: number, keep = false): Promise<Gait | null> => {
      const out = await page.evaluate(async ([n, i]) => {
        const a = (window.__AURA_KID_GOKU__ ?? window.__AURA_CUMULUS_DASH__)!;
        a.play(n as number, i as Record<string, unknown>);
        const jpeg = await a.frame(540, 405, 0.9);
        return { jpeg, gait: a.gait?.() ?? null, snap: a.snapshot() };
      }, [steps, IDLE] as const);
      console.log(`KG_REWORK_FRAME ${name} ${out.jpeg}`);
      console.log(`KG_REWORK_GAIT ${JSON.stringify({ name, ...out.gait, speed: out.snap.speed })}`);
      if (keep && out.gait) rows.push(out.gait);
      return out.gait;
    };

    await page.evaluate(() => { (window.__AURA_KID_GOKU__ ?? window.__AURA_CUMULUS_DASH__)!.begin(); });
    // ramp: standing start to a jog, three sim steps per frame (the sim eases 0 to its running speed)
    for (let k = 0; k < 14; k++) await grab(`ramp-${String(k).padStart(2, "0")}`, 3);
    // reach full sprint, then a strip across two stride cycles (about 0.5 s each at 14.5 m/s): 16 frames, 4 sim steps apart
    await page.evaluate((i) => { (window.__AURA_KID_GOKU__ ?? window.__AURA_CUMULUS_DASH__)!.play(150, i); }, IDLE);
    for (let k = 0; k < 16; k++) await grab(`sprint-${String(k).padStart(2, "0")}`, 4, true);
    // jump then landing
    const jump = await page.evaluate(async (i) => {
      const a = (window.__AURA_KID_GOKU__ ?? window.__AURA_CUMULUS_DASH__)!;
      a.play(1, { ...i, jump: true });
      a.play(10, i);
      const air = await a.frame(540, 405, 0.9);
      const airSnap = a.snapshot();
      let guard = 0;
      while (a.snapshot().jump > 0.05 && guard++ < 240) a.play(1, i);
      const land = await a.frame(540, 405, 0.9);
      return { air, land, airJump: airSnap.jump, gait: a.gait?.() ?? null };
    }, IDLE);
    console.log(`KG_REWORK_FRAME jump-air ${jump.air}`);
    console.log(`KG_REWORK_FRAME jump-land ${jump.land}`);
    console.log(`KG_REWORK_GAIT ${JSON.stringify({ name: "after-jump", ...jump.gait, airJump: jump.airJump })}`);

    const mean = (f: (r: Gait) => number): number => (rows.length ? rows.reduce((s, r) => s + f(r), 0) / rows.length : NaN);
    console.log(`KG_REWORK_SUMMARY ${JSON.stringify({ groundSpeed: mean((r) => r.groundSpeed), rate: mean((r) => r.rate), weight: mean((r) => r.weight ?? 0), cadence: mean((r) => r.cadence ?? 0), stance: mean((r) => r.stance ?? 0), lean: mean((r) => r.lean ?? 0), phaseSpan: rows.length ? rows[rows.length - 1]!.phase - rows[0]!.phase : 0 })}`);

    expect(errors).toEqual([]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.clip === "run")).toBe(true);
    expect(rows[rows.length - 1]!.phase).toBeGreaterThan(rows[0]!.phase + 1.5);
    expect(jump.airJump).toBeGreaterThan(0.3);
  });
});
