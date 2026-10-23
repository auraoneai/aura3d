import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * silt-and-signal-port - R-20 / R-25, browser half (docs/workflows/threejs-parity-gaps.md).
 *
 * Remote-only (tools/remote-acr/run.sh); never run under local Playwright. Drives
 * `examples/silt-and-signal-port` through `window.__AURA_SILT__`:
 *   - the lab boots on WebGL2 with no engine error,
 *   - the frame has a sky gradient, objective rings and a rider, and changes while the rider flies,
 *   - the in-page simulation replays every ride recorded from the ORIGINAL game and matches its
 *     sampled state trace (tests/browser/data/silt-and-signal-reference-replay.json) within the
 *     tolerance derived from the original's own repeatability, twice with identical results,
 *   - live keyboard input moves the rider.
 * Compact JPEG frames are written to the log as `SILT_FRAME <name> <base64>` (ACR runs cannot return files).
 */

const REPORT_ROOT = resolve("tests/reports/silt-and-signal-port");
const LAB = "/examples/silt-and-signal-port/";
const FIXTURE = "tests/browser/data/silt-and-signal-reference-replay.json";

interface Input { throttle: number; steer: number; lift: number; brake: boolean; boost: boolean; interact: boolean }
interface Ride {
  chapter: number;
  objective: number;
  start: { x: number; y: number; z: number; yaw: number; time: number; clockMs: number };
  endMode: string;
  segments: { steps: number; input: Input }[];
  summary: { completed: boolean; completedAtStep: number | null };
  tolerance: { position: number; yaw: number; completionSteps: number };
  steps: number;
  samples: number[][];
}
interface Fixture { columns: string[]; sampleEvery: number; rides: Ride[] }

interface SiltApi {
  ready: boolean;
  reset(chapter?: number, objective?: number, start?: { clockMs?: number; time?: number }): void;
  stepFrames(n: number, input?: Input): void;
  replay(segments: { steps: number; input: Input }[]): number[][];
  state(): { state: { x: number; y: number; z: number; yaw: number; objective: number; point: number }; flight: { speed: number; impacts: number }; steps: number };
  render(): void;
  overview(on: boolean): void;
  info(): { frames: number; nodeCount: number; diagnostics: { errors?: readonly unknown[]; drawCalls?: number } | null; routeHealth: { status: string; parityIds: readonly string[] } | null };
}
declare global { interface Window { __AURA_SILT__: SiltApi } }

interface Stats { readonly top: number; readonly bottom: number; readonly warm: number; readonly distinctColors: number; readonly width: number; readonly height: number }

const STATS = `(async () => {
  const api = window.__AURA_SILT__;
  api.render();
  const canvas = document.getElementById("world");
  const url = canvas.toDataURL("image/png");
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  const { data, width, height } = g.getImageData(0, 0, c.width, c.height);
  const luma = (i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  let top = 0, topN = 0, bottom = 0, bottomN = 0, warm = 0;
  const seen = new Set();
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      const l = luma(i);
      if (y < height * 0.3) { top += l; topN++; }
      if (y > height * 0.7) { bottom += l; bottomN++; }
      if (data[i] > 150 && data[i + 1] > 100 && data[i + 2] < 150 && data[i] > data[i + 2] + 40) warm++;
      seen.add(((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4));
    }
  }
  return { top: top / topN, bottom: bottom / bottomN, warm, distinctColors: seen.size, width, height };
})()`;

const stats = (page: import("@playwright/test").Page): Promise<Stats> => page.evaluate(STATS) as Promise<Stats>;

test.describe("silt-and-signal-port", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;
  let fixture: Fixture;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_ROOT, { recursive: true });
    fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as Fixture;
  });

  test.afterAll(async () => {
    await server.close();
  });

  async function boot(page: import("@playwright/test").Page, query: string, errors: string[]): Promise<void> {
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto(`${server.origin}${LAB}${query}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA_SILT__?.ready === true, undefined, { timeout: 240_000 });
  }

  async function logFrame(page: import("@playwright/test").Page, name: string): Promise<void> {
    await page.evaluate(() => window.__AURA_SILT__.render());
    const shot = await page.screenshot({ type: "jpeg", quality: 45 });
    process.stdout.write(`SILT_FRAME ${name} ${shot.toString("base64")}\n`);
  }

  test("boots on WebGL2 and renders sky, rings and a rider that move", async ({ page }) => {
    const errors: string[] = [];
    await boot(page, "?manual=1&chapter=0&objective=2", errors);
    const health = await page.evaluate(() => window.__AURA_SILT__.info());
    expect(health.routeHealth?.status).toBe("ready");
    expect(health.routeHealth?.parityIds).toContain("SH-02");
    expect(health.diagnostics?.errors ?? []).toEqual([]);
    expect(health.nodeCount).toBeGreaterThan(0);

    const first = await stats(page);
    await logFrame(page, "start");
    process.stdout.write(`SILT_STATS start ${JSON.stringify(first)} draws=${health.diagnostics?.drawCalls ?? "n/a"} nodes=${health.nodeCount}\n`);
    await page.evaluate(() => window.__AURA_SILT__.overview(true));
    await logFrame(page, "overview");
    await page.evaluate(() => window.__AURA_SILT__.overview(false));
    expect(first.width).toBeGreaterThan(100);
    expect(first.distinctColors, "frame is not a flat colour").toBeGreaterThan(24);
    expect(Math.abs(first.top - first.bottom), "sky and ground differ in brightness").toBeGreaterThan(6);
    expect(first.warm, "the active objective ring and the warm bike lights are drawn").toBeGreaterThan(8);

    await page.evaluate(() => window.__AURA_SILT__.stepFrames(240, { throttle: 1, steer: 0, lift: 0, brake: false, boost: false, interact: false }));
    const moved = await page.evaluate(() => window.__AURA_SILT__.state());
    expect(moved.state.z).toBeLessThan(-325 - 20);
    expect(moved.flight.speed).toBeGreaterThan(20);
    const second = await stats(page);
    expect(second.distinctColors).toBeGreaterThan(24);
    await logFrame(page, "flying");
    expect(errors.filter((e) => !/favicon|404/.test(e))).toEqual([]);
  });

  test("replays every ride recorded from the original and matches its state trace twice", async ({ page }) => {
    const errors: string[] = [];
    await boot(page, "?manual=1", errors);
    for (const ride of fixture.rides) {
      const label = `${ride.chapter}:${ride.objective}`;
      const runs: number[][][] = [];
      for (let pass = 0; pass < 2; pass++) {
        await page.evaluate(([c, o, clockMs, time]) => window.__AURA_SILT__.reset(c, o, { clockMs, time }), [ride.chapter, ride.objective, ride.start.clockMs, ride.start.time] as const);
        const start = await page.evaluate(() => window.__AURA_SILT__.state().state);
        expect(start.x).toBeCloseTo(ride.start.x, 6);
        expect(start.y).toBeCloseTo(ride.start.y, 6);
        expect(start.z).toBeCloseTo(ride.start.z, 6);
        const trace = await page.evaluate((segments) => window.__AURA_SILT__.replay(segments), ride.segments);
        runs.push(trace);
        expect(trace.length, `${label} step count`).toBe(ride.steps);
      }
      expect(runs[1], `${label} second replay identical`).toEqual(runs[0]);
      const trace = runs[0] as number[][];
      let worst = 0;
      ride.samples.forEach((expected, k) => {
        const index = k < ride.samples.length - 1 ? (k + 1) * fixture.sampleEvery - 1 : trace.length - 1;
        const got = trace[index] as number[];
        const lastStaged = ride.endMode === "scene" && index === trace.length - 1;
        fixture.columns.forEach((name, c) => {
          const d = Math.abs((got[c] as number) - (expected[c] as number));
          const discrete = name === "objective" || name === "point" || name === "impacts" || name === "hold";
          if (lastStaged && !discrete) return;
          if (name === "objective" || name === "point" || name === "impacts") expect(got[c], `${label} step ${index} ${name}`).toBe(expected[c]);
          else {
            const limit = name === "yaw" ? Math.max(ride.tolerance.yaw, 1e-6) : Math.max(ride.tolerance.position, 1e-6);
            expect(d, `${label} step ${index} ${name}`).toBeLessThanOrEqual(limit);
            worst = Math.max(worst, d);
          }
        });
      });
      process.stdout.write(`SILT_RIDE ${label} steps=${trace.length} worst=${worst.toExponential(2)}\n`);
    }
    expect(errors.filter((e) => !/favicon|404/.test(e))).toEqual([]);
  });

  test("live keyboard input flies the rider", async ({ page }) => {
    const errors: string[] = [];
    await boot(page, "?chapter=0&objective=2", errors);
    const before = await page.evaluate(() => window.__AURA_SILT__.state());
    await page.keyboard.down("KeyW");
    // The software-GL page renders only a few frames per second, so wait for simulation steps, not wall time.
    await page.waitForFunction((from) => window.__AURA_SILT__.state().steps >= from + 90, before.steps, { timeout: 120_000 });
    await page.keyboard.up("KeyW");
    const after = await page.evaluate(() => window.__AURA_SILT__.state());
    process.stdout.write(`SILT_KEYBOARD steps=${after.steps - before.steps} dz=${(after.state.z - before.state.z).toFixed(2)} speed=${after.flight.speed.toFixed(2)}\n`);
    expect(after.state.z).toBeLessThan(before.state.z - 5);
    expect(after.flight.speed).toBeGreaterThan(5);
    expect(errors.filter((e) => !/favicon|404/.test(e))).toEqual([]);
  });
});
