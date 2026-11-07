import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * splat-turf: browser half of WP-4 (SplatSiblings PRD §7 Phase B).
 *
 * Remote-only (tools/remote-acr/run.sh); never run under local Playwright. Drives
 * `apps/showcase-splat-turf` through `window.__AURA_SPLAT_TURF__` on WebGL2:
 *   - boots with no engine error; routeHealth().status === "ready"; zero console errors,
 *   - splash/run frames contain the scene where it must be (painted sky, white road, pink ball, paint trail),
 *   - the autopilot scores and the rendered frame changes while the run advances,
 *   - the reckless autopilot drives the bursting → gameOver path,
 *   - an in-page scripted replay run twice produces identical traces,
 *   - nodeCount floor (merged batches, one node per kind — the paint grid is ONE batch).
 * Compact JPEG frames are logged as `SPLAT_TURF_FRAME <name> <base64>` (ACR runs cannot return files).
 */

const REPORT_ROOT = resolve("tests/reports/splat-turf");
const ROUTE = "/apps/showcase-splat-turf/";

interface State {
  phase: string;
  score: number;
  distance: number;
  tank: number;
  coveragePercent: number;
  cansGrabbed: number;
  solventHits: number;
  eraserHits: number;
  grade: string;
}

interface Hooks {
  ready(): boolean;
  begin(): void;
  stepFrames(n: number, input?: Record<string, unknown>): State;
  replay(inputs: Record<string, unknown>[], warmup?: number, seed?: number): number[][];
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
type Win = Window & { __AURA_SPLAT_TURF__: Hooks; __AURA_SPLAT_TURF_ERROR__?: string };

test.describe("splat-turf", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_ROOT, { recursive: true });
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("boots on WebGL2, paints the road, finishes or bursts deterministically, and replays exactly", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${server.origin}${ROUTE}?manual=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (window as unknown as Win).__AURA_SPLAT_TURF__?.ready() === true || Boolean((window as unknown as Win).__AURA_SPLAT_TURF_ERROR__),
      undefined,
      { timeout: 240_000 }
    );
    const bootError = await page.evaluate(() => (window as unknown as Win).__AURA_SPLAT_TURF_ERROR__ ?? null);
    expect(bootError, "boot error").toBeNull();

    const CHUNK = 16000;
    const shootScreen = async (shot: string): Promise<void> => {
      const jpg = await page.screenshot({ type: "jpeg", quality: 86 });
      const b64 = jpg.toString("base64");
      const n = Math.ceil(b64.length / CHUNK);
      for (let i = 0; i < n; i++) {
        process.stdout.write(`GL_JPG splat-turf ${shot} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}\n`);
      }
    };
    const save = async (name: string): Promise<void> => {
      const jpeg = await page.evaluate((n) => (window as unknown as Win).__AURA_SPLAT_TURF__.frame(480, 270, 0.7).then((d) => ({ n, d })), name);
      writeFileSync(resolve(REPORT_ROOT, `${name}.jpg`), Buffer.from(jpeg.d.split(",")[1] as string, "base64"));
      process.stdout.write(`SPLAT_TURF_FRAME ${name} ${jpeg.d.split(",")[1]}\n`);
    };
    const stats = async () => page.evaluate(async () => {
      const { width, height, data } = await (window as unknown as Win).__AURA_SPLAT_TURF__.pixels();
      const region = (x0: number, y0: number, x1: number, y1: number) => {
        let sat = 0, bright = 0, sky = 0, n = 0;
        for (let y = Math.floor(y0 * height); y < Math.floor(y1 * height); y++) for (let x = Math.floor(x0 * width); x < Math.floor(x1 * width); x++) {
          const i = (y * width + x) * 4, r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
          n++;
          if (Math.max(r, g, b) - Math.min(r, g, b) > 70) sat++;
          if (r > 210 && g > 210 && b > 210) bright++;
          if ((b > g + 15 && r > g + 15) || (r > 200 && b > 140 && g < r)) sky++;
        }
        return { n, sat, bright, sky };
      };
      return { width, height, top: region(0, 0, 1, 0.3), mid: region(0.3, 0.35, 0.7, 0.75), low: region(0.2, 0.7, 0.8, 1) };
    });

    /* splash: painted plum-to-peach sky in the top band */
    await page.evaluate(() => (window as unknown as Win).__AURA_SPLAT_TURF__.stepFrames(30));
    await save("01-splash");
    await shootScreen("title-1280");
    const splash = await stats();
    expect(splash.top.sky + splash.top.sat, "painted sky gradient in the top third").toBeGreaterThan(splash.top.n * 0.2);

    /* run: white road under the ball, saturated paint trail, frame progression */
    await page.evaluate(() => (window as unknown as Win).__AURA_SPLAT_TURF__.reset(20261121));
    await page.evaluate(() => (window as unknown as Win).__AURA_SPLAT_TURF__.extras.runAutopilot(60));
    await shootScreen("early-1280");
    const early = await page.evaluate(() => (window as unknown as Win).__AURA_SPLAT_TURF__.extras.runAutopilot(180));
    expect(early.phase).toBe("playing");
    expect(early.score).toBeGreaterThan(0);
    expect(early.distance).toBeGreaterThan(50);
    await save("02-run-4s");
    await shootScreen("action-1280");
    const run1 = await stats();
    expect(run1.low.bright, "white road under the ball").toBeGreaterThan(run1.low.n * 0.05);
    expect(run1.mid.sat + run1.low.sat, "saturated paint and pink ball").toBeGreaterThan(30);
    const late = await page.evaluate(() => (window as unknown as Win).__AURA_SPLAT_TURF__.extras.runAutopilot(600));
    expect(late.score).toBeGreaterThan(early.score);
    expect(late.coveragePercent).toBeGreaterThan(0);
    await save("03-run-14s");
    await shootScreen("mid-1280");
    const run2 = await stats();
    expect(JSON.stringify(run2)).not.toBe(JSON.stringify(run1));

    /* death path: the reckless autopilot chases solvent and erasers until the tank runs dry */
    await page.evaluate(() => (window as unknown as Win).__AURA_SPLAT_TURF__.reset(20261121));
    const dead = await page.evaluate(() => (window as unknown as Win).__AURA_SPLAT_TURF__.extras.runAutopilot(5000, true));
    expect(["gameOver", "bursting"]).toContain(dead.phase);
    expect(dead.solventHits + dead.eraserHits).toBeGreaterThan(0);
    if (dead.phase === "bursting") {
      await page.evaluate(() => (window as unknown as Win).__AURA_SPLAT_TURF__.stepFrames(80));
    }
    await save("04-out-of-paint");
    await shootScreen("results-1280");

    /* card@2x (1440x900) and phone (390x844) final screen captures */
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => {
      const h = (window as unknown as Win).__AURA_SPLAT_TURF__;
      h.reset(20261121);
      h.extras.runAutopilot(240);
    });
    await shootScreen("card@2x");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      const h = (window as unknown as Win).__AURA_SPLAT_TURF__;
      h.reset(20261121);
      h.stepFrames(30);
    });
    await shootScreen("title-390");
    await page.evaluate(() => (window as unknown as Win).__AURA_SPLAT_TURF__.extras.runAutopilot(60));
    await shootScreen("early-390");
    await page.evaluate(() => (window as unknown as Win).__AURA_SPLAT_TURF__.extras.runAutopilot(180));
    await shootScreen("action-390");
    await page.evaluate(() => (window as unknown as Win).__AURA_SPLAT_TURF__.extras.runAutopilot(600));
    await shootScreen("mid-390");
    await page.evaluate(() => {
      const h = (window as unknown as Win).__AURA_SPLAT_TURF__;
      h.reset(20261121);
      const s = h.extras.runAutopilot(5000, true);
      if (s.phase === "bursting") h.stepFrames(80);
    });
    await shootScreen("results-390");
    await page.setViewportSize({ width: 1280, height: 720 });

    /* restart re-centres (C4) and the run starts fresh */
    const restarted = await page.evaluate(() => (window as unknown as Win).__AURA_SPLAT_TURF__.extras.restart());
    expect(restarted.phase).toBe("playing");
    expect(restarted.distance).toBe(0);
    expect(restarted.tank).toBe(100);

    /* scripted replay equality: same seed + warmup + inputs twice, identical traces */
    const script = [{ start: true }, ...Array.from({ length: 600 }, (_, i) => ({ dx: i % 120 < 60 ? 0.06 : -0.06 }))];
    const [traceA, traceB] = await page.evaluate((s) => {
      const hooks = (window as unknown as Win).__AURA_SPLAT_TURF__;
      return [hooks.replay(s, 20, 20261121), hooks.replay(s, 20, 20261121)];
    }, script);
    expect(traceA.length).toBe(traceB.length);
    expect(traceA.length).toBe(20 + script.length);
    expect(JSON.stringify(traceA)).toBe(JSON.stringify(traceB));

    const health = await page.evaluate(() => ({
      routeHealth: (window as unknown as Win).__AURA_SPLAT_TURF__.routeHealth(),
      diagnostics: (window as unknown as Win).__AURA_SPLAT_TURF__.diagnostics(),
      nodes: (window as unknown as Win).__AURA_SPLAT_TURF__.nodeCount()
    }));
    expect(health.routeHealth?.status).toBe("ready");
    expect(health.diagnostics?.errors ?? []).toEqual([]);
    expect(health.nodes, "merged batches: one node per kind, paint grid is ONE batch").toBeGreaterThan(10);
    expect(errors.filter((e) => !/favicon|net::ERR|Failed to load resource/.test(e)), "console errors").toEqual([]);
    writeFileSync(resolve(REPORT_ROOT, "stats.json"), JSON.stringify({ splash, run1, run2, health }, null, 2));
  });
});