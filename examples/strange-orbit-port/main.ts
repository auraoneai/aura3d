/**
 * Strange Orbit on Aura3D: boot, fixed-step loop, input, HUD and capture hooks.
 * The simulation lives in `race.ts` (pure); `world.ts` renders it through the
 * public engine surface.
 *
 * Query parameters (all optional): `vehicle=bike|skate`, `rider=0..2`,
 * `difficulty=explorer|racer|expert`, `mode=cup|trial|free`, `quality=high|low`,
 * `laps=N` (test override), `autostart=1`, `autopilot=1`, `manual=1` (the sim only
 * advances through `__orbit.advance` / `__AURA_STRANGE_ORBIT__.stepFrames`).
 */
import { createAuraApp, createAuraRouteHealthSnapshot, createFixedStepLoop, installQaHooks, type AuraApp } from "@aura3d/engine";
import { createCameraShake, createHitStop, createImpactFeedback } from "@aura3d/engine/game";
import { createOrbitAudio } from "./audio";
import { installOrbitUi } from "./ui";
import { RIDERS, sectionLabel, type Mode, type Vehicle } from "./course";
import {
  STEP,
  autopilot,
  createRace,
  decodeInputScript,
  formatTime,
  raceOrder,
  startCountdown,
  stepRace,
  togglePause,
  type Input,
  type InputSegment,
  type RaceEvent,
  type RaceState
} from "./race";
import { createOrbitPresenter, viewOf } from "./presentation";
import { staticColliders } from "./obstacles";
import { setActiveCourse } from "./track";
import { buildWorld, type WorldRuntime } from "./world";

const params = new URLSearchParams(location.search);
const num = (key: string, fallback: number): number => {
  const v = Number(params.get(key));
  return params.has(key) && Number.isFinite(v) ? v : fallback;
};
const config = {
  vehicle: (params.get("vehicle") === "skate" ? "skate" : "bike") as Vehicle,
  rider: Math.max(0, Math.min(2, num("rider", 0) | 0)),
  difficulty: params.get("difficulty") ?? "racer",
  mode: (["cup", "trial", "free"].includes(params.get("mode") ?? "") ? params.get("mode") : "cup") as Mode,
  quality: (params.get("quality") === "low" ? "low" : "high") as "high" | "low",
  laps: params.has("laps") ? Math.max(1, num("laps", 7) | 0) : null,
  autostart: params.get("autostart") === "1",
  autopilot: params.get("autopilot") === "1",
  manual: params.get("manual") === "1"
};

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`strange-orbit-port: #${id} is missing`);
  return el as T;
};
const canvas = $<HTMLCanvasElement>("world");

/* ------------------------------------------------------------------ state */

let race: RaceState = newRace();
const presenter = createOrbitPresenter(() => race);
let view: "chase" | "wide" = "chase";
let app: AuraApp | undefined;
let runtime: WorldRuntime | undefined;
let ready = false;
let checkpointOrder: number[] = [];
let lastEvents: RaceEvent[] = [];
let autopilotOn = config.autopilot;
let script: readonly InputSegment[] = [];
let heldInput: Input | null = null;
let notice = "";
let noticeTime = 0;
let hudTimer = 0;
let lastPhase = "";
let renderTime = 0;
let frames = 0;
const sound = createOrbitAudio();
const hitStop = createHitStop();
const shake = createCameraShake({ maxOffset: 0.5, maxRoll: 0.05 });
const impactFeedback = createImpactFeedback({ hitStop, shake, cue: (_name, gain) => sound.cue("hit", gain), fullSpeed: 30 });
installOrbitUi(params, config.difficulty);

function newRace(): RaceState {
  const state = createRace({ rider: config.rider, mode: config.mode, difficulty: config.difficulty, vehicle: config.vehicle });
  if (config.laps !== null) state.laps = config.laps;
  setActiveCourse(state.courseId);
  return state;
}

/* ------------------------------------------------------------------ input */

const BINDINGS = { pedal: "KeyW", brake: "KeyS", left: "KeyA", right: "KeyD", boost: "ShiftLeft", jump: "Space", gravity: "KeyG", camera: "KeyC", pause: "Escape" } as const;
const down = new Set<string>();
let jumpEdge = false;
let gravityEdge = false;
let steerSmooth = 0;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const held = (action: keyof typeof BINDINGS, ...alts: string[]): boolean => down.has(BINDINGS[action]) || alts.some((a) => down.has(a));

function sampleInput(dt: number): Input {
  if (heldInput) return heldInput;
  if (script.length) {
    const merged: Input = {};
    for (const seg of script) if (race.time >= seg.from && race.time < seg.to) Object.assign(merged, seg.input);
    return merged;
  }
  if (autopilotOn && race.phase === "racing") return autopilot(race);
  const brake = held("brake", "ArrowDown");
  const target = clamp((held("right", "ArrowRight") ? 1 : 0) - (held("left", "ArrowLeft") ? 1 : 0), -1, 1);
  steerSmooth += (target - steerSmooth) * (1 - Math.exp(-dt * 12));
  return {
    pedal: !brake && held("pedal", "ArrowUp"),
    brake,
    steer: steerSmooth,
    boost: held("boost", "ShiftRight"),
    jump: jumpEdge || held("jump"),
    gravity: gravityEdge || held("gravity")
  };
}

addEventListener("keydown", (e) => {
  if ((Object.values(BINDINGS) as string[]).includes(e.code) || e.code.startsWith("Arrow")) e.preventDefault();
  sound.unlock();
  if (e.repeat) return;
  if (e.code === "KeyM") { sound.toggleMute(); return; }
  if (e.code === BINDINGS.pause) { pause(); return; }
  if (e.code === BINDINGS.camera) { view = view === "chase" ? "wide" : "chase"; return; }
  if (e.code === "Enter" && race.phase === "menu") { begin(); return; }
  if (e.code === BINDINGS.jump) jumpEdge = true;
  if (e.code === BINDINGS.gravity) gravityEdge = true;
  down.add(e.code);
});
addEventListener("keyup", (e) => down.delete(e.code));
addEventListener("blur", () => { down.clear(); steerSmooth = 0; if (race.phase === "racing" || race.phase === "countdown") pause(); });

/* ------------------------------------------------------------------ flow */

function begin(): void {
  sound.unlock();
  race = newRace();
  presenter.reset();
  checkpointOrder = [];
  runtime?.resetCamera();
  startCountdown(race);
  loop.resetAccumulator();
  lastPhase = "";
  noticeTime = 0;
}

function pause(): void {
  if (togglePause(race)) down.clear();
}

function handleEvents(events: readonly RaceEvent[]): void {
  lastEvents = events.slice();
  for (const ev of events) {
    if (ev.type === "gate" && typeof ev.gate === "number") checkpointOrder.push(ev.gate);
    if (ev.text) { notice = ev.text; noticeTime = 3; }
    if (ev.impact !== undefined) {
      impactFeedback.handle({ colliderId: ev.colliderId ?? "", tag: undefined, point: ev.point ?? [0, 0, 0], normal: ev.normal ?? [0, 1, 0], speed: ev.impact, impulse: ev.impact });
      continue;
    }
    sound.cue(ev.type, ev.mult);
  }
}

function simulate(steps: number, input?: Input): void {
  for (let i = 0; i < steps; i++) {
    stepRace(race, input ?? sampleInput(STEP), STEP);
    handleEvents(race.events);
    jumpEdge = false;
    gravityEdge = false;
  }
}

const loop = createFixedStepLoop({
  manual: config.manual,
  stepSeconds: STEP,
  maxFrameSeconds: 0.08,
  isActive: () => ready && !hitStop.active,
  step() {
    simulate(1);
    presenter.afterStep();
  }
});

/* ------------------------------------------------------------------ HUD */

const hud = {
  place: $("place"), lap: $("lap"), section: $("section"), timer: $("timer"), bestLap: $("best-lap"), speed: $("speed"),
  energy: $("energy-fill"), energyValue: $("energy-value"), gravity: $("gravity"), notice: $("notice"), banner: $("banner"),
  order: $("order"), progress: $("progress-fill"), count: $("count"), dust: $("dust")
};
const panels = { menu: $("menu"), pause: $("pause"), results: $("results"), lost: $("lost"), hud: $("hud"), countdown: $("countdown") };

function updateHud(dt: number): void {
  const phase = race.phase;
  if (phase !== lastPhase) {
    lastPhase = phase;
    panels.menu.classList.toggle("hidden", phase !== "menu");
    panels.pause.classList.toggle("hidden", phase !== "paused");
    panels.results.classList.toggle("hidden", phase !== "finished");
    panels.lost.classList.toggle("hidden", phase !== "lost");
    panels.countdown.classList.toggle("hidden", phase !== "countdown");
    panels.hud.classList.toggle("hidden", phase === "menu" || phase === "finished" || phase === "lost");
    if (phase === "finished" && race.end) {
      $("result-medal").textContent = `${race.end.medal[0]!.toUpperCase()}${race.end.medal.slice(1)} medal`;
      $("result-place").textContent = race.mode === "trial" ? "Solo" : `${race.end.place} / 6`;
      $("result-time").textContent = formatTime(race.end.time);
      $("result-score").textContent = race.end.score.toLocaleString();
      $("result-goals").textContent = race.end.goals.map((g, i) => `${g ? "Done" : "Missed"}: ${["25 stardust", "8 s draft", "10 s boost"][i]}`).join("  ");
    }
  }
  if (phase === "menu") return;
  if (phase === "countdown") hud.count.textContent = String(Math.max(1, Math.ceil(race.countdown)));
  hud.place.textContent = race.mode === "trial" ? "Solo" : `${race.place} / 6`;
  hud.lap.textContent = race.mode === "free" ? `Orbit ${race.lap}` : `Lap ${race.lap} / ${race.laps}`;
  hud.section.textContent = sectionLabel(race.s, race.route);
  hud.timer.textContent = formatTime(race.time);
  hud.bestLap.textContent = Number.isFinite(race.bestLap) ? `Best lap ${formatTime(race.bestLap)}` : "Best lap -";
  hud.speed.textContent = String(Math.round(race.speed * 3.6));
  hud.energy.style.width = `${race.energy}%`;
  hud.energyValue.textContent = `${Math.round(race.energy)}%`;
  hud.dust.textContent = String(race.dust);
  hud.gravity.textContent = race.flight
    ? race.flight.mode === "sling" ? "Returning to the ring" : `${Math.max(0, race.rules.rescue - race.flight.age).toFixed(1)} s to rescue`
    : race.gravityTime > 0 ? `Grip ${race.gravityTime.toFixed(1)} s` : `Gravity ${race.gravityCharges}`;
  hud.progress.style.width = `${(race.mode === "free" ? (race.s % 1450) / 1450 : race.s / (race.laps * 1450)) * 100}%`;
  noticeTime = Math.max(0, noticeTime - dt);
  hud.notice.textContent = noticeTime > 0 ? notice : "";
  hud.banner.textContent = race.edgeWarning && !race.flight ? "Edge: steer inwards"
    : race.shortcut ? (race.route === "upper" ? "Upper line" : "Lower line")
      : race.loop ? "Loop lock" : race.air?.trick ? "Kickflip" : race.surge > 0 ? "Landing surge" : race.boosting ? "Stardust boost" : race.drafting ? "Slipstream" : "";
  if (race.rivals.length) {
    hud.order.innerHTML = raceOrder(race).map((r) => `<li class="${r.id === 0 ? "you" : ""}"><span>${r.place}</span><span>${r.name === "YOU" ? "You" : r.name[0] + r.name.slice(1).toLowerCase()}</span><span>${r.gap}</span></li>`).join("");
  } else hud.order.innerHTML = "";
}

/* ------------------------------------------------------------------ frame */

let renderFailed = false;

/** `live` draws the poses between the last two steps (smooth on 120 and 144 Hz displays); everything else draws the exact latest step. */
function render(dt: number, live = false): void {
  if (!app || !runtime || renderFailed) return;
  try {
    runtime.update(live ? viewOf(race, presenter.present(loop, true)) : race, dt, renderTime, view, canvas.clientWidth / Math.max(1, canvas.clientHeight), shake.update(dt));
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
  const t = Math.max(0.001, (now - lastTick) / 1000);
  const dt = Math.min(0.08, t);
  lastTick = now;
  hitStop.update(dt);
  loop.tick(now);
  if (!ready) return;
  renderTime += dt;
  sound.update({ speed: race.speed, boosting: Boolean(race.boosting), drafting: Boolean(race.drafting), flight: Boolean(race.flight), racing: race.phase === "racing" }, dt);
  hudTimer += dt;
  if (hudTimer >= 0.05 || lastPhase !== race.phase) { updateHud(hudTimer); hudTimer = 0; }
  render(["paused", "finished", "lost"].includes(race.phase) ? 0 : dt, !config.manual && race.phase === "racing");
}

/* ------------------------------------------------------------------ hooks */

function snapshot() {
  const standings = raceOrder(race);
  return {
    reentries: race.reentries || 0,
    standings,
    heading: race.heading,
    route: race.route,
    phase: race.phase,
    courseId: race.courseId,
    mode: race.mode,
    difficulty: race.difficulty,
    vehicle: race.vehicle,
    s: race.s,
    lane: race.lane,
    speed: race.speed,
    time: race.time,
    lap: race.lap,
    laps: race.laps,
    place: race.place,
    gravityTime: race.gravityTime,
    gravityCharges: race.gravityCharges,
    flight: race.flight ? { mode: race.flight.mode } : null,
    air: race.air,
    loop: race.loop ? { id: race.loop.def.id, t: race.loop.t } : null,
    tricks: race.tricks,
    loops: race.loops,
    stunts: race.stunts,
    energy: race.energy,
    score: race.score,
    dust: race.dust,
    surge: race.surge,
    boostTime: race.boostTime,
    boosting: race.boosting,
    lean: race.lean,
    respawns: race.respawns,
    end: race.end,
    rider: race.rider,
    gatesPassed: race.gatesPassed,
    checkpointOrder: checkpointOrder.slice(),
    lapTimes: race.lapTimes.slice(),
    ready
  };
}

function runStatus() {
  return {
    lap: race.lap,
    checkpointOrder: checkpointOrder.slice(),
    elapsedMs: Math.round(race.time * 1000),
    finished: race.phase === "finished",
    phase: race.phase
  };
}

/** Deterministic capture API: identical to the original's `?qa` hooks where they overlap. */
const orbit = {
  get state() { return snapshot(); },
  get race() { return race; },
  begin,
  menu() { race = newRace(); presenter.reset(); checkpointOrder = []; runtime?.resetCamera(); lastPhase = ""; },
  set(patch: Partial<RaceState>) { Object.assign(race, patch); },
  pose(s: number, lane = 0) {
    race.s = s; race.lane = lane; race.lateral = 0; race.heading = 0; race.steerRate = 0;
    race.groundedS = null; race.groundedRoute = null; race.checkpoint = Math.floor(s / (1450 / 4)); race.lap = Math.floor(s / 1450) + 1;
    runtime?.resetCamera();
  },
  /** Advance `seconds` of simulated time in 1/60 s steps with a fixed input (or the driver). */
  advance(seconds: number, input?: Input) {
    simulate(Math.round(seconds / STEP), input);
    presenter.reset();
    updateHud(0);
    render(0);
  }
};

/**
 * Replay a recorded run-length input script step-exactly through the simulation (fresh race,
 * no rendering per step) and return the facts the original's capture records.
 */
function replayScript(text: string) {
  race = newRace();
  presenter.reset();
  checkpointOrder = [];
  runtime?.resetCamera();
  startCountdown(race);
  const checkpoints: { step: number; gate: number; lap: number }[] = [];
  const routeEvents: { step: number; text: string }[] = [];
  const lapSteps: number[] = [];
  let step = 0;
  for (const input of decodeInputScript(text)) {
    stepRace(race, input, STEP);
    step++;
    handleEvents(race.events);
    for (const ev of race.events) {
      if (ev.type === "gate") checkpoints.push({ step, gate: ev.gate!, lap: race.lap });
      if (ev.type === "route" && ev.text) routeEvents.push({ step, text: ev.text });
      if (ev.type === "lap") lapSteps.push(step);
    }
    if (race.phase === "finished" || race.phase === "lost") break;
  }
  updateHud(0);
  render(0);
  return {
    phase: race.phase,
    steps: step,
    time: race.time,
    lapTimes: race.lapTimes.slice(),
    bestLap: race.bestLap,
    checkpoints,
    routeEvents,
    lapSteps,
    counters: { gatesPassed: race.gatesPassed, hits: race.hits, impacts: race.impacts, respawns: race.respawns, nearMisses: race.nearMisses, dust: race.dust, tricks: race.tricks, stunts: race.stunts, loops: race.loops, score: race.score, place: race.place, medal: race.end?.medal ?? null },
    standings: raceOrder(race).map((r) => ({ id: r.id, name: r.name, place: r.place, gap: r.gap, finished: r.finished, finishTime: Number.isFinite(r.finishTime) ? r.finishTime : null, s: r.s }))
  };
}

installQaHooks("strange-orbit", {
  ready: () => ready,
  state: () => ({ ...runStatus(), ...snapshot() }),
  begin,
  reset() { orbit.menu(); begin(); },
  replay: replayScript,
  app: () => app,
  routeHealth: () => (app ? createAuraRouteHealthSnapshot(app, { parityIds: ["SG-03", "SG-05", "SH-02", "R-23"] }) : null),
  nodeCount: () => runtime?.nodeCount ?? 0,
  extras: {
    config: () => ({ ...config }),
    status: runStatus,
    applyInput(input: Input | null) { heldInput = input; autopilotOn = false; },
    setScript(next: readonly InputSegment[]) { script = next; heldInput = null; autopilotOn = false; },
    setAutopilot(on: boolean) { autopilotOn = on; if (on) { heldInput = null; script = []; } },
    /** Run `n` fixed 1/60 s steps (input optional), then render once. */
    stepFrames(n: number, input?: Input) {
      simulate(Math.max(0, n | 0), input);
      presenter.reset();
      updateHud(0);
      render(0);
      return runStatus();
    },
    /** Step until finished/lost or `maxFrames`; returns the run status. */
    runToFinish(maxFrames = 60 * 60 * 8, chunk = 600) {
      let done = 0;
      while (done < maxFrames && race.phase !== "finished" && race.phase !== "lost") {
        const n = Math.min(chunk, maxFrames - done);
        simulate(n);
      presenter.reset();
        done += n;
      }
      updateHud(0);
      render(0);
      return { ...runStatus(), steps: done };
    },
    /** QA: solid scenery as plain data (label, capsule ends, radius, approach direction). */
    colliders: () => staticColliders().map((c) => ({ id: c.id, label: c.label, a: [c.a.x, c.a.y, c.a.z], b: [c.b.x, c.b.y, c.b.z], radius: c.radius, approach: [c.approach.x, c.approach.y, c.approach.z] })),
    /** QA: put a racing rider into zero-G drift 8 m from collider `id`, flying straight at it at `speed` m/s. */
    flyInto(id: string, speed = 35) {
      const c = staticColliders().find((x) => x.id === id);
      if (!c || race.phase !== "racing") return false;
      race.lane = 40;
      stepRace(race, { pedal: true }, STEP);
      const f = race.flight;
      if (!f) return false;
      const mid = c.a.clone().add(c.b).multiplyScalar(0.5);
      f.position.copy(mid).addScaledVector(c.approach, -(c.radius + 8));
      f.velocity.copy(c.approach).multiplyScalar(speed);
      f.forward.copy(c.approach);
      f.age = 1;
      race.hitCooldown = 0;
      return true;
    },
    frames: () => frames
  }
});

declare global {
  interface Window {
    __AURA_STRANGE_ORBIT__?: unknown;
    __orbit?: typeof orbit;
    __AURA_STRANGE_ORBIT_ERROR__?: string;
  }
}
window.__orbit = orbit;

/* ------------------------------------------------------------------ boot */

function sizeCanvas(): void {
  const dpr = Math.min(devicePixelRatio || 1, config.quality === "low" ? 1 : 1.65);
  canvas.width = Math.max(2, Math.round(canvas.clientWidth * dpr));
  canvas.height = Math.max(2, Math.round(canvas.clientHeight * dpr));
}

async function boot(): Promise<void> {
  const label = RIDERS[config.rider]!.name;
  $("rider-name").textContent = label;
  $("vehicle-name").textContent = config.vehicle === "skate" ? "Skate" : "Bike";
  sizeCanvas();
  const world = buildWorld({ vehicle: config.vehicle, rider: config.rider, quality: config.quality });
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
  $("loading").classList.add("hidden");
  $<HTMLButtonElement>("start").disabled = false;
  render(0);
  updateHud(0);
  if (config.autostart) begin();
}

$("start").addEventListener("click", begin);
for (const id of ["again", "again-lost", "restart"]) $(id).addEventListener("click", begin);
$("resume").addEventListener("click", pause);
$("to-menu").addEventListener("click", () => orbit.menu());
$("vehicle-bike").addEventListener("click", () => { params.set("vehicle", "bike"); location.search = params.toString(); });
$("vehicle-skate").addEventListener("click", () => { params.set("vehicle", "skate"); location.search = params.toString(); });
addEventListener("resize", () => { sizeCanvas(); });
addEventListener("pointerdown", () => sound.unlock());
requestAnimationFrame(tick);

function reportError(error: unknown): void {
  const base = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const code = (error as { code?: unknown })?.code;
  const details = (error as { details?: unknown })?.details;
  const message = `${base}${typeof code === "string" ? ` [${code}]` : ""}${details ? ` ${JSON.stringify(details).slice(0, 6000)}` : ""}`;
  if (!window.__AURA_STRANGE_ORBIT_ERROR__) window.__AURA_STRANGE_ORBIT_ERROR__ = message;
  $("loading-status").textContent = `The course could not load: ${message.slice(0, 300)}`;
  $("loading").classList.remove("hidden");
  console.error(error);
}

boot().catch(reportError);
