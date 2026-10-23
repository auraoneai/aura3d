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
import { createAuraApp, createAuraRouteHealthSnapshot, geometry, material, primitives, type AuraApp } from "@aura3d/engine";
import { buildLook, coinMat, mat, type LookRig } from "./look";
import { createAudio } from "./audio";
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

const params = new URLSearchParams(location.search);
const config = {
  manual: params.get("manual") === "1",
  autostart: params.get("autostart") === "1" || params.get("manual") === "1",
  quality: (params.get("quality") === "low" ? "low" : "high") as "high" | "low",
  /** diagnostics switches: `ao=1` turns screen-space AO on, `env=0` drops the HDRI light, `shadow=0` drops the sun's shadows */
  ao: params.get("ao") === "1",
  env: params.get("env") !== "0",
  shadow: params.get("shadow") !== "0",
  fog: params.get("fog") !== "0",
  post: params.get("post") !== "0",
  sky: params.get("sky") !== "0",
  exposure: Number(params.get("exposure") ?? "2.3") || 2.3,
  sun: Number(params.get("sun") ?? "4.4") || 4.4
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
  look = buildLook({ blocks, buildings, traffic, pickups }, { quality: config.quality, ao: config.ao, env: config.env, shadow: config.shadow, fog: config.fog, post: config.post, sky: config.sky, sun: config.sun, start: { x: car.x, z: car.z } });
  const s = look.builder;
  s.add(geometry.custom(shellGeometry(look.playerShell.paint), { name: "car-paint", material: material.carPaint({ color: "#1d1e24", roughness: 0.28, envMapIntensity: 0.6 }), castShadow: true, receiveShadow: true }).runtime({ id: "car-paint" }));
  s.add(geometry.custom(shellGeometry(look.playerShell.detail), { name: "car-detail", material: material.pbr({ color: "#ffffff", roughness: 0.4, metallic: 0.1, texture: look.palette as never }), castShadow: true, receiveShadow: true }).runtime({ id: "car-detail" }));
  s.add(primitives.box({ name: "car-light-l", size: [0.4, 0.14, 0.1], position: [-0.6, 0.62, 2.1], material: material.emissive({ color: "#eaf1ff", emissive: "#dfe9ff", emissiveIntensity: 1.4 }) }).runtime({ id: "car-light-l" }));
  s.add(primitives.box({ name: "car-light-r", size: [0.4, 0.14, 0.1], position: [0.6, 0.62, 2.1], material: material.emissive({ color: "#eaf1ff", emissive: "#dfe9ff", emissiveIntensity: 1.4 }) }).runtime({ id: "car-light-r" }));
  s.add(geometry.custom(geometry.dynamic({ positions: beam.positions, normals: beam.normals, uvs: beam.uvs, indices: beam.indices }), { name: "car-beams", material: material.custom(beamSpec(headlightAmount)) }).runtime({ id: "car-beams" }));
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

function placeTraffic(): void {
  for (const rig of look.traffic) {
    rig.cars.forEach((carIndex, n) => {
      const t = traffic[carIndex]!;
      const m = mat(t.x, 0, t.z, t.yaw, 0, 1, 1, 1);
      rig.paint.setMatrixAt(n, m);
      rig.detail.setMatrixAt(n, m);
    });
  }
}

const HIDDEN = mat(0, -50, 0, 0, 0, 0, 0, 0);
function placePickups(): void {
  look.coins.forEach((p, i) => look.coinMesh.setMatrixAt(i, p.taken ? HIDDEN : coinMat(p.x, 1.15 + 0.18 * Math.sin(2.4 * renderTime + p.spin), p.z, p.spin + renderTime * 2.4, 0.95, 0.14)));
  look.stars.forEach((p, i) => look.starMesh.setMatrixAt(i, p.taken ? HIDDEN : mat(p.x, 1.4 + 0.18 * Math.sin(2.4 * renderTime + p.spin), p.z, p.spin + renderTime * 2.4, 0, 1.3, 1.3, 1.3)));
  look.hearts.forEach((p, i) => look.heartMesh.setMatrixAt(i, p.taken ? HIDDEN : mat(p.x, 1.3 + 0.18 * Math.sin(2.4 * renderTime + p.spin), p.z, p.spin + renderTime * 2.4, 0, 1.0, 1.0, 1.0)));
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
  place("car-paint", 0, 0, 0);
  place("car-detail", 0, 0, 0);
  place("car-light-l", -0.6, 0.62, 2.1);
  place("car-light-r", 0.6, 0.62, 2.1);
  placeBeams(yaw);
  if (!beamsUncullable) {
    node("car-beams").frustumCulled = false;
    beamsUncullable = true;
  }
  node("car-beams").setUniform?.("beamAmount", headlightAmount);
  placeTraffic();
  placePickups();
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
  counts: () => ({ blocks: blocks.length, buildings: buildings.length, trees: look?.stats.trees ?? 0, traffic: traffic.length, pickups: pickups.length, solids: solids.length }),
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
    output: { toneMapping: "neutral", exposure: config.exposure, dither: false },
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
  audio?.update(game.phase === "playing" ? car : { speed: 0, drifting: false, boosting: false, boost: car.boost }, game.phase === "playing" && keys.w, dt);
  hudTimer += dt;
  if (hudTimer >= 0.05) {
    updateHud();
    hudTimer = 0;
  }
  render(config.manual ? 0 : dt);
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
  if (!window.__AURA_DRIFT_AND_DELIVER_ERROR__) window.__AURA_DRIFT_AND_DELIVER_ERROR__ = message;
  $("loading-status").textContent = `The city could not load: ${message.slice(0, 300)}`;
  $("loading").classList.remove("hidden");
  console.error(error);
}

boot().catch(reportError);
