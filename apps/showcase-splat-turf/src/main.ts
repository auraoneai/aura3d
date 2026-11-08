/**
 * Splat Turf boot: loading bar → buildWorld → createAuraApp → bind → warm → fixed-step loop.
 * Splat shell pattern: pointer/keyboard steering, pause on P/Esc/hidden tab, adaptive DPR, QA hooks
 * (`window.__AURA_SPLAT_TURF__`), route-health snapshot, localStorage best/mute/motion (guarded).
 *
 * Query parameters: `seed=N`, `manual=1`, `autostart=1`, `autopilot=1`, `warmup=N`, `dpr=N`, `motion=reduced|full`.
 */
import { createAuraApp, createAuraRouteHealthSnapshot, createFixedStepLoop, installQaHooks, readQaParams, type AuraApp } from "@aura3d/engine";
import { warmPrograms } from "@aura3d/engine/game";
import { drainPopups } from "../../../examples/shared/runner-kit/index";
import { createLoadingProgress } from "../../../examples/shared/loading-progress";
import { labAppOptions, readLabFlags } from "../../../examples/shared/lab-flags";
import { CONFIG, IDLE, SplatTurfSim, TRACE_COLUMNS, coverageGrade, expandScript, parseScript, replay, type Input, type Phase } from "./sim";
import { ChaseCamera, createTurfPresenter } from "./presentation";
import { buildWorld, type WorldRuntime } from "./world";
import { LOOK, QA_CROPS } from "./look";
import { HudWriter, coveragePercent } from "./hud";
import { ScreenFx, flashFor, flashStrength } from "./fx";
import { createTurfSound, diffSounds, type FrameState } from "./audio";
import { TurfAutopilot } from "./autopilot";
import { HOWTO_SEEN_KEY, createHowto } from "./howto";

const config = readQaParams({
  seed: { type: "number", default: 20261121 },
  manual: { type: "flag" },
  autostart: { type: "flag" },
  autopilot: { type: "flag" },
  warmup: { type: "number", default: 30 },
  dpr: { type: "number", default: 0 },
  motion: { type: "string", default: "" }
});

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`splat-turf: #${id} is missing`);
  return el as T;
};
const canvas = $<HTMLCanvasElement>("app");

let sim = new SplatTurfSim(config.seed);
const presenter = createTurfPresenter(() => sim);
const steady = new ChaseCamera(sim);
let app: AuraApp | undefined;
let runtime: WorldRuntime | undefined;
let ready = false;
let steps = 0;
let pilot: TurfAutopilot | null = config.autopilot ? new TurfAutopilot() : null;
let renderFailed = false;
const pending: Input = { ...IDLE };
let nextPopupSeq = 0;
let popupsShown = 0;

const sound = createTurfSound();
let fx: ScreenFx | undefined;
let prevFrame: FrameState | null = null;
let lastPhase: Phase = "splash";
let keyDir = 0;
let keyDragging = false;
let paused = false;

const store = {
  get(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string): void { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } }
};
const KEY_BEST = "splatSiblings.splat-turf.best";
const KEY_MUTE = "splatSiblings.splat-turf.mute";
const KEY_MOTION = "splatSiblings.splat-turf.motion";
let best = Number(store.get(KEY_BEST)) || 0;
sound.setMuted(store.get(KEY_MUTE) === "1");
const prefersReduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const storedMotion = config.motion || store.get(KEY_MOTION);
let reducedMotion = storedMotion === "reduced" ? true : storedMotion === "full" ? false : prefersReduced;

const hud = new HudWriter({
  score: $("score"), best: $("best-line"), coverage: $("coverage-line"), mult: $("mult"),
  comboFill: $("combo-fill"), tankFill: $("tank-fill"), tankBar: $("tank-bar")
});

/* ------------------------------------------------------------------ results */

function showResults(): void {
  const o = sim.o;
  const final = Math.floor(o.score);
  const cov = coveragePercent(o);
  if (cov > best) { best = cov; store.set(KEY_BEST, String(best)); }
  const finished = o.phase === "finished";
  $("result-title").textContent = finished ? "RUN COMPLETE!" : "OUT OF PAINT!";
  $("result-grade").textContent = coverageGrade(cov);
  $("result-coverage").textContent = `COVERAGE ${cov}%`;
  $("result-best").textContent = `BEST COVERAGE ${best}%`;
  $("result-cans").textContent = `CANS GRABBED ${o.cansGrabbed}`;
  $("splash-best").textContent = `BEST COVERAGE ${best}%`;
  const out = $("result-score");
  if (config.manual) { out.textContent = final.toLocaleString(); return; }
  const startedAt = performance.now();
  const step = (): void => {
    const t = Math.min(1, (performance.now() - startedAt) / 800);
    out.textContent = Math.floor(final * (1 - Math.pow(1 - t, 3))).toLocaleString();
    if (t < 1 && (sim.o.phase === "gameOver" || sim.o.phase === "finished")) requestAnimationFrame(step);
  };
  step();
}

/* ------------------------------------------------------------------ HUD + reactions */

function updateHud(): void {
  const o = sim.o;
  hud.update(o, best);
  if (o.phase !== lastPhase) {
    $("splash-screen").classList.toggle("on", o.phase === "splash");
    $("gameover-screen").classList.toggle("on", o.phase === "gameOver" || o.phase === "finished");
    $("hud").classList.toggle("on", o.phase === "playing" || o.phase === "bursting");
    if (o.phase === "gameOver" || o.phase === "finished") showResults();
    if (o.phase === "splash" || o.phase === "playing") fx?.clearReveal();
    if (o.phase !== "playing") $("popups").replaceChildren();
    sound.setIntensity(o.phase === "playing" || o.phase === "bursting" ? "play" : o.phase === "gameOver" || o.phase === "finished" ? "over" : "title");
    lastPhase = o.phase;
  }
  const drained = drainPopups(sim.popups, nextPopupSeq);
  nextPopupSeq = drained.nextSeq;
  for (const p of drained.fresh) {
    popupsShown++;
    const el = document.createElement("div");
    el.className = p.size >= 28 ? "popup big" : "popup";
    el.textContent = p.text;
    el.style.color = p.color;
    const host = $("popups");
    host.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
    while (host.children.length > 4) host.firstElementChild?.remove();
  }
  reactToFrame();
}

function reactToFrame(): void {
  const o = sim.o;
  fx ??= new ScreenFx();
  const frame: FrameState = {
    phase: o.phase, cansGrabbed: o.cansGrabbed, solventHits: o.solventHits,
    eraserHits: o.eraserHits, stretches: o.stretches, milestones: o.milestones, combo: o.combo
  };
  const events = diffSounds(prevFrame, frame);
  for (const event of events) {
    sound.play(event.sound, event.level);
    if (config.manual) continue;
    const flash = flashFor(event.sound);
    if (flash) fx.flash(flash.color, flashStrength(flash.strength, reducedMotion));
    if (event.sound === "burst") fx.reveal(LOOK.ball, reducedMotion);
    if (event.sound === "finish") fx.reveal(LOOK.can, reducedMotion);
  }
  prevFrame = frame;
  fx.vignette(o.mult, false, LOOK.ball, o.time, reducedMotion);
}

/* ------------------------------------------------------------------ frame */

function render(live = false): void {
  if (!app || !runtime || renderFailed) return;
  try {
    const shown = live ? presenter.present(loop, true) : undefined;
    const camera = steady.at(live ? loop.alpha : 1);
    runtime.update(sim, canvas.clientWidth / Math.max(1, canvas.clientHeight), {
      ...(shown ? { shown } : {}), camera, reducedMotion
    });
    app.step(0);
  } catch (error) {
    renderFailed = true;
    qa.reportError(error);
    throw error;
  }
}

function advance(input: Input): void {
  sim.advance(input);
  steady.step(sim);
  steps++;
}

const loop = createFixedStepLoop({
  manual: config.manual,
  isActive: () => ready && !paused && !howto.open,
  step() {
    if (keyDir !== 0 && sim.o.phase === "playing") {
      if (!keyDragging) { pending.down = true; keyDragging = true; }
      pending.dx += keyDir * 0.2;
    }
    const input: Input = pilot ? pilot.next(sim, steps) : { ...pending };
    pending.start = pending.down = pending.up = false;
    pending.dx = 0;
    advance(input);
    presenter.afterStep();
  },
  render(frameSeconds) {
    render(!config.manual && sim.o.phase === "playing");
    updateHud();
    sampleQuality(frameSeconds);
  }
});

/* ------------------------------------------------------------------ adaptive DPR */

const deviceRatio = typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1;
let pixelRatio = config.dpr > 0 ? config.dpr : Math.min(2, deviceRatio);
const frameSamples: number[] = [];
function sampleQuality(frameSeconds: number): void {
  if (config.dpr > 0 || config.manual || pixelRatio <= 1 || sim.o.phase !== "playing" || frameSamples.length >= 90) return;
  frameSamples.push(frameSeconds);
  if (frameSamples.length < 90) return;
  const median = [...frameSamples].sort((a, b) => a - b)[45] as number;
  if (median > 0.028) {
    pixelRatio = 1;
    app?.setPixelRatio?.(1);
  }
}

/* ------------------------------------------------------------------ boot */

let warmResult: Awaited<ReturnType<typeof warmPrograms>> | null = null;

async function boot(): Promise<void> {
  const startButton = $<HTMLButtonElement>("btn-start");
  const loading = createLoadingProgress({
    element: $("load-bar"),
    onProgress: (fraction) => { $("load-fill").style.width = `${Math.round(fraction * 100)}%`; }
  });
  loading.set(0.1);
  const world = buildWorld({ sim, aspect: canvas.clientWidth / Math.max(1, canvas.clientHeight) });
  const lab = labAppOptions(readLabFlags());
  app = createAuraApp(canvas, {
    autoStart: false,
    resize: true,
    pixelRatio: { max: pixelRatio, min: 1 },
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic", ...lab.renderer },
    output: { toneMapping: "none", dither: false, ...lab.output },
    scene: world.scene
  });
  await loading.track(app.ready(), 1);
  loading.set(0.5);
  runtime = world.bind(app);
  runtime.update(sim, canvas.clientWidth / Math.max(1, canvas.clientHeight), { camera: steady.at(1), reducedMotion });
  runtime.warm(true);
  loading.set(0.65);
  try {
    warmResult = await warmPrograms(app, { maxFrames: 6 });
  } catch (error) {
    qa.reportError(error);
  }
  runtime.warm(false);
  ready = true;
  loading.done();
  startButton.disabled = false;
  startButton.textContent = "PLAY NOW";
  startButton.removeAttribute("aria-busy");
  $("splash-best").textContent = `BEST COVERAGE ${best}%`;
  if (config.autostart) {
    for (let i = 0; i < config.warmup; i++) advance(IDLE);
    steps = 0;
    if (!pilot) pilot = new TurfAutopilot();
  }
  render();
  updateHud();
}

/* ------------------------------------------------------------------ pointer input */

const DRAG_SCALE = 0.02; // 50 px of drag = 1 m of steering target
let lastX = 0;
let dragging = false;
addEventListener("pointerdown", (e) => {
  void sound.unlock();
  if (config.manual || pilot || howto.open) return;
  const target = e.target as HTMLElement | null;
  if (target?.closest?.(".no-steer")) return;
  if ((sim.o.phase === "gameOver" || sim.o.phase === "finished") && target?.id !== "btn-restart") return;
  if (paused) return;
  if (sim.o.phase === "splash") pending.start = true;
  else pending.down = true;
  dragging = true;
  lastX = e.clientX;
  if (!target?.closest?.("button")) {
    try { canvas.setPointerCapture?.(e.pointerId); } catch { /* the pointer is already gone */ }
  }
});
addEventListener("pointermove", (e) => {
  if (config.manual || pilot || !dragging) return;
  pending.dx += (e.clientX - lastX) * DRAG_SCALE;
  lastX = e.clientX;
});
const release = (): void => {
  if (config.manual || pilot) return;
  dragging = false;
  pending.up = true;
};
addEventListener("pointerup", release);
addEventListener("pointercancel", release);
canvas.addEventListener("lostpointercapture", () => { if (dragging) release(); });

function dropInput(): void {
  held.clear();
  keyDir = 0;
  if (keyDragging || dragging) pending.up = true;
  keyDragging = false;
  dragging = false;
}
addEventListener("blur", dropInput);

/* ------------------------------------------------------------------ pause + hidden tab */

function setPaused(on: boolean): void {
  if (on && sim.o.phase !== "playing") on = false;
  paused = on;
  $("pause-screen").classList.toggle("on", paused);
  if (paused) dropInput();
  if (paused || document.hidden) void sound.suspend();
  else void sound.resume();
  loop.resetAccumulator();
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    dropInput();
    if (!config.manual && !pilot) setPaused(true);
  }
  if (paused || document.hidden) void sound.suspend();
  else void sound.resume();
});
$("btn-resume").addEventListener("click", () => setPaused(false));
$("btn-pause").addEventListener("click", () => { if (!config.manual && !pilot) setPaused(!paused); });

/* ------------------------------------------------------------------ settings */

function paintMotion(): void {
  $("btn-motion").setAttribute("aria-pressed", String(reducedMotion));
}
$("btn-motion").addEventListener("click", () => {
  reducedMotion = !reducedMotion;
  store.set(KEY_MOTION, reducedMotion ? "reduced" : "full");
  paintMotion();
  render();
});
paintMotion();

const muteButton = $<HTMLButtonElement>("btn-mute");
const paintMute = (): void => { muteButton.setAttribute("aria-pressed", String(sound.muted)); muteButton.textContent = sound.muted ? "\u{1F507}" : "♫"; };
const toggleMute = (): void => { sound.setMuted(!sound.muted); store.set(KEY_MUTE, sound.muted ? "1" : "0"); paintMute(); };
muteButton.addEventListener("click", toggleMute);
paintMute();

function restart(): void {
  sim.begin();
  presenter.reset();
  steady.reset(sim);
  prevFrame = null;
  // Leave lastPhase alone: the next updateHud sees the phase change and clears the burst/finish
  // reveal layer, the popups and the music intensity (setting it here left the reveal over the game).
  $("splash-screen").classList.remove("on");
  $("gameover-screen").classList.remove("on");
  $("hud").classList.add("on");
}

/* ------------------------------------------------------------------ how to play */

/** Play from the splash: the first time ever, show How to play first (the sim waits until it closes). */
function requestStart(): void {
  if (!ready || howto.open) return;
  if (store.get(HOWTO_SEEN_KEY) !== "1") { howto.show("first", $("btn-start")); return; }
  pending.start = true;
}

const howto = createHowto({
  root: $("howto-screen"),
  confirm: $<HTMLButtonElement>("btn-howto-ok"),
  onClose(context) {
    store.set(HOWTO_SEEN_KEY, "1");
    loop.resetAccumulator();
    // The player already pressed Play: any close (GOT IT, Enter, Space or Esc) starts the run.
    if (context === "first" && sim.o.phase === "splash") {
      (document.activeElement as HTMLElement | null)?.blur?.();
      pending.start = true;
    }
  }
});
$("btn-howto").addEventListener("click", () => howto.show("splash", $("btn-howto")));
$("btn-howto-pause").addEventListener("click", () => { if (paused) howto.show("pause", $("btn-howto-pause")); });

$("btn-start").addEventListener("click", () => {
  void sound.unlock();
  if (config.manual || pilot || !ready) return;
  requestStart();
});
$("btn-restart").addEventListener("click", () => {
  void sound.unlock();
  if (config.manual || pilot) return;
  restart();
});

/* ------------------------------------------------------------------ keyboard */

const KEY_DIR: Record<string, number> = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };
const held = new Set<string>();
addEventListener("keydown", (e) => {
  void sound.unlock();
  if (howto.open) {
    // The dialog owns the keyboard: Enter/Space confirm, Esc closes, Tab stays inside, nothing reaches the game.
    if (howto.trapTab(e)) return;
    if (e.code === "Escape" || e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Space") {
      e.preventDefault();
      if (!e.repeat) howto.close(e.code !== "Escape");
    }
    return;
  }
  if (config.manual || pilot || e.repeat) return;
  if (e.code === "KeyM") { toggleMute(); return; }
  if (e.code === "KeyP" || e.code === "Escape") { setPaused(!paused); return; }
  if (paused) return;
  if (e.code === "Space" || e.code === "Enter") {
    e.preventDefault();
    if (sim.o.phase === "splash" && ready) requestStart();
    else if (sim.o.phase === "gameOver" || sim.o.phase === "finished") restart();
    return;
  }
  if (e.code in KEY_DIR) {
    e.preventDefault();
    held.add(e.code);
    keyDir = [...held].reduce((sum, k) => sum + (KEY_DIR[k] ?? 0), 0);
    if (!keyDragging && sim.o.phase === "playing") { pending.down = true; keyDragging = true; }
  }
});
addEventListener("keyup", (e) => {
  if (!(e.code in KEY_DIR)) return;
  held.delete(e.code);
  keyDir = [...held].reduce((sum, k) => sum + (KEY_DIR[k] ?? 0), 0);
  if (held.size === 0 && keyDragging) { pending.up = true; keyDragging = false; }
});

/* ------------------------------------------------------------------ QA hooks */

function snapshotState() {
  const o = sim.o;
  return {
    ...o, steps, rngCount: sim.rngCount, steerTarget: sim.steerTarget,
    coveragePercent: coveragePercent(o), best,
    cans: o.cans.filter((c) => c.active).length,
    strips: o.strips.filter((s) => s.active).length,
    bots: o.bots.filter((b) => b.active).length
  };
}

const qa = installQaHooks("splat-turf", {
  ready: () => ready,
  seed: config.seed,
  state: snapshotState,
  traceRow: () => sim.traceRow(sim.traceLength - 1),
  traceColumns: TRACE_COLUMNS,
  app: () => app,
  routeHealth: () => (app ? createAuraRouteHealthSnapshot(app, { parityIds: [] }) : null),
  nodeCount: () => runtime?.nodeCount ?? 0,
  begin() {
    advance({ ...IDLE, start: true });
    render();
    updateHud();
  },
  stepFrames(n: number, input?: Partial<Input>) {
    for (let i = 0; i < n; i++) advance(i === 0 ? { ...IDLE, ...input } : IDLE);
    render();
    updateHud();
    return snapshotState();
  },
  /** Headless replay of a capture script on a fresh sim (no rendering): returns the trace rows. */
  replay(text: string | readonly Partial<Input>[], warmup = config.warmup, seed = config.seed) {
    const inputs: Input[] = typeof text !== "string"
      ? text.map((r) => ({ ...IDLE, ...r }))
      : text.trim().startsWith("[")
        ? (JSON.parse(text) as Partial<Input>[]).map((r) => ({ ...IDLE, ...r }))
        : expandScript(parseScript(text));
    return replay(seed, warmup, inputs).trace;
  },
  reset(seed = config.seed) {
    sim = new SplatTurfSim(seed);
    presenter.reset();
    steady.reset(sim);
    steps = 0;
    nextPopupSeq = 0;
    prevFrame = null;
    lastPhase = "splash";
    pilot = config.autopilot ? new TurfAutopilot() : null;
    render();
    updateHud();
  },
  extras: {
    get booted(): boolean { return ready; },
    /** Drive n steps with the closed-loop autopilot; `reckless` chases hazards (the gameOver path). */
    runAutopilot(n: number, reckless = false) {
      const driver = new TurfAutopilot({ maxDx: 0.5, reckless });
      for (let i = 0; i < n; i++) advance(driver.next(sim, sim.o.phase === "playing" ? i + 2 : i));
      render();
      updateHud();
      return snapshotState();
    },
    restart() {
      restart();
      render();
      updateHud();
      return snapshotState();
    },
    presentation() {
      return { popupsShown, nextPopupSeq, uploadedVertices: runtime?.uploadedVertices ?? 0, pixelRatio, paused, reducedMotion, warm: warmResult };
    },
    setting(which: "motion", on: boolean) {
      if (which === "motion") reducedMotion = on;
      paintMotion();
      render();
      updateHud();
    },
    pause(on: boolean) {
      setPaused(on);
      return paused;
    }
  }
});

{
  const qaGlobal = (globalThis as { __AURA_QA__?: Record<string, unknown> }).__AURA_QA__;
  if (qaGlobal) qaGlobal.crops = QA_CROPS;
}

loop.start();
boot().catch((error) => {
  (globalThis as { __AURA_SPLAT_TURF_ERROR__?: string }).__AURA_SPLAT_TURF_ERROR__ = String(error);
  $("render-error").classList.add("on");
  $("render-error-msg").textContent = `Splat Turf could not start: ${String(error)}. This game needs WebGL2.`;
  qa.reportError(error);
});