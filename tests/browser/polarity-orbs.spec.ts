import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * polarity-orbs: browser half of WP-5 (SplatSiblings PRD §7 Phase B).
 *
 * Remote-only (tools/remote-acr/run.sh); never run under local Playwright. Drives
 * `apps/showcase-polarity-orbs` through `window.__AURA_POLARITY_ORBS__` on WebGL2:
 *   - boots with no engine error; routeHealth().status === "ready"; zero console errors,
 *   - splash/run frames contain the scene where it must be (dual-dusk sky, split road halves, red/blue ball + orbs),
 *   - the autopilot flips on uniform-opposite rows, steers to matching orbs, scores, and advances the rendered frame,
 *   - deliberate mistake rows drive the bursting → gameOver path,
 *   - an in-page scripted replay run twice produces identical traces,
 *   - nodeCount floor (merged batches, one node per kind).
 * Compact JPEG frames are logged as `POLARITY_ORBS_FRAME <name> <base64>` (ACR runs cannot return files).
 */

const REPORT_ROOT = resolve("tests/reports/polarity-orbs");
const ROUTE = "/apps/showcase-polarity-orbs/";

interface State {
  phase: string;
  score: number;
  distance: number;
  lives: number;
  combo: number;
  mult: number;
  polarity: number;
  orbsCollected: number;
  flips: number;
  wrongs: number;
  ye: number;
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
    runAutopilot(n: number, mistakeRows?: number[]): State;
    restart(): State;
    presentation(): Record<string, unknown>;
  };
}
type Win = Window & { __AURA_POLARITY_ORBS__: Hooks; __AURA_POLARITY_ORBS_ERROR__?: string };

test.describe("polarity-orbs", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_ROOT, { recursive: true });
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("boots on WebGL2, flips polarity and collects matching orbs, bursts on 3 wrong orbs, and replays deterministically", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.setViewportSize({ width: 800, height: 450 });
    await page.goto(`${server.origin}${ROUTE}?manual=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (window as unknown as Win).__AURA_POLARITY_ORBS__?.ready() === true || Boolean((window as unknown as Win).__AURA_POLARITY_ORBS_ERROR__),
      undefined,
      { timeout: 240_000 }
    );
    const bootError = await page.evaluate(() => (window as unknown as Win).__AURA_POLARITY_ORBS_ERROR__ ?? null);
    expect(bootError, "boot error").toBeNull();

    const save = async (name: string): Promise<void> => {
      const jpeg = await page.evaluate((n) => (window as unknown as Win).__AURA_POLARITY_ORBS__.frame(480, 270, 0.7).then((d) => ({ n, d })), name);
      writeFileSync(resolve(REPORT_ROOT, `${name}.jpg`), Buffer.from(jpeg.d.split(",")[1] as string, "base64"));
      process.stdout.write(`POLARITY_ORBS_FRAME ${name} ${jpeg.d.split(",")[1]}\n`);
    };
    const stats = async () => page.evaluate(async () => {
      const { width, height, data } = await (window as unknown as Win).__AURA_POLARITY_ORBS__.pixels();
      const region = (x0: number, y0: number, x1: number, y1: number) => {
        let sat = 0, warm = 0, cool = 0, n = 0;
        for (let y = Math.floor(y0 * height); y < Math.floor(y1 * height); y++) for (let x = Math.floor(x0 * width); x < Math.floor(x1 * width); x++) {
          const i = (y * width + x) * 4, r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
          n++;
          if (Math.max(r, g, b) - Math.min(r, g, b) > 55) sat++;
          if (r > b + 15 && r > 60) warm++;
          if (b > r + 15 && b > 60) cool++;
        }
        return { n, sat, warm, cool };
      };
      return { width, height, top: region(0, 0, 1, 0.3), mid: region(0.25, 0.3, 0.75, 0.75), low: region(0.2, 0.7, 0.8, 1) };
    });

    /* splash: dusk sky gradient in the top band */
    await page.evaluate(() => (window as unknown as Win).__AURA_POLARITY_ORBS__.stepFrames(30));
    await save("01-splash");
    const splash = await stats();
    expect(splash.top.warm + splash.top.cool + splash.top.sat, "dusk sky gradient in the top third").toBeGreaterThan(splash.top.n * 0.2);

    /* run: split road, red/blue orbs + ball, autopilot scoring, frame progression */
    await page.evaluate(() => (window as unknown as Win).__AURA_POLARITY_ORBS__.reset(20261124));
    const early = await page.evaluate(() => (window as unknown as Win).__AURA_POLARITY_ORBS__.extras.runAutopilot(240));
    expect(early.phase).toBe("playing");
    expect(early.score).toBeGreaterThan(0);
    expect(early.distance).toBeGreaterThan(50);
    await save("02-run-4s");
    const run1 = await stats();
    expect(run1.low.warm + run1.low.cool, "split warm/cool road halves").toBeGreaterThan(run1.low.n * 0.05);
    expect(run1.mid.sat + run1.low.sat, "saturated red/blue ball and orbs").toBeGreaterThan(30);
    const late = await page.evaluate(() => (window as unknown as Win).__AURA_POLARITY_ORBS__.extras.runAutopilot(600));
    expect(late.score).toBeGreaterThan(early.score);
    expect(late.orbsCollected).toBeGreaterThan(early.orbsCollected);
    await save("03-run-14s");
    const run2 = await stats();
    expect(JSON.stringify(run2)).not.toBe(JSON.stringify(run1));

    /* death path: deliberate mistake rows drain all 3 lives into bursting -> gameOver */
    await page.evaluate(() => (window as unknown as Win).__AURA_POLARITY_ORBS__.reset(20261124));
    const dead = await page.evaluate(() => (window as unknown as Win).__AURA_POLARITY_ORBS__.extras.runAutopilot(900, [0, 1, 2, 3, 4, 5]));
    expect(["gameOver", "bursting"]).toContain(dead.phase);
    expect(dead.lives).toBe(0);
    await save("04-game-over");

    /* restart re-centres steering (C4) and resets the run */
    const restarted = await page.evaluate(() => (window as unknown as Win).__AURA_POLARITY_ORBS__.extras.restart());
    expect(restarted.phase).toBe("playing");
    expect(restarted.distance).toBe(0);
    expect(restarted.lives).toBe(3);
    expect(restarted.ye).toBe(0);

    /* scripted replay equality: same seed + warmup + inputs twice, identical traces */
    const script = "0:start, 24:d+dx=-60, 60:t, 120:d+dx=60, 180:t, 240:u, 600:u";
    const [traceA, traceB] = await page.evaluate((s) => {
      const hooks = (window as unknown as Win).__AURA_POLARITY_ORBS__;
      return [hooks.replay(s, 20, 20261124), hooks.replay(s, 20, 20261124)];
    }, script);
    expect(traceA.length).toBe(traceB.length);
    expect(traceA.length).toBe(20 + 601);
    expect(JSON.stringify(traceA)).toBe(JSON.stringify(traceB));

    const health = await page.evaluate(() => ({
      routeHealth: (window as unknown as Win).__AURA_POLARITY_ORBS__.routeHealth(),
      diagnostics: (window as unknown as Win).__AURA_POLARITY_ORBS__.diagnostics(),
      nodes: (window as unknown as Win).__AURA_POLARITY_ORBS__.nodeCount()
    }));
    expect(health.routeHealth?.status).toBe("ready");
    expect(health.diagnostics?.errors ?? []).toEqual([]);
    expect(health.nodes, "merged batches + ball/sky/fx").toBeGreaterThanOrEqual(10);
    expect(errors.filter((e) => !/favicon|net::ERR|Failed to load resource/.test(e)), "console errors").toEqual([]);
    writeFileSync(resolve(REPORT_ROOT, "stats.json"), JSON.stringify({ splash, run1, run2, health }, null, 2));
  });
});
