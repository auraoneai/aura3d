/**
 * Silt & Signal on Aura3D: boot, screens, fixed-step loop, input (keyboard, pointer/touch, gamepad), HUD, audio
 * and capture hooks. The simulation lives in `sim.ts` (pure); `world.ts` renders it through the public engine surface.
 *
 * Query parameters (all optional): `chapter=0..6`, `objective=N` (the QA jump: the rider starts 40 m
 * behind the objective's first point), `autopilot=1` (fly the reference controller), `manual=1` (the sim
 * only advances through `__AURA_SILT__.stepFrames` / `replay`), `start=1` (skip the title screen). `objective`, `autopilot`
 * and `manual` are QA modes: straight into play, no pause on Esc / blur / Start. `start=1` alone is player mode without
 * the title (chapter changes and "Fly again" reload with it), so pause, audio and the results card all work.
 */
import { createAuraApp, createAuraRouteHealthSnapshot, createFixedStepLoop, effects, installQaHooks, type AuraApp } from "@aura3d/engine";
import { updateCompass } from "@aura3d/engine/game";
import { createSiltPresenter, viewOf } from "./presentation";
import { CHAPTERS } from "./chapters-data";
import { autopilot } from "./autopilot";
import { createSiltAudio, type SiltAudio } from "./audio";
import { CHAPTER_COPY, ENDING_COPY, OBJECTIVE_TITLES, SCENE_COPY } from "./copy";
import { STEP, createSim, objectiveOf, stepSim, targetOf, type Input, type Sim, type SimEvent } from "./sim";
import { buildWorld, type World, type WorldRuntime } from "./world";
import { mergeInput, objectiveHint, pageFlags, type Device } from "./controls";
import { clearJourney, journeyTotals, ratingOf, readJourney, recordOf, writeChapter } from "./journey";

const params = new URLSearchParams(location.search);
const intParam = (key: string, fallback: number, lo: number, hi: number): number => {
  const v = Number(params.get(key));
  return params.has(key) && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.trunc(v))) : fallback;
};
const config = {
  chapter: intParam("chapter", 0, 0, 6),
  objective: intParam("objective", 0, 0, 5),
  autopilot: params.get("autopilot") === "1",
  manual: params.get("manual") === "1",
  /** `norig=1` skips the animation controller (rider stays in the model's rest pose): an A/B for animation problems */
  norig: params.get("norig") === "1",
  /** `toon=0` turns the cel pass off (A/B against the plain PBR frame) */
  toon: params.get("toon") !== "0",
  /** `camclear=0` turns the chase-camera clearance off (A/B for the camera-inside-scenery check) */
  camClear: params.get("camclear") !== "0",
  /** linear output exposure; the original renders with no tone mapping at exposure 1; 0.65 here brings this PBR rig's mean luma near the original's frames (measured, see evidence README) */
  exposure: Number.isFinite(Number(params.get("exposure"))) && params.has("exposure") ? Number(params.get("exposure")) : 0.65
};
config.objective = Math.min(config.objective, CHAPTERS[config.chapter]!.objectives.length - 1);
const { qa, skipTitle } = pageFlags(params);

type Mode = "title" | "play" | "paused" | "scene" | "done";
let mode: Mode = qa || skipTitle ? "play" : "title";

const session: Storage | undefined = (() => { try { return window.sessionStorage; } catch { return undefined; } })();
const MUTE_KEY = "duneglide.muted";
const TEXT_KEY = "duneglide.text";
const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
const reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`silt-and-signal-port: #${id} is missing`);
  return el as T;
};
const canvas = $<HTMLCanvasElement>("world");

let sim: Sim = createSim(config.chapter, config.objective);
const presenter = createSiltPresenter(() => sim);
/** True while a QA hook draws the exact latest step (stepFrames, replay) instead of the interpolated pose. */
let drawLatest = false;
let app: AuraApp | undefined;
let world: World | undefined;
let runtime: WorldRuntime | undefined;
let ready = false;
let autopilotOn = config.autopilot;
let renderTime = 0;
let frames = 0;
let hudTimer = 0;
let toastTimer = 0;
let heldInput: Input | null = null;
const down = new Set<string>();
const audio: SiltAudio = createSiltAudio(config.chapter);
if (session?.getItem(MUTE_KEY) === "1") audio.setMuted(true);
/** The last device the player used, for the control names in the hint line. */
let device: Device = coarse ? "touch" : "keys";

const chapterName = (index: number): string => CHAPTER_COPY[CHAPTERS[index]!.id]?.name ?? CHAPTERS[index]!.name;
const objectiveTitle = (id: string, fallback: string): string => OBJECTIVE_TITLES[id] ?? fallback;

/* ------------------------------------------------------------------ screens */

const SCREENS: Record<Exclude<Mode, "play">, string> = { title: "title-screen", paused: "pause-screen", scene: "scene-screen", done: "done-screen" };

function setMode(next: Mode): void {
  mode = next;
  for (const id of Object.values(SCREENS)) $(id).classList.toggle("hidden", SCREENS[next as Exclude<Mode, "play">] !== id);
  $("hud").classList.toggle("hidden", next === "title");
  if (next !== "play") { down.clear(); pointers.clear(); touch.hold = false; touch.boost = false; }
  syncMuteLabels();
}

function syncMuteLabels(): void {
  const label = `Sound: ${audio.muted ? "off" : "on"}`;
  $("mute-button").textContent = label;
  $("pause-mute").textContent = label;
  const text = `Text: ${document.body.classList.contains("text-large") ? "large" : "normal"}`;
  $("text-button").textContent = text;
  $("pause-text").textContent = text;
}

function toggleMute(): void {
  audio.setMuted(!audio.muted);
  try { session?.setItem(MUTE_KEY, audio.muted ? "1" : "0"); } catch { /* blocked */ }
  syncMuteLabels();
}

function toggleTextSize(): void {
  const large = document.body.classList.toggle("text-large");
  try { session?.setItem(TEXT_KEY, large ? "large" : "normal"); } catch { /* blocked */ }
  syncMuteLabels();
}

function toast(text: string): void {
  const el = $("toast");
  el.textContent = text;
  el.classList.add("show");
  toastTimer = 1.6;
}

function openScene(): void {
  const id = sim.state.scene ?? "";
  const lines = SCENE_COPY[id] ?? ["The road goes on."];
  $("scene-chapter").textContent = `${chapterName(sim.state.chapter)}`;
  $("scene-lines").innerHTML = lines.map((line) => `<p>${line.replace(/[<>&]/g, "")}</p>`).join("");
  audio.chime("scene");
  setMode("scene");
}

/** Results for the whole journey: every chapter flown since the title screen, summed from sessionStorage. */
function openDone(): void {
  $("done-lines").innerHTML = ENDING_COPY.map((line) => `<p>${line}</p>`).join("");
  const totals = journeyTotals(readJourney(session), sim.state.chapter, recordOf(sim));
  const minutes = Math.floor(totals.elapsed / 60), seconds = Math.floor(totals.elapsed % 60);
  const cell = (label: string, value: string | number, wide = false): string => `<div class="cell${wide ? " wide" : ""}"><span class="meta">${label}</span><b>${value}</b></div>`;
  $("done-stats").innerHTML = [
    cell("Time in flight", `${minutes}:${String(seconds).padStart(2, "0")}`),
    cell("Lamps restored", totals.restored),
    cell("Chapters flown", `${totals.chapters} of ${CHAPTERS.length}`),
    cell("Impacts", totals.impacts),
    cell("Rating", ratingOf(totals.impacts), true)
  ].join("");
  setMode("done");
}

function goToChapter(chapter: number): void {
  location.search = `?chapter=${chapter}&start=1`;
}

function continueScene(): void {
  if (mode !== "scene") return;
  if (sim.state.pendingChapter !== null) {
    writeChapter(session, sim.state.chapter, recordOf(sim));
    goToChapter(sim.state.pendingChapter);
    return;
  }
  sim.state.scene = null;
  setMode("play");
}

/** A journey starts on the title screen: totals from an earlier run are dropped. */
function beginPlay(): void {
  clearJourney(session);
  audio.resume();
  setMode("play");
}

/* ------------------------------------------------------------------ input */

const KEYS = ["KeyW", "KeyS", "KeyA", "KeyD", "KeyE", "KeyQ", "KeyB", "ShiftLeft", "ShiftRight", "Space", "KeyF", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
addEventListener("keydown", (e) => {
  device = "keys";
  // the first key press is a user gesture: start audio (chapter reloads land straight in play, with no Begin click)
  if (mode !== "title" && !audio.running && !qa) audio.resume();
  if (mode === "title" && (e.code === "Enter" || e.code === "Space")) { e.preventDefault(); beginPlay(); return; }
  if (mode === "scene" && (e.code === "Enter" || e.code === "Space")) { e.preventDefault(); continueScene(); return; }
  if (e.code === "Escape" && !qa) { if (mode === "play") setMode("paused"); else if (mode === "paused") setMode("play"); return; }
  if (KEYS.includes(e.code)) { e.preventDefault(); down.add(e.code); }
  if (e.code === "KeyP") autopilotOn = !autopilotOn;
});
addEventListener("keyup", (e) => down.delete(e.code));
addEventListener("blur", () => { down.clear(); pointers.clear(); touch.hold = false; touch.boost = false; if (mode === "play" && !qa) setMode("paused"); });

const held = (...codes: string[]): boolean => codes.some((c) => down.has(c));

interface Pointer { startX: number; startY: number; x: number; y: number }
const pointers = new Map<number, Pointer>();
canvas.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "touch") showTouch();
  if (mode !== "play") return;
  audio.resume();
  try { canvas.setPointerCapture?.(e.pointerId); } catch { /* synthetic or already released pointer */ }
  pointers.set(e.pointerId, { startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY });
});
canvas.addEventListener("pointermove", (e) => {
  const p = pointers.get(e.pointerId);
  if (p) { p.x = e.clientX; p.y = e.clientY; }
});
for (const type of ["pointerup", "pointercancel"] as const) canvas.addEventListener(type, (e) => { pointers.delete(e.pointerId); });

function readPointer(): Partial<Input> {
  const first = pointers.values().next().value as Pointer | undefined;
  if (!first) return {};
  const reach = Math.max(60, Math.min(160, canvas.clientWidth * 0.12));
  return {
    throttle: 1,
    steer: Math.max(-1, Math.min(1, (first.x - first.startX) / reach)),
    lift: Math.max(-1, Math.min(1, -(first.y - first.startY) / reach)),
    boost: pointers.size >= 2
  };
}

/* On-screen buttons for touch players (shown on coarse pointers or after the first touch): Hold sends interact and brake,
 * Boost boosts, Pause pauses. They sit outside the canvas, so they never count as a steering finger. */
const touch = { hold: false, boost: false };
function showTouch(): void {
  device = "touch";
  document.body.classList.add("touch");
}
function bindHoldButton(id: string, key: "hold" | "boost"): void {
  const el = $(id);
  const set = (on: boolean) => (e: PointerEvent): void => {
    e.preventDefault();
    if (on) { showTouch(); audio.resume(); try { el.setPointerCapture?.(e.pointerId); } catch { /* synthetic pointer */ } }
    touch[key] = on && mode === "play";
    el.classList.toggle("down", touch[key]);
  };
  el.addEventListener("pointerdown", set(true));
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) el.addEventListener(type, set(false));
  el.addEventListener("contextmenu", (e) => e.preventDefault());
}

let padStartHeld = false;
let padAnyHeld = false;
function readPad(): Partial<Input> {
  const pads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
  const pad = Array.from(pads).find((p): p is Gamepad => !!p && p.connected);
  if (!pad) return {};
  const dead = (v: number | undefined): number => (Math.abs(v ?? 0) < 0.15 ? 0 : (v ?? 0));
  const start = !!pad.buttons[9]?.pressed;
  if (start && !padStartHeld && !qa) setMode(mode === "play" ? "paused" : mode === "paused" ? "play" : mode);
  padStartHeld = start;
  const any = pad.buttons.some((b) => b.pressed);
  if (any && !padAnyHeld) { device = "pad"; if (!qa) audio.resume(); }
  padAnyHeld = any;
  const rt = pad.buttons[7]?.value ?? 0;
  return {
    throttle: -dead(pad.axes[1]),
    steer: dead(pad.axes[0]),
    lift: -dead(pad.axes[3]),
    brake: !!pad.buttons[1]?.pressed || (pad.buttons[6]?.value ?? 0) > 0.5,
    boost: !!pad.buttons[0]?.pressed || rt > 0.5,
    interact: !!pad.buttons[2]?.pressed
  };
}

function sampleInput(): Input {
  if (heldInput) return heldInput;
  if (autopilotOn) return autopilot(sim);
  return mergeInput({
    keys: {
      throttle: held("KeyW", "ArrowUp") ? 1 : held("KeyS", "ArrowDown") ? -1 : 0,
      steer: held("KeyD", "ArrowRight") ? 1 : held("KeyA", "ArrowLeft") ? -1 : 0,
      lift: held("KeyE") ? 1 : held("KeyQ") ? -1 : 0,
      brake: held("KeyB"),
      boost: held("ShiftLeft", "ShiftRight", "Space"),
      interact: held("KeyF")
    },
    pad: readPad(),
    pointer: readPointer(),
    touch
  });
}

/* ------------------------------------------------------------------ loop */

type Pose = { position: [number, number, number]; target: [number, number, number]; up: [number, number, number]; fov: number };
let overridePose: Pose | null = null;

function titlePose(): Pose {
  const a = renderTime * 0.12;
  const { x, y, z } = sim.state;
  return { position: [x + Math.sin(a) * 30, y + 9 + Math.sin(a * 0.7) * 2, z + Math.cos(a) * 30], target: [x, y + 1, z], up: [0, 1, 0], fov: 55 };
}

function render(dt: number): void {
  if (!app || !runtime) return;
  const live = mode === "play" && !config.manual && !drawLatest;
  runtime.update(live ? viewOf(sim, presenter.present(loop, true)) : sim, dt, renderTime, canvas.clientWidth / Math.max(1, canvas.clientHeight), drawLatest);
  const pose = overridePose ?? (mode === "title" ? titlePose() : null);
  if (pose) app.camera?.setPose(pose, { cut: true });
  app.step(0);
  frames++;
}

function onEvents(events: readonly SimEvent[]): void {
  for (const ev of events) {
    audio.chime(ev.type);
    const o = objectiveOf(sim.state);
    if (ev.type === "impact") {
      runtime?.shake(Math.min(1, ev.speed / 40));
      toast(`Impact: speed ${Math.round(ev.speed)} to ${Math.round(Math.abs(sim.flight.speed))}`);
    } else if (ev.type === "point") toast(`${sim.state.point} of ${o.points.length} rings`);
    else if (ev.type === "attach") toast("Hooked on");
    else toast("Objective complete");
  }
}

/** The sim steps only in play mode; in other modes the loop still drains its clock so resuming never bursts. */
const loop = createFixedStepLoop({
  stepSeconds: STEP,
  maxCatchUpSteps: 8,
  manual: config.manual,
  step: () => {
    if (mode !== "play") return;
    const events = stepSim(sim, sampleInput(), STEP);
    presenter.afterStep();
    if (events.length) onEvents(events);
  },
  render: (dt) => {
    renderTime += dt;
    if (mode === "play") {
      if (!qa || skipTitle) {
        if (sim.state.completed) openDone();
        else if (sim.state.scene) openScene();
      }
      audio.update(sim, dt);
    }
    render(dt);
    hudTimer += dt;
    if (hudTimer > 0.08) { hudTimer = 0; updateHud(); }
    if (toastTimer > 0 && (toastTimer -= dt) <= 0) $("toast").classList.remove("show");
  }
});

/* ------------------------------------------------------------------ HUD */

function updateHud(): void {
  const { state, flight } = sim;
  const ch = CHAPTERS[state.chapter]!;
  const o = objectiveOf(state);
  const t = targetOf(state);
  $("chapter").textContent = chapterName(state.chapter);
  $("objective").textContent = state.completed ? "The journey is complete" : state.scene ? "…" : objectiveTitle(o.id, o.title);
  $("distance").textContent = `${Math.hypot(state.x - t.x, state.z - t.z).toFixed(0)} m`;
  $("steps").textContent = `${state.objective + 1}/${ch.objectives.length} · ring ${state.point + 1}/${o.points.length}`;
  $("speed").textContent = `${Math.abs(flight.speed).toFixed(0)}`;
  $("altitude").textContent = `${state.y.toFixed(0)}`;
  $<HTMLElement>("energy").style.width = `${(flight.energy * 100).toFixed(0)}%`;
  $("mode").textContent = flight.boostMode;
  $("hold").textContent = state.hold > 0 ? `holding ${state.hold.toFixed(1)} s` : "";
  const hint = objectiveHint(sim, device);
  const hintEl = $("hint");
  hintEl.textContent = hint?.text ?? "";
  hintEl.classList.toggle("warn", !!hint?.warn);
  hintEl.classList.toggle("hidden", !hint);
  updateCompass($("compass"), state, t, state.yaw);
}

/* ------------------------------------------------------------------ hooks */

/** One recorded step: [x, y, z, yaw, speed, turn, bank, vertical, energy, objective, point, hold, impacts]. */
type Row = [number, number, number, number, number, number, number, number, number, number, number, number, number];
const row = (): Row => {
  const { state: s, flight: f } = sim;
  return [s.x, s.y, s.z, s.yaw, f.speed, f.turn, f.bank, f.vertical, f.energy, s.objective, s.point, s.hold, f.impacts];
};

function reset(chapter = config.chapter, objective = config.objective, start?: { x?: number; y?: number; z?: number; yaw?: number; clockMs?: number; time?: number }): void {
  const ch = Math.max(0, Math.min(6, Math.trunc(chapter)));
  sim = createSim(ch, Math.max(0, Math.min(CHAPTERS[ch]!.objectives.length - 1, Math.trunc(objective))), undefined, start);
  loop.resetAccumulator();
  presenter.reset();
  heldInput = null;
}

/** QA stepping. With no input it samples the live controls (keys, pad, touch buttons or the autopilot) every step. */
function stepFrames(n: number, input?: Input): void {
  for (let i = 0; i < n; i++) {
    const events = stepSim(sim, input ?? sampleInput(), STEP);
    if (events.length) onEvents(events);
  }
  presenter.reset();
  drawLatest = true;
  render(STEP);
  drawLatest = false;
  updateHud();
}

function replay(segments: readonly { steps: number; input: Input }[]): Row[] {
  const trace: Row[] = [];
  for (const seg of segments) for (let i = 0; i < seg.steps; i++) { stepSim(sim, seg.input, STEP); trace.push(row()); }
  presenter.reset();
  drawLatest = true;
  render(STEP);
  drawLatest = false;
  updateHud();
  return trace;
}

function installHooks(): void {
  const routeHealth = app ? createAuraRouteHealthSnapshot(app, { parityIds: ["SH-02", "SH-01", "SG-05", "ST-01"] }) : null;
  installQaHooks("silt", {
    ready: () => ready,
    state: () => structuredClone({ state: sim.state, flight: sim.flight, time: sim.time, steps: sim.steps }),
    stepFrames: (n, input) => stepFrames(n, input as Input | undefined),
    app: () => app,
    routeHealth: () => routeHealth,
    nodeCount: () => runtime?.nodeCount ?? 0,
    extras: {
      get ready() { return ready; },
      config,
      reset,
      replay,
      applyInput(input: Input | null) { heldInput = input; },
      setAutopilot(on: boolean) { autopilotOn = on; },
      row,
      render: () => { render(0); updateHud(); },
      /** the last chase eye and whether it is inside scenery or under the terrain */
      camera: () => runtime?.cameraEye() ?? null,
      /** a fixed camera pose for evidence frames; passing false returns to the chase camera */
      overview(on: boolean) {
        overridePose = on ? { position: [sim.state.x + 40, sim.state.y + 230, sim.state.z + 190], target: [sim.state.x, 0, sim.state.z - 160], up: [0, 1, 0], fov: 62 } : null;
      },
      /** an arbitrary evidence camera pose (or null for the chase camera) */
      pose(next: Pose | null) { overridePose = next; },
      setMode(next: Mode) { if (next === "done") openDone(); else setMode(next); },
      mode: () => mode,
      info: () => ({ frames, nodeCount: runtime?.nodeCount ?? 0, diagnostics: app?.diagnostics() ?? null, routeHealth, world: world?.stats ?? null, rider: runtime?.riderAnimation() ?? null, audio: { muted: audio.muted, running: audio.running } })
    }
  });
}

function wireScreens(): void {
  const names = $("chapter-buttons");
  CHAPTERS.forEach((_, i) => {
    const b = document.createElement("button");
    b.textContent = `${i + 1}. ${chapterName(i)}`;
    b.title = CHAPTER_COPY[CHAPTERS[i]!.id]?.tagline ?? "";
    b.addEventListener("click", () => { if (i === config.chapter) beginPlay(); else { clearJourney(session); goToChapter(i); } });
    names.appendChild(b);
  });
  $("title-tagline").textContent = CHAPTER_COPY[CHAPTERS[config.chapter]!.id]?.tagline ?? "";
  $("start-button").addEventListener("click", beginPlay);
  $("resume-button").addEventListener("click", () => setMode("play"));
  $("restart-button").addEventListener("click", () => { reset(sim.state.chapter, sim.state.objective); setMode("play"); });
  $("title-button").addEventListener("click", () => { reset(config.chapter, 0); setMode("title"); });
  $("scene-next").addEventListener("click", continueScene);
  $("again-button").addEventListener("click", () => { clearJourney(session); goToChapter(0); });
  $("mute-button").addEventListener("click", () => { audio.resume(); toggleMute(); });
  $("pause-mute").addEventListener("click", () => { audio.resume(); toggleMute(); });
  $("text-button").addEventListener("click", toggleTextSize);
  $("pause-text").addEventListener("click", toggleTextSize);
  bindHoldButton("touch-hold", "hold");
  bindHoldButton("touch-boost", "boost");
  $("touch-pause").addEventListener("click", () => { if (mode === "play") setMode("paused"); else if (mode === "paused") setMode("play"); });
  if (coarse) showTouch();
  if (session?.getItem(TEXT_KEY) === "large") document.body.classList.add("text-large");
}

/**
 * The loading screen stays up until the textured materials have swapped in (or LOADING_CAP_MS of wall time passes), so a
 * slow device does not show the untextured first frames as the title. The loop already runs behind it. On the software-GL
 * runner the frame settles about 45 s after mount while one material stays pending for minutes, hence the cap.
 */
const LOADING_CAP_MS = 45_000;
function hideLoadingWhenSettled(started: number): void {
  const rows = (app?.diagnostics() as { renderer?: { runtime?: { texturedMaterials?: readonly { status: string }[] } } } | undefined)?.renderer?.runtime?.texturedMaterials ?? [];
  const pending = rows.filter((r) => r.status === "pending").length;
  const elapsed = Date.now() - started;
  if ((rows.length > 0 && pending === 0) || elapsed > LOADING_CAP_MS) {
    $("loading").classList.add("hidden");
    (window as unknown as { __DUNEGLIDE_LOADED_MS__?: number }).__DUNEGLIDE_LOADED_MS__ = Math.round(elapsed);
    return;
  }
  $("loading-status").textContent = `Painting the valley (${rows.length - pending} of ${rows.length} surfaces)`;
  setTimeout(() => hideLoadingWhenSettled(started), 250);
}

async function boot(): Promise<void> {
  const size = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  };
  size();
  addEventListener("resize", size);
  wireScreens();
  // phones and tablets get a 2048 sun shadow map (a quarter of the 4096 texels; the heaviest pass on a phone GPU)
  world = buildWorld(config.chapter, { shadowMapSize: coarse ? 2048 : 4096 });
  app = createAuraApp(canvas, {
    autoStart: false,
    resize: false,
    pixelRatio: 1,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    output: { toneMapping: "none", exposure: config.exposure, dither: false },
    scene: world.scene
  });
  await app.ready();
  if (config.toon) {
    const texel = (): number[] => [1 / Math.max(1, canvas.width), 1 / Math.max(1, canvas.height)];
    app.post?.addPostPass?.(effects.toon({ name: "silt-cel", bands: 5, bandMix: 0.75, outline: 0.75, size: [canvas.width, canvas.height] }));
    addEventListener("resize", () => app?.post?.setPassUniform?.("silt-cel", "u_texel", texel()));
  }
  runtime = world.bind(app, { animate: !config.norig, clearCamera: config.camClear, reducedMotion });
  ready = true;
  setMode(mode);
  installHooks();
  render(0);
  updateHud();
  loop.start();
  // QA pages keep the old behaviour (no wait); players get the settled frame first
  if (qa) $("loading").classList.add("hidden");
  else hideLoadingWhenSettled(Date.now());
}

boot().catch((error) => {
  console.error(error);
  $("loading-status").textContent = `Could not start: ${String((error as Error)?.message ?? error)}`;
});
