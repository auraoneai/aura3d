/**
 * Polarity Orbs boot: loading bar → buildWorld → createAuraApp → bind → warm → fixed-step loop.
 * Splat shell pattern: drag steering with tap-to-flip discrimination (pointer up with |dx| < 8 px, or Space/Enter),
 * pause on P/Esc/hidden tab, adaptive DPR, QA hooks (`window.__AURA_POLARITY_ORBS__`), route-health snapshot and
 * localStorage best/mute/motion under `splatSiblings.polarity-orbs.*` (guarded).
 *
 * Query parameters: `seed=N`, `manual=1`, `autostart=1`, `autopilot=1`, `warmup=N`, `dpr=N`, `motion=reduced|full`.
 */
import { createAuraApp, createAuraRouteHealthSnapshot, createFixedStepLoop, installQaHooks, readQaParams, type AuraApp } from "@aura3d/engine";
import { warmPrograms } from "@aura3d/engine/game";
import { drainPopups } from "../../../examples/shared/runner-kit/index";
import { createLoadingProgress } from "../../../examples/shared/loading-progress";
import { labAppOptions, readLabFlags } from "../../../examples/shared/lab-flags";
import { CONFIG, IDLE, PolarityOrbsSim, TRACE_COLUMNS, replay, type Input, type Phase } from "./sim";
import { CameraRig, createPolarityPresenter, viewOf } from "./presentation";
import { buildWorld, type WorldRuntime } from "./world";
import { LOOK } from "./look";
import { Hud } from "./hud";
import { ScreenFx, flashFor, flashStrength } from "./fx";
import { createPolaritySound, diffSounds, frameStateOf, type FrameState } from "./audio";
import { Autopilot } from "./autopilot";

const config = readQaParams({
  seed: { type: "number", default: 20261124 },
  manual: { type: "flag" },
  autostart: { type: "flag" },
  autopilot: { type: "flag" },
  warmup: { type: "number", default: 30 },
  dpr: { type: "number", default: 0 },
  motion: { type: "string", default: "" }
});

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`polarity-orbs: #${id} is missing`);
  return el as T;
};
const canvas = $<HTMLCanvasElement>("app");
/** A pointer that travels less than this many CSS pixels between down and up is a tap (PRD §3.5). */
const TAP_SLOP = 8;

let sim = new PolarityOrbsSim(config.seed);
let rig = new CameraRig(sim);
const presenter = createPolarityPresenter(() => sim, rig);
let app: AuraApp | undefined;
let runtime: WorldRuntime | undefined;
let ready = false;
let steps = 0;
let pilot: Autopilot | null = config.autopilot ? new Autopilot() : null;
let renderFailed = false;
const pending: Input = { ...IDLE };
let nextPopupSeq = 0;
let popupsShown = 0;

const sound = createPolaritySound();
let fx: ScreenFx | undefined;
let prevFrame: FrameState | null = null;
let lastPhase: Phase = "splash";
let keyDir = 0;
let keyDragging = false;
let paused = false;
let symbols = false;

const store = {
  get(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string): void { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } }
};
const KEY_BEST = "splatSiblings.polarity-orbs.best";
const KEY_MUTE = "splatSiblings.polarity-orbs.mute";
const KEY_MOTION = "splatSiblings.polarity-orbs.motion";
let best = Number(store.get(KEY_BEST)) || 0;
sound.setMuted(store.get(KEY_MUTE) === "1");
const prefersReduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const storedMotion = config.motion || store.get(KEY_MOTION);
let reducedMotion = storedMotion === "reduced" ? true : storedMotion === "full" ? false : prefersReduced;
rig.steady = reducedMotion;

const hud = new Hud();
document.body.classList.toggle("reduced-motion", reducedMotion);

/* ------------------------------------------------------------------ results */

function showResults(): void {
  const o = sim.o;
  const final = Math.floor(o.score);
  const isBest = final > best;
  if (isBest) { best = final; store.set(KEY_BEST, String(best)); }
  $("stat-best").textContent = best.toLocaleString();
  $("stat-combo").textContent = String(o.bestCombo);
  $("stat-orbs").textContent = String(o.orbsCollected);
  $("stat-distance").textContent = `${Math.floor(o.distance).toLocaleString()} m`;
  $("splash-best").textContent = `BEST ${best.toLocaleString()}`;
  const out = $("final-score");
  const paint = (shown: number, done: boolean): void => {
    out.textContent = shown.toLocaleString();
    if (done && isBest) out.dataset.best = "new";
  };
  if (config.manual) { paint(final, true); return; }
  const startedAt = performance.now();
  const step = (): void => {
    const t = Math.min(1, (performance.now() - startedAt) / 800);
    paint(Math.floor(final * (1 - Math.pow(1 - t, 3))), t >= 1);
    if (t < 1 && sim.o.phase === "gameOver") requestAnimationFrame(step);
  };
  step();
}

/* ------------------------------------------------------------------ HUD + reactions */

function updateHud(): void {
  const o = sim.o;
  hud.update(o, best);
  if (o.phase !== lastPhase) {
    if (o.phase === "gameOver") showResults();
    if (o.phase === "splash" || o.phase === "playing") fx?.clearReveal();
    if (o.phase !== "playing") $("popups").replaceChildren();
    sound.setIntensity(o.phase === "playing" || o.phase === "bursting" ? "play" : o.phase === "gameOver" ? "over" : "title");
    lastPhase = o.phase;
  }
  const drained = drainPopups(sim.popups, nextPopupSeq);
  nextPopupSeq = drained.nextSeq;
  for (const p of drained.fresh) {
    popupsShown++;
    const el = document.createElement("div");
    el.className = p.size >= 1.2 ? "popup big" : "popup";
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
  const frame = frameStateOf(o);
  const events = diffSounds(prevFrame, frame);
  for (const event of events) {
    sound.play(event.sound, event.level);
    if (config.manual) continue;
    const flash = flashFor(event.sound, o.polarity);
    if (flash) fx.flash(flash.color, flashStrength(flash.strength, reducedMotion));
    if (event.sound === "burst") fx.reveal(o.polarity === 1 ? LOOK.red : LOOK.blue, reducedMotion);
  }
  prevFrame = frame;
  fx.vignette(o.mult, o.rainbowTimer > 0, o.polarity === 1 ? LOOK.red : LOOK.blue, o.tick / 60, reducedMotion);
}

/* ------------------------------------------------------------------ frame */

function render(live = false): void {
  if (!app || !runtime || renderFailed) return;
  try {
    const shown = live ? presenter.present(loop, true) : undefined;
    const viewSim = shown ? viewOf(sim, shown) : sim;
    runtime.update(viewSim, canvas.clientWidth / Math.max(1, canvas.clientHeight), {
      ...(shown ? { shown } : {}),
      camera: rig.at(live ? loop.alpha : 1),
      reducedMotion,
      symbols
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
  isActive: () => ready && !paused,
  step() {
    if (keyDir !== 0 && sim.o.phase === "playing") {
      if (!keyDragging) { pending.down = true; keyDragging = true; }
      pending.dx += keyDir * 12;
    }
    const input: Input = pilot ? pilot.next(sim, steps) : { ...pending };
    pending.start = pending.down = pending.up = false;
    pending.dx = 0;
    pending.tap = false;
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
  runtime.update(sim, canvas.clientWidth / Math.max(1, canvas.clientHeight), { camera: rig.at(1), reducedMotion, symbols: true });
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
  $("load-label").textContent = "Ready";
  startButton.disabled = false;
  startButton.textContent = "PLAY NOW";
  startButton.removeAttribute("aria-busy");
  $("splash-best").textContent = `BEST ${best.toLocaleString()}`;
  if (config.autostart) {
    for (let i = 0; i < config.warmup; i++) advance(IDLE);
    steps = 0;
    if (!pilot) pilot = new Autopilot();
  }
  render();
  updateHud();
}

/* ------------------------------------------------------------------ pointer input (tap vs drag) */

let lastX = 0;
let downX = 0;
let travel = 0;
let dragging = false;
/** True between pointerdown and pointerup on the canvas: released under the slop it becomes a polarity flip. */
let tapCandidate = false;
addEventListener("pointerdown", (e) => {
  void sound.unlock();
  if (config.manual || pilot) return;
  const target = e.target as HTMLElement | null;
  if (target?.closest?.(".no-steer")) return;
  if (sim.o.phase === "gameOver" && target?.id !== "btn-restart") return;
  if (paused) return;
  if (sim.o.phase === "splash") pending.start = true;
  else pending.down = true;
  dragging = true;
  lastX = e.clientX;
  downX = e.clientX;
  travel = 0;
  tapCandidate = sim.o.phase === "playing" && !target?.closest?.("button");
  if (!target?.closest?.("button")) {
    try { canvas.setPointerCapture?.(e.pointerId); } catch { /* the pointer is already gone */ }
  }
});
addEventListener("pointermove", (e) => {
  if (config.manual || pilot || !dragging) return;
  const delta = e.clientX - lastX;
  pending.dx += delta;
  lastX = e.clientX;
  travel = Math.abs(e.clientX - downX);
});
const release = (): void => {
  if (config.manual || pilot) return;
  dragging = false;
  pending.up = true;
  if (tapCandidate && travel < TAP_SLOP && sim.o.phase === "playing") pending.tap = true;
  tapCandidate = false;
};
addEventListener("pointerup", release);
addEventListener("pointercancel", release);
canvas.addEventListener("lostpointercapture", () => { if (dragging) release(); });

function dropInput(): void {
  held.clear();
  keyDir = 0;
  tapCandidate = false;
  if (keyDragging || dragging) pending.up = true;
  keyDragging = false;
  dragging = false;
}
addEventListener("blur", dropInput);

/* ------------------------------------------------------------------ pause + hidden tab */

function setPaused(on: boolean): void {
  if (on && sim.o.phase !== "playing") on = false;
  paused = on;
  $("pause-screen").classList.toggle("visible", paused);
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

const motionToggle = $<HTMLInputElement>("toggle-motion");
const symbolToggle = $<HTMLInputElement>("toggle-symbols");
function paintSettings(): void {
  motionToggle.checked = reducedMotion;
  symbolToggle.checked = symbols;
  document.body.classList.toggle("reduced-motion", reducedMotion);
  rig.steady = reducedMotion;
}
motionToggle.addEventListener("change", () => {
  reducedMotion = motionToggle.checked;
  store.set(KEY_MOTION, reducedMotion ? "reduced" : "full");
  paintSettings();
  render();
});
symbolToggle.addEventListener("change", () => {
  symbols = symbolToggle.checked;
  paintSettings();
  render();
});
paintSettings();

const muteButton = $<HTMLButtonElement>("btn-mute");
const paintMute = (): void => { muteButton.setAttribute("aria-pressed", String(sound.muted)); muteButton.textContent = sound.muted ? "\u{1F507}" : "♪"; };
const toggleMute = (): void => { sound.setMuted(!sound.muted); store.set(KEY_MUTE, sound.muted ? "1" : "0"); paintMute(); };
muteButton.addEventListener("click", toggleMute);
paintMute();

function restart(): void {
  sim.begin();
  presenter.reset();
  rig.reset(sim);
  hud.resetCache();
  prevFrame = null;
  // Leave lastPhase at "gameOver" so updateHud sees the phase change: it clears the burst reveal and
  // returns the music to "play" (setting it to "playing" here left the reveal over the scene after restart).
  fx?.clearReveal();
  $("splash-screen").classList.remove("visible");
  $("gameover-screen").classList.remove("visible");
  $("hud").classList.add("visible");
}

$("btn-start").addEventListener("click", () => {
  void sound.unlock();
  if (config.manual || pilot || !ready) return;
  pending.start = true;
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
  if (config.manual || pilot || e.repeat) return;
  if (e.code === "KeyM") { toggleMute(); return; }
  if (e.code === "KeyP" || e.code === "Escape") { setPaused(!paused); return; }
  if (paused) return;
  if (e.code === "Space" || e.code === "Enter") {
    e.preventDefault();
    if (sim.o.phase === "splash" && ready) pending.start = true;
    else if (sim.o.phase === "playing") pending.tap = true;
    else if (sim.o.phase === "gameOver") restart();
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

/* ------------------------------------------------------------------ capture scripts */

/**
 * Capture-script DSL for `replay`: comma-separated `frame:flags` tokens where flags are
 * `start`/`s`, `down`/`d`, `up`/`u`, `tap`/`t` and `dx=<number>` (CSS px), e.g. `0:start, 24:d+dx=-60, 40:u`.
 * Frames without a token are idle. Deliberately tiny so specs can hand-write scripts.
 */
export function parseScript(text: string): Input[] {
  const frames: Input[] = [];
  for (const raw of text.split(",")) {
    const token = raw.trim();
    if (!token) continue;
    const split = token.indexOf(":");
    if (split < 0) throw new Error(`polarity-orbs: script token "${token}" needs frame:flags`);
    const frame = Number(token.slice(0, split));
    if (!Number.isInteger(frame) || frame < 0) throw new Error(`polarity-orbs: bad frame in "${token}"`);
    while (frames.length <= frame) frames.push({ ...IDLE });
    const input = frames[frame] as Input;
    for (const flag of token.slice(split + 1).split("+")) {
      const f = flag.trim();
      if (f === "start" || f === "s") input.start = true;
      else if (f === "down" || f === "d") input.down = true;
      else if (f === "up" || f === "u") input.up = true;
      else if (f === "tap" || f === "t") input.tap = true;
      else if (f.startsWith("dx=")) input.dx = Number(f.slice(3)) || 0;
      else if (f) throw new Error(`polarity-orbs: unknown flag "${f}" in "${token}"`);
    }
  }
  return frames;
}

/* ------------------------------------------------------------------ QA hooks */

function snapshotState() {
  const o = sim.o;
  let activeOrbs = 0;
  let activePowerups = 0;
  for (const orb of sim.orbs) if (orb.active) activeOrbs++;
  for (const p of sim.powerups) if (p.active) activePowerups++;
  return {
    ...o, steps, rngCount: sim.o.rngCount, best, ye: sim.ye,
    orbs: activeOrbs, powerups: activePowerups, particles: sim.particles.filter((p) => p.active).length,
    rows: sim.rows.length
  };
}

const qa = installQaHooks("polarity-orbs", {
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
    updateHud();
  },
  stepFrames(n: number, input?: Partial<Input>) {
    for (let i = 0; i < n; i++) advance(i === 0 ? { ...IDLE, ...input } : IDLE);
    render();
    updateHud();
    return snapshotState();
  },
  /** Headless replay of a capture script on a fresh sim (no rendering): returns the trace rows. */
  replay(script: string | readonly Partial<Input>[], warmup = config.warmup, seed = config.seed) {
    let inputs: Input[];
    if (typeof script === "string") {
      const trimmed = script.trim();
      if (trimmed.startsWith("[")) {
        const parsed = JSON.parse(trimmed) as Partial<Input>[];
        inputs = parsed.map((item) => ({ ...IDLE, ...item }));
      } else {
        inputs = parseScript(script);
      }
    } else {
      inputs = script.map((item) => ({ ...IDLE, ...item }));
    }
    return replay(seed, warmup, inputs).trace;
  },
  reset(seed = config.seed) {
    sim = new PolarityOrbsSim(seed);
    presenter.reset();
    rig.reset(sim);
    hud.resetCache();
    steps = 0;
    nextPopupSeq = 0;
    prevFrame = null;
    fx?.clearReveal();
    pilot = config.autopilot ? new Autopilot() : null;
    render();
    updateHud();
  },
  extras: {
    get booted(): boolean { return ready; },
    /** Drive n steps with the closed-loop autopilot; `mistakeRows` are the rows it refuses to flip on (death path). */
    runAutopilot(n: number, mistakeRows: number[] = []) {
      const driver = new Autopilot({ maxDx: 14, mistakeRows });
      for (let i = 0; i < n; i++) {
        advance(driver.next(sim, steps));
        driver.observe(sim);
      }
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
      return { popupsShown, nextPopupSeq, uploadedVertices: runtime?.uploadedVertices ?? 0, pixelRatio, paused, reducedMotion, symbols, warm: warmResult };
    },
    setting(which: "motion" | "symbols", on: boolean) {
      if (which === "motion") reducedMotion = on;
      else symbols = on;
      paintSettings();
      render();
      updateHud();
    },
    pause(on: boolean) {
      setPaused(on);
      return paused;
    }
  }
});

/* ------------------------------------------------------------------ error card + start */

function reportError(error: unknown): void {
  qa.reportError(error);
  const card = document.getElementById("render-error");
  if (card) card.classList.add("visible");
}

loop.start();
boot().catch((error) => {
  reportError(error);
});
