/**
 * Last Train to the Sea on Aura3D: boot, fixed-step loop, input, HUD and capture hooks.
 * The simulation lives in `sim.ts` (pure); `world.ts` renders it through the public engine surface.
 *
 * Query parameters (all optional): `autopilot=1` (drive the tram with the capture's controller),
 * `night=1`, `manual=1` (the sim only advances through `__AURA_LAST_TRAIN__.stepFrames`), `speed=N` (sim steps per frame).
 */
import { createAuraApp, createAuraRouteHealthSnapshot, type AuraApp } from "@aura3d/engine";
import { controllerInput, type ControllerParams } from "./replay";
import {
  DT, actionDepart, actionDoors, actionNewService, actionTimeOfDay, createState, step, tipOf,
  type SimData, type SimState, type StepInput
} from "./sim";
import { buildWorld, type WorldRuntime } from "./world";

/** Loaded at boot with `fetch`: the example dev server serves `.json` as application/json, which module imports reject. */
let data: SimData;
const params = new URLSearchParams(location.search);
const flag = (k: string): boolean => params.get(k) === "1";
const CONTROLLER: ControllerParams = { kRoll: 6, kVel: 1.2, deadband: 0.15, pace: "brisk", brakeDecel: 4, brakeMargin: 6 };

declare global {
  interface Window { __AURA_LAST_TRAIN__?: unknown; __AURA_LAST_TRAIN_ERROR__?: string }
}

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`last-train-port: #${id} is missing`);
  return el as T;
};
const canvas = $<HTMLCanvasElement>("world");

let sim: SimState = createState();
if (flag("night")) actionTimeOfDay(sim, "night");
let app: AuraApp | undefined;
let runtime: WorldRuntime | undefined;
let ready = false;
let autopilot = flag("autopilot");
const keys = new Set<string>();
let seconds = 0;

const phaseMessage: Record<string, string> = {
  docked: "Press E to open the doors.", opening: "Doors opening", deploying: "Steps out", alighting: "Passengers getting off",
  boarding: "Boarding", ready: "Ready when you are. Press W to depart.", retracting: "Steps in", closing: "Doors closing", enroute: "Cruising. A / D to balance."
};

/* ------------------------------------------------------------------ input and stepping */

function manualInput(): StepInput {
  const brake = keys.has("Space") || keys.has("KeyS") || keys.has("ArrowDown");
  return { accelerate: !brake && (keys.has("KeyW") || keys.has("ArrowUp")), brake, left: keys.has("KeyA") || keys.has("ArrowLeft"), right: keys.has("KeyD") || keys.has("ArrowRight"), cruisePace: null };
}

function autoDrive(): StepInput {
  if (sim.phase === "docked") { actionDoors(sim); return {}; }
  if (sim.phase === "ready") { actionDepart(sim); return {}; }
  return sim.phase === "enroute" ? controllerInput(sim, data, CONTROLLER) : {};
}

function stepOnce(input?: StepInput): void {
  if (sim.phase === "ready" && !autopilot && input === undefined && (keys.has("KeyW") || keys.has("ArrowUp"))) actionDepart(sim);
  step(sim, DT, input ?? (autopilot ? autoDrive() : manualInput()), data);
}

type LegSummary = { leg: number; steps: number; fares: number; tips: number; lost: number; aboard: number; catches: number; arrivedAt: number };

function advance(input: StepInput, counter: { steps: number }, renderEvery: number): void {
  step(sim, DT, input, data);
  counter.steps++;
  if (renderEvery && counter.steps % renderEvery === 0) { seconds += renderEvery * DT; render(); }
}
function until(phase: string, counter: { steps: number }, renderEvery: number): void {
  let g = 0;
  while (sim.phase !== phase) { advance({}, counter, renderEvery); if (++g > 20000) throw new Error(`stuck waiting for ${phase} in ${sim.phase}`); }
}

/** Run one leg (doors, boarding, depart, drive, arrive) with the capture's controller; simulation only unless `renderEvery` > 0. */
function runLeg(renderEvery = 0): LegSummary {
  if (sim.attempt.status !== "active") actionNewService(sim);
  const c = { steps: 0 };
  const leg = sim.leg, f0 = sim.attempt.fares, t0 = sim.attempt.tips, l0 = sim.attempt.lost, c0 = sim.catches;
  if (sim.phase === "docked") actionDoors(sim);
  until("ready", c, renderEvery);
  actionDepart(sim);
  until("enroute", c, renderEvery);
  let g = 0;
  while (sim.phase === "enroute") { advance(controllerInput(sim, data, CONTROLLER), c, renderEvery); if (++g > 200000) throw new Error("enroute never ended"); }
  return { leg, steps: c.steps, fares: sim.attempt.fares - f0, tips: sim.attempt.tips - t0, lost: sim.attempt.lost - l0, aboard: sim.passengers, catches: sim.catches - c0, arrivedAt: sim.leg };
}

/** At the circuit's closing station: open the doors and finish alighting and boarding, ending in `ready`. */
function finishStop(renderEvery = 0): { steps: number; aboard: number; status: string; grade: string | null } {
  const c = { steps: 0 };
  if (sim.phase === "docked") actionDoors(sim);
  until("ready", c, renderEvery);
  return { steps: c.steps, aboard: sim.passengers, status: sim.attempt.status, grade: sim.attempt.grade };
}

/** Fast-forward one full circuit of the six towns (simulation only unless `renderEvery` > 0). */
function runCircuit(renderEvery = 0): { steps: number; seconds: number; fares: number; tips: number; score: number; legs: number } {
  if (sim.attempt.status !== "active") actionNewService(sim);
  const f0 = sim.attempt.fares, t0 = sim.attempt.tips, s0 = sim.score;
  let steps = 0;
  for (let k = 0; k < data.tables.towns.length; k++) steps += runLeg(renderEvery).steps;
  steps += finishStop(renderEvery).steps;
  return { steps, seconds: steps * DT, fares: sim.attempt.fares - f0, tips: sim.attempt.tips - t0, score: sim.score - s0, legs: data.tables.towns.length };
}

/* ------------------------------------------------------------------ HUD and render */

function updateHud(): void {
  const towns = data.tables.towns;
  const here = towns[sim.leg]!, next = towns[(sim.leg + 1) % towns.length]!;
  $("station").textContent = sim.phase === "enroute" ? `${here.name} → ${next.name}` : here.name;
  $("next").textContent = next.name;
  $("clock").textContent = sim.timeOfDay;
  $("speed").textContent = String(Math.round(Math.abs(sim.speed) * 3.6));
  $("aboard").textContent = String(sim.passengers);
  $("fares").textContent = String(sim.attempt.fares);
  $("tips").textContent = String(sim.attempt.tips);
  $("score").textContent = String(sim.score);
  const complete = sim.attempt.status === "complete" && sim.phase === "ready";
  $("message").textContent = complete ? `Service complete (${sim.attempt.grade}). Press R for a new service.` : (phaseMessage[sim.phase] ?? sim.phase);
  const riders = $("riders");
  riders.classList.toggle("hidden", sim.trips.length === 0);
  riders.innerHTML = sim.trips.map((t) => `<span class="meta">${t.name} → ${towns[t.destination]!.name} (${tipOf(t)})</span>`).join("");
}

function render(): void {
  if (!app || !runtime) return;
  runtime.update(sim, seconds);
  app.step(0);
}

let last = 0;
let acc = 0;
function tick(now: number): void {
  requestAnimationFrame(tick);
  if (!ready) return;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!flag("manual")) {
    acc += dt;
    const perFrame = Math.max(1, Math.round(Number(params.get("speed") ?? 1)));
    let n = 0;
    while (acc >= DT && n < 6 * perFrame) { for (let i = 0; i < perFrame; i++) stepOnce(); acc -= DT; n++; }
    seconds += dt;
  }
  render();
  updateHud();
}

addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code === "KeyE" && sim.phase === "docked") actionDoors(sim);
  if (e.code === "KeyN") actionTimeOfDay(sim, sim.timeOfDay === "night" ? "day" : "night");
  if (e.code === "KeyR") actionNewService(sim);
  if (e.code === "KeyP") autopilot = !autopilot;
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());

function sizeCanvas(): void {
  const dpr = 1;
  canvas.width = Math.max(2, Math.round(canvas.clientWidth * dpr));
  canvas.height = Math.max(2, Math.round(canvas.clientHeight * dpr));
}

/* ------------------------------------------------------------------ capture hooks */

function summary() {
  const towns = data.tables.towns;
  return {
    phase: sim.phase, leg: sim.leg, station: towns[sim.leg]!.name, distance: sim.distance, speed: sim.speed, roll: sim.roll,
    aboard: sim.passengers, fares: sim.attempt.fares, tips: sim.attempt.tips, bonuses: sim.attempt.bonuses, lost: sim.attempt.lost, score: sim.score,
    circuits: sim.circuits, attempt: sim.attempt.status, grade: sim.attempt.grade, timeOfDay: sim.timeOfDay, played: sim.played, catches: sim.catches
  };
}

function memory() {
  const info = app?.info as unknown as { approximateGpuMemoryBytes?: number; memory: { geometries: number; textures: number; renderTargets?: number }; render?: { calls?: number; triangles?: number } } | undefined;
  return {
    approximateGpuMemoryBytes: info?.approximateGpuMemoryBytes ?? 0,
    textures: info?.memory.textures ?? 0, buffers: info?.memory.geometries ?? 0, renderTargets: info?.memory.renderTargets ?? 0,
    drawCalls: info?.render?.calls ?? app?.diagnostics().drawCalls ?? 0, nodes: runtime?.nodeCount ?? 0
  };
}

function pixels(): { width: number; height: number; litFraction: number; mean: number } {
  const probe = document.createElement("canvas");
  probe.width = 160; probe.height = 90;
  const ctx = probe.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0, 160, 90);
  const px = ctx.getImageData(0, 0, 160, 90).data;
  let lit = 0, sum = 0;
  for (let i = 0; i < px.length; i += 4) { const l = (px[i]! + px[i + 1]! + px[i + 2]!) / 3; sum += l; if (l > 24) lit++; }
  return { width: canvas.width, height: canvas.height, litFraction: lit / (px.length / 4), mean: sum / (px.length / 4) };
}

window.__AURA_LAST_TRAIN__ = {
  state: summary,
  memory,
  pixels,
  ready: () => ready,
  render: () => { render(); updateHud(); },
  /** Renders, then returns the canvas as a compact JPEG (base64, no header) for logs; ACR runs cannot return files. */
  frame: (w = 480, h = 270, q = 0.6) => {
    render(); updateHud();
    const probe = document.createElement("canvas");
    probe.width = w; probe.height = h;
    probe.getContext("2d")!.drawImage(canvas, 0, 0, w, h);
    return probe.toDataURL("image/jpeg", q).split(",")[1] ?? "";
  },
  doors: () => { actionDoors(sim); },
  depart: () => { actionDepart(sim); },
  setAutopilot: (on: boolean) => { autopilot = on; },
  setTimeOfDay: (v: "day" | "night") => { actionTimeOfDay(sim, v); },
  newService: () => { actionNewService(sim); },
  applyInput: (input: StepInput) => stepOnce(input),
  stepFrames: (n: number, input?: StepInput) => { for (let i = 0; i < n; i++) stepOnce(input); render(); updateHud(); return summary(); },
  runLeg: (renderEvery = 0) => runLeg(renderEvery),
  finishStop: (renderEvery = 0) => finishStop(renderEvery),
  runCircuit: (renderEvery = 0) => runCircuit(renderEvery),
  routeHealth: () => (app ? createAuraRouteHealthSnapshot(app, { parityIds: ["SH-02", "SH-01", "SG-05", "R-23", "SR-02"] }) : null)
};

/* ------------------------------------------------------------------ boot */

function reportError(error: unknown): void {
  const base = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const details = (error as { details?: unknown })?.details;
  const message = `${base}${details ? ` ${JSON.stringify(details).slice(0, 6000)}` : ""}`;
  if (!window.__AURA_LAST_TRAIN_ERROR__) window.__AURA_LAST_TRAIN_ERROR__ = message;
  $("loading-status").textContent = `The line could not load: ${message.slice(0, 300)}`;
  $("loading").classList.remove("hidden");
  console.error(error);
}

const mark = (stage: string): void => console.log(`LT boot: ${stage} @${Math.round(performance.now())}ms`);

async function boot(): Promise<void> {
  mark("start");
  sizeCanvas();
  const [route, tables] = await Promise.all(["route", "tables"].map(async (name) => (await fetch(new URL(`./data/${name}.json`, import.meta.url))).json()));
  data = { route, tables } as SimData;
  mark("data loaded");
  const world = buildWorld(data);
  mark("scene built");
  app = createAuraApp(canvas, {
    autoStart: false, resize: false, pixelRatio: 1,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    output: { toneMapping: "aces", dither: false },
    scene: world.scene
  });
  mark("app created");
  await app.ready();
  mark("app ready");
  runtime = world.bind(app, data);
  mark("runtime bound");
  ready = true;
  $("loading").classList.add("hidden");
  render();
  updateHud();
  mark("first frame");
}

addEventListener("resize", sizeCanvas);
requestAnimationFrame(tick);
boot().catch(reportError);
