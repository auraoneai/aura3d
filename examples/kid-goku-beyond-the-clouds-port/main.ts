/**
 * Cumulus Dash: boot, fixed-step loop, keyboard / touch input, persistence
 * and capture hooks. The simulation is `sim.ts` (pure, replayed against the original's recorded run), the encounter layer is
 * `encounters.ts`, the phase machine is `game.ts`, `world.ts` renders it, `ui.ts` / `audio.ts` are the interface.
 *
 * Query parameters: `manual=1` (the sim advances only through the hooks, and the run starts at once), `menu=1` (show the title
 * even in manual mode), `autostart=1` (skip the title), `chapterStart=<s>` (start the run at distance s).
 */
import { createAuraApp, createAuraRouteHealthSnapshot, createFixedStepLoop, installQaHooks, texture, type AuraApp } from "@aura3d/engine";
import { hudThemeFontFaces, registerGameFonts, warmPrograms } from "@aura3d/engine/game";
import { ACTIVE_LOOK } from "./art/look";
import { cumulusCrops } from "./art/qa";
import { CUMULUS_RIDGE } from "./chapter";
import { Game, type Difficulty } from "./game";
import { createGoPresenter, viewOf } from "./presentation";
import { GameAudio } from "./audio";
import { IDLE, SETTLE_FRAMES, createState, stepFrame, type StepInput } from "./sim";
import { Ui } from "./ui";
import { buildWorld, type WorldRuntime } from "./world";

const STEP = 1 / 60;
const CH = CUMULUS_RIDGE;
const STORE_KEY = "cloud-runner.v1";
const params = new URLSearchParams(location.search);
const manual = params.get("manual") === "1";
const canvas = document.getElementById("world") as HTMLCanvasElement;
const hudEl = document.getElementById("hud") as HTMLElement | null;
if (hudEl) hudEl.style.display = "none";

/** `motion`: "reduced" or "full" once the player picks one on the title screen; until then the OS `prefers-reduced-motion` setting applies. */
interface Saved { best: number; bestTime: number; bestPearls: number; sound: boolean; motion?: "reduced" | "full"; difficulty: Difficulty }
function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Partial<Saved>;
    return { best: Number(v.best) || 0, bestTime: Number(v.bestTime) || 0, bestPearls: Number(v.bestPearls) || 0, sound: v.sound !== false, ...(v.motion === "reduced" || v.motion === "full" ? { motion: v.motion } : {}), difficulty: v.difficulty === "easy" ? "easy" : "normal" };
  } catch { return { best: 0, bestTime: 0, bestPearls: 0, sound: true, difficulty: "normal" }; }
}
function save(): void { try { localStorage.setItem(STORE_KEY, JSON.stringify(saved)); } catch { /* storage unavailable */ } }
const saved = load();

const game = new Game(CH, 0, { best: saved.best, bestTime: saved.bestTime, bestPearls: saved.bestPearls }, saved.difficulty);
const prefersReduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
game.reducedMotion = saved.motion ? saved.motion === "reduced" : prefersReduced;
const presenter = createGoPresenter(() => game);
let lastPhase = game.phase;
const audio = new GameAudio();
audio.enabled = saved.sound;
let app: AuraApp | undefined;
let runtime: WorldRuntime | undefined;
let ui: Ui | undefined;
let ready = false;
let frames = 0;
const errors: string[] = [];
const held = new Set<string>();
let oneShot = { jump: false, pole: false, glider: false };
let last = 0;
let pending: string[] = [];
let lastFootsteps = 0;

function startRun(at = 0): void { audio.unlock(); audio.event("ui"); game.start(at); }
function toggleSound(): boolean { audio.unlock(); saved.sound = !audio.enabled; audio.setEnabled(saved.sound); save(); ui?.sound(saved.sound); return saved.sound; }
const startParam = Number(params.get("chapterStart"));
function applyStartMode(): void {
  if (Number.isFinite(startParam) && startParam > 0) game.start(startParam);
  else if ((manual || params.get("autostart") === "1") && params.get("menu") !== "1") game.start(0);
}

function currentInput(): StepInput {
  const steer = (held.has("ArrowRight") || held.has("KeyD") ? 1 : 0) - (held.has("ArrowLeft") || held.has("KeyA") ? 1 : 0);
  const input: StepInput = { steer, jump: oneShot.jump, pole: oneShot.pole, glider: oneShot.glider, brake: held.has("ArrowDown") || held.has("KeyS") };
  oneShot = { jump: false, pole: false, glider: false };
  return input;
}

addEventListener("keydown", (e) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) e.preventDefault();
  audio.unlock();
  held.add(e.code);
  if (e.repeat) return;
  if (e.code === "KeyM") { toggleSound(); return; }
  const ph = game.phase;
  if (ph === "menu") { if (e.code === "Space" || e.code === "Enter") startRun(); return; }
  if (ph === "result") { if (e.code === "Enter" || e.code === "Space") { audio.event("ui"); game.retry(); } return; }
  if (e.code === "KeyP" || e.code === "Escape") { if (ph === "paused") game.resume(); else game.pause(); return; }
  if (ph === "paused") { if (e.code === "Enter" || e.code === "Space") game.resume(); return; }
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") oneShot.jump = true;
  if (e.code === "KeyE" || e.code === "KeyX" || e.code === "KeyK") oneShot.pole = true;
  if (e.code === "KeyQ" || e.code === "ShiftLeft" || e.code === "ShiftRight") oneShot.glider = true;
});
addEventListener("keyup", (e) => held.delete(e.code));
addEventListener("blur", () => { held.clear(); game.pause(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) game.pause(); });

/** Same fields as the original's `__CLOUD_RUNNER__.snapshot()` where they overlap. */
function snapshot() {
  const st = game.state, n = st.glider;
  return {
    phase: game.phase === "result" ? "result" : st.dead ? "dead" : game.phase, chapter: st.chapter, name: CH.name,
    s: Math.round(st.s * 10) / 10, lane: st.lane, jump: st.jump, speed: st.speed, hearts: st.hearts,
    score: Math.round(st.score), combo: st.combo, balls: [...st.balls], meat: st.meat, fallen: st.falls,
    pole: st.pole?.start ?? null, finished: st.finished, glider: { charge: n.charge, active: n.active, call: n.call, time: n.time }
  };
}

function render(dt = STEP): void {
  if (!app || !runtime) return;
  try {
    const live = !manual && game.phase === "playing";
    runtime.update(live ? viewOf(game, presenter.present(stepper, true)) : game, dt, canvas.clientWidth / Math.max(1, canvas.clientHeight), pending);
    app.step(0);
    frames++;
  } catch (error) {
    errors.push(String((error as Error)?.stack ?? error));
    throw error;
  }
  ui?.update(game);
  if (game.phase === "menu") ui?.titleBars(runtime.view.bars);
}

function consume(events: readonly string[]): void {
  for (const e of events) audio.event(e, game.state.orbs);
  if (game.result && (game.best > saved.best || game.bestTime !== saved.bestTime || game.bestPearls > saved.bestPearls)) {
    saved.best = Math.max(saved.best, game.best); saved.bestTime = game.bestTime; saved.bestPearls = Math.max(saved.bestPearls, game.bestPearls); save();
  }
}

const stepper = createFixedStepLoop({
  stepSeconds: STEP,
  maxFrameSeconds: 0.1,
  maxCatchUpSteps: 7,
  manual,
  isActive: () => ready,
  step() {
    pending.push(...game.frame(STEP, currentInput()));
    presenter.afterStep();
  }
});

function loop(now: number): void {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  pending = [];
  if (game.phase !== lastPhase) { lastPhase = game.phase; presenter.reset(); }
  stepper.tick(now);
  if (!manual && ready) {
    consume(pending);
    const steps = runtime?.footsteps ?? 0;
    for (let i = lastFootsteps; i < steps && i < lastFootsteps + 4; i++) audio.event("footstep");
    lastFootsteps = steps;
    audio.update({ running: game.phase === "playing" || game.phase === "falling", speed: game.state.speed, s: game.state.s, grounded: game.state.jump < 0.1, playing: game.phase === "playing", menu: game.phase === "menu" });
  }
  render(manual ? STEP : dt);
}

interface Segment { readonly steps: number; readonly input: StepInput }
const qa = installQaHooks("cumulus-dash", {
  ready: () => ready,
  state: snapshot,
  app: () => app,
  routeHealth: () => (app ? createAuraRouteHealthSnapshot(app, { parityIds: ["SG-05"] }) : null),
  /** Fresh run at the start of the track (playing). */
  reset() { game.start(CHAPTER_ZERO()); stepper.resetAccumulator(); presenter.reset(); },
  /** Fresh run plus the original's settle frames, so a recorded script starts from the same state. */
  begin() { game.start(0); for (let i = 0; i < SETTLE_FRAMES; i++) stepFrame(game.state, IDLE, STEP, CH); stepper.resetAccumulator(); presenter.reset(); },
  extras: {
    /** A boolean property (the specs read `ready === true`), not the kit's `ready()` function. */
    get ready() { return ready; },
    snapshot,
    /** Advance the pure sim `n` frames (no encounter layer, no rendering) with a fixed input; returns the events raised. */
    stepFrames(n: number, input: StepInput = IDLE): string[] {
      const events: string[] = [];
      for (let i = 0; i < n; i++) events.push(...stepFrame(game.state, i === 0 ? input : { ...input, jump: false, pole: false, glider: false }, STEP, CH));
      presenter.reset();
      return events;
    },
    /** Advance the whole game layer (encounters, falls, duels, finale) `n` frames; returns the events raised. */
    play(n: number, input: StepInput = IDLE): string[] {
      const events: string[] = [];
      for (let i = 0; i < n; i++) events.push(...game.frame(STEP, i === 0 ? input : { ...input, jump: false, pole: false, glider: false }));
      pending = events;
      presenter.reset();
      return events;
    },
    /** Replay a recorded run-length input script from the current state; trace every `every` steps. */
    replay(segments: readonly Segment[], every = 5): { steps: number; trace: ReturnType<typeof snapshot>[] } {
      const trace: ReturnType<typeof snapshot>[] = [];
      let step = 0;
      for (const seg of segments) {
        for (let i = 0; i < seg.steps; i++) {
          stepFrame(game.state, seg.input, STEP, CH);
          step++;
          if ((step - 1) % every === 0) trace.push(snapshot());
        }
      }
      presenter.reset();
      return { steps: step, trace };
    },
    /** Teleport the run to distance `s` (look-dev and capture), with the progress a player would have there. */
    place(s: number, opts: { lane?: number; glider?: boolean; phase?: "playing" | "menu" } = {}) {
      if (opts.phase === "menu") { game.menu(); runtime?.cutCamera(); return snapshot(); }
      game.start(0);
      const st = game.state;
      st.s = s; st.lane = opts.lane ?? 0; st.speed = CH.speed; st.invincible = 0;
      for (const b of CH.balls) if (b.s < s - 2) st.balls.push(b.star);
      for (const o of game.orbs) if (o.s < s) st.collected.add(o.id);
      for (const m of CH.meat) if (m.s < s) st.eaten.add(m.s);
      if (opts.glider) { st.glider.charge = 1; st.glider.active = true; st.glider.time = 7; st.jump = 3.2; }
      game.enc.rewind(s);
      presenter.reset();
      runtime?.cutCamera();
      return snapshot();
    },
    /** Run the game layer for `n` frames (with the current phase) and render once: for deterministic captures. */
    settle(n = 30, sim = false) { for (let i = 0; i < n; i++) { if (sim) game.frame(STEP, IDLE); presenter.reset(); render(STEP); } return snapshot(); },
    render,
    raw: () => game.state,
    game: () => game,
    async capture(): Promise<string> {
      if (!app?.capture) throw new Error("capture unavailable");
      const blob = (await app.capture({ type: "png-blob" })) as Blob;
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (const b of buf) bin += String.fromCharCode(b);
      return btoa(bin);
    },
    async pixels(): Promise<{ width: number; height: number; data: number[] }> {
      if (!app?.capture) throw new Error("capture unavailable");
      render(STEP);
      const blob = (await app.capture({ type: "png-blob" })) as Blob;
      const bitmap = await createImageBitmap(blob);
      const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = surface.getContext("2d");
      if (!ctx) throw new Error("no 2d context for readback");
      ctx.drawImage(bitmap, 0, 0);
      const image = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      return { width: image.width, height: image.height, data: Array.from(image.data) };
    },
    /** A compact JPEG of the current frame as base64 (ACR runs cannot return files). */
    async frame(w = 480, h = 270, q = 0.6): Promise<string> {
      if (!app?.capture) throw new Error("capture unavailable");
      render(STEP);
      const blob = (await app.capture({ type: "png-blob" })) as Blob;
      const bitmap = await createImageBitmap(blob);
      const surface = new OffscreenCanvas(w, h);
      const ctx = surface.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(bitmap, 0, 0, w, h);
      const jpeg = await surface.convertToBlob({ type: "image/jpeg", quality: q });
      const buf = new Uint8Array(await jpeg.arrayBuffer());
      let bin = "";
      for (const b of buf) bin += String.fromCharCode(b);
      return btoa(bin);
    },
    stats: () => runtime?.stats ?? null,
    /** GU47 crop contract: named 0..1 rects re-read at every shot (the hero box follows the camera). */
    crops: () => cumulusCrops(runtime ? runtime.view : null),
    /** CD-15: preset pack registration, fired presets, glider trail and the engine's live particle count. */
    vfx: () => runtime?.vfx() ?? null,
    /** CD-09: post effects switched by the tier plan (god rays High/Ultra only). */
    post: () => runtime?.post() ?? null,
    /** Camera eye, target and fov plus the hero, ride-log and hut positions this frame (framing checks project these). */
    view: () => (runtime ? JSON.parse(JSON.stringify(runtime.view)) as typeof runtime.view : null),
    /** The program warm-up result from boot (null until it ran). */
    warm: () => warmResult,
    /** Leg gait this frame: clip, phase (cycles), cadence rate, stride gain, planted-foot speed and the share of ground speed still slid. */
    gait: () => (runtime ? { ...runtime.gait } : null),
    errors: () => errors.slice()
  }
});
const CHAPTER_ZERO = (): number => (Number.isFinite(startParam) && startParam > 0 ? startParam : 0);
void createState;
void qa;

let warmResult: Awaited<ReturnType<typeof warmPrograms>> | null = null;

const STORM = ACTIVE_LOOK.id === "storm-washed";
/** CD-19: the licensed sky-expedition faces (Roobert 400/700, copied app-locally with their NOTICE), registered as "A3G Roobert". */
function registerHudFonts(): void {
  const urls: Readonly<Record<string, string>> = {
    "roobert-400.woff2": new URL("./assets/fonts/roobert-400.woff2", import.meta.url).pathname,
    "roobert-700.woff2": new URL("./assets/fonts/roobert-700.woff2", import.meta.url).pathname
  };
  // the DOM FontFaceSet / FontFace are the registry at runtime; lib.dom types do not match E-J's narrow FontRegistry shape
  const registry = { fonts: document.fonts, FontFace: window.FontFace } as unknown as Parameters<typeof registerGameFonts>[1];
  void registerGameFonts("", registry, hudThemeFontFaces("sky-expedition").map((face) => ({ ...face, file: urls[face.file] ?? face.file }))).catch(() => undefined);
}

async function boot(): Promise<void> {
  ui = new Ui(CH, {
    play: () => startRun(),
    retry: () => { audio.unlock(); audio.event("ui"); game.retry(); },
    menu: () => { audio.event("ui"); game.menu(); },
    pause: () => game.pause(),
    resume: () => game.resume(),
    restart: () => { game.start(0); },
    toggleSound,
    toggleMotion: () => { game.reducedMotion = !game.reducedMotion; saved.motion = game.reducedMotion ? "reduced" : "full"; save(); return game.reducedMotion; },
    toggleDifficulty: () => { game.setDifficulty(game.difficulty === "easy" ? "normal" : "easy"); saved.difficulty = game.difficulty; save(); return game.difficulty; },
    touch: (key, down) => {
      audio.unlock();
      if (key === "left") { if (down) held.add("ArrowLeft"); else held.delete("ArrowLeft"); }
      else if (key === "right") { if (down) held.add("ArrowRight"); else held.delete("ArrowRight"); }
      else if (down) { if (game.phase === "paused") game.resume(); else if (key === "jump") oneShot.jump = true; else if (key === "pole") oneShot.pole = true; else oneShot.glider = true; }
    }
  }, { soundOn: saved.sound, reducedMotion: game.reducedMotion, difficulty: game.difficulty, best: saved.best, bestTime: saved.bestTime, bestPearls: saved.bestPearls, storm: STORM });
  if (STORM) registerHudFonts();
  const rockMap = await texture.load(new URL("./assets/textures/rock-color.jpg", import.meta.url).pathname, { colorSpace: "srgb" });
  rockMap.wrapS = "repeat"; rockMap.wrapT = "repeat";
  const grassMap = await texture.load(new URL("./assets/textures/grass-color.jpg", import.meta.url).pathname, { colorSpace: "srgb" });
  grassMap.wrapS = "repeat"; grassMap.wrapT = "repeat";
  const world = buildWorld(CH, rockMap, grassMap);
  app = createAuraApp(canvas, {
    autoStart: false,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    output: { toneMapping: "aces", dither: false },
    scene: world.scene
  });
  await app.ready();
  runtime = world.bind(app);
  applyStartMode();
  // compile every program before the player can start, so the first seconds of play do not hitch (checklist R2)
  render(STEP);
  warmResult = await warmPrograms(app, { environmentTimeoutMs: 15_000, textureTimeoutMs: 15_000 });
  last = performance.now();
  stepper.tick(last);
  ready = true;
  requestAnimationFrame(loop);
  ui.ready();
}

boot().catch((error) => {
  errors.push(String((error as Error)?.stack ?? error));
  // the Ui's full-screen loader sits above #hud, so the error must replace the loader text or it stays hidden
  if (ui) ui.fail(String((error as Error)?.message ?? error));
  else if (hudEl) { hudEl.style.display = ""; hudEl.textContent = `error: ${String(error)}`; }
});
