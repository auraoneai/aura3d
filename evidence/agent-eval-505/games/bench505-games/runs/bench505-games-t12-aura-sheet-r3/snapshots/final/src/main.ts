import {
  camera,
  createAuraApp,
  environments,
  instances,
  lights,
  material,
  primitives,
  scene,
  type AuraTransformSpec
} from "@aura3d/engine";

type Status = "playing" | "won" | "lost";

declare global {
  interface Window {
    __TASK_READY__?: boolean;
    __TASK_STATE__?: { status: Status; score: number; height: number };
  }
}

// ---- constants -------------------------------------------------------------
const SLAB_H = 1;
const SLAB_D = 6;
const BASE_W = 6;
const RANGE = 7; // moving slab centre travels between -RANGE and RANGE
const PERFECT_TOL = 0.25;
const WIN_HEIGHT = 25;
const TOWER_CAP = WIN_HEIGHT + 2; // base + 25 + moving slab
const FALL_CAP = 48;
const GRAVITY = 28;
const CAM_FOV = 40;

interface Slab {
  x: number;
  w: number;
  level: number;
}
interface Piece {
  x: number;
  y: number;
  w: number;
  vx: number;
  vy: number;
  rz: number;
  vrz: number;
  level: number;
}

const colorOf = (level: number): string => `hsl(${(210 + level * 11) % 360}, 68%, ${54 + Math.round(Math.sin(level * 0.35) * 6)}%)`;
const speedFor = (stacked: number): number => 4 + Math.floor(stacked / 3) * 0.8;

// ---- game state ------------------------------------------------------------
let tower: Slab[] = [];
let moving: Slab = { x: 0, w: BASE_W, level: 1 };
let phase = -Math.PI / 2;
let pieces: Piece[] = [];
let status: Status = "playing";
let score = 0;
let best = 0;
let stacked = 0;
let camY = 1;

// ---- HUD -------------------------------------------------------------------
const canvas = document.querySelector<HTMLCanvasElement>("#app");
if (!canvas) throw new Error("#app canvas not found");
const hud = document.createElement("div");
hud.id = "hud";
hud.style.cssText = "font:14px/1.5 system-ui,sans-serif;padding:6px 10px;color:#fff;background:#111;width:620px;display:flex;gap:18px;";
const hudScore = document.createElement("span");
const hudBest = document.createElement("span");
const hudStatus = document.createElement("span");
const hudHint = document.createElement("span");
hudHint.style.cssText = "margin-left:auto;opacity:.65";
hudHint.textContent = "Space / click: drop. R: restart";
hud.append(hudScore, hudBest, hudStatus, hudHint);
canvas.insertAdjacentElement("afterend", hud);

const publish = (): void => {
  best = Math.max(best, score);
  window.__TASK_STATE__ = { status, score, height: stacked };
  hudScore.textContent = `Score: ${score}`;
  hudBest.textContent = `Best: ${best}`;
  hudStatus.textContent = `Status: ${status}`;
};

const startRound = (): void => {
  tower = [{ x: 0, w: BASE_W, level: 0 }];
  moving = { x: -RANGE, w: BASE_W, level: 1 };
  phase = -Math.PI / 2;
  pieces = [];
  status = "playing";
  score = 0;
  stacked = 0;
  publish();
};

const spawnPiece = (x: number, level: number, w: number, towerIndex: number, dir: number): void => {
  pieces.push({ x, y: towerIndex * SLAB_H + SLAB_H / 2, w, vx: dir * 2.5, vy: 0, rz: 0, vrz: -dir * 1.6, level });
  if (pieces.length > FALL_CAP) pieces.shift();
};

const drop = (): void => {
  if (status !== "playing") return;
  const top = tower[tower.length - 1]!;
  const index = tower.length; // y index of the slab being placed
  const dx = moving.x - top.x;
  const half = moving.w / 2;
  const topHalf = top.w / 2;
  const left = Math.max(moving.x - half, top.x - topHalf);
  const right = Math.min(moving.x + half, top.x + topHalf);
  const overlap = right - left;

  if (overlap <= 0) {
    spawnPiece(moving.x, moving.level, moving.w, index, dx >= 0 ? 1 : -1);
    status = "lost";
    publish();
    return;
  }

  let placed: Slab;
  if (Math.abs(dx) <= PERFECT_TOL) {
    placed = { x: top.x, w: top.w, level: moving.level };
    score += 1; // bonus
  } else {
    placed = { x: (left + right) / 2, w: overlap, level: moving.level };
    const cutW = moving.w - overlap;
    const dir = dx >= 0 ? 1 : -1;
    const cutX = dir > 0 ? right + cutW / 2 : left - cutW / 2;
    spawnPiece(cutX, moving.level, cutW, index, dir);
  }
  tower.push(placed);
  stacked += 1;
  score += 1;

  if (stacked >= WIN_HEIGHT) {
    status = "won";
  } else {
    moving = { x: 0, w: placed.w, level: moving.level + 1 };
    phase = stacked % 2 === 0 ? -Math.PI / 2 : Math.PI / 2;
    moving.x = RANGE * Math.sin(phase);
  }
  publish();
};

window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.key === " ") {
    e.preventDefault();
    if (!e.repeat) drop();
  } else if (e.key === "r" || e.key === "R") {
    startRound();
  }
});
canvas.addEventListener("click", () => {
  if (status === "playing") drop();
  else startRound();
});

// ---- scene -----------------------------------------------------------------
const hidden: AuraTransformSpec = { position: [0, -1000, 0], scale: [0.001, 0.001, 0.001] };
const initTransforms = (n: number): AuraTransformSpec[] => Array.from({ length: n }, () => hidden);
const initColors = (n: number): string[] => Array.from({ length: n }, () => "#ffffff");
const white = material.pbr({ color: "#ffffff", roughness: 0.55, metallic: 0.05 });

const camPos = (y: number): [number, number, number] => [12, y + 9, 22];
const camTarget = (y: number): [number, number, number] => [0, y, 0];

startRound();

const sc = scene({ background: "#1b2236" })
  .camera(camera.perspective({ position: camPos(camY), target: camTarget(camY), fov: CAM_FOV, near: 0.5, far: 220 }))
  .add(environments.neutral({ intensity: 0.6, background: false }))
  .add(lights.hemisphere({ skyColor: "#dbe6ff", groundColor: "#3a3f55", intensity: 0.9 }))
  .add(lights.directional({ position: [10, 30, 16], target: [0, 0, 0], intensity: 2.4 }))
  .add(primitives.plane({ name: "ground", size: [120, 1, 120], material: material.pbr({ color: "#2a3048", roughness: 1 }) }).position(0, -0.01, 0))
  .add(
    instances
      .box({ name: "slabs", transforms: initTransforms(TOWER_CAP), colors: initColors(TOWER_CAP), material: white })
      .runtime({ id: "slabs", mutable: true })
  )
  .add(
    instances
      .box({ name: "pieces", transforms: initTransforms(FALL_CAP), colors: initColors(FALL_CAP), material: white })
      .runtime({ id: "pieces", mutable: true })
  );

const app = createAuraApp("#app", { scene: sc });
const slabsNode = app.nodes.require("slabs");
const piecesNode = app.nodes.require("pieces");
slabsNode.frustumCulled = false;
piecesNode.frustumCulled = false;

const slabTransform = (s: Slab, y: number): AuraTransformSpec => ({
  position: [s.x, y * SLAB_H + SLAB_H / 2, 0],
  scale: [s.w, SLAB_H, SLAB_D]
});

app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.05);

  if (status === "playing") {
    phase += (speedFor(stacked) / RANGE) * dt;
    moving.x = RANGE * Math.sin(phase);
  }

  // falling pieces
  for (const p of pieces) {
    p.vy -= GRAVITY * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rz += p.vrz * dt;
  }
  pieces = pieces.filter((p) => p.y > camY - 40);

  // slabs
  const slabT: AuraTransformSpec[] = [];
  const slabC: string[] = [];
  tower.forEach((s, i) => {
    slabT.push(slabTransform(s, i));
    slabC.push(colorOf(s.level));
  });
  if (status === "playing") {
    slabT.push(slabTransform(moving, tower.length));
    slabC.push(colorOf(moving.level));
  }
  while (slabT.length < TOWER_CAP) {
    slabT.push(hidden);
    slabC.push("#ffffff");
  }
  slabsNode.setInstances(slabT, slabC);

  const pT: AuraTransformSpec[] = [];
  const pC: string[] = [];
  for (const p of pieces) {
    pT.push({ position: [p.x, p.y, 0], rotation: [0, 0, p.rz], scale: [p.w, SLAB_H, SLAB_D] });
    pC.push(colorOf(p.level));
  }
  while (pT.length < FALL_CAP) {
    pT.push(hidden);
    pC.push("#ffffff");
  }
  piecesNode.setInstances(pT, pC);

  // camera follows the tower top
  const goal = tower.length * SLAB_H + 1;
  camY += (goal - camY) * Math.min(1, dt * 4);
  app.camera?.setPose(
    { position: camPos(camY), target: camTarget(camY), up: [0, 1, 0], roll: 0, fov: CAM_FOV, near: 0.5, far: 220 },
    { cut: true }
  );
});

await app.ready();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__TASK_READY__ = true;
  });
});
