/**
 * Where the Wind Wanders on Aura3D: boot, fixed-step loop, input, HUD and capture hooks.
 * The simulation lives in `sim.ts` (pure); `world.ts` draws it through the public engine surface.
 *
 * Query parameters (GU47 adds `look=original` for the 4.6 look and `found=0..3|epilogue` to pin the daylight key): `manual=1` (the sim only advances through `__AURA_WIND__.stepFrames`; no title
 * card, no sound), `start=1` (skip the title card), `quality=low`. The hooks mirror the capture harness: `applyInput(keys, act)` then
 * `stepFrames(n)`, or `runScript(segments)` to replay a recorded key script; `realtime(seconds)` advances the game clock
 * (captions, the bell-to-epilogue wait, the voyage) without drawing a frame per tick.
 *
 * Two clocks: the sim runs on fixed steps; captions, the epilogue wait and the voyage run on the game clock, which only
 * moves while the walk runs (not on the title card, not while paused, not in a hidden tab).
 */
import { createAuraApp, createAuraRouteHealthSnapshot, createFixedStepLoop, installQaHooks, type AuraApp } from "@aura3d/engine";
import { CAMERA_FOLLOW, CAMERA_OFFSET, LETTERS, VIRTUAL_STEP_MS, createState, expandScript, nearbyInteraction, stepFrame, type Action, type FrameInput, type ScriptSegment, type WindState } from "./sim";
import { createCaptionQueue } from "./captions";
import { footstepCell } from "./locomotion";
import { createWindPresenter, viewOf } from "./presentation";
import { buildWorld, type WorldRuntime } from "./world";
import { createAudio } from "./audio";
import { STORY, createUi } from "./ui";
import { MODEL_ASSETS } from "./model-assets";
import { parseFoundParam, resolveLook } from "./daylight";
import { paperPass } from "./paper-pass";

const params = new URLSearchParams(location.search);
const manual = params.get("manual") === "1";
const lowQuality = params.get("quality") === "low";
/** `?found=0..3|bell|epilogue` pins the daylight key for captures (presentation only, the sim is untouched). The game boots the
 * 4.6 look; `?look=gu47` opts into the GU47 look, which a bell or epilogue pin also keeps (`resolveLook`, blind-panel fallback). */
const daylightKey = parseFoundParam(params.get("found"));
const originalLook = resolveLook(params.get("look"), daylightKey) === "original";
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
const presenter = createWindPresenter(() => state);
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
const captions = createCaptionQueue({ show: (text) => ui.showCaption(text), hide: () => ui.showCaption(null) });
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
/** Seconds after the bell before the boat leaves; the epilogue lines' times on the game clock. */
const EPILOGUE_DELAY = 9;
const INTRO_CUES = [0, 5.6, 11.2];
const EPILOGUE_CUES = [{ at: 0, seconds: 6 }, { at: 6.5, seconds: 6 }, { at: 13, seconds: 7 }];

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
      captions.say(STORY.letters[index]!.text, 11);
      audio.chime(index);
    }
  } else if (m === "bell:locked") captions.say(STORY.locked, 4);
  else if (m === "bell:complete") {
    captions.say(STORY.complete, 9);
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
  captions.play(STORY.intro.map((text, i) => ({ text, at: INTRO_CUES[i] ?? i * 5.6, seconds: 5 })));
  runtime?.playSequence("intro");
}

/** WW47-C1: letterbox bars while a camera sequence runs (DOM, so they never touch the frame's pixels or post). */
const bars = document.createElement("div");
bars.setAttribute("aria-hidden", "true");
bars.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:5;transition:box-shadow .6s ease";
document.body.appendChild(bars);
function updateBars(): void {
  const on = runtime?.sequence != null;
  bars.style.boxShadow = on ? "inset 0 9vh 0 0 #1b140e, inset 0 -9vh 0 0 #1b140e" : "inset 0 0 0 0 #1b140e";
}

function startEpilogue(): void {
  epilogueClock = 0;
  ui.showEpilogue(true);
  captions.play(STORY.epilogue.map((text, i) => ({ text, ...EPILOGUE_CUES[i]! })));
}

/** "Keep wandering the valley": fade, put the traveller and boat back at the jetty, carry on walking. */
function leaveEpilogue(): void {
  if (epilogueClock === null) return;
  captions.clear();
  epilogueClock = null;
  completeClock = -1e9;
  ui.showEpilogue(false);
  ui.fade(() => { runtime?.setEpilogue(null); render(VIRTUAL_STEP_MS); });
}

/** Back to a fresh valley: no letters, the bell silent, the traveller at the start. */
function resetWalk(): void {
  state = createState(); presenter.reset(); renderTime = 0; epilogueClock = null; completeClock = 0; lastStrideCell = 0; lastHopPhase = "idle";
  captions.clear(); held.clear(); touchKeys = ""; pendingAct = null;
  ui.clearLetters(); ui.showEpilogue(false); runtime?.reset(); updateHud(); render(VIRTUAL_STEP_MS);
}

/** "Walk again": fade, start a new walk from the title card. */
function walkAgain(): void {
  captions.clear();
  epilogueClock = null;
  ui.showEpilogue(false);
  ui.fade(() => {
    resetWalk();
    if (paused) { paused = false; ui.setPaused(false); audio.setPaused(false); }
    started = false;
    ui.showTitle();
  });
}

function setPaused(value: boolean): void {
  if (!started || ui.titleVisible) return;
  paused = value;
  ui.setPaused(paused);
  audio.setPaused(paused);
  held.clear();
  touchKeys = "";
}

/** Game-clock work for `dt` seconds of walking: captions, the wait after the bell, the voyage. */
function advanceGameClock(dt: number): void {
  if (state.complete && epilogueClock === null) {
    completeClock += dt;
    if (completeClock > EPILOGUE_DELAY) startEpilogue();
  }
  if (epilogueClock !== null) {
    epilogueClock += dt;
    runtime?.setEpilogue(epilogueClock);
  }
  captions.tick(dt);
}

/** The reach prompt: what E (or Act) would do here. */
function updatePrompt(): void {
  if (!started || paused || epilogueClock !== null || ui.titleVisible) { ui.setPrompt(null); return; }
  const near = nearbyInteraction(state.pos, state.found);
  ui.setPrompt(near.letter >= 0 ? "letter" : near.bell && !state.complete ? (state.found.length === LETTERS.length ? "bell" : "bell-locked") : null);
}

function advance(frame: FrameInput, dtMs = VIRTUAL_STEP_MS, tickTime = true): void {
  stepFrame(state, frame, dtMs);
  if (tickTime) renderTime += dtMs / 1000;
  const cell = footstepCell(state.stride);
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

/** `live` draws the pose between the last two steps (smooth on 120 and 144 Hz displays); everything else draws the exact latest step. */
function render(dtMs: number, live = false): void {
  if (!app || !runtime) return;
  runtime.update(live ? viewOf(state, presenter.present(loop, true)) : state, dtMs / 1000, renderTime, canvas.clientWidth / Math.max(1, canvas.clientHeight));
  updateBars();
  app.step(0);
  frames++;
}

const loop = createFixedStepLoop({
  manual,
  stepSeconds: VIRTUAL_STEP_MS / 1000,
  maxFrameSeconds: 0.1,
  minFrameSeconds: 0,
  isActive: () => ready && started && !paused,
  step() {
    advance({ keys: epilogueClock === null ? heldKeys() : "", act: epilogueClock === null ? pendingAct : null }, VIRTUAL_STEP_MS, false);
    presenter.afterStep();
    pendingAct = null;
  }
});

window.addEventListener("keydown", (e) => {
  audio.resume();
  // any key skips a running camera sequence; the next frame shows the follow camera
  if (runtime?.sequence && !ui.titleVisible) runtime.skipSequence();
  // arrows and Space walk and hop: they must not scroll a page that hosts the game
  if (e.code in KEY_LETTER || e.code === "Space") e.preventDefault();
  if (e.repeat) return;
  if (e.code === "Enter") {
    if (ui.titleVisible) beginWalk();
    else if (epilogueClock !== null) leaveEpilogue();
    return;
  }
  if (e.code === "KeyM") { audio.setMuted(!audio.muted); ui.setSound(audio.muted, audio.started); return; }
  if (!started) return;
  if (e.code === "KeyJ") { ui.toggleJournal(); return; }
  if (e.code === "Escape" || e.code === "KeyP") { setPaused(!paused); return; }
  if (paused || epilogueClock !== null) return;
  if (e.code in KEY_LETTER) held.add(e.code);
  if (e.code === "KeyE") pendingAct = "E";
  if (e.code === "Space") { pendingAct = "Space"; e.preventDefault(); }
});
window.addEventListener("keyup", (e) => { held.delete(e.code); });
window.addEventListener("blur", () => held.clear());
window.addEventListener("pointerdown", () => audio.resume(), { once: true });
window.addEventListener("pointerdown", () => { if (runtime?.sequence && !ui.titleVisible) runtime.skipSequence(); });
ui.onBegin(beginWalk);
ui.onContinue(leaveEpilogue);
ui.onWalkAgain(walkAgain);
ui.onPause(() => setPaused(!paused));
document.addEventListener("visibilitychange", () => { audio.setHidden(document.hidden); held.clear(); });
ui.onToggleSound(() => { audio.resume(); audio.setMuted(!audio.muted); ui.setSound(audio.muted, audio.started); });
ui.onTouch((k) => { touchKeys = k; }, (a) => { if (started && !paused && epilogueClock === null) pendingAct = a; });
if (started) { ui.hideTitle(); }

let last = performance.now();
function tick(now: number): void {
  requestAnimationFrame(tick);
  const dtMs = Math.min(100, now - last);
  last = now;
  loop.tick(now);
  if (!ready || manual) return;
  if (!started || paused || document.hidden) {
    renderTime += dtMs / 1000;
    updatePrompt();
    render(VIRTUAL_STEP_MS);
    return;
  }
  advanceGameClock(dtMs / 1000);
  updatePrompt();
  renderTime += dtMs / 1000;
  audio.update(state.pos, renderTime);
  render(dtMs, true);
}

function sizeCanvas(): void {
  const dpr = Math.min(1.25, devicePixelRatio || 1);
  canvas.width = Math.max(2, Math.round(canvas.clientWidth * dpr));
  canvas.height = Math.max(2, Math.round(canvas.clientHeight * dpr));
}

installQaHooks("wind", {
  ready: () => ready,
  state: () => JSON.parse(JSON.stringify({ step: state.step, pos: state.pos, facing: state.facing, stride: state.stride, found: state.found, complete: state.complete, hop: state.hop })),
  app: () => app,
  routeHealth: () => (app ? createAuraRouteHealthSnapshot(app, { parityIds: PARITY_IDS }) : null),
  extras: {
    /** GU47 E-I crop contract (normalised to the canvas): fixed regions of the follow framing used by the WP-33 acceptance. */
    crops: () => [
      { name: "sky", x: 0, y: 0, w: 1, h: 0.3 },
      { name: "meadow", x: 0.1, y: 0.55, w: 0.8, h: 0.35 },
      { name: "traveller", x: 0.38, y: 0.4, w: 0.24, h: 0.4 },
      { name: "horizon", x: 0, y: 0.25, w: 1, h: 0.2 }
    ],
    /** The daylight key on screen (WW47-L1) and the running camera sequence (WW47-C1). */
    get daylight() { const d = runtime?.daylight; return d ? { key: d.key, blend: d.blend, sunDir: d.sunDir } : null; },
    get sequence() { return runtime?.sequence ?? null; },
    /** The hero's current animation command and the render clock (null without the hero model); motion specs derive foot slide from it. */
    heroRig(): { renderTime: number; animation: unknown } | null {
      const hero = app?.nodes.get?.("hero");
      const snap = hero?.snapshot?.() as { animation?: unknown } | undefined;
      return snap ? { renderTime, animation: snap.animation ?? null } : null;
    },
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
    reset(): void { resetWalk(); },
    /** Advance the game clock by `seconds` in 0.1 s ticks (captions, the wait after the bell, the voyage), then draw once. */
    realtime(seconds: number): void {
      const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
      for (let t = 0; t < seconds - 1e-9; t += 0.1) {
        const dt = Math.min(0.1, seconds - t);
        advanceGameClock(dt); renderTime += dt;
        // ease the cameras as the real-time loop would, without drawing
        runtime?.update(state, dt, renderTime, aspect);
      }
      updatePrompt();
      render(VIRTUAL_STEP_MS);
    },
    get caption() { return captions.current; },
    get bellAngle() { return runtime?.bellAngle ?? null; },
    get audioState() { return audio.snapshot; },
    get reducedMotion() { return reducedMotion.matches; },
    /** Capture hook: place the traveller somewhere and settle the follow camera on it (resets the run). */
    teleport(x: number, z: number): void {
      state = createState();
      state.pos = { x, z };
      state.cam = { bx: x + CAMERA_FOLLOW.x, bz: z + CAMERA_FOLLOW.z, vx: x + CAMERA_FOLLOW.x + CAMERA_OFFSET.x, vz: z + CAMERA_FOLLOW.z + CAMERA_OFFSET.z };
      runtime?.snap(state);
      presenter.reset();
      render(VIRTUAL_STEP_MS);
    },
    /** Capture hook: show the voyage epilogue at `seconds` (null returns to the follow camera). */
    epilogue(seconds: number | null): void {
      runtime?.setEpilogue(seconds);
      ui.showEpilogue(seconds !== null);
      render(VIRTUAL_STEP_MS);
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
  }
});

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

/** Load progress on the loading card: the models are the bulk of the first load, so count them as they arrive. */
function watchModelLoads(): () => void {
  const status = $("loading-status");
  const urls = new Set(Object.values(MODEL_ASSETS).map((ref) => new URL((ref as unknown as { url: string }).url, location.href).pathname));
  const done = new Map<string, number>();
  const show = (): void => {
    const mb = [...done.values()].reduce((a, b) => a + b, 0) / 1e6;
    status.textContent = `Drawing the valley… ${done.size} of ${urls.size} models${mb > 0 ? ` (${mb.toFixed(1)} MB)` : ""}`;
  };
  const take = (entries: PerformanceEntryList): void => {
    let changed = false;
    for (const e of entries) {
      const path = new URL(e.name, location.href).pathname;
      if (!urls.has(path) || done.has(path)) continue;
      const r = e as PerformanceResourceTiming;
      done.set(path, r.encodedBodySize || r.transferSize || 0);
      changed = true;
    }
    if (changed) show();
  };
  if (typeof PerformanceObserver === "undefined") return () => {};
  const observer = new PerformanceObserver((list) => take(list.getEntries()));
  try { observer.observe({ type: "resource", buffered: true }); } catch { return () => {}; }
  show();
  return () => observer.disconnect();
}

async function boot(): Promise<void> {
  sizeCanvas();
  const stopWatching = watchModelLoads();
  const world = buildWorld({ density: lowQuality ? 0.5 : 1, reducedMotion: () => reducedMotion.matches, look: originalLook ? "original" : "gu47", daylightKey, quality: lowQuality ? "low" : "high", sequences: !started });
  app = createAuraApp(canvas, {
    autoStart: false,
    resize: false,
    pixelRatio: 1,
    // WW47-P1: renderer.quality replaces the deprecated qualityProfile (?look=original keeps the 4.6 options)
    renderer: originalLook ? { mode: "production", qualityProfile: "production", fallback: "safe-basic" } : { mode: "production", quality: lowQuality ? "low" : "high", fallback: "safe-basic" },
    output: { toneMapping: "aces", exposure: originalLook ? 1.25 : 1.18, dither: false },
    scene: world.scene
  });
  await app.ready();
  runtime = world.bind(app);
  // WW47-P3: the gouache paper pass (High only, not on the original look)
  if (!originalLook && !lowQuality) app.post?.addPostPass?.(paperPass(canvas.width, canvas.height));
  stopWatching();
  ready = true;
  $("loading").classList.add("hidden");
  updateHud();
  render(VIRTUAL_STEP_MS);
}

addEventListener("resize", sizeCanvas);
requestAnimationFrame(tick);
boot().catch(reportError);
