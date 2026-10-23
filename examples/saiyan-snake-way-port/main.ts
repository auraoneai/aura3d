/**
 * Saiyan through the Snake way! on Aura3D: boot, fixed-step loop, input, HUD and capture hooks.
 * The simulation lives in `sim.ts` (pure); `world.ts` renders it through the public engine surface.
 *
 * Query parameters (all optional): `autostart=1` (skip the title), `manual=1` (the sim only advances
 * through `__AURA_SAIYAN_SNAKE_WAY__.stepFrames`), `autopilot=1` (replay `?script=` or nothing).
 * Keys follow the original: A/D or arrows change lane, Space/W jump, S/down slide, Shift toggles
 * Kaio-ken, E flies (hold W/S/A/D to steer), P/Esc pauses.
 */
import { createAuraApp, createAuraRouteHealthSnapshot, type AuraApp } from "@aura3d/engine";
import {
  RUNGS, START_DAYS, STEP, ROAD_LENGTH, KM_TOTAL, createRun, expandScript, snapshot, stepRun, type InputSegment, type RunInput, type RunState
} from "./sim";
import { buildWorld, type WorldRuntime } from "./world";

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

let state: RunState = createRun();
let app: AuraApp | undefined;
let runtime: WorldRuntime | undefined;
let ready = false;
let started = config.autostart;
let paused = false;
let accumulator = 0;
let renderTime = 0;
let last = 0;
let steps = 0;
let renderFailed = false;

/* ------------------------------------------------------------------ input */

const tapKeys = new Set<string>();
const heldKeys = new Set<string>();
const GAME_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "KeyA", "KeyD", "KeyW", "KeyS", "ShiftLeft", "ShiftRight", "KeyE", "KeyP", "Escape"]);
addEventListener("keydown", (e) => {
  if (!GAME_KEYS.has(e.code)) return;
  e.preventDefault();
  if (e.code === "Escape" || e.code === "KeyP") { if (started) paused = !paused; return; }
  if (!started && (e.code === "Space" || e.code === "Enter")) { begin(); return; }
  if (!heldKeys.has(e.code)) tapKeys.add(e.code);
  heldKeys.add(e.code);
});
addEventListener("keyup", (e) => { heldKeys.delete(e.code); });

function takeInput(): RunInput {
  const input: RunInput = { taps: [...tapKeys], held: [...heldKeys] };
  tapKeys.clear();
  return input;
}

/* ------------------------------------------------------------------ HUD */

const fmt = (n: number): string => Math.round(n).toLocaleString("en-US");
function updateHud(): void {
  $("km").textContent = fmt(Math.max(0, (state.s / ROAD_LENGTH) * KM_TOTAL));
  $("days").textContent = fmt(state.days);
  $("score").textContent = fmt(state.score);
  $("mult").textContent = `×${(RUNGS[state.auraRung] as { mult: number }).mult}`;
  ($("ki-bar") as HTMLElement).style.width = `${Math.round(Math.max(0, Math.min(1, state.ki / state.kiMax)) * 100)}%`;
  ($("strain-bar") as HTMLElement).style.width = `${Math.round(state.strain * 100)}%`;
  $("banner").textContent = state.bannerT > 0 ? state.banner : "";
  $("sub").textContent = state.bannerT > 0 ? state.bannerSub : "";
  $("toast").textContent = state.toastT > 0 ? state.toast : "";
  $("phase").textContent = state.phase === "run" ? (state.atEnd ? "END OF THE ROAD" : "OUTBOUND") : state.phase === "over" ? `OVER: ${state.ended}` : `${state.phase.toUpperCase()}: ${state.fallWhy || ""}`;
  $("title").classList.toggle("hidden", started);
  $("paused").classList.toggle("hidden", !paused);
}

/* ------------------------------------------------------------------ loop */

function render(dt: number): void {
  if (!app || !runtime || renderFailed) return;
  try {
    runtime.update(state, dt, renderTime, canvas.clientWidth / Math.max(1, canvas.clientHeight));
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

function tick(now: number): void {
  requestAnimationFrame(tick);
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
  last = now;
  if (!ready) return;
  if (started && !paused && !config.manual) {
    accumulator += dt;
    while (accumulator >= STEP) {
      advance(takeInput());
      accumulator -= STEP;
    }
  } else renderTime += dt;
  render(dt);
  updateHud();
}

function begin(): void {
  state = createRun();
  steps = 0;
  accumulator = 0;
  started = true;
  paused = false;
  runtime?.resetCamera();
}

function reportError(error: unknown): void {
  const base = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const code = (error as { code?: unknown })?.code;
  const details = (error as { details?: unknown })?.details;
  const message = `${base}${typeof code === "string" ? ` [${code}]` : ""}${details ? ` ${JSON.stringify(details).slice(0, 6000)}` : ""}`;
  if (!window.__AURA_SAIYAN_SNAKE_WAY_ERROR__) window.__AURA_SAIYAN_SNAKE_WAY_ERROR__ = message;
  $("loading-status").textContent = `Snake Way could not load: ${message.slice(0, 300)}`;
  $("loading").classList.remove("hidden");
  console.error(error);
}

/* ------------------------------------------------------------------ capture hooks */

const hooks = {
  state: () => snapshot(state, steps),
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
  meta: () => ({ steps, renderTime, entityNodes: runtime?.entityNodes ?? 0, nodeCount: runtime?.nodeCount ?? 0 }),
  routeHealth: () => (app ? createAuraRouteHealthSnapshot(app, { parityIds: ["SH-02", "SG-05", "SG-06", "SG-07", "SC-01", "SR-02"] }) : null),
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
  diagnostics: () => (app ? app.diagnostics() : null),
  info: () => app?.info ?? null,
  async frame(width = 480, height = 270, quality = 0.72): Promise<string> {
    if (!app?.capture) throw new Error("capture unavailable");
    const blob = (await app.capture({ type: "png-blob" })) as Blob;
    const bitmap = await createImageBitmap(blob);
    const surface = document.createElement("canvas");
    surface.width = width;
    surface.height = height;
    surface.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
    return surface.toDataURL("image/jpeg", quality);
  },
  async pixels(): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
    if (!app?.capture) throw new Error("capture unavailable");
    const blob = (await app.capture({ type: "png-blob" })) as Blob;
    const bitmap = await createImageBitmap(blob);
    const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = surface.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    const image = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return { width: image.width, height: image.height, data: image.data };
  },
  get ready() { return ready; }
};
window.__AURA_SAIYAN_SNAKE_WAY__ = hooks;

function sizeCanvas(): void {
  const dpr = 1;
  canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
}

async function boot(): Promise<void> {
  sizeCanvas();
  const world = buildWorld();
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
  ready = true;
  $("loading").classList.add("hidden");
  render(0);
  updateHud();
  if (config.autostart) begin();
}

$("start").addEventListener("click", begin);
addEventListener("resize", sizeCanvas);
requestAnimationFrame(tick);
void START_DAYS;
boot().catch(reportError);
