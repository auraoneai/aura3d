/**
 * HEATSINK Time Trial on Aura3D: boot, fixed-step loop, input (keyboard, rebindable; touch on coarse pointers), pause,
 * DOM HUD and capture hooks. The simulation lives in `race.ts` (pure); `world.ts` renders it through the public engine
 * surface.
 *
 * Query parameters (all optional): `autostart=1` (skip the menu), `manual=1` (the sim only advances through
 * `__AURA_HEATSINK__.stepFrames`), `quality=high|low` (default: low on coarse-pointer devices, else high), `touch=1`
 * (show the touch controls on any device), `motion=reduced|full` (override the saved or system motion setting).
 */
import { bindGameTouchControls, createAuraApp, createAuraRouteHealthSnapshot, createFixedStepLoop, installQaHooks, type AuraApp } from "@aura3d/engine";
import { expandSegments, parseInputScript } from "../../tools/crayon-capture/heatsink-lib";
import { createHeatsinkAudio } from "./audio";
import { runBotRace, createBot, type BotOptions } from "./bot";
import { CFG } from "./config";
import { HudModel, MEDAL_TEXT, countText, formatTime } from "./hud";
import { STRIKE } from "./operation";
import { FRAME, Race } from "./race";
import { createHeatsinkPresenter, viewOf } from "./presentation";
import { Track } from "./track";
import { IDLE, type Input } from "./vehicle";
import { DRONE_CROP, buildWorld, type WorldRuntime } from "./world";
import { postToggles } from "./art/look";

const params = new URLSearchParams(location.search);
const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
const qualityParam = params.get("quality");
const config = {
  autostart: params.get("autostart") === "1",
  manual: params.get("manual") === "1",
  /* HP-12: coarse-pointer devices (phones, tablets) get the low tier and its lighter model set unless the URL asks */
  quality: (qualityParam === "low" || qualityParam === "high" ? qualityParam : coarse ? "low" : "high") as "high" | "low",
  qualityReason: qualityParam === "low" || qualityParam === "high" ? "url" : coarse ? "coarse-pointer" : "default"
};

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`heatsink-port: #${id} is missing`);
  return el as T;
};
const canvas = $<HTMLCanvasElement>("world");

/* every HUD node looked up once (HP-18) */
const el = {
  score: $("h-score"), mult: $("h-mult"), targets: $("h-targets"), objective: $("objective"), lap: $("h-lap"), time: $("h-time"),
  best: $("h-best"), speed: $("h-speed"), hull: $("h-hull"), notice: $("notice"), count: $("count"),
  abP: $("h-ab-p"), heatP: $("h-heat-p"), shieldP: $("h-shield-p"), gunP: $("h-gun-p"), heatLabel: $("h-heat-label"), gunLabel: $("h-gun-label"),
  ab: $("h-ab"), heat: $("h-heat"), shield: $("h-shield"), gun: $("h-gun"), gunRow: $("h-gun-row"),
  menu: $("menu"), results: $("results"), resultsTitle: $("results-title"), medalLine: $("medal-line"), resultsBody: $("results-body"), medalRules: $("medal-rules"),
  pause: $("pause"), error: $("error"), errorText: $("error-text"), loading: $("loading"), loadingStatus: $("loading-status"),
  touch: $("touch"), mute: $<HTMLButtonElement>("mute"), motion: $<HTMLButtonElement>("motion-toggle"), binds: $("binds"),
  menuObjective: $("menu-objective"), menuControls: $("menu-controls")
};
const setText = (node: HTMLElement, text: string): void => { if (node.textContent !== text) node.textContent = text; };

const audio = config.manual ? null : createHeatsinkAudio();
const track = new Track();
let race = new Race(track);
const presenter = createHeatsinkPresenter(() => race);
const hudModel = { current: new HudModel() };
let app: AuraApp | undefined;
let runtime: WorldRuntime | undefined;
let started = config.manual;
let paused = false;
let faulted = false;
let heldInput: Input | null = null;
let manualInput: Input | null = null;
let renderTime = 0;
let frames = 0;
let lastHud: ReturnType<HudModel["update"]> | undefined;
let lastCount = "";
let lastThrottle = 0;

/* ------------------------------------------------------------------ settings (HP-13) */

const STORE = { binds: "ion-circuit:binds", motion: "ion-circuit:motion" };
const store = {
  get(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string | null): void { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* private mode */ } }
};

type Action = "throttle" | "brake" | "left" | "right" | "afterburner" | "ramjet" | "drift" | "fire";
const ACTIONS: readonly { id: Action; label: string }[] = [
  { id: "throttle", label: "Throttle" }, { id: "brake", label: "Brake" }, { id: "left", label: "Steer left" }, { id: "right", label: "Steer right" },
  { id: "afterburner", label: "Afterburner" }, { id: "ramjet", label: "Overdrive" }, { id: "drift", label: "Drift" }, { id: "fire", label: "Fire" }
];
const DEFAULT_BIND: Readonly<Record<Action, readonly string[]>> = { throttle: ["KeyW", "ArrowUp"], brake: ["KeyS", "ArrowDown"], left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"], afterburner: ["ShiftLeft", "ShiftRight"], ramjet: ["Space"], drift: ["KeyE"], fire: ["KeyF", "KeyJ"] };
/** keys that are never bindable: pause, start, mute */
const RESERVED = new Set(["Escape", "Enter", "KeyM"]);

function loadBinds(): Record<Action, string[]> {
  const out = Object.fromEntries(ACTIONS.map((a) => [a.id, [...DEFAULT_BIND[a.id]]])) as Record<Action, string[]>;
  try {
    const saved = JSON.parse(store.get(STORE.binds) ?? "{}") as Partial<Record<Action, string>>;
    for (const a of ACTIONS) { const code = saved[a.id]; if (typeof code === "string" && !RESERVED.has(code)) out[a.id] = [code]; }
  } catch { /* corrupt entry: defaults */ }
  return out;
}
let BIND = loadBinds();

function rebind(action: Action, code: string): void {
  if (RESERVED.has(code)) return;
  for (const a of ACTIONS) BIND[a.id] = BIND[a.id].filter((c) => c !== code);
  BIND[action] = [code];
  const saved: Partial<Record<Action, string>> = {};
  for (const a of ACTIONS) if (BIND[a.id].join() !== DEFAULT_BIND[a.id].join()) saved[a.id] = BIND[a.id][0] ?? "";
  store.set(STORE.binds, Object.keys(saved).length ? JSON.stringify(saved) : null);
  bindTouch();
  renderBinds();
}

function resetBinds(): void {
  store.set(STORE.binds, null);
  BIND = loadBinds();
  bindTouch();
  renderBinds();
}

const keyName = (code: string): string => code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Arrow/, "").replace(/Left$|Right$/, (m) => (code.startsWith("Arrow") ? m : ""));

let listening: Action | null = null;
function renderBinds(): void {
  el.binds.replaceChildren(...ACTIONS.map((a) => {
    const row = document.createElement("div");
    row.className = "bind";
    const label = document.createElement("span");
    label.textContent = a.label;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = a.id;
    button.textContent = listening === a.id ? "Press a key" : BIND[a.id].map(keyName).join(" / ") || "unbound";
    button.addEventListener("click", () => { listening = listening === a.id ? null : a.id; renderBinds(); });
    row.append(label, button);
    return row;
  }));
  setText(el.menuControls, `${ACTIONS.map((a) => `${BIND[a.id].map(keyName).join("/")} ${a.label.toLowerCase()}`).join(", ")}. Esc pause, M mute.${touchMode ? " On touch: the drone accelerates by itself; hold the arrows to steer." : ""}`);
}

const prefersReduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const motionParam = params.get("motion");
let reducedMotion = motionParam === "reduced" ? true : motionParam === "full" ? false : store.get(STORE.motion) === "reduced" ? true : store.get(STORE.motion) === "full" ? false : prefersReduced;
let lowFps = false;
/** GU47 IC-08/IC-25: reduced motion drops motion blur and CA; fps < 30 for 3 s drops GTAO, motion blur, god rays, grain and CA */
function applyPost(): void {
  if (!app?.post) return;
  for (const [name, on] of postToggles(lookRow, { reducedMotion, lowFps })) {
    try { app.post.setEffectEnabled(name, on); } catch { /* effect not mounted on this tier */ }
  }
}
function applyMotion(): void {
  runtime?.setMotion({ reduced: reducedMotion, cinematic: !config.manual });
  applyPost();
  setText(el.motion, reducedMotion ? "Reduced motion: on" : "Reduced motion: off");
  el.motion.setAttribute("aria-pressed", String(reducedMotion));
}

/* ------------------------------------------------------------------ input */

const down = new Set<string>();
let steerSmooth = 0;
let pointerFire = false;
const held = (action: Action): boolean => BIND[action].some((k) => down.has(k));

/* HP-03: touch mode turns on for coarse pointers, a touch, or ?touch=1; then the drone throttles by itself */
let touchMode = coarse || params.get("touch") === "1";
function setTouchMode(on: boolean): void {
  if (touchMode === on && el.touch.classList.contains("hidden") !== on) return;
  touchMode = on;
  el.touch.classList.toggle("hidden", !on);
  document.body.classList.toggle("touch", on);
  renderBinds();
}

function sampleInput(dt: number): Input {
  if (heldInput) return heldInput;
  const target = (held("right") ? 1 : 0) - (held("left") ? 1 : 0);
  steerSmooth += (target - steerSmooth) * (1 - Math.exp(-dt * 12));
  const brake = held("brake") ? 1 : 0;
  const throttle = held("throttle") || (touchMode && !brake) ? 1 : 0;
  lastThrottle = throttle;
  return { throttle, brake, steer: steerSmooth, afterburner: held("afterburner"), ramjet: held("ramjet"), drift: held("drift"), fire: held("fire") || pointerFire };
}

const racing = (): boolean => started && !race.resultsOpen && (race.state === "countdown" || race.state === "race");

addEventListener("keydown", (e) => {
  if (listening) {
    e.preventDefault();
    if (e.code !== "Escape") rebind(listening, e.code);
    listening = null;
    renderBinds();
    return;
  }
  if (ACTIONS.some((a) => BIND[a.id].includes(e.code)) || e.code === "Space") e.preventDefault();
  if (e.isTrusted && e.code !== "Escape") setTouchMode(touchMode && params.get("touch") === "1");
  if (e.repeat) return;
  if (e.code === "Escape") { if (started && !race.resultsOpen) setPaused(!paused, "key"); return; }
  if (e.code === "Enter" && !started && ready) { begin(); return; }
  down.add(e.code);
});
addEventListener("keyup", (e) => down.delete(e.code));
const releaseAll = (): void => { down.clear(); steerSmooth = 0; pointerFire = false; };
/* HP-07: losing focus or hiding the tab mid-race pauses it */
addEventListener("blur", () => { releaseAll(); if (racing()) setPaused(true, "blur"); });
document.addEventListener("visibilitychange", () => { if (document.hidden) { releaseAll(); if (racing()) setPaused(true, "hidden"); } });
canvas.addEventListener("pointerdown", (e) => { if (e.pointerType === "touch") setTouchMode(true); else pointerFire = true; });
addEventListener("pointerup", () => { pointerFire = false; });
addEventListener("pointercancel", () => { pointerFire = false; });
addEventListener("touchstart", () => setTouchMode(true), { passive: true });

let touchBinding: { dispose(): void } | null = null;
function bindTouch(): void {
  touchBinding?.dispose();
  const code = (a: Action): string => BIND[a][0] ?? DEFAULT_BIND[a][0]!;
  touchBinding = bindGameTouchControls({
    hold: [
      { elementId: "t-left", code: code("left") }, { elementId: "t-right", code: code("right") }, { elementId: "t-brake", code: code("brake") },
      { elementId: "t-fire", code: code("fire") }, { elementId: "t-boost", code: code("afterburner") }, { elementId: "t-drift", code: code("drift") },
      { elementId: "t-over", code: code("ramjet") }
    ]
  });
}

/* ------------------------------------------------------------------ flow */

function setPaused(on: boolean, reason: "key" | "button" | "blur" | "hidden" | "resume" = "key"): void {
  paused = on && started && !race.resultsOpen;
  el.pause.classList.toggle("hidden", !paused);
  el.pause.dataset.reason = paused ? reason : "";
  if (paused) releaseAll();
  loop.resetAccumulator();
}

function begin(): void {
  race = new Race(track);
  presenter.reset();
  hudModel.current = new HudModel();
  runtime?.resetCamera();
  audio?.reset();
  loop.resetAccumulator();
  started = true;
  if (faulted) {
    /* a restart after a runtime error clears the error marks the panel set */
    document.documentElement.removeAttribute("data-aura3d-error");
    delete (window as unknown as Record<string, unknown>)[hooks.errorGlobalName];
  }
  faulted = false;
  setPaused(false, "resume");
  noticeT = 0;
  eventsSeen = 0;
  el.menu.classList.add("hidden");
  el.results.classList.add("hidden");
  el.error.classList.add("hidden");
}

function simulate(steps: number, input?: Input): void {
  for (let i = 0; i < steps; i++) {
    race.frame(FRAME, input ?? sampleInput(FRAME));
    lastHud = hudModel.current.update(FRAME, race);
  }
}

/* HP-06: crash reason and crashes left, written to #notice for 1.5 s */
const NOTICE_SECONDS = 1.5;
const CRASH_TEXT: Record<string, string> = { WALL: "Hit the wall", BARREL: "Barrel blast", OVERHEATED: "Overheated", PILLAR: "Hit a pillar", ROCK: "Hit a rock" };
let noticeT = 0;
let eventsSeen = 0;
function updateNotice(dt: number): void {
  if (eventsSeen > race.events.length) eventsSeen = 0;
  for (; eventsSeen < race.events.length; eventsSeen++) {
    const ev = race.events[eventsSeen]!;
    if (ev.type === "crash") {
      const left = CFG.vehicle.crashBudget - race.player.crashes;
      const why = CRASH_TEXT[String(ev.detail)] ?? "Crashed";
      setText(el.notice, left < 0 ? `${why}. Out of hull: DNF` : left === 0 ? `${why}. Last hull: the next crash ends the race` : `${why}. ${left} crash${left === 1 ? "" : "es"} left`);
      el.notice.classList.add("warn");
      noticeT = NOTICE_SECONDS;
    }
  }
  if (noticeT > 0) { noticeT -= dt; if (noticeT <= 0) { setText(el.notice, ""); el.notice.classList.remove("warn"); } }
}

function updateHud(v: NonNullable<typeof lastHud>, dt: number): void {
  setText(el.score, v.score); setText(el.mult, v.multiplier); setText(el.targets, v.targets); setText(el.objective, v.objective);
  el.mult.classList.toggle("hot", v.chain >= 2);
  setText(el.lap, v.lap); setText(el.time, v.time); setText(el.best, `best ${v.best}`); setText(el.speed, v.speed);
  setText(el.hull, `${"■".repeat(v.hull)}${"□".repeat(Math.max(0, v.hullMax - v.hull))}`);
  el.hull.setAttribute("aria-label", `hull ${v.hull} of ${v.hullMax}`);
  el.hull.classList.toggle("warn", v.hull <= 1);
  setText(el.abP, v.pct.ab); setText(el.heatP, v.pct.heat); setText(el.shieldP, v.pct.shield); setText(el.heatLabel, v.heatLabel);
  setText(el.gunLabel, v.gunLocked ? "LOCKED" : "GUN"); setText(el.gunP, v.gunLocked ? "cool" : v.pct.gun);
  el.gunRow.classList.toggle("locked", v.gunLocked);
  el.ab.style.width = v.width.ab; el.heat.style.width = v.width.heat; el.shield.style.width = v.width.shield; el.gun.style.width = v.width.gun;
  const count = countText(race);
  if (count !== lastCount) { lastCount = count; el.count.textContent = count; el.count.classList.toggle("hidden", !count); }
  updateNotice(dt);
  if (race.resultsOpen && el.results.classList.contains("hidden")) {
    el.results.classList.remove("hidden");
    const ops = race.ops;
    const time = race.player.finished ? race.player.finishTime : race.raceTime;
    el.resultsTitle.textContent = race.state === "dnf" ? "DNF" : "Finished";
    el.medalLine.textContent = race.state === "dnf"
      ? "No medal: finish the race to earn one"
      : ops.medal === "none" ? `No medal: ${ops.kills} of ${ops.totalTargets} kills (bronze needs ${STRIKE.medals.bronze})` : `${ops.medal.toUpperCase()} medal`;
    el.resultsBody.textContent = `Score ${ops.score}   Kills ${ops.kills}/${ops.totalTargets}   Barrels ${ops.barrelsShot}   Best chain ${ops.bestChain}   Accuracy ${ops.shots ? Math.round((ops.hits / ops.shots) * 100) : 0}%   Time ${formatTime(time)}   Best lap ${race.bestLap ? formatTime(race.bestLap) : "--"}   Crashes ${race.player.crashes}`;
    el.medalRules.textContent = MEDAL_TEXT;
  }
}

/** `live` draws the drone and bolts between the last two steps (smooth on 120 and 144 Hz displays); everything else draws the exact latest step. */
function render(dt: number, live = false): void {
  if (!app || !runtime) return;
  const v = lastHud ?? hudModel.current.update(0, race);
  updateHud(v, dt);
  audio?.update(race, { count: lastCount, throttle: lastThrottle, active: started && !paused && !faulted });
  runtime.update(live ? viewOf(race, presenter.present(loop, true)) : race, v, dt, renderTime, canvas.clientWidth / Math.max(1, canvas.clientHeight));
  app.step(0);
  frames++;
}

const loop = createFixedStepLoop({
  stepSeconds: FRAME,
  maxFrameSeconds: 0.1,
  maxCatchUpSteps: 7,
  manual: config.manual,
  isActive: () => ready && started && !paused && !faulted,
  step() {
    simulate(1, manualInput ?? undefined);
    presenter.afterStep();
  }
});

/* HP-12: a frame-time governor that lowers the pixel ratio when the device cannot keep up */
const governor = { cap: config.quality === "low" ? 1 : 1.65, sum: 0, n: 0, drops: 0 };
function govern(dt: number): void {
  if (config.manual || paused || !started) return;
  governor.sum += dt; governor.n++;
  if (governor.sum < 3) return;
  const mean = governor.sum / governor.n;
  governor.sum = 0; governor.n = 0;
  if (mean > 1 / 30 && !lowFps) { lowFps = true; applyPost(); }
  if (mean > 1 / 40 && governor.cap > 1) {
    governor.cap = Math.max(1, +(governor.cap - 0.3).toFixed(2));
    governor.drops++;
    sizeCanvas();
  }
}

let last = performance.now();
function tick(now: number): void {
  /* HP-05: the next frame is scheduled first, so one exception can never stop the loop */
  requestAnimationFrame(tick);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (faulted) return;
  try {
    loop.tick(now);
    if (ready && !config.manual) {
      /* HP-07: a paused race is frozen: no sim time, no render time, no particle motion */
      const frameDt = paused ? 0 : dt;
      renderTime += frameDt;
      render(frameDt, started && !paused && race.state === "race");
      govern(dt);
    }
  } catch (error) {
    runtimeError(error);
  }
}

/** a runtime exception: stop stepping, show the error panel with a restart, and report it once (HP-05) */
function runtimeError(error: unknown): void {
  faulted = true;
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  hooks.reportError(error);
  document.documentElement.setAttribute("data-aura3d-error", message.slice(0, 500));
  setText(el.errorText, `The race stopped on an error: ${message.slice(0, 240)}`);
  el.error.classList.remove("hidden");
  console.error(error);
}

/* ------------------------------------------------------------------ hooks */

const state = () => {
  const p = race.player;
  return {
    state: race.state, step: race.frames, raceTime: race.raceTime, countdown: race.countdown, goT: race.goT, lapIdx: race.lapIdx, bestLap: race.bestLap,
    paused, faulted, touchMode, reducedMotion, lowFps, look: lookRow?.id ?? null, quality: config.quality, qualityReason: config.qualityReason, pixelRatioCap: governor.cap,
    player: { s: p.s, x: p.x, dist: p.dist, v: p.v, ab: p.ab, heat: p.heat, shield: p.shield, gunHeat: p.gunHeat, theta: p.theta, phi: p.phi, yW: p.yW, vyW: p.vyW, steerVal: p.steerVal, burning: p.burning, invuln: p.invuln, burstT: p.burstT, landT: p.landT, crashT: p.crashT, crashes: p.crashes, crashed: p.crashed, finished: p.finished, takedowns: p.takedowns },
    events: race.events.length,
    ops: { score: race.ops.score, kills: race.ops.kills, barrels: race.ops.barrelsShot, shots: race.ops.shots, hits: race.ops.hits, chain: race.ops.chain, bestChain: race.ops.bestChain, medal: race.ops.medal, targetsAlive: race.ops.targets.filter((t) => t.alive).length, hash: race.ops.hash() }
  };
};

function grabCanvas(): { w: number; h: number; lit: number; url: string } {
  const surface = document.createElement("canvas");
  surface.width = canvas.width;
  surface.height = canvas.height;
  const ctx = surface.getContext("2d") as CanvasRenderingContext2D;
  ctx.drawImage(canvas, 0, 0);
  const d = ctx.getImageData(0, 0, surface.width, surface.height).data;
  let lit = 0;
  for (let k = 0; k < d.length; k += 16) if ((d[k] as number) + (d[k + 1] as number) + (d[k + 2] as number) > 24) lit++;
  return { w: surface.width, h: surface.height, lit: lit / (d.length / 16), url: surface.toDataURL("image/jpeg", 0.92) };
}

let session: { inputs: Input[]; step: number } | null = null;

function freshRace(): void {
  race = new Race(track);
  presenter.reset();
  hudModel.current = new HudModel();
  runtime?.resetCamera();
  eventsSeen = 0;
  noticeT = 0;
  el.results.classList.add("hidden");
}

const hooks = installQaHooks("heatsink", {
  ready: () => ready,
  state,
  app: () => app,
  begin,
  reset() { begin(); },
  nodeCount: () => runtime?.nodeCount ?? 0,
  routeHealth: () => (app ? createAuraRouteHealthSnapshot(app, { parityIds: ["SG-03", "SG-05", "SH-02", "R-23", "R-24"] }) : null),
  /** run `n` fixed 1/60 s steps (optionally with a fixed input; missing fields are idle, HP-10), then render once */
  stepFrames(n: number, input?: Partial<Input>) {
    manualInput = input ? { ...IDLE, ...input } : heldInput ?? IDLE;
    try {
      loop.advance(n);
    } finally {
      manualInput = null;
    }
    renderTime += n * FRAME;
    render(FRAME);
  },
  /** replay a recorded run-length input script step-exactly on a fresh race and return the final state */
  replay(text: string) {
    freshRace();
    let n = 0;
    for (const input of expandSegments(parseInputScript(text))) { race.frame(FRAME, input); lastHud = hudModel.current.update(FRAME, race); n++; }
    renderTime = race.time;
    render(FRAME);
    return { steps: n, ...state(), laps: race.laps, events: race.events.slice() };
  },
  extras: {
    applyInput(input: Input | null) { heldInput = input; },
    /** begin a stepwise replay of a recorded script on a fresh race (see `replayTo`) */
    replayStart(text: string) {
      freshRace();
      session = { inputs: expandSegments(parseInputScript(text)), step: 0 };
      renderTime = 0;
      return session.inputs.length;
    },
    /**
     * advance the replay to `target` steps, drawing every step in the last `lead` so the chase camera settles; with `grab`
     * the canvas is read back in the same task as the final render (the WebGL drawing buffer is only valid until then)
     */
    replayTo(target: number, lead = 30, grab = false) {
      if (!session) throw new Error("replayStart first");
      let shot: { w: number; h: number; lit: number; url: string } | null = null;
      while (session.step < target && session.step < session.inputs.length) {
        race.frame(FRAME, session.inputs[session.step] as Input);
        lastHud = hudModel.current.update(FRAME, race);
        session.step++;
        renderTime = race.time;
        if (session.step >= target - lead) {
          render(FRAME);
          if (grab && session.step === target) shot = grabCanvas();
        }
      }
      return { ...state(), shot };
    },
    /**
     * drive a fresh race with the lane-follow bot (`bot.ts`) for up to `maxSteps` steps or until the results open,
     * rendering the last `lead` steps; `grab` reads the canvas back in the same task (QA captures of finished and DNF cards)
     */
    autopilot(opts: BotOptions & { maxSteps?: number; lead?: number; grab?: boolean; stopAt?: "results" | "never" } = {}) {
      freshRace();
      const bot = createBot(opts);
      const max = opts.maxSteps ?? 60 * 900;
      const lead = opts.lead ?? 30;
      let shot: ReturnType<typeof grabCanvas> | null = null;
      for (let i = 0; i < max; i++) {
        race.frame(FRAME, bot(race));
        lastHud = hudModel.current.update(FRAME, race);
        if (race.resultsOpen && opts.stopAt !== "never") break;
      }
      /* the bot ran headless; replaying the drawing for the last `lead` steps is not possible, so settle the camera on the final step */
      renderTime = race.time;
      for (let k = 0; k < lead; k++) render(FRAME);
      if (opts.grab) shot = grabCanvas();
      return { ...state(), shot };
    },
    /** QA: force a runtime error through the same path a render exception takes */
    faultForTest(message = "test fault") { runtimeError(new Error(message)); },
    pause(on: boolean) { setPaused(on, "button"); return paused; },
    /** the input the live loop would read this frame (keys, touch buttons, auto-throttle), without stepping */
    input: () => sampleInput(FRAME),
    frames: () => frames,
    hud: () => lastHud ?? null,
    bot: (opts: BotOptions = {}) => { const r = runBotRace(new Race(track), opts); return { state: r.state, kills: r.ops.kills, medal: r.ops.medal, time: r.player.finishTime }; }
  }
});

/* ------------------------------------------------------------------ boot */

let ready = false;
let lookRow: import("./art/look").HeatsinkLookRow | undefined;

function sizeCanvas(): void {
  const dpr = Math.min(devicePixelRatio || 1, governor.cap);
  canvas.width = Math.max(2, Math.round(canvas.clientWidth * dpr));
  canvas.height = Math.max(2, Math.round(canvas.clientHeight * dpr));
}

async function boot(): Promise<void> {
  sizeCanvas();
  const world = buildWorld(track, config.quality);
  lookRow = world.look;
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
  applyMotion();
  /* QA crops for the E-I steady-state capture (normalised to the canvas; the chase camera holds the drone there) */
  (window as unknown as { __AURA_QA__?: Record<string, unknown> }).__AURA_QA__ = { ...((window as unknown as { __AURA_QA__?: Record<string, unknown> }).__AURA_QA__ ?? {}), crops: [DRONE_CROP, { name: "road", x: 0.3, y: 0.72, w: 0.4, h: 0.26 }, { name: "sky", x: 0, y: 0, w: 1, h: 0.25 }] };
  ready = true;
  el.loading.classList.add("hidden");
  $<HTMLButtonElement>("start").disabled = false;
  if (!config.autostart && !config.manual && !started) el.menu.classList.remove("hidden");
  lastHud = hudModel.current.update(0, race);
  render(0);
  if (config.autostart) begin();
}

el.menuObjective.textContent = `Destroy sentry drones and shoot barrels for points, chain kills to raise the multiplier, and finish ${CFG.track.laps} laps for a medal. ${MEDAL_TEXT}`;
$("start").addEventListener("click", begin);
$("again").addEventListener("click", begin);
$("resume").addEventListener("click", () => setPaused(false, "resume"));
$("restart").addEventListener("click", begin);
$("error-restart").addEventListener("click", begin);
$("pause-button").addEventListener("click", () => { if (started && !race.resultsOpen) setPaused(!paused, "button"); });
$("reset-keys").addEventListener("click", resetBinds);
el.motion.addEventListener("click", () => { reducedMotion = !reducedMotion; store.set(STORE.motion, reducedMotion ? "reduced" : "full"); applyMotion(); });
el.mute.addEventListener("click", () => {
  if (!audio) return;
  audio.setMuted(!audio.muted);
  setText(el.mute, audio.muted ? "Sound off" : "Sound on");
  el.mute.setAttribute("aria-pressed", String(audio.muted));
});
addEventListener("keydown", (e) => { if (e.code === "KeyM" && audio) queueMicrotask(() => { setText(el.mute, audio.muted ? "Sound off" : "Sound on"); el.mute.setAttribute("aria-pressed", String(audio.muted)); }); });
addEventListener("resize", sizeCanvas);
bindTouch();
setTouchMode(touchMode);
el.touch.classList.toggle("hidden", !touchMode);
renderBinds();
applyMotion();
requestAnimationFrame(tick);

function reportError(error: unknown): void {
  const base = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const code = (error as { code?: unknown })?.code;
  const details = (error as { details?: unknown })?.details;
  const message = `${base}${typeof code === "string" ? ` [${code}]` : ""}${details ? ` ${JSON.stringify(details).slice(0, 6000)}` : ""}`;
  hooks.reportError(message);
  setText(el.loadingStatus, `The track could not load: ${message.slice(0, 300)}`);
  el.loading.classList.remove("hidden");
  console.error(error);
}

boot().catch(reportError);
