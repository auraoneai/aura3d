/**
 * Beat Hopper boot: loading bar → world → createAuraApp → warm programs → fixed-step loop. Three lanes: a horizontal
 * drag/swipe or ArrowLeft/ArrowRight/A/D steers, a tap (short, little movement) hops on release, Space/ArrowUp/W hop
 * on keydown, a still hold or held ArrowDown/S ducks (the sim tells a drag from a tap by travel; input.ts maps keys).
 * Music is scheduled from sim beat diffs (audio.ts), never a wall clock.
 *
 * Query parameters: `seed=N`, `manual=1` (sim advances only through QA stepFrames), `autostart=1`, `autopilot=1`,
 * `warmup=N` (idle splash frames before autostart, default 30), `dpr=N`, `motion=reduced|full`.
 * Settings persist under `splatSiblings.beat-hopper.best/.mute/.motion/.howtoSeen` (guarded localStorage). The How to
 * play dialog opens on the first Play press; while it is open the loop is held, so the run neither starts nor advances.
 */
import { createAuraApp, createAuraRouteHealthSnapshot, createFixedStepLoop, installQaHooks, readQaParams, type AuraApp } from "@aura3d/engine";
import { warmPrograms } from "@aura3d/engine/game";
import { createLoadingProgress } from "../../../examples/shared/loading-progress";
import { labAppOptions, readLabFlags } from "../../../examples/shared/lab-flags";
import { createWorkerRendererWorker } from "@aura3d/engine/worker";
import { IDLE, BeatHopperSim, TRACE_COLUMNS, replay, type Input } from "./sim";
import { InputQueue, isGameKey } from "./input";
import { Autopilot } from "./autopilot";
import { BeatHopperSound, diffSounds, type FrameState } from "./audio";
import { ScreenFx, flashFor, flashStrength } from "./fx";
import { ChaseCamera, cardPose, createBeatPresenter, shownOf } from "./presentation";
import { buildWorld, type WorldRuntime } from "./world";
import { Hud, hudElements } from "./hud";
import { QA_CROPS } from "./look";

const config = readQaParams({
  seed: { type: "number", default: 20261101 },
  manual: { type: "flag" },
  autostart: { type: "flag" },
  autopilot: { type: "flag" },
  warmup: { type: "number", default: 30 },
  dpr: { type: "number", default: 0 },
  motion: { type: "string", default: "" }
});

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`beat-hopper: #${id} is missing`);
  return el as T;
};
const canvas = $<HTMLCanvasElement>("app");

let sim = new BeatHopperSim(config.seed);
const rig = new ChaseCamera(sim);
const presenter = createBeatPresenter(() => shownOf(sim, rig.cur));
let app: AuraApp | undefined;
let runtime: WorldRuntime | undefined;
let ready = false;
let steps = 0;
let pilot: Autopilot | null = config.autopilot ? new Autopilot() : null;
let renderFailed = false;
const queue = new InputQueue();
/** Drop focus from any button so Space/Enter during play never activate it (keyboard input is window-level). */
const releaseFocus = (): void => {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) active.blur();
};

const sound = new BeatHopperSound();
let fx: ScreenFx | undefined;
let hud: Hud | undefined;
let prevFrame: FrameState | null = null;
let lastPhase = "splash";
let phaseStart = 0;
let paused = false;
let howtoOpen = false;
let warmResult: Awaited<ReturnType<typeof warmPrograms>> | null = null;

const store = {
  get(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string): void { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } }
};
let best = Number(store.get("splatSiblings.beat-hopper.best")) || 0;
sound.setMuted(store.get("splatSiblings.beat-hopper.mute") === "1");
const prefersReduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const storedMotion = config.motion || store.get("splatSiblings.beat-hopper.motion") || "";
let reducedMotion = storedMotion === "reduced" ? true : storedMotion === "full" ? false : prefersReduced;

const frameOf = (): FrameState => {
  const o = sim.o;
  // Dodges and orb pickups chime with the GOOD cue.
  return { phase: o.phase, beatIndex: o.beatIndex, pose: o.pose, combo: o.combo, mult: o.mult, perfect: o.perfect, good: o.good + o.dodges + o.orbs, miss: o.miss, milestones: o.milestones };
};

/* ------------------------------------------------------------------ results */

function showResults(): void {
  const o = sim.o;
  const final = o.score;
  const isBest = final > best;
  if (isBest) {
    best = final;
    store.set("splatSiblings.beat-hopper.best", String(best));
  }
  $("result-best").textContent = isBest ? `NEW BEST! ${best}` : `BEST ${best}`;
  $("result-perfect").textContent = String(o.perfect);
  $("result-good").textContent = String(o.good);
  $("result-miss").textContent = String(o.miss);
  $("result-combo").textContent = String(o.maxCombo);
  const out = $("result-score");
  if (config.manual) {
    out.textContent = String(final);
    return;
  }
  const startedAt = performance.now();
  const step = (): void => {
    const t = Math.min(1, (performance.now() - startedAt) / 800);
    out.textContent = String(Math.floor(final * (1 - Math.pow(1 - t, 3))));
    if (t < 1 && sim.o.phase === "gameOver") requestAnimationFrame(step);
  };
  step();
}

/* ------------------------------------------------------------------ audio + screen effects */

function reactToFrame(): void {
  const o = sim.o;
  fx ??= new ScreenFx();
  const frame = frameOf();
  sound.onFrame(prevFrame, frame);
  if (!config.manual) {
    for (const event of diffSounds(prevFrame, frame)) {
      const flash = flashFor(event);
      if (flash) fx.flash(flash.color, flashStrength(flash.strength, reducedMotion));
    }
  }
  prevFrame = frame;
  fx.vignette(o.mult, false, "#341259", o.t, reducedMotion);
  if (o.phase !== lastPhase) {
    phaseStart = o.t;
    if (o.phase === "playing") releaseFocus();
    if (o.phase === "gameOver") showResults();
    if (o.phase !== "playing" && o.phase !== "bursting") $("popups").replaceChildren();
    lastPhase = o.phase;
  }
  $("splash-screen").classList.toggle("hidden", o.phase !== "splash");
  $("gameover-screen").classList.toggle("hidden", o.phase !== "gameOver");
  $("splash-best").textContent = `BEST ${best}`;
}

/* ------------------------------------------------------------------ frame */

function render(live = false): void {
  if (!app || !runtime || renderFailed) return;
  try {
    const shown = live ? presenter.present(loop, true) : undefined;
    const card = config.manual ? null : cardPose(sim.o.phase, sim.o.t - phaseStart);
    const camera = card ?? rig.at(live ? loop.alpha : 1, sim, reducedMotion);
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
  rig.step(sim);
  pilot?.observe(sim);
  steps++;
}

const loop = createFixedStepLoop({
  manual: config.manual,
  isActive: () => ready && !paused && !howtoOpen,
  step() {
    const typed = queue.take();
    const input: Input = pilot ? pilot.next(sim, steps) : typed;
    advance(input);
    presenter.afterStep();
  },
  render(frameSeconds) {
    render(!config.manual && sim.o.phase === "playing");
    hud?.update(sim, best, config.manual);
    reactToFrame();
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

async function boot(): Promise<void> {
  const startButton = $("btn-start");
  const loading = createLoadingProgress({
    element: $("load-bar"),
    onProgress: (fraction) => { $("load-fill").style.width = `${Math.round(fraction * 100)}%`; }
  });
  startButton.setAttribute("aria-busy", "true");
  loading.set(0.1);
  const world = buildWorld({ sim, aspect: canvas.clientWidth / Math.max(1, canvas.clientHeight) });
  // WebGPU by default (backend "auto", WebGL2 fallback kept; real-GPU check 2026-11-08 after WebGPU perf round 2: same frame, >= 0.9x WebGL2 fps); ?backend=webgl2 opts out.
  const lab = labAppOptions(readLabFlags(), { backend: "auto", createWorker: createWorkerRendererWorker });
  app = createAuraApp(canvas, {
    autoStart: false,
    resize: true,
    pixelRatio: { max: pixelRatio, min: 1 },
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic", ...lab.renderer },
    output: { toneMapping: "none", dither: false, ...lab.output },
    ...(lab.worker ? { worker: lab.worker } : {}),
    scene: world.scene
  });
  await loading.track(app.ready(), 1);
  loading.set(0.5);
  runtime = world.bind(app);
  hud = new Hud(hudElements(document));
  runtime.update(sim, canvas.clientWidth / Math.max(1, canvas.clientHeight));
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
  startButton.removeAttribute("aria-busy");
  if (config.autostart) {
    for (let i = 0; i < config.warmup; i++) advance(IDLE);
    steps = 0;
    if (!pilot) pilot = new Autopilot();
  }
  render();
  hud.update(sim, best, config.manual);
  reactToFrame();
}

/* ------------------------------------------------------------------ input: drag = steer, tap = hop, hold = duck */

let dragging = false;
let lastX = 0;
addEventListener("pointerdown", (e) => {
  void sound.unlock();
  if (config.manual || pilot || paused || howtoOpen) return;
  const target = e.target as HTMLElement | null;
  if (target?.closest?.(".no-steer")) return;
  if (sim.o.phase === "splash") requestStart();
  else if (sim.o.phase === "playing") {
    queue.press();
    dragging = true;
    lastX = e.clientX;
    if (!target?.closest?.("button")) {
      try { canvas.setPointerCapture?.(e.pointerId); } catch { /* the pointer is already gone */ }
    }
  }
});
addEventListener("pointermove", (e) => {
  if (config.manual || pilot || !dragging) return;
  queue.drag(e.clientX - lastX);
  lastX = e.clientX;
});
const release = (): void => {
  if (config.manual || pilot) return;
  dragging = false;
  queue.release();
};
addEventListener("pointerup", release);
addEventListener("pointercancel", release);
canvas.addEventListener("lostpointercapture", () => { if (dragging) release(); });

function dropInput(): void {
  dragging = false;
  queue.drop();
}
addEventListener("blur", dropInput);

addEventListener("keydown", (e) => {
  void sound.unlock();
  if (config.manual || pilot) return;
  if (howtoOpen) {
    if (e.code === "Escape" || e.code === "Enter" || e.code === "Space") {
      e.preventDefault();
      if (!e.repeat) closeHowto();
    } else if (e.code === "Tab") {
      e.preventDefault();
      $("btn-howto-close").focus();
    }
    return;
  }
  const playing = sim.o.phase === "playing";
  // During play the game owns Space/Enter and the game keys: never scroll, never activate a focused button.
  if (playing && (isGameKey(e.code) || e.code === "Enter")) {
    e.preventDefault();
    releaseFocus();
  }
  if (e.repeat) {
    if (isGameKey(e.code) || e.code === "Enter") e.preventDefault();
    return;
  }
  if (e.code === "KeyM") { toggleMute(); return; }
  if (e.code === "KeyP" || e.code === "Escape") { setPaused(!paused); return; }
  if (paused) return;
  if (e.code === "Enter" || (e.code === "Space" && !playing)) {
    e.preventDefault();
    if (sim.o.phase === "splash") requestStart();
    else if (sim.o.phase === "gameOver") restart();
    return;
  }
  if (queue.keyDown(e.code, false, playing)) e.preventDefault();
});
addEventListener("keyup", (e) => {
  if (!queue.keyUp(e.code)) return;
  // A focused button would fire its Space click on keyup.
  if (sim.o.phase === "playing" && !howtoOpen) e.preventDefault();
});

/* ------------------------------------------------------------------ pause, settings, restart */

function setPaused(on: boolean): void {
  if (on && sim.o.phase !== "playing") on = false;
  paused = on;
  $("pause-screen").classList.toggle("hidden", !paused);
  if (paused) dropInput();
  if (paused || document.hidden) void sound.suspend();
  else void sound.resume();
  loop.resetAccumulator();
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    dropInput();
    if (!config.manual && !pilot) setPaused(true);
    void sound.suspend();
  } else if (!paused) void sound.resume();
});
$("btn-resume").addEventListener("click", () => { setPaused(false); releaseFocus(); });

/* ------------------------------------------------------------------ how to play */

const HOWTO_KEY = "splatSiblings.beat-hopper.howtoSeen";
/** Start the run once the dialog closes (the first-Play path), instead of returning to the screen it opened from. */
let startAfterHowto = false;
let howtoReturnFocus: HTMLElement | null = null;
function openHowto(thenStart: boolean): void {
  if (howtoOpen) return;
  howtoOpen = true;
  startAfterHowto = thenStart;
  dropInput();
  queue.start(false);
  howtoReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  $("btn-howto-close").textContent = thenStart ? "GOT IT \u2014 PLAY" : "GOT IT";
  $("howto-screen").classList.remove("hidden");
  $("howto-card").scrollTop = 0;
  $("btn-howto-close").focus({ preventScroll: true });
}
function closeHowto(): void {
  if (!howtoOpen) return;
  howtoOpen = false;
  store.set(HOWTO_KEY, "1");
  $("howto-screen").classList.add("hidden");
  loop.resetAccumulator();
  if (startAfterHowto && sim.o.phase === "splash") {
    queue.start();
    releaseFocus();
  } else if (sim.o.phase === "splash") {
    howtoReturnFocus?.focus?.({ preventScroll: true });
  } else {
    // Back to a run (paused): keep focus off the buttons so Space hops instead of clicking one.
    releaseFocus();
  }
  startAfterHowto = false;
  howtoReturnFocus = null;
}
/** Every Play press goes through here: the first one ever shows How to play and starts the run when it closes. */
function requestStart(): void {
  if (store.get(HOWTO_KEY) !== "1" && !config.autostart) openHowto(true);
  else queue.start();
}
$("btn-howto-close").addEventListener("click", closeHowto);
$("btn-howto-splash").addEventListener("click", () => { if (!config.manual && !pilot) openHowto(false); });
$("btn-howto-pause").addEventListener("click", () => { if (paused) openHowto(false); });
$("btn-pause").addEventListener("click", () => { if (!config.manual && !pilot) setPaused(!paused); releaseFocus(); });

function restart(): void {
  sim.begin();
  rig.reset(sim);
  presenter.reset();
  prevFrame = null;
  lastPhase = "playing";
  phaseStart = 0;
  hud?.reset();
}
$("btn-start").addEventListener("click", () => {
  void sound.unlock();
  if (!ready || config.manual || pilot) return;
  requestStart();
});
$("btn-restart").addEventListener("click", () => {
  void sound.unlock();
  if (config.manual || pilot) return;
  restart();
});

const muteButton = $("btn-mute");
const paintMute = (): void => {
  muteButton.textContent = sound.muted ? "SOUND OFF" : "SOUND ON";
  muteButton.setAttribute("aria-pressed", String(!sound.muted));
  $<HTMLInputElement>("toggle-sound").checked = !sound.muted;
};
const toggleMute = (): void => {
  sound.setMuted(!sound.muted);
  store.set("splatSiblings.beat-hopper.mute", sound.muted ? "1" : "0");
  paintMute();
};
muteButton.addEventListener("click", () => { toggleMute(); if (sim.o.phase === "playing") releaseFocus(); });
$("toggle-sound").addEventListener("change", (e) => {
  const on = (e.target as HTMLInputElement).checked;
  if (on === sound.muted) toggleMute();
});
paintMute();

const motionToggle = $<HTMLInputElement>("toggle-motion");
motionToggle.checked = reducedMotion;
motionToggle.addEventListener("change", () => {
  reducedMotion = motionToggle.checked;
  store.set("splatSiblings.beat-hopper.motion", reducedMotion ? "reduced" : "full");
  render();
});

/* ------------------------------------------------------------------ QA hooks */

function snapshotState() {
  const o = sim.o;
  return {
    ...o, steps, obstacles: o.obstacles.filter((s) => s.active).map((s) => ({ ...s })),
    orbSlots: o.orbSlots.filter((s) => s.active).map((s) => ({ ...s })),
    plans: o.plans.map((p) => ({ index: p.index, cells: p.cells.map((c) => (c ? { ...c } : null)), orbs: p.orbs.slice() }))
  };
}

const qa = installQaHooks("beat-hopper", {
  ready: () => ready,
  seed: config.seed,
  state: snapshotState,
  traceRow: () => sim.traceRow(steps),
  traceColumns: TRACE_COLUMNS,
  app: () => app,
  routeHealth: () => (app ? createAuraRouteHealthSnapshot(app, { parityIds: [] }) : null),
  nodeCount: () => runtime?.nodeCount ?? 0,
  begin() {
    advance({ ...IDLE, start: true });
    render();
    hud?.update(sim, best, config.manual);
    reactToFrame();
  },
  stepFrames(n: number, input?: Partial<Input>) {
    for (let i = 0; i < n; i++) advance(i === 0 ? { ...IDLE, ...input } : IDLE);
    render();
    hud?.update(sim, best, config.manual);
    reactToFrame();
  },
  replay(inputs: string | readonly Partial<Input>[], warmup = config.warmup, seed = config.seed) {
    const list = typeof inputs === "string" ? (JSON.parse(inputs) as Partial<Input>[]) : inputs;
    return replay(seed, warmup, list.map((i) => ({ ...IDLE, ...i }))).trace;
  },
  reset(seed = config.seed) {
    sim = new BeatHopperSim(seed);
    rig.reset(sim);
    presenter.reset();
    steps = 0;
    prevFrame = null;
    lastPhase = "splash";
    phaseStart = 0;
    pilot = config.autopilot ? new Autopilot() : null;
    hud?.reset();
    render();
    hud?.update(sim, best, config.manual);
    reactToFrame();
  },
  extras: {
    get booted(): boolean {
      return ready;
    },
    /** Drive n steps with the closed-loop rhythm pilot; returns the final state incl. perfect/good/miss counts. */
    runAutopilot(n: number, mistakeObstacles: number[] = []) {
      const driver = new Autopilot({ mistakeObstacles });
      for (let i = 0; i < n; i++) {
        advance(driver.next(sim, i));
        driver.observe(sim);
      }
      render();
      hud?.update(sim, best, config.manual);
      reactToFrame();
      return snapshotState();
    },
    /** Headless deterministic replay on a fresh sim: returns the trace rows. */
    replay(inputs: Partial<Input>[], warmup = config.warmup, seed = config.seed) {
      return replay(seed, warmup, inputs.map((i) => ({ ...IDLE, ...i }))).trace;
    },
    /** The live run's trace row (for scripted-replay equality checks). */
    liveTraceRow() {
      return sim.traceRow(steps);
    },
    autopilot(on: boolean) {
      pilot = on ? new Autopilot() : null;
      steps = 0;
    },
    restart() {
      restart();
      render();
      hud?.update(sim, best, config.manual);
      reactToFrame();
      return snapshotState();
    },
    presentation() {
      return { popupsShown: hud?.popupsShown ?? 0, uploadedVertices: runtime?.uploadedVertices ?? 0, pixelRatio, paused, reducedMotion, warm: warmResult, beatsScheduled: sound.beatsScheduled };
    },
    setting(which: "motion", on: boolean) {
      reducedMotion = on;
      motionToggle.checked = on;
      render();
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
  qa.reportError(error);
  const card = document.getElementById("render-error");
  if (card) {
    card.classList.remove("hidden");
    card.textContent = `Beat Hopper could not start: ${error instanceof Error ? error.message : String(error)}. WebGL2 is required.`;
  }
  throw error;
});