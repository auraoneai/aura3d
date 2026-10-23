/**
 * Roadster Hours on Aura3D: boot, fixed-step loop, input, HUD and capture hooks.
 * The simulation (`sim.ts`) is pure; `world.ts` renders it through the public engine surface.
 *
 * Query parameters (all optional): `level=0..2`, `autostart=1`, `autopilot=1`, `manual=1` (the sim only advances
 * through `__AURA_ROADSTER_HOURS__.stepSteps/replay`).
 */
import { createAuraApp, createAuraRouteHealthSnapshot, type AuraApp } from "@aura3d/engine";
import { DEFAULT_PARAMS, autopilot } from "./autopilot";
import { LEVELS } from "./data";
import { SIM_STEP, createRun, defaultCareer, stepRun, type Career, type Run, type RunInput } from "./sim";
import { buildWorld, type WorldRuntime } from "./world";

const params = new URLSearchParams(location.search);
const levelIndex = Math.max(0, Math.min(LEVELS.length - 1, Number(params.get("level") ?? 0) | 0));
const config = { autostart: params.get("autostart") === "1", autopilot: params.get("autopilot") === "1", manual: params.get("manual") === "1" };

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`roadster-hours-port: #${id} is missing`);
  return el as T;
};
const canvas = $<HTMLCanvasElement>("world");

const career: Career = defaultCareer();
career.unlocked = LEVELS.length - 1;
let run: Run = createRun(levelIndex, career);
let app: AuraApp | undefined;
let runtime: WorldRuntime | undefined;
let ready = false;
let screen: "home" | "play" | "results" = "home";
let autopilotOn = config.autopilot;
let accumulator = 0;
let frames = 0;
let simSteps = 0;

/* ------------------------------------------------------------------ input */

const down = new Set<string>();
const pressed = new Set<string>();
addEventListener("keydown", (e) => {
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (e.code === "Enter" && screen === "home") { begin(); return; }
  down.add(e.code);
  pressed.add(e.code);
});
addEventListener("keyup", (e) => down.delete(e.code));
addEventListener("blur", () => down.clear());

const held = (...codes: string[]): boolean => codes.some((c) => down.has(c) || pressed.has(c));
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

function keyboardInput(): RunInput {
  const air = !run.grounded && run.phase === "running";
  const right = held("KeyD", "ArrowRight"), left = held("KeyA", "ArrowLeft"), fwd = held("KeyW", "ArrowUp"), back = held("KeyS", "ArrowDown");
  const steer = clamp(+right - +left, -1, 1);
  const stopping = !air && back;
  return {
    throttle: !stopping && fwd && !air ? 1 : 0, brake: stopping ? (Math.abs(steer) > 0.3 && run.v > 18 ? 0.15 : 1) : 0, steer: air ? 0 : steer,
    thrust: held("Space"), drift: stopping && Math.abs(steer) > 0.3 && run.v > 18, nitro: held("ShiftLeft", "ShiftRight"),
    roll: clamp(+held("KeyE") - +held("KeyQ"), -1, 1), spin: air ? steer : 0, flip: air ? clamp(+fwd - +back, -1, 1) : 0, recover: held("KeyR")
  };
}

/* ------------------------------------------------------------------ flow */

function begin(): void {
  run = createRun(levelIndex, career);
  runtime?.reset(run);
  screen = "play";
  accumulator = 0;
  panels();
}

function stepOnce(input: RunInput): void {
  stepRun(run, input, SIM_STEP, career);
  simSteps++;
  pressed.clear();
  if (run.phase === "complete" && screen === "play") { screen = "results"; panels(); }
}

/* ------------------------------------------------------------------ HUD */

const fmt = (t: number): string => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;
function panels(): void {
  $("menu").classList.toggle("hidden", screen !== "home");
  $("results").classList.toggle("hidden", screen !== "results");
  $("hud").classList.toggle("hidden", screen === "home");
  if (screen === "results" && run.result) {
    $("result-time").textContent = fmt(run.result.time);
    $("result-medal").textContent = `${run.result.medal} medal`;
    $("result-score").textContent = run.result.score.toLocaleString();
    $("result-cells").textContent = `${run.result.cells} / ${run.level.cells.length} data cells`;
  }
}
function updateHud(): void {
  $("timer").textContent = fmt(run.time);
  $("speed").textContent = String(Math.round(run.v * 3.6));
  $("score").textContent = Math.round(run.score).toLocaleString();
  $("gate").textContent = `Relay ${Math.min(run.nextGate + 1, run.level.gates.length)} / ${run.level.gates.length}`;
  $("act").textContent = run.act;
  $("toast").textContent = run.toastTime > 0 && run.toast ? run.toast : run.phase === "countdown" ? String(Math.max(1, Math.ceil(run.countdown))) : "";
  $("thrust-fill").style.width = `${(run.thrust / run.capacity) * 100}%`;
  $("heat-fill").style.width = `${run.heat}%`;
  $("phase").textContent = run.phase;
}

/* ------------------------------------------------------------------ frame loop */

let lastTime = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  if (ready && !config.manual && screen === "play") {
    accumulator += dt;
    while (accumulator >= SIM_STEP) {
      accumulator -= SIM_STEP;
      stepOnce(autopilotOn && run.phase === "running" ? autopilot(run, DEFAULT_PARAMS) : keyboardInput());
      if (screen !== "play") break;
    }
  }
  render(dt, now / 1000);
  requestAnimationFrame(frame);
}

function render(dt: number, time: number): void {
  if (!ready || !app || !runtime) return;
  runtime.update(run, dt, time, canvas.clientWidth / Math.max(1, canvas.clientHeight));
  app.step(0);
  updateHud();
  frames++;
}

function sizeCanvas(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = Math.max(2, Math.round(canvas.clientWidth * dpr));
  canvas.height = Math.max(2, Math.round(canvas.clientHeight * dpr));
}

/* ------------------------------------------------------------------ capture hooks */

interface Segment { readonly n: number; readonly input: RunInput }

function snapshot() {
  const r = run;
  return {
    screen: screen === "play" && r.phase === "paused" ? "pause" : screen, phase: r.phase, level: r.level.id, s: r.s, l: r.l, h: r.h, speed: r.v,
    vy: r.vy, thrust: r.thrust, heat: r.heat, grounded: r.grounded, nextGate: r.nextGate, checkpoint: r.checkpoint, time: r.time,
    score: r.score, cells: r.cells.size, crashes: r.crashes, roll: r.roll, cleanLandings: r.cleanLandings, airRolls: r.airRolls,
    drifting: r.drifting, boosting: r.boosting, spin: r.spin, flip: r.flip, airSpins: r.airSpins, airFlips: r.airFlips, combos: r.combos,
    lineupsCleared: r.lineupsCleared, vehiclesCleared: r.vehiclesCleared, overTops: r.overTops, trailerRides: r.trailerRides,
    nearMisses: r.nearMisses, shortcuts: r.shortcuts, nitro: r.nitro, theta: r.theta, wheel: r.wheel, slip: r.slip,
    traffic: r.traffic.map((t) => ({ piece: t.piece, s: t.s, l: t.l, halfLen: t.halfLen, halfWid: t.halfWid, hgt: t.hgt, moving: t.moving })),
    vehicles: runtime?.vehicleInstances ?? null,
    results: { ...career.results }, renderer: { frames }
  };
}

interface FrameStats { width: number; height: number; lumaMean: number; lumaStd: number; colorBuckets: number; hash: string; grid: number[] }

async function readFrame(): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  if (!app) throw new Error("roadster-hours-port: app not ready");
  if (!app.capture) throw new Error("roadster-hours-port: the app exposes no capture");
  const bitmap = await createImageBitmap((await app.capture({ type: "png-blob" })) as Blob);
  const c = document.createElement("canvas");
  c.width = bitmap.width;
  c.height = bitmap.height;
  const g = c.getContext("2d");
  if (!g) throw new Error("roadster-hours-port: no 2d context");
  g.drawImage(bitmap, 0, 0);
  const image = g.getImageData(0, 0, c.width, c.height);
  return { width: c.width, height: c.height, data: image.data };
}

/** Frame statistics from the sanctioned readback: luma spread, distinct colour buckets, a 16x9 luma grid and its FNV-1a hash. */
async function frameStats(): Promise<FrameStats> {
  const { width, height, data } = await readFrame();
  let sum = 0, sumSq = 0;
  const buckets = new Set<number>();
  const gridW = 16, gridH = 9;
  const grid = new Array<number>(gridW * gridH).fill(0);
  const counts = new Array<number>(gridW * gridH).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i]!, gch = data[i + 1]!, b = data[i + 2]!;
      const luma = 0.2126 * r + 0.7152 * gch + 0.0722 * b;
      sum += luma; sumSq += luma * luma;
      buckets.add(((r >> 4) << 8) | ((gch >> 4) << 4) | (b >> 4));
      const cell = Math.min(gridH - 1, Math.floor((y / height) * gridH)) * gridW + Math.min(gridW - 1, Math.floor((x / width) * gridW));
      grid[cell]! += luma; counts[cell]! += 1;
    }
  }
  const n = width * height;
  const mean = sum / n;
  const cells = grid.map((v, i) => Math.round(v / Math.max(1, counts[i]!)));
  let hash = 0x811c9dc5;
  for (const v of cells) { hash ^= v & 0xff; hash = Math.imul(hash, 0x01000193) >>> 0; }
  return { width, height, lumaMean: mean, lumaStd: Math.sqrt(Math.max(0, sumSq / n - mean * mean)), colorBuckets: buckets.size, hash: hash.toString(16), grid: cells };
}

async function frameJpeg(width = 640, height = 360, quality = 0.6): Promise<string> {
  const { width: w, height: h, data } = await readFrame();
  const src = document.createElement("canvas");
  src.width = w; src.height = h;
  src.getContext("2d")!.putImageData(new ImageData(data as unknown as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
  const out = document.createElement("canvas");
  out.width = width; out.height = height;
  out.getContext("2d")!.drawImage(src, 0, 0, width, height);
  return out.toDataURL("image/jpeg", quality);
}

const hooks = {
  stats: frameStats,
  frame: frameJpeg,
  get ready() { return ready; },
  snapshot,
  state: () => run,
  begin,
  /** Advance the simulation by `n` fixed steps with an input (or the autopilot); no rendering. */
  stepSteps(n: number, input?: RunInput): number {
    for (let i = 0; i < n && run.phase !== "complete"; i++) stepOnce(input ?? (autopilotOn ? autopilot(run, DEFAULT_PARAMS) : keyboardInput()));
    return simSteps;
  },
  /** Replay a recorded run-length script from the start of the route; resolves with the final snapshot. */
  replay(segments: readonly Segment[]): ReturnType<typeof snapshot> {
    begin();
    for (const seg of segments) for (let i = 0; i < seg.n && run.phase !== "complete"; i++) stepOnce(seg.input);
    return snapshot();
  },
  setAutopilot(on: boolean): void { autopilotOn = on; },
  renderNow(): void { render(0, performance.now() / 1000); },
  batching: () => runtime?.batching() ?? null,
  probeBatchedDraws: () => runtime?.probeBatchedDraws() ?? null,
  diagnostics: () => app?.diagnostics() ?? null,
  appInfo: () => app?.info ?? null,
  routeHealth: () => (app ? createAuraRouteHealthSnapshot(app, { parityIds: ["SG-01", "SG-02", "SH-02", "SG-03", "SG-05"] }) : null)
};
declare global { interface Window { __AURA_ROADSTER_HOURS__?: typeof hooks; __AURA_ROADSTER_HOURS_ERROR__?: string; skybreak?: { snapshot: typeof snapshot } } }
window.__AURA_ROADSTER_HOURS__ = hooks;
window.skybreak = { snapshot };

/* ------------------------------------------------------------------ boot */

async function boot(): Promise<void> {
  sizeCanvas();
  const world = buildWorld(levelIndex);
  $("level-name").textContent = world.level.name;
  app = createAuraApp(canvas, {
    autoStart: false, resize: false, pixelRatio: 1,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    output: { toneMapping: "aces", dither: false },
    scene: world.scene
  });
  await app.ready();
  runtime = world.bind(app);
  ready = true;
  $("loading").classList.add("hidden");
  $<HTMLButtonElement>("start").disabled = false;
  render(0, 0);
  panels();
  if (config.autostart) begin();
}

$("start").addEventListener("click", begin);
for (const id of ["again"]) $(id).addEventListener("click", begin);
addEventListener("resize", sizeCanvas);
requestAnimationFrame(frame);

boot().catch((error: unknown) => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  window.__AURA_ROADSTER_HOURS_ERROR__ ??= message;
  $("loading-status").textContent = `The route could not load: ${message.slice(0, 300)}`;
  console.error(error);
});
