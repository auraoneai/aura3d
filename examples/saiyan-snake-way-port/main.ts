/**
 * Serpentine Sky Run on Aura3D: boot, fixed-step loop, input, HUD, menus and capture hooks.
 * The simulation lives in `sim.ts` (pure); `world.ts` renders it through the public engine surface and
 * `text.ts` maps the simulation's strings to this port's generic on-screen wording.
 *
 * Query parameters (all optional): `autostart=1` (skip the title and countdown), `manual=1` (the sim
 * only advances through `__AURA_SAIYAN_SNAKE_WAY__.stepFrames`), `autopilot=1` (replay `?script=` or nothing).
 * Keys: A/D or arrows change lane, Space/W jump, S/down slide, Shift toggles surge, E flies (hold
 * W/S/A/D to steer), P/Esc pauses, M mutes, R/Enter restarts from the results screen.
 */
import { createAuraApp, createAuraRouteHealthSnapshot, createFixedStepLoop, installQaHooks, type AuraApp } from "@aura3d/engine";
import {
  RUNGS, START_DAYS, STEP, ROAD_LENGTH, KM_TOTAL, createRun, expandScript, snapshot, stepRun, type InputSegment, type RunInput, type RunState
} from "./sim";
import { createSfx } from "./sfx";
import { RUNNER_STYLES, hexCss } from "./styles";
import { displayText } from "./text";
import { buildWorld, loadRunner, type WorldRuntime } from "./world";

declare global {
  interface Window {
    __AURA_SAIYAN_SNAKE_WAY__?: unknown;
    __AURA_SAIYAN_SNAKE_WAY_ERROR__?: string;
  }
}

const params = new URLSearchParams(location.search);
const config = { autostart: params.get("autostart") === "1", manual: params.get("manual") === "1" };

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`saiyan-snake-way-port: #${id} is missing`);
  return el as T;
};
const canvas = $<HTMLCanvasElement>("world");
const sfx = createSfx();

let state: RunState = createRun();
let app: AuraApp | undefined;
let runtime: WorldRuntime | undefined;
let ready = false;
let started = config.autostart;
let paused = false;
let renderTime = 0;
let last = 0;
let steps = 0;
let renderFailed = false;
let outroT = 0;
let counting = 0;
let resultsShown = false;
let runnerIndex = 0;

/* ------------------------------------------------------------------ best score */

const BEST_KEY = "serpentine-sky-run.best";
function loadBest(): number {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
}
function saveBest(value: number): void {
  try { localStorage.setItem(BEST_KEY, String(Math.round(value))); } catch { /* storage unavailable */ }
}
let best = loadBest();

/* ------------------------------------------------------------------ runner select */

const RUNNER_KEY = "serpentine-sky-run.runner";
function loadRunnerIndex(): number {
  try { return Math.max(0, Math.min(RUNNER_STYLES.length - 1, Number(localStorage.getItem(RUNNER_KEY)) || 0)); } catch { return 0; }
}
function selectRunner(index: number, persist = true): void {
  runnerIndex = (index + RUNNER_STYLES.length) % RUNNER_STYLES.length;
  if (persist) { try { localStorage.setItem(RUNNER_KEY, String(runnerIndex)); } catch { /* storage unavailable */ } }
  const style = RUNNER_STYLES[runnerIndex]!;
  runtime?.setRunnerStyle(style);
  $("badge").style.background = `radial-gradient(circle at 35% 30%, ${hexCss(style.skin)}, ${hexCss(style.gi)} 70%)`;
  document.querySelectorAll<HTMLElement>("#runners .runner").forEach((el, i) => el.classList.toggle("selected", i === runnerIndex));
}
function buildRunnerCards(): void {
  const host = $("runners");
  RUNNER_STYLES.forEach((style, i) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "runner ghost";
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    for (const hex of [style.gi, style.belt, style.aura]) {
      const dot = document.createElement("i");
      dot.style.background = hexCss(hex);
      swatch.append(dot);
    }
    const name = document.createElement("span");
    name.className = "rname";
    name.textContent = style.name;
    const tag = document.createElement("span");
    tag.className = "rtag meta";
    tag.textContent = style.tagline;
    card.append(swatch, name, tag);
    card.addEventListener("click", () => selectRunner(i));
    host.append(card);
  });
  runnerIndex = loadRunnerIndex();
  selectRunner(runnerIndex, false);
}

/* ------------------------------------------------------------------ input */

const tapKeys = new Set<string>();
const heldKeys = new Set<string>();
const GAME_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "KeyA", "KeyD", "KeyW", "KeyS", "ShiftLeft", "ShiftRight", "KeyE", "KeyP", "Escape", "KeyM", "KeyR", "Enter"]);
addEventListener("keydown", (e) => {
  if (!GAME_KEYS.has(e.code)) return;
  e.preventDefault();
  sfx.unlock();
  if (e.code === "KeyM") { sfx.toggleMute(); return; }
  if (e.code === "Escape" || e.code === "KeyP") { if (started && !resultsShown && counting <= 0) paused = !paused; return; }
  if (!started && (e.code === "ArrowLeft" || e.code === "KeyA")) { selectRunner(runnerIndex - 1); return; }
  if (!started && (e.code === "ArrowRight" || e.code === "KeyD")) { selectRunner(runnerIndex + 1); return; }
  if (!started && (e.code === "Space" || e.code === "Enter")) { startRun(true); return; }
  if (resultsShown) { if (e.code === "KeyR" || e.code === "Enter" || e.code === "Space") startRun(true); return; }
  if (!heldKeys.has(e.code)) tapKeys.add(e.code);
  heldKeys.add(e.code);
});
addEventListener("keyup", (e) => { heldKeys.delete(e.code); });
document.addEventListener("visibilitychange", () => { if (document.hidden && started && !resultsShown && counting <= 0) paused = true; });

/* touch: swipe left/right for lanes, up or tap to jump, down to slide; buttons for surge, flight and slide */
let swipe: { x: number; y: number } | null = null;
canvas.addEventListener("pointerdown", (e) => {
  sfx.unlock();
  if (e.pointerType !== "mouse") swipe = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener("pointerup", (e) => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  swipe = null;
  if (!started || counting > 0) return;
  if (resultsShown) { startRun(true); return; }
  if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy)) tapKeys.add(dx < 0 ? "KeyA" : "KeyD");
  else if (dy > 28) tapKeys.add("KeyS");
  else tapKeys.add("Space");
});
for (const [id, key] of [["t-surge", "ShiftLeft"], ["t-fly", "KeyE"], ["t-slide", "KeyS"]] as const) {
  $(id).addEventListener("pointerdown", (e) => { e.preventDefault(); sfx.unlock(); if (started && !resultsShown && counting <= 0) tapKeys.add(key); });
}

function takeInput(): RunInput {
  const input: RunInput = { taps: [...tapKeys], held: [...heldKeys] };
  tapKeys.clear();
  return input;
}

/* ------------------------------------------------------------------ HUD */

const cache = new Map<string, string>();
function setText(id: string, text: string): void {
  if (cache.get(id) === text) return;
  cache.set(id, text);
  $(id).textContent = text;
}
function setHidden(id: string, hidden: boolean): void { $(id).classList.toggle("hidden", hidden); }

const fmt = (n: number): string => Math.round(n).toLocaleString("en-US");
const distanceKm = (): number => Math.max(0, (state.s / ROAD_LENGTH) * KM_TOTAL);

const RESULT_DELAY: Readonly<Record<string, number>> = { fall: 2.6, leap: 3.6, over: 1.1 };

function phaseLabel(): string {
  switch (state.phase) {
    case "run": return state.atEnd ? "END OF THE ROAD" : "OUTBOUND";
    case "fall": return "FALLING";
    case "leap": return "THE LEAP";
    case "over": return "RUN OVER";
    default: return String(state.phase).toUpperCase();
  }
}

function showResults(): void {
  resultsShown = true;
  const score = state.score;
  const isBest = score > best;
  if (isBest) { best = score; saveBest(best); }
  const reached = state.phase === "leap";
  setText("results-title", reached ? "YOU REACHED THE TAIL" : state.phase === "fall" ? "YOU FELL" : "RUN OVER");
  setText("results-sub", reached
    ? "One million kilometres of road behind you, and a jump at the end of it."
    : displayText(state.phase === "fall" ? state.fallWhy || "OFF THE ROAD" : state.ended || "TOO LATE") + (isBest ? "  ·  new best score" : ""));
  setText("r-km", fmt(distanceKm()));
  setText("r-score", fmt(score));
  setText("r-best", fmt(best));
  setText("best-title", fmt(best));
  if (reached) sfx.fanfare();
}

function updateHud(): void {
  const rung = RUNGS[state.auraRung] as { mult: number };
  setText("km", fmt(distanceKm()));
  ($("km-fill") as HTMLElement).style.width = `${Math.round(Math.max(0, Math.min(1, state.s / ROAD_LENGTH)) * 100)}%`;
  setText("ki-num", String(Math.round(Math.max(0, Math.min(1, state.ki / state.kiMax)) * 100)));
  setText("strain-num", String(Math.round(state.strain * 100)));
  setText("days", fmt(state.days));
  setText("score", fmt(state.score));
  setText("mult", `×${rung.mult}`);
  $("surge-chip").classList.toggle("hot", state.auraRung > 0);
  ($("ki-bar") as HTMLElement).style.width = `${Math.round(Math.max(0, Math.min(1, state.ki / state.kiMax)) * 100)}%`;
  ($("strain-bar") as HTMLElement).style.width = `${Math.round(state.strain * 100)}%`;
  setText("banner", state.bannerT > 0 ? displayText(state.banner) : "");
  setText("sub", state.bannerT > 0 ? displayText(state.bannerSub) : "");
  setText("toast", state.toastT > 0 ? displayText(state.toast) : "");
  setText("phase", phaseLabel());
  setHidden("title", started);
  setHidden("hud", !started || resultsShown);
  setHidden("paused", !paused);
  setHidden("results", !resultsShown);
  setHidden("count", counting <= 0);
  if (counting > 0) setText("count", counting > 2.6 ? "3" : counting > 1.6 ? "2" : counting > 0.6 ? "1" : "GO");
  const fast = Math.max(0, Math.min(0.85, (state.speed - 44) / 70 + (state.auraRung > 0 ? 0.25 : 0)));
  $("speedfx").style.opacity = started && state.phase === "run" ? String(fast.toFixed(2)) : "0";
  $("fallfx").style.opacity = state.phase === "fall" ? String(Math.min(1, outroT / 1.2).toFixed(2)) : "0";
}

/* ------------------------------------------------------------------ sound cues */

let prev = { grounded: true, vy: 0, stumble: 0, rung: 0, nimbus: 0, pulse: 0, phase: "run" };
function cues(): void {
  if (!started || counting > 0) { prev = { grounded: state.grounded, vy: state.vy, stumble: state.stumble, rung: state.auraRung, nimbus: state.nimbus, pulse: state.kiPulse, phase: state.phase }; return; }
  if (state.kiPulse > prev.pulse + 0.3) sfx.pickup(state.kiChain);
  if (prev.grounded && !state.grounded && state.vy > 0 && state.phase === "run") sfx.jump();
  if (!prev.grounded && state.grounded && state.phase === "run") sfx.land();
  if (state.stumble > prev.stumble + 0.3) sfx.hit();
  if (state.auraRung > prev.rung) sfx.surge(state.auraRung);
  if (state.nimbus > 0 && prev.nimbus <= 0) sfx.whoosh();
  if (state.phase !== prev.phase) { if (state.phase === "fall") sfx.fall(); else if (state.phase === "leap") sfx.whoosh(); else if (state.phase === "over") sfx.hit(); }
  prev = { grounded: state.grounded, vy: state.vy, stumble: state.stumble, rung: state.auraRung, nimbus: state.nimbus, pulse: state.kiPulse, phase: state.phase };
}

/* ------------------------------------------------------------------ loop */

function render(dt: number): void {
  if (!app || !runtime || renderFailed) return;
  try {
    runtime.update(state, dt, renderTime, canvas.clientWidth / Math.max(1, canvas.clientHeight), outroT);
    app.step(0);
  } catch (error) {
    renderFailed = true;
    reportError(error);
  }
}

function advance(input: RunInput): void {
  stepRun(state, input, STEP);
  steps++;
  renderTime += STEP;
}

const stepping = (): boolean => counting <= 0 && started && !paused && !config.manual && !resultsShown;

const loop = createFixedStepLoop({
  stepSeconds: STEP,
  maxFrameSeconds: 0.1,
  minFrameSeconds: 0,
  maxCatchUpSteps: 8,
  isActive: () => ready && stepping(),
  step() {
    advance(takeInput());
  }
});

function tick(now: number): void {
  requestAnimationFrame(tick);
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
  last = now;
  loop.tick(now);
  if (!ready) return;
  if (counting > 0 && !paused) {
    counting = Math.max(0, counting - dt);
    renderTime += dt;
  } else if (!stepping() && !paused) renderTime += dt;
  if (started && !paused && counting <= 0 && state.phase !== "run" && !config.manual) outroT += dt;
  if (started && !resultsShown && state.phase !== "run" && outroT > (RESULT_DELAY[state.phase] ?? 1.5)) showResults();
  cues();
  render(dt);
  updateHud();
}

/** Instant start (capture hooks and tests). */
function begin(): void {
  state = createRun();
  steps = 0;
  loop.resetAccumulator();
  started = true;
  paused = false;
  counting = 0;
  outroT = 0;
  resultsShown = false;
  runtime?.resetCamera();
}

/** UI start: a three-second countdown before the road moves. */
function startRun(withCountdown: boolean): void {
  begin();
  tapKeys.clear();
  if (withCountdown) counting = 3.6;
}

function reportError(error: unknown): void {
  const base = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const code = (error as { code?: unknown })?.code;
  const details = (error as { details?: unknown })?.details;
  const message = `${base}${typeof code === "string" ? ` [${code}]` : ""}${details ? ` ${JSON.stringify(details).slice(0, 6000)}` : ""}`;
  if (!window.__AURA_SAIYAN_SNAKE_WAY_ERROR__) window.__AURA_SAIYAN_SNAKE_WAY_ERROR__ = message;
  $("loading-status").textContent = `The road could not load: ${message.slice(0, 300)}`;
  $("loading").classList.remove("hidden");
  console.error(error);
}

/* ------------------------------------------------------------------ capture hooks */

installQaHooks("saiyan-snake-way", {
  ready: () => ready,
  state: () => snapshot(state, steps),
  app: () => app,
  routeHealth: () => (app ? createAuraRouteHealthSnapshot(app, { parityIds: ["SH-02", "SG-05", "SG-06", "SG-07", "SC-01", "SR-02"] }) : null),
  nodeCount: () => runtime?.nodeCount ?? 0,
  extras: {
    get ready() { return ready; },
    raw: () => JSON.parse(JSON.stringify(state)) as RunState,
    reset: () => { begin(); render(0); return snapshot(state, steps); },
    /** Steps the simulation `n` fixed steps with `input` (idle by default) and renders once. */
    stepFrames: (n: number, input: RunInput = {}) => {
      for (let i = 0; i < n && state.phase === "run" && !state.atEnd; i++) advance(input);
      render(0);
      return snapshot(state, steps);
    },
    /** Replays recorded run-length segments from a fresh run and returns the final snapshot and steps taken. */
    runSegments: (segments: readonly InputSegment[], maxSteps: number = Number.POSITIVE_INFINITY) => {
      begin();
      for (const input of expandScript(segments)) {
        if (steps >= maxSteps) break;
        advance(input);
        if (state.phase !== "run" || state.atEnd) break;
      }
      render(0);
      return { steps, final: snapshot(state, steps) };
    },
    start: () => { begin(); render(0); return snapshot(state, steps); },
    /** Presentation-only: edits the live state (speed, aura, ...) so a capture can show a given look without a replay. */
    setState: (patch: Partial<RunState>) => { Object.assign(state, patch); render(0); return snapshot(state, steps); },
    /** Presentation-only: renders `seconds` of the post-run phase (fall / leap / over) after `setState` put the run there. */
    outro: (seconds: number) => { outroT = seconds; render(0); return snapshot(state, steps); },
    meta: () => ({ steps, renderTime, entityNodes: runtime?.entityNodes ?? 0, nodeCount: runtime?.nodeCount ?? 0 }),
    capture: async () => {
      if (!app?.capture) throw new Error("not ready");
      const blob = (await app.capture({ type: "png-blob" })) as Blob;
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    },
  }
});

function sizeCanvas(): void {
  const dpr = config.manual ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
}

async function boot(): Promise<void> {
  sizeCanvas();
  const runner = await loadRunner(canvas);
  const world = buildWorld({ canvas, runner });
  app = createAuraApp(canvas, {
    autoStart: false,
    resize: false,
    pixelRatio: 1,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    output: { toneMapping: "none", dither: false },
    scene: world.scene
  });
  await app.ready();
  runtime = world.bind(app);
  selectRunner(runnerIndex, false);
  ready = true;
  $("loading").classList.add("hidden");
  setText("best-title", fmt(best));
  render(0);
  updateHud();
  if (config.autostart) begin();
}

buildRunnerCards();
$("pause-btn").addEventListener("click", () => { if (started && !resultsShown && counting <= 0) paused = !paused; });
$("start").addEventListener("click", () => { sfx.unlock(); startRun(true); });
$("again").addEventListener("click", () => startRun(true));
$("resume").addEventListener("click", () => { paused = false; });
$("restart").addEventListener("click", () => startRun(true));
addEventListener("resize", sizeCanvas);
requestAnimationFrame(tick);
void START_DAYS;
boot().catch(reportError);
