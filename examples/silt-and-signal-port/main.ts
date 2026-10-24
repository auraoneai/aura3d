/**
 * Silt & Signal on Aura3D: boot, screens, fixed-step loop, input (keyboard, pointer/touch, gamepad), HUD, audio
 * and capture hooks. The simulation lives in `sim.ts` (pure); `world.ts` renders it through the public engine surface.
 *
 * Query parameters (all optional): `chapter=0..6`, `objective=N` (the QA jump: the rider starts 40 m
 * behind the objective's first point), `autopilot=1` (fly the reference controller), `manual=1` (the sim
 * only advances through `__AURA_SILT__.stepFrames` / `replay`), `start=1` (skip the title screen). Any of
 * `objective`, `autopilot`, `manual` or `start` goes straight into play with no screens.
 */
import { createAuraApp, createAuraRouteHealthSnapshot, effects, type AuraApp } from "@aura3d/engine";
import { updateCompass } from "@aura3d/engine/game";
import { CHAPTERS } from "./chapters-data";
import { autopilot } from "./autopilot";
import { createSiltAudio, type SiltAudio } from "./audio";
import { CHAPTER_COPY, ENDING_COPY, OBJECTIVE_TITLES, SCENE_COPY } from "./copy";
import { IDLE, STEP, createSim, objectiveOf, stepSim, targetOf, type Input, type Sim, type SimEvent } from "./sim";
import { buildWorld, type World, type WorldRuntime } from "./world";

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
  /** linear output exposure; the original renders with no tone mapping at exposure 1; 0.65 here brings this PBR rig's mean luma near the original's frames (measured, see evidence README) */
  exposure: Number.isFinite(Number(params.get("exposure"))) && params.has("exposure") ? Number(params.get("exposure")) : 0.65
};
config.objective = Math.min(config.objective, CHAPTERS[config.chapter]!.objectives.length - 1);
const qa = params.has("objective") || params.has("autopilot") || params.has("manual") || params.get("start") === "1";

type Mode = "title" | "play" | "paused" | "scene" | "done";
let mode: Mode = qa ? "play" : "title";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`silt-and-signal-port: #${id} is missing`);
  return el as T;
};
const canvas = $<HTMLCanvasElement>("world");

let sim: Sim = createSim(config.chapter, config.objective);
let app: AuraApp | undefined;
let world: World | undefined;
let runtime: WorldRuntime | undefined;
let ready = false;
let autopilotOn = config.autopilot;
let renderTime = 0;
let frames = 0;
let accumulator = 0;
let hudTimer = 0;
let toastTimer = 0;
let heldInput: Input | null = null;
const down = new Set<string>();
const audio: SiltAudio = createSiltAudio(config.chapter);

const chapterName = (index: number): string => CHAPTER_COPY[CHAPTERS[index]!.id]?.name ?? CHAPTERS[index]!.name;
const objectiveTitle = (id: string, fallback: string): string => OBJECTIVE_TITLES[id] ?? fallback;

/* ------------------------------------------------------------------ screens */

const SCREENS: Record<Exclude<Mode, "play">, string> = { title: "title-screen", paused: "pause-screen", scene: "scene-screen", done: "done-screen" };

function setMode(next: Mode): void {
  mode = next;
  for (const id of Object.values(SCREENS)) $(id).classList.toggle("hidden", SCREENS[next as Exclude<Mode, "play">] !== id);
  $("hud").classList.toggle("hidden", next === "title");
  if (next !== "play") { down.clear(); pointers.clear(); }
  syncMuteLabels();
}

function syncMuteLabels(): void {
  const label = `Sound: ${audio.muted ? "off" : "on"}`;
  $("mute-button").textContent = label;
  $("pause-mute").textContent = label;
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

function openDone(): void {
  $("done-lines").innerHTML = ENDING_COPY.map((line) => `<p>${line}</p>`).join("");
  const minutes = Math.floor(sim.state.elapsed / 60), seconds = Math.floor(sim.state.elapsed % 60);
  $("done-stats").textContent = `Time in flight this chapter: ${minutes}:${String(seconds).padStart(2, "0")}`;
  setMode("done");
}

function goToChapter(chapter: number): void {
  location.search = `?chapter=${chapter}&start=1`;
}

function continueScene(): void {
  if (mode !== "scene") return;
  if (sim.state.pendingChapter !== null) { goToChapter(sim.state.pendingChapter); return; }
  sim.state.scene = null;
  setMode("play");
}

function beginPlay(): void {
  audio.resume();
  setMode("play");
}

/* ------------------------------------------------------------------ input */

const KEYS = ["KeyW", "KeyS", "KeyA", "KeyD", "KeyE", "KeyQ", "KeyB", "ShiftLeft", "ShiftRight", "Space", "KeyF", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
addEventListener("keydown", (e) => {
  if (mode === "title" && (e.code === "Enter" || e.code === "Space")) { e.preventDefault(); beginPlay(); return; }
  if (mode === "scene" && (e.code === "Enter" || e.code === "Space")) { e.preventDefault(); continueScene(); return; }
  if (e.code === "Escape" && !qa) { if (mode === "play") setMode("paused"); else if (mode === "paused") setMode("play"); return; }
  if (KEYS.includes(e.code)) { e.preventDefault(); down.add(e.code); }
  if (e.code === "KeyP") autopilotOn = !autopilotOn;
});
addEventListener("keyup", (e) => down.delete(e.code));
addEventListener("blur", () => { down.clear(); pointers.clear(); if (mode === "play" && !qa) setMode("paused"); });

const held = (...codes: string[]): boolean => codes.some((c) => down.has(c));
const largest = (...values: number[]): number => values.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);

interface Pointer { startX: number; startY: number; x: number; y: number }
const pointers = new Map<number, Pointer>();
canvas.addEventListener("pointerdown", (e) => {
  if (mode !== "play") return;
  audio.resume();
  canvas.setPointerCapture?.(e.pointerId);
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

let padStartHeld = false;
function readPad(): Partial<Input> {
  const pads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
  const pad = Array.from(pads).find((p): p is Gamepad => !!p && p.connected);
  if (!pad) return {};
  const dead = (v: number | undefined): number => (Math.abs(v ?? 0) < 0.15 ? 0 : (v ?? 0));
  const start = !!pad.buttons[9]?.pressed;
  if (start && !padStartHeld && !qa) setMode(mode === "play" ? "paused" : mode === "paused" ? "play" : mode);
  padStartHeld = start;
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
  const pad = readPad(), ptr = readPointer();
  return {
    throttle: Math.max(-1, Math.min(1, largest(held("KeyW", "ArrowUp") ? 1 : held("KeyS", "ArrowDown") ? -1 : 0, pad.throttle ?? 0, ptr.throttle ?? 0))),
    steer: Math.max(-1, Math.min(1, largest(held("KeyD", "ArrowRight") ? 1 : held("KeyA", "ArrowLeft") ? -1 : 0, pad.steer ?? 0, ptr.steer ?? 0))),
    lift: Math.max(-1, Math.min(1, largest(held("KeyE") ? 1 : held("KeyQ") ? -1 : 0, pad.lift ?? 0, ptr.lift ?? 0))),
    brake: held("KeyB") || !!pad.brake,
    boost: held("ShiftLeft", "ShiftRight", "Space") || !!pad.boost || !!ptr.boost,
    interact: held("KeyF") || !!pad.interact
  };
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
  runtime.update(sim, dt, renderTime, canvas.clientWidth / Math.max(1, canvas.clientHeight));
  const pose = overridePose ?? (mode === "title" ? titlePose() : null);
  if (pose) app.camera?.setPose(pose, { cut: true });
  app.step(0);
  frames++;
}

function onEvents(events: readonly SimEvent[]): void {
  for (const ev of events) {
    audio.chime(ev.type);
    const o = objectiveOf(sim.state);
    if (ev.type === "point") toast(`${sim.state.point} of ${o.points.length} rings`);
    else if (ev.type === "attach") toast("Hooked on");
    else toast("Objective complete");
  }
}

function tick(now: number, last: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  renderTime += dt;
  if (ready && !config.manual) {
    if (mode === "play") {
      accumulator += dt;
      let guard = 0;
      while (accumulator >= STEP && guard++ < 8) {
        const events = stepSim(sim, sampleInput(), STEP);
        if (events.length) onEvents(events);
        accumulator -= STEP;
      }
      if (!qa || params.get("start") === "1") {
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
  requestAnimationFrame((t) => tick(t, now));
}

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
  updateCompass($("compass"), state, t, state.yaw);
}

/* ------------------------------------------------------------------ hooks */

/** One recorded step: [x, y, z, yaw, speed, turn, bank, vertical, energy, objective, point, hold, impacts]. */
type Row = [number, number, number, number, number, number, number, number, number, number, number, number, number];
const row = (): Row => {
  const { state: s, flight: f } = sim;
  return [s.x, s.y, s.z, s.yaw, f.speed, f.turn, f.bank, f.vertical, f.energy, s.objective, s.point, s.hold, f.impacts];
};

function reset(chapter = config.chapter, objective = config.objective, start?: { clockMs?: number; time?: number }): void {
  const ch = Math.max(0, Math.min(6, Math.trunc(chapter)));
  sim = createSim(ch, Math.max(0, Math.min(CHAPTERS[ch]!.objectives.length - 1, Math.trunc(objective))), undefined, start);
  accumulator = 0;
  heldInput = null;
}

function stepFrames(n: number, input: Input = IDLE): void {
  for (let i = 0; i < n; i++) stepSim(sim, input, STEP);
  render(STEP);
}

function replay(segments: readonly { steps: number; input: Input }[]): Row[] {
  const trace: Row[] = [];
  for (const seg of segments) for (let i = 0; i < seg.steps; i++) { stepSim(sim, seg.input, STEP); trace.push(row()); }
  render(STEP);
  return trace;
}

function installHooks(): void {
  const routeHealth = app ? createAuraRouteHealthSnapshot(app, { parityIds: ["SH-02", "SH-01", "SG-05", "ST-01"] }) : null;
  Object.assign(window as unknown as Record<string, unknown>, {
    __AURA_SILT__: {
      get ready() { return ready; },
      config,
      reset,
      stepFrames,
      replay,
      applyInput(input: Input | null) { heldInput = input; },
      setAutopilot(on: boolean) { autopilotOn = on; },
      state: () => structuredClone({ state: sim.state, flight: sim.flight, time: sim.time, steps: sim.steps }),
      row,
      render: () => render(0),
      /** a fixed camera pose for evidence frames; passing false returns to the chase camera */
      overview(on: boolean) {
        overridePose = on ? { position: [sim.state.x + 40, sim.state.y + 230, sim.state.z + 190], target: [sim.state.x, 0, sim.state.z - 160], up: [0, 1, 0], fov: 62 } : null;
      },
      /** an arbitrary evidence camera pose (or null for the chase camera) */
      pose(next: Pose | null) { overridePose = next; },
      setMode(next: Mode) { setMode(next); },
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
    b.addEventListener("click", () => (i === config.chapter ? beginPlay() : goToChapter(i)));
    names.appendChild(b);
  });
  $("title-tagline").textContent = CHAPTER_COPY[CHAPTERS[config.chapter]!.id]?.tagline ?? "";
  $("start-button").addEventListener("click", beginPlay);
  $("resume-button").addEventListener("click", () => setMode("play"));
  $("restart-button").addEventListener("click", () => { reset(sim.state.chapter, sim.state.objective); setMode("play"); });
  $("title-button").addEventListener("click", () => { reset(config.chapter, 0); setMode("title"); });
  $("scene-next").addEventListener("click", continueScene);
  $("again-button").addEventListener("click", () => goToChapter(0));
  const toggleMute = (): void => { audio.setMuted(!audio.muted); syncMuteLabels(); };
  $("mute-button").addEventListener("click", () => { audio.resume(); toggleMute(); });
  $("pause-mute").addEventListener("click", toggleMute);
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
  world = buildWorld(config.chapter);
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
  runtime = world.bind(app, { animate: !config.norig });
  ready = true;
  $("loading").classList.add("hidden");
  setMode(mode);
  installHooks();
  render(0);
  updateHud();
  requestAnimationFrame((t) => tick(t, t));
}

boot().catch((error) => {
  console.error(error);
  $("loading-status").textContent = `Could not start: ${String((error as Error)?.message ?? error)}`;
});
