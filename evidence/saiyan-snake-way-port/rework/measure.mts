/**
 * Shake measurement for Serpentine Sky Run. Runs the real simulation at its fixed 60 Hz step through the real
 * `createFixedStepLoop`, presents it at several display rates (and a jittery 60 Hz), and measures how smoothly
 * the runner, its run cycle and the chase camera move from one displayed frame to the next.
 *
 * `before` reproduces the presentation logic of world.ts at commit 5ae6a4c1b (draw whatever step ran last).
 * `after` uses the shipped helpers in presentation.ts and the game kit's createRenderInterpolator. Both use the same road, camera and pose code.
 *
 * node_modules/.bin/tsx evidence/saiyan-snake-way-port/rework/measure.mts [out.json]
 */
import { writeFileSync } from "node:fs";
import { createFixedStepLoop } from "../../../packages/engine/src/qa/fixedStepLoop";
import { createRun, stepRun, STEP, ROAD_LENGTH, type RunState } from "../../../examples/saiyan-snake-way-port/sim";
import { buildRoadSamples, frameAt, onRoad, type V3 } from "../../../examples/saiyan-snake-way-port/road";
import { poseHero } from "../../../examples/saiyan-snake-way-port/hero";
import { createRenderInterpolator } from "../../../packages/game/src/motion/smoothing";
import { advanceRunPhase, blendSamples, sampleOf, stepChaseRig, withSample, type ChaseRig, type PresentSample } from "../../../examples/saiyan-snake-way-port/presentation";

const samples = buildRoadSamples();

interface DisplayCase { name: string; periodMs: number; jitterMs: number }
const CASES: readonly DisplayCase[] = [
  { name: "60Hz", periodMs: 1000 / 60, jitterMs: 0 },
  { name: "60Hz+-1.5ms jitter", periodMs: 1000 / 60, jitterMs: 1.5 },
  { name: "120Hz", periodMs: 1000 / 120, jitterMs: 0 },
  { name: "144Hz", periodMs: 1000 / 144, jitterMs: 0 }
];

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

type Mode = "before" | "after";

interface Frame { char: V3; eye: V3; pelvisY: number; phaseInc: number; moving: boolean; dt: number }

function runCase(mode: Mode, c: DisplayCase, seconds: number, warmup: number): Frame[] {
  const S: RunState = createRun();
  const interpolator = createRenderInterpolator<PresentSample>(blendSamples);
  interpolator.reset(sampleOf(S));
  const loop = createFixedStepLoop({
    stepSeconds: STEP, maxFrameSeconds: 0.1, minFrameSeconds: 0, maxCatchUpSteps: 8,
    step() {
      stepRun(S, { taps: [], held: [] }, STEP);
      S.ents = [];
      S.stumble = 0;
      S.shake = 0;
      interpolator.push(sampleOf(S));
    }
  });
  const random = rng(20261024);
  let now = 0;
  let last = 0;
  let prevS: number | null = null;
  let phaseAcc = 0;
  let rig: ChaseRig | null = null;
  let time = 0;
  const frames: Frame[] = [];
  const total = (warmup + seconds) * 1000;
  loop.tick(0);
  while (now < total) {
    now += c.periodMs + (c.jitterMs ? (random() * 2 - 1) * c.jitterMs : 0);
    loop.tick(now);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt;
    const alpha = Math.min(1, loop.accumulator / STEP);
    const V = mode === "after" && alpha < 1 ? withSample(S, interpolator.sample(alpha) as PresentSample) : S;
    const frame = frameAt(samples, Math.min(V.s, ROAD_LENGTH));
    const pose = onRoad(frame, V.laneX, V.y);
    if (prevS === null) prevS = V.s;
    const ds = V.s - prevS;
    prevS = V.s;
    const before = phaseAcc;
    phaseAcc = advanceRunPhase(phaseAcc, ds, dt);
    const parts = poseHero({
      phase: phaseAcc, time, grounded: true, vy: 0, sliding: false, flying: false, diving: false,
      lean: Math.max(-0.3, Math.min(0.3, V.laneVel * 0.012)), surge: 0, stumble: 0, speed: S.speed
    });
    rig = stepChaseRig(rig, frame.F, frame.U, dt);
    const back = 7 + Math.min(1.6, S.speed * 0.03);
    const rise = 3.4;
    const eye: V3 = [pose[0] - rig.f[0] * back + rig.u[0] * rise, pose[1] - rig.f[1] * back + rig.u[1] * rise, pose[2] - rig.f[2] * back + rig.u[2] * rise];
    if (now >= warmup * 1000) frames.push({ char: pose, eye, pelvisY: (parts.pelvis as { p: V3 }).p[1], phaseInc: phaseAcc - before, moving: ds > 1e-5, dt });
  }
  return frames;
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const std = (xs: number[]): number => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
const rms = (xs: number[]): number => Math.sqrt(mean(xs.map((x) => x * x)));

function metrics(frames: Frame[]) {
  const speedOf = (pick: (f: Frame) => V3): number[] => frames.slice(1).map((f, i) => len(sub(pick(f), pick(frames[i] as Frame))) / f.dt);
  const charSpeed = speedOf((f) => f.char), eyeSpeed = speedOf((f) => f.eye);
  const second = (pick: (f: Frame) => V3): number[] => {
    const out: number[] = [];
    for (let i = 1; i < frames.length - 1; i++) {
      const a = pick(frames[i - 1] as Frame), b = pick(frames[i] as Frame), d = pick(frames[i + 1] as Frame);
      out.push(len([a[0] - 2 * b[0] + d[0], a[1] - 2 * b[1] + d[1], a[2] - 2 * b[2] + d[2]]));
    }
    return out;
  };
  const pelvisSecond: number[] = [];
  for (let i = 1; i < frames.length - 1; i++) pelvisSecond.push(Math.abs((frames[i - 1] as Frame).pelvisY - 2 * (frames[i] as Frame).pelvisY + (frames[i + 1] as Frame).pelvisY));
  const phaseRate = frames.map((f) => f.phaseInc / f.dt);
  let clipFlips = 0;
  for (let i = 1; i < frames.length; i++) if ((frames[i] as Frame).moving !== (frames[i - 1] as Frame).moving) clipFlips++;
  const r = (x: number): number => Math.round(x * 1e5) / 1e5;
  return {
    frames: frames.length,
    charSpeedCV: r(std(charSpeed) / mean(charSpeed)),
    eyeSpeedCV: r(std(eyeSpeed) / mean(eyeSpeed)),
    charAccelRms: r(rms(second((f) => f.char))),
    eyeAccelRms: r(rms(second((f) => f.eye))),
    pelvisHeightAccelRms: r(rms(pelvisSecond)),
    runCyclePhaseRateCV: r(std(phaseRate) / mean(phaseRate)),
    runIdleClipFlipsPer10s: r(clipFlips / (frames.reduce((a, f) => a + f.dt, 0) / 10))
  };
}

const result: Record<string, Record<string, ReturnType<typeof metrics>>> = {};
for (const mode of ["before", "after"] as const) {
  result[mode] = {};
  for (const c of CASES) result[mode][c.name] = metrics(runCase(mode, c, 8, 3));
}
const out = process.argv[2];
const json = JSON.stringify({ note: "software-free pure-maths measurement; speedCV is the coefficient of variation of per-frame speed (0 = perfectly even); accel is the RMS second difference in metres per frame squared; flips are run/idle clip switches per 10 s", ...result }, null, 2);
if (out) writeFileSync(out, json + "\n");
console.log(json);
