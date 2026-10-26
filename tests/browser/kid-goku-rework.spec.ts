import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Cumulus Dash rework: leg motion. Remote-only (tools/remote-acr/run.sh); never local Playwright.
 * Logs `KG_REWORK_GAIT` rows and `KG_REWORK_FRAME <name> <base64 jpeg>` frames (a run-cycle strip, idle, jump, land).
 */
// open ground after the log (s=93); quality switches off only to keep software-GL frames affordable (leg motion, not look, is under test)
const LAB = "/examples/kid-goku-beyond-the-clouds-port/?manual=1&autostart=1&chapterStart=110&quality=low";
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
declare global { interface Window { __AURA_CUMULUS_DASH__?: Api } }

test.describe("kid-goku rework: leg motion", () => {
  test.setTimeout(2_700_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("run cycle strip, idle, jump and landing show moving legs with measured gait", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const consoleTail: string[] = [];
    page.on("console", (m) => { if (consoleTail.length < 80) consoleTail.push(`${m.type()}: ${m.text().slice(0, 300)}`); if (m.type() === "error") errors.push(m.text()); });
    const pending = new Map<string, number>();
    page.on("request", (r) => pending.set(r.url(), Date.now()));
    page.on("requestfinished", (r) => pending.delete(r.url()));
    page.on("requestfailed", (r) => { if (consoleTail.length < 80) consoleTail.push(`requestfailed: ${r.url().slice(0, 200)}`); });
    page.on("response", (r) => { if (r.status() >= 400 && consoleTail.length < 80) consoleTail.push(`http ${r.status()}: ${r.url().slice(0, 200)}`); });
    await page.setViewportSize({ width: 640, height: 360 });
    await page.goto(`${server.origin}${LAB}`);
    try { await page.waitForFunction(() => window.__AURA_CUMULUS_DASH__?.ready === true, undefined, { timeout: 240_000 }); } catch (e) { const diag = await page.evaluate(() => ({ hook: Boolean(window.__AURA_CUMULUS_DASH__), hookErrors: window.__AURA_CUMULUS_DASH__?.errors?.() ?? null, hud: document.querySelector("#hud, .hud")?.textContent?.slice(0, 200) ?? null, canvas: (() => { const c = document.querySelector("canvas"); return c ? `${c.width}x${c.height}` : null; })() })).catch((x) => String(x)); console.log(`KG_REWORK_BOOT_FAIL ${JSON.stringify({ errors, consoleTail, diag, pending: [...pending.keys()].slice(0, 20), total: pending.size })}`); throw e; }

    const IDLE = { steer: 0, jump: false, pole: false, glider: false, brake: false };
    await page.evaluate((i) => { const a = window.__AURA_CUMULUS_DASH__!; a.begin(); a.play(60, i); }, IDLE);

    const rows: Gait[] = [];
    for (let k = 0; k < 12; k++) {
      const out = await page.evaluate(async (i) => {
        const a = window.__AURA_CUMULUS_DASH__!;
        a.play(2, i);
        const jpeg = await a.frame(640, 360, 0.9);
        return { jpeg, gait: a.gait?.() ?? null, snap: a.snapshot() };
      }, IDLE);
      if (out.gait) rows.push(out.gait);
      console.log(`KG_REWORK_FRAME run-${k} ${out.jpeg}`);
      console.log(`KG_REWORK_GAIT ${JSON.stringify({ k, ...out.gait, speed: out.snap.speed })}`);
    }
    // jump then landing
    const jump = await page.evaluate(async (i) => {
      const a = window.__AURA_CUMULUS_DASH__!;
      a.play(1, { ...i, jump: true });
      a.play(10, i);
      const air = await a.frame(640, 360, 0.85);
      const airSnap = a.snapshot();
      let guard = 0;
      while (a.snapshot().jump > 0.05 && guard++ < 240) a.play(1, i);
      const land = await a.frame(640, 360, 0.85);
      return { air, land, airJump: airSnap.jump, gait: a.gait?.() ?? null };
    }, IDLE);
    console.log(`KG_REWORK_FRAME jump-air ${jump.air}`);
    console.log(`KG_REWORK_FRAME jump-land ${jump.land}`);
    console.log(`KG_REWORK_GAIT ${JSON.stringify({ k: "after-jump", ...jump.gait, airJump: jump.airJump })}`);

    const mean = (f: (r: Gait) => number): number => (rows.length ? rows.reduce((s, r) => s + f(r), 0) / rows.length : NaN);
    console.log(`KG_REWORK_SUMMARY ${JSON.stringify({ groundSpeed: mean((r) => r.groundSpeed), rate: mean((r) => r.rate), weight: mean((r) => r.weight ?? 0), cadence: mean((r) => r.cadence ?? 0), stance: mean((r) => r.stance ?? 0), lean: mean((r) => r.lean ?? 0), phaseSpan: rows.length ? rows[rows.length - 1]!.phase - rows[0]!.phase : 0 })}`);

    expect(errors).toEqual([]);
    if (rows.length) {
      expect(rows.every((r) => r.clip === "run")).toBe(true);
      expect(rows[rows.length - 1]!.phase).toBeGreaterThan(rows[0]!.phase + 0.5);
    }
    expect(jump.airJump).toBeGreaterThan(0.3);
  });
});
