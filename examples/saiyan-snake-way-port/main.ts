/**
 * Serpentine Sky Run on Aura3D: boot, fixed-step loop, input, HUD, menus and capture hooks.
 * The simulation lives in `sim.ts` (pure); `world.ts` renders it through the public engine surface, `input.ts` turns
 * keyboard and touch into the sim's input, `hud.ts` holds the presentation-only HUD cues and `renderGuard.ts` decides
 * when a failed frame ends the session.
 *
 * Query parameters (all optional): `autostart=1` (skip the title and countdown), `manual=1` (the sim
 * only advances through `__AURA_SERPENTINE_SKY_RUN__.stepFrames`), `autopilot=1` (replay `?script=` or nothing).
 * Keys: A/D or arrows change lane, Space/W jump, S/down slide, Shift toggles surge, E flies (hold
 * W/S/A/D to steer), P/Esc pauses, M mutes, R/Enter restarts from the results screen. Touch: swipe for lanes, tap to
 * jump, swipe down to slide; while flying, hold the left or right half to steer and drag up or down to climb or dive.
 * `env=<n>` overrides the neutral-environment intensity (calibration captures only, see world.ts).
 */
import { createAuraApp, createAuraRouteHealthSnapshot, createFixedStepLoop, installQaHooks, type AuraApp } from "@aura3d/engine";
import { createRenderInterpolator } from "@aura3d/engine/game";
import {
  RUNGS, STEP, ROAD_LENGTH, KM_TOTAL, createRun, expandScript, qaSnapshot, stepRun, type InputSegment, type RunInput, type RunState
} from "./sim";
import { DROWSE_ALERT, daysStatusLabel, drowseCue, finalScore, gapAhead, gustCue, onboardingPrompt } from "./hud";
import { createRunInput } from "./input";
import { createRenderGuard } from "./renderGuard";
import { blendSamples, sampleOf, type PresentSample } from "./presentation";
import { createSfx } from "./sfx";
import { RUNNER_STYLES, hexCss } from "./styles";
import { buildWorld, loadRunner, type WorldRuntime } from "./world";

/** QA hook name: `window.__AURA_SERPENTINE_SKY_RUN__` (and `__AURA_SERPENTINE_SKY_RUN_ERROR__` for the first error). */
export const QA_HOOK_NAME = "serpentine-sky-run";

const params = new URLSearchParams(location.search);
const config = { autostart: params.get("autostart") === "1", manual: params.get("manual") === "1" };

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`serpentine-sky-run: #${id} is missing`);
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
const interpolator = createRenderInterpolator<PresentSample>(blendSamples);
let last = 0;
let steps = 0;
const guard = createRenderGuard();
let outroT = 0;
let counting = 0;
let resultsShown = false;
let runnerIndex = 0;

/* ------------------------------------------------------------------ best score */

const BEST_KEY = "serpentine-sky-run.best";
const BEST_S_KEY = "serpentine-sky-run.best-distance";
const MUTE_KEY = "serpentine-sky-run.muted";
const SEEN_KEY = "serpentine-sky-run.onboarding";
function loadBest(): number {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
}
function saveBest(value: number): void {
  try { localStorage.setItem(BEST_KEY, String(Math.round(value))); } catch { /* storage unavailable */ }
}
let best = loadBest();
const loadNumber = (key: string): number => { try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; } };
const saveValue = (key: string, value: string): void => { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } };
/** Furthest road distance `s` any run reached (the marker on the progress bar). */
let bestS = loadNumber(BEST_S_KEY);
const seenPrompts = new Set<string>((() => { try { return (localStorage.getItem(SEEN_KEY) ?? "").split(",").filter(Boolean); } catch { return []; } })());
const touchDevice = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
const reducedMotion = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;

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

const input = createRunInput({ flying: () => state.puff > 0, blocked: () => counting > 0 });
const GAME_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "KeyA", "KeyD", "KeyW", "KeyS", "ShiftLeft", "ShiftRight", "KeyE", "KeyP", "Escape", "KeyM", "KeyR", "Enter"]);
addEventListener("keydown", (e) => {
  if (!GAME_KEYS.has(e.code)) return;
  e.preventDefault();
  sfx.unlock();
  if (e.code === "KeyM") { toggleMute(); return; }
  if (e.code === "Escape" || e.code === "KeyP") { if (started && !resultsShown && counting <= 0) paused = !paused; return; }
  if (!started && (e.code === "ArrowLeft" || e.code === "KeyA")) { selectRunner(runnerIndex - 1); return; }
  if (!started && (e.code === "ArrowRight" || e.code === "KeyD")) { selectRunner(runnerIndex + 1); return; }
  if (!started && (e.code === "Space" || e.code === "Enter")) { startRun(true); return; }
  if (resultsShown) { if (e.code === "KeyR" || e.code === "Enter" || e.code === "Space") startRun(true); return; }
  // game keys pressed during the countdown are dropped, so they cannot fire on the first frame after GO (C10)
  input.keyDown(e.code);
});
addEventListener("keyup", (e) => { input.keyUp(e.code); });
// a key released while the page had no focus never sends keyup: drop every held key on blur and when the tab hides (C10)
addEventListener("blur", () => input.clear());
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) return;
  input.clear();
  if (started && !resultsShown && counting <= 0) paused = true;
});

/* touch: swipe left/right for lanes, up or tap to jump, down to slide; while flying, a held touch steers (C6) */
canvas.addEventListener("pointerdown", (e) => {
  sfx.unlock();
  if (e.pointerType === "mouse") return;
  input.pointerDown(e.pointerId, e.clientX, e.clientY, canvas.clientWidth);
});
canvas.addEventListener("pointermove", (e) => { if (e.pointerType !== "mouse") input.pointerMove(e.pointerId, e.clientX, e.clientY, canvas.clientWidth); });
canvas.addEventListener("pointercancel", (e) => input.pointerCancel(e.pointerId));
canvas.addEventListener("pointerup", (e) => {
  if (e.pointerType === "mouse") return;
  if (!started || counting > 0) { input.pointerCancel(e.pointerId); return; }
  if (resultsShown) { input.pointerCancel(e.pointerId); startRun(true); return; }
  input.pointerUp(e.pointerId, e.clientX, e.clientY);
});
for (const [id, key] of [["t-surge", "ShiftLeft"], ["t-fly", "KeyE"], ["t-slide", "KeyS"]] as const) {
  $(id).addEventListener("pointerdown", (e) => { e.preventDefault(); sfx.unlock(); if (started && !resultsShown && counting <= 0) input.tap(key); });
}

function takeInput(): RunInput {
  return input.take();
}

/* ------------------------------------------------------------------ mute */

let muted = false;
function toggleMute(): void {
  muted = sfx.toggleMute();
  saveValue(MUTE_KEY, muted ? "1" : "0");
  const btn = $("mute-btn");
  btn.setAttribute("aria-pressed", String(muted));
  btn.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
  btn.textContent = muted ? "SOUND OFF" : "SOUND ON";
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
  const final = finalScore(state);
  const score = final.total;
  if (state.s > bestS) { bestS = state.s; saveValue(BEST_S_KEY, String(Math.round(bestS))); }
  const isBest = score > best;
  if (isBest) { best = score; saveBest(best); }
  const reached = state.phase === "leap";
  setText("results-title", reached ? "YOU REACHED THE TAIL" : state.phase === "fall" ? "YOU FELL" : "RUN OVER");
  setText("results-sub", reached
    ? "One million kilometres of road behind you, and a jump at the end of it."
    : (state.phase === "fall" ? state.fallWhy || "OFF THE ROAD" : state.ended || "TOO LATE") + (isBest ? "  ·  new best score" : ""));
  setText("r-km", fmt(distanceKm()));
  setText("r-score", fmt(score));
  setText("r-days", fmt(final.daysLeft));
  setText("r-bonus", final.daysBonus > 0 ? `+${fmt(final.daysBonus)}` : "0");
  setText("r-bonus-note", reached ? `${fmt(final.daysLeft)} days left pay ${fmt(final.daysBonus)} points` : "Days left only pay out at the tail");
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
  $("days-card").setAttribute("aria-label", daysStatusLabel(state.days, started && !resultsShown && state.phase === "run"));
  setText("score", fmt(state.score));
  setText("mult", `×${rung.mult}`);
  $("surge-chip").classList.toggle("hot", state.auraRung > 0);
  ($("ki-bar") as HTMLElement).style.width = `${Math.round(Math.max(0, Math.min(1, state.ki / state.kiMax)) * 100)}%`;
  ($("strain-bar") as HTMLElement).style.width = `${Math.round(state.strain * 100)}%`;
  setText("banner", state.bannerT > 0 ? state.banner : "");
  setText("sub", state.bannerT > 0 ? state.bannerSub : "");
  const drowse = drowseCue(state);
  const gust = gustCue(state);
  const gap = started && counting <= 0 ? gapAhead(state) : null;
  // manual stepping (captures, tests) never ages a prompt, so it shows none
  const prompt = started && counting <= 0 && !resultsShown && !config.manual ? onboardingPrompt(state, seenPrompts, gap, touchDevice) : null;
  if (prompt && !activePrompt) { activePrompt = prompt.id; promptText = prompt.text; promptT = 2.4; }
  setText("toast", state.toastT > 0 ? state.toast : drowse.warn ? DROWSE_ALERT : "");
  ($("drowsefx") as HTMLElement).style.opacity = started ? String(drowse.fade) : "0";
  ($("drowse-bar") as HTMLElement).style.width = `${Math.round(drowse.meter * 100)}%`;
  setHidden("drowse-row", !(started && drowse.meter > 0));
  setHidden("gust", !gust);
  if (gust) setText("gust", gust.dir < 0 ? "\u2190 GUST" : "GUST \u2192");
  setHidden("gap-warn", gap === null);
  setText("prompt", activePrompt ? promptText : "");
  setText("charges", `${state.vitalseed > 0 ? `VITAL SEED \u00d7${state.vitalseed}` : ""}${state.vitalseed > 0 && state.poleCharges > 0 ? " \u00b7 " : ""}${state.poleCharges > 0 ? `STAFF \u00d7${state.poleCharges}` : ""}`);
  const bestMark = $("best-mark");
  bestMark.style.left = `${Math.round(Math.max(0, Math.min(1, bestS / ROAD_LENGTH)) * 1000) / 10}%`;
  bestMark.classList.toggle("hidden", bestS <= 0);
  setText("phase", phaseLabel());
  setHidden("title", started);
  setHidden("hud", !started || resultsShown);
  setHidden("paused", !paused);
  setHidden("results", !resultsShown);
  setHidden("count", counting <= 0);
  if (counting > 0) setText("count", counting > 2.6 ? "3" : counting > 1.6 ? "2" : counting > 0.6 ? "1" : "GO");
  const fast = Math.max(0, Math.min(reducedMotion?.matches ? 0.25 : 0.85, (state.speed - 44) / 70 + (state.auraRung > 0 ? 0.25 : 0)));
  $("speedfx").style.opacity = started && state.phase === "run" ? String(fast.toFixed(2)) : "0";
  $("fallfx").style.opacity = state.phase === "fall" ? String(Math.min(1, outroT / 1.2).toFixed(2)) : "0";
}

/* ------------------------------------------------------------------ sound cues */

let prev = { grounded: true, vy: 0, stumble: 0, rung: 0, puff: 0, pulse: 0, phase: "run" };
function cues(): void {
  if (!started || counting > 0) { prev = { grounded: state.grounded, vy: state.vy, stumble: state.stumble, rung: state.auraRung, puff: state.puff, pulse: state.kiPulse, phase: state.phase }; return; }
  if (state.kiPulse > prev.pulse + 0.3) sfx.pickup(state.kiChain);
  if (prev.grounded && !state.grounded && state.vy > 0 && state.phase === "run") sfx.jump();
  if (!prev.grounded && state.grounded && state.phase === "run") sfx.land();
  if (state.stumble > prev.stumble + 0.3) sfx.hit();
  if (state.auraRung > prev.rung) sfx.surge(state.auraRung);
  if (state.puff > 0 && prev.puff <= 0) sfx.whoosh();
  if (state.phase !== prev.phase) { if (state.phase === "fall") sfx.fall(); else if (state.phase === "leap") sfx.whoosh(); else if (state.phase === "over") sfx.hit(); }
  prev = { grounded: state.grounded, vy: state.vy, stumble: state.stumble, rung: state.auraRung, puff: state.puff, pulse: state.kiPulse, phase: state.phase };
}

/* ------------------------------------------------------------------ loop */

let activePrompt: string | null = null;
let promptT = 0;
let promptText = "";

/** Ages the onboarding prompt; a prompt counts as seen once it has shown for its full time. */
function agePrompt(dt: number): void {
  if (!activePrompt || promptT <= 0) return;
  promptT -= dt;
  if (promptT <= 0) {
    seenPrompts.add(activePrompt);
    saveValue(SEEN_KEY, [...seenPrompts].join(","));
    activePrompt = null;
  }
}

/** `blend` draws between the last two simulation steps (live play); captures and manual stepping draw the exact state. */
function render(dt: number, blend = false): void {
  if (!app || !runtime || guard.failed) return;
  try {
    const alpha = blend ? Math.min(1, loop.accumulator / STEP) : 1;
    runtime.update(state, dt, renderTime + (alpha < 1 ? loop.accumulator : 0), canvas.clientWidth / Math.max(1, canvas.clientHeight), outroT, alpha < 1 ? interpolator.sample(alpha) : undefined);
    app.step(0);
    guard.ok();
  } catch (error) {
    // C1: one bad frame is skipped and logged; the session ends only after RENDER_FAIL_LIMIT failures in a row
    if (guard.fail(error) === "fatal") reportError(error);
    else if (guard.total === 1 || guard.consecutive === 1) console.warn("serpentine-sky-run: frame skipped after a render error", error);
  }
}

function advance(input: RunInput): void {
  stepRun(state, input, STEP);
  interpolator.push(sampleOf(state));
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
  if (stepping()) agePrompt(dt);
  render(dt, stepping());
  updateHud();
}

/** Instant start (capture hooks and tests). */
function begin(): void {
  state = createRun();
  interpolator.reset(sampleOf(state));
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
  input.clear();
  if (withCountdown) counting = 3.6;
}

function reportError(error: unknown): void {
  const base = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const code = (error as { code?: unknown })?.code;
  const details = (error as { details?: unknown })?.details;
  const message = `${base}${typeof code === "string" ? ` [${code}]` : ""}${details ? ` ${JSON.stringify(details).slice(0, 6000)}` : ""}`;
  qa.reportError(message);
  $("loading-status").textContent = `The road could not load: ${message.slice(0, 300)}`;
  $("loading").classList.remove("hidden");
  console.error(error);
}

/* ------------------------------------------------------------------ capture hooks */

const qa = installQaHooks(QA_HOOK_NAME, {
  ready: () => ready,
  state: () => qaSnapshot(state, steps),
  app: () => app,
  routeHealth: () => (app ? createAuraRouteHealthSnapshot(app, { parityIds: ["SH-02", "SG-05", "SG-06", "SG-07", "SC-01", "SR-02"] }) : null),
  nodeCount: () => runtime?.nodeCount ?? 0,
  extras: {
    get ready() { return ready; },
    raw: () => JSON.parse(JSON.stringify(state)) as RunState,
    reset: () => { begin(); render(0); return qaSnapshot(state, steps); },
    /** Steps the simulation `n` fixed steps with `input` (idle by default) and renders once. */
    stepFrames: (n: number, input: RunInput = {}) => {
      for (let i = 0; i < n && state.phase === "run" && !state.atEnd; i++) advance(input);
      render(0);
      return qaSnapshot(state, steps);
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
      return { steps, final: qaSnapshot(state, steps) };
    },
    start: () => { begin(); render(0); return qaSnapshot(state, steps); },
    /** Presentation-only: edits the live state (speed, aura, ...) so a capture can show a given look without a replay. */
    setState: (patch: Partial<RunState>) => { Object.assign(state, patch); render(0); return qaSnapshot(state, steps); },
    /** Presentation-only: renders `seconds` of the post-run phase (fall / leap / over) after `setState` put the run there. */
    outro: (seconds: number) => { outroT = seconds; render(0); return qaSnapshot(state, steps); },
    meta: () => ({
      steps, renderTime, entityNodes: runtime?.entityNodes ?? 0, nodeCount: runtime?.nodeCount ?? 0, visibilityWrites: runtime?.visibilityWrites ?? 0,
      renderErrors: guard.total, renderFailed: guard.failed, lastRenderError: guard.lastError
    }),
    /** Test seam for the touch and keyboard input (C6, C10). */
    input: () => ({ held: [...input.held], taps: [...input.taps] }),
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
  runtime.setReducedMotion(Boolean(reducedMotion?.matches));
  reducedMotion?.addEventListener?.("change", (e) => runtime?.setReducedMotion(e.matches));
  selectRunner(runnerIndex, false);
  ready = true;
  $("loading").classList.add("hidden");
  setText("best-title", fmt(best));
  render(0);
  updateHud();
  if (config.autostart) begin();
}

buildRunnerCards();
canvas.addEventListener("webglcontextlost", () => { guard.contextLost(); reportError(new Error("WebGL context lost")); });
$("mute-btn").addEventListener("click", () => { sfx.unlock(); toggleMute(); });
if (loadNumber(MUTE_KEY) === 1) toggleMute();
$("pause-btn").addEventListener("click", () => { if (started && !resultsShown && counting <= 0) paused = !paused; });
$("start").addEventListener("click", () => { sfx.unlock(); startRun(true); });
$("again").addEventListener("click", () => startRun(true));
$("resume").addEventListener("click", () => { paused = false; });
$("restart").addEventListener("click", () => startRun(true));
addEventListener("resize", sizeCanvas);
requestAnimationFrame(tick);
boot().catch(reportError);
