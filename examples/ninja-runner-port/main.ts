/**
 * Ninja Runner on Aura3D: boot, fixed-step loop, input, HUD and capture hooks. The simulation lives in
 * `sim.ts` (pure, transcribed from the original); `world.ts` renders it through the public engine surface.
 *
 * Timing matches the original: real time feeds an accumulator and the sim advances in 1/120 s steps
 * (`pf(z, 1/120)`), with key presses applied between steps. Query parameters (all optional):
 * `autostart=1`, `autopilot=1` (the capture policy plays the run), `manual=1` (the sim only advances through
 * the hooks), `seed=N` (course seed, default 17), `quality=low`.
 */
import { createAuraApp, createAuraRouteHealthSnapshot, type AuraApp } from "@aura3d/engine";
import { DEFAULT_POLICY, policyActions, type PolicyParams } from "./autopilot";
import { courseDigest, decodeActionScript, replayScript, runIdle, runPolicy } from "./replay";
import { GameAudio } from "./audio";
import { announcement, districtLabel, resultCopy } from "./labels";
import {
  DEFAULT_SEED, SIM_STEP, TUNING, applyAction, createState, drainEvents, qaAutopilotActions, snapshot, startRun, stepSim,
  type Action, type SimEvent, type SimState
} from "./sim";
import { ACTOR_COUNT, buildWorld, loadActors, type ActorAssets, type WorldRuntime } from "./world";

const params = new URLSearchParams(location.search);
const num = (key: string, fallback: number): number => { const v = Number(params.get(key)); return params.has(key) && Number.isFinite(v) ? v : fallback; };
const config = {
  seed: num("seed", DEFAULT_SEED) | 0,
  autostart: params.get("autostart") === "1",
  autopilot: params.get("autopilot") === "1",
  manual: params.get("manual") === "1",
  quality: (params.get("quality") === "low" ? "low" : "high") as "low" | "high"
};

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`ninja-runner-port: #${id} is missing`);
  return el as T;
};
const canvas = $<HTMLCanvasElement>("world");

/* ------------------------------------------------------------------ state */

let z: SimState = createState(config.seed);
let app: AuraApp | undefined;
let runtime: WorldRuntime | undefined;
let actors: ActorAssets | undefined;
let ready = false;
let accumulator = 0;
let renderTime = 0;
let frames = 0;
let simSteps = 0;
let autopilotOn = config.autopilot;
let policy: PolicyParams = DEFAULT_POLICY;
let pendingEvents: SimEvent[] = [];
let notice: { title: string; small: string; until: number } | null = null;
let renderFailed = false;
let countdown = 0;
let shownDistrict = "";
const audio = new GameAudio();
const maxCooldown: Record<string, number> = { dash: 1 };

function say(title: string, small: string, seconds: number): void { notice = { title, small, until: renderTime + seconds }; }

const SFX_FOR_EVENT: Readonly<Record<string, Parameters<GameAudio["play"]>[0]>> = {
  jump: "jump", land: "land", dash: "dash", rasengan: "orb", rasenshuriken: "gale", clones: "clones", damage: "hurt", break: "crate", armorBreak: "crate",
  windImpact: "galeHit", cloneStrike: "orbHit", deflect: "orbHit", interrupt: "orbHit", unlock: "unlock", form: "form", won: "win", lost: "lose", dropWarning: "warn"
};

function handle(events: readonly SimEvent[]): void {
  for (const ev of events) {
    pendingEvents.push(ev);
    const note = announcement(ev.type, ev.form as string | undefined);
    if (note) say(note.title, note.small, note.seconds);
    if (ev.type === "damage") flashHurt();
    if (ev.type === "pickup") audio.play("pickup", renderTime);
    else if (ev.type === "kill") audio.play(ev.heavy ? "heavyKill" : "kill");
    else { const sfx = SFX_FOR_EVENT[ev.type]; if (sfx) audio.play(sfx); }
  }
}

function flashHurt(): void {
  const el = document.getElementById("hurt");
  if (!el) return;
  el.classList.add("on");
  window.setTimeout(() => el.classList.remove("on"), 90);
}

function showHud(on: boolean): void {
  for (const id of ["stats", "vitals", "forms", "abilities", "progress", "mute"]) $(id).classList.toggle("hidden", !on);
}

function begin(): void {
  z = createState(config.seed);
  startRun(z);
  accumulator = 0;
  simSteps = 0;
  countdown = 0;
  pendingEvents = [];
  handle(drainEvents(z));
  runtime?.resetCamera();
  shownDistrict = "";
  $("overlay").classList.add("hidden");
  $("result").classList.add("hidden");
  $("pause").classList.add("hidden");
  $("countdown").classList.add("hidden");
  showHud(true);
}

/** Player-initiated start: a short 3-2-1 over the idle runner, then the run. The hooks call `begin` directly. */
function startWithCountdown(): void {
  if (!ready || countdown > 0) return;
  audio.unlock();
  audio.play("click");
  z = createState(config.seed);
  runtime?.resetCamera();
  $("overlay").classList.add("hidden");
  $("result").classList.add("hidden");
  $("pause").classList.add("hidden");
  showHud(false);
  $("countdown").classList.remove("hidden");
  countdown = 2.2;
}

function setPaused(on: boolean): void {
  if (on && z.phase === "running") z.phase = "paused";
  else if (!on && z.phase === "paused") z.phase = "running";
  else return;
  $("pause").classList.toggle("hidden", !on);
}

function act(action: Action): boolean {
  if (z.phase === "intro" && (action === "rasengan" || action === "jump")) { begin(); return true; }
  const ok = applyAction(z, action);
  handle(drainEvents(z));
  return ok;
}

function step(n: number, scripted?: readonly Action[]): void {
  for (let i = 0; i < n && z.phase === "running"; i++) {
    for (const a of autopilotOn ? policyActions(z, policy) : scripted ?? []) applyAction(z, a);
    stepSim(z, SIM_STEP);
    simSteps++;
    handle(drainEvents(z));
  }
}

/* ------------------------------------------------------------------ HUD */

const ABILITY_COST: Record<string, number> = { clones: TUNING.cloneCost, rasengan: TUNING.attackCost, dash: TUNING.dashCost, rasenshuriken: TUNING.shurikenCost };

function abilityCooldown(action: string): number {
  const left = action === "clones" ? z.cloneCooldown : action === "rasengan" ? z.attackCooldown : action === "dash" ? z.dashCooldown : z.shurikenCooldown;
  const full = action === "clones" ? TUNING.cloneCooldown : action === "rasengan" ? TUNING.attackCooldown : action === "rasenshuriken" ? TUNING.shurikenCooldown : (maxCooldown[action] = Math.max(maxCooldown[action] ?? 1, left));
  return Math.max(0, Math.min(1, left / full));
}

function updateHud(): void {
  $("distance").textContent = String(Math.floor(z.s));
  $("kills").textContent = String(z.kills).padStart(2, "0");
  $("score").textContent = String(z.score);
  $("combo").textContent = z.combo > 1 ? `${z.combo}x combo` : "";
  $("chakra").textContent = `${Math.round(z.chakra)} / ${TUNING.maxChakra}`;
  $("chakra-bar").style.width = `${(z.chakra / TUNING.maxChakra) * 100}%`;
  $("hearts").textContent = "♥".repeat(Math.max(0, z.health)) + "♡".repeat(Math.max(0, TUNING.health - z.health));
  $("progress-fill").style.width = `${Math.min(100, (z.s / TUNING.length) * 100)}%`;
  const district = districtLabel(z.s);
  $("district").textContent = district;
  if (district !== shownDistrict && z.phase === "running") {
    const banner = $("district-banner");
    banner.textContent = district.toUpperCase();
    banner.classList.add("show");
    shownDistrict = district;
    window.setTimeout(() => banner.classList.remove("show"), 2200);
  }
  document.querySelectorAll<HTMLButtonElement>("#forms button").forEach((b) => {
    const form = b.dataset.form as string;
    b.classList.toggle("selected", z.form === form);
    b.disabled = form !== "base" && z.s < (form === "sage" ? 600 : 1620);
  });
  document.querySelectorAll<HTMLButtonElement>("#abilities button").forEach((b) => {
    const action = b.dataset.action as string;
    b.style.setProperty("--cd", abilityCooldown(action).toFixed(3));
    b.classList.toggle("poor", z.chakra < (ABILITY_COST[action] ?? 0));
    b.classList.toggle("live", (action === "clones" && z.clones > 0) || (action === "rasengan" && z.attack > 0) || (action === "dash" && z.dash > 0) || (action === "rasenshuriken" && z.shurikenCast > 0));
  });
  const live = notice && notice.until > renderTime ? notice : null;
  $("announce-title").textContent = live?.title ?? "";
  $("announce-small").textContent = live?.small ?? "";
  if (z.phase === "won" || z.phase === "lost") {
    $("result").classList.remove("hidden");
    const copy = resultCopy(z.phase === "won", z.falling);
    $("result-label").textContent = copy.label;
    $("result-title").textContent = copy.title;
    $("result-copy").textContent = copy.copy;
    $("result-stats").textContent = `${Math.floor(z.s)} m · ${z.kills} defeated · best combo ${z.bestCombo}x · score ${z.score}`;
  }
}

/* ------------------------------------------------------------------ frame */

function render(dt: number): void {
  if (!app || !runtime || renderFailed) return;
  try {
    runtime.update(z, dt, renderTime, pendingEvents);
    pendingEvents = [];
    app.step(0);
    frames++;
  } catch (error) {
    renderFailed = true;
    reportError(error);
    throw error;
  }
}

let lastTick = performance.now();
function tick(now: number): void {
  requestAnimationFrame(tick);
  const dt = Math.min(0.1, Math.max(0.001, (now - lastTick) / 1000));
  lastTick = now;
  if (!ready) return;
  renderTime += dt;
  if (countdown > 0) {
    countdown -= dt;
    $("countdown").textContent = countdown <= 0.35 ? "GO" : String(Math.ceil((countdown - 0.35) / 0.62));
    if (countdown <= 0) begin();
  }
  audio.update({ form: z.form, speed: z.speed, running: z.phase === "running" });
  if (!config.manual && z.phase === "running") {
    accumulator += dt;
    let guard = 0;
    while (accumulator >= SIM_STEP && guard++ < 12) { step(1); accumulator -= SIM_STEP; }
  }
  render(dt);
  updateHud();
}

/* ------------------------------------------------------------------ input */

const KEYS: Record<string, Action> = { KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right", Space: "cycleForm", ArrowUp: "jump", KeyW: "jump", KeyS: "slide", ArrowDown: "slide", ShiftLeft: "dash", ShiftRight: "dash", Digit1: "clones", Digit2: "rasengan", Digit3: "rasenshuriken" };
addEventListener("keydown", (e) => {
  if (!ready || e.repeat) return;
  audio.unlock();
  if (e.code === "Escape") { setPaused(z.phase === "running"); return; }
  if (e.code === "KeyM") { audio.toggleMute(); $("mute").textContent = audio.muted ? "Sound off" : "Sound on"; return; }
  if (e.code === "Enter" && (z.phase === "intro" || z.phase === "won" || z.phase === "lost")) { startWithCountdown(); return; }
  const a = KEYS[e.code];
  if (a) { e.preventDefault(); act(a); }
});
let swipe: { x: number; y: number } | null = null;
canvas.addEventListener("pointerdown", (e) => { audio.unlock(); if (e.pointerType === "mouse") act("rasengan"); else swipe = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener("pointerup", (e) => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  swipe = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) act(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy < 0 ? "jump" : "slide");
  else act("rasengan");
});
document.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((b) => b.addEventListener("click", () => act(b.dataset.action as Action)));
document.querySelectorAll<HTMLButtonElement>("[data-form]").forEach((b) => b.addEventListener("click", () => act(b.dataset.form as Action)));
$("start").addEventListener("click", startWithCountdown);
$("again").addEventListener("click", startWithCountdown);
$("resume").addEventListener("click", () => setPaused(false));
$("mute").addEventListener("click", () => { audio.unlock(); audio.toggleMute(); $("mute").textContent = audio.muted ? "Sound off" : "Sound on"; });

/* ------------------------------------------------------------------ capture hooks */

const info = () => ({ frames, simSteps, phase: z.phase });

const api = {
  ready: () => ready,
  config: () => ({ ...config }),
  info,
  get state() { return z; },
  snapshot: () => snapshot(z),
  begin,
  /** The original's `restart()`: a fresh state object, running at s = 0. */
  reset() { begin(); return snapshot(z); },
  applyInput: (action: Action) => act(action),
  /** Run `n` fixed 1/120 s steps (optionally applying `actions` before each step), then render once. */
  stepFrames(n: number, actions?: readonly Action[]) { step(Math.max(0, n | 0), actions); updateHud(); runtime?.resetCamera(); render(0); return snapshot(z); },
  /** Step the live sim without rendering until `form` is active, the run ends, or `maxSteps` pass; renders once at the end. */
  advanceUntil(form: string | null, maxSteps: number) {
    let n = 0;
    while (n < maxSteps && z.phase === "running" && (form === null || z.form !== form)) { step(1); n++; }
    updateHud();
    runtime?.resetCamera();
    render(0);
    return { steps: n, ...snapshot(z) };
  },
  /** Step the live sim without rendering until distance `s`, one of the requested moments (`attack`, `shuriken`, `clones`, `form`) or the end of the run; renders once. */
  advanceTo(s: number, stops: readonly string[] = [], maxSteps = 60000) {
    let n = 0, stop: string | null = null;
    const startForm = z.form;
    while (n < maxSteps && z.phase === "running" && z.s < s && !stop) {
      step(1); n++;
      if (stops.includes("attack") && z.attack > 0) stop = "attack";
      else if (stops.includes("shuriken") && z.shurikenCast > 0) stop = "shuriken";
      else if (stops.includes("clones") && z.clones > 0) stop = "clones";
      else if (stops.includes("form") && z.form !== startForm) stop = "form";
    }
    updateHud();
    runtime?.resetCamera();
    render(0);
    return { steps: n, stop, ...snapshot(z) };
  },
  setAutopilot(on: boolean, next?: PolicyParams) { autopilotOn = on; if (next) policy = next; },
  /** Render `frames` real-time frames of `dt` seconds (animation clocks, particles) without advancing the sim; for captures. */
  settle(frames = 6, dt = 1 / 60) { for (let i = 0; i < frames; i++) { renderTime += dt; render(dt); } updateHud(); },
  audio: () => ({ supported: audio.supported, active: audio.active, muted: audio.muted }),
  /** Replay a recorded action script (the capture's `script` string) into a fresh recorded run; no rendering per step. */
  replay: (text: string, maxSteps = 40000) => summary(replayScript(decodeActionScript(text), maxSteps)),
  runPolicy: (p: PolicyParams = DEFAULT_POLICY, maxSteps = 40000) => summary(runPolicy(p, maxSteps)),
  runIdle: (maxSteps = 40000) => summary(runIdle(maxSteps)),
  courseDigest: () => courseDigest(createState(config.seed)),
  probeBones: () => runtime?.probeBones(),
  stats: () => ({ ...(runtime?.stats() ?? { visibleActors: 0, actors: ACTOR_COUNT, pickups: 0, particles: 0 }), shared: actors ? { textureEntries: actors.sharedTextureEntries, refs: actors.sharedTextureRefs, clips: actors.clips, clip: actors.clip } : null }),
  diagnostics: () => app?.diagnostics() ?? null,
  appInfo: () => app?.info ?? null,
  routeHealth: () => (app ? createAuraRouteHealthSnapshot(app, { parityIds: ["SG-03", "SG-05", "SH-02", "SH-01", "SA-04", "ST-02", "R-23", "R-26"] }) : null),
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
  async pixels(): Promise<{ width: number; height: number; litPixels: number }> {
    if (!app?.capture) throw new Error("capture unavailable");
    const blob = (await app.capture({ type: "png-blob" })) as Blob;
    const bitmap = await createImageBitmap(blob);
    const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = surface.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i]! + data[i + 1]! + data[i + 2]! > 40) lit++;
    return { width: bitmap.width, height: bitmap.height, litPixels: lit };
  }
};

function summary(r: ReturnType<typeof replayScript>) {
  const { state: _state, ...rest } = r;
  return rest;
}

/** QA-compatible subset of the original's `window.__konoha` (`ready`, `state`, `start`, `restart`, `action`, `simulate`, `snapshot`). */
const konoha = {
  get ready() { return ready; },
  get state() { return z; },
  start: begin,
  restart: begin,
  action: (a: Action) => act(a),
  snapshot: () => snapshot(z),
  simulate(seconds: number, autopilot = false) {
    if (z.phase === "intro") begin();
    const n = Math.floor(seconds * 120);
    for (let i = 0; i < n && z.phase === "running"; i++) {
      if (autopilot) for (const a of qaAutopilotActions(z)) applyAction(z, a);
      stepSim(z, SIM_STEP);
      simSteps++;
      handle(drainEvents(z));
    }
    updateHud();
    render(1 / 60);
    return snapshot(z);
  }
};

declare global {
  interface Window {
    __AURA_NINJA_RUNNER__?: typeof api;
    __konoha?: typeof konoha;
    __AURA_NINJA_RUNNER_ERROR__?: string;
  }
}
window.__AURA_NINJA_RUNNER__ = api;
window.__konoha = konoha;

/* ------------------------------------------------------------------ boot */

function sizeCanvas(): void {
  const dpr = Math.min(devicePixelRatio || 1, config.quality === "low" ? 1 : 1.5);
  canvas.width = Math.max(2, Math.round(canvas.clientWidth * dpr));
  canvas.height = Math.max(2, Math.round(canvas.clientHeight * dpr));
}

async function boot(): Promise<void> {
  sizeCanvas();
  actors = await loadActors(canvas);
  const world = buildWorld({ canvas, actors, entities: z.entities, quality: config.quality });
  app = createAuraApp(canvas, {
    autoStart: false,
    resize: false,
    pixelRatio: 1,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    output: { toneMapping: "aces", dither: false },
    scene: world.scene
  });
  await app.ready();
  runtime = world.bind(app);
  ready = true;
  $("loading-status").textContent = "Ready.";
  $<HTMLButtonElement>("start").disabled = false;
  render(0);
  updateHud();
  if (config.autostart) begin();
}

function reportError(error: unknown): void {
  const base = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const code = (error as { code?: unknown })?.code;
  const details = (error as { details?: unknown })?.details;
  const message = `${base}${typeof code === "string" ? ` [${code}]` : ""}${details ? ` ${JSON.stringify(details).slice(0, 6000)}` : ""}`;
  if (!window.__AURA_NINJA_RUNNER_ERROR__) window.__AURA_NINJA_RUNNER_ERROR__ = message;
  $("loading-status").textContent = `The village could not load: ${message.slice(0, 300)}`;
  console.error(error);
}

addEventListener("resize", sizeCanvas);
requestAnimationFrame(tick);
boot().catch(reportError);
