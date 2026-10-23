/**
 * "Kid Goku: Beyond the Clouds" on Aura3D: boot, fixed-step loop, keyboard input, HUD and capture hooks.
 * The simulation is `sim.ts` (pure); `world.ts` renders it through the public engine surface.
 *
 * Query parameters: `manual=1` (the sim advances only through the hooks), `chapterStart=<s>` (test override).
 */
import { createAuraApp, createAuraRouteHealthSnapshot, type AuraApp } from "@aura3d/engine";
import { MOUNT_PAOZU } from "./chapter";
import { IDLE, SETTLE_FRAMES, createState, stepFrame, type SimState, type StepInput } from "./sim";
import { buildWorld, type WorldRuntime } from "./world";

const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const manual = params.get("manual") === "1";
const canvas = document.getElementById("world") as HTMLCanvasElement;
const hudEl = document.getElementById("hud") as HTMLElement;

let state: SimState = newState();
let app: AuraApp | undefined;
let runtime: WorldRuntime | undefined;
let ready = false;
let frames = 0;
const errors: string[] = [];
const held = new Set<string>();
let oneShot = { jump: false, pole: false, nimbus: false };
let accumulator = 0;
let last = 0;

function newState(): SimState {
  const s = createState(0);
  const start = Number(params.get("chapterStart"));
  if (Number.isFinite(start) && start > 0) s.s = start;
  return s;
}

function currentInput(): StepInput {
  const steer = (held.has("ArrowRight") || held.has("KeyD") ? 1 : 0) - (held.has("ArrowLeft") || held.has("KeyA") ? 1 : 0);
  const input: StepInput = { steer, jump: oneShot.jump, pole: oneShot.pole, nimbus: oneShot.nimbus, brake: held.has("ArrowDown") || held.has("KeyS") };
  oneShot = { jump: false, pole: false, nimbus: false };
  return input;
}

addEventListener("keydown", (e) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) e.preventDefault();
  held.add(e.code);
  if (e.repeat) return;
  if (e.code === "Space" || e.code === "ArrowUp") oneShot.jump = true;
  if (e.code === "KeyE" || e.code === "KeyX") oneShot.pole = true;
  if (e.code === "KeyQ" || e.code === "ShiftLeft" || e.code === "ShiftRight") oneShot.nimbus = true;
});
addEventListener("keyup", (e) => held.delete(e.code));

/** Same fields as the original's `__CLOUD_RUNNER__.snapshot()` where they overlap. */
function snapshot() {
  const n = state.nimbus;
  return {
    phase: state.finished ? "result" : state.dead ? "dead" : "playing", chapter: state.chapter, name: MOUNT_PAOZU.name,
    s: Math.round(state.s * 10) / 10, lane: state.lane, jump: state.jump, speed: state.speed, hearts: state.hearts,
    score: Math.round(state.score), combo: state.combo, balls: [...state.balls], meat: state.meat, fallen: state.falls,
    pole: state.pole?.start ?? null, finished: state.finished, nimbus: { charge: n.charge, active: n.active, call: n.call, time: n.time }
  };
}

function hud(): void {
  hudEl.textContent = `${Math.round(state.s)} / ${MOUNT_PAOZU.length} m   hearts ${state.hearts}   balls ${state.balls.length}/7   meat ${state.meat}   score ${Math.round(state.score)}`;
}

function render(): void {
  if (!app || !runtime) return;
  try {
    runtime.update(state, canvas.clientWidth / Math.max(1, canvas.clientHeight));
    app.step(0);
    frames++;
  } catch (error) {
    errors.push(String((error as Error)?.stack ?? error));
    throw error;
  }
  hud();
}

function loop(now: number): void {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (!manual && ready) {
    accumulator += dt;
    while (accumulator >= STEP) {
      stepFrame(state, currentInput(), STEP, MOUNT_PAOZU);
      accumulator -= STEP;
    }
  }
  render();
}

interface Segment { readonly steps: number; readonly input: StepInput }
const API = {
  get ready() { return ready; },
  snapshot,
  reset() { state = newState(); accumulator = 0; },
  /** Fresh run plus the original's settle frames, so a recorded script starts from the same state. */
  begin() { state = newState(); accumulator = 0; for (let i = 0; i < SETTLE_FRAMES; i++) stepFrame(state, IDLE, STEP, MOUNT_PAOZU); },
  /** Advance the sim `n` frames (no rendering) with a fixed input; returns the events raised. */
  stepFrames(n: number, input: StepInput = IDLE): string[] {
    const events: string[] = [];
    for (let i = 0; i < n; i++) events.push(...stepFrame(state, i === 0 ? input : { ...input, jump: false, pole: false, nimbus: false }, STEP, MOUNT_PAOZU));
    return events;
  },
  /** Replay a recorded run-length input script from the current state; trace every `every` steps. */
  replay(segments: readonly Segment[], every = 5): { steps: number; trace: ReturnType<typeof snapshot>[] } {
    const trace: ReturnType<typeof snapshot>[] = [];
    let step = 0;
    for (const seg of segments) {
      for (let i = 0; i < seg.steps; i++) {
        stepFrame(state, seg.input, STEP, MOUNT_PAOZU);
        step++;
        if ((step - 1) % every === 0) trace.push(snapshot());
      }
    }
    return { steps: step, trace };
  },
  render,
  raw: () => state,
  info: () => app?.info ?? null,
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
    runtime?.update(state, canvas.clientWidth / Math.max(1, canvas.clientHeight));
    app.step(0);
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
    runtime?.update(state, canvas.clientWidth / Math.max(1, canvas.clientHeight));
    app.step(0);
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
  diagnostics: () => app?.diagnostics?.() ?? null,
  routeHealth() { return app ? createAuraRouteHealthSnapshot(app, { parityIds: ["SG-05"] }) : null; },
  errors: () => errors.slice()
};
declare global { interface Window { __AURA_KID_GOKU__?: typeof API } }
window.__AURA_KID_GOKU__ = API;

async function boot(): Promise<void> {
  const world = buildWorld(MOUNT_PAOZU);
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
    const w = Math.max(1, Math.floor(canvas.clientWidth)), h = Math.max(1, Math.floor(canvas.clientHeight));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  };
  resize();
  addEventListener("resize", resize);
  runtime = world.bind(app);
  ready = true;
  last = performance.now();
  requestAnimationFrame(loop);
}

boot().catch((error) => { errors.push(String((error as Error)?.stack ?? error)); hudEl.textContent = `error: ${String(error)}`; });
