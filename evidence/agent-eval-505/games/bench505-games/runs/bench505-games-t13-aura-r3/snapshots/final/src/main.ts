import {
  camera,
  createAuraApp,
  effects,
  environments,
  group,
  lights,
  material,
  primitives,
  scene,
  type AuraRuntimeNodeHandle
} from "@aura3d/engine";

type Status = "ready" | "playing" | "won" | "lost";

interface TaskState {
  status: Status;
  score: number;
  speed: number;
  airborne: boolean;
}

declare global {
  interface Window {
    __TASK_STATE__?: TaskState;
    __TASK_READY__?: boolean;
  }
}

// ---------------------------------------------------------------- constants
const WIN_DISTANCE = 500;
const START_SPEED = 8;
const SPEED_GAIN = 0.02; // m/s per meter: 8 m/s at 0 m, 18 m/s at 500 m
const GRAVITY = 26;
const JUMP_VELOCITY = 9; // peak 1.56 m, air time 0.69 s
const TRACK_WIDTH = 3.2;
const HURDLE_WIDTH = 2.8;
const HURDLE_HALF_DEPTH = 0.2;
const RUNNER_RADIUS = 0.3;
const SPAWN_AHEAD = 95;
const FIRST_HURDLE = 30;
const HURDLE_POOL = 14;
const MAX_STEP = 1 / 120;

const speedAt = (distance: number): number => START_SPEED + distance * SPEED_GAIN;

// ---------------------------------------------------------------- seeded random
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seedParam = Number(new URLSearchParams(window.location.search).get("seed"));
const SEED = Number.isFinite(seedParam) && seedParam !== 0 ? Math.floor(seedParam) : 1337;

// ---------------------------------------------------------------- scenery layout (cosmetic, own rng)
const sceneryRand = mulberry32(99);
const mod = (a: number, n: number): number => ((a % n) + n) % n;

interface Scroller {
  readonly id: string;
  readonly spacing: number;
  readonly index: number;
  readonly span: number;
  readonly x: number;
  readonly y: number;
}

const scrollers: Scroller[] = [];
function addScrollers(prefix: string, count: number, spacing: number, xOf: (i: number) => number, y: number): void {
  for (let i = 0; i < count; i += 1) {
    scrollers.push({ id: `${prefix}-${i}`, spacing, index: i, span: count * spacing, x: xOf(i), y });
  }
}

const STRIPES = 20;
const DASHES = 24;
const POSTS = 16;
const TREES = 14;
addScrollers("stripe", STRIPES, 6, () => 0, 0.012);
addScrollers("dash", DASHES, 5, () => 0, 0.025);
addScrollers("postL", POSTS, 7, () => -2.3, 0);
addScrollers("postR", POSTS, 7, () => 2.3, 0);
const treeXL = Array.from({ length: TREES }, () => -(5 + sceneryRand() * 5));
const treeXR = Array.from({ length: TREES }, () => 5 + sceneryRand() * 5);
addScrollers("treeL", TREES, 9, (i) => treeXL[i] ?? -6, 0);
addScrollers("treeR", TREES, 9, (i) => treeXR[i] ?? 6, 0);

// ---------------------------------------------------------------- materials
const trackMat = material.pbr({ color: "#4b5059", roughness: 0.95 });
const stripeMat = material.pbr({ color: "#555b66", roughness: 0.95 });
const grassMat = material.pbr({ color: "#4f9a45", roughness: 1 });
const lineMat = material.pbr({ color: "#f4f4f4", roughness: 0.8 });
const dashMat = material.pbr({ color: "#ffd34d", roughness: 0.8 });
const postMat = material.pbr({ color: "#e8e8ee", roughness: 0.6 });
const postCapMat = material.pbr({ color: "#e2483d", roughness: 0.6 });
const trunkMat = material.pbr({ color: "#6b4a2b", roughness: 0.95 });
const leafMats = [
  material.pbr({ color: "#2f8a3c", roughness: 0.9 }),
  material.pbr({ color: "#3d9d46", roughness: 0.9 }),
  material.pbr({ color: "#276f33", roughness: 0.9 })
];
const hurdleMat = material.pbr({ color: "#e8452c", roughness: 0.6 });
const hurdleTopMat = material.pbr({ color: "#fff3d6", roughness: 0.6 });
const shirtMat = material.pbr({ color: "#ff8a1f", roughness: 0.7 });
const pantsMat = material.pbr({ color: "#2a4aa8", roughness: 0.7 });
const skinMat = material.pbr({ color: "#f1c19a", roughness: 0.7 });
const shoeMat = material.pbr({ color: "#fafafa", roughness: 0.6 });
const hairMat = material.pbr({ color: "#2b1d14", roughness: 0.8 });
const blobMat = material.pbr({ color: "#15181c", roughness: 1 });

// ---------------------------------------------------------------- scene
const SKY = "#a9d3f0";
const world = scene({ background: SKY })
  .add(environments.neutral({ intensity: 0.9, background: false }))
  .add(lights.hemisphere({ skyColor: "#d6ebff", groundColor: "#5c7a46", intensity: 0.9 }))
  .add(lights.directional({ name: "sun", position: [6, 12, 6], target: [0, 0, -6], intensity: 2.6, color: "#fff1dc" }))
  .add(effects.fog({ color: SKY, density: 0.012 }))
  .add(primitives.plane({ name: "grass", size: [80, 1, 300], material: grassMat, receiveShadow: false }).position(0, -0.02, -120))
  .add(primitives.plane({ name: "track", size: [TRACK_WIDTH, 1, 300], material: trackMat, receiveShadow: false }).position(0, 0, -120))
  .add(primitives.box({ name: "edgeL", size: [0.12, 0.03, 300], material: lineMat }).position(-TRACK_WIDTH / 2, 0.015, -120))
  .add(primitives.box({ name: "edgeR", size: [0.12, 0.03, 300], material: lineMat }).position(TRACK_WIDTH / 2, 0.015, -120));

for (let i = 0; i < STRIPES; i += 1) {
  world.add(
    primitives.box({ name: `stripe-${i}`, size: [TRACK_WIDTH - 0.2, 0.02, 1.8], material: stripeMat })
      .position(0, 0.012, 20)
      .runtime({ id: `stripe-${i}`, mutable: true })
  );
}
for (let i = 0; i < DASHES; i += 1) {
  world.add(
    primitives.box({ name: `dash-${i}`, size: [0.16, 0.03, 1.6], material: dashMat })
      .position(0, 0.025, 20)
      .runtime({ id: `dash-${i}`, mutable: true })
  );
}
for (const side of ["L", "R"] as const) {
  for (let i = 0; i < POSTS; i += 1) {
    world.add(
      group(`post${side}-${i}`, [
        primitives.box({ name: `post${side}-${i}-pole`, size: [0.16, 1.3, 0.16], material: postMat }).position(0, 0.65, 0),
        primitives.box({ name: `post${side}-${i}-cap`, size: [0.22, 0.2, 0.22], material: postCapMat }).position(0, 1.4, 0)
      ]).runtime({ id: `post${side}-${i}`, mutable: true })
    );
  }
  for (let i = 0; i < TREES; i += 1) {
    const leaf = leafMats[Math.floor(sceneryRand() * leafMats.length)] ?? trunkMat;
    const s = 0.8 + sceneryRand() * 0.8;
    world.add(
      group(`tree${side}-${i}`, [
        primitives.cylinder({ name: `tree${side}-${i}-trunk`, size: [0.5, 1.8, 0.5], material: trunkMat }).position(0, 0.9, 0),
        primitives.cone({ name: `tree${side}-${i}-crown`, size: [2.2, 3.6, 2.2], material: leaf }).position(0, 3.4, 0)
      ], { scale: s }).runtime({ id: `tree${side}-${i}`, mutable: true })
    );
  }
}
for (let i = 0; i < HURDLE_POOL; i += 1) {
  world.add(
    group(`hurdle-${i}`, [
      primitives.box({ name: `hurdle-${i}-body`, size: [HURDLE_WIDTH, 1, HURDLE_HALF_DEPTH * 2], material: hurdleMat }).position(0, 0.5, 0),
      primitives.box({ name: `hurdle-${i}-top`, size: [HURDLE_WIDTH + 0.1, 0.1, HURDLE_HALF_DEPTH * 2 + 0.1], material: hurdleTopMat }).position(0, 0.97, 0)
    ]).position(0, -50, 0).runtime({ id: `hurdle-${i}`, mutable: true })
  );
}

// Runner: joint hierarchy, facing -z (the direction of travel).
const limb = (name: string, size: [number, number, number], mat: typeof skinMat, y: number) =>
  primitives.box({ name, size, material: mat }).position(0, y, 0);
const legNode = (side: "l" | "r", x: number) =>
  group(`${side}-hip`, [
    limb(`${side}-thigh`, [0.17, 0.46, 0.19], pantsMat, -0.23),
    group(`${side}-knee`, [
      limb(`${side}-shin`, [0.15, 0.44, 0.17], pantsMat, -0.22),
      primitives.box({ name: `${side}-shoe`, size: [0.18, 0.1, 0.34], material: shoeMat }).position(0, -0.43, -0.07)
    ], { position: [0, -0.46, 0] }).runtime({ id: `${side}-knee`, mutable: true })
  ], { position: [x, -0.02, 0] }).runtime({ id: `${side}-hip`, mutable: true });
const armNode = (side: "l" | "r", x: number) =>
  group(`${side}-shoulder`, [
    limb(`${side}-upper-arm`, [0.13, 0.4, 0.13], shirtMat, -0.2),
    group(`${side}-elbow`, [
      limb(`${side}-forearm`, [0.11, 0.36, 0.11], skinMat, -0.18)
    ], { position: [0, -0.4, 0] }).runtime({ id: `${side}-elbow`, mutable: true })
  ], { position: [x, 0.52, 0] }).runtime({ id: `${side}-shoulder`, mutable: true });

const runner = group("runner", [
  group("blob", [
    primitives.cylinder({ name: "blob-disc", size: [0.9, 0.02, 0.9], material: blobMat }).position(0, 0.05, 0)
  ]).runtime({ id: "blob", mutable: true }),
  group("hips", [
    primitives.box({ name: "pelvis", size: [0.38, 0.18, 0.22], material: pantsMat }),
    legNode("l", -0.1),
    legNode("r", 0.1),
    group("chest", [
      primitives.box({ name: "torso", size: [0.5, 0.58, 0.28], material: shirtMat }).position(0, 0.32, 0),
      group("head", [
        primitives.sphere({ name: "skull", size: 0.32, material: skinMat }).position(0, 0.18, 0),
        primitives.sphere({ name: "hair", size: 0.34, material: hairMat }).position(0, 0.22, 0.04),
        primitives.box({ name: "face", size: [0.18, 0.05, 0.05], material: hairMat }).position(0, 0.2, -0.15)
      ], { position: [0, 0.68, 0] }).runtime({ id: "head", mutable: true }),
      armNode("l", -0.33),
      armNode("r", 0.33)
    ], { position: [0, 0.08, 0] }).runtime({ id: "chest", mutable: true })
  ], { position: [0, 0.93, 0] }).runtime({ id: "hips", mutable: true })
]).runtime({ id: "runner", mutable: true });
world.add(runner);
world.camera(camera.perspective({ position: [0, 3.1, 6], target: [0, 1.0, -8], fov: 55, near: 0.1, far: 300 }));

// ---------------------------------------------------------------- DOM
function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}
const hudDistance = el("hud-distance");
const hudBest = el("hud-best");
const hudStatus = el("hud-status");
const overlay = el("overlay");
const overlayTitle = el("overlay-title");
const overlayDetail = el("overlay-detail");
const overlayHint = el("overlay-hint");

// ---------------------------------------------------------------- game state
interface Hurdle {
  d: number;
  h: number;
  slot: number;
}

const game = {
  status: "ready" as Status,
  distance: 0,
  speed: START_SPEED,
  y: 0,
  vy: 0,
  best: 0,
  phase: 0,
  hurdles: [] as Hurdle[],
  freeSlots: [] as number[],
  nextHurdle: FIRST_HURDLE,
  rand: mulberry32(SEED)
};

function resetRun(): void {
  game.status = "ready";
  game.distance = 0;
  game.speed = START_SPEED;
  game.y = 0;
  game.vy = 0;
  game.phase = 0;
  game.hurdles = [];
  game.freeSlots = Array.from({ length: HURDLE_POOL }, (_, i) => HURDLE_POOL - 1 - i);
  game.nextHurdle = FIRST_HURDLE;
  game.rand = mulberry32(SEED);
}

function spawnHurdles(): void {
  while (game.nextHurdle < game.distance + SPAWN_AHEAD) {
    const slot = game.freeSlots.pop();
    if (slot === undefined) return;
    const h = 0.4 + game.rand() * 0.6;
    game.hurdles.push({ d: game.nextHurdle, h, slot });
    const minGap = speedAt(game.nextHurdle) * 0.75 + 3;
    const extra = game.rand() < 0.25 ? 0 : game.rand() * 12;
    game.nextHurdle += minGap + extra;
  }
}

function endRun(status: "won" | "lost"): void {
  game.status = status;
  game.best = Math.max(game.best, game.distance);
}

function step(dt: number): void {
  if (game.status !== "playing") return;
  game.speed = speedAt(game.distance);
  game.distance += game.speed * dt;
  if (game.y > 0 || game.vy > 0) {
    game.vy -= GRAVITY * dt;
    game.y += game.vy * dt;
    if (game.y <= 0) {
      game.y = 0;
      game.vy = 0;
    }
  }
  game.phase += dt * game.speed * 1.15;

  for (const hurdle of game.hurdles) {
    if (Math.abs(hurdle.d - game.distance) < HURDLE_HALF_DEPTH + RUNNER_RADIUS && game.y < hurdle.h - 0.03) {
      endRun("lost");
      return;
    }
  }
  if (game.distance >= WIN_DISTANCE) {
    game.distance = WIN_DISTANCE;
    game.speed = speedAt(game.distance);
    endRun("won");
    return;
  }
  while (game.hurdles.length > 0 && (game.hurdles[0]?.d ?? 0) < game.distance - 5) {
    const gone = game.hurdles.shift();
    if (gone) game.freeSlots.push(gone.slot);
  }
  spawnHurdles();
}

function jumpInput(): void {
  if (game.status === "won" || game.status === "lost") {
    resetRun();
    game.status = "playing";
    spawnHurdles();
    syncState();
    return;
  }
  if (game.status === "ready") {
    game.status = "playing";
    spawnHurdles();
  }
  if (game.status === "playing" && game.y === 0 && game.vy === 0) {
    game.vy = JUMP_VELOCITY;
    game.y = 1e-4;
  }
  syncState();
}

function restartInput(): void {
  resetRun();
  spawnHurdles();
  syncState();
}

// ---------------------------------------------------------------- state mirrors
const shownScore = (): number => Math.round(game.distance * 100) / 100;

function syncState(): void {
  window.__TASK_STATE__ = {
    status: game.status,
    score: shownScore(),
    speed: Math.round(game.speed * 100) / 100,
    airborne: game.y > 0
  };
}

let lastHud = "";
function syncHud(): void {
  const best = Math.max(game.best, game.distance);
  const key = `${Math.floor(game.distance)}|${Math.floor(best)}|${game.status}`;
  if (key === lastHud) return;
  lastHud = key;
  hudDistance.textContent = String(Math.floor(game.distance));
  hudBest.textContent = String(Math.floor(best));
  hudStatus.textContent = game.status;
  if (game.status === "ready") {
    overlay.className = "show";
    overlayTitle.textContent = "Endless Runner";
    overlayDetail.textContent = "Jump the hurdles. Reach 500 m to win.";
    overlayHint.textContent = "Press Space / Up / W or tap to start";
  } else if (game.status === "lost" || game.status === "won") {
    overlay.className = "show";
    overlayTitle.textContent = game.status === "won" ? "You made it!" : "Game over";
    overlayDetail.textContent = `Distance ${Math.floor(game.distance)} m, best ${Math.floor(best)} m`;
    overlayHint.textContent = "Press R or jump (Space / Up / W / tap) to restart";
  } else {
    overlay.className = "";
  }
}

// ---------------------------------------------------------------- input
window.addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") {
    event.preventDefault();
    if (!event.repeat) jumpInput();
  } else if (event.code === "KeyR") {
    if (!event.repeat) restartInput();
  }
});
window.addEventListener("pointerdown", (event) => {
  if (event.button === 0 || event.pointerType !== "mouse") jumpInput();
});

// ---------------------------------------------------------------- app
const app = createAuraApp("#app", { scene: world, resize: false });

const handles = new Map<string, AuraRuntimeNodeHandle>();
function node(id: string): AuraRuntimeNodeHandle {
  let handle = handles.get(id);
  if (!handle) {
    handle = app.nodes.require(id);
    handles.set(id, handle);
  }
  return handle;
}

function poseRunner(time: number): void {
  const airborne = game.y > 0;
  const running = game.status === "playing";
  const p = game.phase;
  const s = Math.sin(p);
  const c = Math.cos(p);
  let hipL = 0, hipR = 0, kneeL = -0.1, kneeR = -0.1, armL = 0, armR = 0, elbow = 0.4, lean = -0.05, bob = 0;

  if (airborne) {
    hipL = 0.9; hipR = -0.25;
    kneeL = -0.7; kneeR = -1.1;
    armL = -2.2; armR = -1.8;
    elbow = 0.4;
    lean = -0.12;
  } else if (running) {
    hipL = s * 0.95; hipR = -s * 0.95;
    kneeL = -(0.55 - 0.45 * s); kneeR = -(0.55 + 0.45 * s);
    armL = -s * 0.9; armR = s * 0.9;
    elbow = 1.2;
    lean = -0.22;
    bob = Math.abs(c) * 0.07;
  } else {
    const idle = Math.sin(time * 2);
    bob = idle * 0.01;
    armL = 0.05 * idle; armR = -0.05 * idle;
    elbow = 0.2;
  }

  node("runner").setPosition(0, game.y, 0);
  node("hips").setPosition(0, 0.93 + bob, 0);
  node("chest").setRotation(lean, 0, 0);
  node("head").setRotation(-lean * 0.8, 0, 0);
  node("l-hip").setRotation(hipL, 0, 0);
  node("r-hip").setRotation(hipR, 0, 0);
  node("l-knee").setRotation(kneeL, 0, 0);
  node("r-knee").setRotation(kneeR, 0, 0);
  node("l-shoulder").setRotation(armL, 0, 0.08);
  node("r-shoulder").setRotation(armR, 0, -0.08);
  node("l-elbow").setRotation(elbow, 0, 0);
  node("r-elbow").setRotation(elbow, 0, 0);
  const blob = Math.max(0.25, 1 - game.y * 0.55);
  node("blob").setPosition(0, -game.y, 0).setScale([blob, 1, blob]);
}

function poseWorld(): void {
  for (const item of scrollers) {
    const z = 8 - mod(item.index * item.spacing - game.distance, item.span);
    node(item.id).setPosition(item.x, item.y, z);
  }
  const used = new Set<number>();
  for (const hurdle of game.hurdles) {
    used.add(hurdle.slot);
    const handle = node(`hurdle-${hurdle.slot}`);
    handle.setScale([1, hurdle.h, 1]);
    handle.setPosition(0, 0, -(hurdle.d - game.distance));
  }
  for (let i = 0; i < HURDLE_POOL; i += 1) {
    if (!used.has(i)) node(`hurdle-${i}`).setPosition(0, -50, 0);
  }
}

let elapsed = 0;
let framesSeen = 0;
app.onFrame((frame) => {
  const dt = Math.min(Math.max(frame.dt, 0), 0.05);
  elapsed += dt;
  let left = dt;
  while (left > 1e-9) {
    const h = Math.min(left, MAX_STEP);
    step(h);
    left -= h;
  }
  poseWorld();
  poseRunner(elapsed);
  syncHud();
  syncState();
  framesSeen += 1;
});

resetRun();
spawnHurdles();
syncState();
syncHud();

const nextFrame = (): Promise<void> => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
void (async () => {
  await app.ready();
  let waited = 0;
  while (framesSeen < 2 && waited < 120) {
    await nextFrame();
    waited += 1;
  }
  await nextFrame();
  window.__TASK_READY__ = true;
})();
