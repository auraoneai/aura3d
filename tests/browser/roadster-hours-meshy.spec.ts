import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * roadster-hours-port Meshy frames (remote only, tools/remote-acr/run.sh). Captures a set of game states on every route
 * (menu, fixed autopilot steps, lineup approach, airborne, nitro, results) as full-page JPEGs (canvas + HUD) and logs them as
 * `RHM_FRAME <name> <base64>`, with the simulation step of each (`RHM_STEP`), frame statistics and renderer diagnostics.
 * The fixed steps are shared with tools/crayon-capture/roadster-hours-frames.ts, which photographs the original at the same steps.
 * Frames are named `<w480|w960>-l<level>-<state>[-bare]`; RHM_MESHY=0 renders the CC0 fallback for before/after. Env: RHM_LEVELS (comma list, default 0,1,2).
 */
const REPORT_ROOT = resolve("tests/reports/roadster-hours-port");
const LEVELS = (process.env.RHM_LEVELS ?? "0").split(",").map((v) => Number(v));
const STEPS = [720, 1680, 3000, 4800];
/** Route 0 is also captured at the original's 480x270 for matched judging; everything is captured at 960x540 for review. */
const sizesFor = (_level: number): { w: number; h: number; tag: string }[] => [{ w: 960, h: 540, tag: "w960" }];

interface Api {
  ready: boolean; begin(): void; setAutopilot(on: boolean): void; stepSteps(n: number, input?: unknown): number; renderNow(): void;
  snapshot(): { s: number; grounded: boolean; speed: number; phase: string; time: number; h: number };
  stats(): Promise<{ lumaMean: number; lumaStd: number; colorBuckets: number; hash: string; grid: number[] }>;
  state(): { level: { lineups: { kicker: { s: number } }[]; length: number } };
  diagnostics(): Record<string, unknown> | null;
}

test.describe("roadster-hours-port Meshy frames", () => {
  test.setTimeout(1_800_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); mkdirSync(REPORT_ROOT, { recursive: true }); });
  test.afterAll(async () => { await server.close(); });

  test("captures the route states", async ({ page }) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
      else if (message.type() === "warning") warnings.push(message.text().slice(0, 300));
    });
    const api = <T>(fn: (a: Api) => T | Promise<T>): Promise<T> => page.evaluate(`(${fn.toString()})(window.__AURA_ROADSTER_HOURS__)`) as Promise<T>;
    let tag = "w960";
    const shot = async (stateName: string): Promise<void> => {
      const name = `${tag}-${stateName}`;
      // Software GL compiles programs lazily: render until the canvas has structure (a blank frame is not a result).
      let stats = { lumaMean: 0, lumaStd: 0, colorBuckets: 0, hash: "", grid: [] as number[] };
      let tries = 0;
      for (;;) {
        await api((a) => a.renderNow());
        await page.waitForTimeout(500);
        await api((a) => a.renderNow());
        stats = await api((a) => a.stats());
        if (stats.lumaStd > 3 || tries >= 40) break;
        if (tries === 0) {
          const lost = await page.evaluate(() => { const gl = (document.getElementById("world") as HTMLCanvasElement).getContext("webgl2"); return gl ? gl.isContextLost() : null; });
          const diag = await api((a) => a.diagnostics());
          console.log(`RHM_BLANK ${name} contextLost=${lost}`, JSON.stringify({ errors: diag?.errors, warnings: diag?.warnings, drawCalls: diag?.drawCalls }).slice(0, 1500), JSON.stringify(warnings.slice(-6)));
        }
        tries++;
        await page.waitForTimeout(3000);
      }
      if (tries) console.log(`RHM_RETRY ${name} tries=${tries} lumaStd=${stats.lumaStd.toFixed(1)}`);
      const jpeg = await page.screenshot({ type: "jpeg", quality: 72 });
      console.log(`RHM_FRAME ${name} ${jpeg.toString("base64")}`);
      // canvas only (HUD and mute button hidden) for the blind judge and the structural metrics
      await page.evaluate(() => { for (const id of ["hud", "mute", "menu"]) { const e = document.getElementById(id); if (e) e.dataset.prevVis = e.style.visibility, e.style.visibility = "hidden"; } });
      const bare = await page.screenshot({ type: "jpeg", quality: 85 });
      console.log(`RHM_FRAME ${name}-bare ${bare.toString("base64")}`);
      await page.evaluate(() => { for (const id of ["hud", "mute", "menu"]) { const e = document.getElementById(id); if (e) e.style.visibility = e.dataset.prevVis ?? ""; } });
      console.log(`RHM_STATS ${name}`, JSON.stringify({ lumaMean: +stats.lumaMean.toFixed(2), lumaStd: +stats.lumaStd.toFixed(2), colorBuckets: stats.colorBuckets, hash: stats.hash, grid: stats.grid }));
    };
    for (const level of LEVELS) for (const size of sizesFor(level)) {
      tag = size.tag;
      await page.setViewportSize({ width: size.w, height: size.h });
      errors.length = 0;
      await page.goto(`${server.origin}/examples/roadster-hours-port/?manual=1&level=${level}&meshy=${process.env.RHM_MESHY ?? "1"}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => {
        const w = window as unknown as { __AURA_ROADSTER_HOURS__?: { ready: boolean }; __AURA_ROADSTER_HOURS_ERROR__?: string };
        return w.__AURA_ROADSTER_HOURS__?.ready === true || Boolean(w.__AURA_ROADSTER_HOURS_ERROR__);
      }, undefined, { timeout: 600_000 });
      const bootError = await page.evaluate(() => (window as unknown as { __AURA_ROADSTER_HOURS_ERROR__?: string }).__AURA_ROADSTER_HOURS_ERROR__ ?? null);
      if (bootError) { console.log(`RHM_BOOT_ERROR ${tag} level ${level}`, bootError, JSON.stringify(errors.slice(0, 8))); continue; }
      // The engine uploads generated-model textures one at a time after mount (slow under software GL): settle before the first shot.
      for (let w = 0; w < 50; w++) { await api((a) => a.renderNow()); await page.waitForTimeout(3000); }
      await shot(`l${level}-menu`);

      // Render-free pre-pass: the steps at which the autopilot reaches the first lineup and is airborne over it.
      const marks = (await page.evaluate(`(() => {
        const a = window.__AURA_ROADSTER_HOURS__;
        a.begin(); a.setAutopilot(true);
        const k = a.state().level.lineups[0]?.kicker.s ?? 600;
        let n = 0, lineup = -1, air = -1;
        while (n < 24000) {
          a.stepSteps(6); n += 6;
          const s = a.snapshot();
          if (lineup < 0 && s.s >= k - 55) lineup = n;
          if (lineup >= 0 && air < 0 && !s.grounded && s.h > 1.5) { air = n; break; }
          if (s.phase === "complete") break;
        }
        return { lineup, air };
      })()`)) as { lineup: number; air: number };
      console.log(`RHM_MARKS ${tag} level ${level}`, JSON.stringify(marks));
      const points: { step: number; name: string }[] = STEPS.map((step) => ({ step, name: `s${String(step).padStart(4, "0")}` }));
      if (marks.lineup > 0) points.push({ step: marks.lineup, name: "lineup" });
      if (marks.air > 0) points.push({ step: marks.air, name: "air" });
      points.sort((x, y) => x.step - y.step);
      const base = (await page.evaluate("window.__AURA_ROADSTER_HOURS__.stepSteps(0)")) as number;
      await api((a) => { a.begin(); a.setAutopilot(true); a.renderNow(); });
      let at = 0;
      for (const point of points) {
        if (point.step > at) at = ((await page.evaluate(`window.__AURA_ROADSTER_HOURS__.stepSteps(${point.step - at})`)) as number) - base;
        console.log(`RHM_STEP ${tag}-l${level}-${point.name} ${at}`);
        await shot(`l${level}-${point.name}`);
      }

      const diag = await api((a) => a.diagnostics());
      console.log(`RHM_DIAG ${tag} level ${level}`, JSON.stringify({
        drawCalls: diag?.drawCalls, triangles: (diag as Record<string, unknown> | null)?.triangles, backend: diag?.backend, errors: diag?.errors,
        warnings: (diag?.warnings as unknown[] | undefined)?.slice?.(0, 12), renderSize: diag?.renderSize
      }).slice(0, 3500));
      console.log(`RHM_ERRORS ${tag} level ${level}`, JSON.stringify(errors.slice(0, 8)));
    }
  });
});
