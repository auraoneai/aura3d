import { camera, createAuraApp, instances, looks, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

type Status = "playing" | "won" | "lost";

interface Slab { x: number; w: number; color: string }
interface Piece { x: number; y: number; w: number; vx: number; vy: number; rot: number; vr: number; color: string }

declare global {
  interface Window {
    __TASK_STATE__: { status: Status; score: number; height: number };
    __TASK_READY__?: boolean;
    __EVAL_READY__?: boolean;
  }
}

const H = 0.4; // slab thickness
const DEPTH = 3; // slab depth (z)
const BASE_W = 3;
const RANGE = 2.6; // slide amplitude
const PERFECT_TOL = 0.1;
const WIN_HEIGHT = 25;
const POOL = 96;
const GRAVITY = 14;

const levelColor = (level: number): string => `hsl(${(200 + level * 13) % 360}, 70%, ${56 + (level % 2) * 0}%)`;
const levelSpeed = (height: number): number => 1.5 + 0.2 * Math.floor(height / 3);

const game = {
  stack: [] as Slab[], // stack[0] is the base slab
  pieces: [] as Piece[],
  status: "playing" as Status,
  score: 0,
  best: 0,
  phase: 0,
  movingW: BASE_W,
  camY: 0,
  lastDropAt: 0
};

const hudScore = document.getElementById("hud-score");
const hudBest = document.getElementById("hud-best");
const hudStatus = document.getElementById("hud-status");

const height = (): number => game.stack.length - 1;
const slabY = (index: number): number => H / 2 + index * H;

function publish(): void {
  game.best = Math.max(game.best, game.score);
  window.__TASK_STATE__ = { status: game.status, score: game.score, height: height() };
  if (hudScore) hudScore.textContent = String(game.score);
  if (hudBest) hudBest.textContent = String(game.best);
  if (hudStatus) hudStatus.textContent = game.status;
}

function restart(): void {
  game.stack = [{ x: 0, w: BASE_W, color: levelColor(0) }];
  game.pieces = [];
  game.status = "playing";
  game.score = 0;
  game.phase = 0;
  game.movingW = BASE_W;
  publish();
}

const movingX = (): number => RANGE * Math.sin(game.phase);

function spawnPiece(x: number, y: number, w: number, dir: number, color: string): void {
  game.pieces.push({ x, y, w, vx: dir * 1.2, vy: 0, rot: 0, vr: -dir * 1.4, color });
  if (game.pieces.length > 40) game.pieces.shift();
}

function drop(): void {
  if (game.status !== "playing") return;
  const top = game.stack[game.stack.length - 1]!;
  const level = game.stack.length;
  const y = slabY(level);
  const color = levelColor(level);
  const x = movingX();
  const w = game.movingW;

  const left = Math.max(x - w / 2, top.x - top.w / 2);
  const right = Math.min(x + w / 2, top.x + top.w / 2);
  const overlap = right - left;

  if (overlap <= 0) {
    spawnPiece(x, y, w, x >= top.x ? 1 : -1, color);
    game.status = "lost";
    publish();
    return;
  }

  if (Math.abs(x - top.x) <= PERFECT_TOL) {
    game.stack.push({ x: top.x, w: top.w, color });
    game.movingW = top.w;
    game.score += 2; // slab + perfect bonus
  } else {
    const cx = (left + right) / 2;
    game.stack.push({ x: cx, w: overlap, color });
    game.movingW = overlap;
    game.score += 1;
    const cutW = w - overlap;
    if (x > top.x) spawnPiece(right + cutW / 2, y, cutW, 1, color);
    else spawnPiece(left - cutW / 2, y, cutW, -1, color);
  }
  if (height() >= WIN_HEIGHT) game.status = "won";
  publish();
}

const hidden: AuraTransformSpec = { position: [0, -1000, 0], scale: 0.001 };
const initialTransforms: AuraTransformSpec[] = Array.from({ length: POOL }, () => hidden);
const initialColors: string[] = Array.from({ length: POOL }, () => "#ffffff");

const app = createAuraApp("#app", {
  scene: scene()
    .add(looks.preset("outdoor-day", { exposureEv: -0.8 }))
    .add(primitives.plane({ name: "floor", size: [60, 1, 60], material: material.pbr({ color: "#3a4256", roughness: 0.95 }) }))
    .add(
      instances
        .box({
          name: "slabs",
          transforms: initialTransforms,
          colors: initialColors,
          material: material.pbr({ color: "#ffffff", roughness: 0.45 })
        })
        .runtime({ id: "slabs", mutable: true })
    )
    .camera(camera.perspective({ position: [6, 3.5, 9], target: [0, 0.8, 0], fov: 40 })),
  ...looks.appOptions("outdoor-day")
});

const transforms: AuraTransformSpec[] = initialTransforms.slice();
const colors: string[] = initialColors.slice();

function updateScene(): void {
  let n = 0;
  const put = (x: number, y: number, w: number, rot: number, color: string): void => {
    if (n >= POOL) return;
    transforms[n] = { position: [x, y, 0], scale: [w, H, DEPTH], rotation: [0, 0, rot] };
    colors[n] = color;
    n += 1;
  };
  game.stack.forEach((s, i) => put(s.x, slabY(i), s.w, 0, s.color));
  if (game.status === "playing") put(movingX(), slabY(game.stack.length), game.movingW, 0, levelColor(game.stack.length));
  for (const p of game.pieces) put(p.x, p.y, p.w, p.rot, p.color);
  for (; n < POOL; n += 1) {
    transforms[n] = hidden;
    colors[n] = "#ffffff";
  }
  app.nodes.require("slabs").setInstances(transforms, colors);
}

let firstFrame = true;
app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.05);
  if (game.status === "playing") game.phase += levelSpeed(height()) * dt;

  for (const p of game.pieces) {
    p.vy -= GRAVITY * dt;
    p.y += p.vy * dt;
    p.x += p.vx * dt;
    p.rot += p.vr * dt;
  }
  game.pieces = game.pieces.filter((p) => p.y > -30);

  // Camera follows the top of the tower.
  const topY = game.stack.length * H + 0.4;
  const targetY = Math.max(topY - 1.2, 0.9);
  game.camY += (targetY - game.camY) * Math.min(1, dt * 4);
  app.camera?.setPose({ position: [6, game.camY + 2.6, 9.5], target: [0, game.camY, 0], fov: 40 });

  updateScene();

  if (firstFrame) {
    firstFrame = false;
    requestAnimationFrame(() => {
      window.__TASK_READY__ = true;
      window.__EVAL_READY__ = true;
    });
  }
});

const canvas = document.getElementById("app");
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) drop();
  } else if (e.code === "KeyR") {
    restart();
  }
});
canvas?.addEventListener("click", () => {
  if (game.status === "playing") drop();
  else restart();
});

restart();
game.camY = 0.9;
void app.ready();
