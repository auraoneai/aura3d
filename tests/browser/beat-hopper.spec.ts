import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * beat-hopper: browser half of WP-6 (SplatSiblings PRD §7 Phase B).
 *
 * Remote-only (tools/remote-acr/run.sh); never run under local Playwright. Drives
 * `apps/showcase-beat-hopper` through `window.__AURA_BEAT_HOPPER__` on WebGL2:
 *   - boots with no engine error; routeHealth().status === "ready"; zero console errors,
 *   - splash/run frames contain the scene where it must be (night neon sky, indigo deck, cyan hopper + magenta rails),
 *   - the rhythm autopilot hops/ducks on the beat grid, scores, and advances the rendered frame,
 *   - deliberate missed obstacles drive the bursting → gameOver path,
 *   - an in-page scripted replay run twice produces identical traces,
 *   - nodeCount floor (merged batches, one node per kind).
 * Compact JPEG frames are logged as `BEAT_HOPPER_FRAME <name> <base64>` (ACR runs cannot return files).
 */

const REPORT_ROOT = resolve("tests/reports/beat-hopper");
const ROUTE = "/apps/showcase-beat-hopper/";

interface State {
  phase: string;
  score: number;
  dist: number;
  lives: number;
  combo: number;
  maxCombo: number;
  mult: number;
  pose: string;
  perfect: number;
  good: number;
  miss: number;
  milestones: number;
  laneOffset: number;
  holding: boolean;
  holdT: number;
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
    runAutopilot(n: number, mistakeObstacles?: number[]): State;
    replay(inputs: Record<string, unknown>[], warmup?: number, seed?: number): number[][];
    restart(): State;
    presentation(): Record<string, unknown>;
  };
}
type Win = Window & { __AURA_BEAT_HOPPER__: Hooks; __AURA_BEAT_HOPPER_ERROR__?: string };

test.describe("beat-hopper", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_ROOT, { recursive: true });
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("boots on WebGL2, hops and ducks on the 132 BPM grid, bursts on 3 misses, and replays deterministically", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.setViewportSize({ width: 800, height: 450 });
    await page.goto(`${server.origin}${ROUTE}?manual=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (window as unknown as Win).__AURA_BEAT_HOPPER__?.ready() === true || Boolean((window as unknown as Win).__AURA_BEAT_HOPPER_ERROR__),
      undefined,
      { timeout: 240_000 }
    );
    const bootError = await page.evaluate(() => (window as unknown as Win).__AURA_BEAT_HOPPER_ERROR__ ?? null);
    expect(bootError, "boot error").toBeNull();

    const save = async (name: string): Promise<void> => {
      const jpeg = await page.evaluate((n) => (window as unknown as Win).__AURA_BEAT_HOPPER__.frame(480, 270, 0.7).then((d) => ({ n, d })), name);
      writeFileSync(resolve(REPORT_ROOT, `${name}.jpg`), Buffer.from(jpeg.d.split(",")[1] as string, "base64"));
      process.stdout.write(`BEAT_HOPPER_FRAME ${name} ${jpeg.d.split(",")[1]}\n`);
    };
    const stats = async () => page.evaluate(async () => {
      const { width, height, data } = await (window as unknown as Win).__AURA_BEAT_HOPPER__.pixels();
      const region = (x0: number, y0: number, x1: number, y1: number) => {
        let sat = 0, night = 0, neon = 0, n = 0;
        for (let y = Math.floor(y0 * height); y < Math.floor(y1 * height); y++) for (let x = Math.floor(x0 * width); x < Math.floor(x1 * width); x++) {
          const i = (y * width + x) * 4, r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
          n++;
          if (Math.max(r, g, b) - Math.min(r, g, b) > 50) sat++;
          if (b > g && r < 180 && g < 90) night++;
          if ((b > 140 && g > 120) || (r > 150 && b > 90 && g < 110) || (r > 170 && g > 90 && b < 90)) neon++;
        }
        return { n, sat, night, neon };
      };
      return { width, height, top: region(0, 0, 1, 0.35), mid: region(0.2, 0.35, 0.8, 0.75), low: region(0.2, 0.7, 0.8, 1) };
    });

    /* splash: night violet-to-magenta sky gradient in the top band */
    await page.evaluate(() => (window as unknown as Win).__AURA_BEAT_HOPPER__.stepFrames(30));
    await save("01-splash");
    const splash = await stats();
    expect(splash.top.night + splash.top.sat, "night neon sky gradient in the top third").toBeGreaterThan(splash.top.n * 0.2);

    /* run: indigo road deck, neon cyan hopper + stripes + magenta rails, autopilot scoring, frame progression */
    await page.evaluate(() => (window as unknown as Win).__AURA_BEAT_HOPPER__.reset(20261101));
    const early = await page.evaluate(() => (window as unknown as Win).__AURA_BEAT_HOPPER__.extras.runAutopilot(300));
    expect(early.phase).toBe("playing");
    expect(early.score).toBeGreaterThan(0);
    expect(early.dist).toBeGreaterThan(50);
    expect(early.perfect + early.good).toBeGreaterThanOrEqual(3);
    await save("02-run-5s");
    const run1 = await stats();
    expect(run1.low.night + run1.mid.night, "indigo road deck and equalizer skyline").toBeGreaterThan(run1.low.n * 0.05);
    expect(run1.mid.sat + run1.low.sat + run1.mid.neon + run1.low.neon, "neon cyan hopper, beat stripes, and rails").toBeGreaterThan(30);
    const late = await page.evaluate(() => (window as unknown as Win).__AURA_BEAT_HOPPER__.extras.runAutopilot(600));
    expect(late.score).toBeGreaterThan(early.score);
    expect(late.perfect + late.good).toBeGreaterThan(early.perfect + early.good);
    await save("03-run-15s");
    const run2 = await stats();
    expect(JSON.stringify(run2)).not.toBe(JSON.stringify(run1));

    /* death path: deliberate missed obstacles drain all 3 lives into bursting -> gameOver */
    await page.evaluate(() => (window as unknown as Win).__AURA_BEAT_HOPPER__.reset(20261101));
    const dead = await page.evaluate(() => (window as unknown as Win).__AURA_BEAT_HOPPER__.extras.runAutopilot(900, [0, 1, 2, 3, 4]));
    expect(["gameOver", "bursting"]).toContain(dead.phase);
    expect(dead.lives).toBe(0);
    expect(dead.miss).toBeGreaterThanOrEqual(3);
    await save("04-game-over");

    /* restart re-centres hold/pose state (C4) and resets the run */
    const restarted = await page.evaluate(() => (window as unknown as Win).__AURA_BEAT_HOPPER__.extras.restart());
    expect(restarted.phase).toBe("playing");
    expect(restarted.dist).toBe(0);
    expect(restarted.lives).toBe(3);
    expect(restarted.holding).toBe(false);
    expect(restarted.laneOffset).toBe(0);

    /* scripted replay equality: same seed + warmup + inputs twice, identical traces */
    const script = [{ start: true }, ...Array.from({ length: 600 }, (_, i) => (i % 60 === 10 ? { down: true } : i % 60 === 12 ? { up: true } : {}))];
    const [traceA, traceB] = await page.evaluate((s) => {
      const hooks = (window as unknown as Win).__AURA_BEAT_HOPPER__;
      return [hooks.replay(s, 20, 20261101), hooks.replay(s, 20, 20261101)];
    }, script);
    expect(traceA.length).toBe(traceB.length);
    expect(traceA.length).toBe(20 + script.length);
    expect(JSON.stringify(traceA)).toBe(JSON.stringify(traceB));

    const health = await page.evaluate(() => ({
      routeHealth: (window as unknown as Win).__AURA_BEAT_HOPPER__.routeHealth(),
      diagnostics: (window as unknown as Win).__AURA_BEAT_HOPPER__.diagnostics(),
      nodes: (window as unknown as Win).__AURA_BEAT_HOPPER__.nodeCount()
    }));
    expect(health.routeHealth?.status).toBe("ready");
    expect(health.diagnostics?.errors ?? []).toEqual([]);
    expect(health.nodes, "merged batches + hopper + shadow").toBeGreaterThanOrEqual(10);
    expect(errors.filter((e) => !/favicon|net::ERR|Failed to load resource/.test(e)), "console errors").toEqual([]);
    writeFileSync(resolve(REPORT_ROOT, "stats.json"), JSON.stringify({ splash, run1, run2, health }, null, 2));
  });
});
