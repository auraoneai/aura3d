import { camera, createAuraApp, looks, material, primitives, scene } from "@aura3d/engine";

type Status = "playing" | "won" | "lost";

declare global {
  interface Window {
    __TASK_STATE__?: { status: Status; score: number; height: number };
    __TASK_READY__?: boolean;
    __EVAL_READY__?: boolean;
  }
}

// ---- tuning ----
const WIN_HEIGHT = 25;
const SLAB_H = 0.4;
const SLAB_D = 3;
const BASE_W = 3;
const RANGE = 3.6; // slide amplitude
const PERFECT_TOL = 0.12;
const PERFECT_BONUS = 1;
const BASE_OMEGA = 1.5; // rad/s
const LEVELS_PER_SPEEDUP = 3;
const SPEEDUP = 0.12;

const TOWER_POOL = WIN_HEIGHT + 2;
const FALL_POOL = 32;

// ---- state ----
interface Slab { x: number; w: number }
interface Piece { active: boolean; x: number; y: number; vx: number; vy: number; rz: number; vr: number; w: number; level: number }

const tower: Slab[] = [];
const pieces: Piece[] = Array.from({ length: FALL_POOL }, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, rz: 0, vr: 0, w: 1, level: 0 }));
let nextPiece = 0;
let status: Status = "playing";
let score = 0;
let best = 0;
let phase = Math.PI / 2;
let movingW = BASE_W;
let camY = 0;
let needsInit = true;
let lastFlash = "";
let ready = false;
const colorDirty: boolean[] = new Array(TOWER_POOL + FALL_POOL + 1).fill(true);

const height = (): number => tower.length - 1; // base slab is not counted
const levelColor = (level: number): string => `hsl(${(200 + level * 11) % 360}, 65%, ${52 + 6 * Math.sin(level * 0.35)}%)`;
const slabY = (level: number): number => level * SLAB_H + SLAB_H / 2;
const omega = (): number => BASE_OMEGA * (1 + SPEEDUP * Math.floor(Math.max(0, height()) / LEVELS_PER_SPEEDUP));
const movingX = (): number => RANGE * Math.sin(phase);

// ---- scene ----
const mat = () => material.pbr({ color: "#ffffff", roughness: 0.55 });
let sc = scene().add(looks.preset("outdoor-day", { exposureEv: -1 }));
sc = sc.add(primitives.plane({ name: "floor", size: [60, 1, 60], material: material.pbr({ color: "#2b3140", roughness: 1 }) }).position(0, -0.01, 0));
for (let i = 0; i < TOWER_POOL; i += 1) {
  sc = sc.add(primitives.box({ name: `slab${i}`, size: 1, material: mat() }).position(0, -50, 0).runtime({ id: `slab${i}`, mutable: true }));
}
sc = sc.add(primitives.box({ name: "mover", size: 1, material: mat() }).position(0, -50, 0).runtime({ id: "mover", mutable: true }));
for (let i = 0; i < FALL_POOL; i += 1) {
  sc = sc.add(primitives.box({ name: `piece${i}`, size: 1, material: mat() }).position(0, -50, 0).runtime({ id: `piece${i}`, mutable: true }));
}
sc = sc.camera(camera.perspective({ position: [7, 5, 9], target: [0, 1, 0], fov: 42 }));

const app = createAuraApp("#app", { scene: sc, ...looks.appOptions("outdoor-day") });

// ---- HUD (DOM, outside the canvas) ----
const canvas = document.getElementById("app") as HTMLCanvasElement;
const hud = document.createElement("div");
hud.id = "hud";
hud.style.cssText = "width:640px;box-sizing:border-box;padding:6px 10px;display:flex;justify-content:space-between;font:14px system-ui,sans-serif;background:#111;color:#fff";
hud.innerHTML = '<span>Score: <b id="hud-score">0</b></span><span>Best: <b id="hud-best">0</b></span><span>Status: <b id="hud-status">playing</b></span><span style="opacity:.6">Space / click = drop, R = restart</span>';
canvas.insertAdjacentElement("afterend", hud);
const elScore = document.getElementById("hud-score") as HTMLElement;
const elBest = document.getElementById("hud-best") as HTMLElement;
const elStatus = document.getElementById("hud-status") as HTMLElement;

function publish(): void {
  window.__TASK_STATE__ = { status, score, height: Math.max(0, height()) };
  elScore.textContent = String(score);
  elBest.textContent = String(best);
  elStatus.textContent = status;
}

// ---- game logic ----
function spawnPiece(x: number, w: number, level: number, dir: number): void {
  const p = pieces[nextPiece]!;
  nextPiece = (nextPiece + 1) % FALL_POOL;
  p.active = true; p.x = x; p.w = w; p.level = level; p.y = slabY(level);
  p.vx = dir * 1.5; p.vy = 0.5; p.rz = 0; p.vr = -dir * 1.6;
  colorDirty[TOWER_POOL + 1 + (pieces.indexOf(p))] = true;
}

function reset(): void {
  tower.length = 0;
  tower.push({ x: 0, w: BASE_W });
  for (const p of pieces) p.active = false;
  status = "playing";
  score = 0;
  movingW = BASE_W;
  phase = Math.PI / 2;
  colorDirty.fill(true);
  publish();
}

function drop(): void {
  if (status !== "playing") return;
  const top = tower[tower.length - 1]!;
  const level = tower.length;
  const x = movingX();
  const dx = x - top.x;
  const left = Math.max(x - movingW / 2, top.x - top.w / 2);
  const right = Math.min(x + movingW / 2, top.x + top.w / 2);
  const overlap = right - left;
  if (overlap <= 0) {
    spawnPiece(x, movingW, level, dx >= 0 ? 1 : -1);
    status = "lost";
    publish();
    return;
  }
  if (Math.abs(dx) <= PERFECT_TOL) {
    tower.push({ x: top.x, w: top.w });
    movingW = top.w;
    score += 1 + PERFECT_BONUS;
    lastFlash = "perfect";
  } else {
    const cx = (left + right) / 2;
    tower.push({ x: cx, w: overlap });
    const cutW = movingW - overlap;
    const dir = dx >= 0 ? 1 : -1;
    const cutCenter = dir > 0 ? right + cutW / 2 : left - cutW / 2;
    spawnPiece(cutCenter, cutW, level, dir);
    movingW = overlap;
    score += 1;
    lastFlash = "";
  }
  colorDirty[level] = true;
  if (height() >= WIN_HEIGHT) status = "won";
  best = Math.max(best, score);
  publish();
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") { e.preventDefault(); if (!e.repeat) drop(); }
  else if (e.code === "KeyR") reset();
});
canvas.addEventListener("click", () => {
  if (status === "playing") drop(); else reset();
});

// ---- per-frame ----
function step(dt: number): void {
  if (status === "playing") phase += omega() * dt;
  for (const p of pieces) {
    if (!p.active) continue;
    p.vy -= 22 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.rz += p.vr * dt;
    if (p.y < -12 + camY) p.active = false;
  }
  const topY = status === "won" ? slabY(tower.length - 1) : slabY(tower.length);
  const targetCam = Math.max(0, topY - 1.2);
  camY += (targetCam - camY) * Math.min(1, dt * 4);
}

function render(): void {
  for (let i = 0; i < TOWER_POOL; i += 1) {
    const n = app.nodes.require(`slab${i}`);
    const s = tower[i];
    if (!s) { n.setVisible(false); continue; }
    n.setVisible(true).setPosition(s.x, slabY(i), 0).setScale([s.w, SLAB_H, SLAB_D]);
    if (colorDirty[i]) { n.setColor?.(levelColor(i)); colorDirty[i] = false; }
  }
  const mover = app.nodes.require("mover");
  if (status === "playing") {
    const lvl = tower.length;
    mover.setVisible(true).setPosition(movingX(), slabY(lvl), 0).setScale([movingW, SLAB_H, SLAB_D]);
    if (colorDirty[TOWER_POOL]) { mover.setColor?.(levelColor(lvl)); }
    mover.setColor?.(levelColor(lvl));
    colorDirty[TOWER_POOL] = false;
  } else {
    mover.setVisible(false);
  }
  for (let i = 0; i < FALL_POOL; i += 1) {
    const n = app.nodes.require(`piece${i}`);
    const p = pieces[i]!;
    if (!p.active) { n.setVisible(false); continue; }
    n.setVisible(true).setPosition(p.x, p.y, 0).setRotation(0, 0, p.rz).setScale([p.w, SLAB_H, SLAB_D]);
    if (colorDirty[TOWER_POOL + 1 + i]) { n.setColor?.(levelColor(p.level)); colorDirty[TOWER_POOL + 1 + i] = false; }
  }
  app.camera?.setPose({ position: [7, camY + 5.2, 9.5], target: [0, camY + 1.2, 0], fov: 42 }, { cut: true });
}

reset();
app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.05);
  if (needsInit) needsInit = false;
  step(dt);
  render();
  if (!ready) {
    ready = true;
    requestAnimationFrame(() => {
      window.__TASK_READY__ = true;
      window.__EVAL_READY__ = true;
    });
  }
});
void app.ready();
void lastFlash;
