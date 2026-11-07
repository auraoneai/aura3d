import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * number-surge: browser half of WP-3 (SplatSiblings PRD §7 Phase B).
 *
 * Remote-only (tools/remote-acr/run.sh); never run under local Playwright. Drives
 * `apps/showcase-number-surge` through `window.__AURA_NUMBER_SURGE__` on WebGL2:
 *   - boots with no engine error; routeHealth().status === "ready"; zero console errors,
 *   - splash/run frames contain the scene where it must be (indigo dusk sky, violet road, cyan/magenta gates, glowing ball),
 *   - the autopilot picks better arithmetic gates, grows the number, smashes boss walls, and advances the rendered frame,
 *   - the reckless autopilot drives the wall-fail -> bursting -> gameOver path,
 *   - an in-page scripted replay run twice produces identical traces,
 *   - nodeCount floor (merged batches, one node per kind + label planes).
 * Compact JPEG frames are logged as `NUMBER_SURGE_FRAME <name> <base64>` (ACR runs cannot return files).
 */

const REPORT_ROOT = resolve("tests/reports/number-surge");
const ROUTE = "/apps/showcase-number-surge/";

interface State {
  phase: string;
  score: number;
  distance: number;
  number: number;
  combo: number;
  mult: number;
  wallsSmashed: number;
  biggestSmash: number;
  laneOffset: number;
}

interface Hooks {
  ready(): boolean;
  begin(): void;
  stepFrames(n: number, input?: Record<string, unknown>): State;
  replay(inputs: string | Record<string, unknown>[], warmup?: number, seed?: number): number[][];
  frame(w?: number, h?: number, q?: number): Promise<string>;
  pixels(): Promise<{ width: number; height: number; data: Uint8ClampedArray }>;
  reset(seed?: number): void;
  diagnostics(): { errors?: readonly unknown[]; drawCalls?: number } | null;
  routeHealth(): { status: string } | null;
  nodeCount(): number;
  extras: {
    runAutopilot(n: number, reckless?: boolean): State;
    restart(): State;
    presentation(): Record<string, unknown>;
  };
}
type Win = Window & { __AURA_NUMBER_SURGE__: Hooks; __AURA_NUMBER_SURGE_ERROR__?: string };

test.describe("number-surge", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_ROOT, { recursive: true });
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("boots on WebGL2, grows the ball across arithmetic gates, smashes or bursts on boss walls, and replays deterministically", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.setViewportSize({ width: 800, height: 450 });
    await page.goto(`${server.origin}${ROUTE}?manual=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (window as unknown as Win).__AURA_NUMBER_SURGE__?.ready() === true || Boolean((window as unknown as Win).__AURA_NUMBER_SURGE_ERROR__),
      undefined,
      { timeout: 240_000 }
    );
    const bootError = await page.evaluate(() => (window as unknown as Win).__AURA_NUMBER_SURGE_ERROR__ ?? null);
    expect(bootError, "boot error").toBeNull();

    const save = async (name: string): Promise<void> => {
      const jpeg = await page.evaluate((n) => (window as unknown as Win).__AURA_NUMBER_SURGE__.frame(480, 270, 0.7).then((d) => ({ n, d })), name);
      writeFileSync(resolve(REPORT_ROOT, `${name}.jpg`), Buffer.from(jpeg.d.split(",")[1] as string, "base64"));
      process.stdout.write(`NUMBER_SURGE_FRAME ${name} ${jpeg.d.split(",")[1]}\n`);
    };
    const stats = async () => page.evaluate(async () => {
      const { width, height, data } = await (window as unknown as Win).__AURA_NUMBER_SURGE__.pixels();
      const region = (x0: number, y0: number, x1: number, y1: number) => {
        let sat = 0, dusk = 0, neon = 0, n = 0;
        for (let y = Math.floor(y0 * height); y < Math.floor(y1 * height); y++) for (let x = Math.floor(x0 * width); x < Math.floor(x1 * width); x++) {
          const i = (y * width + x) * 4, r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
          n++;
          if (Math.max(r, g, b) - Math.min(r, g, b) > 55) sat++;
          if (b > g && b > 30) dusk++;
          if ((g > 160 && b > 180) || (r > 180 && b > 140)) neon++;
        }
        return { n, sat, dusk, neon };
      };
      return { width, height, top: region(0, 0, 1, 0.3), mid: region(0.2, 0.3, 0.8, 0.75), low: region(0.2, 0.7, 0.8, 1) };
    });

    /* splash: indigo-to-violet dusk sky in the top band */
    await page.evaluate(() => (window as unknown as Win).__AURA_NUMBER_SURGE__.stepFrames(30));
    await save("01-splash");
    const splash = await stats();
    expect(splash.top.dusk + splash.top.sat, "indigo dusk sky gradient in the top third").toBeGreaterThan(splash.top.n * 0.2);

    /* run: neon gates + cyan ball, autopilot scoring and smashing walls, frame progression */
    await page.evaluate(() => (window as unknown as Win).__AURA_NUMBER_SURGE__.reset(20261103));
    const early = await page.evaluate(() => (window as unknown as Win).__AURA_NUMBER_SURGE__.extras.runAutopilot(240));
    expect(early.phase).toBe("playing");
    expect(early.score).toBeGreaterThan(0);
    expect(early.distance).toBeGreaterThan(50);
    await save("02-run-4s");
    const run1 = await stats();
    expect(run1.low.dusk + run1.mid.dusk, "violet road and dusk lighting").toBeGreaterThan(run1.low.n * 0.1);
    expect(run1.mid.sat + run1.low.sat + run1.mid.neon + run1.low.neon, "neon gates and cyan ball").toBeGreaterThan(30);
    const late = await page.evaluate(() => (window as unknown as Win).__AURA_NUMBER_SURGE__.extras.runAutopilot(1500));
    expect(late.score).toBeGreaterThan(early.score);
    expect(late.wallsSmashed).toBeGreaterThanOrEqual(1);
    await save("03-run-wall-smash");
    const run2 = await stats();
    expect(JSON.stringify(run2)).not.toBe(JSON.stringify(run1));

    /* death path: reckless autopilot steers into worse gates so the first boss wall triggers bursting -> gameOver */
    await page.evaluate(() => (window as unknown as Win).__AURA_NUMBER_SURGE__.reset(20261103));
    const dead = await page.evaluate(() => (window as unknown as Win).__AURA_NUMBER_SURGE__.extras.runAutopilot(2000, true));
    expect(["gameOver", "bursting"]).toContain(dead.phase);
    await save("04-game-over");

    /* restart re-centres steering (C4) and resets the run */
    const restarted = await page.evaluate(() => (window as unknown as Win).__AURA_NUMBER_SURGE__.extras.restart());
    expect(restarted.phase).toBe("playing");
    expect(restarted.distance).toBe(0);
    expect(restarted.number).toBe(10);
    expect(restarted.laneOffset).toBe(0);

    /* scripted replay equality: same seed + warmup + inputs twice, identical traces */
    const script = "1xS dx=0\n300xD dx=1\n300xD dx=-1";
    const [traceA, traceB] = await page.evaluate((s) => {
      const hooks = (window as unknown as Win).__AURA_NUMBER_SURGE__;
      return [hooks.replay(s, 30, 20261103), hooks.replay(s, 30, 20261103)];
    }, script);
    expect(traceA.length).toBe(traceB.length);
    expect(traceA.length).toBe(601);
    expect(JSON.stringify(traceA)).toBe(JSON.stringify(traceB));

    const health = await page.evaluate(() => ({
      routeHealth: (window as unknown as Win).__AURA_NUMBER_SURGE__.routeHealth(),
      diagnostics: (window as unknown as Win).__AURA_NUMBER_SURGE__.diagnostics(),
      nodes: (window as unknown as Win).__AURA_NUMBER_SURGE__.nodeCount()
    }));
    expect(health.routeHealth?.status).toBe("ready");
    expect(health.diagnostics?.errors ?? []).toEqual([]);
    expect(health.nodes, "merged batches + canvas label nodes").toBeGreaterThanOrEqual(10);
    expect(errors.filter((e) => !/favicon|net::ERR|Failed to load resource/.test(e)), "console errors").toEqual([]);
    writeFileSync(resolve(REPORT_ROOT, "stats.json"), JSON.stringify({ splash, run1, run2, health }, null, 2));
  });
});
