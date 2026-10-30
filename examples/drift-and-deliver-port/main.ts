/**
 * Drift & Deliver on Aura3D: boot, fixed-step loop, input, HUD, scene and capture hooks.
 *
 * The driving model lives in `sim.ts` (pure, line-for-line from the original), the city and pickups in
 * `world.ts`, the chase camera in `chase.ts`. This file renders them through the public `@aura3d/engine`
 * surface only. It also installs the original's QA surface (`__sim`, `__tp`, `__game`, `__gameEntities`,
 * `__dbg.nearSolids`) so the same capture runner that recorded the original can drive this port.
 *
 * Query parameters (all optional): `manual=1` (the sim only advances through `__sim` /
 * `__AURA_DRIFT_AND_DELIVER__.stepFrames`; no overlay), `autostart=1`, `quality=high|low`, `shift=N` (shift length in
 * seconds, default 180), `props=0` (street furniture without colliders).
 *
 * Collision: buildings are `hard` solids; lamps and signals are `post` solids; trees, pedestrians, hydrants and shelters
 * are `prop` solids. The original's QA surface (`__sim`, `__dbg.nearSolids`) keeps the building-only world the reference
 * capture was recorded against, so the recorded replay hashes are unchanged.
 */
import { createAuraApp, createAuraRouteHealthSnapshot, createFixedStepLoop, geometry, installQaHooks, material, primitives, text3D, type AuraApp } from "@aura3d/engine";
import { createCameraClearance, createRenderInterpolator, drawCanvasMinimap, summarizeTextureUpgrade, warmPrograms } from "@aura3d/engine/game";
import { blendPresentedInto, createPresented, type Presented } from "./presentation";
import { buildLook, coinMatInto, mat, matInto, type LookRig } from "./look";
import { furnitureSolids } from "./city";
import { createShift, formatClock, recordBest, stepShift, type ShiftEvent } from "./shift";
import { mountTouchControls } from "./touch";
import { drivingKey, keyAction } from "./input";
import { setChaseFraming, setReducedMotion } from "./chase";
import { parseAt, parseLook, phaseAt, todSeconds } from "./phases";
import { SkidMarks, COURIER_TEAL } from "./fx";
import { beaconMaterial, createShiftRuntime, padMaterial, shiftSceneNodes, type ShiftRuntime } from "./shiftRuntime";
import { shiftCrops } from "./qa";
import { createAudio } from "./audio";
import { districtLayers, drawDial, slamStamp, ticketText } from "./hud";
import { BOARD, boardPose, textOrigin, textWidth } from "./board";
import { bannerNodes } from "./banners";
import { INTRO, SIDE_SHOT, headlightFlare, introPose, introWanted, orbitPose, sideShotPose, sideShotWanted, type CarPose } from "./cinema";
import { courierBraking, createPitch, placeHalos, stepPitch } from "./brakes";
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
  clearPickups,
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
  skyFill: params.has("skyfill") ? Number(params.get("skyfill")) : undefined,
  /** `neutral=N` overrides the neutral-room fill on the lights-only path (`env=0`; default `LIGHTS_ONLY_NEUTRAL`) */
  neutral: params.has("neutral") ? Number(params.get("neutral")) : undefined,
  /** `shift=N`: shift length in seconds (default 180; probes shorten it to reach the results screen) */
  shiftSeconds: Math.max(5, Number(params.get("shift")) || 180),
  /** `props=0` leaves the street furniture without colliders (diagnostics) */
  props: params.get("props") !== "0",
  /** GU47 WP-28: `look=original` keeps the 4.6.1 look; default is the time-of-day shift look */
  look: parseLook(params.get("look")),
  /** GU47 WP-28: `at=N` pins the time-of-day clock at N seconds of 180 (visual only; golden 10, sunset 120, bluehour 170) */
  at: parseAt(params.get("at")),
  /** `flash=reduced` caps the delivery flash (PRD §6.3 reduced flash); reduced motion implies it */
  reducedFlash: params.get("flash") === "reduced"
};
const shiftLook = config.look === "shift";
const skid = new SkidMarks();
let shiftRuntime: ShiftRuntime | null = null;
const BEST_KEY = "gridlock-courier-best";

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
// two of the seeded stars and hearts land inside a wall: push every pickup 1.5 m clear of the buildings
clearPickups(pickups, solids, 1.5);
const traffic = buildTraffic();
const trafficStart = traffic.map((t) => ({ ...t }));
const car = createCar();
/** `intro` (GU47 WP-28 GC-C1): the 6 s camera intro after Start; the sim does not step until it ends or is skipped. */
type Phase = "splash" | "intro" | "playing" | "paused" | "results";
const game = { phase: "splash" as Phase, score: 0, collected: 0 };
let shift = createShift(config.shiftSeconds);
const audio = config.manual ? null : createAudio();
const keys: Keys = { ...NO_KEYS };
const camState: ChaseState = snapChase({ x: car.x, z: car.z, y: 0, heading: car.heading, speed: 0, boosting: false, shake: 0 });

const cell = (v: number): number => Math.floor(v / 24);
type Grid<T extends { x: number; z: number; hw: number; hd: number }> = Map<string, T[]>;
function insert<T extends { x: number; z: number; hw: number; hd: number }>(grid: Grid<T>, s: T): void {
  for (let cx = cell(s.x - s.hw); cx <= cell(s.x + s.hw); cx++) {
    for (let cz = cell(s.z - s.hd); cz <= cell(s.z + s.hd); cz++) {
      const k = `${cx},${cz}`;
      const list = grid.get(k) ?? [];
      list.push(s);
      grid.set(k, list);
    }
  }
}
function query<T extends { x: number; z: number; hw: number; hd: number }>(grid: Grid<T>, x: number, z: number): T[] {
  const out: T[] = [];
  const seen = new Set<T>();
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (const s of grid.get(`${cell(x) + dx},${cell(z) + dz}`) ?? []) if (!seen.has(s)) { seen.add(s); out.push(s); }
    }
  }
  return out;
}
/** Building-only grid: the original's world, used by its QA surface (`__sim`, `__dbg.nearSolids`). */
const grid: Grid<Solid> = new Map();
for (const s of solids) insert(grid, s);
/** Gameplay grid: buildings plus the street furniture colliders (filled when the scene is built). */
const playGrid: Grid<Solid> = new Map();
for (const s of solids) insert(playGrid, s);
let propSolidCount = 0;
/** Buildings with heights, for the chase camera's clearance test. */
const buildingGrid: Grid<(typeof buildings)[number]> = new Map();
for (const b of buildings) insert(buildingGrid, b);
function nearSolids(x: number, z: number): Solid[] {
  return query(grid, x, z);
}
/** Collision candidates near the car: the original queries a spatial grid; the port passes the nearby subset. */
const solidsNear = (): Solid[] => query(playGrid, car.x, car.z);
const buildingSolidsNear = (): Solid[] => nearSolids(car.x, car.z);
/** True when a camera point is inside a building (with a 0.4 m skin) or under the street. */
function cameraBlocked(x: number, y: number, z: number): boolean {
  if (y < 0.3) return true;
  for (const b of query(buildingGrid, x, z)) {
    if (y < b.height + 0.3 && Math.abs(x - b.x) < b.hw + 0.4 && Math.abs(z - b.z) < b.hd + 0.4) return true;
  }
  return false;
}
const clearance = createCameraClearance();
let shownEye: [number, number, number] = [0, 0, 0];

/* ------------------------------------------------------------------ scene */

const beam = beamGeometry();
const shellGeometry = (m: LookRig["playerShell"]["paint"]) => {
  const a = toArrays(m);
  return geometry.define({ positions: a.positions, normals: a.normals, uvs: a.uvs, colors: a.colors, indices: a.indices });
};
let look: LookRig;

function buildScene() {
  const row = phaseAt(todSeconds(shift.elapsed, shift.length, config.at));
  look = buildLook({ blocks, buildings, traffic, pickups }, { models: config.models, quality: config.quality, ao: config.ao, env: config.env, shadow: config.shadow, fog: config.fog, post: config.post, aa: config.aa, sky: config.sky, sun: config.sun, skyFill: config.skyFill, neutral: config.neutral, roadCells: config.roadCells, start: { x: car.x, z: car.z }, look: config.look, row });
  setChaseFraming(look.shift ? "shift" : "original");
  const s = look.builder;
  if (look.shift) for (const n of shiftSceneNodes(skid, { reducedFlash: config.reducedFlash })) s.add(n);
  if (config.models) {
    s.add(carModel("car-rig", "courier", true, look.shift ? "YXZ" : undefined));
  } else {
    s.add(geometry.custom(shellGeometry(look.playerShell.paint), { name: "car-paint", material: material.carPaint({ color: "#1d1e24", roughness: 0.28, envMapIntensity: 0.6 }), castShadow: true, receiveShadow: true }).runtime({ id: "car-paint" }));
    s.add(geometry.custom(shellGeometry(look.playerShell.detail), { name: "car-detail", material: material.pbr({ color: "#ffffff", roughness: 0.4, metallic: 0.1, texture: look.palette as never }), castShadow: true, receiveShadow: true }).runtime({ id: "car-detail" }));
    s.add(primitives.box({ name: "car-light-l", size: [0.4, 0.14, 0.1], position: [-0.6, 0.62, 2.1], material: material.emissive({ color: "#eaf1ff", emissive: "#dfe9ff", emissiveIntensity: 1.4 }) }).runtime({ id: "car-light-l" }));
    s.add(primitives.box({ name: "car-light-r", size: [0.4, 0.14, 0.1], position: [0.6, 0.62, 2.1], material: material.emissive({ color: "#eaf1ff", emissive: "#dfe9ff", emissiveIntensity: 1.4 }) }).runtime({ id: "car-light-r" }));
  }
  s.add(geometry.custom(geometry.dynamic({ positions: beam.positions, normals: beam.normals, uvs: beam.uvs, indices: beam.indices }), { name: "car-beams", material: material.custom(beamSpec(headlightAmount)) }).runtime({ id: "car-beams" }));
  // delivery drop-off: a glowing pad and a tall beacon you can see over the roofs (moved to each new job)
  // GU47 WP-28 GC-V2 (shift look): the pillar and pad in reserved courier teal, a 1.6 m pillar plus an objective ring
  s.add(primitives.cylinder({ name: "dropoff-pad", size: [2 * DROP_PAD_RADIUS, 0.06, 2 * DROP_PAD_RADIUS], position: [car.x, -60, car.z], material: look.shift ? padMaterial() : material.emissive({ color: "#5ce1ff", emissive: "#2fc9ff", emissiveIntensity: 1.4 }), castShadow: false, receiveShadow: false }).runtime({ id: "dropoff-pad" }));
  s.add(primitives.cylinder({ name: "dropoff-beacon", size: look.shift ? [1.6, 70, 1.6] : [0.9, 70, 0.9], position: [car.x, -60, car.z], material: look.shift ? beaconMaterial(row.beacon) : material.emissive({ color: "#9cefff", emissive: "#46d6ff", emissiveIntensity: 1.8 }), castShadow: false, receiveShadow: false }).runtime({ id: "dropoff-beacon" }));
  if (look.shift) s.add(primitives.torus({ name: "dropoff-ring", size: [2 * DROP_PAD_RADIUS + 1.2, 0.5, 2 * DROP_PAD_RADIUS + 1.2], position: [car.x, -60, car.z], rotation: [Math.PI / 2, 0, 0], material: beaconMaterial(2.2), castShadow: false, receiveShadow: false }).runtime({ id: "dropoff-ring" }));
  // GC-H2: three SDF district banners over the avenues (static, +6 draws)
  if (look.shift) for (const n of bannerNodes()) s.add(n);
  if (look.shift) {
    // GC-V2 address board: an SDF "DROP-OFF" sign on a dark teal panel by the pillar, turned to the camera (+2 draws)
    s.add(primitives.box({ name: "dropoff-board", size: [BOARD.panel[0], BOARD.panel[1], BOARD.panel[2]], position: [car.x, -60, car.z], material: material.emissive({ color: "#123c40", emissive: "#0c2f33", emissiveIntensity: 0.6 }), castShadow: false, receiveShadow: false }).runtime({ id: "dropoff-board" }));
    s.add(text3D(BOARD.text, { name: "dropoff-board-text", size: BOARD.size, depth: 0.06, backend: "sdf", material: material.emissive({ color: "#efe3cf", emissive: "#efe3cf", emissiveIntensity: 1.6 }), castShadow: false, receiveShadow: false }).position(car.x, -60, car.z).runtime({ id: "dropoff-board-text" }));
  }
  if (config.props) {
    const extra = [...furnitureSolids(look.furniture), ...look.propSolids];
    for (const sol of extra) insert(playGrid, sol);
    propSolidCount = extra.length;
  }
  return s;
}
const DROP_PAD_RADIUS = 6;

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
/** GU47 WP-28 GC-L5: in the shift look the beams come on with the street lamps (from sunset); `L` still forces them on. */
let headlightForced = params.has("beams");
const beamAmount = (lampsOn: number): number => (shiftLook && !headlightForced ? Math.max(headlightAmount, Math.min(1, lampsOn * 1.4)) : headlightAmount);
/** True once the full warm-up (environment HDRI and texture upgrades) has finished; `ready` only needs the programs. */
let settled = false;
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
  if (shiftRuntime && !config.manual) {
    if (struck) shiftRuntime.bump(car.x, car.z);
    for (const e of picked) shiftRuntime.pickup(e.kind, pickups[e.index]!.x, pickups[e.index]!.z);
  }
  for (const e of picked) popup(`+${e.score}${ps.combo > 1 ? `  x${ps.combo}` : ""}`, e.kind);
  game.collected = ps.collected;
  game.score = ps.score;
  car.combo = ps.combo;
  car.comboTimer = ps.comboTimer;
  car.boost = ps.boost;
  if (game.phase === "playing") for (const e of stepShift(shift, STEP, car, { combo: car.combo, collected: game.collected, total: pickups.length })) onShiftEvent(e);
  syncQa();
}

function onShiftEvent(e: ShiftEvent): void {
  if (e.kind === "delivered") {
    if (!config.manual) shiftRuntime?.delivered(e.job.x, e.job.z);
    if (sideShotWanted(look.shift, shift.deliveries, config.manual, config.autostart, document.body.classList.contains("reduced-motion"))) sideShotTime = 0;
    game.score += e.score;
    if (shiftLook && !config.manual) slamStamp(hud.stamp, `DELIVERED  +${e.score}`);
    else popup(`DELIVERED  +${e.score}`, "job");
    audio?.chime("star", 4);
  } else if (e.kind === "missed") popup("JOB MISSED", "miss");
  else if (e.kind === "drift") {
    game.score += e.score;
    popup(`DRIFT  +${e.score}`, "drift");
  } else if (e.kind === "job") placeDropoff();
  else if (e.kind === "over") endShift();
}

/** Presented states live in a ring of three preallocated buffers: the interpolator holds two, the third is written. */
const presentedRing = [createPresented(traffic.length), createPresented(traffic.length), createPresented(traffic.length)];
let presentedSlot = 0;
function presentedNow(): Presented {
  const out = presentedRing[presentedSlot]!;
  presentedSlot = (presentedSlot + 1) % presentedRing.length;
  const tr = out.traffic;
  traffic.forEach((t, i) => { tr[3 * i] = t.x; tr[3 * i + 1] = t.z; tr[3 * i + 2] = t.yaw; });
  const c = out.car;
  c.x = car.x; c.z = car.z; c.heading = car.heading; c.lean = car.lean; c.steer = car.steer; c.speed = car.speed;
  return out;
}
const blended = createPresented(traffic.length);
const presenter = createRenderInterpolator<Presented>((a, b, t) => blendPresentedInto(blended, a, b, t));
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
  for (const group of look.modelTraffic) {
    let list = trafficTransforms.get(group.id);
    if (!list) trafficTransforms.set(group.id, (list = group.cars.map(() => ({ position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: group.scale }))));
    group.cars.forEach((i, n) => {
      const t = list![n]!;
      t.position[0] = shown[3 * i]!;
      t.position[2] = shown[3 * i + 1]!;
      t.rotation[1] = shown[3 * i + 2]!;
    });
    node(group.id).setInstances?.(list);
  }
}
const trafficTransforms = new Map<string, { position: [number, number, number]; rotation: [number, number, number]; scale: number }[]>();

const HIDDEN = mat(0, -50, 0, 0, 0, 0, 0, 0);
/** GC-C2 drift bank, radians. */
const DRIFT_BANK = (3 * Math.PI) / 180;
let bank = 0;
/** GC-AN1 body pitch state and the lit brake halos (QA). */
const pitchState = createPitch();
let brakeLit = 0;
const scratch = new Float32Array(16);
function placePickups(): void {
  look.coins.forEach((p, i) => look.coinMesh.setMatrixAt(i, p.taken ? HIDDEN : coinMatInto(scratch, p.x, 1.15 + 0.18 * Math.sin(2.4 * renderTime + p.spin), p.z, p.spin + renderTime * 2.4, 0.95, 0.14)));
  look.stars.forEach((p, i) => look.starMesh.setMatrixAt(i, p.taken ? HIDDEN : matInto(scratch, p.x, 1.4 + 0.18 * Math.sin(2.4 * renderTime + p.spin), p.z, p.spin + renderTime * 2.4, 0, 1.3, 1.3, 1.3)));
  look.hearts.forEach((p, i) => look.heartMesh.setMatrixAt(i, p.taken ? HIDDEN : matInto(scratch, p.x, 1.3 + 0.18 * Math.sin(2.4 * renderTime + p.spin), p.z, p.spin + renderTime * 2.4, 0, 1.0, 1.0, 1.0)));
}

function placeDropoff(): void {
  if (!app || !ready) return;
  const job = shift.job;
  const y = job ? 0.03 : -60;
  node("dropoff-pad").setPosition(job?.x ?? 0, y, job?.z ?? 0);
  node("dropoff-beacon").setPosition(job?.x ?? 0, job ? 35 : -60, job?.z ?? 0);
  if (look.shift) node("dropoff-ring").setPosition(job?.x ?? 0, job ? 0.35 : -60, job?.z ?? 0);
}

const BOARD_TEXT_W = textWidth(BOARD.text, BOARD.size);
/** GC-V2: the address board faces the shown eye (yaw only); under the road with no open job. */
function placeBoard(eye: readonly [number, number, number]): void {
  const pose = boardPose(shift.job, eye);
  node("dropoff-board").setPosition(pose.x, pose.y, pose.z).setRotation(0, pose.yaw, 0);
  const o = textOrigin(pose, BOARD_TEXT_W, BOARD.size);
  node("dropoff-board-text").setPosition(o[0], o[1], o[2]).setRotation(0, pose.yaw, 0);
}

function placeNodes(dt: number, shown: Presented): void {
  const view = shown.car;
  const yaw = view.heading + 0.72 * view.lean;
  const roll = -Math.max(-0.16, Math.min(0.16, view.steer * Math.min(1, Math.abs(view.speed) / 34) * 0.09 + 0.1 * view.lean));
  // GU47 WP-28 GC-AN1 (shift look): nose dips under braking, lifts under throttle, from the presented speed only
  const pitch = look.shift ? stepPitch(pitchState, view.speed, dt, document.body.classList.contains("reduced-motion")) : 0;
  const place = (id: string, ox: number, oy: number, oz: number, extra: [number, number, number] = [0, 0, 0]) => {
    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    const h = node(id);
    h.setPosition(view.x + ox * c + oz * s, oy, view.z - ox * s + oz * c);
    h.setRotation(pitch + extra[0], yaw + extra[1], roll + extra[2]);
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
  node("car-beams").setUniform?.("beamAmount", beamAmount(shiftRuntime?.row().lamps ?? 0));
  placeTraffic(shown.traffic);
  placePickups();
  if (look.tailHalos) {
    const halos = look.tailHalos;
    const live = !config.manual && game.phase === "playing";
    brakeLit = placeHalos({ x: view.x, z: view.z, yaw, halfW: FOOTPRINT.halfW, halfD: FOOTPRINT.halfD, braking: live && courierBraking(keys.s, view.speed) }, shown.traffic, traffic, (i, x, y, z, ry, sx, sy, sz) => halos.setMatrixAt(i, matInto(scratch, x, y, z, ry, 0, sx, sy, sz)));
  }
  stepChase(camState, { x: view.x, z: view.z, y: 0, heading: view.heading, speed: view.speed, boosting: car.boosting, shake: car.shake }, dt);
  // never put the eye inside a building at a corner (lesson M9)
  const eye = clearance.update(dt, { focus: [view.x, 1.4, view.z], eye: camState.eye, blocked: cameraBlocked });
  shownEye = eye;
  // GU47 WP-28 GC-C2: a 3 deg bank into a drift (shift look; 0 under reduced motion)
  const wantBank = look.shift && car.drifting && !document.body.classList.contains("reduced-motion") ? -Math.sign(view.steer) * DRIFT_BANK : 0;
  bank += (wantBank - bank) * Math.min(1, dt * 4);
  const hs = Math.sin(view.heading), hc = Math.cos(view.heading);
  const up: [number, number, number] = [Math.sin(bank) * hc, Math.cos(bank), -Math.sin(bank) * hs];
  if (look.shift) placeBoard(eye);
  app!.camera!.setPose({ position: eye, target: [...camState.look], up, fov: camState.fov }, { cut: false });
}

/** GC-C1: the intro and the results orbit override the chase pose (camera only; a blocked eye falls back to chase). */
function placeCinema(dt: number, shown: Presented): void {
  cinemaTime += dt;
  const carPose = { x: shown.car.x, z: shown.car.z, heading: shown.car.heading };
  const chase = { position: [...shownEye] as [number, number, number], target: [...camState.look] as [number, number, number], fov: camState.fov };
  const reduced = document.body.classList.contains("reduced-motion");
  let pose = game.phase === "intro" ? introPose(cinemaTime, carPose, chase) : orbitPose(cinemaTime, carPose, reduced, cameraBlocked);
  if (cameraBlocked(...pose.position)) pose = chase;
  app!.camera!.setPose({ position: pose.position, target: pose.target, fov: pose.fov }, { cut: false });
  if (game.phase === "results") placeFlare(pose.position, carPose);
  if (game.phase === "intro" && cinemaTime >= INTRO.seconds) endIntro();
}

/** GC-C1: first-delivery side shot clock (seconds into the shot; Infinity when none is playing). */
let sideShotTime = Infinity;
function placeSideShot(dt: number, shown: Presented): void {
  sideShotTime += dt;
  if (sideShotTime >= SIDE_SHOT.seconds) {
    sideShotTime = Infinity;
    return;
  }
  const pose = sideShotPose(sideShotTime, { x: shown.car.x, z: shown.car.z, heading: shown.car.heading }, cameraBlocked);
  if (pose) app!.camera!.setPose({ position: pose.position, target: pose.target, fov: pose.fov }, { cut: false });
}

/** GC-L5: the results-orbit headlight flare; `eye` null hides it. Writes only on a change (starts shown, so the first call hides it). */
let flareShown = true;
function placeFlare(eye: [number, number, number] | null, car?: CarPose): void {
  const handle = app?.nodes.get("results-flare");
  if (!handle) return;
  const f = eye && car ? headlightFlare(car, eye, beamAmount(shiftRuntime?.row().lamps ?? 0)) : null;
  const on = Boolean(f?.visible);
  if (on && f) handle.setPosition(...f.position);
  if (on !== flareShown) {
    handle.setVisible(on);
    flareShown = on;
  }
}

function render(dt: number, alpha = 1): void {
  if (!app || !ready || renderFailed) return;
  try {
    const live = !config.manual && game.phase === "playing";
    const shown = live && alpha < 1 ? presenter.sample(alpha) ?? presentedNow() : presentedNow();
    placeNodes(dt, shown);
    if (look.shift && (game.phase === "intro" || game.phase === "results")) placeCinema(dt, shown);
    if (look.shift && game.phase !== "results") placeFlare(null);
    if (look.shift && game.phase === "playing" && sideShotTime < Infinity) placeSideShot(dt, shown);
    if (shiftRuntime) {
      // GU47 WP-28: time of day, sodium pool, headlight spot, beacon, VFX (presentation reads only)
      const lampsOn = shiftRuntime.row().lamps;
      shiftRuntime.menu(game.phase === "splash" || game.phase === "results");
      shiftRuntime.frame(dt, shift, { x: shown.car.x, z: shown.car.z, heading: shown.car.heading, speed: shown.car.speed, drifting: car.drifting && live, boosting: car.boosting && live, braking: keys.s }, beamAmount(lampsOn));
    }
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

const hud = { dial: $<HTMLCanvasElement>("dial"), stamp: $("stamp"), nitro: $("nitro-fill"), speed: $("speed"), score: $("score"), streak: $("streak"), count: $("count"), map: $<HTMLCanvasElement>("minimap"), clock: $("clock"), job: $("job"), drift: $("drift"), popups: $("popups") };
const reducedMotionQuery = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
const applyReducedMotion = (): void => {
  const on = Boolean(reducedMotionQuery?.matches) || params.get("motion") === "reduced";
  setReducedMotion(on);
  document.body.classList.toggle("reduced-motion", on);
};
applyReducedMotion();
reducedMotionQuery?.addEventListener?.("change", applyReducedMotion);

/** Floating score text over the car ('+120  x4', 'DELIVERED  +540'); at most six at a time. */
function popup(text: string, kind: string): void {
  if (config.manual) return;
  const el = document.createElement("div");
  el.className = `popup popup-${kind}`;
  el.textContent = text;
  hud.popups.appendChild(el);
  while (hud.popups.childElementCount > 6) hud.popups.firstElementChild?.remove();
  setTimeout(() => el.remove(), 1100);
}
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
  hud.clock.textContent = formatClock(shift.timeLeft);
  hud.clock.classList.toggle("low", shift.timeLeft <= 20);
  const job = shift.job;
  if (job) {
    const d = Math.hypot(job.x - car.x, job.z - car.z);
    hud.job.textContent = shiftLook ? ticketText(shift.deliveries + shift.missed + 1, d, formatClock(job.timeLeft)) : `DELIVER  ${Math.round(d)} m  ${formatClock(job.timeLeft)}`;
    hud.job.classList.toggle("low", job.timeLeft <= 10);
  } else hud.job.textContent = "";
  hud.drift.style.opacity = shift.drift > 0 ? "1" : "0";
  hud.drift.textContent = `DRIFT  ${Math.round(shift.drift)}`;
  if (shiftLook) {
    const dial = hud.dial.getContext("2d");
    if (dial) drawDial(dial, hud.dial.width, kmh(), car.boost);
  }
  const ctx = hud.map.getContext("2d");
  if (!ctx) return;
  minimapCoins.length = 0;
  for (const p of pickups) if (!p.taken && p.kind === "coin") minimapCoins.push([p.x, p.z]);
  drawCanvasMinimap(ctx, {
    size: 240,
    bounds: MINIMAP_BOUNDS,
    background: { fill: "rgba(38,30,26,.82)", radius: 18 },
    layers: [
      ...(shiftLook ? DISTRICT_LAYERS : []),
      { kind: "lines", segments: MINIMAP_GRID, stroke: "rgba(255,226,175,.5)", width: 2.5 },
      { kind: "rect", rect: [-510, 506, 510, 510], fill: "rgba(70,160,205,.55)" },
      { kind: "points", points: minimapCoins, fill: "#ffd15c", size: 2.8 }
    ],
    marker: { x: car.x, z: car.z, heading: car.heading, fill: shiftLook ? COURIER_TEAL : "#ff9a2e" }
  });
  // stars and hearts get their own shapes (a white diamond and a pink dot), the drop-off a cyan ring and an arrow
  const mx = (x: number): number => ((x - MINIMAP_BOUNDS[0]) / (MINIMAP_BOUNDS[2] - MINIMAP_BOUNDS[0])) * 240;
  const mz = (z: number): number => ((z - MINIMAP_BOUNDS[1]) / (MINIMAP_BOUNDS[3] - MINIMAP_BOUNDS[1])) * 240;
  for (const p of pickups) {
    if (p.taken || p.kind === "coin") continue;
    const x = mx(p.x), y = mz(p.z);
    ctx.beginPath();
    if (p.kind === "star") {
      ctx.fillStyle = "#fff4c2";
      ctx.moveTo(x, y - 5); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 4, y); ctx.closePath();
    } else {
      ctx.fillStyle = "#ff7aa0";
      ctx.arc(x, y, 3.6, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  if (job) {
    const jx = mx(job.x), jy = mz(job.z), cx = mx(car.x), cy = mz(car.z);
    ctx.strokeStyle = shiftLook ? COURIER_TEAL : "#5ce1ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(jx, jy, 7, 0, Math.PI * 2);
    ctx.stroke();
    const dx = jx - cx, dy = jy - cy, len = Math.hypot(dx, dy);
    if (len > 22) {
      const ux = dx / len, uy = dy / len;
      const tipX = cx + ux * 20, tipY = cy + uy * 20;
      ctx.fillStyle = shiftLook ? COURIER_TEAL : "#5ce1ff";
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - ux * 8 - uy * 5, tipY - uy * 8 + ux * 5);
      ctx.lineTo(tipX - ux * 8 + uy * 5, tipY - uy * 8 - ux * 5);
      ctx.closePath();
      ctx.fill();
    }
  }
}
const MINIMAP_BOUNDS: [number, number, number, number] = [-510, -510, 510, 510];
/** GC-H1: district paper tints under the street grid (shift look only, built once). */
const DISTRICT_LAYERS = shiftLook ? districtLayers(blocks) : [];
if (shiftLook) document.body.classList.add("dispatch");
const minimapCoins: [number, number][] = [];

/* ------------------------------------------------------------------ input */

const onKey = (down: boolean) => (e: KeyboardEvent) => {
  if (down && game.phase === "intro") {
    endIntro();
    e.preventDefault();
    return;
  }
  const action = down ? keyAction(e) : undefined;
  if (action === "headlights") {
    headlightAmount = beamAmount(shiftRuntime?.row().lamps ?? 0) > 0 ? 0 : 1;
    headlightForced = true;
  }
  else if (action === "pause") togglePause();
  else if (action === "mute") toggleMute();
  else if (action === "restart" && game.phase === "results") restart();
  const k = drivingKey(e);
  if (k) {
    keys[k] = down;
    e.preventDefault();
  }
};
addEventListener("keydown", onKey(true));
addEventListener("keyup", onKey(false));

function toggleMute(): void {
  if (!audio) return;
  const off = audio.setMuted(!audio.muted);
  $("mute").textContent = off ? "Sound off (M)" : "Sound on (M)";
  $("t-mute").textContent = off ? "SOUND OFF" : "SOUND";
}

const touch = mountTouchControls(document, keys, { pause: () => togglePause(), mute: toggleMute });

function begin(): void {
  if (game.phase !== "splash") return;
  // GC-C1: a player start plays the skippable intro first (QA starts, manual and reduced motion go straight in)
  game.phase = introWanted(shiftLook, config.manual, config.autostart, document.body.classList.contains("reduced-motion")) ? "intro" : "playing";
  cinemaTime = 0;
  sideShotTime = Infinity;
  $("splash").classList.add("hidden");
  audio?.resume();
}

/** GC-C1: end the intro (its last frame or any key / tap); the shift clock starts on the next fixed step. */
function endIntro(): void {
  if (game.phase !== "intro") return;
  game.phase = "playing";
  cinemaTime = 0;
}
let cinemaTime = 0;

function silence(): void {
  Object.assign(keys, NO_KEYS);
  touch.release();
  audio?.suspend();
}

function togglePause(): void {
  if (game.phase === "playing") {
    game.phase = "paused";
    silence();
    $("pause").classList.remove("hidden");
    $<HTMLButtonElement>("resume").focus();
  } else if (game.phase === "paused") {
    game.phase = "playing";
    $("pause").classList.add("hidden");
    audio?.resume();
  }
}

/** The shift is over: freeze the sim, record the best score and show the results screen. */
function endShift(): void {
  if (game.phase === "results") return;
  game.phase = "results";
  cinemaTime = 0;
  silence();
  const { best, isNew } = recordBest(safeStorage(), BEST_KEY, game.score);
  $("r-title").textContent = shift.reason === "cleared" ? "City cleared" : "Shift over";
  $("r-score").textContent = String(game.score);
  $("r-best").textContent = isNew ? `${best} (new best)` : String(best);
  $("r-deliveries").textContent = `${shift.deliveries} delivered, ${shift.missed} missed`;
  $("r-collected").textContent = `${game.collected} / ${pickups.length}`;
  $("r-streak").textContent = `x${shift.bestStreak}`;
  $("r-time").textContent = formatClock(shift.elapsed);
  $("results").classList.remove("hidden");
  $<HTMLButtonElement>("restart").focus();
  syncQa();
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** A fresh shift: car, pickups, traffic, streak, presenter, camera and clock all back to the start. */
function restart(): void {
  Object.assign(car, createCar());
  pickups.forEach((p) => (p.taken = false));
  traffic.forEach((t, i) => Object.assign(t, trafficStart[i]!));
  game.score = 0;
  game.collected = 0;
  shift = createShift(config.shiftSeconds);
  Object.assign(keys, NO_KEYS);
  Object.assign(camState, snapChase({ x: car.x, z: car.z, y: 0, heading: car.heading, speed: 0, boosting: false, shake: 0 }));
  clearance.reset();
  shiftRuntime?.reset();
  presenter.reset(presentedNow());
  placeDropoff();
  $("results").classList.add("hidden");
  $("pause").classList.add("hidden");
  game.phase = "playing";
  audio?.resume();
  syncQa();
  updateHud();
}

/* ------------------------------------------------------------------ original QA surface + hooks */

const qaState: Record<string, unknown> = { phase: "splash", boost: 1, drifting: false, boosting: false, speed: 0, heading: 0, shake: 0, score: 0, combo: 0, comboTimer: 0, collected: 0, total: pickups.length };
const player = { position: { x: car.x, y: 0, z: car.z }, userData: { footprint: FOOTPRINT } };
/** Runs every fixed step and on every QA read, so the legacy globals never report stale state. */
function syncQa(): void {
  qaState.phase = game.phase;
  qaState.boost = car.boost;
  qaState.drifting = car.drifting;
  qaState.boosting = car.boosting;
  qaState.speed = car.speed;
  qaState.heading = car.heading;
  qaState.shake = car.shake;
  qaState.score = game.score;
  qaState.combo = car.combo;
  qaState.comboTimer = car.comboTimer;
  qaState.collected = game.collected;
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
    // the original's replay world: buildings only (the reference capture has no furniture colliders)
    stepCar(car, step, held, buildingSolidsNear(), FOOTPRINT);
    syncQa();
    if (i % 10 === 0) samples.push({ t: +(i * step).toFixed(2), x: +car.x.toFixed(2), z: +car.z.toFixed(2) });
  }
  return samples;
};

function status() {
  syncQa();
  return {
    phase: game.phase, state: stateVector(car), score: game.score, collected: game.collected, total: pickups.length, combo: car.combo, boost: car.boost, speedKmh: kmh(), frames, ready, settled, warm: warmResult,
    look: config.look,
    daylight: shiftRuntime?.state() ?? null,
    brakes: { lit: brakeLit, pitch: pitchState.pitch },
    shift: { timeLeft: shift.timeLeft, elapsed: shift.elapsed, deliveries: shift.deliveries, missed: shift.missed, job: shift.job ? { ...shift.job } : null, drift: shift.drift, bestStreak: shift.bestStreak, over: shift.over, reason: shift.reason },
    touch: touch.enabled,
    bootTimings: { ...bootTimings }
  };
}

const hooks = installQaHooks("drift-and-deliver", {
  // a capture waits for the full warm-up (HDRI and textures); a player may start as soon as the programs settle
  ready: () => settled,
  state: status,
  app: () => app,
  begin,
  nodeCount: () => handles.size,
  routeHealth: () => (app ? createAuraRouteHealthSnapshot(app, { parityIds: ["SG-01", "SG-10", "SH-03", "ST-01", "R-23"] }) : null),
  reset() {
    restart();
    if (config.manual) game.phase = "splash";
  },
  /** Run `n` fixed 1/60 s steps with the given keys (default: held keys), then render once. */
  stepFrames(n: number, input?: Partial<Keys>) {
    if (game.phase === "results") return;
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
    counts: () => ({ blocks: blocks.length, buildings: buildings.length, trees: look?.stats.trees ?? 0, traffic: traffic.length, pickups: pickups.length, solids: solids.length, propSolids: propSolidCount }),
    /** traffic pose and speed (for the follow and yield specs) */
    traffic: () => traffic.map((t) => ({ x: t.x, z: t.z, horiz: t.horiz, dir: t.dir, v: t.v, wait: t.wait })),
    /** the audio beds' gain targets (zero while paused or hidden) */
    audioBeds: () => audio?.beds() ?? null,
    /** restart the shift (the results screen's Restart button) */
    restart() {
      restart();
      return status();
    },
    /** end the shift now (probes that need the results screen without driving three minutes) */
    endShift() {
      shift.timeLeft = 0;
      shift.elapsed = shift.length;
      shift.over = true;
      shift.reason = "time";
      endShift();
      return status();
    },
    /** the chase eye the rig wanted and the eye shown after the building clearance, and whether each is inside a building */
    camera: () => ({ wanted: [...camState.eye], shown: [...shownEye], wantedBlocked: cameraBlocked(...camState.eye), shownBlocked: cameraBlocked(...shownEye), factor: clearance.factor }),
    /** GU47 WP-28: named QA crops (normalised, top-left) for E-I's capture; also published on window.__AURA_QA__ */
    crops: () => qaCrops(),
    /** move the car onto the current drop-off (delivery probes) */
    toDropoff() {
      if (!shift.job) return status();
      (qa.__tp as (x: number, z: number, h?: number) => void)(shift.job.x, shift.job.z, car.heading);
      return status();
    }
  }
});

function qaCrops() {
  const aspect = canvas.clientWidth > 0 && canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : 16 / 9;
  return shiftCrops({ x: car.x, z: car.z, heading: car.heading }, { eye: shownEye, target: camState.look as [number, number, number], fovDeg: camState.fov, aspect }, shift.job ? { x: shift.job.x, z: shift.job.z } : null);
}
(window as unknown as { __AURA_QA__?: Record<string, unknown> }).__AURA_QA__ = { ...((window as unknown as { __AURA_QA__?: Record<string, unknown> }).__AURA_QA__ ?? {}), get crops() { return qaCrops(); } };

/* ------------------------------------------------------------------ boot */

/** Boot phase timings (ms since the module ran), for the L2 probe and the loading panel. */
const bootT0 = performance.now();
const bootTimings: Record<string, number> = {};
const mark = (phase: string): void => { bootTimings[phase] = Math.round(performance.now() - bootT0); };
let bootPhase = "Building blocks, buildings and traffic";
const loadingStatus = document.getElementById("loading-status");
const progressTimer = setInterval(() => {
  if (renderFailed || !loadingStatus) return;
  loadingStatus.textContent = `${bootPhase} (${Math.round((performance.now() - bootT0) / 1000)} s)`;
}, 1000);

async function boot(): Promise<void> {
  mark("module");
  // the engine owns the canvas size: CSS and backing store follow window resizes and phone rotation (lesson R1)
  app = createAuraApp(canvas, {
    autoStart: false,
    resize: true,
    pixelRatio: Math.min(devicePixelRatio || 1, config.quality === "low" ? 1 : 1.5),
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    output: { toneMapping: config.tm as "neutral", exposure: config.exposure, dither: false },
    scene: buildScene()
  });
  bootPhase = "Uploading the city to the GPU";
  await app.ready();
  mark("appReady");
  bootPhase = "Compiling shaders";
  // a draw whose program is still compiling is skipped: settle the programs so the first frame is the whole city.
  // Start unlocks once the programs settle; the sky HDRI and texture upgrades keep streaming in behind the splash
  // (on software GL the HDRI took over 45 s, and Start used to wait for it).
  if (config.warm) warmResult = await warmPrograms(app, { waitForEnvironment: false, waitForTextures: false });
  mark("programsSettled");
  clearInterval(progressTimer);
  if (look.shift) shiftRuntime = createShiftRuntime(app, look, look.furniture.lamps, skid, { reducedMotion: () => document.body.classList.contains("reduced-motion"), reducedFlash: () => config.reducedFlash || document.body.classList.contains("reduced-motion"), ...(config.at !== undefined ? { at: config.at } : {}) });
  ready = true;
  blackWatch = createBlackFrameWatch(canvas, { enabled: config.heal, storageKey: HEAL_STORAGE_KEY, ...(config.healFrames ? { fastFrames: config.healFrames } : {}) });
  $("loading").classList.add("hidden");
  const start = $<HTMLButtonElement>("start");
  start.disabled = false;
  start.focus();
  syncQa();
  placeDropoff();
  render(0);
  updateHud();
  if (config.autostart) begin();
  const envStatus = $("env-status");
  if (config.warm && (config.warmEnv || config.warmTex)) {
    envStatus.classList.remove("hidden");
    const full = await warmPrograms(app, { waitForEnvironment: config.warmEnv, environmentTimeoutMs: config.warmEnvMs, waitForTextures: config.warmTex, textureTimeoutMs: config.warmEnvMs });
    warmResult = { ...full, durationMs: (warmResult?.durationMs ?? 0) + full.durationMs };
  }
  envStatus.classList.add("hidden");
  mark("fullySettled");
  settled = true;
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
// GC-C1: a tap or click skips the intro in one frame
addEventListener("pointerdown", () => endIntro());
$("resume").addEventListener("click", togglePause);
$("restart").addEventListener("click", restart);
addEventListener("blur", () => {
  if (config.manual) return;
  if (game.phase === "playing") togglePause();
  else audio?.suspend();
});
// a hidden tab stops rAF, so the last audio ramp targets would hold: pause and silence instead
document.addEventListener("visibilitychange", () => {
  if (config.manual || document.visibilityState !== "hidden") return;
  if (game.phase === "playing") togglePause();
  else audio?.suspend();
});
requestAnimationFrame(tick);

function reportError(error: unknown): void {
  const base = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const code = (error as { code?: unknown })?.code;
  const details = (error as { details?: unknown })?.details;
  const message = `${base}${typeof code === "string" ? ` [${code}]` : ""}${details ? ` ${JSON.stringify(details).slice(0, 6000)}` : ""}`;
  hooks.reportError(message);
  clearInterval(progressTimer);
  $("loading-status").textContent = `The city could not load: ${message.slice(0, 300)}`;
  $("loading").classList.remove("hidden");
  console.error(error);
}

boot().catch(reportError);
