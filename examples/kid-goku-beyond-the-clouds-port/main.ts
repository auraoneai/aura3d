/**
 * "Cloud Runner" (Aura3D port of "Kid Goku: Beyond the Clouds"): boot, fixed-step loop, keyboard / touch input, persistence
 * and capture hooks. The simulation is `sim.ts` (pure, replayed against the original's recorded run), the encounter layer is
 * `encounters.ts`, the phase machine is `game.ts`, `world.ts` renders it, `ui.ts` / `audio.ts` are the interface.
 *
 * Query parameters: `manual=1` (the sim advances only through the hooks, and the run starts at once), `menu=1` (show the title
 * even in manual mode), `autostart=1` (skip the title), `chapterStart=<s>` (start the run at distance s).
 */
import { createAuraApp, createAuraRouteHealthSnapshot, createFixedStepLoop, installQaHooks, texture, type AuraApp } from "@aura3d/engine";
import { MOUNT_PAOZU } from "./chapter";
import { Game } from "./game";
import { createGoPresenter, viewOf } from "./presentation";
import { GameAudio } from "./audio";
import { IDLE, SETTLE_FRAMES, createState, stepFrame, type StepInput } from "./sim";
import { Ui } from "./ui";
import { buildWorld, type WorldRuntime } from "./world";

const STEP = 1 / 60;
const CH = MOUNT_PAOZU;
const STORE_KEY = "cloud-runner.v1";
const params = new URLSearchParams(location.search);
const manual = params.get("manual") === "1";
const canvas = document.getElementById("world") as HTMLCanvasElement;
const hudEl = document.getElementById("hud") as HTMLElement | null;
if (hudEl) hudEl.style.display = "none";

interface Saved { best: number; sound: boolean }
function load(): Saved { try { const v = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Partial<Saved>; return { best: Number(v.best) || 0, sound: v.sound !== false }; } catch { return { best: 0, sound: true }; } }
function save(): void { try { localStorage.setItem(STORE_KEY, JSON.stringify(saved)); } catch { /* storage unavailable */ } }
const saved = load();

const game = new Game(CH, 0, saved.best);
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
let oneShot = { jump: false, pole: false, nimbus: false };
let last = 0;
let pending: string[] = [];

function startRun(at = 0): void { audio.unlock(); audio.event("ui"); game.start(at); }
const startParam = Number(params.get("chapterStart"));
function applyStartMode(): void {
  if (Number.isFinite(startParam) && startParam > 0) game.start(startParam);
  else if ((manual || params.get("autostart") === "1") && params.get("menu") !== "1") game.start(0);
}

function currentInput(): StepInput {
  const steer = (held.has("ArrowRight") || held.has("KeyD") ? 1 : 0) - (held.has("ArrowLeft") || held.has("KeyA") ? 1 : 0);
  const input: StepInput = { steer, jump: oneShot.jump, pole: oneShot.pole, nimbus: oneShot.nimbus, brake: held.has("ArrowDown") || held.has("KeyS") };
  oneShot = { jump: false, pole: false, nimbus: false };
  return input;
}

addEventListener("keydown", (e) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) e.preventDefault();
  audio.unlock();
  held.add(e.code);
  if (e.repeat) return;
  const ph = game.phase;
  if (ph === "menu") { if (e.code === "Space" || e.code === "Enter") startRun(); return; }
  if (ph === "result") { if (e.code === "Enter" || e.code === "Space") { audio.event("ui"); game.retry(); } return; }
  if (e.code === "KeyP" || e.code === "Escape") { if (ph === "paused") game.resume(); else game.pause(); return; }
  if (ph === "paused") { if (e.code === "Enter" || e.code === "Space") game.resume(); return; }
  if (e.code === "Space" || e.code === "ArrowUp") oneShot.jump = true;
  if (e.code === "KeyE" || e.code === "KeyX") oneShot.pole = true;
  if (e.code === "KeyQ" || e.code === "ShiftLeft" || e.code === "ShiftRight") oneShot.nimbus = true;
});
addEventListener("keyup", (e) => held.delete(e.code));
addEventListener("blur", () => { held.clear(); game.pause(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) game.pause(); });

/** Same fields as the original's `__CLOUD_RUNNER__.snapshot()` where they overlap. */
function snapshot() {
  const st = game.state, n = st.nimbus;
  return {
    phase: game.phase === "result" ? "result" : st.dead ? "dead" : game.phase, chapter: st.chapter, name: CH.name,
    s: Math.round(st.s * 10) / 10, lane: st.lane, jump: st.jump, speed: st.speed, hearts: st.hearts,
    score: Math.round(st.score), combo: st.combo, balls: [...st.balls], meat: st.meat, fallen: st.falls,
    pole: st.pole?.start ?? null, finished: st.finished, nimbus: { charge: n.charge, active: n.active, call: n.call, time: n.time }
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
}

function consume(events: readonly string[]): void {
  for (const e of events) audio.event(e, game.state.orbs);
  if (game.result && game.best > saved.best) { saved.best = game.best; save(); }
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
    audio.update({ running: game.phase === "playing" || game.phase === "falling", speed: game.state.speed, s: game.state.s, grounded: game.state.jump < 0.1, playing: game.phase === "playing", menu: game.phase === "menu" });
  }
  render(manual ? STEP : dt);
}

interface Segment { readonly steps: number; readonly input: StepInput }
const qa = installQaHooks("kid-goku", {
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
      for (let i = 0; i < n; i++) events.push(...stepFrame(game.state, i === 0 ? input : { ...input, jump: false, pole: false, nimbus: false }, STEP, CH));
      presenter.reset();
      return events;
    },
    /** Advance the whole game layer (encounters, falls, duels, finale) `n` frames; returns the events raised. */
    play(n: number, input: StepInput = IDLE): string[] {
      const events: string[] = [];
      for (let i = 0; i < n; i++) events.push(...game.frame(STEP, i === 0 ? input : { ...input, jump: false, pole: false, nimbus: false }));
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
    place(s: number, opts: { lane?: number; nimbus?: boolean; phase?: "playing" | "menu" } = {}) {
      if (opts.phase === "menu") { game.menu(); runtime?.cutCamera(); return snapshot(); }
      game.start(0);
      const st = game.state;
      st.s = s; st.lane = opts.lane ?? 0; st.speed = CH.speed; st.invincible = 0;
      for (const b of CH.balls) if (b.s < s - 2) st.balls.push(b.star);
      for (const o of game.orbs) if (o.s < s) st.collected.add(o.id);
      for (const m of CH.meat) if (m.s < s) st.eaten.add(m.s);
      if (opts.nimbus) { st.nimbus.charge = 1; st.nimbus.active = true; st.nimbus.time = 7; st.jump = 3.2; }
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
    /** Leg gait this frame: clip, phase (cycles), cadence rate, stride gain, planted-foot speed and the share of ground speed still slid. */
    gait: () => (runtime ? { ...runtime.gait } : null),
    errors: () => errors.slice()
  }
});
const CHAPTER_ZERO = (): number => (Number.isFinite(startParam) && startParam > 0 ? startParam : 0);
void createState;
void qa;

async function boot(): Promise<void> {
  ui = new Ui(CH, {
    play: () => startRun(),
    retry: () => { audio.unlock(); audio.event("ui"); game.retry(); },
    menu: () => { audio.event("ui"); game.menu(); },
    pause: () => game.pause(),
    resume: () => game.resume(),
    restart: () => { game.start(0); },
    toggleSound: () => { audio.unlock(); saved.sound = !audio.enabled; audio.setEnabled(saved.sound); save(); return saved.sound; },
    touch: (key, down) => {
      audio.unlock();
      if (key === "left") { if (down) held.add("ArrowLeft"); else held.delete("ArrowLeft"); }
      else if (key === "right") { if (down) held.add("ArrowRight"); else held.delete("ArrowRight"); }
      else if (down) { if (game.phase === "paused") game.resume(); else if (key === "jump") oneShot.jump = true; else if (key === "pole") oneShot.pole = true; else oneShot.nimbus = true; }
    }
  }, saved.sound, saved.best);
  const rockMap = await texture.load(new URL("./assets/textures/rock-color.jpg", import.meta.url).pathname, { colorSpace: "srgb" });
  rockMap.wrapS = "repeat"; rockMap.wrapT = "repeat";
  const grassMap = await texture.load(new URL("./assets/textures/grass-color.jpg", import.meta.url).pathname, { colorSpace: "srgb" });
  grassMap.wrapS = "repeat"; grassMap.wrapT = "repeat";
  const world = buildWorld(CH, rockMap, grassMap);
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  app = createAuraApp(canvas, {
    autoStart: false,
    resize: false,
    pixelRatio: 1,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    output: { toneMapping: "aces", dither: false },
    scene: world.scene
  });
  await app.ready();
  const resize = (): void => {
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr)), h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  };
  resize();
  addEventListener("resize", resize);
  runtime = world.bind(app);
  applyStartMode();
  last = performance.now();
  stepper.tick(last);
  ready = true;
  requestAnimationFrame(loop);
  ui.ready();
}

boot().catch((error) => { errors.push(String((error as Error)?.stack ?? error)); if (hudEl) { hudEl.style.display = ""; hudEl.textContent = `error: ${String(error)}`; } });
