/**
 * Headless mirror of the PRD-08 browser specs (frame-pacing.spec.ts,
 * camera-feel.spec.ts, hit-stop/drift/rail specs): the SAME harness pipeline
 * (`harness/pipeline.ts` + `harness/scenes.ts`) mounted on a canvas-less
 * `createAuraApp(null, …)`, pumped through the scripted rAF clock. The browser
 * job adds the GPU, real rAF and the presented pixels; this file pins the
 * numbers those specs assert so a regression is caught before a remote run.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { createAuraApp, type AuraApp } from "@aura3d/engine";
import { createChaseRig, createOrbitRig, createRailRig } from "@aura3d/engine/lanes";
import { mountHarnessPipeline, type FrameRecord, type HarnessPipeline } from "../harness/pipeline";
import { buildHarnessScene, loadHarnessScene } from "../harness/scenes";
import { runScenario } from "../harness/scenarios";
import {
  checkChase,
  checkChaseLegacyMisses,
  checkDrift,
  checkDriftUnicycle,
  checkFeelAccounting,
  checkHitStopGlobal,
  checkHitStopScoped,
  checkNoHitStopMoves,
  checkOrbitWall,
  checkRail,
  checkShake,
  type Expect
} from "../checks";

// Keep the rig modules (and their `camera.rigs.*` registrations) loaded.
void [createChaseRig, createOrbitRig, createRailRig];

const fightersJson = () =>
  Promise.resolve(JSON.parse(readFileSync(new URL("../fixtures/fighters.json", import.meta.url), "utf8")));

// One app per browser page; here apps share a module scope, so each test's
// app is disposed (prd08.feel registers a global screen-feel contributor).
const mounted: { app: AuraApp; p: HarnessPipeline }[] = [];
afterEach(() => {
  for (const m of mounted.splice(0)) {
    m.p.driver.dispose();
    m.app.dispose();
  }
});

async function open(query: string): Promise<{ app: AuraApp; p: HarnessPipeline }> {
  const params = new URLSearchParams(query);
  const def = await loadHarnessScene(params.get("scene"), params, fightersJson);
  const app = createAuraApp(null, {
    scene: buildHarnessScene(def),
    qualityRebuild: { flags: ["camera", "camera.loop", "camera.interpolation"] }
  } as never);
  let clock = 0;
  const m = { app, p: mountHarnessPipeline(app, def, params, () => (clock += 1)) };
  mounted.push(m);
  return m;
}

const pump = (p: HarnessPipeline, dtMs: number, n: number) => {
  for (let i = 0; i < n; i += 1) p.tick!(dtMs);
};
const drain = (p: HarnessPipeline): FrameRecord[] => p.records.splice(0, p.records.length);
const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

describe("harness pipeline — S1/S2/S3 frame pacing", () => {
  for (const hz of [60, 120, 144]) {
    it(`S1/S3 at ${hz} Hz: one render per tick, real-time sim, smooth interpolation`, async () => {
      const { p } = await open(`?scripted=1&fixedDt=${1 / 60}`);
      pump(p, 1000 / hz, 10);
      drain(p);
      pump(p, 1000 / hz, hz);
      const records = drain(p);
      expect(records.length).toBe(hz);
      for (const r of records) expect(r.renderSubmissionsLastTick).toBe(1);
      const elapsed = records.at(-1)!.simTime - records[0]!.simTime;
      expect(elapsed).toBeGreaterThan((records.length / hz - 0.05) * 0.95);
      expect(elapsed).toBeLessThanOrEqual(records.length / hz + 1 / 30);
      if (hz === 120) {
        for (let n = 0; n < records[0]!.positions.length; n += 1) {
          const steps = records.slice(1).map((r, i) => dist(r.positions[n]!, records[i]!.positions[n]!));
          const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
          expect(mean).toBeGreaterThan(1e-4);
          expect(Math.max(...steps.map((s) => Math.abs(s - mean)))).toBeLessThanOrEqual(mean * 0.1 + 1e-6);
        }
      }
    });
  }

  it("S3 control: interpolation off shows the 2:1 judder pattern at 120 Hz", async () => {
    const { p } = await open(`?scripted=1&interpolation=0`);
    pump(p, 1000 / 120, 10);
    drain(p);
    pump(p, 1000 / 120, 120);
    const records = drain(p);
    const steps = records.slice(1).map((r, i) => dist(r.positions[0]!, records[i]!.positions[0]!));
    const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
    expect(Math.max(...steps.map((s) => Math.abs(s - mean)))).toBeGreaterThan(mean * 0.5);
  });

  it("S2: 100 ms ticks keep real time; 250 ms ticks clamp to maxFrameDt", async () => {
    const { p } = await open("?scripted=1&maxSubSteps=6");
    pump(p, 1000 / 60, 6);
    const base = drain(p).at(-1)!.simTime;
    pump(p, 100, 10);
    let records = drain(p);
    const sim = records.at(-1)!.simTime - base;
    expect(sim).toBeGreaterThanOrEqual(0.95);
    expect(sim).toBeLessThanOrEqual(1.05);
    for (const r of records) expect(r.renderSubmissionsLastTick).toBe(1);
    const before = records.at(-1)!.simTime;
    pump(p, 250, 10);
    records = drain(p);
    const clamped = records.at(-1)!.simTime - before;
    expect(clamped).toBeGreaterThan(0.9);
    expect(clamped).toBeLessThan(1.1);
    expect(p.driver.snapshot().clampedFrames).toBeGreaterThanOrEqual(10);
  });

  it("S1 control: renderPerSubstep reports 2 renders on 2-substep ticks", async () => {
    const { p } = await open("?scripted=1&renderPerSubstep=1");
    pump(p, 1000 / 60, 6);
    drain(p);
    pump(p, 1000 / 30, 30);
    const records = drain(p);
    expect(records.filter((r) => r.renderSubmissionsLastTick === 2).length).toBeGreaterThanOrEqual(records.length - 2);
  });
});

describe("harness scenarios — camera / feel / motion S-rows (headless mirror)", () => {
  // One app at a time (a browser page mounts one): dispose right after the
  // scenario so tests that compare two runs (S8 on/off) never overlap apps.
  const run = async (query: string, name: string, opts?: unknown) => {
    const { app, p } = await open(query);
    try {
      return runScenario({ app, pipeline: p }, name, opts) as never;
    } finally {
      mounted.splice(mounted.findIndex((m) => m.app === app), 1);
      p.driver.dispose();
      app.dispose();
    }
  };
  const ex = expect as unknown as Expect;

  it("S5 global: app.time.hitStop freezes sim ±1 step, presentation continues", async () => {
    checkHitStopGlobal(ex, await run("?scripted=1", "hit-stop-global", { seconds: 0.12 }), 0.12);
  });
  it("S5 scoped: hit-heavy [a,b] freezes only the fighters; bystander + shake continue", async () => {
    const r = await run("?scripted=1&scene=fighters", "hit-stop-scoped", { event: "hit-heavy", actors: ["fighter-a", "fighter-b"], frames: 12 });
    checkHitStopScoped(ex, r, 0.07);
  });
  it("S5 control: an event without hitStop leaves the fighters moving", async () => {
    checkNoHitStopMoves(ex, await run("?scripted=1&scene=fighters", "hit-stop-scoped", { event: "land", frames: 10 }));
  });
  it("S6 chase framing at 20 u/s", async () => {
    checkChase(ex, await run("?scripted=1&scene=chase", "chase-framing", { seconds: 2 }));
  });
  it("S6 control: legacy smoothing 0.045 follow misses", async () => {
    checkChaseLegacyMisses(ex, await run("?scripted=1&scene=chase", "chase-framing", { seconds: 2, legacy: true }));
  });
  it("S7 shake reaches the presented VP unfiltered", async () => {
    checkShake(ex, await run("?scripted=1", "shake-impulse", { frames: 30 }));
  });
  it("S8 orbit never puts the eye inside the wall (collision on); control enters it", async () => {
    const on = await run("?scripted=1&scene=wall", "orbit-wall", { collision: true, seconds: 30 });
    const off = await run("?scripted=1&scene=wall", "orbit-wall", { collision: false, seconds: 30 });
    checkOrbitWall(ex, on, off);
  });
  it("S10 feel accounting counts executed channels only", async () => {
    checkFeelAccounting(ex, await run("?scripted=1", "feel-accounting"));
  });
  it("S11 closed 6-point rail: speed variation ≤ 5 %, seam ≤ 1 %", async () => {
    checkRail(ex, await run("?scripted=1", "rail-lap", { lap: 12 }));
  });
  it("S12 bicycle drift script", async () => {
    checkDrift(ex, await run("?scripted=1&scene=drift&model=bicycle", "drift-script"));
  });
  it("S12 control: unicycle never exceeds 0.01 rad", async () => {
    checkDriftUnicycle(ex, await run("?scripted=1&scene=drift&model=unicycle", "drift-script"));
  });
});

describe("harness camera plumbing (headless mirror of camera-feel.spec.ts)", () => {
  type Pose = { position: number[]; target: number[]; fov: number; roll: number };
  type Cam = {
    presented(): Pose;
    setPose(p: Partial<Pose>, o?: { cut?: boolean }): void;
    setFov(f: number, o?: { halflife?: number }): void;
    setRoll(r: number, o?: { halflife?: number }): void;
    addLayer(l: { id: string; apply(p: Pose, ctx: { dt: number }): Pose }): () => void;
  };
  const camOf = (app: AuraApp) => (app as unknown as { camera: Cam }).camera;

  it("setPose cut lands within one presented frame", async () => {
    const { app, p } = await open("?scripted=1");
    camOf(app).setPose({ position: [1.5, 2.5, 3.5], target: [0, 0.5, 0] }, { cut: true });
    pump(p, 1000 / 60, 1);
    expect(camOf(app).presented().position[0]).toBeCloseTo(1.5, 5);
    expect(camOf(app).presented().target[1]).toBeCloseTo(0.5, 5);
  });

  it("setFov ramp is monotone and converges", async () => {
    const { app, p } = await open("?scripted=1");
    pump(p, 1000 / 60, 5);
    const seq = [camOf(app).presented().fov];
    camOf(app).setFov(60, { halflife: 0.2 });
    for (let i = 0; i < 90; i += 1) {
      pump(p, 1000 / 60, 1);
      seq.push(camOf(app).presented().fov);
    }
    for (let i = 1; i < seq.length; i += 1) expect(seq[i]! - seq[i - 1]!).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.abs(seq.at(-1)! - 60)).toBeLessThan(0.25);
  });

  it("setRoll reaches the pose; a real-dt decaying layer returns to exactly zero", async () => {
    const { app, p } = await open("?scripted=1");
    const c = camOf(app);
    c.setRoll(0.2, { halflife: 0.1 });
    pump(p, 1000 / 60, 30);
    expect(Math.abs(c.presented().roll - 0.2)).toBeLessThan(0.02);
    const p0 = [...c.presented().position];
    let amp = 0.3;
    const off = c.addLayer({
      id: "decay-probe",
      apply(pose, ctx) {
        const out = { ...pose, position: [pose.position[0]! + amp, pose.position[1]!, pose.position[2]!] };
        amp *= Math.pow(0.85, ctx.dt * 60);
        if (amp < 1e-6) amp = 0;
        return out;
      }
    });
    let moved = 0;
    for (let i = 0; i < 90; i += 1) {
      pump(p, 1000 / 60, 1);
      moved = Math.max(moved, dist(c.presented().position, p0));
    }
    const residual = dist(c.presented().position, p0);
    off();
    expect(moved).toBeGreaterThan(0.1);
    expect(residual).toBeLessThan(1e-9);
  });
});

describe("harness scenarios — controls mirrored from hit-stop / vehicle-rail specs", () => {
  const runOnce = async (query: string, name: string, opts?: unknown) => {
    const { app, p } = await open(query);
    return runScenario({ app, pipeline: p }, name, opts) as never;
  };

  it("S5 global on the fighters scene: every node frozen on stalled frames", async () => {
    const r = (await runOnce("?scripted=1&scene=fighters", "hit-stop-global", { seconds: 0.1 })) as {
      simTime: number[];
      positions: number[][][];
    };
    checkHitStopGlobal(expect as unknown as Expect, r as never, 0.1);
    const t0 = r.simTime[0]!;
    const stalled = r.simTime.map((t, i) => [t, i] as const).filter(([t]) => Math.abs(t - t0) < 1e-9).map(([, i]) => i);
    for (const i of stalled.slice(1)) {
      for (let n = 0; n < r.positions[i]!.length; n += 1) expect(dist(r.positions[i]![n]!, r.positions[i - 1]![n]!)).toBeLessThan(1e-9);
    }
  });

  it("S11 control: an eased loop exceeds 5 % speed variation", async () => {
    const r = (await runOnce("?scripted=1", "rail-lap", { lap: 12, ease: "inOutSine" })) as { speeds: number[] };
    const m = r.speeds.reduce((a, b) => a + b, 0) / r.speeds.length;
    expect(Math.max(...r.speeds.map((s) => Math.abs(s - m) / m))).toBeGreaterThan(0.05);
  });
});
