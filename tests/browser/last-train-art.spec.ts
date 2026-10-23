import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Last Train to the Sea art capture (remote only, tools/remote-acr/run.sh with the `@headed-xvfb` token).
 * Drives the port with the capture's autopilot, grabs the same game states for the committed port ("after") and, when the
 * temporary `examples/last-train-port-before` copy exists, the pre-art port ("before"), and logs every frame as
 * `LTART <tag> <name> <i> <n> <base64 chunk>` so tools/crayon-capture/last-train-frames.ts can rebuild the images from the run log.
 */

interface State { phase: string; leg: number; distance: number; timeOfDay: string; aboard: number; station: string; speed: number }
interface Pixels { litFraction: number; mean: number }
interface Diag { drawCalls: number; triangles: number; nodes: number; assets: { total: number; loaded: number }; errors: number }

const LABS: { tag: "before" | "after"; path: string }[] = [
  { tag: "before", path: "/examples/last-train-port-before/" },
  { tag: "after", path: "/examples/last-train-port/" }
];
const W = 720, H = 405, Q = 0.8;

async function boot(page: Page, origin: string, path: string, errors: string[]): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${origin}${path}?manual=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const w = window as unknown as { __AURA_LAST_TRAIN__?: { ready(): boolean }; __AURA_LAST_TRAIN_ERROR__?: string };
    return w.__AURA_LAST_TRAIN__?.ready() === true || Boolean(w.__AURA_LAST_TRAIN_ERROR__);
  }, undefined, { timeout: 420_000 });
  const bootError = await page.evaluate(() => (window as unknown as { __AURA_LAST_TRAIN_ERROR__?: string }).__AURA_LAST_TRAIN_ERROR__ ?? null);
  expect(bootError, JSON.stringify(errors.slice(0, 8))).toBeNull();
}

for (const lab of LABS.filter((l) => l.tag === "after" || existsSync(`.${l.path}`))) {
  test.describe(`last-train-art ${lab.tag}`, () => {
    test.setTimeout(1_800_000);
    let server: ExampleDevServer;
    test.beforeAll(async () => { server = await startExampleDevServer(); });
    test.afterAll(async () => { await server.close(); });

    test(`captures the ${lab.tag} look`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); if (/^LT /.test(m.text())) console.log(m.text()); });
      const run = <T>(expr: string): Promise<T> => page.evaluate(`window.__AURA_LAST_TRAIN__.${expr}`) as Promise<T>;
      await boot(page, server.origin, lab.path, errors);

      if (await page.evaluate("typeof window.__AURA_LAST_TRAIN__.assets === 'function'")) {
        const t0 = Date.now();
        let a = await run<{ total: number; loaded: number }>("assets()");
        while (a.loaded < a.total && Date.now() - t0 < 90_000) {
          await run("stepFrames(1)");
          await page.waitForTimeout(500);
          a = await run<{ total: number; loaded: number }>("assets()");
        }
        console.log(`LTART_ASSETS ${lab.tag} ${JSON.stringify(a)} after ${Date.now() - t0}ms`);
      }
      await run("stepFrames(3)");

      const metrics: Record<string, Pixels & { diag?: Diag }> = {};
      const grab = async (name: string): Promise<void> => {
        await run("render()");
        const [jpeg, px] = await page.evaluate(`(() => { const a = window.__AURA_LAST_TRAIN__; return [a.frame(${W}, ${H}, ${Q}), a.pixels()]; })()`) as [string, Pixels];
        const diag = await page.evaluate("(() => { const a = window.__AURA_LAST_TRAIN__; return typeof a.diag === 'function' ? a.diag() : null; })()") as Diag | null;
        metrics[name] = { ...px, ...(diag ? { diag } : {}) };
        const n = Math.ceil(jpeg.length / 16000);
        for (let i = 0; i < n; i++) console.log(`LTART ${lab.tag} ${name} ${i} ${n} ${jpeg.slice(i * 16000, (i + 1) * 16000)}`);
      };

      await grab("01-docked-day");
      await run("doors()");
      let boarding = false;
      for (let i = 0; i < 60; i++) {
        const s = await run<State>("advance(20)");
        if (s.phase === "boarding" && !boarding) { boarding = true; await grab("02-boarding"); }
        if (s.phase === "ready") break;
      }
      await grab("03-ready");

      await run("setAutopilot(true)");
      const seen = new Set<string>();
      const pass = async (time: "day" | "night", legs: number): Promise<void> => {
        const startLeg = (await run<State>("state()")).leg;
        let guard = 0, completed = 0, lastLeg = startLeg;
        while (completed < legs && guard++ < 1200) {
          const s = await run<State>("advance(240)");
          if (s.phase === "enroute" && s.distance > 120 && !seen.has(`${time}-a-${s.leg}`)) { seen.add(`${time}-a-${s.leg}`); await grab(`${time}-enroute-a-L${s.leg}`); }
          if (s.phase === "enroute" && s.distance > 330 && !seen.has(`${time}-b-${s.leg}`)) { seen.add(`${time}-b-${s.leg}`); await grab(`${time}-enroute-b-L${s.leg}`); }
          if (s.leg !== lastLeg) { lastLeg = s.leg; completed++; await run("advance(150)"); await grab(`${time}-arrived-L${s.leg}`); }
        }
      };
      await pass("day", 3);
      await run("setTimeOfDay('night')");
      await run("advance(60)");
      await grab("night-docked-switch");
      await pass("night", 1);

      console.log(`LTART_METRICS ${lab.tag} ${JSON.stringify(metrics)}`);
      console.log(`LTART_ERRORS ${lab.tag} ${JSON.stringify(errors.filter((e) => !/favicon/.test(e)).slice(0, 12))}`);
      expect(Object.keys(metrics).length).toBeGreaterThan(8);
    });
  });
}
