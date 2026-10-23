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
import { camera, createAuraApp, createAuraRouteHealthSnapshot, effects, geometry, instances, lights, material, primitives, scene, texture, type AuraApp } from "@aura3d/engine";
import { snapChase, stepChase, type ChaseState } from "./chase";
import { beamGeometry, beamSpec } from "./headlights";
import { CONFIG, NO_KEYS, createCar, stateVector, stepCar, teleport, type Footprint, type Keys, type Solid } from "./sim";
import {
  BLOCK_HALF,
  PITCH,
  buildBlocks,
  buildBuildings,
  buildPickups,
  buildTraffic,
  buildingSolids,
  collectPickups,
  noise,
  stepTraffic,
  tickCombo,
  trafficContact
} from "./world";

const params = new URLSearchParams(location.search);
const config = {
  manual: params.get("manual") === "1",
  autostart: params.get("autostart") === "1" || params.get("manual") === "1",
  quality: (params.get("quality") === "low" ? "low" : "high") as "high" | "low"
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
const game = { phase: "splash" as "splash" | "playing", score: 0, collected: 0 };
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

/* ------------------------------------------------------------------ matrices */

type Mat = number[];
function trs(x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number): Mat {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [c * sx, 0, -s * sx, 0, 0, sy, 0, 0, s * sz, 0, c * sz, 0, x, y, z, 1];
}

const TONES = ["#e8e2d6", "#dcd2c2", "#cfc4b2", "#e0d3bd", "#c9c2b6", "#d6c6ae"];
const CAR_COLORS = ["#d8562a", "#3c3d45", "#4fb0e0", "#f0a02c", "#c9c2b6", "#7a9c56"];

/* ------------------------------------------------------------------ scene */

function skyTexture() {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  for (const [at, color] of [[0, "#4f8cca"], [0.38, "#9dc2e0"], [0.7, "#dfd2c2"], [0.87, "#fbd9ab"], [1, "#ffe9c4"]] as const) grad.addColorStop(at, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  return texture.canvas({ canvas: c, colorSpace: "srgb" });
}

const blockMesh = instances.mesh("box", material.pbr({ color: "#ffffff", roughness: 0.9 }), blocks.length);
blocks.forEach((b, i) => {
  blockMesh.setMatrixAt(i, trs(b.x, 0.15, b.z, 0, BLOCK_HALF * 2, 0.3, BLOCK_HALF * 2));
  blockMesh.setColorAt(i, b.park ? "#7a9c56" : b.plaza ? "#d5cbb2" : "#cbbfa4");
});
const buildingMesh = instances.mesh("box", material.pbr({ color: "#ffffff", roughness: 0.62, metallic: 0.05 }), buildings.length);
buildings.forEach((b, i) => {
  buildingMesh.setMatrixAt(i, trs(b.x, 0.3 + b.height / 2, b.z, 0, b.hw * 2, b.height, b.hd * 2));
  buildingMesh.setColorAt(i, TONES[b.tone] as string);
});
const trees: { x: number; z: number; h: number }[] = [];
blocks.filter((b) => b.park).forEach((b, bi) => {
  for (let k = 0; k < 12; k++) {
    const r = noise(bi * 31 + k * 3.7);
    trees.push({ x: b.x + (noise(bi * 17 + k * 5.3) - 0.5) * 36, z: b.z + (noise(bi * 13 + k * 7.9) - 0.5) * 36, h: 3.2 + 3 * r });
  }
});
const trunkMesh = instances.mesh("cylinder", material.pbr({ color: "#6b4b32", roughness: 0.9 }), trees.length);
const crownMesh = instances.mesh("sphere", material.pbr({ color: "#5f8a45", roughness: 0.85 }), trees.length);
trees.forEach((t, i) => {
  trunkMesh.setMatrixAt(i, trs(t.x, 0.3 + t.h * 0.2, t.z, 0, 0.5, t.h * 0.4, 0.5));
  crownMesh.setMatrixAt(i, trs(t.x, 0.3 + t.h * 0.7, t.z, 0, t.h * 0.7, t.h * 0.7, t.h * 0.7));
});
const trafficMesh = instances.mesh("box", material.pbr({ color: "#ffffff", roughness: 0.45, metallic: 0.2 }), traffic.length);
traffic.forEach((t, i) => trafficMesh.setColorAt(i, CAR_COLORS[i % CAR_COLORS.length] as string));
const coins = pickups.filter((p) => p.kind === "coin");
const stars = pickups.filter((p) => p.kind === "star");
const hearts = pickups.filter((p) => p.kind === "heart");
const coinMesh = instances.mesh("cylinder", material.emissive({ color: "#ffd15c", emissive: "#ffb300" }), coins.length);
const starMesh = instances.mesh("polyhedron", material.emissive({ color: "#fff0a8", emissive: "#ffd54a" }), stars.length);
const heartMesh = instances.mesh("sphere", material.emissive({ color: "#ff8aa8", emissive: "#ff4d79" }), hearts.length);

const beam = beamGeometry();
const carPaint = material.pbr({ color: "#8d95a1", roughness: 0.55, metallic: 0.12 });
const carAccent = material.pbr({ color: "#d8562a", roughness: 0.5, metallic: 0.1 });
const dark = material.pbr({ color: "#1c1e24", roughness: 0.8 });

function buildScene() {
  const s = scene()
    .background({ texture: skyTexture() })
    .camera(camera.perspective({ position: [car.x, 4.3, car.z - 10.6], target: [car.x, 1.25, car.z + 5], fov: 56, near: 0.4, far: 2400 }))
    .add(primitives.plane({ name: "ground", position: [0, 0, 0], size: 2600, material: material.pbr({ color: "#6e6a72", roughness: 0.95 }) }))
    .add(primitives.plane({ name: "water", position: [0, 0.02, 1100], size: [2600, 1200], material: material.pbr({ color: "#2e7ea6", roughness: 0.18, metallic: 0.1 }) }))
    .add(blockMesh)
    .add(buildingMesh)
    .add(trunkMesh)
    .add(crownMesh)
    .add(trafficMesh)
    .add(coinMesh)
    .add(starMesh)
    .add(heartMesh)
    .add(primitives.box({ name: "car-body", size: [1.9, 0.55, 4.2], position: [0, 0.6, 0], material: carPaint }).runtime({ id: "car-body" }))
    .add(primitives.box({ name: "car-cabin", size: [1.5, 0.5, 1.9], position: [0, 1.1, -0.2], material: carAccent }).runtime({ id: "car-cabin" }))
    .add(primitives.box({ name: "car-light-l", size: [0.4, 0.14, 0.1], position: [-0.6, 0.62, 2.1], material: material.emissive({ color: "#eaf1ff", emissive: "#dfe9ff" }) }).runtime({ id: "car-light-l" }))
    .add(primitives.box({ name: "car-light-r", size: [0.4, 0.14, 0.1], position: [0.6, 0.62, 2.1], material: material.emissive({ color: "#eaf1ff", emissive: "#dfe9ff" }) }).runtime({ id: "car-light-r" }))
    .add(geometry.custom(geometry.dynamic({ positions: beam.positions, normals: beam.normals, uvs: beam.uvs, indices: beam.indices }), { name: "car-beams", material: material.custom(beamSpec(headlightAmount)) }).runtime({ id: "car-beams" }))
    .add(lights.directional({ name: "sun", position: [-62, 68, -36], target: [0, 0, 0], intensity: 3.15, color: "#ffd9a2" }))
    .add(lights.hemisphere({ name: "sky", skyColor: "#cfe0f4", groundColor: "#8a7f6e", intensity: 0.9 }))
    .add(lights.ambient({ name: "fill", intensity: 0.24, color: "#d8dae0" }))
    .add(effects.bloom({ name: "bloom", intensity: 0.35, threshold: 1.05, radius: 0.35 }))
    .add(effects.antiAlias({ name: "aa", mode: "fxaa" }));
  for (const [i, x] of [-0.85, 0.85].entries()) {
    for (const [j, z] of [1.3, -1.3].entries()) {
      s.add(primitives.cylinder({ name: `wheel-${i}-${j}`, size: [0.8, 0.34, 0.8], rotation: [0, 0, Math.PI / 2], position: [x, 0.4, z], material: dark }).runtime({ id: `wheel-${i}-${j}` }));
    }
  }
  return s;
}

/* ------------------------------------------------------------------ frame */

let app: AuraApp | undefined;
let ready = false;
let renderTime = 0;
let frames = 0;
let accumulator = 0;
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
  trafficContact(traffic, car);
  const ps = pickupState();
  collectPickups(pickups, car, ps);
  tickCombo(ps, STEP);
  game.collected = ps.collected;
  game.score = ps.score;
  car.combo = ps.combo;
  car.comboTimer = ps.comboTimer;
  car.boost = ps.boost;
}

function simulate(steps: number, input: Keys = keys): void {
  for (let i = 0; i < steps; i++) simulateStep(input);
}

function followCamera(steps: number): void {
  for (let i = 0; i < steps; i++) stepChase(camState, { x: car.x, z: car.z, y: 0, heading: car.heading, speed: car.speed, boosting: car.boosting, shake: car.shake }, STEP);
}

const beamWorldPositions = new Float32Array(beam.positions.length);
const beamWorldNormals = new Float32Array(beam.normals.length);

/** The beams live in world space (their node stays at the origin): the cone is rotated and translated here each frame. */
function placeBeams(yaw: number): void {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  for (let i = 0; i < beam.positions.length; i += 3) {
    const lx = beam.positions[i]!, ly = beam.positions[i + 1]!, lz = beam.positions[i + 2]!;
    beamWorldPositions[i] = car.x + lx * c + lz * s;
    beamWorldPositions[i + 1] = ly;
    beamWorldPositions[i + 2] = car.z - lx * s + lz * c;
    const nx = beam.normals[i]!, ny = beam.normals[i + 1]!, nz = beam.normals[i + 2]!;
    beamWorldNormals[i] = nx * c + nz * s;
    beamWorldNormals[i + 1] = ny;
    beamWorldNormals[i + 2] = -nx * s + nz * c;
  }
  const h = node("car-beams");
  h.updateAttribute?.("position", { array: beamWorldPositions });
  h.updateAttribute?.("normal", { array: beamWorldNormals });
}

function placeNodes(dt: number): void {
  const yaw = car.heading + 0.72 * car.lean;
  const roll = -Math.max(-0.16, Math.min(0.16, car.steer * Math.min(1, Math.abs(car.speed) / 34) * 0.09 + 0.1 * car.lean));
  const place = (id: string, ox: number, oy: number, oz: number, extra: [number, number, number] = [0, 0, 0]) => {
    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    const h = node(id);
    h.setPosition(car.x + ox * c + oz * s, oy, car.z - ox * s + oz * c);
    h.setRotation(extra[0], yaw + extra[1], roll + extra[2]);
  };
  place("car-body", 0, 0.6, 0);
  place("car-cabin", 0, 1.1, -0.2);
  place("car-light-l", -0.6, 0.62, 2.1);
  place("car-light-r", 0.6, 0.62, 2.1);
  placeBeams(yaw);
  if (!beamsUncullable) {
    node("car-beams").frustumCulled = false;
    beamsUncullable = true;
  }
  node("car-beams").setUniform?.("beamAmount", headlightAmount);
  const spin = (renderTime * car.speed) / 0.34;
  for (const [i, x] of [-0.85, 0.85].entries()) for (const [j, z] of [1.3, -1.3].entries()) place(`wheel-${i}-${j}`, x, 0.4, z, [spin * 0, 0, Math.PI / 2]);
  traffic.forEach((t, i) => trafficMesh.setMatrixAt(i, trs(t.x, 0.9, t.z, t.yaw, 2.0, 1.3, 4.4)));
  const put = (mesh: typeof coinMesh, list: typeof coins, size: number, tall: number) =>
    list.forEach((p, i) => mesh.setMatrixAt(i, p.taken ? trs(0, -50, 0, 0, 0, 0, 0) : trs(p.x, p.y + 0.18 * Math.sin(2.4 * renderTime + p.spin), p.z, p.spin + renderTime * 2.4, size, tall, size)));
  put(coinMesh, coins, 0.9, 0.12);
  put(starMesh, stars, 1.2, 1.2);
  put(heartMesh, hearts, 1.0, 1.0);
  stepChase(camState, { x: car.x, z: car.z, y: 0, heading: car.heading, speed: car.speed, boosting: car.boosting, shake: car.shake }, dt);
  app!.camera!.setPose({ position: [...camState.eye], target: [...camState.look], up: [0, 1, 0], fov: camState.fov }, { cut: false });
}

function render(dt: number): void {
  if (!app || !ready || renderFailed) return;
  try {
    placeNodes(dt);
    app.step(0);
    frames++;
  } catch (error) {
    renderFailed = true;
    reportError(error);
    throw error;
  }
}

/* ------------------------------------------------------------------ HUD */

const hud = { nitro: $("nitro-fill"), speed: $("speed"), score: $("score"), streak: $("streak"), count: $("count"), map: $<HTMLCanvasElement>("minimap") };
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
  const e = 240;
  const n = (v: number): number => (v / 1020 + 0.5) * e;
  ctx.clearRect(0, 0, e, e);
  ctx.fillStyle = "rgba(38,30,26,.82)";
  ctx.beginPath();
  ctx.roundRect(0, 0, e, e, 18);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,226,175,.5)";
  ctx.lineWidth = 2.5;
  for (let k = -8; k <= 7; k++) {
    const o = n(k * PITCH + 30);
    ctx.beginPath();
    ctx.moveTo(o, n(-450));
    ctx.lineTo(o, n(506));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(n(-450), o);
    ctx.lineTo(n(506), o);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(70,160,205,.55)";
  ctx.fillRect(0, n(506), e, e - n(506));
  ctx.fillStyle = "#ffd15c";
  for (const p of pickups) if (!p.taken) ctx.fillRect(n(p.x) - 1.4, n(p.z) - 1.4, 2.8, 2.8);
  ctx.save();
  ctx.translate(n(car.x), n(car.z));
  ctx.rotate(-car.heading);
  ctx.fillStyle = "#ff9a2e";
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(5.5, 7);
  ctx.lineTo(0, 3.5);
  ctx.lineTo(-5.5, 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------------------------ input */

const KEYMAP: Record<string, keyof Keys> = { w: "w", arrowup: "w", a: "a", arrowleft: "a", s: "s", arrowdown: "s", d: "d", arrowright: "d", shift: "shift", " ": "space" };
const onKey = (down: boolean) => (e: KeyboardEvent) => {
  if (down && (e.key || "").toLowerCase() === "l") headlightAmount = headlightAmount > 0 ? 0 : 1;
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
qa.__diag = () => ({ solids: solids.length, bots: 0, traffic: traffic.length, pickups: pickups.length, blocks: blocks.length, parks: blocks.filter((b) => b.park).length, placements: buildings.length + trees.length });
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
  return { phase: game.phase, state: stateVector(car), score: game.score, collected: game.collected, total: pickups.length, combo: car.combo, boost: car.boost, speedKmh: kmh(), frames, ready };
}

const api = {
  ready: () => ready,
  state: status,
  begin,
  applyInput(input: Partial<Keys>) {
    Object.assign(keys, NO_KEYS, input);
  },
  reset() {
    Object.assign(car, createCar());
    pickups.forEach((p) => (p.taken = false));
    game.score = 0;
    game.collected = 0;
    Object.assign(camState, snapChase({ x: car.x, z: car.z, y: 0, heading: car.heading, speed: 0, boosting: false, shake: 0 }));
    syncQa();
    return status();
  },
  teleport(x: number, z: number, heading?: number) {
    (qa.__tp as (x: number, z: number, h?: number) => void)(x, z, heading);
    return status();
  },
  /** Run `n` fixed 1/60 s steps with the given keys (default: held keys), then render once. */
  stepFrames(n: number, input?: Partial<Keys>) {
    game.phase = "playing";
    const held = input ? { ...NO_KEYS, ...input } : keys;
    for (let i = 0; i < Math.max(0, n | 0); i++) {
      simulateStep(held);
      followCamera(1);
    }
    updateHud();
    render(0);
    return status();
  },
  headlights(amount?: number) {
    if (amount !== undefined) headlightAmount = Math.max(0, Math.min(1, amount));
    return headlightAmount;
  },
  pickups: () => pickups.map((p) => ({ kind: p.kind, x: p.x, z: p.z, taken: p.taken })),
  counts: () => ({ blocks: blocks.length, buildings: buildings.length, trees: trees.length, traffic: traffic.length, pickups: pickups.length, solids: solids.length }),
  nodeCount: () => handles.size,
  info: () => app?.info ?? null,
  diagnostics: () => app?.diagnostics() ?? null,
  async pixels(): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
    if (!app?.capture) throw new Error("capture unavailable");
    const blob = (await app.capture({ type: "png-blob" })) as Blob;
    const bitmap = await createImageBitmap(blob);
    const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = surface.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    const image = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return { width: image.width, height: image.height, data: image.data };
  },
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
  routeHealth: () => (app ? createAuraRouteHealthSnapshot(app, { parityIds: ["SG-01", "SG-10", "SH-03", "ST-01", "R-23"] }) : null)
};

declare global {
  interface Window {
    __AURA_DRIFT_AND_DELIVER__?: typeof api;
    __AURA_DRIFT_AND_DELIVER_ERROR__?: string;
  }
}
window.__AURA_DRIFT_AND_DELIVER__ = api;

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
    output: { toneMapping: "neutral", exposure: 1.34, dither: false },
    scene: buildScene()
  });
  await app.ready();
  ready = true;
  $("loading").classList.add("hidden");
  $<HTMLButtonElement>("start").disabled = false;
  syncQa();
  render(0);
  updateHud();
  if (config.autostart) begin();
}

let lastTick = performance.now();
function tick(now: number): void {
  requestAnimationFrame(tick);
  const dt = Math.min(1 / 24, Math.max(0.001, (now - lastTick) / 1000));
  lastTick = now;
  if (!ready) return;
  renderTime += dt;
  if (!config.manual && game.phase === "playing") {
    accumulator = Math.min(0.12, accumulator + dt);
    while (accumulator >= STEP) {
      simulate(1);
      accumulator -= STEP;
    }
  }
  hudTimer += dt;
  if (hudTimer >= 0.05) {
    updateHud();
    hudTimer = 0;
  }
  render(config.manual ? 0 : dt);
}

$("start").addEventListener("click", begin);
addEventListener("resize", sizeCanvas);
requestAnimationFrame(tick);

function reportError(error: unknown): void {
  const base = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const code = (error as { code?: unknown })?.code;
  const details = (error as { details?: unknown })?.details;
  const message = `${base}${typeof code === "string" ? ` [${code}]` : ""}${details ? ` ${JSON.stringify(details).slice(0, 6000)}` : ""}`;
  if (!window.__AURA_DRIFT_AND_DELIVER_ERROR__) window.__AURA_DRIFT_AND_DELIVER_ERROR__ = message;
  $("loading-status").textContent = `The city could not load: ${message.slice(0, 300)}`;
  $("loading").classList.remove("hidden");
  console.error(error);
}

boot().catch(reportError);
