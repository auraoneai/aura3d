import { camera, createAuraApp, looks, material, primitives, scene } from "@aura3d/engine";

type Status = "ready" | "playing" | "won" | "lost";

declare global {
  interface Window {
    __TASK_STATE__?: { status: Status; score: number; speed: number; airborne: boolean };
    __TASK_READY__?: boolean;
  }
}

// ---------------------------------------------------------------- tuning
const LOOK_ID = "outdoor-day" as const;
const WIN_DISTANCE = 500;
const GRAVITY = 30;
const JUMP_VELOCITY = 11; // apex 2.0 m, air time about 0.73 s
const BASE_SPEED = 10;
const SPEED_GAIN = 0.02; // m/s per meter: 20 m/s at 500 m
const SIM_STEP = 1 / 120;
const HURDLE_WIDTH = 4.6;
const HURDLE_DEPTH = 0.5;
const RUNNER_HALF_DEPTH = 0.3;
const FIRST_HURDLE = 28;
const SPAWN_AHEAD = 100;
const HURDLE_POOL = 10;
const CAMERA_Z = 7.5;

const speedAt = (d: number): number => BASE_SPEED + Math.min(d, WIN_DISTANCE) * SPEED_GAIN;

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
const SEED = Number.isFinite(seedParam) && seedParam !== 0 ? Math.floor(seedParam) : 20240601;

// ---------------------------------------------------------------- scenery layout
interface Ring {
  readonly id: string;
  readonly spacing: number;
  readonly count: number;
}
const DASH: Ring = { id: "dash", spacing: 6, count: 16 };
const CROSS: Ring = { id: "cross", spacing: 5, count: 18 };
const POST: Ring = { id: "post", spacing: 6, count: 16 };
const TREE: Ring = { id: "tree", spacing: 12, count: 8 };

const decorRng = mulberry32(777);
const treeOffsets: number[] = [];
const treeScales: number[] = [];
for (let i = 0; i < TREE.count * 2; i += 1) {
  treeOffsets.push(5.6 + decorRng() * 4);
  treeScales.push(0.8 + decorRng() * 0.7);
}

// ---------------------------------------------------------------- scene
const C = {
  track: "#4a4f59",
  line: "#f2f2ee",
  cross: "#3d414a",
  grass: "#4f8a3c",
  post: "#f4f1e8",
  trunk: "#6b4526",
  leaf: "#2f7d3a",
  hurdle: "#e8512f",
  hurdleCap: "#ffffff",
  skin: "#f1c89a",
  shirt: "#1f6fe0",
  shorts: "#ffd23f",
  shoes: "#222831",
  shadow: "#1b2a18"
} as const;

const pbr = (color: string) => material.pbr({ color, roughness: 0.85 });

let stage = scene()
  .add(looks.preset(LOOK_ID))
  .add(primitives.box({ name: "grass", size: [240, 0.1, 260], position: [0, -0.1, -90], material: pbr(C.grass), castShadow: false }))
  .add(primitives.box({ name: "track", size: [5.2, 0.1, 260], position: [0, -0.05, -90], material: pbr(C.track), castShadow: false }))
  .add(primitives.box({ name: "edge-l", size: [0.12, 0.02, 260], position: [-2.5, 0.01, -90], material: pbr(C.line), castShadow: false }))
  .add(primitives.box({ name: "edge-r", size: [0.12, 0.02, 260], position: [2.5, 0.01, -90], material: pbr(C.line), castShadow: false }));

const add = (builder: ReturnType<typeof primitives.box>, id: string): void => {
  stage = stage.add(builder.runtime({ id, mutable: true }));
};

for (let i = 0; i < DASH.count; i += 1) {
  add(primitives.box({ name: `${DASH.id}${i}`, size: [0.16, 0.02, 2.2], position: [0, 0.012, -200], material: pbr(C.line), castShadow: false }), `${DASH.id}${i}`);
}
for (let i = 0; i < CROSS.count; i += 1) {
  add(primitives.box({ name: `${CROSS.id}${i}`, size: [5, 0.015, 0.35], position: [0, 0.008, -200], material: pbr(C.cross), castShadow: false }), `${CROSS.id}${i}`);
}
for (let i = 0; i < POST.count * 2; i += 1) {
  add(primitives.box({ name: `${POST.id}${i}`, size: [0.22, 1.3, 0.22], position: [0, 0.65, -200], material: pbr(C.post) }), `${POST.id}${i}`);
}
for (let i = 0; i < TREE.count * 2; i += 1) {
  const s = treeScales[i] ?? 1;
  add(primitives.cylinder({ name: `trunk${i}`, size: [0.5 * s, 1.6 * s, 0.5 * s], position: [0, 0.8 * s, -200], material: pbr(C.trunk) }), `trunk${i}`);
  add(primitives.cone({ name: `leaf${i}`, size: [2.4 * s, 3.8 * s, 2.4 * s], position: [0, (1.6 + 1.9) * s, -200], material: pbr(C.leaf) }), `leaf${i}`);
}
for (let i = 0; i < HURDLE_POOL; i += 1) {
  add(primitives.box({ name: `hurdle${i}`, material: pbr(C.hurdle) }), `hurdle${i}`);
  add(primitives.box({ name: `cap${i}`, material: pbr(C.hurdleCap) }), `cap${i}`);
}

// runner (feet-origin, faces -z)
const HIP = 0.55;
const LEG = 0.55;
const ARM = 0.5;
add(primitives.box({ name: "torso", size: [0.5, 0.62, 0.3], position: [0, HIP + 0.31, 0], material: pbr(C.shirt) }), "torso");
add(primitives.box({ name: "pelvis", size: [0.46, 0.2, 0.28], position: [0, HIP + 0.02, 0], material: pbr(C.shorts) }), "pelvis");
add(primitives.sphere({ name: "head", size: 0.38, position: [0, HIP + 0.85, 0], material: pbr(C.skin) }), "head");
add(primitives.box({ name: "legL", size: [0.18, LEG, 0.2], position: [-0.13, HIP - LEG / 2, 0], material: pbr(C.shoes) }), "legL");
add(primitives.box({ name: "legR", size: [0.18, LEG, 0.2], position: [0.13, HIP - LEG / 2, 0], material: pbr(C.shoes) }), "legR");
add(primitives.box({ name: "armL", size: [0.14, ARM, 0.14], position: [-0.34, HIP + 0.55, 0], material: pbr(C.skin) }), "armL");
add(primitives.box({ name: "armR", size: [0.14, ARM, 0.14], position: [0.34, HIP + 0.55, 0], material: pbr(C.skin) }), "armR");
add(primitives.cylinder({ name: "blob", size: [0.9, 0.02, 0.9], position: [0, 0.015, 0], material: pbr(C.shadow), castShadow: false }), "blob");

stage = stage.camera(camera.perspective({ position: [0, 3.4, CAMERA_Z], target: [0, 0.9, -9], fov: 55 }));

// ---------------------------------------------------------------- game state
interface Hurdle {
  d: number;
  h: number;
  slot: number;
}

let rng = mulberry32(SEED);
let status: Status = "ready";
let distance = 0;
let best = 0;
let y = 0;
let vy = 0;
let airborne = false;
let runPhase = 0;
let hurdles: Hurdle[] = [];
let nextHurdleD = FIRST_HURDLE;
let nextHurdleH = 0;
let freeSlots: number[] = [];

function drawHurdleHeight(): number {
  return 0.4 + rng() * 0.75; // 0.4 to 1.15 m
}

function resetRun(): void {
  rng = mulberry32(SEED);
  status = "ready";
  distance = 0;
  y = 0;
  vy = 0;
  airborne = false;
  runPhase = 0;
  hurdles = [];
  freeSlots = Array.from({ length: HURDLE_POOL }, (_, i) => i);
  nextHurdleD = FIRST_HURDLE;
  nextHurdleH = drawHurdleHeight();
}

function spawnHurdles(): void {
  hurdles = hurdles.filter((hurdle) => {
    if (hurdle.d - distance >= -4) return true;
    freeSlots.push(hurdle.slot);
    return false;
  });
  while (nextHurdleD < SPAWN_AHEAD + distance && nextHurdleD < WIN_DISTANCE - 5) {
    const slot = freeSlots.pop();
    if (slot === undefined) return;
    hurdles.push({ d: nextHurdleD, h: nextHurdleH, slot });
    const gapSeconds = 1.15 + rng() * 1.2;
    nextHurdleD += gapSeconds * speedAt(nextHurdleD) + HURDLE_DEPTH;
    nextHurdleH = drawHurdleHeight();
  }
}

function endRun(next: "won" | "lost"): void {
  status = next;
  if (next === "won") distance = WIN_DISTANCE;
  best = Math.max(best, Math.floor(distance));
}

function stepSim(dt: number): void {
  if (status !== "playing") return;
  distance += speedAt(distance) * dt;
  if (airborne) {
    vy -= GRAVITY * dt;
    y += vy * dt;
    if (y <= 0) {
      y = 0;
      vy = 0;
      airborne = false;
    }
  } else {
    runPhase += dt * speedAt(distance) * 0.75;
  }
  for (const hurdle of hurdles) {
    const rel = hurdle.d - distance;
    if (Math.abs(rel) < HURDLE_DEPTH / 2 + RUNNER_HALF_DEPTH && y < hurdle.h) {
      endRun("lost");
      return;
    }
  }
  if (distance >= WIN_DISTANCE) endRun("won");
}

function jumpInput(): void {
  if (status === "won" || status === "lost") {
    resetRun();
    return;
  }
  if (status === "ready") status = "playing";
  if (!airborne) {
    airborne = true;
    vy = JUMP_VELOCITY;
    y = 0.0001;
  }
}

// ---------------------------------------------------------------- HUD (DOM, outside the canvas)
const hudStyle = document.createElement("style");
hudStyle.textContent = `
  #hud-root { position: absolute; left: 0; top: 0; width: 640px; height: 360px; pointer-events: none; font: 600 14px/1.3 system-ui, sans-serif; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.8); }
  #hud-bar { display: flex; gap: 18px; padding: 8px 12px; background: rgba(10,14,20,.55); }
  #hud-bar span b { font-variant-numeric: tabular-nums; }
  #hud-overlay { position: absolute; left: 0; right: 0; top: 90px; text-align: center; padding: 14px 0; background: rgba(10,14,20,.6); }
  #hud-overlay h1 { margin: 0 0 6px; font-size: 28px; }
  #hud-overlay p { margin: 0; font-weight: 500; }
  #hud-overlay.hidden { display: none; }
`;
document.head.appendChild(hudStyle);
const hudRoot = document.createElement("div");
hudRoot.id = "hud-root";
hudRoot.innerHTML = `
  <div id="hud-bar">
    <span>Distance: <b id="hud-distance">0</b> m</span>
    <span>Best: <b id="hud-best">0</b> m</span>
    <span>Status: <b id="hud-status">ready</b></span>
  </div>
  <div id="hud-overlay"><h1 id="hud-title"></h1><p id="hud-hint"></p></div>
`;
document.body.appendChild(hudRoot);
const elDistance = hudRoot.querySelector<HTMLElement>("#hud-distance");
const elBest = hudRoot.querySelector<HTMLElement>("#hud-best");
const elStatus = hudRoot.querySelector<HTMLElement>("#hud-status");
const elOverlay = hudRoot.querySelector<HTMLElement>("#hud-overlay");
const elTitle = hudRoot.querySelector<HTMLElement>("#hud-title");
const elHint = hudRoot.querySelector<HTMLElement>("#hud-hint");
let lastHud = "";

function renderHud(): void {
  const score = currentScore();
  const key = `${status}|${score}|${best}`;
  if (key === lastHud) return;
  lastHud = key;
  if (elDistance) elDistance.textContent = String(score);
  if (elBest) elBest.textContent = String(Math.max(best, status === "playing" ? score : 0));
  if (elStatus) elStatus.textContent = status;
  if (!elOverlay || !elTitle || !elHint) return;
  elOverlay.classList.toggle("hidden", status === "playing");
  if (status === "ready") {
    elTitle.textContent = "Hurdle Run";
    elHint.textContent = "Press Space / W / Up Arrow or click to start and jump";
  } else if (status === "lost") {
    elTitle.textContent = "Game over";
    elHint.textContent = `You hit a hurdle at ${score} m. Press R, Space or click to restart`;
  } else if (status === "won") {
    elTitle.textContent = "You win!";
    elHint.textContent = `Reached ${WIN_DISTANCE} m. Press R, Space or click to restart`;
  }
}

function currentScore(): number {
  return status === "won" ? WIN_DISTANCE : Math.floor(distance);
}

function publishState(): void {
  window.__TASK_STATE__ = {
    status,
    score: currentScore(),
    speed: status === "playing" ? speedAt(distance) : 0,
    airborne
  };
}

// ---------------------------------------------------------------- input
window.addEventListener("keydown", (event) => {
  if (event.code === "KeyR") {
    resetRun();
    publishState();
    renderHud();
    return;
  }
  if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") {
    event.preventDefault();
    if (event.repeat) return;
    jumpInput();
    publishState();
    renderHud();
  }
});
window.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  jumpInput();
  publishState();
  renderHud();
});

// ---------------------------------------------------------------- main
async function main(): Promise<void> {
  resetRun();
  publishState();
  renderHud();

  const app = createAuraApp("#app", {
    scene: stage,
    resize: false,
    ...looks.appOptions(LOOK_ID)
  });
  type NodeHandle = ReturnType<typeof app.nodes.require>;
  const node = (id: string): NodeHandle => app.nodes.require(id);

  const ring = (r: Ring, prefix: string, n: number): NodeHandle[] => Array.from({ length: n }, (_, i) => node(`${prefix}${i}`));
  const dashes = ring(DASH, "dash", DASH.count);
  const crosses = ring(CROSS, "cross", CROSS.count);
  const posts = ring(POST, "post", POST.count * 2);
  const trunks = ring(TREE, "trunk", TREE.count * 2);
  const leaves = ring(TREE, "leaf", TREE.count * 2);
  const hurdleBody = ring(DASH, "hurdle", HURDLE_POOL);
  const hurdleCap = ring(DASH, "cap", HURDLE_POOL);
  const torso = node("torso");
  const pelvis = node("pelvis");
  const head = node("head");
  const legL = node("legL");
  const legR = node("legR");
  const armL = node("armL");
  const armR = node("armR");
  const blob = node("blob");

  const wrapZ = (r: Ring, i: number): number => {
    const span = r.spacing * r.count;
    const rel = (((i * r.spacing - distance) % span) + span) % span;
    return 6 - rel;
  };

  const swingLimb = (limb: NodeHandle, x: number, hipY: number, length: number, angle: number): void => {
    limb.setPosition(x, hipY - (length / 2) * Math.cos(angle), -(length / 2) * Math.sin(angle));
    limb.setRotation(angle, 0, 0);
  };

  const applyFrame = (): void => {
    for (let i = 0; i < dashes.length; i += 1) dashes[i]?.setPosition(0, 0.012, wrapZ(DASH, i));
    for (let i = 0; i < crosses.length; i += 1) crosses[i]?.setPosition(0, 0.008, wrapZ(CROSS, i));
    for (let i = 0; i < posts.length; i += 1) {
      const side = i < POST.count ? -1 : 1;
      posts[i]?.setPosition(side * 3.1, 0.65, wrapZ(POST, i % POST.count));
    }
    for (let i = 0; i < trunks.length; i += 1) {
      const side = i < TREE.count ? -1 : 1;
      const s = treeScales[i] ?? 1;
      const x = side * (treeOffsets[i] ?? 6);
      const z = wrapZ(TREE, i % TREE.count) - (side > 0 ? TREE.spacing / 2 : 0);
      trunks[i]?.setPosition(x, 0.8 * s, z);
      leaves[i]?.setPosition(x, 3.5 * s, z);
    }

    const active = new Set<number>();
    for (const hurdle of hurdles) {
      active.add(hurdle.slot);
      const z = -(hurdle.d - distance);
      const body = hurdleBody[hurdle.slot];
      const cap = hurdleCap[hurdle.slot];
      body?.setVisible(true);
      cap?.setVisible(true);
      body?.setScale([HURDLE_WIDTH, hurdle.h, HURDLE_DEPTH]);
      body?.setPosition(0, hurdle.h / 2, z);
      cap?.setScale([HURDLE_WIDTH + 0.2, 0.14, HURDLE_DEPTH + 0.1]);
      cap?.setPosition(0, hurdle.h + 0.07, z);
    }
    for (let slot = 0; slot < HURDLE_POOL; slot += 1) {
      if (active.has(slot)) continue;
      hurdleBody[slot]?.setVisible(false);
      hurdleCap[slot]?.setVisible(false);
    }

    // runner
    const bob = status === "playing" && !airborne ? Math.abs(Math.sin(runPhase)) * 0.06 : 0;
    const base = y + bob;
    torso.setPosition(0, base + HIP + 0.31, 0);
    torso.setRotation(status === "playing" ? -0.12 : 0, 0, 0);
    pelvis.setPosition(0, base + HIP + 0.02, 0);
    head.setPosition(0, base + HIP + 0.85, -0.03);
    let legAngle = 0;
    let armAngle = 0;
    if (status === "ready") {
      legAngle = 0;
      armAngle = 0;
    } else if (airborne) {
      legAngle = 0.9;
      armAngle = -1.2;
    } else if (status === "playing") {
      legAngle = Math.sin(runPhase) * 0.9;
      armAngle = -Math.sin(runPhase) * 0.9;
    }
    const opposite = airborne ? -0.5 : -legAngle;
    swingLimb(legL, -0.13, base + HIP, LEG, legAngle);
    swingLimb(legR, 0.13, base + HIP, LEG, opposite);
    swingLimb(armL, -0.34, base + HIP + 0.8, ARM, armAngle);
    swingLimb(armR, 0.34, base + HIP + 0.8, ARM, airborne ? -1.2 : -armAngle);
    const shadowScale = Math.max(0.35, 1 - y * 0.3);
    blob.setScale([shadowScale, 1, shadowScale]);
    blob.setPosition(0, 0.015, 0);
  };

  let accumulator = 0;
  let firstFrameDone = false;
  app.onFrame((frame) => {
    const dt = Math.min(0.1, Math.max(0, frame.dt));
    accumulator += dt;
    while (accumulator >= SIM_STEP) {
      stepSim(SIM_STEP);
      accumulator -= SIM_STEP;
    }
    spawnHurdles();
    applyFrame();
    publishState();
    renderHud();
    if (!firstFrameDone) {
      firstFrameDone = true;
      // the engine draws this frame right after the callback; flag readiness once it has presented
      requestAnimationFrame(() => {
        window.__TASK_READY__ = true;
      });
    }
  });

  await app.ready();
}

main().catch((error: unknown) => {
  console.error("runner failed to start", error);
});
