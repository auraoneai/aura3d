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
import { biomeAt, districtAt } from "./course";
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
  quality: params.get("quality") === "low" ? "low" : "high"
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

const FORM_LABEL: Record<string, string> = { base: "Naruto Uzumaki", sage: "Sage Mode", kurama: "Kurama Chakra Mode" };

function say(title: string, small: string, seconds: number): void { notice = { title, small, until: renderTime + seconds }; }

function handle(events: readonly SimEvent[]): void {
  for (const ev of events) {
    pendingEvents.push(ev);
    if (ev.type === "unlock") say("NEW FORM UNLOCKED", ev.form === "sage" ? "Sage Mode" : "Kurama Mode", 2.8);
    else if (ev.type === "form") say("CHAKRA AWAKENING", FORM_LABEL[ev.form as string] ?? "", 1.5);
    else if (ev.type === "rasenshuriken") say("WIND STYLE", "Rasenshuriken", 1.2);
    else if (ev.type === "dropWarning") say("LOOK ABOVE", "Shinobi descending", 1.4);
  }
}

function begin(): void {
  z = createState(config.seed);
  startRun(z);
  accumulator = 0;
  simSteps = 0;
  pendingEvents = [];
  handle(drainEvents(z));
  runtime?.resetCamera();
  say("", districtAt(z.s), 2.4);
  $("overlay").classList.add("hidden");
  $("result").classList.add("hidden");
  for (const id of ["stats", "vitals", "forms", "abilities"]) $(id).classList.remove("hidden");
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

function updateHud(): void {
  $("distance").textContent = String(Math.floor(z.s));
  $("kills").textContent = String(z.kills).padStart(2, "0");
  $("score").textContent = String(z.score);
  $("chakra").textContent = `${Math.round(z.chakra)} / ${TUNING.maxChakra}`;
  $("chakra-bar").style.width = `${(z.chakra / TUNING.maxChakra) * 100}%`;
  $("hearts").textContent = "♥".repeat(Math.max(0, z.health)) + "♡".repeat(Math.max(0, TUNING.health - z.health));
  $("district").textContent = `${districtAt(z.s)} · ${biomeAt(z.s)}`;
  document.querySelectorAll<HTMLButtonElement>("#forms button").forEach((b) => {
    const form = b.dataset.form as string;
    b.classList.toggle("selected", z.form === form);
    b.disabled = form !== "base" && z.s < (form === "sage" ? 600 : 1620);
  });
  const live = notice && notice.until > renderTime ? notice : null;
  $("announce-title").textContent = live?.title ?? "";
  $("announce-small").textContent = live?.small ?? "";
  if (z.phase === "won" || z.phase === "lost") {
    $("result").classList.remove("hidden");
    $("result-label").textContent = z.phase === "won" ? "MISSION COMPLETE" : "MISSION REPORT";
    $("result-title").textContent = z.phase === "won" ? "The Hidden Leaf stands." : "The fire still burns.";
    $("result-copy").textContent = z.phase === "won" ? "From Konoha to the Valley of the End." : z.falling ? "Missed the jump. Jump before the edge to clear rooftop and branch gaps." : "Gather your chakra and go again.";
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
  if (e.code === "Escape") { if (z.phase === "running") z.phase = "paused"; else if (z.phase === "paused") z.phase = "running"; return; }
  if (e.code === "Enter" && z.phase === "intro") { begin(); return; }
  const a = KEYS[e.code];
  if (a) { e.preventDefault(); act(a); }
});
let swipe: { x: number; y: number } | null = null;
canvas.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") act("rasengan"); else swipe = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener("pointerup", (e) => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  swipe = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) act(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy < 0 ? "jump" : "slide");
  else act("rasengan");
});
document.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((b) => b.addEventListener("click", () => act(b.dataset.action as Action)));
document.querySelectorAll<HTMLButtonElement>("[data-form]").forEach((b) => b.addEventListener("click", () => act(b.dataset.form as Action)));
$("start").addEventListener("click", begin);
$("again").addEventListener("click", begin);

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
  setAutopilot(on: boolean, next?: PolicyParams) { autopilotOn = on; if (next) policy = next; },
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
  const world = buildWorld({ canvas, actors, entities: z.entities });
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
