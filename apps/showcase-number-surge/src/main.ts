/**
 * Number Surge boot: loading bar → buildWorld → createAuraApp (production) → bind →
 * warmPrograms → createFixedStepLoop. Pointer/keyboard steering, pause/visibility,
 * adaptive DPR, QA hooks (`__AURA_NUMBER_SURGE__`), route health, localStorage
 * best/mute/motion. The sim is pure; everything here is presentation.
 *
 * Query params: seed=N, manual=1, autostart=1, autopilot=1, warmup=N, dpr=N,
 * motion=reduced|full.
 */
import { createAuraApp, createAuraRouteHealthSnapshot, createFixedStepLoop, installQaHooks, readQaParams, type AuraApp } from "@aura3d/engine";
import { warmPrograms } from "@aura3d/engine/game";
import { drainPopups } from "../../../examples/shared/runner-kit/index";
import { createLoadingProgress } from "../../../examples/shared/loading-progress";
import { labAppOptions, readLabFlags } from "../../../examples/shared/lab-flags";
import { CONFIG, IDLE, NumberSurgeSim, TRACE_COLUMNS, replay, type Input, type Phase } from "./sim";
import { ChaseCamera, SteadyCamera, createNumberSurgePresenter } from "./presentation";
import { buildWorld, type WorldRuntime } from "./world";
import { LOOK } from "./look";
import { NumberSurgeHud } from "./hud";
import { FxDriver, diffFx } from "./fx";
import { createNumberSurgeSound, diffSounds, type AudioFrame } from "./audio";
import { Autopilot } from "./autopilot";

const PHASE_CODE: Record<Phase, number> = { splash: 0, playing: 1, bursting: 2, gameOver: 3 };

const config = readQaParams({
  seed: { type: "number", default: 20261103 },
  manual: { type: "flag" },
  autostart: { type: "flag" },
  autopilot: { type: "flag" },
  warmup: { type: "number", default: 30 },
  dpr: { type: "number", default: 0 },
  motion: { type: "string", default: "" }
});

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`number-surge: #${id} is missing`);
  return el as T;
};
const canvas = $<HTMLCanvasElement>("app");

let sim = new NumberSurgeSim(config.seed);
let app: AuraApp | undefined;
let runtime: WorldRuntime | undefined;
let ready = false;
let steps = 0;
let renderFailed = false;
let pilot: Autopilot | null = config.autopilot ? new Autopilot() : null;
const pending: Input = { ...IDLE };
let nextPopupSeq = 0;
let popupsShown = 0;
let fovPunch = 0;

const chase = new ChaseCamera();
const steady = new SteadyCamera();
const presenter = createNumberSurgePresenter(() => sim, () => (reducedMotion ? steady.cur : chase.cur));

/** Presentation-only jitter (camera shake visuals): never the gameplay RNG stream. */
let jitterSeed = 0x9e3779b9;
const jitter = (): number => {
  jitterSeed = (jitterSeed * 1664525 + 1013904223) >>> 0;
  return jitterSeed / 4294967296;
};

const sound = createNumberSurgeSound();
let fx: FxDriver | undefined;
let prevAudio: AudioFrame | null = null;
let prevEvents: import("./sim").EventCounters | null = null;
let lastPhase: Phase = "splash";
let keyDir = 0;
let paused = false;
let warmResult: Awaited<ReturnType<typeof warmPrograms>> | null = null;

const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage unavailable */
    }
  }
};
let best = Number(store.get("splatSiblings.number-surge.best")) || 0;
let biggestSmash = Number(store.get("splatSiblings.number-surge.biggestSmash")) || 0;
sound.setMuted(store.get("splatSiblings.number-surge.mute") === "1");
const prefersReduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const storedMotion = config.motion || store.get("splatSiblings.number-surge.motion");
let reducedMotion = storedMotion === "reduced" ? true : storedMotion === "full" ? false : prefersReduced;

const hud = new NumberSurgeHud({
  hud: $("hud"),
  score: $("hud-score"),
  best: $("hud-best"),
  comboFill: $("combo-fill"),
  mult: $("hud-mult"),
  number: $("hud-number"),
  wall: $("hud-wall"),
  shield: $("hud-shield"),
  x2: $("hud-x2")
});

/* ------------------------------------------------------------------ HUD, popups, results */

function drainPopupDom(): void {
  const drained = drainPopups(sim.popups, nextPopupSeq);
  nextPopupSeq = drained.nextSeq;
  const host = $("popups");
  if (config.manual && drained.fresh.length > 0) host.replaceChildren();
  for (const p of drained.fresh) {
    popupsShown += 1;
    const el = document.createElement("div");
    el.className = "popup";
    el.textContent = p.text;
    el.style.color = p.color;
    el.style.fontSize = `${Math.round(22 * p.size)}px`;
    host.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
    while (host.children.length > 4) host.firstElementChild?.remove();
  }
}

function showResults(): void {
  const o = sim.o;
  const final = Math.floor(o.score);
  const isBest = final > best;
  if (isBest) {
    best = final;
    store.set("splatSiblings.number-surge.best", String(best));
  }
  if (o.biggestSmash > biggestSmash) {
    biggestSmash = o.biggestSmash;
    store.set("splatSiblings.number-surge.biggestSmash", String(biggestSmash));
  }
  $("final-best").textContent = best.toLocaleString();
  $("final-distance").textContent = `${Math.floor(o.distance).toLocaleString()} m`;
  $("final-walls").textContent = String(o.wallsSmashed);
  $("final-smash").textContent = String(Math.max(o.biggestSmash, 0));
  $("new-best").hidden = !isBest;
  const out = $("final-score");
  if (config.manual) {
    out.textContent = final.toLocaleString();
    return;
  }
  const startedAt = performance.now();
  const step = (): void => {
    const t = Math.min(1, (performance.now() - startedAt) / 800);
    out.textContent = Math.floor(final * (1 - Math.pow(1 - t, 3))).toLocaleString();
    if (t < 1 && sim.o.phase === "gameOver") requestAnimationFrame(step);
  };
  step();
}

function reactToFrame(): void {
  const o = sim.o;
  fx ??= new FxDriver(document.body, () => reducedMotion);
  const frame: AudioFrame = { phase: o.phase, events: { ...o.events } };
  for (const event of diffSounds(prevAudio, frame)) sound.play(event.sound, event.level);
  prevAudio = frame;
  const bursts = diffFx(prevEvents, o.events);
  prevEvents = { ...o.events };
  fovPunch = fx.apply(bursts);
  if (!reducedMotion) {
    for (const b of bursts) if (b.shake > 0) chase.addShake(b.shake);
  }
  fx.vignette(o.mult, o.scoreX2Timer > 0, performance.now() / 1000);
  if (o.phase !== lastPhase) {
    if (o.phase === "bursting") fx.reveal(true);
    if (o.phase === "splash" || o.phase === "playing") fx.reveal(false);
    $("splash-screen").hidden = o.phase !== "splash";
    $("gameover-screen").hidden = o.phase !== "gameOver";
    if (o.phase === "gameOver") showResults();
    if (o.phase !== "playing") $("popups").replaceChildren();
    sound.setIntensity(o.phase === "playing" || o.phase === "bursting" ? "play" : o.phase === "gameOver" ? "over" : "title");
    lastPhase = o.phase;
  }
  $("splash-best").textContent = `BEST ${best}`;
}

function updateHud(): void {
  hud.update(sim.o, best);
  drainPopupDom();
  reactToFrame();
}

/* ------------------------------------------------------------------ frame */

function render(live = false): void {
  if (!app || !runtime || renderFailed) return;
  try {
    const shown = live ? presenter.present(loop, true) : undefined;
    if (shown && reducedMotion) shown.cam = steady.at(loop.alpha);
    runtime.update(sim, canvas.clientWidth / Math.max(1, canvas.clientHeight), {
      ...(shown ? { shown } : {}),
      reducedMotion,
      fovPunch
    });
    app.step(0);
  } catch (error) {
    renderFailed = true;
    qa.reportError(error);
    $("render-error").hidden = false;
    $("render-error-msg").textContent = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

function advance(input: Input): void {
  sim.advance(input);
  chase.step(sim.o, jitter);
  steady.step(sim.o);
  fovPunch = fx ? fx.step() : 0;
  steps += 1;
}

const loop = createFixedStepLoop({
  manual: config.manual,
  isActive: () => ready && !paused,
  step() {
    if (keyDir !== 0 && sim.o.phase === "playing") pending.dx += keyDir * 0.22;
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

async function boot(): Promise<void> {
  const startButton = $<HTMLButtonElement>("btn-start");
  const loading = createLoadingProgress({
    element: $("load-bar"),
    onProgress: (fraction) => {
      $("load-fill").style.width = `${Math.round(fraction * 100)}%`;
    }
  });
  startButton.setAttribute("aria-busy", "true");
  loading.set(0.1);
  try {
    await document.fonts.load('700 32px "GT Walsheim"');
  } catch {
    /* the canvas labels fall back to the default face */
  }
  loading.set(0.25);
  const world = buildWorld({ sim, aspect: canvas.clientWidth / Math.max(1, canvas.clientHeight), look: LOOK });
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
  startButton.removeAttribute("aria-busy");
  if (config.autostart) {
    for (let i = 0; i < config.warmup; i += 1) advance(IDLE);
    steps = 0;
    if (!pilot) pilot = new Autopilot();
  }
  render();
  updateHud();
}

/* ------------------------------------------------------------------ pointer + keyboard input */

let lastX = 0;
let dragging = false;
/** Pixels of drag per world unit of steering target. */
const DRAG_GAIN = 1 / 90;

addEventListener("pointerdown", (e) => {
  void sound.unlock();
  if (config.manual || pilot) return;
  const target = e.target as HTMLElement | null;
  if (target?.closest?.(".no-steer")) return;
  if (paused) return;
  if (sim.o.phase === "splash") pending.start = true;
  else if (sim.o.phase === "playing") pending.down = true;
  dragging = true;
  lastX = e.clientX;
  try {
    canvas.setPointerCapture?.(e.pointerId);
  } catch {
    /* the pointer is already gone */
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
canvas.addEventListener("lostpointercapture", () => {
  if (dragging) release();
});

const KEY_DIR: Record<string, number> = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };
const held = new Set<string>();
function dropInput(): void {
  held.clear();
  keyDir = 0;
  if (dragging) pending.up = true;
  dragging = false;
}
addEventListener("blur", dropInput);
addEventListener("keydown", (e) => {
  void sound.unlock();
  if (config.manual || pilot || e.repeat) return;
  if (e.code === "KeyM") {
    toggleMute();
    return;
  }
  if (e.code === "KeyP" || e.code === "Escape") {
    setPaused(!paused);
    return;
  }
  if (paused) return;
  if (e.code === "Space" || e.code === "Enter") {
    e.preventDefault();
    if (sim.o.phase === "splash") pending.start = true;
    else if (sim.o.phase === "gameOver") restart();
    return;
  }
  if (e.code in KEY_DIR) {
    e.preventDefault();
    held.add(e.code);
    keyDir = [...held].reduce((sum, k) => sum + (KEY_DIR[k] ?? 0), 0);
  }
});
addEventListener("keyup", (e) => {
  if (!(e.code in KEY_DIR)) return;
  held.delete(e.code);
  keyDir = [...held].reduce((sum, k) => sum + (KEY_DIR[k] ?? 0), 0);
});

/* ------------------------------------------------------------------ pause, settings, buttons */

function setPaused(on: boolean): void {
  if (on && sim.o.phase !== "playing") on = false;
  paused = on;
  $("pause-screen").hidden = !paused;
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
  } else if (!paused) {
    void sound.resume();
  }
});
$("btn-resume").addEventListener("click", () => setPaused(false));
$("btn-pause").addEventListener("click", () => {
  if (!config.manual && !pilot) setPaused(!paused);
});

function restart(): void {
  sim.begin();
  presenter.reset();
  chase.reset();
  steady.reset();
  prevAudio = null;
  prevEvents = null;
  pilot?.reset();
}
$("btn-start").addEventListener("click", () => {
  void sound.unlock();
  if (config.manual || pilot) return;
  if (ready && sim.o.phase === "splash") pending.start = true;
});
$("btn-restart").addEventListener("click", () => {
  if (config.manual || pilot) return;
  restart();
});

const muteButton = $<HTMLButtonElement>("btn-mute");
const paintMute = (): void => {
  muteButton.textContent = sound.muted ? "SOUND OFF" : "SOUND ON";
  muteButton.setAttribute("aria-pressed", String(sound.muted));
};
const toggleMute = (): void => {
  sound.setMuted(!sound.muted);
  store.set("splatSiblings.number-surge.mute", sound.muted ? "1" : "0");
  paintMute();
};
muteButton.addEventListener("click", toggleMute);
paintMute();

const motionToggle = $<HTMLInputElement>("toggle-motion");
motionToggle.checked = reducedMotion;
motionToggle.addEventListener("change", () => {
  reducedMotion = motionToggle.checked;
  store.set("splatSiblings.number-surge.motion", reducedMotion ? "reduced" : "full");
  render();
});

/* ------------------------------------------------------------------ QA hooks */

function snapshotState() {
  const o = sim.o;
  return {
    ...o,
    phaseCode: PHASE_CODE[o.phase],
    steps,
    rngCount: sim.rngCount,
    rows: o.rows.length,
    gates: o.gates.length,
    walls: o.walls.length,
    powerups: o.powerups.length,
    particles: o.particles.length,
    shards: o.shards.length
  };
}

/* Script text for QA replay: `<steps>x[SDU T]*|- dx=<n>` per line (# comments allowed), or a JSON/input array. */
function parseSurgeScript(text: string | readonly Partial<Input>[]): Input[] {
  if (typeof text !== "string") {
    if (!Array.isArray(text)) throw new Error("number-surge: replay script must be an array or string");
    return text.map((r) => ({ ...IDLE, ...r }));
  }
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) {
    return (JSON.parse(trimmed) as Partial<Input>[]).map((r) => ({ ...IDLE, ...r }));
  }
  const out: Input[] = [];
  for (const [i, raw] of text.split("\n").entries()) {
    const line = raw.replace(/#.*$/, "").trim();
    if (line === "") continue;
    const m = /^(\d+)x([SDUT]*|-)\s+dx=(-?\d+(?:\.\d+)?)$/.exec(line);
    if (!m) throw new Error(`number-surge script line ${i + 1}: cannot parse "${line}"`);
    const flags = m[2] === "-" ? "" : (m[2] as string);
    const frame: Input = {
      start: flags.includes("S"),
      down: flags.includes("D"),
      up: flags.includes("U"),
      tap: flags.includes("T"),
      dx: Number(m[3])
    };
    for (let s = 0; s < Number(m[1]); s += 1) out.push({ ...frame });
  }
  return out;
}

const qa = installQaHooks("number-surge", {
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
    for (let i = 0; i < n; i += 1) advance(i === 0 ? { ...IDLE, ...input } : IDLE);
    render();
    updateHud();
    return snapshotState();
  },
  replay(text: string | readonly Partial<Input>[], warmup = config.warmup, seed = config.seed) {
    return replay(seed, warmup, parseSurgeScript(text)).trace;
  },
  reset(seed = config.seed) {
    sim = new NumberSurgeSim(seed);
    presenter.reset();
    chase.reset();
    steady.reset();
    steps = 0;
    nextPopupSeq = 0;
    prevAudio = null;
    prevEvents = null;
    lastPhase = "splash";
    pilot = config.autopilot ? new Autopilot() : null;
    render();
    updateHud();
  },
  extras: {
    get booted(): boolean {
      return ready;
    },
    runAutopilot(n: number, reckless = false) {
      const driver = new Autopilot({ maxDx: 0.35, reckless });
      for (let i = 0; i < n; i += 1) {
        if (reckless && sim.o.phase === "gameOver") break;
        advance(driver.next(sim, sim.o.phase === "playing" ? i + 1 : i));
      }
      render();
      updateHud();
      return snapshotState();
    },
    autopilot(on: boolean) {
      pilot = on ? new Autopilot() : null;
      steps = 0;
    },
    restart() {
      restart();
      render();
      updateHud();
      return snapshotState();
    },
    presentation() {
      return {
        popupsShown,
        nextPopupSeq,
        uploadedVertices: runtime?.uploadedVertices ?? 0,
        pixelRatio,
        paused,
        reducedMotion,
        warm: warmResult,
        look: LOOK.id,
        biggestSmashPersisted: biggestSmash
      };
    },
    setting(which: "motion", on: boolean) {
      reducedMotion = on;
      motionToggle.checked = on;
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
  $("render-error").hidden = false;
  $("render-error-msg").textContent = error instanceof Error ? error.message : String(error);
});