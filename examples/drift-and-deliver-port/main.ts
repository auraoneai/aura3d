/**
 * Drift & Deliver on Aura3D: boot, fixed-step loop, input, HUD, scene and capture hooks.
 *
 * The driving model lives in `sim.ts` (pure, line-for-line from the original), the city and pickups in
 * `world.ts`, the chase camera in `chase.ts`. This file renders them through the public `@aura3d/engine`
 * surface only. It also installs the original's QA surface (`__sim`, `__tp`, `__game`, `__gameEntities`,
 * `__dbg.nearSolids`) so the same capture runner that recorded the original can drive this port.
 *
 * Query parameters (all optional): `manual=1` (the sim only advances through `__sim` /
 * `__AURA_DRIFT_AND_DELIVER__.stepFrames`; no overlay), `autostart=1`, `quality=high|low`.
 */
import { createAuraApp, createAuraRouteHealthSnapshot, createFixedStepLoop, geometry, installQaHooks, material, primitives, type AuraApp } from "@aura3d/engine";
import { createRenderInterpolator, drawCanvasMinimap, summarizeTextureUpgrade, warmPrograms } from "@aura3d/engine/game";
import { blendPresented, type Presented } from "./presentation";
import { buildLook, coinMat, mat, type LookRig } from "./look";
import { createAudio } from "./audio";
import { createBlackFrameWatch, healParams, healStage, type BlackFrameWatch } from "@aura3d/debug";
import { carModel } from "./models";
import { toArrays } from "./mesh";
import { snapChase, stepChase, type ChaseState } from "./chase";
import { beamGeometry, beamSpec } from "./headlights";
import { CONFIG, NO_KEYS, createCar, stateVector, stepCar, teleport, type Footprint, type Keys, type Solid } from "./sim";
import {
  PITCH,
  buildBlocks,
  buildBuildings,
  buildPickups,
  buildTraffic,
  buildingSolids,
  collectPickups,
  stepTraffic,
  tickCombo,
  trafficContact
} from "./world";

const HEAL_STORAGE_KEY = "drift-heal-stage";
const params = new URLSearchParams(location.search);
for (const [key, value] of Object.entries(healParams(healStage(undefined, undefined, HEAL_STORAGE_KEY)))) if (!params.has(key)) params.set(key, value);
const config = {
  manual: params.get("manual") === "1",
  autostart: params.get("autostart") === "1" || params.get("manual") === "1",
  quality: (params.get("quality") === "low" ? "low" : "high") as "high" | "low",
  /** diagnostics switches: `ao=1` turns screen-space AO on, `env=0` drops the HDRI light, `shadow=0` drops the sun's shadows */
  /** `models=0` falls back to the code-built car shells (diagnostics) */
  models: params.get("models") !== "0",
  ao: params.get("ao") === "1",
  env: params.get("env") !== "0",
  shadow: params.get("shadow") !== "0",
  fog: params.get("fog") !== "0",
  post: params.get("post") !== "0",
  /** `aa=0` drops anti-aliasing only; `tm=aces|none|...` replaces the neutral tone-mapping operator */
  aa: params.get("aa") !== "0",
  tm: params.get("tm") ?? "neutral",
  heal: params.get("heal") !== "0",
  /** `warm=0` skips the program warm-up so the first frames can miss draws (diagnostics for the first-frame regression spec) */
  warm: params.get("warm") !== "0",
  /** `warmenv=0` skips waiting for the environment HDRI in the warm-up (diagnostics for the first-frames regression spec) */
  warmEnv: params.get("warmenv") !== "0",
  /** `warmtex=0` skips waiting for pending texture upgrades in the warm-up (diagnostics for the first-frames regression spec) */
  warmTex: params.get("warmtex") !== "0",
  /** how long the warm-up waits for the environment HDRI and for texture upgrades; the regression spec raises it for a slow software-GL runner */
  warmEnvMs: Math.max(0, Number(params.get("warmenvms")) || 30_000),
  healFrames: Number(params.get("healframes")) || undefined,
  sky: params.get("sky") !== "0",
  /** `roadcells=N` splits the road plane into N x N cells (default one per 60 m tile; diagnostics for the road-flip investigation) */
  roadCells: Number(params.get("roadcells")) ? Math.max(1, Math.min(64, Math.floor(Number(params.get("roadcells"))))) : undefined,
  exposure: Number(params.get("exposure") ?? "2.3") || 2.3,
  sun: Number(params.get("sun") ?? "4.4") || 4.4,
  /** `skyfill=N` overrides the hemisphere fill intensity (diagnostics for the LIGHT-05 retune; default from `SKY_FILL`) */
  skyFill: params.has("skyfill") ? Number(params.get("skyfill")) : undefined
};

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`drift-and-deliver-port: #${id} is missing`);
  return el as T;
};
const canvas = $<HTMLCanvasElement>("world");
const STEP = 1 / 60;
/** Measured from the original's car model (`footprint`), see evidence/crayon-capture. */
const FOOTPRINT: Footprint = { halfW: 0.9954000015020373, halfD: 2.14200003592372 };

/* ------------------------------------------------------------------ world data */

const blocks = buildBlocks();
const buildings = buildBuildings(blocks);
const solids: Solid[] = buildingSolids(buildings);
const pickups = buildPickups();
const traffic = buildTraffic();
const car = createCar();
const game = { phase: "splash" as "splash" | "playing" | "paused", score: 0, collected: 0 };
const audio = config.manual ? null : createAudio();
const keys: Keys = { ...NO_KEYS };
const camState: ChaseState = snapChase({ x: car.x, z: car.z, y: 0, heading: car.heading, speed: 0, boosting: false, shake: 0 });

const cell = (v: number): number => Math.floor(v / 24);
const grid = new Map<string, Solid[]>();
for (const s of solids) {
  for (let cx = cell(s.x - s.hw); cx <= cell(s.x + s.hw); cx++) {
    for (let cz = cell(s.z - s.hd); cz <= cell(s.z + s.hd); cz++) {
      const k = `${cx},${cz}`;
      const list = grid.get(k) ?? [];
      list.push(s);
      grid.set(k, list);
    }
  }
}
function nearSolids(x: number, z: number): Solid[] {
  const out: Solid[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (const s of grid.get(`${cell(x) + dx},${cell(z) + dz}`) ?? []) if (!out.includes(s)) out.push(s);
    }
  }
  return out;
}
/** Collision candidates near the car: the original queries a spatial grid; the port passes the nearby subset. */
const solidsNear = (): Solid[] => nearSolids(car.x, car.z);

/* ------------------------------------------------------------------ scene */

const beam = beamGeometry();
const shellGeometry = (m: LookRig["playerShell"]["paint"]) => {
  const a = toArrays(m);
  return geometry.define({ positions: a.positions, normals: a.normals, uvs: a.uvs, colors: a.colors, indices: a.indices });
};
let look: LookRig;

function buildScene() {
  look = buildLook({ blocks, buildings, traffic, pickups }, { models: config.models, quality: config.quality, ao: config.ao, env: config.env, shadow: config.shadow, fog: config.fog, post: config.post, aa: config.aa, sky: config.sky, sun: config.sun, skyFill: config.skyFill, roadCells: config.roadCells, start: { x: car.x, z: car.z } });
  const s = look.builder;
  if (config.models) {
    s.add(carModel("car-rig", "courier", true));
  } else {
    s.add(geometry.custom(shellGeometry(look.playerShell.paint), { name: "car-paint", material: material.carPaint({ color: "#1d1e24", roughness: 0.28, envMapIntensity: 0.6 }), castShadow: true, receiveShadow: true }).runtime({ id: "car-paint" }));
    s.add(geometry.custom(shellGeometry(look.playerShell.detail), { name: "car-detail", material: material.pbr({ color: "#ffffff", roughness: 0.4, metallic: 0.1, texture: look.palette as never }), castShadow: true, receiveShadow: true }).runtime({ id: "car-detail" }));
    s.add(primitives.box({ name: "car-light-l", size: [0.4, 0.14, 0.1], position: [-0.6, 0.62, 2.1], material: material.emissive({ color: "#eaf1ff", emissive: "#dfe9ff", emissiveIntensity: 1.4 }) }).runtime({ id: "car-light-l" }));
    s.add(primitives.box({ name: "car-light-r", size: [0.4, 0.14, 0.1], position: [0.6, 0.62, 2.1], material: material.emissive({ color: "#eaf1ff", emissive: "#dfe9ff", emissiveIntensity: 1.4 }) }).runtime({ id: "car-light-r" }));
  }
  s.add(geometry.custom(geometry.dynamic({ positions: beam.positions, normals: beam.normals, uvs: beam.uvs, indices: beam.indices }), { name: "car-beams", material: material.custom(beamSpec(headlightAmount)) }).runtime({ id: "car-beams" }));
  return s;
}

/* ------------------------------------------------------------------ frame */

let app: AuraApp | undefined;
let ready = false;
let warmResult: Awaited<ReturnType<typeof warmPrograms>> | null = null;
let renderTime = 0;
let frames = 0;
let blackWatch: BlackFrameWatch | undefined;
let manualInput: Keys | null = null;
let hudTimer = 0;
let renderFailed = false;
/** Headlight beam strength 0..1 (the original ties it to night; `L` toggles it here). */
let beamsUncullable = false;
let headlightAmount = Math.max(0, Math.min(1, Number(new URLSearchParams(location.search).get("beams") ?? 0) || 0));
const handles = new Map<string, ReturnType<AuraApp["nodes"]["require"]>>();
const node = (id: string) => {
  let h = handles.get(id);
  if (!h) handles.set(id, (h = app!.nodes.require(id)));
  return h;
};
const kmh = (): number => Math.round(3.6 * Math.abs(car.speed));
const pickupState = () => ({ collected: game.collected, score: game.score, combo: car.combo, comboTimer: car.comboTimer, boost: car.boost });

function simulateStep(input: Keys): void {
  stepCar(car, STEP, input, solidsNear(), FOOTPRINT);
  stepTraffic(traffic, STEP);
  const struck = trafficContact(traffic, car);
  const ps = pickupState();
  const picked = collectPickups(pickups, car, ps);
  tickCombo(ps, STEP);
  if (audio) {
    if (struck) audio.thud();
    for (const e of picked) audio.chime(e.kind, ps.combo);
  }
  game.collected = ps.collected;
  game.score = ps.score;
  car.combo = ps.combo;
  car.comboTimer = ps.comboTimer;
  car.boost = ps.boost;
}

function presentedNow(): Presented {
  const tr = new Float64Array(traffic.length * 3);
  traffic.forEach((t, i) => { tr[3 * i] = t.x; tr[3 * i + 1] = t.z; tr[3 * i + 2] = t.yaw; });
  return { car: { x: car.x, z: car.z, heading: car.heading, lean: car.lean, steer: car.steer, speed: car.speed }, traffic: tr };
}
const presenter = createRenderInterpolator<Presented>(blendPresented);
presenter.reset(presentedNow());

function simulate(steps: number, input: Keys = keys): void {
  for (let i = 0; i < steps; i++) simulateStep(input);
}

function followCamera(steps: number): void {
  for (let i = 0; i < steps; i++) stepChase(camState, { x: car.x, z: car.z, y: 0, heading: car.heading, speed: car.speed, boosting: car.boosting, shake: car.shake }, STEP);
}

const beamWorldPositions = new Float32Array(beam.positions.length);
const beamWorldNormals = new Float32Array(beam.normals.length);

/** The beams live in world space (their node stays at the origin): the cone is rotated and translated here each frame. */
function placeBeams(yaw: number, carX: number, carZ: number): void {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  for (let i = 0; i < beam.positions.length; i += 3) {
    const lx = beam.positions[i]!, ly = beam.positions[i + 1]!, lz = beam.positions[i + 2]!;
    beamWorldPositions[i] = carX + lx * c + lz * s;
    beamWorldPositions[i + 1] = ly;
    beamWorldPositions[i + 2] = carZ - lx * s + lz * c;
    const nx = beam.normals[i]!, ny = beam.normals[i + 1]!, nz = beam.normals[i + 2]!;
    beamWorldNormals[i] = nx * c + nz * s;
    beamWorldNormals[i + 1] = ny;
    beamWorldNormals[i + 2] = -nx * s + nz * c;
  }
  const h = node("car-beams");
  h.updateAttribute?.("position", { array: beamWorldPositions });
  h.updateAttribute?.("normal", { array: beamWorldNormals });
}

function placeTraffic(shown: Float64Array): void {
  for (const rig of look.traffic) {
    rig.cars.forEach((carIndex, n) => {
      const m = mat(shown[3 * carIndex]!, 0, shown[3 * carIndex + 1]!, shown[3 * carIndex + 2]!, 0, 1, 1, 1);
      rig.paint.setMatrixAt(n, m);
      rig.detail.setMatrixAt(n, m);
    });
  }
  for (const i of look.modelTraffic) {
    const h = node(`traffic-${i}`);
    h.setPosition(shown[3 * i]!, 0, shown[3 * i + 1]!);
    h.setRotation(0, shown[3 * i + 2]!, 0);
  }
}

const HIDDEN = mat(0, -50, 0, 0, 0, 0, 0, 0);
function placePickups(): void {
  look.coins.forEach((p, i) => look.coinMesh.setMatrixAt(i, p.taken ? HIDDEN : coinMat(p.x, 1.15 + 0.18 * Math.sin(2.4 * renderTime + p.spin), p.z, p.spin + renderTime * 2.4, 0.95, 0.14)));
  look.stars.forEach((p, i) => look.starMesh.setMatrixAt(i, p.taken ? HIDDEN : mat(p.x, 1.4 + 0.18 * Math.sin(2.4 * renderTime + p.spin), p.z, p.spin + renderTime * 2.4, 0, 1.3, 1.3, 1.3)));
  look.hearts.forEach((p, i) => look.heartMesh.setMatrixAt(i, p.taken ? HIDDEN : mat(p.x, 1.3 + 0.18 * Math.sin(2.4 * renderTime + p.spin), p.z, p.spin + renderTime * 2.4, 0, 1.0, 1.0, 1.0)));
}

function placeNodes(dt: number, shown: Presented): void {
  const view = shown.car;
  const yaw = view.heading + 0.72 * view.lean;
  const roll = -Math.max(-0.16, Math.min(0.16, view.steer * Math.min(1, Math.abs(view.speed) / 34) * 0.09 + 0.1 * view.lean));
  const place = (id: string, ox: number, oy: number, oz: number, extra: [number, number, number] = [0, 0, 0]) => {
    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    const h = node(id);
    h.setPosition(view.x + ox * c + oz * s, oy, view.z - ox * s + oz * c);
    h.setRotation(extra[0], yaw + extra[1], roll + extra[2]);
  };
  if (config.models) {
    place("car-rig", 0, 0, 0);
  } else {
    place("car-paint", 0, 0, 0);
    place("car-detail", 0, 0, 0);
    place("car-light-l", -0.6, 0.62, 2.1);
    place("car-light-r", 0.6, 0.62, 2.1);
  }
  placeBeams(yaw, view.x, view.z);
  if (!beamsUncullable) {
    node("car-beams").frustumCulled = false;
    beamsUncullable = true;
  }
  node("car-beams").setUniform?.("beamAmount", headlightAmount);
  placeTraffic(shown.traffic);
  placePickups();
  stepChase(camState, { x: view.x, z: view.z, y: 0, heading: view.heading, speed: view.speed, boosting: car.boosting, shake: car.shake }, dt);
  app!.camera!.setPose({ position: [...camState.eye], target: [...camState.look], up: [0, 1, 0], fov: camState.fov }, { cut: false });
}

function render(dt: number, alpha = 1): void {
  if (!app || !ready || renderFailed) return;
  try {
    const live = !config.manual && game.phase === "playing";
    placeNodes(dt, live && alpha < 1 ? presenter.sample(alpha) ?? presentedNow() : presentedNow());
    app.step(0);
    frames++;
    blackWatch?.sample(frames);
  } catch (error) {
    renderFailed = true;
    reportError(error);
    throw error;
  }
}

/* ------------------------------------------------------------------ HUD */

const hud = { nitro: $("nitro-fill"), speed: $("speed"), score: $("score"), streak: $("streak"), count: $("count"), map: $<HTMLCanvasElement>("minimap") };
const MINIMAP_GRID: [number, number, number, number][] = [];
for (let k = -8; k <= 7; k++) {
  const o = k * PITCH + 30;
  MINIMAP_GRID.push([o, -450, o, 506], [-450, o, 506, o]);
}
function updateHud(): void {
  hud.nitro.style.width = `${Math.max(0, Math.min(100, 100 * car.boost))}%`;
  hud.nitro.style.background = car.boost < 0.22 ? "linear-gradient(90deg,#ff6a4a,#c0392b)" : "linear-gradient(90deg,#ffd27a,#ff8a2b)";
  hud.speed.textContent = String(kmh());
  hud.score.textContent = String(game.score);
  hud.streak.style.opacity = car.combo > 1 ? "1" : "0";
  hud.streak.textContent = `x${car.combo}  STREAK`;
  hud.count.textContent = `${game.collected} / ${pickups.length}`;
  const ctx = hud.map.getContext("2d");
  if (!ctx) return;
  const loose: [number, number][] = [];
  for (const p of pickups) if (!p.taken) loose.push([p.x, p.z]);
  drawCanvasMinimap(ctx, {
    size: 240,
    bounds: [-510, -510, 510, 510],
    background: { fill: "rgba(38,30,26,.82)", radius: 18 },
    layers: [
      { kind: "lines", segments: MINIMAP_GRID, stroke: "rgba(255,226,175,.5)", width: 2.5 },
      { kind: "rect", rect: [-510, 506, 510, 510], fill: "rgba(70,160,205,.55)" },
      { kind: "points", points: loose, fill: "#ffd15c", size: 2.8 }
    ],
    marker: { x: car.x, z: car.z, heading: car.heading, fill: "#ff9a2e" }
  });
}

/* ------------------------------------------------------------------ input */

const KEYMAP: Record<string, keyof Keys> = { w: "w", arrowup: "w", a: "a", arrowleft: "a", s: "s", arrowdown: "s", d: "d", arrowright: "d", shift: "shift", " ": "space" };
const onKey = (down: boolean) => (e: KeyboardEvent) => {
  const name = (e.key || "").toLowerCase();
  if (down && name === "l") headlightAmount = headlightAmount > 0 ? 0 : 1;
  if (down && !e.repeat && (name === "p" || name === "escape")) togglePause();
  if (down && !e.repeat && name === "m" && audio) $("mute").textContent = audio.setMuted(!audio.muted) ? "Sound off (M)" : "Sound on (M)";
  const k = KEYMAP[(e.key || "").toLowerCase()];
  if (k) {
    keys[k] = down;
    e.preventDefault();
  }
};
addEventListener("keydown", onKey(true));
addEventListener("keyup", onKey(false));

function begin(): void {
  game.phase = "playing";
  $("splash").classList.add("hidden");
  audio?.resume();
}

function togglePause(): void {
  if (game.phase === "playing") {
    game.phase = "paused";
    Object.assign(keys, NO_KEYS);
    $("pause").classList.remove("hidden");
  } else if (game.phase === "paused") {
    game.phase = "playing";
    $("pause").classList.add("hidden");
  }
}

/* ------------------------------------------------------------------ original QA surface + hooks */

const qaState: Record<string, unknown> = { phase: "splash", boost: 1, drifting: false, boosting: false, speed: 0, heading: 0, shake: 0, score: 0, combo: 0, comboTimer: 0, collected: 0, total: pickups.length };
const player = { position: { x: car.x, y: 0, z: car.z }, userData: { footprint: FOOTPRINT } };
function syncQa(): void {
  Object.assign(qaState, { phase: game.phase, boost: car.boost, drifting: car.drifting, boosting: car.boosting, speed: car.speed, heading: car.heading, shake: car.shake, score: game.score, combo: car.combo, comboTimer: car.comboTimer, collected: game.collected });
  player.position.x = car.x;
  player.position.z = car.z;
}
const qa = window as unknown as Record<string, unknown>;
qa.__game = { state: qaState, CONFIG: { ...CONFIG, PALETTE: ["#f0a02c", "#3c3d45", "#7a9c56", "#4fb0e0", "#f0cfa2"] }, keys, renderer: { toneMapping: 7, toneMappingExposure: 1.34 } };
qa.__gameEntities = { player, obstacles: [] };
qa.__getGameState = () => qaState;
qa.__dbg = { THREE: { REVISION: "aura3d-port" }, camera: { fov: 56, near: 0.4, far: 2400 }, nearSolids, solids };
qa.__crayonGfx = { postfx: "high", ibl: true, iblIntensity: 0.09 };
qa.__diag = () => ({ solids: solids.length, bots: 0, traffic: traffic.length, pickups: pickups.length, blocks: blocks.length, parks: blocks.filter((b) => b.park).length, placements: buildings.length + (look?.stats.trees ?? 0) });
qa.__tp = (x: number, z: number, heading?: number) => {
  teleport(car, x, z, heading);
  Object.assign(camState, snapChase({ x: car.x, z: car.z, y: 0, heading: car.heading, speed: 0, boosting: false, shake: 0 }));
  syncQa();
};
qa.__sim = (steps: number, input: Partial<Keys> | undefined, dt?: number) => {
  const held = { ...NO_KEYS, ...(input ?? {}) };
  const step = dt ?? STEP;
  const samples: { t: number; x: number; z: number }[] = [];
  for (let i = 0; i < steps; i++) {
    stepCar(car, step, held, solidsNear(), FOOTPRINT);
    syncQa();
    if (i % 10 === 0) samples.push({ t: +(i * step).toFixed(2), x: +car.x.toFixed(2), z: +car.z.toFixed(2) });
  }
  return samples;
};

function status() {
  syncQa();
  return { phase: game.phase, state: stateVector(car), score: game.score, collected: game.collected, total: pickups.length, combo: car.combo, boost: car.boost, speedKmh: kmh(), frames, ready, warm: warmResult };
}

const hooks = installQaHooks("drift-and-deliver", {
  ready: () => ready,
  state: status,
  app: () => app,
  begin,
  nodeCount: () => handles.size,
  routeHealth: () => (app ? createAuraRouteHealthSnapshot(app, { parityIds: ["SG-01", "SG-10", "SH-03", "ST-01", "R-23"] }) : null),
  reset() {
    Object.assign(car, createCar());
    pickups.forEach((p) => (p.taken = false));
    game.score = 0;
    game.collected = 0;
    Object.assign(camState, snapChase({ x: car.x, z: car.z, y: 0, heading: car.heading, speed: 0, boosting: false, shake: 0 }));
    syncQa();
  },
  /** Run `n` fixed 1/60 s steps with the given keys (default: held keys), then render once. */
  stepFrames(n: number, input?: Partial<Keys>) {
    game.phase = "playing";
    manualInput = input ? { ...NO_KEYS, ...input } : keys;
    loop.advance(n);
    manualInput = null;
    updateHud();
    render(0);
  },
  extras: {
    /** resolves once the programs the current view needs are compiled (call after a teleport before capturing a frame) */
    settle() {
      return (app ? warmPrograms(app, { waitForEnvironment: config.warmEnv, environmentTimeoutMs: config.warmEnvMs, waitForTextures: config.warmTex, textureTimeoutMs: config.warmEnvMs }) : Promise.resolve()).then(() => status());
    },
    /** per-node texture upgrade status: textures upload one material at a time after mount, so an early frame shows untextured ground */
    textures: () => summarizeTextureUpgrade(app?.diagnostics()),
    /** the engine's diagnostics snapshot as plain JSON (evidence and specs) */
    diag: () => JSON.parse(JSON.stringify(app?.diagnostics() ?? null, (_k, v) => (typeof v === "function" ? undefined : v))) as unknown,
    applyInput(input: Partial<Keys>) {
      Object.assign(keys, NO_KEYS, input);
    },
    teleport(x: number, z: number, heading?: number) {
      (qa.__tp as (x: number, z: number, h?: number) => void)(x, z, heading);
      return status();
    },
    headlights(amount?: number) {
      if (amount !== undefined) headlightAmount = Math.max(0, Math.min(1, amount));
      return headlightAmount;
    },
    pickups: () => pickups.map((p) => ({ kind: p.kind, x: p.x, z: p.z, taken: p.taken })),
    counts: () => ({ blocks: blocks.length, buildings: buildings.length, trees: look?.stats.trees ?? 0, traffic: traffic.length, pickups: pickups.length, solids: solids.length })
  }
});

/* ------------------------------------------------------------------ boot */

function sizeCanvas(): void {
  const dpr = Math.min(devicePixelRatio || 1, config.quality === "low" ? 1 : 1.5);
  canvas.width = Math.max(2, Math.round(canvas.clientWidth * dpr));
  canvas.height = Math.max(2, Math.round(canvas.clientHeight * dpr));
}


async function boot(): Promise<void> {
  sizeCanvas();
  app = createAuraApp(canvas, {
    autoStart: false,
    resize: false,
    pixelRatio: 1,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    output: { toneMapping: config.tm as "neutral", exposure: config.exposure, dither: false },
    scene: buildScene()
  });
  await app.ready();
  // a draw whose program is still compiling is skipped: settle the programs so the first frame is the whole city
  if (config.warm) warmResult = await warmPrograms(app, { waitForEnvironment: config.warmEnv, environmentTimeoutMs: config.warmEnvMs, waitForTextures: config.warmTex, textureTimeoutMs: config.warmEnvMs });
  ready = true;
  blackWatch = createBlackFrameWatch(canvas, { enabled: config.heal, storageKey: HEAL_STORAGE_KEY, ...(config.healFrames ? { fastFrames: config.healFrames } : {}) });
  $("loading").classList.add("hidden");
  $<HTMLButtonElement>("start").disabled = false;
  syncQa();
  render(0);
  updateHud();
  if (config.autostart) begin();
}

const loop = createFixedStepLoop({
  stepSeconds: STEP,
  maxFrameSeconds: 1 / 24,
  maxCatchUpSteps: 7,
  manual: config.manual,
  isActive: () => ready && game.phase === "playing",
  step() {
    if (manualInput) {
      simulateStep(manualInput);
      followCamera(1);
    } else simulate(1);
    presenter.push(presentedNow());
  }
});

let lastTick = performance.now();
function tick(now: number): void {
  requestAnimationFrame(tick);
  const dt = Math.min(1 / 24, Math.max(0.001, (now - lastTick) / 1000));
  lastTick = now;
  loop.tick(now);
  if (!ready) return;
  renderTime += dt;
  audio?.update(game.phase === "playing" ? car : { speed: 0, drifting: false, boosting: false, boost: car.boost }, game.phase === "playing" && keys.w, dt);
  hudTimer += dt;
  if (hudTimer >= 0.05) {
    updateHud();
    hudTimer = 0;
  }
  render(config.manual ? 0 : dt, loop.accumulator / STEP);
}

$("start").addEventListener("click", begin);
$("resume").addEventListener("click", togglePause);
addEventListener("blur", () => { if (game.phase === "playing" && !config.manual) togglePause(); });
addEventListener("resize", sizeCanvas);
requestAnimationFrame(tick);

function reportError(error: unknown): void {
  const base = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const code = (error as { code?: unknown })?.code;
  const details = (error as { details?: unknown })?.details;
  const message = `${base}${typeof code === "string" ? ` [${code}]` : ""}${details ? ` ${JSON.stringify(details).slice(0, 6000)}` : ""}`;
  hooks.reportError(message);
  $("loading-status").textContent = `The city could not load: ${message.slice(0, 300)}`;
  $("loading").classList.remove("hidden");
  console.error(error);
}

boot().catch(reportError);
