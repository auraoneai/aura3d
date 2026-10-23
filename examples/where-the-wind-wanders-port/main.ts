/**
 * Where the Wind Wanders on Aura3D: boot, fixed-step loop, input, HUD and capture hooks.
 * The simulation lives in `sim.ts` (pure); `world.ts` draws it through the public engine surface.
 *
 * Query parameters: `manual=1` (the sim only advances through `__AURA_WIND__.stepFrames`; no title
 * card, no sound), `start=1` (skip the title card), `quality=low`. The hooks mirror the capture harness: `applyInput(keys, act)` then
 * `stepFrames(n)`, or `runScript(segments)` to replay a recorded key script.
 */
import { createAuraApp, createAuraRouteHealthSnapshot, type AuraApp } from "@aura3d/engine";
import { CAMERA_FOLLOW, CAMERA_OFFSET, LETTERS, VIRTUAL_STEP_MS, createState, expandScript, stepFrame, type Action, type FrameInput, type ScriptSegment, type WindState } from "./sim";
import { buildWorld, type WorldRuntime } from "./world";
import { createAudio } from "./audio";
import { STORY, createUi } from "./ui";

const params = new URLSearchParams(location.search);
const manual = params.get("manual") === "1";
const lowQuality = params.get("quality") === "low";
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`where-the-wind-wanders-port: #${id} is missing`);
  return el as T;
};
const canvas = $<HTMLCanvasElement>("world");

const PARITY_IDS = ["SH-02", "SG-03", "SG-05", "SM-02", "ST-01", "SR-02"];
let state: WindState = createState();
let app: AuraApp | undefined;
let runtime: WorldRuntime | undefined;
let ready = false;
let renderTime = 0;
let frames = 0;
const held = new Set<string>();
let pendingAct: Action = null;
let toastTimer = 0;
let touchKeys = "";
let started = manual || params.get("start") === "1";
let paused = false;
let lastStrideCell = 0;
let lastHopPhase = "idle";
let completeClock = 0;
let epilogueClock: number | null = null;
const audio = createAudio(!manual);
const ui = createUi();

declare global {
  interface Window {
    __AURA_WIND__?: unknown;
    __AURA_WIND_ERROR__?: string;
  }
}

const KEY_LETTER: Record<string, string> = { KeyW: "W", ArrowUp: "W", KeyA: "A", ArrowLeft: "A", KeyS: "S", ArrowDown: "S", KeyD: "D", ArrowRight: "D" };
const heldKeys = (): string => ["W", "A", "S", "D"].filter((l) => [...held].some((code) => KEY_LETTER[code] === l) || touchKeys.includes(l)).join("");

const MESSAGES: Record<string, string> = {
  "letter:oak": "A letter beneath the old oak.",
  "letter:mill": "A letter caught by the windmill.",
  "letter:water": "A letter by the water. The jetty creaks softly.",
  "bell:locked": "Three letters will give the bell its song.",
  "bell:complete": "The bell sings across the valley.",
  hint: "Look around. A letter may be near an oak, a windmill or the water."
};

function showToast(text: string): void {
  const el = $("toast");
  el.textContent = text;
  el.classList.add("on");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("on"), 3500);
}

function handleMessage(m: string): void {
  showToast(MESSAGES[m] ?? m);
  if (m.startsWith("letter:")) {
    const index = LETTERS.findIndex((l) => `letter:${l.id}` === m);
    if (index >= 0) {
      ui.addLetter(index);
      ui.caption(STORY.letters[index]!.text, 11);
      audio.chime(index);
    }
  } else if (m === "bell:locked") ui.caption(STORY.locked, 4);
  else if (m === "bell:complete") {
    ui.caption(STORY.complete, 9);
    audio.bell();
  }
}

function updateHud(): void {
  $("found").textContent = `${state.found.length} / ${LETTERS.length} discovered`;
  $("complete").classList.toggle("hidden", !state.complete);
  for (const m of state.messages) handleMessage(m);
}

function beginWalk(): void {
  if (started && !ui.titleVisible) return;
  started = true;
  ui.hideTitle();
  audio.resume();
  ui.setSound(audio.muted, audio.started);
  STORY.intro.forEach((line, i) => window.setTimeout(() => ui.caption(line, 5), i * 5600));
}

function startEpilogue(): void {
  epilogueClock = 0;
  ui.showEpilogue(true);
  ui.caption(STORY.epilogue[0], 6);
  window.setTimeout(() => ui.caption(STORY.epilogue[1], 6), 6500);
  window.setTimeout(() => ui.caption(STORY.epilogue[2], 7), 13000);
}

function leaveEpilogue(): void {
  epilogueClock = null;
  completeClock = -1e9;
  runtime?.setEpilogue(null);
  ui.showEpilogue(false);
}

function advance(frame: FrameInput, dtMs = VIRTUAL_STEP_MS): void {
  stepFrame(state, frame, dtMs);
  renderTime += dtMs / 1000;
  const cell = Math.floor(state.stride * 2);
  if (state.moved && state.hop.phase === "idle" && cell !== lastStrideCell) audio.footstep();
  lastStrideCell = cell;
  if (state.hop.phase !== lastHopPhase) {
    if (state.hop.phase === "takeoff") audio.hop();
    else if (state.hop.phase === "landing") audio.land();
    lastHopPhase = state.hop.phase;
  }
  updateHud();
  // in manual mode no frame is drawn per step, but the follow camera must still ease step by step as it does live
  if (manual && runtime) runtime.update(state, dtMs / 1000, renderTime, canvas.clientWidth / Math.max(1, canvas.clientHeight));
}

function render(dtMs: number): void {
  if (!app || !runtime) return;
  runtime.update(state, dtMs / 1000, renderTime, canvas.clientWidth / Math.max(1, canvas.clientHeight));
  app.step(0);
  frames++;
}

window.addEventListener("keydown", (e) => {
  audio.resume();
  if (e.repeat) return;
  if (e.code === "Enter") {
    if (ui.titleVisible) beginWalk();
    else if (epilogueClock !== null) leaveEpilogue();
    return;
  }
  if (e.code === "KeyM") { audio.setMuted(!audio.muted); ui.setSound(audio.muted, audio.started); return; }
  if (!started) return;
  if (e.code === "KeyJ" || e.code === "Tab") { ui.toggleJournal(); e.preventDefault(); return; }
  if (e.code === "Escape" || e.code === "KeyP") { paused = !paused; ui.setPaused(paused); held.clear(); return; }
  if (paused || epilogueClock !== null) return;
  if (e.code in KEY_LETTER) held.add(e.code);
  if (e.code === "KeyE") pendingAct = "E";
  if (e.code === "Space") { pendingAct = "Space"; e.preventDefault(); }
});
window.addEventListener("keyup", (e) => { held.delete(e.code); });
window.addEventListener("blur", () => held.clear());
window.addEventListener("pointerdown", () => audio.resume(), { once: true });
ui.onBegin(beginWalk);
ui.onContinue(leaveEpilogue);
ui.onToggleSound(() => { audio.resume(); audio.setMuted(!audio.muted); ui.setSound(audio.muted, audio.started); });
ui.onTouch((k) => { touchKeys = k; }, (a) => { if (started && !paused && epilogueClock === null) pendingAct = a; });
if (started) { ui.hideTitle(); }

let last = performance.now();
let acc = 0;
function tick(now: number): void {
  requestAnimationFrame(tick);
  const dtMs = Math.min(100, now - last);
  last = now;
  if (!ready || manual) return;
  if (!started || paused) {
    renderTime += dtMs / 1000;
    render(VIRTUAL_STEP_MS);
    return;
  }
  acc += dtMs;
  while (acc >= VIRTUAL_STEP_MS) {
    advance({ keys: epilogueClock === null ? heldKeys() : "", act: epilogueClock === null ? pendingAct : null });
    pendingAct = null;
    acc -= VIRTUAL_STEP_MS;
  }
  if (state.complete && epilogueClock === null) {
    completeClock += dtMs / 1000;
    if (completeClock > 9) startEpilogue();
  }
  if (epilogueClock !== null) {
    epilogueClock += dtMs / 1000;
    runtime?.setEpilogue(epilogueClock);
  }
  audio.update(state.pos, renderTime);
  render(VIRTUAL_STEP_MS);
}

function sizeCanvas(): void {
  const dpr = Math.min(1.25, devicePixelRatio || 1);
  canvas.width = Math.max(2, Math.round(canvas.clientWidth * dpr));
  canvas.height = Math.max(2, Math.round(canvas.clientHeight * dpr));
}

const hooks = {
  ready: () => ready,
  async pixels(): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
    render(VIRTUAL_STEP_MS);
    const out = document.createElement("canvas");
    out.width = 320;
    out.height = 180;
    const ctx = out.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2d context unavailable");
    ctx.drawImage(canvas, 0, 0, out.width, out.height);
    const img = ctx.getImageData(0, 0, out.width, out.height);
    return { width: img.width, height: img.height, data: img.data };
  },
  state: () => JSON.parse(JSON.stringify({ step: state.step, pos: state.pos, facing: state.facing, stride: state.stride, found: state.found, complete: state.complete, hop: state.hop })),
  applyInput(keys: string, act: Action = null): void { advance({ keys, act }); render(VIRTUAL_STEP_MS); },
  stepFrames(n: number, keys = ""): void { for (let i = 0; i < n; i++) advance({ keys, act: null }); render(VIRTUAL_STEP_MS); },
  /** Replay a recorded key script. Returns the per-step trajectory so a test can compare it with the reference. */
  runScript(segments: readonly ScriptSegment[]): { xs: number[]; zs: number[]; found: number[]; complete: boolean } {
    const xs: number[] = [];
    const zs: number[] = [];
    for (const frame of expandScript(segments)) {
      advance(frame);
      xs.push(state.pos.x);
      zs.push(state.pos.z);
    }
    render(VIRTUAL_STEP_MS);
    return { xs, zs, found: [...state.found], complete: state.complete };
  },
  reset(): void {
    state = createState(); renderTime = 0; epilogueClock = null; completeClock = 0; lastStrideCell = 0; lastHopPhase = "idle";
    ui.clearLetters(); ui.showEpilogue(false); runtime?.reset(); updateHud(); render(VIRTUAL_STEP_MS);
  },
  /** Capture hook: place the traveller somewhere and settle the follow camera on it (resets the run). */
  teleport(x: number, z: number): void {
    state = createState();
    state.pos = { x, z };
    state.cam = { bx: x + CAMERA_FOLLOW.x, bz: z + CAMERA_FOLLOW.z, vx: x + CAMERA_FOLLOW.x + CAMERA_OFFSET.x, vz: z + CAMERA_FOLLOW.z + CAMERA_OFFSET.z };
    runtime?.snap(state);
    render(VIRTUAL_STEP_MS);
  },
  /** Capture hook: show the voyage epilogue at `seconds` (null returns to the follow camera). */
  epilogue(seconds: number | null): void {
    runtime?.setEpilogue(seconds);
    ui.showEpilogue(seconds !== null);
    render(VIRTUAL_STEP_MS);
  },
  routeHealth() {
    if (!app) return null;
    return createAuraRouteHealthSnapshot(app, { parityIds: PARITY_IDS });
  },
  get diagnostics() { return app ? app.diagnostics() : null; },
  get frames() { return frames; },
  get foliageCards() { return runtime?.foliageCards ?? 0; },
  get nodeCount() { return runtime?.nodeCount ?? 0; },
  get stats() { return runtime?.stats ?? null; },
  async frame(width = 480, height = 270, quality = 0.72): Promise<string> {
    render(VIRTUAL_STEP_MS);
    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    const ctx = out.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    ctx.drawImage(canvas, 0, 0, width, height);
    return out.toDataURL("image/jpeg", quality);
  }
};
window.__AURA_WIND__ = hooks;

function reportError(error: unknown): void {
  const base = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const code = (error as { code?: unknown })?.code;
  const details = (error as { details?: unknown })?.details;
  const message = `${base}${typeof code === "string" ? ` [${code}]` : ""}${details ? ` ${JSON.stringify(details).slice(0, 6000)}` : ""}`;
  if (!window.__AURA_WIND_ERROR__) window.__AURA_WIND_ERROR__ = message;
  $("loading-status").textContent = `The valley could not load: ${message.slice(0, 300)}`;
  $("loading").classList.remove("hidden");
  console.error(error);
}

async function boot(): Promise<void> {
  sizeCanvas();
  const world = buildWorld({ density: lowQuality ? 0.5 : 1 });
  app = createAuraApp(canvas, {
    autoStart: false,
    resize: false,
    pixelRatio: 1,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    output: { toneMapping: "aces", exposure: 1.25, dither: false },
    scene: world.scene
  });
  await app.ready();
  runtime = world.bind(app);
  ready = true;
  $("loading").classList.add("hidden");
  updateHud();
  render(VIRTUAL_STEP_MS);
}

addEventListener("resize", sizeCanvas);
requestAnimationFrame(tick);
boot().catch(reportError);
