/**
 * Ninja Runner on Aura3D: boot, fixed-step loop, input, HUD and capture hooks. The simulation lives in
 * `sim.ts` (pure, transcribed from the original); `world.ts` renders it through the public engine surface.
 *
 * Timing matches the original: real time feeds an accumulator and the sim advances in 1/120 s steps
 * (`pf(z, 1/120)`), with key presses applied between steps. Query parameters (all optional):
 * `autostart=1`, `autopilot=1` (the capture policy plays the run), `manual=1` (the sim only advances through
 * the hooks), `seed=N` (course seed, default 17), `daily=1` (today's course: the seed is the UTC date as YYYYMMDD),
 * `quality=low`. GU47 (WP-30): `look=original` (the pre-GU47 midday look; the default is the evening that moves with
 * distance), `at=<metres>` (boots straight into a run held at that distance through the capture policy; the sim then
 * holds still like `manual=1`, for the district luma targets), `lanterns=0` (no pooled lantern lights), `scarf=0` (no scarf ribbon), `godrays=0`.
 */
import { createAuraApp, createAuraRouteHealthSnapshot, type AuraApp, createFixedStepLoop, installQaHooks } from "@aura3d/engine";
import { DEFAULT_POLICY, policyActions, type PolicyParams } from "./autopilot";
import { courseDigest, decodeActionScript, replayScript, runIdle, runPolicy } from "./replay";
import { GameAudio } from "./audio";
import { ENEMY_HINT, FORM_SHORT, announcement, districtLabel, resultCopy } from "./labels";
import { createCameraShake, createHitStop, createImpactFeedback } from "@aura3d/engine/game";
import { TIER_FEEDBACK, type DebrisTier } from "./impact";
import {
  DEFAULT_SEED, SIM_STEP, TUNING, dailySeed, applyAction, createState, drainEvents, qaAutopilotActions, snapshot, startRun, stepSim,
  type Action, type EnemyKind, type Form, type SimEvent, type SimState
} from "./sim";
import { createNinjaPresenter, viewOf } from "./presentation";
import { lookMode } from "./districtLook";
import { atDistance, qaCrops } from "./qa";
import { ACTOR_COUNT, buildWorld, loadActors, type ActorAssets, type WorldRuntime } from "./world";

const params = new URLSearchParams(location.search);
const num = (key: string, fallback: number): number => { const v = Number(params.get(key)); return params.has(key) && Number.isFinite(v) ? v : fallback; };
const daily = params.get("daily") === "1";
const config = {
  seed: (daily ? dailySeed() : num("seed", DEFAULT_SEED)) | 0,
  daily,
  autostart: params.get("autostart") === "1",
  autopilot: params.get("autopilot") === "1",
  manual: params.get("manual") === "1",
  /** `rules=original` reproduces the original game's obstacle contact (crates vanish, no knock-back); the default is the reworked contact rules. */
  ram: params.get("rules") !== "original",
  quality: (params.get("quality") === "low" ? "low" : "high") as "low" | "high",
  /** GU47: evening (default) or the pre-GU47 look (`?look=original`). */
  look: lookMode(params),
  /** GU47 NR-22: `?at=<metres>` district target, or null. */
  at: atDistance(params),
  lanterns: params.get("lanterns") !== "0",
  scarf: params.get("scarf") !== "0",
  godRays: params.get("godrays") !== "0"
};
// A district target holds the run where it lands (captures drive nothing), so it behaves like `manual=1`.
if (config.at !== null) config.manual = true;

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`ninja-runner-port: #${id} is missing`);
  return el as T;
};
const canvas = $<HTMLCanvasElement>("world");

/* ------------------------------------------------------------------ preferences */

const STORE = "shadowstep-gauntlet";
const store = {
  get(key: string): string | null { try { return localStorage.getItem(`${STORE}:${key}`); } catch { return null; } },
  set(key: string, value: string): void { try { localStorage.setItem(`${STORE}:${key}`, value); } catch { /* private mode: not saved */ } }
};
const reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
document.documentElement.classList.toggle("reduced-motion", reducedMotion);
// GU47 NR-19: the ink-scroll HUD theme goes with the evening look; `?look=original` keeps the previous HUD.
document.documentElement.classList.toggle("ink-scroll", config.look === "evening");
interface Best { score: number; distance: number; combo: number; kills: number }
const readBest = (): Best | null => { try { const v = JSON.parse(store.get(`best:${config.seed}`) ?? "null") as Best | null; return v && typeof v.score === "number" ? v : null; } catch { return null; } };
const bestLine = (b: Best | null): string => (b ? `Best: ${b.score} points · ${b.distance} m · ${b.kills} defeated · ${b.combo}x combo` : "");

/* ------------------------------------------------------------------ state */

let z: SimState = createState(config.seed, { ram: config.ram });
const presenter = createNinjaPresenter(() => z);
let app: AuraApp | undefined;
let runtime: WorldRuntime | undefined;
let actors: ActorAssets | undefined;
let ready = false;
let renderTime = 0;
let frames = 0;
let simSteps = 0;
let autopilotOn = config.autopilot;
let policy: PolicyParams = DEFAULT_POLICY;
let pendingEvents: SimEvent[] = [];
let notice: { title: string; small: string; until: number } | null = null;
let renderFailed = false;
let countdown = 0;
const COUNTDOWN_SECONDS = 2.2;
let recorded = false;
let stepClock = 0, lastS = 0;
const hinted = new Set<EnemyKind>();
const charged = new Set<number>();
const hitStop = createHitStop();
/** Camera shake is off with prefers-reduced-motion. */
const shake = createCameraShake({ maxOffset: reducedMotion ? 0 : 0.6 });
const impactFeedback = Object.fromEntries((Object.keys(TIER_FEEDBACK) as DebrisTier[]).map((tier) => {
  const t = TIER_FEEDBACK[tier];
  return [tier, createImpactFeedback({ hitStop, shake, cue: (name) => audio.play(name as Parameters<GameAudio["play"]>[0]), cueName: t.cue, fullSpeed: t.fullSpeed, hitStopMs: t.hitStopMs })];
})) as Record<DebrisTier, ReturnType<typeof createImpactFeedback>>;
const feel = (tier: DebrisTier, speed: number): void => { impactFeedback[tier].handle({ colliderId: "obstacle", tag: tier, point: [0, 0, 0], normal: [0, 0, -1], speed, impulse: speed }); };
let shownDistrict = "";
const audio = new GameAudio();
audio.setMuted(store.get("muted") === "1");
const maxCooldown: Record<string, number> = { dash: 1 };

function say(title: string, small: string, seconds: number): void { notice = { title, small, until: renderTime + seconds }; }

const SFX_FOR_EVENT: Readonly<Record<string, Parameters<GameAudio["play"]>[0]>> = {
  jump: "jump", land: "land", dash: "dash", spiralorb: "orb", spiralstar: "gale", clones: "clones", damage: "hurt", armorBreak: "crate",
  windImpact: "galeHit", cloneStrike: "orbHit", deflect: "orbHit", interrupt: "orbHit", unlock: "unlock", form: "form", won: "win", lost: "lose", dropWarning: "warn"
};
const CHARGE_SFX: Readonly<Record<EnemyKind, Parameters<GameAudio["play"]>[0]>> = { scout: "chargeScout", swordsman: "chargeSwordsman", caster: "chargeCaster", heavy: "chargeHeavy" };

function handle(events: readonly SimEvent[]): void {
  for (const ev of events) {
    pendingEvents.push(ev);
    const note = announcement(ev.type, ev.form as string | undefined);
    if (note) say(note.title, note.small, note.seconds);
    if (ev.type === "damage") flashHurt();
    if (ev.type === "break") feel("smash", z.speed);
    if (ev.type === "ram") feel(ev.tier as DebrisTier, ev.speed as number);
    if (ev.type === "pickup") audio.play("pickup", renderTime);
    else if (ev.type === "kill") audio.play(ev.heavy ? "heavyKill" : "kill");
    else { const sfx = SFX_FOR_EVENT[ev.type]; if (sfx) audio.play(sfx); }
  }
}

/** Red edge flash on damage; with reduced motion it is fainter and shorter (CSS `.reduced-motion #hurt`). */
function flashHurt(): void {
  const el = document.getElementById("hurt");
  if (!el) return;
  el.classList.add("on");
  window.setTimeout(() => el.classList.remove("on"), reducedMotion ? 60 : 90);
}

function showHud(on: boolean): void {
  for (const id of ["stats", "vitals", "forms", "abilities", "progress", "controls"]) $(id).classList.toggle("hidden", !on);
}

function setMuted(on: boolean): void {
  audio.setMuted(on);
  store.set("muted", on ? "1" : "0");
  $("mute").textContent = on ? "Sound off" : "Sound on";
  $("mute").setAttribute("aria-pressed", String(on));
}

/** Save the run if it beats the stored best for this course seed. */
function recordResult(): void {
  if (recorded) return;
  recorded = true;
  const prev = readBest();
  const run: Best = { score: z.score, distance: Math.floor(z.s), combo: z.bestCombo, kills: z.kills };
  const better = !prev || run.score > prev.score;
  if (better) store.set(`best:${config.seed}`, JSON.stringify(run));
  $("result-best").textContent = better ? (prev ? `New best. ${bestLine(prev).replace("Best:", "Previous best:")}` : "First run on this course saved as your best.") : bestLine(prev);
  $("best").textContent = bestLine(better ? run : prev);
}

function begin(): void {
  z = createState(config.seed, { ram: config.ram });
  presenter.reset();
  startRun(z);
  loop.resetAccumulator();
  simSteps = 0;
  countdown = 0;
  recorded = false;
  charged.clear();
  stepClock = 0;
  lastS = 0;
  pendingEvents = [];
  handle(drainEvents(z));
  runtime?.resetRun();
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
  z = createState(config.seed, { ram: config.ram });
  presenter.reset();
  runtime?.resetRun();
  runtime?.resetCamera();
  $("overlay").classList.add("hidden");
  $("result").classList.add("hidden");
  $("pause").classList.add("hidden");
  showHud(false);
  $("countdown").classList.remove("hidden");
  countdown = COUNTDOWN_SECONDS;
}

/** Pause or resume a running run. Pausing also holds the audio (wind bed and score); Resume releases it. */
function setPaused(on: boolean): void {
  if (on && z.phase === "running") z.phase = "paused";
  else if (!on && z.phase === "paused") z.phase = "running";
  else return;
  $("pause").classList.toggle("hidden", !on);
  if (on) audio.suspend();
  else { audio.release(); loop.resetAccumulator(); }
}

function act(action: Action): boolean {
  // On the title card, jump or orb starts the same 3-2-1 as Start; during the countdown every action is ignored.
  if (countdown > 0) return false;
  if (z.phase === "intro") { if (action === "spiralorb" || action === "jump") { startWithCountdown(); return true; } return false; }
  const ok = applyAction(z, action);
  if (ok && action === "slide") audio.play("slide");
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

const ABILITY_COST: Record<string, number> = { clones: TUNING.cloneCost, spiralorb: TUNING.attackCost, dash: TUNING.dashCost, spiralstar: TUNING.shurikenCost };

function abilityCooldown(action: string): number {
  const left = action === "clones" ? z.cloneCooldown : action === "spiralorb" ? z.attackCooldown : action === "dash" ? z.dashCooldown : z.shurikenCooldown;
  const full = action === "clones" ? TUNING.cloneCooldown : action === "spiralorb" ? TUNING.attackCooldown : action === "spiralstar" ? TUNING.shurikenCooldown : (maxCooldown[action] = Math.max(maxCooldown[action] ?? 1, left));
  return Math.max(0, Math.min(1, left / full));
}

/** HUD nodes looked up once; every write goes through `put`, which skips unchanged values (no per-frame layout churn). */
const hud = {
  distance: $("distance"), kills: $("kills"), score: $("score"), combo: $("combo"), spirit: $("spirit"), spiritBar: $("spirit-bar"),
  hearts: $("hearts"), progressFill: $("progress-fill"), district: $("district"), banner: $("district-banner"),
  announceTitle: $("announce-title"), announceSmall: $("announce-small"), result: $("result"), resultLabel: $("result-label"),
  resultTitle: $("result-title"), resultCopy: $("result-copy"), resultStats: $("result-stats"), formCycle: document.getElementById("form-cycle"),
  forms: Array.from(document.querySelectorAll<HTMLButtonElement>("#forms button")),
  abilities: Array.from(document.querySelectorAll<HTMLButtonElement>("#abilities button[data-action]")),
  seals: Array.from(document.querySelectorAll<HTMLElement>("#progress em[data-seal]"))
};
const written = new Map<HTMLElement, Map<string, string>>();
const put = (el: HTMLElement, key: string, value: string, write: () => void): void => {
  let cache = written.get(el);
  if (!cache) written.set(el, cache = new Map());
  if (cache.get(key) === value) return;
  cache.set(key, value);
  write();
};
const text = (el: HTMLElement, value: string): void => put(el, "text", value, () => { el.textContent = value; });
const width = (el: HTMLElement, pct: number): void => { const v = `${pct.toFixed(2)}%`; put(el, "width", v, () => { el.style.width = v; }); };
const flag = (el: HTMLElement, cls: string, on: boolean): void => put(el, `class:${cls}`, on ? "1" : "0", () => { el.classList.toggle(cls, on); });

function updateHud(): void {
  text(hud.distance, String(Math.floor(z.s)));
  text(hud.kills, String(z.kills).padStart(2, "0"));
  text(hud.score, String(z.score));
  text(hud.combo, z.combo > 1 ? `${z.combo}x combo` : "");
  text(hud.spirit, `${Math.round(z.spirit)} / ${TUNING.maxSpirit}`);
  width(hud.spiritBar, (z.spirit / TUNING.maxSpirit) * 100);
  text(hud.hearts, "♥".repeat(Math.max(0, z.health)) + "♡".repeat(Math.max(0, TUNING.health - z.health)));
  width(hud.progressFill, Math.min(100, (z.s / TUNING.length) * 100));
  for (const seal of hud.seals) flag(seal, "passed", z.s >= Number(seal.dataset.seal));
  const district = districtLabel(z.s);
  text(hud.district, district);
  if (district !== shownDistrict && z.phase === "running") {
    hud.banner.textContent = district.toUpperCase();
    hud.banner.classList.add("show");
    shownDistrict = district;
    window.setTimeout(() => hud.banner.classList.remove("show"), reducedMotion ? 1200 : 2200);
  }
  for (const b of hud.forms) {
    const form = b.dataset.form as string;
    flag(b, "selected", z.form === form);
    const locked = form !== "base" && z.s < (form === "sage" ? 600 : 1620);
    put(b, "disabled", locked ? "1" : "0", () => { b.disabled = locked; });
  }
  if (hud.formCycle) text(hud.formCycle, FORM_SHORT[z.form as Form] ?? "Runner");
  for (const b of hud.abilities) {
    const action = b.dataset.action as string;
    if (action === "cycleForm") continue;
    const cd = abilityCooldown(action).toFixed(2);
    put(b, "cd", cd, () => { b.style.setProperty("--cd", cd); });
    flag(b, "poor", z.spirit < (ABILITY_COST[action] ?? 0));
    flag(b, "live", (action === "clones" && z.clones > 0) || (action === "spiralorb" && z.attack > 0) || (action === "dash" && z.dash > 0) || (action === "spiralstar" && z.shurikenCast > 0));
  }
  const live = notice && notice.until > renderTime ? notice : null;
  text(hud.announceTitle, live?.title ?? "");
  text(hud.announceSmall, live?.small ?? "");
  if (z.phase === "won" || z.phase === "lost") {
    flag(hud.result, "hidden", false);
    const copy = resultCopy(z.phase === "won", z.falling);
    text(hud.resultLabel, copy.label);
    text(hud.resultTitle, copy.title);
    text(hud.resultCopy, copy.copy);
    text(hud.resultStats, `${Math.floor(z.s)} m · ${z.kills} defeated · best combo ${z.bestCombo}x · score ${z.score}`);
    recordResult();
  } else written.delete(hud.result);
}

/* ------------------------------------------------------------------ frame */

/** `live` draws the poses between the last two steps (smooth on 144 Hz displays); everything else draws the exact latest step. */
function render(dt: number, live = false): void {
  if (!app || !runtime || renderFailed) return;
  try {
    runtime.update(live ? viewOf(z, presenter.present(loop, true)) : z, dt, renderTime, pendingEvents);
    pendingEvents = [];
    app.step(0);
    frames++;
  } catch (error) {
    renderFailed = true;
    reportError(error);
    throw error;
  }
}

/** The sim steps only while running; in other phases the loop still drains its clock so resuming never bursts. */
const loop = createFixedStepLoop({
  stepSeconds: SIM_STEP,
  maxCatchUpSteps: 12,
  isActive: () => ready,
  step: () => {
    if (!config.manual && z.phase === "running" && hitStop.timeScale() === 1) step(1);
    presenter.afterStep();
  },
  render: (dt) => {
    renderTime += dt;
    hitStop.update(dt);
    if (countdown > 0) {
      countdown -= dt;
      $("countdown").textContent = countdown <= 0.35 ? "GO" : String(Math.ceil((countdown - 0.35) / 0.62));
      if (countdown <= 0) begin();
    }
    audio.update({ form: z.form, speed: z.speed, running: z.phase === "running" });
    footsteps();
    charges();
    if (ready && z.phase === "intro" && countdown <= 0) watchFrameTime(dt);
    // NR-18: the title shot holds on the card and blends onto the chase through the 3-2-1 (null once running).
    runtime?.setIntro(countdown > 0 ? 1 - countdown / COUNTDOWN_SECONDS : z.phase === "intro" ? 0 : null);
    render(dt, !config.manual && z.phase === "running");
    updateHud();
  }
});

/**
 * A rival starting its charge (`approachSpeed > 0` within 40 m): a short per-kind cue, and the first charge of each kind
 * in this page session names it and says how to beat it.
 */
function charges(): void {
  if (z.phase !== "running") return;
  for (const e of z.entities) {
    if (!e.alive || e.approachSpeed <= 0 || charged.has(e.id) || e.s - z.s > 40) continue;
    charged.add(e.id);
    const kind = e.type as EnemyKind;
    const sfx = CHARGE_SFX[kind];
    if (sfx) audio.play(sfx);
    const hint = ENEMY_HINT[kind];
    if (hint && !hinted.has(kind)) { hinted.add(kind); say(hint.title, hint.small, hint.seconds); }
  }
}

/** Footsteps from the run cycle: one soft step every 2.2 m on the ground (none while sliding, in the air or falling). */
function footsteps(): void {
  const moved = z.s - lastS;
  lastS = z.s;
  if (z.phase !== "running" || moved <= 0 || moved > 5) return;
  if (z.y > 0.06 || z.falling || z.slide > 0) { stepClock = 0; return; }
  stepClock += moved;
  if (stepClock >= 2.2) { stepClock -= 2.2; audio.play("step"); }
}

/**
 * Slow-device offer: on the title card the scene redraws every frame, so its frame times show what a run would cost. When
 * the median of 40 frames is over 100 ms (under 10 fps) at the default quality, the card offers the low-quality page
 * (`?quality=low`: no ambient occlusion, DPR capped at 1). Nothing switches by itself; the choice stays with the player.
 */
const frameTimes: number[] = [];
function watchFrameTime(dt: number): void {
  if (config.quality === "low" || config.manual || frameTimes.length >= 40) return;
  frameTimes.push(dt);
  if (frameTimes.length < 40) return;
  const median = [...frameTimes].sort((a, b) => a - b)[20]!;
  if (median <= 0.1) return;
  const next = new URLSearchParams(location.search);
  next.set("quality", "low");
  const link = document.getElementById("lowq") as HTMLAnchorElement | null;
  if (!link) return;
  link.href = `?${next.toString()}`;
  link.classList.remove("hidden");
}

/* ------------------------------------------------------------------ input */

const KEYS: Record<string, Action> = { KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right", Space: "cycleForm", ArrowUp: "jump", KeyW: "jump", KeyS: "slide", ArrowDown: "slide", ShiftLeft: "dash", ShiftRight: "dash", Digit1: "clones", Digit2: "spiralorb", Digit3: "spiralstar" };
addEventListener("keydown", (e) => {
  if (!ready || e.repeat) return;
  audio.unlock();
  if (e.code === "Escape") { setPaused(z.phase === "running"); return; }
  if (e.code === "KeyM") { setMuted(!audio.muted); return; }
  if (e.code === "Enter" && (z.phase === "intro" || z.phase === "won" || z.phase === "lost")) { startWithCountdown(); return; }
  const a = KEYS[e.code];
  if (a) { e.preventDefault(); act(a); }
});
let swipe: { x: number; y: number } | null = null;
canvas.addEventListener("pointerdown", (e) => { audio.unlock(); if (e.pointerType === "mouse") act("spiralorb"); else swipe = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener("pointerup", (e) => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  swipe = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) act(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy < 0 ? "jump" : "slide");
  else act("spiralorb");
});
document.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((b) => b.addEventListener("click", () => act(b.dataset.action as Action)));
document.querySelectorAll<HTMLButtonElement>("[data-form]").forEach((b) => b.addEventListener("click", () => act(b.dataset.form as Action)));
$("start").addEventListener("click", startWithCountdown);
$("again").addEventListener("click", startWithCountdown);
$("resume").addEventListener("click", () => setPaused(false));
$("pause-btn").addEventListener("click", () => setPaused(true));
$("mute").addEventListener("click", () => { audio.unlock(); setMuted(!audio.muted); });
setMuted(audio.muted);
// A hidden tab or a blurred window pauses a running run (it would otherwise resume at full speed with the wind still
// playing). Audio is held while hidden; coming back keeps a paused run paused until Resume.
// `manual=1` (QA stepping through the hooks) skips this: captures drive the sim themselves.
document.addEventListener("visibilitychange", () => {
  if (config.manual) return;
  if (document.visibilityState === "hidden") { setPaused(true); audio.suspend(); }
  else if (z.phase !== "paused") audio.release();
});
addEventListener("blur", () => { if (!config.manual) setPaused(true); });
addEventListener("pagehide", () => { if (!config.manual) { setPaused(true); audio.suspend(); } });

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
  stepFrames(n: number, actions?: readonly Action[]) { step(Math.max(0, n | 0), actions); presenter.reset(); updateHud(); runtime?.resetCamera(); render(0); return snapshot(z); },
  /** Step the live sim without rendering until `form` is active, the run ends, or `maxSteps` pass; renders once at the end. */
  advanceUntil(form: string | null, maxSteps: number) {
    let n = 0;
    while (n < maxSteps && z.phase === "running" && (form === null || z.form !== form)) { step(1); n++; }
    presenter.reset();
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
  /** Step the live sim `n` fixed steps without rendering (cheap on software GL); pair with `stepFrames(0)` to draw. */
  stepRaw(n: number) { step(Math.max(0, n | 0)); return snapshot(z); },
  setAutopilot(on: boolean, next?: PolicyParams) { autopilotOn = on; if (next) policy = next; },
  /** Render `frames` real-time frames of `dt` seconds (animation clocks, particles) without advancing the sim; for captures. */
  settle(frames = 6, dt = 1 / 60) { for (let i = 0; i < frames; i++) { renderTime += dt; render(dt); } updateHud(); },
  audio: () => ({ supported: audio.supported, active: audio.active, muted: audio.muted, suspended: audio.suspended }),
  reducedMotion: () => reducedMotion,
  best: () => readBest(),
  setPaused: (on: boolean) => setPaused(on),
  /** Replay a recorded action script (the capture's `script` string) into a fresh recorded run; no rendering per step. */
  replay: (text: string, maxSteps = 40000) => summary(replayScript(decodeActionScript(text), maxSteps)),
  runPolicy: (p: PolicyParams = DEFAULT_POLICY, maxSteps = 40000) => summary(runPolicy(p, maxSteps)),
  runIdle: (maxSteps = 40000) => summary(runIdle(maxSteps)),
  courseDigest: () => courseDigest(createState(config.seed)),
  probeBones: () => runtime?.probeBones(),
  /** GU47: active look, district, scarf ribbon and lantern pool. */
  look: () => runtime?.look() ?? null,
  /** GU47 E-I crop contract: named normalised rects read at every capture shot. */
  crops: () => qaCrops(z.s),
  stats: () => ({ ...(runtime?.stats() ?? { visibleActors: 0, actors: ACTOR_COUNT, pickups: 0, particles: 0, debris: 0, threat: null }), shared: actors ? { textureEntries: actors.sharedTextureEntries, refs: actors.sharedTextureRefs, clips: actors.clips, clip: actors.clip } : null }),
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

/** QA-compatible subset of the original's `window.__lanternhold` (`ready`, `state`, `start`, `restart`, `action`, `simulate`, `snapshot`). */
const lanternhold = {
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
    presenter.reset();
    updateHud();
    render(1 / 60);
    return snapshot(z);
  }
};

declare global {
  interface Window {
    __AURA_NINJA_RUNNER__?: typeof api;
    __lanternhold?: typeof lanternhold;
    __AURA_NINJA_RUNNER_ERROR__?: string;
  }
}
const qa = installQaHooks("ninja-runner", {
  ready: () => ready,
  state: () => z,
  app: () => app,
  extras: api
});
window.__lanternhold = lanternhold;

/* ------------------------------------------------------------------ boot */

function sizeCanvas(): void {
  const dpr = Math.min(devicePixelRatio || 1, config.quality === "low" ? 1 : 1.5);
  canvas.width = Math.max(2, Math.round(canvas.clientWidth * dpr));
  canvas.height = Math.max(2, Math.round(canvas.clientHeight * dpr));
}

async function boot(): Promise<void> {
  sizeCanvas();
  const status = $("loading-status");
  actors = await loadActors(canvas, (done, total) => { status.textContent = done < total ? `Loading the runners (${done + 1} of ${total})…` : "Building the village…"; });
  status.textContent = "Building the village…";
  const world = buildWorld({ canvas, actors, entities: z.entities, quality: config.quality, shake, mode: config.look, reducedMotion, lanterns: config.lanterns, scarf: config.scarf, godRays: config.godRays });
  app = createAuraApp(canvas, {
    autoStart: false,
    resize: false,
    pixelRatio: 1,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    // GU47 NR-08: the woodblock grade tone-maps with agx; `?look=original` keeps aces.
    output: { toneMapping: config.look === "evening" ? "agx" : "aces", dither: false },
    scene: world.scene
  });
  await app.ready();
  runtime = world.bind(app);
  ready = true;
  $("loading-status").textContent = config.daily ? `Ready. Daily course for ${config.seed}.` : "Ready.";
  $<HTMLButtonElement>("start").disabled = false;
  render(0);
  updateHud();
  if (config.autostart) begin();
  if (config.at !== null) jumpTo(config.at);
}

/**
 * GU47 NR-22: start a run and step it (capture policy, no rendering) until `metres`, then hold it there. The sim is
 * untouched: the same `step` the hooks use, with the reference policy playing (`?autopilot=1`).
 */
function jumpTo(metres: number): void {
  begin();
  const was = autopilotOn;
  autopilotOn = true;
  let n = 0;
  while (z.phase === "running" && z.s < metres && n < 120 * 400) { step(1); n++; }
  autopilotOn = was;
  pendingEvents = [];
  presenter.reset();
  updateHud();
  runtime?.resetCamera();
  // A few real-time frames so the look, the lantern pool and the scarf settle before the first shot.
  for (let i = 0; i < 30; i++) { renderTime += 1 / 60; render(1 / 60); }
}

function reportError(error: unknown): void {
  const base = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const code = (error as { code?: unknown })?.code;
  const details = (error as { details?: unknown })?.details;
  const message = `${base}${typeof code === "string" ? ` [${code}]` : ""}${details ? ` ${JSON.stringify(details).slice(0, 6000)}` : ""}`;
  qa.reportError(message);
  $("loading-status").textContent = `The village could not load: ${message.slice(0, 300)}`;
  console.error(error);
}

$("best").textContent = bestLine(readBest());
{
  const link = document.getElementById("daily") as HTMLAnchorElement | null;
  if (link) {
    const next = new URLSearchParams(location.search);
    if (config.daily) { next.delete("daily"); link.textContent = "Back to the main course"; }
    else { next.set("daily", "1"); next.delete("seed"); link.textContent = "Play today's course"; }
    link.href = `?${next.toString()}`;
  }
}

addEventListener("resize", sizeCanvas);
loop.start();
boot().catch(reportError);
