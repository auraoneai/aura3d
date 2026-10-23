/**
 * Silt & Signal on Aura3D: boot, fixed-step loop, keyboard input, HUD and capture hooks.
 * The simulation lives in `sim.ts` (pure); `world.ts` renders it through the public engine surface.
 *
 * Query parameters (all optional): `chapter=0..6`, `objective=N` (the QA jump: the rider starts 40 m
 * behind the objective's first point), `autopilot=1` (fly the reference controller), `manual=1` (the sim
 * only advances through `__AURA_SILT__.stepFrames` / `replay`).
 */
import { createAuraApp, createAuraRouteHealthSnapshot, type AuraApp } from "@aura3d/engine";
import { CHAPTERS } from "./chapters-data";
import { autopilot } from "./autopilot";
import { IDLE, STEP, createSim, objectiveOf, stepSim, targetOf, type Input, type Sim } from "./sim";
import { buildWorld, type WorldRuntime } from "./world";

const params = new URLSearchParams(location.search);
const intParam = (key: string, fallback: number, lo: number, hi: number): number => {
  const v = Number(params.get(key));
  return params.has(key) && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.trunc(v))) : fallback;
};
const config = {
  chapter: intParam("chapter", 0, 0, 6),
  objective: intParam("objective", 0, 0, 5),
  autopilot: params.get("autopilot") === "1",
  manual: params.get("manual") === "1"
};
config.objective = Math.min(config.objective, CHAPTERS[config.chapter]!.objectives.length - 1);

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`silt-and-signal-port: #${id} is missing`);
  return el as T;
};
const canvas = $<HTMLCanvasElement>("world");

let sim: Sim = createSim(config.chapter, config.objective);
let app: AuraApp | undefined;
let runtime: WorldRuntime | undefined;
let ready = false;
let autopilotOn = config.autopilot;
let renderTime = 0;
let frames = 0;
let accumulator = 0;
let hudTimer = 0;
let heldInput: Input | null = null;
const down = new Set<string>();

/* ------------------------------------------------------------------ input */

const KEYS = ["KeyW", "KeyS", "KeyA", "KeyD", "KeyE", "KeyQ", "KeyB", "ShiftLeft", "ShiftRight", "Space", "KeyF", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
addEventListener("keydown", (e) => { if (KEYS.includes(e.code)) { e.preventDefault(); down.add(e.code); } if (e.code === "KeyP") autopilotOn = !autopilotOn; });
addEventListener("keyup", (e) => down.delete(e.code));
addEventListener("blur", () => down.clear());

const held = (...codes: string[]): boolean => codes.some((c) => down.has(c));

function sampleInput(): Input {
  if (heldInput) return heldInput;
  if (autopilotOn) return autopilot(sim);
  return {
    throttle: held("KeyW", "ArrowUp") ? 1 : held("KeyS", "ArrowDown") ? -1 : 0,
    steer: held("KeyD", "ArrowRight") ? 1 : held("KeyA", "ArrowLeft") ? -1 : 0,
    lift: held("KeyE") ? 1 : held("KeyQ") ? -1 : 0,
    brake: held("KeyB"),
    boost: held("ShiftLeft", "ShiftRight", "Space"),
    interact: held("KeyF")
  };
}

/* ------------------------------------------------------------------ loop */

type Pose = { position: [number, number, number]; target: [number, number, number]; up: [number, number, number]; fov: number };
let overridePose: Pose | null = null;

function render(dt: number): void {
  if (!app || !runtime) return;
  runtime.update(sim, dt, renderTime, canvas.clientWidth / Math.max(1, canvas.clientHeight));
  if (overridePose) app.camera?.setPose(overridePose, { cut: true });
  app.step(0);
  frames++;
}

function tick(now: number, last: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  renderTime += dt;
  if (ready && !config.manual) {
    accumulator += dt;
    let guard = 0;
    while (accumulator >= STEP && guard++ < 8) { stepSim(sim, sampleInput(), STEP); accumulator -= STEP; }
    render(dt);
    hudTimer += dt;
    if (hudTimer > 0.08) { hudTimer = 0; updateHud(); }
  }
  requestAnimationFrame((t) => tick(t, now));
}

/* ------------------------------------------------------------------ HUD */

function updateHud(): void {
  const { state, flight } = sim;
  const ch = CHAPTERS[state.chapter]!;
  const o = objectiveOf(state);
  const t = targetOf(state);
  $("chapter").textContent = ch.name;
  $("objective").textContent = state.completed ? "The journey is complete" : state.scene ? `Scene: ${state.scene}` : o.title;
  $("distance").textContent = `${Math.hypot(state.x - t.x, state.z - t.z).toFixed(0)} m`;
  $("steps").textContent = `${state.objective + 1}/${ch.objectives.length} · point ${state.point + 1}/${o.points.length}`;
  $("speed").textContent = `${Math.abs(flight.speed).toFixed(0)}`;
  $("altitude").textContent = `${state.y.toFixed(0)}`;
  $<HTMLElement>("energy").style.width = `${(flight.energy * 100).toFixed(0)}%`;
  $("mode").textContent = flight.boostMode;
  $("hold").textContent = state.hold > 0 ? `holding ${state.hold.toFixed(1)} s` : "";
}

/* ------------------------------------------------------------------ hooks */

/** One recorded step: [x, y, z, yaw, speed, turn, bank, vertical, energy, objective, point, hold, impacts]. */
type Row = [number, number, number, number, number, number, number, number, number, number, number, number, number];
const row = (): Row => {
  const { state: s, flight: f } = sim;
  return [s.x, s.y, s.z, s.yaw, f.speed, f.turn, f.bank, f.vertical, f.energy, s.objective, s.point, s.hold, f.impacts];
};

function reset(chapter = config.chapter, objective = config.objective, start?: { clockMs?: number; time?: number }): void {
  const ch = Math.max(0, Math.min(6, Math.trunc(chapter)));
  sim = createSim(ch, Math.max(0, Math.min(CHAPTERS[ch]!.objectives.length - 1, Math.trunc(objective))), undefined, start);
  accumulator = 0;
  heldInput = null;
}

function stepFrames(n: number, input: Input = IDLE): void {
  for (let i = 0; i < n; i++) stepSim(sim, input, STEP);
  render(STEP);
}

function replay(segments: readonly { steps: number; input: Input }[]): Row[] {
  const trace: Row[] = [];
  for (const seg of segments) for (let i = 0; i < seg.steps; i++) { stepSim(sim, seg.input, STEP); trace.push(row()); }
  render(STEP);
  return trace;
}

function installHooks(): void {
  const routeHealth = app ? createAuraRouteHealthSnapshot(app, { parityIds: ["SH-02", "SH-01", "SG-05", "ST-01"] }) : null;
  Object.assign(window as unknown as Record<string, unknown>, {
    __AURA_SILT__: {
      get ready() { return ready; },
      config,
      reset,
      stepFrames,
      replay,
      applyInput(input: Input | null) { heldInput = input; },
      setAutopilot(on: boolean) { autopilotOn = on; },
      state: () => structuredClone({ state: sim.state, flight: sim.flight, time: sim.time, steps: sim.steps }),
      row,
      render: () => render(0),
      /** a fixed camera pose for evidence frames; passing false returns to the chase camera */
      overview(on: boolean) {
        overridePose = on ? { position: [sim.state.x + 40, sim.state.y + 230, sim.state.z + 190], target: [sim.state.x, 0, sim.state.z - 160], up: [0, 1, 0], fov: 62 } : null;
      },
      info: () => ({ frames, nodeCount: runtime?.nodeCount ?? 0, diagnostics: app?.diagnostics() ?? null, routeHealth })
    }
  });
}

async function boot(): Promise<void> {
  const size = (): void => {
    const dpr = 1;
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  };
  size();
  addEventListener("resize", size);
  const world = buildWorld(config.chapter);
  app = createAuraApp(canvas, {
    autoStart: false,
    resize: false,
    pixelRatio: 1,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    output: { toneMapping: "aces", dither: false },
    scene: world.scene
  });
  await app.ready();
  runtime = world.bind(app);
  ready = true;
  $("loading").classList.add("hidden");
  installHooks();
  render(0);
  updateHud();
  requestAnimationFrame((t) => tick(t, t));
}

boot().catch((error) => {
  console.error(error);
  $("loading-status").textContent = `Could not start: ${String((error as Error)?.message ?? error)}`;
});
