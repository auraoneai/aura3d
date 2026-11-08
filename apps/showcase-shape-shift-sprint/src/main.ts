/**
 * Shape Shift Sprint boot: loading bar -> buildWorld -> createAuraApp (production options + lab flags)
 * -> bind -> warmPrograms -> createFixedStepLoop. Pointer/keyboard steering, pause on hidden tab,
 * adaptive DPR, QA hooks at window.__AURA_SHAPE_SHIFT__ and the route-health snapshot.
 *
 * Query params: seed, manual, autostart, autopilot, warmup, dpr, motion=reduced|full, symbols.
 * Settings persist under splatSiblings.shape-shift-sprint.{best,mute,motion,symbols,howtoSeen} (guarded).
 * The How to play panel opens on the first PLAY (howtoSeen) and from the splash and pause screens.
 */
import { createAuraApp, createAuraRouteHealthSnapshot, createFixedStepLoop, installQaHooks, readQaParams, type AuraApp } from "@aura3d/engine";
import { warmPrograms } from "@aura3d/engine/game";
import { createLoadingProgress } from "../../../examples/shared/loading-progress";
import { labAppOptions, readLabFlags } from "../../../examples/shared/lab-flags";
import { CONFIG, IDLE, PHASE_CODE, ShapeShiftSim, TRACE_COLUMNS, replay, type Input } from "./sim";
import { Autopilot } from "./autopilot";
import { createShapeSound, diffSounds, type FrameState } from "./audio";
import { Fx } from "./fx";
import { Hud } from "./hud";
import { createHowTo } from "./howto";
import { LOOK } from "./look";
import { ChaseCamera, createShapePresenter, shownOf, viewOf } from "./presentation";
import { buildWorld, type PostMode, type WorldRuntime } from "./world";

/* GT Walsheim Bold: the admitted same-origin copy (public/aura-assets; provenance in PROVENANCE.md). */
if (typeof FontFace !== "undefined" && typeof document !== "undefined") {
  const face = new FontFace("Shape Display", `url(${new URL("../public/aura-assets/GT-Walsheim-Bold.woff2", import.meta.url).href})`, { weight: "700", display: "block" });
  void face.load().then((f) => document.fonts.add(f)).catch(() => undefined);
}

const config = readQaParams({
  seed: { type: "number", default: 20261101 },
  manual: { type: "flag" },
  autostart: { type: "flag" },
  autopilot: { type: "flag" },
  warmup: { type: "number", default: 30 },
  dpr: { type: "number", default: 0 },
  motion: { type: "string", default: "" },
  symbols: { type: "flag" },
  post: { type: "string", default: "" }
});

const postMode = (v: string): PostMode => (v === "0" || v === "off" ? "off" : v === "full" || v === "bloom" ? v : "lite");

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`shape-shift-sprint: #${id} is missing`);
  return node as T;
};
const canvas = $<HTMLCanvasElement>("app");

let sim = new ShapeShiftSim(config.seed);
const rig = new ChaseCamera();
const presenter = createShapePresenter(() => shownOf(sim, rig.cur));
let app: AuraApp | undefined;
let runtime: WorldRuntime | undefined;
let ready = false;
let steps = 0;
let pilot: Autopilot | null = config.autopilot ? new Autopilot() : null;
let renderFailed = false;
const pending: Input = { ...IDLE };
let perfectNow = false;
const runStats = { maxCombo: 0 };

/* presentation state (never read by the sim) */
const sound = createShapeSound();
let fx: Fx | undefined;
let prevFrame: FrameState | null = null;
let lastPhase = "splash";
let keyDir = 0;
let keyDragging = false;
const store = {
  get(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string): void { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } }
};
const KEY_BEST = "splatSiblings.shape-shift-sprint.best";
const KEY_MUTE = "splatSiblings.shape-shift-sprint.mute";
const KEY_MOTION = "splatSiblings.shape-shift-sprint.motion";
const KEY_SYMBOLS = "splatSiblings.shape-shift-sprint.symbols";
const KEY_HOWTO = "splatSiblings.shape-shift-sprint.howtoSeen";
let best = Number(store.get(KEY_BEST)) || 0;
sound.setMuted(store.get(KEY_MUTE) === "1");
const prefersReduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const storedMotion = config.motion || store.get(KEY_MOTION);
let reducedMotion = storedMotion === "reduced" ? true : storedMotion === "full" ? false : prefersReduced;
let symbols = config.symbols || store.get(KEY_SYMBOLS) === "1";
let paused = false;
const hud = new Hud();
/* How to play: closing it marks it seen; when it was opened by PLAY, closing starts the run. */
const howto = createHowTo({
  onClose(play) {
    store.set(KEY_HOWTO, "1");
    if (play && ready && sim.o.phase === "splash") pending.start = true;
  }
});
for (const node of document.querySelectorAll<HTMLButtonElement>("[data-howto-open]")) {
  node.addEventListener("click", () => { if (!config.manual && !pilot) howto.open(false); });
}

/* ------------------------------------------------------------------ frame */

function advance(input: Input): void {
  const seqBefore = sim.popupSeq;
  sim.advance(input);
  perfectNow = false;
  if (sim.popupSeq !== seqBefore) {
    for (const p of sim.popups) if (p.seq >= seqBefore && p.text.startsWith("PERFECT")) perfectNow = true;
  }
  if (sim.o.combo > runStats.maxCombo) runStats.maxCombo = sim.o.combo;
  rig.step(sim);
  pilot?.observe(sim);
  steps++;
}

function render(live = false): void {
  if (!app || !runtime || renderFailed) return;
  try {
    const shown = live ? presenter.present(loop, true) : undefined;
    const viewSim = shown ? viewOf(sim, shown) : sim;
    runtime.update(viewSim, canvas.clientWidth / Math.max(1, canvas.clientHeight), {
      ...(shown ? { shown } : {}), reducedMotion
    });
    app.step(0);
  } catch (error) {
    renderFailed = true;
    qa.reportError(error);
    throw error;
  }
}

const loop = createFixedStepLoop({
  manual: config.manual,
  isActive: () => ready && !paused,
  step() {
    if (keyDir !== 0 && sim.o.phase === "playing") {
      if (!keyDragging) { pending.down = true; keyDragging = true; }
      pending.dx += keyDir * 0.2;
    }
    const input: Input = pilot ? pilot.next(sim, steps) : { ...pending };
    pending.start = pending.down = pending.up = pending.tap = false;
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

/* ------------------------------------------------------------------ HUD, audio, screen effects, results */

function updateHud(): void {
  const o = sim.o;
  hud.update(o, best, sim.popups);
  if (o.phase !== lastPhase) {
    $("splash-screen").classList.toggle("hidden", o.phase !== "splash");
    $("gameover-screen").classList.toggle("hidden", o.phase !== "gameOver");
    if (o.phase === "splash" || o.phase === "playing") fx?.clearReveal();
    if (o.phase === "gameOver") showResults(o.score);
    sound.setIntensity(o.phase === "playing" || o.phase === "bursting" ? "play" : o.phase === "gameOver" ? "over" : "title");
    lastPhase = o.phase;
  }
  const splashBest = document.getElementById("splash-best");
  if (splashBest) splashBest.textContent = best > 0 ? `Best: ${best.toLocaleString()}` : "";
  reactToFrame();
}

function reactToFrame(): void {
  const o = sim.o;
  fx ??= new Fx();
  const frame: FrameState = {
    phase: o.phase, lives: o.lives, combo: o.combo, score: o.score, shapeIndex: o.shapeIndex,
    shieldActive: o.shieldActive, wildcardTimer: o.wildcardTimer, scoreX2Timer: o.scoreX2Timer,
    milestone: o.milestone, perfect: perfectNow
  };
  const own = LOOK.shapes[o.shapeIndex] as string;
  for (const event of diffSounds(prevFrame, frame)) {
    sound.play(event.sound, event.level);
    if (!config.manual) fx.cue(event.sound, own, reducedMotion);
  }
  prevFrame = frame;
  if (!config.manual) fx.vignette(o.multiplier, o.wildcardTimer > 0, sim.elapsed, reducedMotion);
}

function showResults(score: number): void {
  const final = Math.floor(score);
  const isBest = final > best;
  if (isBest) { best = final; store.set(KEY_BEST, String(best)); }
  const out = $("final-score");
  $("final-stats").textContent =
    `Best combo ${runStats.maxCombo} · Perfects ${sim.o.perfects} · ${Math.floor(sim.o.distance).toLocaleString()} m`;
  const paint = (shown: number, done: boolean): void => {
    out.innerHTML = `Score: ${shown.toLocaleString()}` +
      (done ? `<br><span class="go-best">${isBest ? `NEW BEST! ${best.toLocaleString()}` : `Best: ${best.toLocaleString()}`}</span>` : "");
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
  const startButton = document.getElementById("btn-start");
  const loading = createLoadingProgress({ element: document.getElementById("load-bar") ?? undefined });
  startButton?.setAttribute("aria-busy", "true");
  loading.set(0.1);
  const world = buildWorld({ sim, aspect: canvas.clientWidth / Math.max(1, canvas.clientHeight), post: postMode(config.post) });
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
  startButton?.removeAttribute("aria-busy");
  if (config.autostart) {
    for (let i = 0; i < config.warmup; i++) advance(IDLE);
    steps = 0;
    if (!pilot) pilot = new Autopilot();
  }
  render();
  updateHud();
}

/* ------------------------------------------------------------------ pointer input */

let lastX = 0;
let dragging = false;
const DRAG_GAIN = 0.02; // px -> lane units (a 230 px drag crosses the whole 6-unit lane)
addEventListener("pointerdown", (e) => {
  void sound.unlock();
  if (config.manual || pilot) return;
  const target = e.target as HTMLElement | null;
  if (target?.closest?.(".no-steer")) return;
  if (sim.o.phase === "gameOver" && target?.id !== "btn-restart") return;
  if (paused || howto.isOpen) return;
  if (sim.o.phase === "splash") startRun();
  else pending.down = true;
  dragging = true;
  lastX = e.clientX;
  if (!target?.closest?.("button")) {
    try { canvas.setPointerCapture?.(e.pointerId); } catch { /* the pointer is already gone */ }
  }
});
addEventListener("pointermove", (e) => {
  if (config.manual || pilot || !dragging) return;
  pending.dx += (e.clientX - lastX) * DRAG_GAIN;
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

/* ------------------------------------------------------------------ pause and hidden tab */

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
  }
  if (paused || document.hidden) void sound.suspend();
  else void sound.resume();
});
$("btn-resume").addEventListener("click", () => setPaused(false));
$("btn-pause").addEventListener("click", () => { if (!config.manual && !pilot) setPaused(!paused); });

/* ------------------------------------------------------------------ settings */

function paintSettings(): void {
  for (const node of document.querySelectorAll<HTMLButtonElement>("[data-setting]")) {
    const on = node.dataset.setting === "symbols" ? symbols : reducedMotion;
    node.setAttribute("aria-pressed", String(on));
    node.textContent = node.dataset.setting === "symbols" ? `Shape symbols: ${on ? "on" : "off"}` : `Reduced motion: ${on ? "on" : "off"}`;
  }
  document.body.classList.toggle("symbols-on", symbols);
}
function toggleSetting(which: string): void {
  if (which === "symbols") { symbols = !symbols; store.set(KEY_SYMBOLS, symbols ? "1" : "0"); }
  else { reducedMotion = !reducedMotion; store.set(KEY_MOTION, reducedMotion ? "reduced" : "full"); }
  paintSettings();
  render();
}
for (const node of document.querySelectorAll<HTMLButtonElement>("[data-setting]")) node.addEventListener("click", () => toggleSetting(node.dataset.setting ?? ""));
paintSettings();

/* ------------------------------------------------------------------ start / restart / mute */

function startRun(): void {
  if (!ready || howto.isOpen) return;
  // First PLAY ever: show the rules first; the panel's GOT IT button starts the run.
  if (!config.manual && !pilot && store.get(KEY_HOWTO) !== "1") { howto.open(true); return; }
  pending.start = true;
}

function restart(): void {
  sim.begin();
  runStats.maxCombo = 0;
  rig.reset();
  presenter.reset();
  hud.resetColumn();
  prevFrame = null;
  lastPhase = "playing";
  fx?.clearReveal();
  $("splash-screen").classList.add("hidden");
  $("gameover-screen").classList.add("hidden");
}

$("btn-start").addEventListener("click", () => { void sound.unlock(); startRun(); });
$("btn-restart").addEventListener("click", () => {
  if (config.manual || pilot) return;
  void sound.unlock();
  restart();
});
const muteButton = $("btn-mute");
const paintMute = (): void => {
  muteButton.textContent = sound.muted ? "\u{1F507}" : "\u{1F50A}";
  muteButton.setAttribute("aria-pressed", String(sound.muted));
};
const toggleMute = (): void => { sound.setMuted(!sound.muted); store.set(KEY_MUTE, sound.muted ? "1" : "0"); paintMute(); };
muteButton.addEventListener("click", toggleMute);
paintMute();

/* keyboard: Space/Enter start and restart, arrows or A/D steer, M mute, C symbols, P/Esc pause */
const KEY_DIR: Record<string, number> = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };
const held = new Set<string>();
addEventListener("keydown", (e) => {
  void sound.unlock();
  if (config.manual || pilot || e.repeat) return;
  if (e.code === "KeyM") { toggleMute(); return; }
  if (e.code === "KeyC") { toggleSetting("symbols"); return; }
  if (e.code === "KeyP" || e.code === "Escape") { setPaused(!paused); return; }
  if (paused) return;
  if (e.code === "Space" || e.code === "Enter") {
    e.preventDefault();
    if (sim.o.phase === "splash") startRun();
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

/* ------------------------------------------------------------------ QA hooks */

function snapshotState() {
  const o = sim.o;
  return {
    ...o, phaseCode: PHASE_CODE[o.phase], steps, rngCount: sim.rng.count,
    walls: sim.rows.length * 3, tokens: sim.tokens.length, segments: sim.segments.length,
    player: { ...sim.player }, ye: sim.ye
  };
}

/** QA replay script: a JSON array of partial inputs ({} = idle) or an array; the first step usually {start:true}. */
function parseScript(text: string | readonly Partial<Input>[]): Input[] {
  if (typeof text !== "string") {
    if (!Array.isArray(text)) throw new Error("shape-shift-sprint: replay script must be a JSON array of inputs");
    return text.map((r) => ({ ...IDLE, ...r }));
  }
  if (text.trim() === "") return [{ ...IDLE, start: true }];
  const raw = JSON.parse(text) as Partial<Input>[];
  if (!Array.isArray(raw)) throw new Error("shape-shift-sprint: replay script must be a JSON array of inputs");
  return raw.map((r) => ({ ...IDLE, ...r }));
}

const qa = installQaHooks("shape-shift", {
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
  },
  replay(text: string | readonly Partial<Input>[], warmup = config.warmup, seed = config.seed) {
    return replay(seed, warmup, parseScript(text)).trace;
  },
  reset(seed = config.seed) {
    sim = new ShapeShiftSim(seed);
    runStats.maxCombo = 0;
    rig.reset();
    presenter.reset();
    hud.resetColumn();
    steps = 0;
    prevFrame = null;
    lastPhase = "splash";
    pilot = config.autopilot ? new Autopilot() : null;
    render();
    updateHud();
  },
  extras: {
    /** Plain-value readiness for page-load pollers. */
    get booted(): boolean {
      return ready;
    },
    /** Drive n steps with the closed-loop autopilot, rendering once at the end. */
    runAutopilot(n: number, mistakeRows: number[] = []) {
      const driver = new Autopilot({ maxDx: 14, mistakeRows });
      for (let i = 0; i < n; i++) {
        advance(driver.next(sim, i));
        driver.observe(sim);
      }
      render();
      updateHud();
      return snapshotState();
    },
    /** Start or stop the live autopilot (like ?autopilot=1). */
    autopilot(on: boolean) {
      pilot = on ? new Autopilot() : null;
      steps = 0;
    },
    /** Restart exactly like PLAY AGAIN (C4). */
    restart() {
      restart();
      render();
      updateHud();
      return snapshotState();
    },
    /** Presentation counters for tests. */
    presentation() {
      return {
        popupSeq: sim.popupSeq, uploadedVertices: runtime?.uploadedVertices ?? 0,
        pixelRatio, paused, reducedMotion, symbols, warm: warmResult, howtoOpen: howto.isOpen
      };
    },
    /** Change a setting without the UI (captures). */
    setting(which: "symbols" | "motion", on: boolean) {
      if (which === "symbols") symbols = on;
      else reducedMotion = on;
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

loop.start();
boot().catch((error) => {
  qa.reportError(error);
  const card = document.getElementById("render-error");
  if (card) card.style.display = "flex";
  throw error;
});