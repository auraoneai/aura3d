/**
 * Roadster Hours on Aura3D: boot, fixed-step loop, input, HUD and capture hooks.
 * The simulation (`sim.ts`) is pure; `world.ts` renders it through the public engine surface.
 *
 * Query parameters (all optional): `level=0..2`, `autostart=1`, `autopilot=1`, `manual=1` (the sim only advances
 * through `__AURA_ROADSTER_HOURS__.stepSteps/replay`), `touch=1` (show the touch controls on any device).
 */
import { bindGameTouchControls, createAuraApp, createAuraRouteHealthSnapshot, type AuraApp, createFixedStepLoop, installQaHooks } from "@aura3d/engine";
import { summarizeTextureUpgrade, warmPrograms } from "@aura3d/engine/game";
import { DEFAULT_PARAMS, autopilot } from "./autopilot";
import { RoadsterSound, type AudioFrame, type GameSound } from "./audio";
import { LEVELS } from "./data";
import { ACTIONS, ACTION_LABELS, InputState, TOUCH_BUTTONS, keyLabel, loadBindings, promptText, rebind, runInput, saveBindings, touchCode, type Action } from "./input";
import { bestLine, coachLine, createHudWriter, loadResults, nitroLabel, saveResults } from "./hud";
import { SIM_STEP, createRun, defaultCareer, stepRun, type Career, type MedalResult, type Run, type RunEvent, type RunInput } from "./sim";
import { createRoadsterPresenter, viewOf } from "./presentation";
import { loadMeshy } from "./meshy";
import { buildWorld, type World, type WorldRuntime } from "./world";
import { lookModeFrom } from "./art/look";
import { outputFor } from "./art/output";
import { ROAD_PASS_NAME, autoExposureFor, roadPass, streakFor } from "./art/post";

const params = new URLSearchParams(location.search);
let levelIndex = Math.max(0, Math.min(LEVELS.length - 1, Number(params.get("level") ?? 0) | 0));
const config = { autostart: params.get("autostart") === "1", autopilot: params.get("autopilot") === "1", manual: params.get("manual") === "1" };

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`roadster-hours-port: #${id} is missing`);
  return el as T;
};
const canvas = $<HTMLCanvasElement>("world");
const storage: Storage | null = (() => { try { return window.localStorage; } catch { return null; } })();

/* Licensed UI face (DIN Pro Regular/Medium/Bold, from the paid font gallery), loaded without blocking boot. */
const FONT_FILES: readonly (readonly [string, string])[] = [
  ["400", new URL("./assets/fonts/DINPro-Regular.woff", import.meta.url).href],
  ["500", new URL("./assets/fonts/DINPro-Medium.woff", import.meta.url).href],
  ["700", new URL("./assets/fonts/DINPro-Bold.woff", import.meta.url).href]
];
for (const [weight, url] of FONT_FILES) {
  const face = new FontFace("DIN Pro", `url(${url})`, { weight });
  (document.fonts as unknown as { add(font: FontFace): void }).add(face);
  void face.load().catch(() => undefined);
}

/* Touch devices get on-screen controls; `?touch=1` forces them (QA). */
const touch = params.get("touch") === "1" || (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches);
document.body.classList.toggle("touch", touch);
/* Reduced motion: no camera shake, no FOV kicks, no pulsing HUD. Defaults to the OS setting; the menu switch is saved. */
const MOTION_KEY = "saltwind-highway:reduced-motion";
let reducedMotion = (() => {
  const saved = storage?.getItem(MOTION_KEY);
  if (saved === "1" || saved === "0") return saved === "1";
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
})();

const sound = new RoadsterSound();
let lastInput: RunInput | undefined;

const career: Career = defaultCareer();
career.unlocked = LEVELS.length - 1;
career.results = loadResults(storage);
let run: Run = createRun(levelIndex, career);
/** Best result on this route before the current run (the results card compares against it). */
let previousBest: MedalResult | undefined;
const presenter = createRoadsterPresenter(() => run);
let app: AuraApp | undefined;
let world: World | undefined;
let runtime: WorldRuntime | undefined;
let ready = false;
let screen: "home" | "play" | "results" = "home";
let paused = false;
let autopilotOn = config.autopilot;
let frames = 0;
let simSteps = 0;
/** Sim events of every step since the last rendered frame (audio cues and camera kicks read them once). */
const pendingEvents: RunEvent[] = [];
const MAX_PENDING_EVENTS = 512;
/** Recently played cues, for the QA hook. */
const cueLog: { frame: number; sounds: GameSound[] }[] = [];

/* ------------------------------------------------------------------ input */

const input = new InputState(loadBindings(storage));
let remapping: Action | null = null;

addEventListener("keydown", (e) => {
  if (remapping) {
    e.preventDefault();
    if (e.code !== "Escape") {
      input.bindings = rebind(input.bindings, remapping, e.code);
      saveBindings(input.bindings, storage);
    }
    remapping = null;
    renderControls();
    return;
  }
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  if (!e.code.startsWith("touch:")) void sound.unlock();
  if (e.repeat) return;
  const action = input.actionOf(e.code);
  if (action === "mute") { toggleMute(); return; }
  if (action === "pause") { togglePause(); return; }
  if (e.code === "Enter" && (screen === "home" || screen === "results") && $("controls").classList.contains("hidden")) { begin(); return; }
  input.keydown(e.code);
});
addEventListener("keyup", (e) => input.keyup(e.code));
addEventListener("blur", () => { input.clear(); autoPause(); });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { input.clear(); autoPause(); }
  syncAudioSuspend();
});

/** A run in progress pauses itself when the window loses focus or the tab is hidden (never in QA manual mode). */
function autoPause(): void {
  if (config.manual || screen !== "play" || paused) return;
  if (run.phase === "running" || run.phase === "countdown") togglePause();
}
function syncAudioSuspend(): void { sound.setSuspended(document.hidden || paused); }

function bindTouch(): void {
  bindGameTouchControls({
    hold: TOUCH_BUTTONS.filter((b) => b.hold).map((b) => ({ elementId: b.id, code: touchCode(b.action) })),
    pulse: TOUCH_BUTTONS.filter((b) => !b.hold).map((b) => ({ elementId: b.id, code: touchCode(b.action), holdMs: 60 }))
  });
  // The first touch is a user gesture: unlock audio from it (synthetic key events are not gestures).
  document.addEventListener("pointerdown", () => { void sound.unlock(); }, { passive: true });
}

/* ------------------------------------------------------------------ flow */

function begin(): void {
  void sound.unlock();
  run = createRun(levelIndex, career);
  previousBest = career.results[run.level.id] ? { ...career.results[run.level.id]! } : undefined;
  presenter.reset();
  runtime?.reset(run);
  sound.reset();
  pendingEvents.length = 0;
  screen = "play";
  paused = false;
  loop.resetAccumulator();
  panels();
  syncAudioSuspend();
}

function togglePause(): void {
  if (screen !== "play") return;
  if (run.phase === "paused") { run.phase = run.beforePause ?? "running"; paused = false; }
  else if (run.phase === "running" || run.phase === "countdown") { run.beforePause = run.phase; run.phase = "paused"; paused = true; input.clear(); }
  panels();
  syncAudioSuspend();
}

function toggleMute(): void {
  sound.setMuted(!sound.muted);
  $("mute").textContent = sound.muted ? "Sound off" : "Sound on";
}

function setReducedMotion(on: boolean): void {
  reducedMotion = on;
  try { storage?.setItem(MOTION_KEY, on ? "1" : "0"); } catch { /* ignore */ }
  document.body.classList.toggle("reduced-motion", on);
  runtime?.setReducedMotion(on);
  $("motion").textContent = on ? "Motion: reduced" : "Motion: full";
  $("motion").setAttribute("aria-pressed", String(on));
}

function stepOnce(stepInput: RunInput): void {
  lastInput = stepInput;
  stepRun(run, stepInput, SIM_STEP, career);
  simSteps++;
  input.endStep();
  if (run.events.length) {
    pendingEvents.push(...run.events);
    if (pendingEvents.length > MAX_PENDING_EVENTS) pendingEvents.splice(0, pendingEvents.length - MAX_PENDING_EVENTS);
  }
  if (run.phase === "complete" && screen === "play") {
    saveResults(career, storage);
    screen = "results";
    panels();
  }
}

/** Next route without a page reload: the models are already decoded, so only the scene is rebuilt. Falls back to a reload. */
async function nextRoute(): Promise<void> {
  const next = Math.min(LEVELS.length - 1, levelIndex + 1);
  if (!app || next === levelIndex) return;
  $("loading-status").textContent = "Loading the next route";
  $("loading").classList.remove("hidden");
  ready = false;
  try {
    levelIndex = next;
    world = buildWorld(levelIndex);
    app.setScene(world.scene);
    runtime = world.bind(app);
    runtime.setReducedMotion(reducedMotion);
    applyRoutePost();
    hud.reset();
    history.replaceState(null, "", `?${new URLSearchParams({ ...Object.fromEntries(params), level: String(levelIndex) }).toString()}`);
    buildMenu();
    await settle();
    ready = true;
    $("loading").classList.add("hidden");
    begin();
  } catch (error) {
    console.warn("roadster-hours-port: in-place route change failed, reloading", error);
    location.search = `?level=${levelIndex}&autostart=1`;
  }
}

/* ------------------------------------------------------------------ HUD */

const fmt = (t: number): string => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;
const hud = createHudWriter((id) => $(id));
let nitroWindowShown = false;
function buildMenu(): void {
  const level = LEVELS[levelIndex]!;
  $("level-name").textContent = level.name;
  $("level-sub").textContent = level.subtitle;
  $("level-desc").textContent = level.description;
  const best = career.results[level.id];
  $("level-best").textContent = best ? `Best ${fmt(best.time)} · ${best.medal} medal` : "";
  const routes = $("routes");
  routes.textContent = "";
  LEVELS.forEach((l, i) => {
    const a = document.createElement("a");
    a.href = `?level=${i}`;
    a.textContent = l.name;
    if (i === levelIndex) a.setAttribute("aria-current", "true");
    routes.appendChild(a);
  });
  const progress = $("progress");
  progress.querySelectorAll("b").forEach((b) => b.remove());
  for (const gate of level.gates) {
    const tick = document.createElement("b");
    tick.style.left = `${(gate.s / level.length) * 100}%`;
    progress.appendChild(tick);
  }
  renderControls();
}
/** The menu key summary and the remap panel, from the current bindings. */
function renderControls(): void {
  const b = input.bindings;
  const k = (a: Action): string => keyLabel(b[a][0]!);
  const rows: [string, string][] = touch
    ? [["Drive / Brake", "Hold to drive, brake (with steer to drift)"], ["Left / Right", "Steer, and spin in the air"], ["Thrust", "Hold to fly"], ["Nitro", "Tap again when the bar turns green"], ["Roll", "Roll in the air"], ["Recover", "Back to the last relay"]]
    : [[`${k("up")} / ${k("down")}`, `Drive, brake (hold with ${k("left")}/${k("right")} to drift)`], [`${k("left")} / ${k("right")}`, "Steer, and spin in the air"], [k("thrust"), "Thrust"], [k("nitro"), "Nitro (tap again when the bar turns green)"], [`${k("rollLeft")} / ${k("rollRight")}`, "Roll in the air"], [`${k("recover")}, ${k("pause")}, ${k("mute")}`, "Recover, pause, mute"]];
  const keys = $("keys");
  keys.textContent = "";
  for (const [dt, dd] of rows) {
    const t = document.createElement("dt"); t.textContent = dt;
    const d = document.createElement("dd"); d.textContent = dd;
    keys.append(t, d);
  }
  const list = $("remap");
  list.textContent = "";
  for (const a of ACTIONS) {
    const row = document.createElement("div");
    row.className = "remap-row";
    const label = document.createElement("span");
    label.textContent = ACTION_LABELS[a];
    const button = document.createElement("button");
    button.className = "ghost";
    button.type = "button";
    button.textContent = remapping === a ? "Press a key" : b[a].map(keyLabel).join(" / ");
    button.setAttribute("aria-label", `Change the key for ${ACTION_LABELS[a]}`);
    button.addEventListener("click", () => { remapping = a; renderControls(); });
    row.append(label, button);
    list.appendChild(row);
  }
}
function panels(): void {
  $("menu").classList.toggle("hidden", screen !== "home");
  $("results").classList.toggle("hidden", screen !== "results");
  $("pause").classList.toggle("hidden", !(screen === "play" && paused));
  $("hud").classList.toggle("hidden", screen === "home");
  $("mute").classList.toggle("hidden", !ready);
  $("pause-button").classList.toggle("hidden", !(screen === "play" && !paused));
  sound.setScreen(screen);
  if (screen === "results" && run.result) {
    const level = run.level;
    $("result-time").textContent = fmt(run.result.time);
    $("result-medal").textContent = `${run.result.medal} medal`;
    $("result-score").textContent = run.result.score.toLocaleString();
    $("result-cells").textContent = `${run.result.cells} / ${level.cells.length}`;
    $("result-crashes").textContent = String(run.result.crashes);
    $("result-targets").textContent = `gold ${fmt(level.medal.gold)} · silver ${fmt(level.medal.silver)}`;
    $("result-best").textContent = bestLine(run.result.time, previousBest);
    $("next").classList.toggle("hidden", levelIndex + 1 >= LEVELS.length);
  }
}
function updateHud(): void {
  hud.text("timer", fmt(run.time));
  hud.text("speed", String(Math.round(run.v * 3.6)));
  hud.text("score", Math.round(run.score).toLocaleString());
  hud.text("gate", `Relay ${Math.min(run.nextGate + 1, run.level.gates.length)} / ${run.level.gates.length}`);
  hud.text("act", run.act);
  hud.text("combo", run.comboTime > 0 && run.combo > 1 ? `Combo x${run.combo.toFixed(1)}` : "");
  hud.text("toast", run.toastTime > 0 && run.toast ? promptText(run.toast, touch, input.bindings) : "");
  hud.text("coach", coachLine(run, touch, input.bindings));
  hud.text("count", run.phase === "countdown" ? String(Math.max(1, Math.ceil(run.countdown))) : "");
  hud.style("thrust-fill", "width", `${((run.thrust / run.capacity) * 100).toFixed(1)}%`);
  hud.style("heat-fill", "width", `${run.heat.toFixed(1)}%`);
  hud.text("nitro-label", nitroLabel(run));
  if (run.nitroWindow !== nitroWindowShown) { nitroWindowShown = run.nitroWindow; $("thrust-bar").classList.toggle("window", run.nitroWindow); }
  hud.text("heat-label", run.overheated ? "Overheated" : "");
  hud.style("progress-fill", "width", `${Math.min(100, Math.max(0, (run.s / run.level.length) * 100)).toFixed(2)}%`);
  hud.text("phase", run.phase);
}

/* ------------------------------------------------------------------ frame loop */

/** Steps only on the play screen and never in manual mode; frames always render. The loop drains its clock otherwise. */
const loop = createFixedStepLoop({
  stepSeconds: SIM_STEP,
  maxFrameSeconds: 0.05,
  maxCatchUpSteps: 8,
  isActive: () => ready,
  step: () => {
    if (config.manual || screen !== "play") return;
    stepOnce(autopilotOn && run.phase === "running" ? autopilot(run, DEFAULT_PARAMS) : runInput(run, input));
    presenter.afterStep();
  },
  render: (dt) => render(dt, performance.now() / 1000, !config.manual && screen === "play" && run.phase === "running")
});

/** Two audio frames, swapped every frame (the sound keeps the previous one to diff against). */
const blankFrame = (): AudioFrame => ({
  phase: "", countdown: 0, speed: 0, grounded: true, boosting: false, nitro: 0, nextGate: 0, cells: 0, crashes: 0, cleanLandings: 0,
  nearMisses: 0, combos: 0, vehiclesCleared: 0, throttle: false, gateMiss: false, overheated: false
});
const audioFrames = [blankFrame(), blankFrame()] as const;
let view: Run | undefined;

/** `live` draws the car and traffic between the last two steps (smooth on 144 Hz displays); everything else draws the exact latest step. */
function render(dt: number, time: number, live = false): void {
  if (!ready || !app || !runtime) return;
  const shown = live ? (view = viewOf(run, presenter.present(loop, true), view)) : run;
  runtime.update(shown, dt, time, canvas.clientWidth / Math.max(1, canvas.clientHeight), pendingEvents);
  if (removeRoadPass) {
    app.post?.setPassUniform?.(ROAD_PASS_NAME, "u_streak", live ? streakFor(shown.v, run.boosting || run.nitro > 0, reducedMotion) : 0);
    if (!reducedMotion) app.post?.setPassUniform?.(ROAD_PASS_NAME, "u_heatTime", time);
  }
  app.step(0);
  updateHud();
  // The step that completes the run switches to the results screen; its events (the finish fanfare) still play here.
  if (screen === "play" || pendingEvents.length) {
    const f = audioFrames[frames & 1];
    f.phase = run.phase; f.countdown = run.countdown; f.speed = run.v; f.grounded = run.grounded; f.boosting = run.boosting; f.nitro = run.nitro;
    f.nextGate = run.nextGate; f.cells = run.cells.size; f.crashes = run.crashes; f.cleanLandings = run.cleanLandings; f.nearMisses = run.nearMisses;
    f.combos = run.combos; f.vehiclesCleared = run.vehiclesCleared; f.throttle = (lastInput?.throttle ?? 0) > 0; f.gateMiss = run.gateMiss; f.overheated = run.overheated;
    const sounds = sound.update(f, pendingEvents);
    if (sounds.length) { cueLog.push({ frame: frames, sounds }); if (cueLog.length > 64) cueLog.shift(); }
  }
  pendingEvents.length = 0;
  frames++;
}

/** GU47 look (default) or today's (`?look=original`): output, device resolution, look rows. */
const lookMode = lookModeFrom(location.search);
const output = outputFor(lookMode);

/** RH47-07/08: the route's one custom post pass and Halo's auto-exposure, re-applied on every in-place route change. */
let removeRoadPass: (() => void) | undefined;
function applyRoutePost(): void {
  removeRoadPass?.();
  removeRoadPass = undefined;
  const row = world?.look.row ?? null;
  if (!app || !row || params.get("post") === "0") return;
  removeRoadPass = app.post?.addPostPass(roadPass(row));
  app.setOutput?.({ autoExposure: autoExposureFor(row) });
}

function sizeCanvas(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, output.maxDpr);
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
  stepSteps(n: number, stepInput?: RunInput): number {
    for (let i = 0; i < n && run.phase !== "complete"; i++) stepOnce(stepInput ?? (autopilotOn ? autopilot(run, DEFAULT_PARAMS) : runInput(run, input)));
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
  /** Texture upgrade status per node: textures upload one material at a time after mount, so an early frame shows white models until these read `textured`. */
  textures: () => summarizeTextureUpgrade(app?.diagnostics()),
  /** RH47-01: true once every textured material has uploaded (`textured === total`, 58 on Sunbreak with the generated models); judged shots wait for it. */
  texturesReady: () => { const t = summarizeTextureUpgrade(app?.diagnostics()); return t.total > 0 && t.textured === t.total; },
  lookMode: () => lookMode,
  /** Cues played on recent frames (QA: proves the finish fanfare and the event cues fire). */
  cues: () => cueLog.map((c) => ({ ...c, sounds: [...c.sounds] })),
  /** Switch to the next route in place (no reload). */
  nextRoute,
  setReducedMotion,
  routeHealth: () => (app ? createAuraRouteHealthSnapshot(app, { parityIds: ["SG-01", "SG-02", "SH-02", "SG-03", "SG-05"] }) : null)
};
declare global { interface Window { __AURA_ROADSTER_HOURS__?: typeof hooks; __AURA_ROADSTER_HOURS_ERROR__?: string; skybreak?: { snapshot: typeof snapshot } } }
const qa = installQaHooks("roadster-hours", {
  ready: () => ready,
  state: () => run,
  app: () => app,
  extras: hooks
});
window.skybreak = { snapshot };

/* ------------------------------------------------------------------ boot */

/**
 * Programs and the generated-model textures settle before the first shown frame: `warmPrograms` precompiles, steps until the
 * draw count is stable and waits for pending texture uploads, each wait bounded so a slow device shows the route within about
 * 8 s (software GL can take minutes per texture; those frames then show the untextured fallback until the upload lands).
 */
async function settle(): Promise<void> {
  if (!app) return;
  if ((world?.texturedNodes ?? 0) > 0) $("loading-status").textContent = "Loading models";
  await warmPrograms(app, { maxFrames: 12, waitForEnvironment: true, environmentTimeoutMs: 2000, waitForTextures: true, textureTimeoutMs: 6000 });
}

async function boot(): Promise<void> {
  sizeCanvas();
  if (new URLSearchParams(location.search).get("meshy") !== "0") await loadMeshy();
  world = buildWorld(levelIndex);
  buildMenu();
  app = createAuraApp(canvas, {
    autoStart: false, resize: false, pixelRatio: output.pixelRatio,
    // 4.5.0 pipeline on purpose (bloom pass fusion); measured against `production` in evidence/roadster-hours-port/audit-fix.
    quality: "auto",
    output: output.output,
    scene: world.scene
  });
  await app.ready();
  runtime = world.bind(app);
  runtime.setReducedMotion(reducedMotion);
  applyRoutePost();
  await settle();
  ready = true;
  $("loading").classList.add("hidden");
  $<HTMLButtonElement>("start").disabled = false;
  render(0, 0);
  panels();
  if (config.autostart) begin();
}

$("start").addEventListener("click", begin);
for (const id of ["again", "restart"]) $(id).addEventListener("click", begin);
$("resume").addEventListener("click", togglePause);
$("pause-button").addEventListener("click", togglePause);
$("mute").addEventListener("click", toggleMute);
$("motion").addEventListener("click", () => setReducedMotion(!reducedMotion));
$("controls-open").addEventListener("click", () => { $("controls").classList.remove("hidden"); renderControls(); });
$("controls-close").addEventListener("click", () => { remapping = null; $("controls").classList.add("hidden"); renderControls(); });
$("controls-reset").addEventListener("click", () => { input.bindings = loadBindings(null); saveBindings(input.bindings, storage); remapping = null; renderControls(); });
$("next").addEventListener("click", () => { void nextRoute(); });
canvas.addEventListener("pointerdown", () => { void sound.unlock(); });
addEventListener("resize", sizeCanvas);
setReducedMotion(reducedMotion);
if (touch) bindTouch();
loop.start();

boot().catch((error: unknown) => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  qa.reportError(message);
  $("loading-status").textContent = `The route could not load: ${message.slice(0, 300)}`;
  console.error(error);
});
