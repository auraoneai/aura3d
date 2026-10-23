import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * strange-orbit-port - PRD §7.2 Phase A, browser half
 * (docs/workflows/threejs-parity-gaps.md, task R-20).
 *
 * Remote-only (tools/remote-acr/run.sh); never run under local Playwright. Drives
 * `examples/strange-orbit-port` through `window.__AURA_STRANGE_ORBIT__`:
 *   - the lab boots on WebGL2 with no engine error and no parity-not-implemented error,
 *   - the menu and race frames contain real track pixels where the track must be,
 *   - the frame changes while the race runs (the camera and riders move),
 *   - a full 7-lap race on the fixed 1/60 s step finishes with every lap and
 *     checkpoint in order and the same elapsed time on a second run.
 * Compact JPEG frames are written to the log as `STRANGE_ORBIT_FRAME <name> <base64>`
 * because ACR runs cannot return files.
 */

const REPORT_ROOT = resolve("tests/reports/strange-orbit-port");
const LAB = "/examples/strange-orbit-port/";
const GATE_ORDER = [90, 305, 600, 1080, 1370];
const REPLAY_FIXTURE = "tests/browser/data/strange-orbit-reference-replay.json";

interface ReplayResult {
  readonly phase: string;
  readonly steps: number;
  readonly time: number;
  readonly lapTimes: number[];
  readonly bestLap: number;
  readonly checkpoints: { step: number; gate: number; lap: number }[];
  readonly routeEvents: { step: number; text: string }[];
  readonly lapSteps: number[];
  readonly counters: Record<string, number | string | null>;
  readonly standings: { id: number; name: string; place: number; gap: string; finished: boolean; finishTime: number | null; s: number }[];
}

interface Region { readonly nonBackground: number; readonly lumaMean: number; readonly lumaStd: number; readonly colors: number; readonly warm: number }
interface Stats { readonly width: number; readonly height: number; readonly whole: Region; readonly lowerCenter: Region; readonly top: Region }

interface OrbitApi {
  ready(): boolean;
  begin(): void;
  setAutopilot(on: boolean): void;
  stepFrames(n: number): { lap: number; elapsedMs: number; finished: boolean; phase: string; checkpointOrder: number[] };
  runToFinish(max?: number): { lap: number; elapsedMs: number; finished: boolean; phase: string; checkpointOrder: number[]; steps: number };
  state(): Record<string, unknown> & { lap: number; laps: number; s: number; lane: number; speed: number; place: number; route: string; phase: string; gatesPassed: number; checkpointOrder: number[]; lapTimes: number[] };
  reset(): void;
  replay(text: string): ReplayResult;
  frame(w?: number, h?: number, q?: number): Promise<string>;
  pixels(): Promise<{ width: number; height: number; data: Uint8ClampedArray }>;
  info(): { memory?: { geometries?: number; programs?: number } } | null;
  diagnostics(): { drawCalls?: number; errors?: readonly unknown[] } | null;
  routeHealth(): { status: string; parityIds: readonly string[] } | null;
  nodeCount(): number;
}

test.describe("strange-orbit-port (Phase A)", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_ROOT, { recursive: true });
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("boots on WebGL2, renders the track, and runs a deterministic 7-lap race", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto(`${server.origin}${LAB}?manual=1&quality=low`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const w = window as unknown as { __AURA_STRANGE_ORBIT__?: { ready(): boolean }; __AURA_STRANGE_ORBIT_ERROR__?: string };
        return w.__AURA_STRANGE_ORBIT__?.ready() === true || Boolean(w.__AURA_STRANGE_ORBIT_ERROR__);
      },
      undefined,
      { timeout: 540_000 }
    );
    const bootError = await page.evaluate(() => (window as unknown as { __AURA_STRANGE_ORBIT_ERROR__?: string }).__AURA_STRANGE_ORBIT_ERROR__ ?? null);
    if (bootError) console.log("STRANGE_ORBIT_BOOT_ERROR", bootError, JSON.stringify(errors.slice(0, 8)));
    expect(bootError, JSON.stringify(errors.slice(0, 8))).toBeNull();

    const api = <T>(fn: (o: OrbitApi) => T | Promise<T>): Promise<T> =>
      page.evaluate(`(${fn.toString()})(window.__AURA_STRANGE_ORBIT__)`) as Promise<T>;

    const frame = async (name: string): Promise<void> => {
      const data = await api((o) => o.frame(480, 270, 0.7));
      console.log(`STRANGE_ORBIT_FRAME ${name} ${data.split(",")[1]}`);
    };
    const stats = (): Promise<Stats> =>
      page.evaluate(async () => {
        const o = (window as unknown as { __AURA_STRANGE_ORBIT__: OrbitApi }).__AURA_STRANGE_ORBIT__;
        const { width, height, data } = await o.pixels();
        const bg = [0x12, 0x15, 0x1c];
        const region = (x0: number, y0: number, x1: number, y1: number): Region => {
          let n = 0, nonBg = 0, sum = 0, sumSq = 0, warm = 0;
          const seen = new Set<number>();
          for (let y = Math.floor(y0 * height); y < Math.floor(y1 * height); y++) {
            for (let x = Math.floor(x0 * width); x < Math.floor(x1 * width); x++) {
              const i = (y * width + x) * 4;
              const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
              const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
              sum += luma; sumSq += luma * luma; n++;
              if (Math.abs(r - bg[0]!) + Math.abs(g - bg[1]!) + Math.abs(b - bg[2]!) > 40) nonBg++;
              if (r > g + 12 && g > b - 4 && r > 60) warm++;
              seen.add((r >> 4) << 8 | (g >> 4) << 4 | (b >> 4));
            }
          }
          const mean = sum / n;
          return { nonBackground: nonBg / n, lumaMean: mean, lumaStd: Math.sqrt(Math.max(0, sumSq / n - mean * mean)), colors: seen.size, warm: warm / n };
        };
        return { width, height, whole: region(0, 0, 1, 1), lowerCenter: region(0.3, 0.6, 0.7, 0.95), top: region(0, 0, 1, 0.3) };
      });

    // ---- menu beauty shot ----
    await api((o) => { o.stepFrames(1); return 0; });
    const menuStats = await stats();
    console.log("STRANGE_ORBIT_STATS menu", JSON.stringify(menuStats));
    await frame("menu");

    // ---- racing: countdown (3.2 s) then 6 s of autopilot ----
    await api((o) => { o.begin(); o.setAutopilot(true); o.stepFrames(200); return 0; });
    await frame("race-start");
    const startStats = await stats();
    console.log("STRANGE_ORBIT_STATS race-start", JSON.stringify(startStats));
    await api((o) => { o.stepFrames(360); return 0; });
    await frame("race-6s");
    const movedStats = await stats();
    console.log("STRANGE_ORBIT_STATS race-6s", JSON.stringify(movedStats));
    const racing = await api((o) => o.state());
    console.log("STRANGE_ORBIT_RACING", JSON.stringify({ s: racing.s, lane: racing.lane, speed: racing.speed, place: racing.place, route: racing.route, phase: racing.phase }));

    // Compact on purpose: the full diagnostics object is large enough to be dropped from the remote log.
    const diag = await api((o) => {
      const d = o.diagnostics() as { drawCalls?: number; errors?: readonly unknown[] } | null;
      const i = o.info() as { memory?: { geometries?: number; programs?: number } } | null;
      return { drawCalls: d?.drawCalls ?? 0, errorCount: d?.errors?.length ?? null, geometries: i?.memory?.geometries ?? null, programs: i?.memory?.programs ?? null, nodes: o.nodeCount(), routeHealth: o.routeHealth() };
    });
    console.log("STRANGE_ORBIT_DIAG", JSON.stringify(diag), JSON.stringify(errors.slice(0, 6)).slice(0, 600));

    // ---- deterministic 7-lap race (sim only, then render the finish) ----
    const run = async (): Promise<{ status: { lap: number; elapsedMs: number; finished: boolean; phase: string; checkpointOrder: number[]; steps: number }; state: Awaited<ReturnType<OrbitApi["state"]>> }> => {
      await api((o) => { o.reset(); o.setAutopilot(true); return 0; });
      const status = await api((o) => o.runToFinish());
      const state = await api((o) => o.state());
      return { status, state };
    };
    const first = await run();
    await frame("finish");
    const second = await run();
    console.log("STRANGE_ORBIT_RACE", JSON.stringify({ first: first.status, second: second.status, lapTimes: first.state.lapTimes }));

    // ---- the original's recorded race, replayed step-exactly through the live port (same Chrome build as the capture) ----
    const fixture = JSON.parse(readFileSync(resolve(REPLAY_FIXTURE), "utf8")) as {
      script: { text: string; steps: number };
      reference: { steps: number; finishTime: number; lapTimes: number[]; bestLap: number; checkpoints: { step: number; gate: number; lap: number }[]; routeEvents: { step: number; text: string }[]; hudFrames: { step: number; event: string }[]; gatesPassed: number; hits: number; respawns: number; nearMisses: number; dust: number; tricks: number; stunts: number; loops: number; score: number; place: number; medal: string; standings: { id: number; name: string; place: number; gap: string; finished: boolean; finishTime: number | null; s: number }[] };
    };
    const replayed = await page.evaluate(`window.__AURA_STRANGE_ORBIT__.replay(${JSON.stringify(fixture.script.text)})`) as ReplayResult;
    await frame("replay-finish");
    const rivalDiffs = replayed.standings.map((entry, i) => ({ name: entry.name, ds: entry.s - fixture.reference.standings[i]!.s }));
    console.log("STRANGE_ORBIT_REPLAY", JSON.stringify({ steps: replayed.steps, time: replayed.time, referenceTime: fixture.reference.finishTime, lapTimes: replayed.lapTimes, counters: replayed.counters, rivalDiffs }));

    writeFileSync(resolve(`${REPORT_ROOT}/strange-orbit-port.json`), `${JSON.stringify({
      schema: "aura3d-strange-orbit-port/1.0",
      generatedAt: new Date().toISOString(),
      claimBoundary: "Proves the Aura3D port boots on WebGL2, renders its track and riders, and that its fixed-step race is deterministic with every lap and checkpoint in order. It does not claim pixel parity with the original; the original-vs-port capture comparison is a separate step.",
      menuStats, startStats, movedStats, diag, first: first.status, second: second.status, errors
    }, null, 2)}\n`);

    expect(errors.filter((e) => /parity-not-implemented|Failed to resolve|shader|GLSL|compile/i.test(e)), errors.join("\n")).toEqual([]);

    // The scene draws: geometry reached the GPU and the route-health snapshot names the parity IDs.
    expect(diag.drawCalls).toBeGreaterThan(5);
    expect(diag.errorCount ?? 0).toBe(0);
    expect(diag.routeHealth?.status).toBe("ready");
    expect(diag.routeHealth?.parityIds).toEqual(["SG-03", "SG-05", "SH-02", "R-23"]);
    expect(diag.nodes).toBeGreaterThan(25);

    // Track pixels sit under the chase camera; the frame is not a flat clear colour.
    expect(startStats.whole.colors, JSON.stringify(startStats.whole)).toBeGreaterThan(40);
    expect(startStats.whole.lumaStd, JSON.stringify(startStats.whole)).toBeGreaterThan(8);
    expect(startStats.lowerCenter.nonBackground, JSON.stringify(startStats.lowerCenter)).toBeGreaterThan(0.5);
    expect(movedStats.lowerCenter.nonBackground, JSON.stringify(movedStats.lowerCenter)).toBeGreaterThan(0.5);
    expect(menuStats.whole.colors, JSON.stringify(menuStats.whole)).toBeGreaterThan(30);

    // The race ran: forward progress on the track with the camera following it.
    expect(racing.phase).toBe("racing");
    expect(racing.s).toBeGreaterThan(150);
    expect(racing.speed).toBeGreaterThan(20);

    // Phase A: seven laps, every checkpoint in order, finished, identical on a second run.
    for (const run of [first, second]) {
      expect(run.status.finished, JSON.stringify(run.status)).toBe(true);
      expect(run.state.lap).toBe(7);
      expect(run.state.gatesPassed).toBe(35);
      expect(run.status.checkpointOrder).toEqual(Array.from({ length: 7 }, () => GATE_ORDER).flat());
      expect(Math.abs(run.status.elapsedMs - 243783)).toBeLessThanOrEqual(3);
    }
    expect(second.status.elapsedMs).toBe(first.status.elapsedMs);
    expect(second.status.checkpointOrder).toEqual(first.status.checkpointOrder);
    expect(second.state.lapTimes).toEqual(first.state.lapTimes);

    // Replaying the original's recorded input script reproduces its race.
    const ref = fixture.reference;
    expect(replayed.phase).toBe("finished");
    expect(replayed.steps).toBe(ref.steps);
    expect(replayed.time).toBe(ref.finishTime);
    expect(replayed.lapTimes).toHaveLength(ref.lapTimes.length);
    replayed.lapTimes.forEach((lap, i) => expect(lap).toBeCloseTo(ref.lapTimes[i]!, 5));
    expect(replayed.checkpoints).toEqual(ref.checkpoints.map((c) => ({ step: c.step, gate: c.gate, lap: c.lap })));
    expect(replayed.routeEvents).toEqual(ref.routeEvents.map((r) => ({ step: r.step, text: r.text })));
    expect(replayed.lapSteps).toEqual(ref.hudFrames.filter((f) => f.event === "lap").map((f) => f.step));
    expect(replayed.counters).toMatchObject({ gatesPassed: ref.gatesPassed, hits: ref.hits, respawns: ref.respawns, nearMisses: ref.nearMisses, dust: ref.dust, tricks: ref.tricks, stunts: ref.stunts, loops: ref.loops, score: ref.score, place: ref.place, medal: ref.medal });
    replayed.standings.forEach((entry, i) => {
      const want = ref.standings[i]!;
      expect([entry.id, entry.name, entry.place, entry.gap, entry.finished, entry.finishTime]).toEqual([want.id, want.name, want.place, want.gap, want.finished, want.finishTime]);
      expect(Math.abs(entry.s - want.s)).toBeLessThan(1e-5);
    });
  });
});
