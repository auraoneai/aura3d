/**
 * Splat Rush on Aura3D: boot, fixed-step loop, pointer input, HUD and capture hooks. The game lives in `sim.ts`
 * (pure); `world.ts` renders it through the public engine surface.
 *
 * Query parameters (all optional): `seed=N`, `manual=1` (the sim only advances through
 * `__AURA_SPLAT_RUSH__.stepFrames`), `autostart=1`, `autopilot=1`, `warmup=N` (idle splash frames before
 * `autostart`, default 30 like the capture harness).
 */
import { createAuraApp, createAuraRouteHealthSnapshot, createFixedStepLoop, installQaHooks, readQaParams, type AuraApp } from "@aura3d/engine";
import { Autopilot } from "./autopilot";
import { SplatSound, diffSounds, type FrameState } from "./audio";
import { ScreenFx, flashFor } from "./fx";
import { COLORS, IDLE, PHASE_CODE, SplatRushSim, TRACE_COLUMNS, expandScript, parseScript, replay, type Input } from "./sim";
import { buildWorld, type WorldRuntime } from "./world";


/* GT Walsheim Bold (licensed library, assets/GT-Walsheim-Bold.woff2): the heavy rounded face the HUD, popups and cards use */
if (typeof FontFace !== "undefined" && typeof document !== "undefined") {
  const face = new FontFace("Splat Display", `url(${new URL("./assets/GT-Walsheim-Bold.woff2", import.meta.url).href})`, { weight: "700" });
  void face.load().then((f) => document.fonts.add(f)).catch(() => undefined);
}
const config = readQaParams({
  seed: { type: "number", default: 20261023 },
  manual: { type: "flag" },
  autostart: { type: "flag" },
  autopilot: { type: "flag" },
  warmup: { type: "number", default: 30 }
});

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`splat-rush-port: #${id} is missing`);
  return el as T;
};
const canvas = $<HTMLCanvasElement>("world");

let sim = new SplatRushSim(config.seed);
let app: AuraApp | undefined;
let runtime: WorldRuntime | undefined;
let ready = false;
let steps = 0;
let pilot: Autopilot | null = config.autopilot ? new Autopilot() : null;
let renderFailed = false;
const pending: Input = { start: false, down: false, up: false, dx: 0 };
let popupShown = 0;
let scriptInputs: Input[] = [];
let scriptIdx = 0;

/* presentation state (never read by the simulation) */
const sound = new SplatSound();
let fx: ScreenFx | undefined;
let prevFrame: FrameState | null = null;
let lastPhase = "splash";
let keyDir = 0;
let keyDragging = false;
const store = {
  get(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string): void { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } }
};
let best = Number(store.get("splatRush.best")) || 0;
sound.muted = store.get("splatRush.muted") === "1";

/* ------------------------------------------------------------------ HUD */

function updateHud(): void {
  const o = sim.o;
  $("hud-score").textContent = `SCORE: ${Math.floor(o.score)}`;
  let lives = "";
  for (let i = 0; i < 3; i++) lives += `<div class="life-icon ${i >= o.lives ? "life-lost" : ""}"></div>`;
  $("hud-lives").innerHTML = lives;
  const combo = $("hud-combo");
  if (o.combo > 0) {
    combo.textContent = `${o.combo} COMBO${o.multiplier > 1 ? `  x${o.multiplier}` : ""}`;
    combo.style.display = "block";
    combo.style.color = o.multiplier >= 4 ? "#f0433a" : o.multiplier === 3 ? "#b868e8" : o.multiplier === 2 ? "#5ecaf0" : "#f9c647";
  } else combo.style.display = "none";
  let pills = "";
  if (o.rainbowTimer > 0) pills += `<span class="pu pu-rainbow">🌈 ${Math.ceil(o.rainbowTimer)}s</span>`;
  if (o.shieldActive) pills += '<span class="pu pu-shield">🛡 SHIELD</span>';
  if (o.scoreX2Timer > 0) pills += `<span class="pu pu-x2">✦ 2x ${Math.ceil(o.scoreX2Timer)}s</span>`;
  const bar = $("hud-powerups");
  bar.innerHTML = pills;
  bar.style.display = pills ? "flex" : "none";
  $("splash-screen").classList.toggle("hidden", o.phase !== "splash");
  const over = $("gameover-screen");
  over.classList.toggle("hidden", o.phase !== "gameOver");
  let perfectNow = false;
  if (config.manual && popupShown < sim.popups.length) $("popups").replaceChildren();
  while (popupShown < sim.popups.length) {
    const p = sim.popups[popupShown++] as (typeof sim.popups)[number];
    if (p.text.startsWith("PERFECT")) perfectNow = true;
    const el = document.createElement("div");
    el.className = "popup-text";
    el.textContent = p.text;
    el.style.color = p.color;
    el.style.marginLeft = `${p.at * 100}%`;
    const host = $("popups");
    host.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
    while (host.children.length > 3) host.firstElementChild?.remove();
  }
  reactToFrame(perfectNow);
}

/* ------------------------------------------------------------------ audio, screen effects, results */

function showResults(score: number): void {
  const final = Math.floor(score);
  const isBest = final > best;
  if (isBest) { best = final; store.set("splatRush.best", String(best)); }
  const out = $("final-score");
  const paint = (shown: number, done: boolean): void => {
    out.innerHTML =
      `Score: ${shown.toLocaleString()}` +
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

function reactToFrame(perfect: boolean): void {
  const o = sim.o;
  fx ??= new ScreenFx();
  const frame: FrameState = {
    phase: o.phase, lives: o.lives, combo: o.combo, multiplier: o.multiplier, score: o.score, shieldActive: o.shieldActive,
    rainbowTimer: o.rainbowTimer, scoreX2Timer: o.scoreX2Timer, playerColorIndex: o.playerColorIndex, perfect
  };
  const own = COLORS[o.playerColorIndex] ?? "#ffffff";
  for (const event of diffSounds(prevFrame, frame)) {
    sound.play(event.sound, event.level);
    if (config.manual) continue;
    const flash = flashFor(event, o.playerColorIndex);
    if (flash) fx.flash(flash.color, flash.strength);
    if (event.sound === "burst") fx.reveal(own);
  }
  prevFrame = frame;
  fx.vignette(o.multiplier, o.isRainbowActive, own, performance.now() / 1000);
  if (o.phase !== lastPhase) {
    if (o.phase === "splash" || o.phase === "playing") fx.clearReveal();
    if (o.phase === "gameOver") { $("gameover-screen").style.background = own; showResults(o.score); }
    if (o.phase !== "playing") $("popups").replaceChildren();
    sound.setIntensity(o.phase === "playing" || o.phase === "bursting" ? "play" : o.phase === "gameOver" ? "over" : "title");
    lastPhase = o.phase;
  }
  const bestEl = document.getElementById("splash-best");
  if (bestEl) bestEl.textContent = best > 0 ? `Best: ${best.toLocaleString()}` : "";
}

/* ------------------------------------------------------------------ frame */

function render(): void {
  if (!app || !runtime || renderFailed) return;
  try {
    runtime.update(sim, canvas.clientWidth / Math.max(1, canvas.clientHeight));
    app.step(0);
  } catch (error) {
    renderFailed = true;
    reportError(error);
    throw error;
  }
}

function advance(input: Input): void {
  sim.advance(input);
  pilot?.observe(sim);
  steps++;
}

const loop = createFixedStepLoop({
  manual: config.manual,
  isActive: () => ready,
  step() {
    if (keyDir !== 0 && sim.o.phase === "playing") {
      if (!keyDragging) { pending.down = true; keyDragging = true; }
      pending.dx += keyDir * 12;
    }
    const input: Input = pilot ? pilot.next(sim, steps) : { ...pending };
    pending.start = pending.down = pending.up = false;
    pending.dx = 0;
    advance(input);
  },
  render() {
    render();
    updateHud();
  }
});

function sizeCanvas(): void {
  const dpr = 1;
  canvas.width = Math.max(2, Math.round(canvas.clientWidth * dpr));
  canvas.height = Math.max(2, Math.round(canvas.clientHeight * dpr));
}

async function boot(): Promise<void> {
  sizeCanvas();
  const world = buildWorld({ sim, aspect: canvas.clientWidth / Math.max(1, canvas.clientHeight) });
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
  if (config.autostart) {
    for (let i = 0; i < config.warmup; i++) advance(IDLE);
    steps = 0;
    if (!pilot) pilot = new Autopilot();
  }
  render();
  updateHud();
}

/* ------------------------------------------------------------------ pointer input (original: window-level pointer events) */

let lastX = 0;
let dragging = false;
addEventListener("pointerdown", (e) => {
  void sound.unlock();
  if (config.manual || pilot) return;
  const target = e.target as HTMLElement | null;
  if (target?.closest?.(".no-steer")) return;
  if (sim.o.phase === "gameOver" && target?.id !== "btn-restart") return;
  if (sim.o.phase === "splash") pending.start = true;
  else pending.down = true;
  dragging = true;
  lastX = e.clientX;
});
addEventListener("pointermove", (e) => {
  if (config.manual || pilot || !dragging) return;
  pending.dx += e.clientX - lastX;
  lastX = e.clientX;
});
const release = (): void => {
  if (config.manual || pilot) return;
  dragging = false;
  pending.up = true;
};
addEventListener("pointerup", release);
addEventListener("pointercancel", release);
function restart(): void {
  sim.begin();
  popupShown = sim.popups.length;
  prevFrame = null;
}
$("btn-restart").addEventListener("click", () => {
  if (config.manual || pilot) return;
  restart();
});
const muteButton = $("btn-mute");
const paintMute = (): void => { muteButton.textContent = sound.muted ? "\u{1F507}" : "\u{1F50A}"; muteButton.setAttribute("aria-pressed", String(sound.muted)); };
const toggleMute = (): void => { sound.setMuted(!sound.muted); store.set("splatRush.muted", sound.muted ? "1" : "0"); paintMute(); };
muteButton.addEventListener("click", toggleMute);
paintMute();

/* keyboard (the original is pointer-only): Space/Enter start and restart, arrows or A/D steer, M mutes */
const KEY_DIR: Record<string, number> = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };
const held = new Set<string>();
addEventListener("keydown", (e) => {
  void sound.unlock();
  if (config.manual || pilot || e.repeat) return;
  if (e.code === "KeyM") { toggleMute(); return; }
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
    if (!keyDragging && sim.o.phase === "playing") { pending.down = true; keyDragging = true; }
  }
});
addEventListener("keyup", (e) => {
  if (!(e.code in KEY_DIR)) return;
  held.delete(e.code);
  keyDir = [...held].reduce((sum, k) => sum + (KEY_DIR[k] ?? 0), 0);
  if (held.size === 0 && keyDragging) { pending.up = true; keyDragging = false; }
});
addEventListener("resize", sizeCanvas);

/* ------------------------------------------------------------------ hooks */

function snapshotState() {
  const o = sim.o;
  return { ...o, phaseCode: PHASE_CODE[o.phase], steps, n: sim.n, rngCount: sim.rng.count, gates: sim.gates.length, powerups: sim.powerups.length, splatters: sim.splatters.length, segments: sim.segments.length, player: { ...sim.player }, camera: { ...sim.camera }, ye: sim.ye };
}

const qa = installQaHooks("splat-rush", {
  ready: () => ready,
  seed: config.seed,
  state: snapshotState,
  traceRow: () => sim.traceRow(steps),
  traceColumns: TRACE_COLUMNS,
  app: () => app,
  routeHealth: () => (app ? createAuraRouteHealthSnapshot(app, { parityIds: ["SH-02", "SG-05", "SG-01", "ST-01", "ST-02", "R-23"] }) : null),
  nodeCount: () => runtime?.nodeCount ?? 0,
  begin() {
    advance({ start: true, down: false, up: false, dx: 0 });
    render();
    updateHud();
  },
  /** Manual stepping: apply `input` on the first step (idle afterwards) and render once at the end. */
  stepFrames(n: number, input?: Partial<Input>) {
    for (let i = 0; i < n; i++) advance(i === 0 ? { ...IDLE, ...input } : IDLE);
    render();
    updateHud();
  },
  /** Headless replay of a capture script on a fresh sim (no rendering): returns the trace rows. */
  replay(text: string, warmup = config.warmup, seed = config.seed) {
    return replay(seed, warmup, expandScript(parseScript(text))).trace;
  },
  reset(seed = config.seed) {
    sim = new SplatRushSim(seed);
    steps = 0;
    popupShown = 0;
    prevFrame = null;
    lastPhase = "splash";
    pilot = config.autopilot ? new Autopilot() : null;
    render();
    updateHud();
  },
  extras: {
    /** Drive `n` steps with the closed-loop autopilot (start, drag, then steer), rendering once at the end. */
    runAutopilot(n: number, mistakeRows: number[] = []) {
      const driver = new Autopilot({ maxDx: 14, mistakeRows, aimOffset: 0 });
      for (let i = 0; i < n; i++) {
        advance(driver.next(sim, i));
        driver.observe(sim);
      }
      render();
      updateHud();
      return snapshotState();
    },
    /** Frame capture: reset, warm up like the capture harness, and store a recorded input script to play step by step. */
    loadScript(text: string, warmup = config.warmup) {
      sim = new SplatRushSim(config.seed);
      steps = 0;
      popupShown = 0;
      pilot = null;
      prevFrame = null;
      lastPhase = "splash";
      for (let i = 0; i < warmup; i++) advance(IDLE);
      steps = 0;
      scriptInputs = expandScript(parseScript(text));
      scriptIdx = 0;
      render();
      updateHud();
      return sim.o.phase;
    },
    /** Advance the stored script to step `to` (absolute index), then render once. */
    advanceScript(to: number) {
      while (scriptIdx < to) advance(scriptInputs[scriptIdx++] ?? IDLE);
      render();
      updateHud();
      return scriptIdx;
    },
    /** Start a run and never steer until `phase` (or `max` steps), like the original's idle control. */
    idleUntil(phase: string, max = 1500) {
      let n = 0;
      while (sim.o.phase !== phase && n < max) {
        advance(scriptIdx === 0 ? { ...IDLE, start: true } : scriptIdx === 1 ? { ...IDLE, down: true } : IDLE);
        scriptIdx++;
        n++;
      }
      render();
      updateHud();
      return `${sim.o.phase}:${scriptIdx}`;
    },
    /** Start the autopilot on the live sim (like `?autopilot=1`), for tests. */
    autopilot(on: boolean) {
      pilot = on ? new Autopilot() : null;
      steps = 0;
    }
  }
});

function reportError(error: unknown): void {
  qa.reportError(error);
}

loop.start();
boot().catch((error) => {
  reportError(error);
  throw error;
});
