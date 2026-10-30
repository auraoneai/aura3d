/**
 * Last Train to the Sea on Aura3D: boot, fixed-step loop, input, HUD and capture hooks.
 * The simulation lives in `sim.ts` (pure); `world.ts` renders it through the public engine surface.
 *
 * Query parameters (all optional): `autopilot=1` (drive the tram with the capture's controller),
 * `night=1`, `manual=1` (the sim only advances through `__AURA_LAST_TRAIN__.stepFrames`; skips the title screen), `speed=N` (sim steps per frame),
 * `title=0` (skip the title screen), `legs=2` (short service), `dpr=N` (pixel ratio override; default min(devicePixelRatio, 1.5)).
 * GU47: `band=A..E` pins a time band (LT-01), `look=original` keeps the 4.6 day / night look.
 *
 * Input: keyboard, or on touch screens the hold-button bar (`#touch`, shown on `(pointer: coarse)`), which feeds the same
 * `keys` set through `press` / `release`.
 */
import { createAuraApp, createAuraRouteHealthSnapshot, createFixedStepLoop, installQaHooks, type AuraApp } from "@aura3d/engine";
import { controllerInput, type ControllerParams } from "./replay";
import {
  DT, GRADES, SHORT_LEGS, actionDepart, actionDoors, actionKeepRiding, actionNewService, actionTimeOfDay, attemptScore, createState, step, streakMultiplier, tipOf,
  type SimData, type SimState, type StepInput, type Temperament
} from "./sim";
import { createTramPresenter, viewOf } from "./presentation";
import { TrainSound, diffCues, type AudioState } from "./audio";
import { TEMPERAMENT_COLORS, buildWorld, weatherOf, type WorldRuntime } from "./world";

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
const presenter = createTramPresenter(() => sim);
if (flag("night")) actionTimeOfDay(sim, "night");
if (params.get("legs") === String(SHORT_LEGS)) actionNewService(sim, { force: true, goal: SHORT_LEGS });
let app: AuraApp | undefined;
let runtime: WorldRuntime | undefined;
let ready = false;
let autopilot = flag("autopilot");
const keys = new Set<string>();
let seconds = 0;
const sound = new TrainSound();
let titleMode = !flag("manual") && !flag("autopilot") && params.get("title") !== "0";
let prevAudio: AudioState | null = null;
let resultsShown = false;
let toastUntil = 0;
const BEST_KEY = "aura3d.lasttrain.best";
const MUTE_KEY = "aura3d.lasttrain.muted";
const HUD_KEY = "aura3d.lasttrain.hud";
const readStore = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };
const writeStore = (key: string, value: string): void => { try { localStorage.setItem(key, value); } catch { /* storage is optional */ } };
/** The best is the best single-service score (fares + tips + bonuses of one attempt), not the session total. */
const readBest = (): number => Number(readStore(BEST_KEY) ?? 0) || 0;
const writeBest = (score: number): void => writeStore(BEST_KEY, String(score));
const media = (q: string): boolean => typeof matchMedia === "function" && matchMedia(q).matches;
const reducedMotion = (): boolean => media("(prefers-reduced-motion: reduce)");
/** The brake ramps to 70% (3.5 m/s^2) over 0.4 s, below the 3.8 m/s^2 harsh-braking limit, so Space slows the tram without the comfort penalty (D-10). */
const BRAKE_MAX = 0.7, BRAKE_RAMP = 0.4;
let brakeSteps = 0;
/** After one R during a service, a second R within this many rendered frames (3 s at 60 fps) abandons it. Counted in frames, not
 * wall time, so a slow device that takes seconds per frame still sees the second press as the confirmation; any other key disarms it. */
const ABANDON_FRAMES = 180;
let abandonFrames = 0;
const TEMPERAMENT_LABEL: Record<Temperament, string> = { easy: "easy", sightseer: "sightseer", rushed: "rushed", sleeper: "sleeper" };
const TEMPERAMENT_GLYPH: Record<Temperament, string> = { easy: "\u25cf", sightseer: "\u25b2", rushed: "\u25c6", sleeper: "\u25a0" };
let ridersKey = "";
if (readStore(MUTE_KEY) === "1") sound.setMuted(true);
if (readStore(HUD_KEY) === "large") document.documentElement.classList.add("hud-large");

const phaseMessage: Record<string, string> = {
  docked: "Press E to open the doors.", opening: "Doors opening", deploying: "Steps out", alighting: "Passengers getting off",
  boarding: "Boarding", ready: "Ready when you are. Press W to depart.", retracting: "Steps in", closing: "Doors closing", enroute: "Cruising. A / D to balance."
};
const phasePrompt: Record<string, [string, string]> = {
  docked: ["Press E to open the doors", "Passengers board while the doors are open"],
  opening: ["Doors opening", "Wait for the steps"], deploying: ["Steps coming out", "Wait for passengers"],
  alighting: ["Passengers getting off", "Then new riders board"], boarding: ["Boarding", "Wait for Ready, then hold W"],
  ready: ["Hold W to depart", "Space or S brakes, A / D balance the lean"], retracting: ["Steps going in", "Leaving the platform"], closing: ["Doors closing", "Hold W once moving"],
  enroute: ["Keep the lean level", "A / D balance, W to speed up, Space to brake"]
};

/* ------------------------------------------------------------------ input and stepping */

function manualInput(): StepInput {
  const brake = keys.has("Space") || keys.has("KeyS") || keys.has("ArrowDown");
  brakeSteps = brake ? brakeSteps + 1 : 0;
  const brakeLevel = BRAKE_MAX * Math.min(1, (brakeSteps * DT) / BRAKE_RAMP);
  return { accelerate: !brake && (keys.has("KeyW") || keys.has("ArrowUp")), brake, brakeLevel, left: keys.has("KeyA") || keys.has("ArrowLeft"), right: keys.has("KeyD") || keys.has("ArrowRight"), cruisePace: null };
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
/** Waits for `phase`; a tram stopped mid-route is driven on to the next station first, so `runLeg` / `runCircuit` work from any state. */
function until(phase: string, counter: { steps: number }, renderEvery: number): void {
  let g = 0;
  while (sim.phase !== phase) {
    advance(sim.phase === "enroute" ? controllerInput(sim, data, CONTROLLER) : {}, counter, renderEvery);
    if (sim.phase === "docked" && phase !== "docked") actionDoors(sim);
    if (++g > 200000) throw new Error(`stuck waiting for ${phase} in ${sim.phase}`);
  }
}

/** Run one leg (doors, boarding, depart, drive, arrive) with the capture's controller; simulation only unless `renderEvery` > 0. */
function runLeg(renderEvery = 0): LegSummary {
  if (sim.attempt.status !== "active") actionNewService(sim);
  const c = { steps: 0 };
  const leg = sim.leg, f0 = sim.attempt.fares, t0 = sim.attempt.tips, l0 = sim.attempt.lost, c0 = sim.catches;
  if (sim.phase === "docked") actionDoors(sim);
  until("ready", c, renderEvery);
  // The service can complete at this stop (its last boarding); then there is no leg to drive.
  if (sim.attempt.status !== "active") return { leg, steps: c.steps, fares: sim.attempt.fares - f0, tips: sim.attempt.tips - t0, lost: sim.attempt.lost - l0, aboard: sim.passengers, catches: sim.catches - c0, arrivedAt: sim.leg };
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
  for (let k = 0; k < data.tables.towns.length && sim.attempt.status === "active"; k++) steps += runLeg(renderEvery).steps;
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
  $("score").textContent = String(attemptScore(sim.attempt));
  updateLean();
  const complete = sim.attempt.status === "complete" && sim.phase === "ready";
  const prompt = complete ? ["Service complete", `Grade ${sim.attempt.grade ?? ""}. R new service, Enter keep riding`] as [string, string] : (phasePrompt[sim.phase] ?? [sim.phase, ""]);
  const promptEl = $("prompt");
  const promptHtml = `${touchText(prompt[0])}<span class="meta">${touchText(prompt[1])}</span>`;
  if (promptEl.dataset.k !== promptHtml) { promptEl.dataset.k = promptHtml; promptEl.innerHTML = promptHtml; }
  promptEl.classList.toggle("hidden", titleMode);
  $("message").textContent = touchText(complete ? `Service complete (${sim.attempt.grade}). Press R for a new service.` : (phaseMessage[sim.phase] ?? sim.phase));
  updateRiders();
  updateResults();
}

/** Lean meter (E-01): the marker sits at the roll (full scale 0.49), coloured green / amber / red at 0.13 / 0.22 / 0.34; the bar under it fills over the 1.5 s critical window before a catch. */
function updateLean(): void {
  const r = Math.abs(sim.roll);
  const band = r >= 0.34 ? "red" : r >= 0.22 ? "amber" : r >= 0.13 ? "warm" : "green";
  const lean = $("lean");
  if (lean.dataset.band !== band) lean.dataset.band = band;
  $("lean-dot").style.left = `${50 + Math.max(-1, Math.min(1, sim.roll / 0.49)) * 50}%`;
  $("lean-crit").style.width = `${Math.min(1, sim.criticalTime / 1.5) * 100}%`;
  $("streak").textContent = streakMultiplier(sim).toFixed(2);
  const lanterns = "\u25cf".repeat(sim.attempt.lanterns) + "\u25cb".repeat(Math.max(0, 3 - sim.attempt.lanterns));
  const lt = $("lanterns");
  if (lt.textContent !== lanterns) lt.textContent = lanterns;
}

/** Riders list (E-04/E-05/E-06): rebuilt only when it changes; temperament as a glyph and a word, not colour alone; 4 rows on narrow screens plus the next-stop count. */
function updateRiders(): void {
  const towns = data.tables.towns;
  const riders = $("riders");
  const narrow = media("(max-width: 560px)");
  const nextStop = (sim.phase === "enroute" ? (sim.leg + 1) : sim.leg) % towns.length;
  const alighting = sim.trips.filter((t) => t.destination === nextStop).length;
  const key = `${narrow ? 1 : 0}|${nextStop}|${alighting}|${sim.trips.map((t) => `${t.id}:${tipOf(t)}`).join(",")}`;
  if (key === ridersKey) return;
  ridersKey = key;
  riders.classList.toggle("hidden", sim.trips.length === 0);
  const rows = sim.trips.map((t) => `<span class="meta rider"><i class="dot" style="color:${TEMPERAMENT_COLORS[t.temperament]}" aria-hidden="true">${TEMPERAMENT_GLYPH[t.temperament]}</i>${t.name} <em>${TEMPERAMENT_LABEL[t.temperament]}</em> → ${towns[t.destination]!.name} (${tipOf(t)})</span>`);
  const limit = narrow ? 4 : rows.length;
  const shown = rows.slice(0, limit).join("") + (rows.length > limit ? `<span class="meta">+${rows.length - limit} more</span>` : "");
  riders.innerHTML = `<div class="meta next-stop">Next stop ${towns[nextStop]!.name}: ${alighting} alighting</div>${shown}`;
}

/** On touch screens the prompts name the on-screen buttons instead of keys. */
const TOUCH_WORDS: [RegExp, string][] = [
  [/Press E to open the doors/g, "Tap Go to open the doors"], [/Hold W to depart/g, "Hold Go to depart"], [/hold W/g, "hold Go"], [/Press W to depart/g, "Hold Go to depart"],
  [/Space or S brakes, A \/ D balance the lean/g, "Brake slows, the Lean buttons balance"], [/A \/ D balance, W to speed up, Space to brake/g, "Lean buttons balance, Go speeds up, Brake slows"],
  [/A \/ D to balance/g, "Lean buttons to balance"], [/Hold W once moving/g, "Hold Go once moving"],
  [/R new service, Enter keep riding/g, "use the buttons below"], [/Press R for a new service\./g, ""]
];
const touchText = (text: string): string => (media("(pointer: coarse)") ? TOUCH_WORDS.reduce((t, [re, w]) => t.replace(re, w), text) : text);

function toast(text: string, ms = 2600): void {
  const el = $("toast");
  el.textContent = touchText(text);
  el.classList.remove("off");
  toastUntil = performance.now() + ms;
}

function audioState(): AudioState {
  return {
    phase: sim.phase, speed: sim.speed, roll: sim.roll, fares: sim.attempt.fares, tips: sim.attempt.tips, lost: sim.attempt.lost,
    night: sim.timeOfDay === "night", weather: weatherOf(data, sim), complete: sim.attempt.status === "complete" && sim.phase === "ready"
  };
}

function updateAudio(dt: number): void {
  const state = audioState();
  for (const cue of diffCues(prevAudio, state)) {
    sound.cue(cue);
    if (cue === "arrive") toast(`Arrived at ${data.tables.towns[sim.leg]!.name}`);
    if (cue === "lost") toast(`Lurch! Tips lost: ${state.lost - (prevAudio?.lost ?? 0)}`);
  }
  prevAudio = state;
  sound.update(state, dt);
  if (toastUntil && performance.now() > toastUntil) { toastUntil = 0; $("toast").classList.add("off"); }
}

/** Results card (D-03/D-04/D-06): scores this service on its own; the session total is a separate row; the grade thresholds are shown. */
function updateResults(): void {
  const complete = sim.attempt.status === "complete" && sim.phase === "ready";
  const box = $("results");
  if (complete && !resultsShown && !titleMode) {
    resultsShown = true;
    const a = sim.attempt;
    const score = attemptScore(a), best = readBest();
    const comfort = a.distance ? (a.comfort / a.distance) * 100 : 0;
    $("res-grade").textContent = a.grade ?? "Complete";
    $("res-score").textContent = `Score ${score}${score > best ? " · new best" : best ? ` · best ${best}` : ""}`;
    $("res-grid").innerHTML = [["Fares", a.fares], ["Tips", a.tips], ["Bonuses", a.bonuses], ["Tips lost", a.lost], ["Catches", a.catches], ["Comfort", `${Math.round(comfort)}%`], ["Session total", sim.score]]
      .map(([k, v]) => `<span>${k}</span><span class="num">${v}</span>`).join("");
    $("res-rule").textContent = `${a.ended === "lanterns" ? "Out of lanterns: the grade is capped at Bronze. " : ""}Gold: comfort ${GRADES.gold.comfort}%+ and no catches. Silver: ${GRADES.silver.comfort}%+ and at most ${GRADES.silver.catches} catch.`;
    if (score > best) writeBest(score);
    box.classList.remove("hidden");
  }
  if (!complete && resultsShown) { resultsShown = false; box.classList.add("hidden"); }
  document.body.classList.toggle("results-open", resultsShown && !box.classList.contains("hidden"));
}

/** R: a new service. While one is running, the first press asks and a second press within 3 s abandons it (D-05). */
function requestNewService(goal?: number): void {
  if (sim.attempt.status === "active") {
    if (abandonFrames > 0) { abandonFrames = 0; actionNewService(sim, { force: true, ...(goal ? { goal } : {}) }); presenter.reset(); toast("New service from Mango Tide", 1800); }
    else { abandonFrames = ABANDON_FRAMES; toast("Press R again to abandon this service", 3000); }
    return;
  }
  actionNewService(sim, goal ? { goal } : {}); presenter.reset(); $("results").classList.add("hidden");
}

/** Enter on the results card: keep riding from this station with the riders aboard, scored as a new service (D-02). */
function keepRiding(): void {
  if (sim.attempt.status !== "complete") { $("results").classList.add("hidden"); return; }
  actionKeepRiding(sim);
  $("results").classList.add("hidden");
  toast("Free ride: hold W to depart", 2600);
}

function startPlay(goal?: number): void {
  void sound.unlock();
  if (!titleMode) return;
  if (goal) actionNewService(sim, { force: true, goal });
  titleMode = false;
  $("title").classList.add("hidden");
}

/** `live` draws the tram between the last two steps (smooth on 120 and 144 Hz displays); everything else draws the exact latest step. */
/** True from a render until the end of the current task: `pixels()` right after `frame()` (one evaluate) need not render again. */
let freshFrame = false;
function render(live = false): void {
  if (!app || !runtime) return;
  if (!freshFrame) { freshFrame = true; queueMicrotask(() => { freshFrame = false; }); }
  runtime.update(live ? viewOf(sim, presenter.present(loop, true)) : sim, seconds, { orbit: titleMode, reducedMotion: reducedMotion() });
  app.step(0);
}

/** `speed=N` runs N sim steps per fixed step. The sim steps only in play and never in manual mode; frames always render. */
const perFrame = Math.max(1, Math.round(Number(params.get("speed") ?? 1)));
const loop = createFixedStepLoop({
  stepSeconds: DT,
  maxCatchUpSteps: 6 * perFrame,
  isActive: () => ready,
  step: () => {
    if (titleMode || flag("manual")) return;
    for (let i = 0; i < perFrame; i++) stepOnce();
    presenter.afterStep();
  },
  render: (dt) => {
    if (titleMode || !flag("manual")) seconds += dt;
    render(!titleMode && !flag("manual"));
    if (abandonFrames > 0) abandonFrames--;
    updateHud();
    updateAudio(dt);
  }
});

/** One press of a game key, from the keyboard or a touch button. */
function press(code: string, repeat = false): void {
  void sound.unlock();
  if (code !== "KeyR") abandonFrames = 0;
  if (code === "Enter") keepRiding();
  if (code === "KeyM") { sound.setMuted(!sound.muted); writeStore(MUTE_KEY, sound.muted ? "1" : "0"); toast(sound.muted ? "Sound off" : "Sound on", 1200); }
  if (code === "KeyU") { const large = document.documentElement.classList.toggle("hud-large"); writeStore(HUD_KEY, large ? "large" : "normal"); toast(large ? "Large HUD" : "Normal HUD", 1200); }
  keys.add(code);
  if (code === "KeyE" && sim.phase === "docked") actionDoors(sim);
  if (!repeat && (code === "KeyW" || code === "ArrowUp") && sim.attempt.status === "active") {
    if (sim.phase === "docked") { actionDoors(sim); toast("Doors opening. Riders board, then hold Go to depart", 3200); }
    else if (sim.phase !== "ready" && sim.phase !== "enroute") toast(`${phasePrompt[sim.phase]?.[0] ?? sim.phase}: wait for Ready, then hold Go`, 2400);
  }
  if (code === "KeyN") actionTimeOfDay(sim, sim.timeOfDay === "night" ? "day" : "night");
  if (code === "KeyR" && !repeat) requestNewService();
  if (code === "Digit2" && !repeat && sim.attempt.status === "complete") requestNewService(SHORT_LEGS);
  if (code === "KeyP") autopilot = !autopilot;
}
function release(code: string): void { keys.delete(code); }

$("start-btn").addEventListener("click", () => startPlay());
document.getElementById("short-btn")?.addEventListener("click", () => startPlay(SHORT_LEGS));
document.getElementById("res-new")?.addEventListener("click", () => requestNewService());
document.getElementById("res-short")?.addEventListener("click", () => requestNewService(SHORT_LEGS));
document.getElementById("res-keep")?.addEventListener("click", () => keepRiding());
addEventListener("pointerdown", (e) => {
  void sound.unlock();
  if (titleMode && !(e.target instanceof Element && e.target.closest("button"))) startPlay();
});
addEventListener("keydown", (e) => {
  if (titleMode) { if (e.code === "Enter" || e.code === "Space") startPlay(); else if (e.code === "Digit2") startPlay(SHORT_LEGS); return; }
  press(e.code, e.repeat);
});
addEventListener("keyup", (e) => release(e.code));
addEventListener("blur", () => keys.clear());
/** The audio loops follow the rAF-driven `update`, which stops in a hidden tab: suspend the context there (D-12). */
document.addEventListener("visibilitychange", () => { void sound.setHidden(document.visibilityState === "hidden"); });

/** Touch hold-buttons (D-01): each feeds `press` / `release` like a key, held through pointer capture until up or cancel. */
for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>("#touch [data-code]"))) {
  const code = btn.dataset.code!;
  let held = false;
  const up = (): void => { if (!held) return; held = false; btn.classList.remove("on"); release(code); };
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    try { btn.setPointerCapture(e.pointerId); } catch { /* synthetic pointers have no capture */ }
    if (held) return;
    held = true; btn.classList.add("on");
    if (titleMode) startPlay();
    press(code);
  });
  btn.addEventListener("pointerup", up);
  btn.addEventListener("pointercancel", up);
  btn.addEventListener("lostpointercapture", up);
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
}

/** Pixel ratio: min(devicePixelRatio, 1.5) so the 1-px rails stay sharp on 2x screens (E-02); `?dpr=` overrides. */
const DPR = Math.max(0.5, Math.min(2, Number(params.get("dpr") ?? Math.min(typeof devicePixelRatio === "number" ? devicePixelRatio : 1, 1.5)) || 1));

function sizeCanvas(): void {
  const dpr = DPR;
  canvas.width = Math.max(2, Math.round(canvas.clientWidth * dpr));
  canvas.height = Math.max(2, Math.round(canvas.clientHeight * dpr));
}

/* ------------------------------------------------------------------ capture hooks */

function summary() {
  const towns = data.tables.towns;
  return {
    phase: sim.phase, leg: sim.leg, station: towns[sim.leg]!.name, distance: sim.distance, speed: sim.speed, roll: sim.roll,
    aboard: sim.passengers, fares: sim.attempt.fares, tips: sim.attempt.tips, bonuses: sim.attempt.bonuses, lost: sim.attempt.lost, score: sim.score,
    serviceScore: attemptScore(sim.attempt), attemptId: sim.attempt.id, goal: sim.attempt.goal, ended: sim.attempt.ended, lanterns: sim.attempt.lanterns,
    streak: sim.attempt.streak, criticalTime: sim.criticalTime, trim: sim.trim, keys: [...keys],
    circuits: sim.circuits, attempt: sim.attempt.status, grade: sim.attempt.grade, timeOfDay: sim.timeOfDay, played: sim.played, catches: sim.catches
  };
}

function memory() {
  const info = app?.info as unknown as { approximateGpuMemoryBytes?: number; bufferBytes?: number; textureBytes?: number; memory: { geometries: number; textures: number; renderTargets?: number; bufferBytes?: number; textureBytes?: number }; render?: { calls?: number; triangles?: number } } | undefined;
  return {
    approximateGpuMemoryBytes: info?.approximateGpuMemoryBytes ?? 0,
    bufferBytes: info?.bufferBytes ?? info?.memory.bufferBytes ?? null, textureBytes: info?.textureBytes ?? info?.memory.textureBytes ?? null,
    textures: info?.memory.textures ?? 0, buffers: info?.memory.geometries ?? 0, renderTargets: info?.memory.renderTargets ?? 0,
    drawCalls: info?.render?.calls ?? app?.diagnostics().drawCalls ?? 0, nodes: runtime?.nodeCount ?? 0
  };
}

/**
 * Lit fraction and mean of the canvas. The drawing buffer is kept only on `?capture=1` / `?qa=1`; elsewhere the browser clears it
 * after each present, so a read in a later task than the render saw black (D-07). Render in this task first, as `frame()` does.
 */
function pixels(): { width: number; height: number; litFraction: number; mean: number } {
  if (!freshFrame) render();
  const probe = document.createElement("canvas");
  probe.width = 160; probe.height = 90;
  const ctx = probe.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0, 160, 90);
  const px = ctx.getImageData(0, 0, 160, 90).data;
  let lit = 0, sum = 0;
  for (let i = 0; i < px.length; i += 4) { const l = (px[i]! + px[i + 1]! + px[i + 2]!) / 3; sum += l; if (l > 24) lit++; }
  return { width: canvas.width, height: canvas.height, litFraction: lit / (px.length / 4), mean: sum / (px.length / 4) };
}

/** Model nodes (the windmill and watchtower landmarks) and how many have decoded into the scene yet. */
function assetStatus(): { total: number; loaded: number } {
  if (!app) return { total: 0, loaded: 0 };
  const ids = app.nodes.ids().filter((id) => /^(landmark|house|clock-tower|lighthouse|crates|lamp-post|folk|tram-body)-?/.test(id));
  const loaded = ids.filter((id) => (app!.nodes.require(id) as unknown as { importedAssetEvidence?: () => { bounds?: unknown } | undefined }).importedAssetEvidence?.()?.bounds).length;
  return { total: ids.length, loaded };
}

function diag(): { drawCalls: number; triangles: number; nodes: number; assets: { total: number; loaded: number }; errors: number; renderPath: unknown; post: unknown; warnings: string[] } {
  const info = app?.info as unknown as { render?: { calls?: number; triangles?: number } } | undefined;
  const d = app?.diagnostics() as unknown as { errors?: unknown[]; renderPath?: unknown; post?: unknown; warnings?: unknown[] } | undefined;
  const warnings = (d?.warnings ?? []).map((w) => (typeof w === "string" ? w : String((w as { code?: unknown; message?: unknown }).code ?? (w as { message?: unknown }).message ?? JSON.stringify(w)))).slice(0, 40);
  return { drawCalls: info?.render?.calls ?? 0, triangles: info?.render?.triangles ?? 0, nodes: runtime?.nodeCount ?? 0, assets: assetStatus(), errors: d?.errors?.length ?? 0, renderPath: d?.renderPath ?? null, post: d?.post ?? null, warnings };
}

const qa = installQaHooks("last-train", {
  ready: () => ready,
  state: summary,
  app: () => app,
  nodeCount: () => runtime?.nodeCount ?? 0,
  extras: {
  state: summary,
  memory,
  assets: assetStatus,
  diag,
  title: () => titleMode,
  startPlay,
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
  /** Switching swaps the whole lighting rig (a scene swap), so this renders once and waits for the renderer to settle. */
  setTimeOfDay: async (v: "day" | "night") => { actionTimeOfDay(sim, v); runtime?.syncBand(sim); render(); await app?.ready(); render(); },
  /** GU47 LT-01: the band on screen (null under ?look=original) and scene swaps that happened en route (must stay 0). */
  band: () => ({ band: runtime?.band ?? null, enrouteSwaps: runtime?.enrouteSwaps ?? 0, lanterns: runtime?.lanterns ?? null }),
  newService: () => { actionNewService(sim); presenter.reset(); },
  /** Plays a key press through the same path as the keyboard and the touch bar. */
  press: (code: string) => press(code),
  release: (code: string) => release(code),
  audio: () => sound.status(),
  applyInput: (input: StepInput) => stepOnce(input),
  advance: (n: number, input?: StepInput) => { for (let i = 0; i < n; i++) stepOnce(input); return summary(); },
  stepFrames: (n: number, input?: StepInput) => { for (let i = 0; i < n; i++) stepOnce(input); render(); updateHud(); return summary(); },
  runLeg: (renderEvery = 0) => runLeg(renderEvery),
  finishStop: (renderEvery = 0) => finishStop(renderEvery),
  runCircuit: (renderEvery = 0) => runCircuit(renderEvery),
  routeHealth: () => (app ? createAuraRouteHealthSnapshot(app, { parityIds: ["SH-02", "SH-01", "SG-05", "R-23", "SR-02"] }) : null)
  }
});

/* ------------------------------------------------------------------ boot */

function reportError(error: unknown): void {
  const base = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const details = (error as { details?: unknown })?.details;
  const message = `${base}${details ? ` ${JSON.stringify(details).slice(0, 6000)}` : ""}`;
  qa.reportError(message);
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
    autoStart: false, resize: false, pixelRatio: DPR,
    quality: "auto",
    // GU47 LT-07: the band look renders through agx with dither (per-band exposure is on the grade node); ?look=original keeps none.
    output: { toneMapping: (params.get("tm") as "aces" | "neutral" | "none" | "linear" | "agx" | null) ?? (world.look === "bands" ? "agx" : "none"), exposure: Number(params.get("ev") ?? 1), dither: world.look === "bands" },
    scene: sim.timeOfDay === "night" ? world.nightScene : world.scene
  });
  mark("app created");
  await app.ready();
  mark("app ready");
  runtime = world.bind(app, data, sim.timeOfDay === "night");
  mark("runtime bound");
  ready = true;
  $("loading").classList.add("hidden");
  const best = readBest();
  $("best").textContent = best ? `Best score on this device: ${best}` : "";
  if (titleMode) $("title").classList.remove("hidden");
  render();
  updateHud();
  mark("first frame");
}

addEventListener("resize", sizeCanvas);
loop.start();
boot().catch(reportError);
