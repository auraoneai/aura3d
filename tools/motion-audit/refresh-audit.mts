/**
 * Refresh-rate audit. Runs a game's real simulation at its fixed step through the real `createFixedStepLoop`, presents
 * the progress of its main entity at several display rates (60, 120, 144 Hz and a jittery 60 Hz), and measures how
 * smoothly it moves from one displayed frame to the next. `latest` draws whatever step ran last (what most ports do);
 * `interp` blends the previous and latest step with the loop's accumulator through the game kit's
 * `createRenderInterpolator`. Also reports a camera that follows with a frame-time smoothing filter and the number of
 * "moving <-> still" flips per 10 s (a proxy for run-cycle clip flips).
 *
 *   node_modules/.bin/tsx tools/motion-audit/refresh-audit.mts [out.json]
 */
import { writeFileSync } from "node:fs";
import { createFixedStepLoop } from "../../packages/engine/src/qa/fixedStepLoop";
import { createRenderInterpolator } from "../../packages/game/src/motion/smoothing";
import { createCar, stepCar, type Keys } from "../../examples/drift-and-deliver-port/sim";
import { createState as createWind, stepFrame as stepWind, VIRTUAL_STEP_MS } from "../../examples/where-the-wind-wanders-port/sim";
import { createState as createNinja, startRun, stepSim as stepNinja, SIM_STEP as NINJA_STEP } from "../../examples/ninja-runner-port/sim";
import { createSim as createSilt, stepSim as stepSilt, STEP as SILT_STEP, IDLE as SILT_IDLE } from "../../examples/silt-and-signal-port/sim";
import { createState as createGoku, step as stepGoku, IDLE as GOKU_IDLE } from "../../examples/kid-goku-beyond-the-clouds-port/sim";
import { MOUNT_PAOZU } from "../../examples/kid-goku-beyond-the-clouds-port/chapter";

type V = [number, number, number];
interface Adapter { name: string; step: number; make(): { step(): void; pos(): V } }

const KEYS: Keys = { w: true, a: false, s: false, d: false, shift: false, space: false };
const ADAPTERS: Adapter[] = [
  {
    name: "drift-and-deliver", step: 1 / 60,
    make() { const c = createCar(); return { step() { stepCar(c, 1 / 60, KEYS, []); }, pos: () => [c.x, 0, c.z] }; }
  },
  {
    name: "where-the-wind-wanders", step: VIRTUAL_STEP_MS / 1000,
    make() { const s = createWind(); return { step() { stepWind(s, { keys: "W", act: null } as never); }, pos: () => [s.pos.x, 0, s.pos.z] }; }
  },
  {
    name: "ninja-runner", step: NINJA_STEP,
    make() { const s = createNinja(); startRun(s); return { step() { stepNinja(s, NINJA_STEP); }, pos: () => [s.x, s.y, s.s] }; }
  },
  {
    name: "silt-and-signal", step: SILT_STEP,
    make() { const s = createSilt(0, 0); const inp = { ...SILT_IDLE, throttle: 1 }; return { step() { stepSilt(s, inp, SILT_STEP); }, pos: () => [s.state.x, s.state.y, s.state.z] }; }
  },
  {
    name: "kid-goku-beyond-the-clouds", step: 1 / 60,
    make() { const s = createGoku(0); return { step() { stepGoku(s, GOKU_IDLE, 1 / 60, MOUNT_PAOZU); }, pos: () => [s.lane, s.jump, s.s] }; }
  }
];

interface Display { name: string; periodMs: number; jitterMs: number }
const DISPLAYS: Display[] = [
  { name: "60Hz", periodMs: 1000 / 60, jitterMs: 0 },
  { name: "60Hz+-1.5ms", periodMs: 1000 / 60, jitterMs: 1.5 },
  { name: "120Hz", periodMs: 1000 / 120, jitterMs: 0 },
  { name: "144Hz", periodMs: 1000 / 144, jitterMs: 0 }
];

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const dist = (a: V, b: V): number => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
const lerp = (a: V, b: V, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

interface Stats { frames: number; meanStep: number; cv: number; stillFrames: number; camCv: number; flipsPer10s: number }

function run(adapter: Adapter, mode: "latest" | "interp", display: Display, seconds: number, warmup: number): Stats {
  const sim = adapter.make();
  const interp = createRenderInterpolator<V>(lerp);
  interp.reset(sim.pos());
  const loop = createFixedStepLoop({
    stepSeconds: adapter.step, maxFrameSeconds: 0.1, minFrameSeconds: 0, maxCatchUpSteps: 8,
    step() { sim.step(); interp.push(sim.pos()); }
  });
  const random = rng(20261024);
  let now = 0;
  let prevShown: V | null = null;
  let cam: V | null = null;
  let prevCam: V | null = null;
  const moves: number[] = [];
  const camMoves: number[] = [];
  let last = 0;
  const total = (warmup + seconds) * 1000;
  while (now < total) {
    now += display.periodMs + (random() * 2 - 1) * display.jitterMs;
    loop.tick(now);
    const alpha = loop.accumulator / adapter.step;
    const shown = mode === "latest" ? sim.pos() : interp.sample(alpha) ?? sim.pos();
    const dt = Math.max(0.001, (now - last) / 1000);
    last = now;
    const k = 1 - Math.exp(-8 * dt);
    cam = cam === null ? shown : lerp(cam, shown, k);
    if (now > warmup * 1000 && prevShown && prevCam) { moves.push(dist(prevShown, shown)); camMoves.push(dist(prevCam, cam)); }
    prevShown = shown;
    prevCam = cam;
  }
  const mean = moves.reduce((a, b) => a + b, 0) / Math.max(1, moves.length);
  const sd = Math.sqrt(moves.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, moves.length));
  const cm = camMoves.reduce((a, b) => a + b, 0) / Math.max(1, camMoves.length);
  const csd = Math.sqrt(camMoves.reduce((a, b) => a + (b - cm) ** 2, 0) / Math.max(1, camMoves.length));
  const eps = mean * 0.01;
  let flips = 0;
  for (let i = 1; i < moves.length; i++) if ((moves[i]! > eps) !== (moves[i - 1]! > eps)) flips++;
  return {
    frames: moves.length, meanStep: mean, cv: mean > 0 ? sd / mean : 0, stillFrames: moves.filter((m) => m <= eps).length,
    camCv: cm > 0 ? csd / cm : 0, flipsPer10s: (flips / seconds) * 10
  };
}

const out: Record<string, unknown> = {};
const lines: string[] = ["game | display | mode | frames | still frames | speed CV | camera CV | moving/still flips per 10 s"];
for (const a of ADAPTERS) {
  const rows: Record<string, Record<string, Stats>> = {};
  for (const d of DISPLAYS) {
    rows[d.name] = {};
    for (const mode of ["latest", "interp"] as const) {
      const s = run(a, mode, d, 8, 2);
      rows[d.name]![mode] = s;
      lines.push(`${a.name} | ${d.name} | ${mode} | ${s.frames} | ${s.stillFrames} | ${s.cv.toFixed(3)} | ${s.camCv.toFixed(3)} | ${s.flipsPer10s.toFixed(0)}`);
    }
  }
  out[a.name] = rows;
}
console.log(lines.join("\n"));
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(out, null, 2));
