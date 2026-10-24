/**
 * HEATSINK Time Trial on Aura3D: boot, fixed-step loop, input, DOM HUD and capture hooks.
 * The simulation lives in `race.ts` (pure); `world.ts` renders it through the public engine surface.
 *
 * Query parameters (all optional): `autostart=1` (skip the menu), `manual=1` (the sim only advances through
 * `__AURA_HEATSINK__.stepFrames`), `quality=high|low`.
 */
import { createAuraApp, createAuraRouteHealthSnapshot, createFixedStepLoop, installQaHooks, type AuraApp } from "@aura3d/engine";
import { expandSegments, parseInputScript } from "../../tools/crayon-capture/heatsink-lib";
import { CFG } from "./config";
import { HudModel, formatTime } from "./hud";
import { STRIKE } from "./operation";
import { FRAME, Race } from "./race";
import { Track } from "./track";
import { IDLE, type Input } from "./vehicle";
import { buildWorld, type WorldRuntime } from "./world";

const params = new URLSearchParams(location.search);
const config = { autostart: params.get("autostart") === "1", manual: params.get("manual") === "1", quality: (params.get("quality") === "low" ? "low" : "high") as "high" | "low" };

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`heatsink-port: #${id} is missing`);
  return el as T;
};
const canvas = $<HTMLCanvasElement>("world");

const track = new Track();
let race = new Race(track);
const hudModel = { current: new HudModel() };
let app: AuraApp | undefined;
let runtime: WorldRuntime | undefined;
let started = config.manual;
let paused = false;
let heldInput: Input | null = null;
let manualInput: Input | null = null;
let renderTime = 0;
let frames = 0;
let lastHud: ReturnType<HudModel["update"]> | undefined;
let lastCount = "";

/* ------------------------------------------------------------------ input */

const BIND = { throttle: ["KeyW", "ArrowUp"], brake: ["KeyS", "ArrowDown"], left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"], afterburner: ["ShiftLeft", "ShiftRight"], ramjet: ["Space"], drift: ["KeyE"], fire: ["KeyF", "KeyJ"] } as const;
const down = new Set<string>();
let steerSmooth = 0;
let pointerFire = false;
const held = (keys: readonly string[]): boolean => keys.some((k) => down.has(k));

function sampleInput(dt: number): Input {
  if (heldInput) return heldInput;
  const target = (held(BIND.right) ? 1 : 0) - (held(BIND.left) ? 1 : 0);
  steerSmooth += (target - steerSmooth) * (1 - Math.exp(-dt * 12));
  return { throttle: held(BIND.throttle) ? 1 : 0, brake: held(BIND.brake) ? 1 : 0, steer: steerSmooth, afterburner: held(BIND.afterburner), ramjet: held(BIND.ramjet), drift: held(BIND.drift), fire: held(BIND.fire) || pointerFire };
}

addEventListener("keydown", (e) => {
  if (Object.values(BIND).some((k) => (k as readonly string[]).includes(e.code))) e.preventDefault();
  if (e.repeat) return;
  if (e.code === "Escape") { paused = !paused; return; }
  if (e.code === "Enter" && !started) { begin(); return; }
  down.add(e.code);
});
addEventListener("keyup", (e) => down.delete(e.code));
addEventListener("blur", () => { down.clear(); steerSmooth = 0; pointerFire = false; });
canvas.addEventListener("pointerdown", () => { pointerFire = true; });
addEventListener("pointerup", () => { pointerFire = false; });

/* ------------------------------------------------------------------ flow */

function begin(): void {
  race = new Race(track);
  hudModel.current = new HudModel();
  runtime?.resetCamera();
  loop.resetAccumulator();
  started = true;
  paused = false;
  $("menu").classList.add("hidden");
  $("results").classList.add("hidden");
}

function simulate(steps: number, input?: Input): void {
  for (let i = 0; i < steps; i++) {
    race.frame(FRAME, input ?? sampleInput(FRAME));
    lastHud = hudModel.current.update(FRAME, race);
  }
}

function updateHud(v: NonNullable<typeof lastHud>): void {
  const set = (id: string, text: string): void => { const el = $(id); if (el.textContent !== text) el.textContent = text; };
  set("h-score", v.score); set("h-mult", v.multiplier); set("h-targets", v.targets); set("objective", v.objective);
  $("h-mult").classList.toggle("hot", v.chain >= 2);
  set("h-pos", v.pos); set("h-posof", v.posOf); set("h-lap", v.lap); set("h-time", v.time); set("h-best", v.best); set("h-td", v.takedowns); set("h-speed", v.speed);
  set("h-ab-p", v.pct.ab); set("h-heat-p", v.pct.heat); set("h-shield-p", v.pct.shield); set("h-gun-p", v.pct.gun); set("h-heat-label", v.heatLabel);
  $("h-ab").style.width = v.width.ab; $("h-heat").style.width = v.width.heat; $("h-shield").style.width = v.width.shield; $("h-gun").style.width = v.width.gun;
  const count = race.state === "countdown" ? String(Math.max(1, Math.ceil(race.countdown - 0.2))) : race.countdown > -0.8 && race.state === "race" ? "GO" : "";
  if (count !== lastCount) { lastCount = count; const el = $("count"); el.textContent = count; el.classList.toggle("hidden", !count); }
  if (race.resultsOpen) {
    $("results").classList.remove("hidden");
    const ops = race.ops;
    $("results-title").textContent = race.state === "dnf" ? "DNF" : "Finished";
    $("medal-line").textContent = race.state === "dnf" ? "No medal: finish the race to earn one" : ops.medal === "none" ? `No medal: ${ops.kills} of ${ops.totalTargets} kills (bronze needs ${STRIKE.medals.bronze})` : `${ops.medal.toUpperCase()} medal`;
    $("results-body").textContent = `Score ${ops.score}   Kills ${ops.kills}/${ops.totalTargets}   Barrels ${ops.barrelsShot}   Best chain ${ops.bestChain}   Accuracy ${ops.shots ? Math.round((ops.hits / ops.shots) * 100) : 0}%   Time ${formatTime(race.player.finished ? race.player.finishTime : race.raceTime)}   Best lap ${race.bestLap ? formatTime(race.bestLap) : "--"}   Crashes ${race.player.crashes}`;
  }
}

function render(dt: number): void {
  if (!app || !runtime) return;
  const v = lastHud ?? hudModel.current.update(0, race);
  updateHud(v);
  runtime.update(race, v, dt, renderTime, canvas.clientWidth / Math.max(1, canvas.clientHeight));
  app.step(0);
  frames++;
}

const loop = createFixedStepLoop({
  stepSeconds: FRAME,
  maxFrameSeconds: 0.1,
  maxCatchUpSteps: 7,
  manual: config.manual,
  isActive: () => ready && started && !paused,
  step() {
    simulate(1, manualInput ?? undefined);
  }
});

let last = performance.now();
function tick(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  loop.tick(now);
  if (ready && !config.manual) { renderTime += dt; render(dt); }
  requestAnimationFrame(tick);
}

/* ------------------------------------------------------------------ hooks */

const state = () => {
  const p = race.player;
  return {
    state: race.state, step: race.frames, raceTime: race.raceTime, countdown: race.countdown, lapIdx: race.lapIdx, bestLap: race.bestLap,
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

const hooks = installQaHooks("heatsink", {
  ready: () => ready,
  state,
  app: () => app,
  begin,
  reset() { begin(); },
  nodeCount: () => runtime?.nodeCount ?? 0,
  routeHealth: () => (app ? createAuraRouteHealthSnapshot(app, { parityIds: ["SG-03", "SG-05", "SH-02", "R-23", "R-24"] }) : null),
  /** run `n` fixed 1/60 s steps (optionally with a fixed input), then render once */
  stepFrames(n: number, input?: Partial<Input>) {
    manualInput = (input as Input | undefined) ?? heldInput ?? IDLE;
    loop.advance(n);
    manualInput = null;
    renderTime += n * FRAME;
    render(FRAME);
  },
  /** replay a recorded run-length input script step-exactly on a fresh race and return the final state */
  replay(text: string) {
    race = new Race(track);
    hudModel.current = new HudModel();
    runtime?.resetCamera();
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
      race = new Race(track);
      hudModel.current = new HudModel();
      runtime?.resetCamera();
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
    frames: () => frames,
    hud: () => lastHud ?? null
  }
});

/* ------------------------------------------------------------------ boot */

let ready = false;

function sizeCanvas(): void {
  const dpr = Math.min(devicePixelRatio || 1, config.quality === "low" ? 1 : 1.65);
  canvas.width = Math.max(2, Math.round(canvas.clientWidth * dpr));
  canvas.height = Math.max(2, Math.round(canvas.clientHeight * dpr));
}

async function boot(): Promise<void> {
  sizeCanvas();
  const world = buildWorld(track, config.quality);
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
  if (!config.autostart && !config.manual) $("menu").classList.remove("hidden");
  lastHud = hudModel.current.update(0, race);
  render(0);
  if (config.autostart) begin();
}

$("start").addEventListener("click", begin);
$("again").addEventListener("click", begin);
addEventListener("resize", sizeCanvas);
requestAnimationFrame(tick);

function reportError(error: unknown): void {
  const base = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const code = (error as { code?: unknown })?.code;
  const details = (error as { details?: unknown })?.details;
  const message = `${base}${typeof code === "string" ? ` [${code}]` : ""}${details ? ` ${JSON.stringify(details).slice(0, 6000)}` : ""}`;
  hooks.reportError(message);
  $("loading-status").textContent = `The track could not load: ${message.slice(0, 300)}`;
  $("loading").classList.remove("hidden");
  console.error(error);
}

boot().catch(reportError);
void CFG;
