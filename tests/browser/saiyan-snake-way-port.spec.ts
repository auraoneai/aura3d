import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * saiyan-snake-way-port: browser half of the Phase C / R-25 port
 * (docs/workflows/threejs-parity-gaps.md).
 *
 * Remote-only (tools/remote-acr/run.sh); never run under local Playwright. Drives
 * `examples/saiyan-snake-way-port` through `window.__AURA_SAIYAN_SNAKE_WAY__`:
 *   - the lab boots on WebGL2 with no engine error and no parity-not-implemented error,
 *   - the road, sky and Goku draw real pixels where they must be,
 *   - the in-page replay of the ORIGINAL game's recorded outbound run (47 key taps, 5,433 fixed 1/60 s
 *     steps) ends at the recorded state, so the same simulation runs in the browser as in the unit test,
 *   - entity nodes are in use mid-run and the Kaio-ken aura shell is lit when the aura is on.
 * Compact JPEG frames are written to the log as `SSW_FRAME <name> <base64>` because ACR runs cannot return files.
 */

const REPORT_ROOT = resolve("tests/reports/saiyan-snake-way-port");
const LAB = "/examples/saiyan-snake-way-port/";
const FIXTURE = "tests/browser/data/saiyan-snake-way-reference-replay.json";

interface Segment { kind: "idle" | "tap" | "hold"; frames: number; key?: string; keys?: string[] }
interface Checkpoint { frame: number; phase: string; s: number; days: number; score: number; ki: number; strain: number; speed: number; auraRung: number; kiChain: number; milestoneIndex: number; atEnd: boolean; stage: string | null; ents: number }
interface Fixture { totalSteps: number; segments: Segment[]; checkpoints: Checkpoint[]; final: Checkpoint; tolerance: number }

interface Region { readonly nonBackground: number; readonly lumaMean: number; readonly lumaStd: number; readonly colors: number; readonly warm: number; readonly blue: number }
interface Stats { readonly width: number; readonly height: number; readonly whole: Region; readonly lowerCenter: Region; readonly top: Region; readonly center: Region }

interface Api {
  ready: boolean;
  start(): Record<string, unknown>;
  state(): Record<string, unknown> & { s: number; phase: string; days: number; atEnd: boolean; auraRung: number; kaio: string };
  raw(): { s: number; auraVis: number; ents: unknown[]; nimbus: number };
  stepFrames(n: number, input?: { taps?: string[]; held?: string[] }): Record<string, unknown> & { s: number };
  runSegments(segments: Segment[], maxSteps?: number): { steps: number; final: Record<string, unknown> & Checkpoint };
  frame(w?: number, h?: number, q?: number): Promise<string>;
  pixels(): Promise<{ width: number; height: number; data: Uint8ClampedArray }>;
  info(): { memory?: { geometries?: number; programs?: number } } | null;
  diagnostics(): { drawCalls?: number; errors?: readonly unknown[] } | null;
  routeHealth(): { status: string; parityIds: readonly string[] } | null;
  meta(): { steps: number; renderTime: number; entityNodes: number; nodeCount: number };
}

test.describe("saiyan-snake-way-port", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;
  const fixture = JSON.parse(readFileSync(resolve(FIXTURE), "utf8")) as Fixture;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_ROOT, { recursive: true });
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("boots on WebGL2, draws road, sky and Goku, and replays the original's recorded run", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto(`${server.origin}${LAB}?manual=1&autostart=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const w = window as unknown as { __AURA_SAIYAN_SNAKE_WAY__?: { ready: boolean }; __AURA_SAIYAN_SNAKE_WAY_ERROR__?: string };
        return w.__AURA_SAIYAN_SNAKE_WAY__?.ready === true || Boolean(w.__AURA_SAIYAN_SNAKE_WAY_ERROR__);
      },
      undefined,
      { timeout: 540_000 }
    );
    const bootError = await page.evaluate(() => (window as unknown as { __AURA_SAIYAN_SNAKE_WAY_ERROR__?: string }).__AURA_SAIYAN_SNAKE_WAY_ERROR__ ?? null);
    if (bootError) console.log("SSW_BOOT_ERROR", bootError, JSON.stringify(errors.slice(0, 8)));
    expect(bootError, JSON.stringify(errors.slice(0, 8))).toBeNull();

    const api = <T>(fn: (o: Api) => T | Promise<T>): Promise<T> => page.evaluate(`(${fn.toString()})(window.__AURA_SAIYAN_SNAKE_WAY__)`) as Promise<T>;
    const frame = async (name: string): Promise<void> => {
      const data = await api((o) => o.frame(480, 270, 0.7));
      console.log(`SSW_FRAME ${name} ${data.split(",")[1]}`);
    };
    const stats = (): Promise<Stats> =>
      page.evaluate(async () => {
        const o = (window as unknown as { __AURA_SAIYAN_SNAKE_WAY__: Api }).__AURA_SAIYAN_SNAKE_WAY__;
        const { width, height, data } = await o.pixels();
        const region = (x0: number, y0: number, x1: number, y1: number): Region => {
          let n = 0, nonBg = 0, sum = 0, sumSq = 0, warm = 0, blue = 0;
          const seen = new Set<number>();
          for (let y = Math.floor(y0 * height); y < Math.floor(y1 * height); y++) {
            for (let x = Math.floor(x0 * width); x < Math.floor(x1 * width); x++) {
              const i = (y * width + x) * 4;
              const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
              const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
              sum += luma; sumSq += luma * luma; n++;
              if (Math.abs(r - 0xa8) + Math.abs(g - 0xb4) + Math.abs(b - 0xe8) > 40) nonBg++;
              if (r > g + 24 && r > 90) warm++;
              if (b > r + 12 && b > 100) blue++;
              seen.add((r >> 4) << 8 | (g >> 4) << 4 | (b >> 4));
            }
          }
          const mean = sum / n;
          return { nonBackground: nonBg / n, lumaMean: mean, lumaStd: Math.sqrt(Math.max(0, sumSq / n - mean * mean)), colors: seen.size, warm: warm / n, blue: blue / n };
        };
        return { width, height, whole: region(0, 0, 1, 1), lowerCenter: region(0.3, 0.6, 0.7, 0.95), top: region(0, 0, 1, 0.3), center: region(0.4, 0.35, 0.6, 0.75) };
      });

    // ---- start of the run: check-in strip, Goku on the road, sky behind ----
    await api((o) => { o.start(); o.stepFrames(30); return 0; });
    const startStats = await stats();
    console.log("SSW_STATS start", JSON.stringify(startStats));
    await frame("start");
    expect(startStats.whole.colors, "the frame has many distinct colours").toBeGreaterThan(40);
    expect(startStats.whole.lumaStd, "the frame is not flat").toBeGreaterThan(8);
    expect(startStats.top.nonBackground + startStats.lowerCenter.nonBackground, "sky and road both draw").toBeGreaterThan(0.1);
    expect(startStats.center.warm, "Goku's orange gi sits in the middle of the frame").toBeGreaterThan(0.004);

    // ---- replay prefixes of the ORIGINAL's recorded input: frames at moments the reference marks ----
    const at = async (name: string, frames: number): Promise<Checkpoint> => {
      const out = await api(`(o) => o.runSegments(${JSON.stringify(fixture.segments)}, ${frames})` as unknown as (o: Api) => unknown) as { steps: number; final: Checkpoint };
      expect(out.steps).toBe(frames);
      await frame(name);
      return out.final;
    };
    const kaioMoment = fixture.checkpoints.reduce((best, c) => (c.auraRung > best.auraRung ? c : best), fixture.checkpoints[0]!);
    const f1 = await at("kaio-ken", kaioMoment.frame);
    const kaioStats = await stats();
    console.log("SSW_STATS kaio-ken", JSON.stringify(kaioStats), "rung", f1.auraRung);
    const kaioState = await api((o) => ({ raw: o.raw().auraVis, rung: o.state().auraRung, kaio: o.state().kaio }));
    expect(kaioState.raw, "the aura shell is lit while Kaio-ken is on").toBeGreaterThan(0.05);
    expect(kaioStats.center.warm, "the aura adds warm pixels around Goku").toBeGreaterThan(startStats.center.warm);

    await at("traffic", 1800);
    const trafficStats = await stats();
    console.log("SSW_STATS traffic", JSON.stringify(trafficStats));
    const entityNodes = await api((o) => o.meta());
    console.log("SSW_ENTITY_NODES", JSON.stringify(entityNodes));
    expect(entityNodes.nodeCount).toBeGreaterThan(40);
    expect(entityNodes.entityNodes, "pooled entity nodes are in use mid-run").toBeGreaterThan(5);

    await at("late-road", 4800);
    expect(trafficStats.whole.lumaMean).not.toBeCloseTo(startStats.whole.lumaMean, 1);

    // ---- full replay: the recorded run ends where the original's did ----
    const full = await api(`(o) => o.runSegments(${JSON.stringify(fixture.segments)})` as unknown as (o: Api) => unknown) as { steps: number; final: Checkpoint };
    await frame("end-of-road");
    console.log("SSW_REPLAY", JSON.stringify({ steps: full.steps, s: full.final.s, days: full.final.days, score: full.final.score, ki: full.final.ki, atEnd: full.final.atEnd }));
    expect(full.steps).toBe(fixture.totalSteps);
    expect(full.final.atEnd).toBe(true);
    for (const key of ["s", "days", "score", "ki", "strain", "speed", "kiChain", "milestoneIndex"] as const) {
      expect(Math.abs((full.final[key] as number) - (fixture.final[key] as number)), `final ${key}`).toBeLessThanOrEqual(fixture.tolerance);
    }

    // ---- engine health ----
    const health = await api((o) => ({ diagnostics: o.diagnostics(), route: o.routeHealth(), info: o.info() }));
    console.log("SSW_HEALTH", JSON.stringify({ errors: health.diagnostics?.errors?.length ?? null, drawCalls: health.diagnostics?.drawCalls ?? null, status: health.route?.status, parityIds: health.route?.parityIds, memory: health.info?.memory }));
    expect(health.diagnostics?.errors ?? []).toEqual([]);
    expect(health.route?.status).toBe("ready");
    expect(errors.filter((e) => /parity-not-implemented|CUSTOM_TEXTURE_UNBOUND|redefinition|GLSL|shader/i.test(e))).toEqual([]);
  });
});
