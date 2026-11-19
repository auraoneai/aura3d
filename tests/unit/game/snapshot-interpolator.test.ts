/**
 * `createSnapshotInterpolator` (5.7.0): the generic fixed-step snapshot interpolator, and proof that the three games
 * moved onto it (Strange Orbit, Ion Circuit / heatsink, Roadster Hours) present byte-identical states to their frozen
 * pre-5.7.0 presenters over recorded runs, including restarts that must snap.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createFixedStepLoop } from "../../../packages/engine/src/qa/fixedStepLoop";
import { createFixedStepPresenter, createSnapshotInterpolator, mixNumber, mixVec3 } from "../../../packages/game/src/motion/index";
import * as orbitNew from "../../../examples/strange-orbit-port/presentation";
import * as orbitOld from "./legacy/strange-orbit-presentation";
import { STEP, createRace, decodeInputScript, startCountdown, stepRace, type Input as OrbitInput, type RaceState } from "../../../examples/strange-orbit-port/race";
import * as heatNew from "../../../examples/heatsink-port/presentation";
import * as heatOld from "./legacy/heatsink-presentation";
import { FRAME, Race } from "../../../examples/heatsink-port/race";
import type { Input as HeatInput } from "../../../examples/heatsink-port/vehicle";
import { expandSegments, parseInputScript } from "../../../tools/crayon-capture/heatsink-lib";
import * as roadNew from "../../../examples/roadster-hours-port/presentation";
import * as roadOld from "./legacy/roadster-hours-presentation";
import { DEFAULT_PARAMS, autopilot } from "../../../examples/roadster-hours-port/autopilot";
import { SIM_STEP, createRun, defaultCareer, stepRun, type Career, type Run } from "../../../examples/roadster-hours-port/sim";

/** Exact serialisation: JSON keeps every finite double round-trip exact; -0 and NaN are spelled out. */
const bytes = (value: unknown): string =>
  JSON.stringify(value, (_k, v: unknown) => (typeof v === "number" ? (Object.is(v, -0) ? "-0" : Number.isNaN(v) ? "NaN" : v) : v));

/** Uneven per-frame alphas (a 144 Hz display with jitter), plus the edges: exactly 0, exactly 1, above 1 and below 0. */
const ALPHAS = [0, 0.125, 0.41666, 0.5, 0.83333, 0.999999, 1, 1.25, -0.05];

/** What `createFixedStepLoop.alpha` can be after a frame: [0, 1). */
const LOOP_ALPHAS = ALPHAS.filter((a) => a >= 0 && a < 1);

interface PresenterLike<S> { afterStep(): void; reset(): void; present(source: { alpha: number }, live?: boolean): S }

/**
 * Steps a recorded run and, after every step, asks both presenters for every alpha (and once with `live = false`).
 * `restartAt` swaps in a fresh run without a reset (the snap path); `resetAt` resets both presenters.
 */
function compare<S>(
  steps: number, step: (i: number) => void, legacy: PresenterLike<S>, next: PresenterLike<S>,
  hooks: { restartAt?: number[]; resetAt?: number[]; restart?: () => void; alphas?: readonly number[]; latest?: boolean } = {}
): number {
  const alphas = hooks.alphas ?? ALPHAS;
  let compared = 0;
  for (let i = 0; i < steps; i += 1) {
    if (hooks.restartAt?.includes(i)) hooks.restart?.();
    if (hooks.resetAt?.includes(i)) { legacy.reset(); next.reset(); }
    step(i);
    legacy.afterStep();
    next.afterStep();
    for (const alpha of alphas) {
      const a = bytes(legacy.present({ alpha }, true));
      const b = bytes(next.present({ alpha }, true));
      if (a !== b) throw new Error(`step ${i} alpha ${alpha}: presented state differs\nold ${a.slice(0, 400)}\nnew ${b.slice(0, 400)}`);
      compared += 1;
    }
    if (hooks.latest !== false) expect(bytes(next.present({ alpha: 0.5 }, false))).toBe(bytes(legacy.present({ alpha: 0.5 }, false)));
  }
  return compared;
}

describe("createSnapshotInterpolator", () => {
  type P = { x: number; tag: string };
  const blend = (a: P, b: P, t: number): P => ({ x: mixNumber(a.x, b.x, t), tag: b.tag });

  it("matches createFixedStepPresenter call for call (present, reset, live = false, alpha clamping)", () => {
    const sim = { x: 0, tag: "a" };
    const old = createFixedStepPresenter<P>({ snapshot: () => ({ ...sim }), blend });
    const now = createSnapshotInterpolator<P>({ snapshot: () => ({ ...sim }), blend });
    for (let i = 0; i < 200; i += 1) {
      sim.x += 0.37 + (i % 7) * 0.01;
      sim.tag = i % 2 ? "a" : "b";
      if (i === 120) { old.reset(); now.reset(); }
      old.afterStep();
      now.afterStep();
      for (const alpha of ALPHAS) expect(now.present({ alpha })).toEqual(old.present({ alpha }));
      expect(now.present(0.3)).toEqual(old.present({ alpha: 0.3 }));
      expect(now.present({ alpha: 0.3 }, false)).toEqual({ ...sim });
    }
  });

  it("draws between the last two steps with createFixedStepLoop's alpha", () => {
    const sim = { x: 0, tag: "" };
    const presenter = createSnapshotInterpolator<P>({ snapshot: () => ({ ...sim }), blend });
    let drawn: number[] = [];
    let now = 0;
    const loop = createFixedStepLoop({
      stepSeconds: 1 / 60,
      step: () => { sim.x += 1; presenter.afterStep(); },
      render: () => { drawn.push(presenter.present(loop).x); },
      now: () => now,
      schedule: () => 0,
      cancel: () => undefined
    });
    loop.tick(0);
    drawn = [];
    for (let f = 1; f <= 240; f += 1) loop.tick((f * 1000) / 120); // a 120 Hz display
    const settled = drawn.slice(4); // the first frames run before two steps exist
    const deltas = settled.slice(1).map((x, i) => x - settled[i]!);
    expect(deltas.every((d) => d > 0.49 && d < 0.51)).toBe(true); // advances half a step on every frame, never stands still
  });

  it("snaps with a predicate, a scalar distance, a tuple distance and an { x, y, z } distance", () => {
    const run = (snap: Parameters<typeof createSnapshotInterpolator<{ p: number; v: [number, number, number]; o: { x: number; y: number; z: number } }>>[0]["snap"]) => {
      const state = { p: 0, v: [0, 0, 0] as [number, number, number], o: { x: 0, y: 0, z: 0 } };
      const presenter = createSnapshotInterpolator({ snapshot: () => structuredClone(state), blend: (a, b, t) => ({ p: mixNumber(a.p, b.p, t), v: mixVec3(a.v, b.v, t), o: mixVec3(a.o, b.o, t) }), snap });
      state.p = 10; state.v = [3, 4, 0]; state.o = { x: 0, y: 3, z: 4 };
      presenter.afterStep();
      return presenter.present(0.5);
    };
    expect(run(undefined).p).toBe(5);
    expect(run((a, b) => b.p - a.p > 9).p).toBe(10);
    expect(run({ distance: 9, position: (s) => s.p }).p).toBe(10);
    expect(run({ distance: 10, position: (s) => s.p }).p).toBe(5); // strictly further than the distance
    expect(run({ distance: 4.9, position: (s) => s.v }).p).toBe(10); // |(3,4,0)| = 5
    expect(run({ distance: 5, position: (s) => s.v }).p).toBe(5);
    expect(run({ distance: 4.9, position: (s) => s.o }).p).toBe(10);
    expect(() => createSnapshotInterpolator({ snapshot: () => 0, blend: (a) => a, snap: { distance: -1, position: (s) => s } })).toThrow(RangeError);
  });

  it("allocation-free mode reuses four pooled snapshots for every step and frame", () => {
    type Q = { x: number };
    const state = { x: 0 };
    let created = 0;
    const presenter = createSnapshotInterpolator<Q>({
      create: () => { created += 1; return { x: 0 }; },
      snapshot: (out) => { out!.x = state.x; return out!; },
      blend: (a, b, t, out) => { out!.x = mixNumber(a.x, b.x, t); return out!; },
      snap: { distance: 50, position: (q) => q.x }
    });
    const seen = new Set<Q>();
    for (let i = 0; i < 500; i += 1) {
      state.x += i === 300 ? 1000 : 1;
      presenter.afterStep();
      seen.add(presenter.previous).add(presenter.current);
      const shown = presenter.present(0.5);
      seen.add(shown);
      seen.add(presenter.present(1));
      if (i !== 300) expect(shown.x).toBe(state.x - 0.5);
      else expect(shown.x).toBe(state.x); // the jump snapped
      if (i === 400) presenter.reset();
    }
    expect(created).toBe(4);
    expect(seen.size).toBe(4);
  });

  it("mixNumber and mixVec3 are the a + (b - a) * t every presenter wrote, in place when given out", () => {
    expect(mixNumber(2, 6, 0.25)).toBe(2 + (6 - 2) * 0.25);
    const out: [number, number, number] = [9, 9, 9];
    expect(mixVec3([0, 2, 4], [4, 6, 8], 0.5, out)).toBe(out);
    expect(out).toEqual([2, 4, 6]);
    const o = { x: 1, y: 1, z: 1, extra: "kept" };
    expect(mixVec3({ x: 0, y: 0, z: 0 }, { x: 2, y: 4, z: 6 }, 0.5, o)).toBe(o);
    expect(o).toEqual({ x: 1, y: 2, z: 3, extra: "kept" });
    expect(mixVec3({ x: 0, y: 0, z: 0 }, { x: 2, y: 4, z: 6 }, 1)).toEqual({ x: 2, y: 4, z: 6 });
  });
});

/** The recorded Strange Orbit reference cup run (the same capture the game's own presentation test replays). */
function orbitReference(): { script: OrbitInput[]; fresh: () => RaceState } {
  const reference = JSON.parse(readFileSync("evidence/crayon-capture/strange-orbit-reference.json", "utf8")) as {
    setup: { mode: "cup"; difficulty: string; vehicle: "bike"; rider: number; courseId: string; equipment: string };
    script: { text: string };
  };
  const fresh = (): RaceState => {
    const { setup } = reference;
    const r = createRace({ rider: setup.rider, mode: setup.mode, difficulty: setup.difficulty, vehicle: setup.vehicle, courseId: setup.courseId, equipment: setup.equipment });
    startCountdown(r);
    return r;
  };
  return { script: decodeInputScript(reference.script.text), fresh };
}

describe("games on createSnapshotInterpolator present the same bytes as their pre-5.7.0 presenters", () => {
  it("Strange Orbit: the recorded reference cup run, a restart that snaps and a reset", () => {
    const { script, fresh } = orbitReference();
    let race = fresh();
    let at = 0;
    const legacy = orbitOld.createOrbitPresenter(() => race);
    const next = orbitNew.createOrbitPresenter(() => race);
    const compared = compare(2400, () => { const input: OrbitInput = script[at] ?? {}; at += 1; stepRace(race, input, STEP); }, legacy, next, {
      restartAt: [1500], resetAt: [1900], restart: () => { race = fresh(); at = 0; }
    });
    expect(compared).toBe(2400 * ALPHAS.length);
  }, 120_000);

  it("Strange Orbit: blendShown is unchanged over the recorded snapshots, flight and loop edges included", () => {
    const { script, fresh } = orbitReference();
    const race = fresh();
    const shots: orbitNew.Shown[] = [];
    for (let i = 0; i < 1200; i += 1) { stepRace(race, script[i] ?? {}, STEP); shots.push(orbitNew.shownOf(race)); }
    const flight = { position: [1, 2, 3] as const, forward: [0, 0, 1] as const, up: [0, 1, 0] as const, age: 0.5 };
    const flight2 = { position: [1.5, 2.5, 3.5] as const, forward: [0, 0.1, 1] as const, up: [0.1, 1, 0] as const, age: 0.6 };
    shots.push({ ...shots[1199]!, flight }, { ...shots[1199]!, flight: flight2 }, { ...shots[1199]!, loopT: 0.2 }, { ...shots[1199]!, loopT: 0.3 }, { ...shots[1199]!, air: { height: 1, vy: 2, age: 0.1 } }, { ...shots[1199]!, s: shots[1199]!.s + 40 });
    for (let i = 1; i < shots.length; i += 1) {
      for (const t of ALPHAS) expect(bytes(orbitNew.blendShown(shots[i - 1]!, shots[i]!, t))).toBe(bytes(orbitOld.blendShown(shots[i - 1]!, shots[i]!, t)));
    }
  }, 60_000);

  /*
   * The old heatsink presenter rotated one pool of four snapshots through both history and `present`'s latest-state
   * path, so three or more `alpha >= 1` / `live = false` presents between two steps overwrote its history (it then blended
   * a snapshot with itself). The game never takes that path: main.ts presents once per frame with `loop.alpha`, which
   * is always in [0, 1), and only while live. So the byte comparison uses the game's call pattern; the pooled
   * interpolator keeps the latest state in its own slot (see "allocation-free mode" above), which removes the hazard.
   */
  it("Ion Circuit (heatsink): the recorded reference race into the pooled interpolator, a respawn jump and a reset", () => {
    const reference = JSON.parse(readFileSync("evidence/crayon-capture/heatsink-reference.json", "utf8")) as { script: { text: string } };
    const SCRIPT = expandSegments(parseInputScript(reference.script.text));
    let race = new Race();
    let at = 0;
    const legacy = heatOld.createHeatsinkPresenter(() => race);
    const next = heatNew.createHeatsinkPresenter(() => race);
    const compared = compare(2400, () => race.frame(FRAME, SCRIPT[Math.min(at++, SCRIPT.length - 1)] as HeatInput), legacy, next, {
      restartAt: [1600], resetAt: [2000], restart: () => { race = new Race(); at = 0; }, alphas: LOOP_ALPHAS, latest: false
    });
    expect(compared).toBe(2400 * LOOP_ALPHAS.length);
    // the blend itself, with and without `out`, over the recorded pairs
    const a = heatNew.shownOf(race), b = heatNew.shownOf(race);
    b.position.x += 0.75; b.s += 0.75; b.theta += 0.2;
    for (const t of ALPHAS) {
      expect(bytes(heatNew.blendShown(a, b, t))).toBe(bytes(heatOld.blendShown(a, b, t)));
      expect(bytes(heatNew.blendShown(a, b, t, heatNew.shownOf(race)))).toBe(bytes(heatOld.blendShown(a, b, t, heatOld.shownOf(race))));
    }
  }, 120_000);

  it("Roadster Hours: an autopilot run (deterministic recorded input), a restart that snaps and a reset", () => {
    const career = (): Career => ({ ...defaultCareer(), unlocked: 2 });
    let c = career();
    let run: Run = createRun(0, c);
    const legacy = roadOld.createRoadsterPresenter(() => run);
    const next = roadNew.createRoadsterPresenter(() => run);
    const compared = compare(2400, () => stepRun(run, autopilot(run, DEFAULT_PARAMS), SIM_STEP, c), legacy, next, {
      restartAt: [1500], resetAt: [1900], restart: () => { c = career(); run = createRun(0, c); }
    });
    expect(compared).toBe(2400 * ALPHAS.length);
  }, 120_000);
});
