import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * roadster-hours-port - PRD §7.2 Phase B, browser half (docs/workflows/threejs-parity-gaps.md, R-20).
 *
 * Remote-only (tools/remote-acr/run.sh); never run under local Playwright. Drives `examples/roadster-hours-port`
 * through `window.__AURA_ROADSTER_HOURS__`:
 *   - boots on WebGL2 with no engine error,
 *   - the route frames contain real road pixels and change as the car drives,
 *   - every traffic and lineup vehicle is in ONE batched mesh and the batched draw count is reported and bounded
 *     (one multi-draw group, or at most one draw per pooled geometry in the fallback),
 *   - the recorded reference input script (captured from the original game) replays in the live page to the original's
 *     final state, and the closed-loop autopilot completes the route.
 * Compact JPEG frames are written to the log as `ROADSTER_HOURS_FRAME <name> <base64>` (ACR runs cannot return files).
 */

const REPLAY_FIXTURE = "tests/browser/data/roadster-hours-reference-replay.json";
const REPORT_ROOT = resolve("tests/reports/roadster-hours-port");

interface Snapshot {
  screen: string; phase: string; level: string; time: number; score: number; cells: number; crashes: number; nextGate: number;
  cleanLandings: number; airRolls: number; airSpins: number; airFlips: number; combos: number; lineupsCleared: number;
  vehiclesCleared: number; overTops: number; nearMisses: number; trailerRides: number; shortcuts: number; s: number; speed: number;
  vehicles: number | null; traffic: { piece: string; s: number }[];
}
interface Stats { width: number; height: number; lumaMean: number; lumaStd: number; colorBuckets: number; hash: string }
interface Api {
  ready: boolean; snapshot(): Snapshot; begin(): void; setAutopilot(on: boolean): void;
  stepSteps(n: number, input?: unknown): number; replay(segments: unknown): Snapshot; renderNow(): void;
  stats(): Promise<Stats>; frame(w?: number, h?: number, q?: number): Promise<string>;
  batching(): { multiDrawMode?: string; multiDrawBatches?: number; instancedBatches?: number; outputDraws?: number } | null;
  diagnostics(): { drawCalls?: number; errors?: readonly unknown[] } | null;
  appInfo(): unknown;
  probeBatchedDraws(): { hidden: number; visible: number; delta: number; instances: number; geometries: number; features: readonly string[] } | null;
  routeHealth(): { status: string; parityIds: readonly string[] } | null;
}
interface ReplayFixture {
  steps: number;
  segments: unknown;
  final: Record<string, number | string>;
  tolerance: { traceDelta: number };
}

test.describe("roadster-hours-port (Phase B)", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); mkdirSync(REPORT_ROOT, { recursive: true }); });
  test.afterAll(async () => { await server.close(); });

  test("renders the route on WebGL2, batches every vehicle, and reproduces the original's recorded run", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.addInitScript(() => {
      const counts = { md: 0, de: 0, dei: 0, mdMembers: 0 };
      (window as unknown as { __glCounts: typeof counts }).__glCounts = counts;
      const proto = WebGL2RenderingContext.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
      for (const [name, key] of [["drawElements", "de"], ["drawElementsInstanced", "dei"]] as const) {
        const orig = proto[name]!;
        proto[name] = function (this: WebGL2RenderingContext, ...args: unknown[]) { counts[key]++; return orig.apply(this, args); };
      }
      const getExtension = proto.getExtension!;
      proto.getExtension = function (this: WebGL2RenderingContext, ...rest: unknown[]) {
        const n = rest[0] as string;
        const ext = getExtension.call(this, n) as Record<string, unknown> | null;
        if (n === "WEBGL_multi_draw" && ext && !ext.__counted) {
          const orig = ext.multiDrawElementsInstancedWEBGL as (...a: unknown[]) => unknown;
          ext.multiDrawElementsInstancedWEBGL = (...a: unknown[]) => { counts.md++; counts.mdMembers += Number(a[a.length - 1]) || 0; return orig.apply(ext, a); };
          ext.__counted = true;
        }
        return ext;
      };
    });
    await page.setViewportSize({ width: 640, height: 360 });
    await page.goto(`${server.origin}/examples/roadster-hours-port/?manual=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const w = window as unknown as { __AURA_ROADSTER_HOURS__?: { ready: boolean }; __AURA_ROADSTER_HOURS_ERROR__?: string };
        return w.__AURA_ROADSTER_HOURS__?.ready === true || Boolean(w.__AURA_ROADSTER_HOURS_ERROR__);
      },
      undefined,
      { timeout: 540_000 }
    );
    const bootError = await page.evaluate(() => (window as unknown as { __AURA_ROADSTER_HOURS_ERROR__?: string }).__AURA_ROADSTER_HOURS_ERROR__ ?? null);
    if (bootError) console.log("ROADSTER_HOURS_BOOT_ERROR", bootError, JSON.stringify(errors.slice(0, 8)));
    expect(bootError, JSON.stringify(errors.slice(0, 8))).toBeNull();

    const api = <T>(fn: (a: Api) => T | Promise<T>): Promise<T> => page.evaluate(`(${fn.toString()})(window.__AURA_ROADSTER_HOURS__)`) as Promise<T>;
    const frame = async (name: string): Promise<void> => {
      const jpeg = await api((a) => a.frame(480, 270, 0.55));
      console.log(`ROADSTER_HOURS_FRAME ${name} ${jpeg.slice(jpeg.indexOf(",") + 1)}`);
    };

    // ---- menu / countdown frame, then drive the autopilot and compare frames
    await api((a) => { a.begin(); a.renderNow(); });
    await page.waitForTimeout(1500);
    await api((a) => a.renderNow());
    const start = await api((a) => a.stats());
    console.log("ROADSTER_HOURS_INFO", JSON.stringify(await api((a) => {
      const d = a.diagnostics() as unknown as Record<string, unknown> | null;
      return { backend: d?.backend, drawCalls: d?.drawCalls, renderSize: d?.renderSize, errors: d?.errors, warnings: d?.warnings, renderer: d?.renderer };
    })).slice(0, 4000), JSON.stringify(errors.slice(0, 6)));
    await frame("start");
    console.log("ROADSTER_HOURS_STATS start", JSON.stringify(start));
    expect(start.lumaStd, "the start frame has real structure").toBeGreaterThan(6);
    expect(start.colorBuckets).toBeGreaterThan(12);

    await api((a) => { a.setAutopilot(true); a.stepSteps(120 * 14); a.renderNow(); });
    await page.waitForTimeout(1500);
    await api((a) => a.renderNow());
    const driving = await api((a) => a.stats());
    await frame("driving");
    console.log("ROADSTER_HOURS_STATS driving", JSON.stringify(driving));
    expect(driving.hash, "the frame changes as the car drives").not.toBe(start.hash);
    expect(driving.lumaStd).toBeGreaterThan(6);
    const mid = await api((a) => a.snapshot());
    expect(mid.s, "the autopilot drove down the road").toBeGreaterThan(300);
    expect(mid.crashes).toBe(0);

    // ---- batching: all vehicles in one batched mesh; the draw count is reported and bounded
    const vehicles = mid.vehicles ?? 0;
    expect(vehicles, "traffic + lineup vehicles are batched instances").toBeGreaterThan(20);
    const batching = await api((a) => a.batching());
    const probe = await api((a) => a.probeBatchedDraws());
    const multiDrawExt = await page.evaluate(() => { const c = document.createElement("canvas").getContext("webgl2"); return Boolean(c?.getExtension("WEBGL_multi_draw")); });
    console.log("ROADSTER_HOURS_BATCHING", JSON.stringify({ rendererBatching: batching, probe, multiDrawExt }), "vehicles", vehicles);
    expect(probe, "the batched draw probe is reported").not.toBeNull();
    expect(probe!.instances, "every vehicle box is a batched instance").toBe(vehicles);
    // GL-level count for one frame: the vehicles are a few multi-draw calls per frame with WEBGL_multi_draw, otherwise
    // the draw loop issues one draw per instance (never more).
    await page.evaluate(() => { const c = (window as unknown as { __glCounts: Record<string, number> }).__glCounts; c.md = 0; c.de = 0; c.dei = 0; c.mdMembers = 0; });
    await api((a) => a.renderNow());
    const gl = await page.evaluate(() => ({ ...(window as unknown as { __glCounts: Record<string, number> }).__glCounts }));
    console.log("ROADSTER_HOURS_GL_FRAME", JSON.stringify(gl));
    if (multiDrawExt) {
      expect(gl.md, "the batched vehicles go out as multi-draw calls").toBeGreaterThanOrEqual(1);
      // Measured: 3 calls per frame (the batch is drawn by more than one render pass), against `vehicles` draws without multi-draw.
      expect(gl.md, "a small bounded number of multi-draw calls per frame, independent of the instance count").toBeLessThanOrEqual(2 * probe!.geometries);
      expect(gl.mdMembers, "the multi-draw call carries every vehicle instance").toBeGreaterThanOrEqual(vehicles);
    } else {
      expect(gl.md).toBe(0);
      expect(gl.de + gl.dei, "fallback draws at least one per instance").toBeGreaterThanOrEqual(vehicles);
    }
    const diag = await api((a) => a.diagnostics());
    expect((diag?.errors ?? []).length, JSON.stringify(diag?.errors)).toBe(0);
    expect((diag?.drawCalls ?? 0), "the scene drew").toBeGreaterThan(0);
    const health = await api((a) => a.routeHealth());
    expect(health?.status).toBe("ready");
    expect(health?.parityIds).toContain("SG-02");

    // ---- the original's recorded run, replayed open-loop in the live page
    const fixture = JSON.parse(readFileSync(REPLAY_FIXTURE, "utf8")) as ReplayFixture;
    const replay = await page.evaluate((segments) => (window as unknown as { __AURA_ROADSTER_HOURS__: Api }).__AURA_ROADSTER_HOURS__.replay(segments), fixture.segments);
    console.log("ROADSTER_HOURS_REPLAY", JSON.stringify({ time: replay.time, score: replay.score, cells: replay.cells, crashes: replay.crashes }));
    expect(replay.phase).toBe("complete");
    for (const key of ["score", "cells", "crashes", "cleanLandings", "airRolls", "airSpins", "airFlips", "combos", "lineupsCleared", "vehiclesCleared", "overTops", "nearMisses", "trailerRides", "shortcuts"] as const) {
      expect(replay[key], `replayed ${key} equals the original's`).toBe(fixture.final[key]);
    }
    expect(Math.abs(replay.time - (fixture.final.time as number))).toBeLessThanOrEqual(Math.max(1e-6, fixture.tolerance.traceDelta));

    await api((a) => { a.renderNow(); });
    await frame("finish");
    expect(errors.filter((e) => !/favicon|404/.test(e)).slice(0, 5), "no page errors").toEqual([]);
  });
});
