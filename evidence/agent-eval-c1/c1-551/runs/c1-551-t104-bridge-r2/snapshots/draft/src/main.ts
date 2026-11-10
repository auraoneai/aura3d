import {
  camera,
  createAuraApp,
  instances,
  looks,
  material,
  primitives,
  scene,
  type AuraTransformSpec
} from "@aura3d/engine";

type Status = "playing" | "won" | "lost";

declare global {
  interface Window {
    __TASK_STATE__?: { status: Status; score: number; height: number };
    __TASK_READY__?: boolean;
    __EVAL_READY__?: boolean;
  }
}

const SLAB_H = 0.4;
const DEPTH = 3;
const BASE_W = 3;
const RANGE = 3.6; // moving slab center travels in [-RANGE, RANGE]
const WIN_HEIGHT = 25;
const PERFECT_TOL = 0.1;
const BASE_SPEED = 2.4;
const SPEED_STEP = 0.35;
const LEVELS_PER_STEP = 3;
const MAX_SPEED = 7.5;

const MAX_PLACED = WIN_HEIGHT + 2;
const MAX_FALLING = 24;
const POOL = MAX_PLACED + 1 + MAX_FALLING;

interface Slab { x: number; w: number; level: number }
interface Piece { x: number; y: number; w: number; vx: number; vy: number; rot: number; vr: number; level: number }

let placed: Slab[] = [];
let falling: Piece[] = [];
let moving: Slab = { x: -RANGE, w: BASE_W, level: 1 };
let dir = 1;
let status: Status = "playing";
let score = 0;
let best = 0;
let message = "";
let messageTimer = 0;
let camY = 0;

function slabY(level: number): number {
  return level * SLAB_H + SLAB_H / 2;
}

function hex(n: number): string {
  return Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, "0");
}

// level -> color, hue drifts slowly so neighbours look alike
function levelColor(level: number): string {
  const h = ((level * 11) % 360) / 60;
  const s = 0.6;
  const l = 0.55;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = l - c / 2;
  const sector = Math.floor(h) % 6;
  const rgb: [number, number, number][] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]
  ];
  const [r, g, b] = rgb[sector]!;
  return `#${hex(r + m)}${hex(g + m)}${hex(b + m)}`;
}

function speedFor(level: number): number {
  return Math.min(MAX_SPEED, BASE_SPEED + Math.floor((level - 1) / LEVELS_PER_STEP) * SPEED_STEP);
}

function height(): number {
  return placed.length - 1;
}

function syncState(): void {
  window.__TASK_STATE__ = { status, score, height: height() };
}

const HIDDEN: AuraTransformSpec = { position: [0, -200, 0], scale: [0.001, 0.001, 0.001] };
const initial: AuraTransformSpec[] = Array.from({ length: POOL }, () => HIDDEN);
const initialColors: string[] = Array.from({ length: POOL }, () => "#888888");

const app = createAuraApp("#app", {
  scene: scene({ background: "#1b2236" })
    .add(looks.preset("product-studio", { exposureEv: -0.6 }))
    .add(
      primitives.plane({
        name: "floor",
        size: [60, 1, 60],
        material: material.pbr({ color: "#2a3350", roughness: 0.95 })
      })
    )
    .add(
      instances
        .box({
          name: "slabs",
          transforms: initial,
          colors: initialColors,
          material: material.pbr({ color: "#ffffff", roughness: 0.5 })
        })
        .runtime({ id: "slabs", mutable: true })
    )
    .camera(camera.perspective({ position: [7, 5, 10], target: [0, 1, 0], fov: 40 })),
  ...looks.appOptions("product-studio")
});

function reset(): void {
  placed = [{ x: 0, w: BASE_W, level: 0 }];
  falling = [];
  moving = { x: -RANGE, w: BASE_W, level: 1 };
  dir = 1;
  status = "playing";
  score = 0;
  message = "";
  messageTimer = 0;
  syncState();
}

function addFalling(x: number, w: number, level: number, vx: number): void {
  falling.push({ x, y: slabY(level), w, vx, vy: 0, rot: 0, vr: vx * 0.6, level });
  if (falling.length > MAX_FALLING) falling.shift();
}

function drop(): void {
  if (status !== "playing") return;
  const top = placed[placed.length - 1]!;
  const lvl = moving.level;
  const delta = moving.x - top.x;
  const overlap = moving.w - Math.abs(delta);

  if (overlap <= 0) {
    addFalling(moving.x, moving.w, lvl, dir * 0.8);
    status = "lost";
    message = "Missed!";
    messageTimer = 99;
    best = Math.max(best, score);
    syncState();
    return;
  }

  if (Math.abs(delta) <= PERFECT_TOL) {
    placed.push({ x: top.x, w: top.w, level: lvl });
    score += 2; // slab + perfect bonus
    message = "Perfect! +1";
    messageTimer = 1.2;
  } else {
    const newX = (Math.max(moving.x - moving.w / 2, top.x - top.w / 2) + Math.min(moving.x + moving.w / 2, top.x + top.w / 2)) / 2;
    placed.push({ x: newX, w: overlap, level: lvl });
    const cutW = moving.w - overlap;
    const sign = Math.sign(delta) || 1;
    const cutX = moving.x + sign * (moving.w / 2 - cutW / 2);
    addFalling(cutX, cutW, lvl, sign * 1.5);
    score += 1;
    message = "";
  }
  best = Math.max(best, score);

  if (height() >= WIN_HEIGHT) {
    status = "won";
    message = "You win!";
    messageTimer = 99;
    syncState();
    return;
  }
  const last = placed[placed.length - 1]!;
  moving = { x: dir > 0 ? RANGE : -RANGE, w: last.w, level: lvl + 1 };
  dir = -dir;
  syncState();
}

function action(): void {
  if (status === "playing") drop();
  else reset();
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) drop();
  } else if (e.code === "KeyR") {
    reset();
  }
});
const canvas = document.querySelector<HTMLCanvasElement>("#app")!;
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  action();
});

// HUD (DOM, outside the canvas)
const hud = document.createElement("div");
hud.style.cssText =
  "width:640px;box-sizing:border-box;padding:6px 10px;display:flex;gap:18px;font:14px system-ui,sans-serif;background:#10141f;color:#fff";
hud.innerHTML =
  '<span>Score: <b id="hud-score">0</b></span><span>Best: <b id="hud-best">0</b></span>' +
  '<span>Status: <b id="hud-status">playing</b></span><span id="hud-msg" style="color:#ffd166"></span>' +
  '<span style="margin-left:auto;opacity:.6">Space/click: drop · R: restart</span>';
canvas.insertAdjacentElement("afterend", hud);
const elScore = hud.querySelector("#hud-score")!;
const elBest = hud.querySelector("#hud-best")!;
const elStatus = hud.querySelector("#hud-status")!;
const elMsg = hud.querySelector("#hud-msg")!;

function updateHud(): void {
  elScore.textContent = String(score);
  elBest.textContent = String(best);
  elStatus.textContent = status;
  elMsg.textContent = message;
}

let readyFlagged = false;

function frame(dt: number): void {
  dt = Math.min(dt, 0.05);

  if (status === "playing") {
    moving.x += dir * speedFor(moving.level) * dt;
    if (moving.x > RANGE) {
      moving.x = RANGE;
      dir = -1;
    } else if (moving.x < -RANGE) {
      moving.x = -RANGE;
      dir = 1;
    }
  }

  for (const p of falling) {
    p.vy -= 18 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
  }
  falling = falling.filter((p) => p.y > camY - 25);

  if (messageTimer > 0 && messageTimer < 50) {
    messageTimer -= dt;
    if (messageTimer <= 0) message = "";
  }

  // camera follows the tower top
  const topLevel = status === "playing" ? moving.level : placed.length - 1;
  const targetY = slabY(topLevel) - 1.2;
  camY += (targetY - camY) * Math.min(1, dt * 4);
  app.camera?.setPose({
    position: [6.5, camY + 5, 10],
    target: [0, camY, 0],
    fov: 40
  });

  // instances
  const transforms: AuraTransformSpec[] = [];
  const colors: string[] = [];
  const push = (t: AuraTransformSpec, c: string): void => {
    transforms.push(t);
    colors.push(c);
  };
  for (const s of placed) {
    push({ position: [s.x, slabY(s.level), 0], scale: [s.w, SLAB_H, DEPTH] }, levelColor(s.level));
  }
  if (status === "playing") {
    push({ position: [moving.x, slabY(moving.level), 0], scale: [moving.w, SLAB_H, DEPTH] }, levelColor(moving.level));
  }
  for (const p of falling) {
    push(
      { position: [p.x, p.y, 0], rotation: [0, 0, p.rot], scale: [p.w, SLAB_H, DEPTH] },
      levelColor(p.level)
    );
  }
  while (transforms.length < POOL) push(HIDDEN, "#888888");
  app.nodes.require("slabs").setInstances(transforms, colors);

  updateHud();

  if (!readyFlagged) {
    readyFlagged = true;
    requestAnimationFrame(() => {
      window.__TASK_READY__ = true;
      window.__EVAL_READY__ = true;
    });
  }
}

reset();
let last = performance.now();
function loop(now: number): void {
  const dt = (now - last) / 1000;
  last = now;
  frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
void app.ready();
