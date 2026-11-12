/**
 * Splat on Aura3D: boot, fixed-step loop, pointer input, HUD and capture hooks. The game lives in `sim.ts`
 * (pure); `world.ts` renders it through the public engine surface.
 *
 * Query parameters (all optional): `seed=N`, `manual=1` (the sim only advances through
 * `__AURA_SPLAT_RUSH__.stepFrames`), `autostart=1`, `autopilot=1`, `warmup=N` (idle splash frames before
 * `autostart`, default 30 like the capture harness), `dpr=N` (fix the pixel ratio; default: device ratio up to 2,
 * dropping to 1 when the first seconds of play run slower than about 36 fps), `motion=reduced|full` and `symbols=1`
 * (override the stored settings, for captures).
 *
 * Settings (stored in localStorage): sound (M), colour symbols on gates and ball (C), reduced motion (follows
 * `prefers-reduced-motion` until changed). P or Esc pauses; hiding the tab pauses a run and suspends the audio.
 *
 * GU47 WP-26: `look=original|carnival` (default carnival, `look.ts`) is presentation only; the sim, its random stream,
 * replays and traces are identical across looks.
 */
import "../../apps/showcase-port-shared/hud-tokens.css";
import { createAuraApp, createAuraRouteHealthSnapshot, createFixedStepLoop, installQaHooks, readQaParams, type AuraApp, type AuraOutputOptions } from "@aura3d/engine";
import { warmPrograms } from "@aura3d/engine/game";
import { createImpactRig } from "../../apps/showcase-port-shared/feel";
import { createGradingLut } from "../../apps/showcase-port-shared/vfx-pack";
import { createLoadingProgress } from "../shared/loading-progress";
import { labAppOptions, labRenderWorker, readLabFlags } from "../shared/lab-flags";
import { Autopilot } from "./autopilot";
import { SplatSound, diffSounds, type FrameState } from "./audio";
import { ScreenFx, flashFor, flashStrength } from "./fx";
import { COLORS, IDLE, PHASE_CODE, SplatRushSim, TRACE_COLUMNS, expandScript, parseScript, replay, type Input } from "./sim";
import { SteadyCamera, createSplatPresenter, drainPopups } from "./presentation";
import { TITLE_RAIL_SECONDS, buildWorld, hexLinear, type WorldRuntime } from "./world";
import { LOOKS, QA_CROPS, parseLook } from "./look";
import { MOTE_EVERY, fireMote, fireSplashes, moteFor, registerPaintPresets, splashesFor } from "./vfx3d";
import {
  HUD_CARNIVAL_CLASS, ICON_RAINBOW, ICON_SHIELD, ICON_SOUND_OFF, ICON_SOUND_ON, ICON_X2, SHAPE_GLYPHS,
  comboTubeFill, letterbox, upgradeRuntimeHudDom
} from "./hud";

/* Licensed Whitney Semibold (600) mapped onto 'Splat Display' for zero synthetic bold and crisp HUD density */
if (typeof FontFace !== "undefined" && typeof document !== "undefined") {
  const face = new FontFace("Splat Display", `url(${new URL("../../apps/showcase-port-shared/fonts/whitney-semibold.woff2", import.meta.url).href})`, { weight: "600", display: "swap" });
  void face.load().then((f) => document.fonts.add(f)).catch(() => undefined);
}
const config = readQaParams({
  seed: { type: "number", default: 20261023 },
  manual: { type: "flag" },
  autostart: { type: "flag" },
  autopilot: { type: "flag" },
  warmup: { type: "number", default: 30 },
  dpr: { type: "number", default: 0 },
  motion: { type: "string", default: "" },
  symbols: { type: "flag" }
});

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`splat-rush-port: #${id} is missing`);
  return el as T;
};
const canvas = $<HTMLCanvasElement>("world");
/* GU47 CR-00: one look per page load, read once */
const look = LOOKS[parseLook(typeof location === "undefined" ? "" : location.search)];
/* CR-H1: the paint-world HUD rules in index.html are scoped to this body class (carnival only) */
if (look.id === "carnival") document.body.classList.add(HUD_CARNIVAL_CLASS);
upgradeRuntimeHudDom();
/** CR-V1 bursts fired since load (QA). */
let splashesFired = 0;
/** CR-V4 mote puffs fired since load (QA) and the step of the last puff (frames that run several steps skip none). */
let motesFired = 0;
let lastMoteStep = -1;
/** CR-V2 ball ribbon (E-F trail on the "ball" node), translated with road scroll so it streams cleanly behind the ball; none on reduced motion. */
let ribbon: {
  key: string;
  lastRoadZ: number;
  handle: { stop(o?: { immediate?: boolean }): void; translate?(dx: number, dy: number, dz: number): void };
} | null = null;
function updateRibbon(roadZ: number): void {
  const row = look.ribbon;
  const fxApi = app?.effects;
  const want = row && fxApi && !reducedMotion && !config.manual && sim.o.phase === "playing";
  const key = want ? (sim.o.isRainbowActive ? "rainbow" : `c${sim.o.playerColorIndex}`) : "";
  if (ribbon && ribbon.key === key) {
    const dz = roadZ - ribbon.lastRoadZ;
    ribbon.lastRoadZ = roadZ;
    if (Math.abs(dz) > 1e-6) ribbon.handle.translate?.(0, 0, dz);
    return;
  }
  ribbon?.handle.stop({ immediate: true });
  ribbon = null;
  if (!want || !row || !fxApi) return;
  /* life covers the last ~16 ball positions at 60 Hz; roadZ translation streams the ribbon down the moving track */
  const color = sim.o.isRainbowActive ? "#ffc58a" : (COLORS[sim.o.playerColorIndex] ?? "#ffffff");
  const handle = fxApi.trail("ball", {
    width: row.width,
    life: row.points / 60,
    color,
    colorTail: color,
    widthOverSpeed: [0, 8]
  });
  ribbon = { key, lastRoadZ: roadZ, handle };
}

let sim = new SplatRushSim(config.seed);
const presenter = createSplatPresenter(() => sim);
let app: AuraApp | undefined;
let runtime: WorldRuntime | undefined;
let ready = false;
let steps = 0;
let pilot: Autopilot | null = config.autopilot ? new Autopilot() : null;
let renderFailed = false;
const pending: Input = { start: false, down: false, up: false, dx: 0 };
/** `seq` of the next popup the HUD has not shown yet (C2: popups are drained by sequence, never by list index). */
let nextPopupSeq = 0;
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
/* C8: reduced motion follows the OS setting until the player changes it */
const prefersReduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const storedMotion = config.motion || store.get("splatRush.motion");
let reducedMotion = storedMotion === "reduced" ? true : storedMotion === "full" ? false : prefersReduced;
/* C7: colour symbols */
let symbols = config.symbols || store.get("splatRush.symbols") === "1";
/* C18: the first run shows a ring under the matching gate */
let guided = store.get("splatRush.guided") === "1";
let paused = false;
const steady = new SteadyCamera(sim);
/** Real-frame impact trauma & micro-FOV kick (`createImpactRig`, never read by `sim.ts`). */
let impactRig = createImpactRig({ reducedMotion });
let impactState = impactRig.step(0);
/** Real-frame 32-cell chroma ink-droplet flipbook burst at the ball (presentation only). */
let inkBurst: { x: number; y: number; z: number; color: readonly [number, number, number]; elapsed: number; duration: number } | null = null;
let hasSteered = false;
const resetVisualImpacts = (): void => {
  impactRig = createImpactRig({ reducedMotion });
  impactState = impactRig.step(0);
  inkBurst = null;
};
/** C18 results card: best combo and perfects of the current run. */
const runStats = { maxCombo: 0, perfects: 0 };
/** A run starts (splash to playing, a restart, or a QA reset): its stats start at zero. */
const resetRunStats = (): void => { runStats.maxCombo = 0; runStats.perfects = 0; };

/* ------------------------------------------------------------------ HUD */

/* C10: the HUD writes to the DOM only when a value changed */
const hudCache = new Map<string, string>();
const changed = (key: string, value: string): boolean => {
  if (hudCache.get(key) === value) return false;
  hudCache.set(key, value);
  return true;
};

let barsPhase = "";
let barsStart = 0;
function updateHud(): void {
  const o = sim.o;
  const scoreVal = Math.floor(o.score);
  const scoreKey = `${look.id}|${scoreVal}`;
  if (changed("score", scoreKey)) {
    if (look.id === "carnival") {
      $("hud-score").innerHTML = `<span class="hud-kicker">Score</span><span class="hud-num">${scoreVal.toLocaleString()}</span>`;
    } else {
      $("hud-score").textContent = `SCORE: ${scoreVal}`;
    }
  }
  if (changed("lives", String(o.lives))) {
    let lives = "";
    for (let i = 0; i < 3; i++) lives += `<div class="life-icon ${i >= o.lives ? "life-lost" : ""}"></div>`;
    $("hud-lives").innerHTML = lives;
  }
  const combo = $("hud-combo");
  const comboKey = o.combo > 0 ? `${look.id}|${o.combo}|${o.multiplier}` : "";
  if (changed("combo", comboKey)) {
    if (comboKey) {
      if (look.id === "carnival") {
        combo.innerHTML = `<span class="hud-num">${o.combo}</span><span class="hud-kicker">Streak</span>${o.multiplier > 1 ? `<span class="hud-num">&times;${o.multiplier}</span>` : ""}`;
        combo.style.display = "inline-flex";
      } else {
        combo.textContent = `${o.combo} COMBO${o.multiplier > 1 ? `  x${o.multiplier}` : ""}`;
        combo.style.display = "block";
      }
      combo.style.color = o.multiplier >= 4 ? "#f0433a" : o.multiplier === 3 ? "#b868e8" : o.multiplier === 2 ? "#5ecaf0" : "#f9c647";
    } else combo.style.display = "none";
  }
  if (look.id === "carnival") {
    const swatchBg = o.isRainbowActive ? "linear-gradient(135deg, #f0433a, #f9c647, #5ecaf0, #b868e8)" : (COLORS[o.playerColorIndex] ?? "#f0433a");
    const swatchGlyph = o.isRainbowActive ? "\u2726" : (SHAPE_GLYPHS[o.playerColorIndex] ?? "\u25CF");
    if (changed("swatch", `${swatchBg}|${swatchGlyph}`)) {
      const sw = $("hud-swatch");
      sw.style.background = swatchBg;
      sw.textContent = swatchGlyph;
    }
    const fill = `${Math.round(comboTubeFill(o.combo, o.multiplier) * 100)}%|${o.multiplier}`;
    if (changed("tube", fill)) {
      const el = $("hud-tube-fill");
      el.style.width = fill.split("|")[0] as string;
      el.style.background = o.multiplier >= 4 ? "#f0433a" : o.multiplier === 3 ? "#b868e8" : o.multiplier === 2 ? "#5ecaf0" : "#f9c647";
    }
    const showCue = o.phase === "playing" && !hasSteered && !pilot && !config.manual && o.distance < 180;
    if (changed("steer-cue", String(showCue))) {
      document.getElementById("steer-cue")?.setAttribute("data-hidden", String(!showCue));
    }
  }
  if (look.id === "carnival") {
    /* CR-C2 letterbox during the title rail (the rail itself is in world.ts); none on reduced motion or manual=1 */
    if (o.phase !== barsPhase) { barsPhase = o.phase; barsStart = sim.elapsed; }
    const k = letterbox(o.phase, sim.elapsed - barsStart, TITLE_RAIL_SECONDS, !reducedMotion && !config.manual).toFixed(3);
    if (changed("bars", k)) for (const id of ["bars-top", "bars-bottom"]) $(id).style.transform = `scaleY(${k})`;
  }
  let pills = "";
  if (o.rainbowTimer > 0) pills += `<span class="pu pu-rainbow">${ICON_RAINBOW}<span class="hud-num">${Math.ceil(o.rainbowTimer)}</span><span class="hud-unit">s</span></span>`;
  if (o.shieldActive) pills += `<span class="pu pu-shield">${ICON_SHIELD}<span>SHIELD</span></span>`;
  if (o.scoreX2Timer > 0) pills += `<span class="pu pu-x2">${ICON_X2}<span class="hud-num">2&times;</span> <span class="hud-num">${Math.ceil(o.scoreX2Timer)}</span><span class="hud-unit">s</span></span>`;
  if (changed("pills", pills)) {
    const bar = $("hud-powerups");
    bar.innerHTML = pills;
    bar.style.display = pills ? "flex" : "none";
  }
  if (changed("phase", o.phase)) {
    $("splash-screen").classList.toggle("hidden", o.phase !== "splash");
    $("gameover-screen").classList.toggle("hidden", o.phase !== "gameOver");
  }
  let perfectNow = false;
  const drained = drainPopups(sim.popups, nextPopupSeq);
  nextPopupSeq = drained.nextSeq;
  if (config.manual && drained.fresh.length > 0) $("popups").replaceChildren();
  for (const p of drained.fresh) {
    popupsShown++;
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
/** Popups the HUD has displayed since load (QA). */
let popupsShown = 0;

/* ------------------------------------------------------------------ audio, screen effects, results */

function showResults(score: number): void {
  const final = Math.floor(score);
  const isBest = final > best;
  if (isBest) { best = final; store.set("splatRush.best", String(best)); }
  const out = $("final-score");
  $("final-stats").innerHTML =
    `Best streak <span class="hud-num">${runStats.maxCombo}</span> &middot; Perfects <span class="hud-num">${runStats.perfects}</span> &middot; <span class="hud-num">${Math.floor(sim.o.distance).toLocaleString()}</span> m`;
  const paint = (shown: number, done: boolean): void => {
    out.innerHTML =
      `<span class="hud-kicker">Score</span><span class="hud-num">${shown.toLocaleString()}</span>` +
      (done ? `<br><span class="go-best">${isBest ? `NEW BEST <span class="hud-num">${best.toLocaleString()}</span>` : `Best <span class="hud-num">${best.toLocaleString()}</span>`}</span>` : "");
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
    rainbowTimer: o.rainbowTimer, scoreX2Timer: o.scoreX2Timer, playerColorIndex: o.playerColorIndex, milestone: o.milestone, perfect
  };
  const own = COLORS[o.playerColorIndex] ?? "#ffffff";
  const events = diffSounds(prevFrame, frame);
  /* CR-V1: gate-coloured paint splashes at the ball, seeded from the sim step (presentation only) */
  /* CR-V4: paint motes drifting up in front of the horizon (title and play; none on reduced motion or manual=1) */
  const moteStep = Math.floor(sim.n / MOTE_EVERY) * MOTE_EVERY;
  if (look.vfx && !config.manual && moteStep !== lastMoteStep) { lastMoteStep = moteStep; motesFired += fireMote(app?.effects, moteFor(moteStep, reducedMotion)); }
  if (look.vfx) splashesFired += fireSplashes(app?.effects, splashesFor(events, [sim.player.x, sim.player.y, sim.player.z], o.playerColorIndex, sim.n, reducedMotion));
  for (const event of events) {
    sound.play(event.sound, event.level);
    if (config.manual) continue;
    const flash = flashFor(event, o.playerColorIndex);
    if (flash) fx.flash(flash.color, flashStrength(flash.strength, reducedMotion));
    if (event.sound === "burst") fx.reveal(own, reducedMotion);
    if (!reducedMotion && look.id === "carnival") {
      if (event.sound === "perfect") {
        impactRig.trigger({ freezeSeconds: 0.04, trauma: 0.34, fovKickDeg: 2.4 });
        inkBurst = { x: sim.player.x, y: sim.player.y, z: sim.player.z, color: hexLinear(own), elapsed: 0, duration: 0.36 };
      } else if (event.sound === "match") {
        impactRig.trigger({ trauma: 0.16, fovKickDeg: 1.3 });
        inkBurst = { x: sim.player.x, y: sim.player.y, z: sim.player.z, color: hexLinear(own), elapsed: 0, duration: 0.28 };
      } else if (event.sound === "pickup" || event.sound === "milestone") {
        impactRig.trigger({ trauma: 0.2, fovKickDeg: 1.7 });
        inkBurst = { x: sim.player.x, y: sim.player.y, z: sim.player.z, color: hexLinear(own), elapsed: 0, duration: 0.3 };
      } else if (event.sound === "hit" || event.sound === "burst") {
        impactRig.trigger({ freezeSeconds: 0.055, trauma: 0.58, fovKickDeg: -2.2 });
        inkBurst = { x: sim.player.x, y: sim.player.y, z: sim.player.z, color: hexLinear("#f0433a"), elapsed: 0, duration: 0.42 };
      } else if (event.sound === "block") {
        impactRig.trigger({ trauma: 0.24, fovKickDeg: 1.1 });
      }
    }
  }
  prevFrame = frame;
  fx.vignette(o.multiplier, o.isRainbowActive, own, performance.now() / 1000, reducedMotion);
  if (o.phase !== lastPhase) {
    if (o.phase === "splash" || o.phase === "playing") fx.clearReveal();
    if (o.phase === "gameOver") {
      /* C18: the card sits on a translucent wash of the ball's colour, so the road shows through */
      $("gameover-screen").style.background = translucent(own, 0.55);
      showResults(o.score);
      if (!guided && !config.manual) { guided = true; store.set("splatRush.guided", "1"); }
    }
    if (o.phase !== "playing") $("popups").replaceChildren();
    sound.setIntensity(o.phase === "playing" || o.phase === "bursting" ? "play" : o.phase === "gameOver" ? "over" : "title");
    lastPhase = o.phase;
  }
  const bestEl = document.getElementById("splash-best");
  if (bestEl) {
    const nextBest = best > 0 ? `<span class="hud-kicker">Best</span><span class="hud-num">${best.toLocaleString()}</span>` : "";
    if (changed("splash-best", nextBest)) bestEl.innerHTML = nextBest;
  }
}

const translucent = (hex: string, alpha: number): string => {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${alpha})`;
};

/* ------------------------------------------------------------------ frame */

/** `live` draws the ball and camera between the last two steps (smooth on 120 and 144 Hz displays); everything else draws the exact latest step. */
function render(live = false): void {
  if (!app || !runtime || renderFailed) return;
  try {
    const shown = live ? presenter.present(loop, true) : undefined;
    const camera = reducedMotion ? steady.at(live ? loop.alpha : 1) : undefined;
    const activeBurst = !config.manual && !reducedMotion && inkBurst
      ? { x: inkBurst.x, y: inkBurst.y, z: inkBurst.z, color: inkBurst.color, progress: inkBurst.elapsed / inkBurst.duration }
      : null;
    runtime.update(sim, canvas.clientWidth / Math.max(1, canvas.clientHeight), {
      ...(shown ? { shown } : {}),
      ...(camera ? { camera } : {}),
      reducedMotion,
      symbols,
      guide: !guided,
      cameraLayers: !config.manual,
      ...(!config.manual && !reducedMotion ? { impact: impactState, inkBurst: activeBurst } : {})
    });
    updateRibbon(sim.scroll - (shown?.back ?? 0));
    app.step(0);
  } catch (error) {
    renderFailed = true;
    reportError(error);
    throw error;
  }
}

function advance(input: Input): void {
  const wasSplash = sim.o.phase === "splash";
  const seqBefore = sim.popupSeq;
  sim.advance(input);
  if (wasSplash && sim.o.phase === "playing") resetRunStats();
  /* results-card stats, counted per step so manual multi-step QA drives count them too */
  if (sim.o.combo > runStats.maxCombo) runStats.maxCombo = sim.o.combo;
  if (sim.popupSeq !== seqBefore) for (const p of sim.popups) if (p.seq >= seqBefore && p.text.startsWith("PERFECT")) runStats.perfects++;
  steady.step(sim);
  pilot?.observe(sim);
  steps++;
}

const loop = createFixedStepLoop({
  manual: config.manual,
  isActive: () => ready && !paused,
  step() {
    if (keyDir !== 0 && sim.o.phase === "playing") {
      if (!keyDragging) { pending.down = true; keyDragging = true; }
      pending.dx += keyDir * 12;
    }
    const input: Input = pilot ? pilot.next(sim, steps) : { ...pending };
    pending.start = pending.down = pending.up = false;
    pending.dx = 0;
    advance(input);
    presenter.afterStep();
  },
  render(frameSeconds) {
    if (!config.manual && !reducedMotion) {
      impactState = impactRig.step(frameSeconds);
      if (inkBurst) {
        inkBurst.elapsed += Math.min(Math.max(frameSeconds, 0), 0.1);
        if (inkBurst.elapsed >= inkBurst.duration) inkBurst = null;
      }
    }
    render(!config.manual && sim.o.phase === "playing");
    updateHud();
    sampleQuality(frameSeconds);
  }
});

/* ------------------------------------------------------------------ C15: pixel ratio and quality tier */

/** Device ratio up to 2 (sharp on retina); `?dpr=N` fixes it. */
const deviceRatio = typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1;
let pixelRatio = config.dpr > 0 ? config.dpr : Math.min(2, deviceRatio);
const frameSamples: number[] = [];
/** After 90 frames of play, a median frame slower than 28 ms (about 36 fps) at a ratio above 1 drops the ratio to 1. */
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

async function boot(): Promise<void> {
  /* A1: the shared loading-progress helper drives a bar under PLAY NOW until the programs are compiled and the first frame is ready */
  const startButton = document.getElementById("btn-start");
  const loading = createLoadingProgress({ element: document.getElementById("load-bar") ?? undefined });
  startButton?.setAttribute("aria-busy", "true");
  loading.set(0.1);
  const world = buildWorld({ sim, aspect: canvas.clientWidth / Math.max(1, canvas.clientHeight), look });
  // WebGPU by default (backend "auto", WebGL2 fallback kept): real-GPU check 2026-11-08 rendered the same frame and kept
  // >= 0.9x the WebGL2 frame rate. `?backend=webgl2` forces WebGL2.
  const lab = labAppOptions(readLabFlags(), { backend: "auto", createWorker: labRenderWorker });
  const output: AuraOutputOptions =
    look.id === "carnival"
      ? ({
          toneMapping: "agx",
          exposure: 1.04,
          dither: true,
          lut: { ...createGradingLut("broadcast-crisp"), intensity: 0.45 },
          ...lab.output
        } as AuraOutputOptions)
      : { toneMapping: "none", dither: false, ...lab.output };
  app = createAuraApp(canvas, {
    autoStart: false,
    /* the engine owns the backing size (lessons-learned R1: never assign canvas size after ready) */
    resize: true,
    pixelRatio: { max: pixelRatio, min: 1 },
    /* lab flags (?backend=, ?gamut=) are EXPERIMENTAL and default OFF: with no flag `lab` is `{}` and nothing changes */
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic", ...lab.renderer },
    output,
    ...(lab.worker ? { worker: lab.worker } : {}),
    scene: world.scene
  });
  await loading.track(app.ready(), 1);
  loading.set(0.5);
  if (look.vfx && app.effects) registerPaintPresets(app.effects);
  runtime = world.bind(app);
  /* C14: compile every program, the pooled pickups and overlays included, before the first frame is shown */
  runtime.update(sim, canvas.clientWidth / Math.max(1, canvas.clientHeight), { symbols: true });
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
  startButton?.removeAttribute("aria-busy");
  if (config.autostart) {
    for (let i = 0; i < config.warmup; i++) advance(IDLE);
    steps = 0;
    if (!pilot) pilot = new Autopilot();
  }
  render();
  updateHud();
}
let warmResult: Awaited<ReturnType<typeof warmPrograms>> | null = null;

/* ------------------------------------------------------------------ pointer input (original: window-level pointer events) */

let lastX = 0;
let dragging = false;
addEventListener("pointerdown", (e) => {
  void sound.unlock();
  if (config.manual || pilot) return;
  const target = e.target as HTMLElement | null;
  if (target?.closest?.(".no-steer")) return;
  if (sim.o.phase === "gameOver" && target?.id !== "btn-restart") return;
  if (paused) return;
  if (sim.o.phase === "splash") pending.start = true;
  else pending.down = true;
  dragging = true;
  lastX = e.clientX;
  /* C5: keep the drag when the pointer leaves the window (never on a button, whose click would be lost) */
  if (!target?.closest?.("button")) {
    try { canvas.setPointerCapture?.(e.pointerId); } catch { /* the pointer is already gone */ }
  }
});
addEventListener("pointermove", (e) => {
  if (config.manual || pilot || !dragging) return;
  const delta = e.clientX - lastX;
  if (sim.o.phase === "playing" && Math.abs(delta) > 2) hasSteered = true;
  pending.dx += delta;
  lastX = e.clientX;
});
const release = (): void => {
  if (config.manual || pilot) return;
  dragging = false;
  pending.up = true;
};
addEventListener("pointerup", release);
addEventListener("pointercancel", release);
canvas.addEventListener("lostpointercapture", () => { if (dragging) release(); });

/** C5: drop every held input (window blur, hidden tab). */
function dropInput(): void {
  held.clear();
  keyDir = 0;
  if (keyDragging || dragging) pending.up = true;
  keyDragging = false;
  dragging = false;
}
addEventListener("blur", dropInput);

/* ------------------------------------------------------------------ C17: pause and hidden tab */

function setPaused(on: boolean): void {
  if (on && sim.o.phase !== "playing") on = false;
  paused = on;
  $("pause-screen").classList.toggle("hidden", !paused);
  if (paused) dropInput();
  void sound.suspend(paused || document.hidden);
  loop.resetAccumulator();
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    dropInput();
    if (!config.manual && !pilot) setPaused(true);
  }
  void sound.suspend(paused || document.hidden);
});
$("btn-resume").addEventListener("click", () => setPaused(false));
$("btn-pause").addEventListener("click", () => { if (!config.manual && !pilot) setPaused(!paused); });

/* ------------------------------------------------------------------ settings: symbols (C7) and motion (C8) */

function paintSettings(): void {
  for (const el of document.querySelectorAll<HTMLButtonElement>("[data-setting]")) {
    const on = el.dataset.setting === "symbols" ? symbols : reducedMotion;
    el.setAttribute("aria-pressed", String(on));
    el.textContent = el.dataset.setting === "symbols" ? `Colour symbols: ${on ? "on" : "off"}` : `Reduced motion: ${on ? "on" : "off"}`;
  }
}
function toggleSetting(which: string): void {
  if (which === "symbols") { symbols = !symbols; store.set("splatRush.symbols", symbols ? "1" : "0"); }
  else { reducedMotion = !reducedMotion; store.set("splatRush.motion", reducedMotion ? "reduced" : "full"); resetVisualImpacts(); }
  paintSettings();
  render();
}
for (const el of document.querySelectorAll<HTMLButtonElement>("[data-setting]")) el.addEventListener("click", () => toggleSetting(el.dataset.setting ?? ""));
paintSettings();

function restart(): void {
  sim.begin();
  resetRunStats();
  resetVisualImpacts();
  presenter.reset();
  steady.reset(sim);
  nextPopupSeq = sim.popupSeq;
  prevFrame = null;
}
$("btn-restart").addEventListener("click", () => {
  if (config.manual || pilot) return;
  restart();
});
const muteButton = $("btn-mute");
const paintMute = (): void => {
  muteButton.innerHTML = sound.muted ? ICON_SOUND_OFF : ICON_SOUND_ON;
  muteButton.setAttribute("aria-pressed", String(sound.muted));
};
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
  if (e.code === "KeyC") { toggleSetting("symbols"); return; }
  if (e.code === "KeyP" || e.code === "Escape") { setPaused(!paused); return; }
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
    if (sim.o.phase === "playing") hasSteered = true;
    if (!keyDragging && sim.o.phase === "playing") { pending.down = true; keyDragging = true; }
  }
});
addEventListener("keyup", (e) => {
  if (!(e.code in KEY_DIR)) return;
  held.delete(e.code);
  keyDir = [...held].reduce((sum, k) => sum + (KEY_DIR[k] ?? 0), 0);
  if (held.size === 0 && keyDragging) { pending.up = true; keyDragging = false; }
});

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
    ribbon?.handle.stop({ immediate: true });
    ribbon = null;
    resetRunStats();
    resetVisualImpacts();
    presenter.reset();
    steady.reset(sim);
    steps = 0;
    nextPopupSeq = 0;
    prevFrame = null;
    lastPhase = "splash";
    pilot = config.autopilot ? new Autopilot() : null;
    render();
    updateHud();
  },
  extras: {
    /** `ready()` as a plain value (true once boot, program warm-up and any `autostart` warm-up frames are done), for
     * page-load readers that poll a property instead of calling a function (the example catalog's settle signal). */
    get booted(): boolean {
      return ready;
    },
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
      resetRunStats();
      resetVisualImpacts();
      presenter.reset();
      steady.reset(sim);
      steps = 0;
      nextPopupSeq = 0;
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
    },
    /** Restart from game over exactly like the PLAY AGAIN button (C2, C4 tests). */
    restart() {
      restart();
      render();
      updateHud();
      return snapshotState();
    },
    /** Presentation counters: popups shown and created, batch vertex uploads, pixel ratio, warm-up result. */
    presentation() {
      return { popupsShown, popupSeq: sim.popupSeq, nextPopupSeq, uploadedVertices: runtime?.uploadedVertices ?? 0, pixelRatio, paused, reducedMotion, symbols, guided, warm: warmResult, look: look.id, timeOfDayKey: runtime?.timeOfDayKey ?? -1, splashesFired, motesFired, vfxLive: app?.effects?.liveCount ?? 0 };
    },
    /** Change a setting without the UI (captures): `symbols`, `motion` or `guide`. */
    setting(which: "symbols" | "motion" | "guide", on: boolean) {
      if (which === "symbols") symbols = on;
      else if (which === "motion") { reducedMotion = on; resetVisualImpacts(); }
      else guided = !on;
      paintSettings();
      render();
      updateHud();
    },
    pause(on: boolean) {
      setPaused(on);
      return paused;
    }
  }
});

/* GU47 E-I capture crops (normalised; the chase camera keeps the ball, deck and sky in the same screen bands) */
{
  const qaGlobal = (globalThis as { __AURA_QA__?: Record<string, unknown> }).__AURA_QA__;
  if (qaGlobal) qaGlobal.crops = QA_CROPS[look.id];
}

function reportError(error: unknown): void {
  qa.reportError(error);
}

loop.start();
boot().catch((error) => {
  reportError(error);
  throw error;
});
