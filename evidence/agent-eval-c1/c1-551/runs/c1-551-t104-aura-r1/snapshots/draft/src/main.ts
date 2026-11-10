import { camera, createAuraApp, looks, material, primitives, scene } from "@aura3d/engine";

type Status = "playing" | "won" | "lost";

declare global {
  interface Window {
    __TASK_STATE__?: { status: Status; score: number; height: number };
    __TASK_READY__?: boolean;
    __EVAL_READY__?: boolean;
  }
}

const SLAB_H = 0.5;
const DEPTH = 3;
const BASE_W = 3;
const SWING = 3.2;
const PERFECT_TOL = 0.1;
const WIN_HEIGHT = 25;
const POOL_STACK = WIN_HEIGHT + 1;
const POOL_DEBRIS = 24;

const hue = (level: number): string => `hsl(${(200 + level * 13) % 360}, 65%, 55%)`;

// Scene: a fixed pool of unit boxes that the game scales, moves and recolours.
let sceneBuilder = scene()
  .add(looks.preset("product-studio", { exposureEv: -1 }))
  .add(primitives.plane({ name: "floor", size: [60, 1, 60], material: material.pbr({ color: "#2a2f3a", roughness: 0.9 }) }));
const pooled = (id: string) =>
  primitives
    .box({ name: id, size: 1, material: material.pbr({ color: "#888888", roughness: 0.5 }) })
    .position(0, -50, 0)
    .runtime({ id, mutable: true });
for (let i = 0; i < POOL_STACK; i += 1) sceneBuilder = sceneBuilder.add(pooled(`s${i}`));
sceneBuilder = sceneBuilder.add(pooled("mv"));
for (let i = 0; i < POOL_DEBRIS; i += 1) sceneBuilder = sceneBuilder.add(pooled(`d${i}`));

const app = createAuraApp("#app", {
  scene: sceneBuilder.camera(camera.perspective({ position: [7, 5, 9], target: [0, 1, 0], fov: 40 })),
  ...looks.appOptions("product-studio")
});

interface Slab { cx: number; w: number }
interface Debris { alive: boolean; x: number; y: number; w: number; vx: number; vy: number; rz: number; vr: number; level: number }

const stack: Slab[] = [];
const debris: Debris[] = Array.from({ length: POOL_DEBRIS }, () => ({ alive: false, x: 0, y: 0, w: 1, vx: 0, vy: 0, rz: 0, vr: 0, level: 0 }));
let nextDebris = 0;
let status: Status = "playing";
let score = 0;
let best = 0;
let phase = 0;
let camY = 1;
let hudShown = "";

const hudScore = document.getElementById("hud-score");
const hudBest = document.getElementById("hud-best");
const hudStatus = document.getElementById("hud-status");

const height = (): number => stack.length - 1;
const slabY = (level: number): number => level * SLAB_H + SLAB_H / 2;
const omega = (): number => 1.6 * (1 + 0.12 * Math.floor(height() / 3));

function publish(): void {
  window.__TASK_STATE__ = { status, score, height: height() };
  const key = `${score}|${best}|${status}`;
  if (key !== hudShown) {
    hudShown = key;
    if (hudScore) hudScore.textContent = String(score);
    if (hudBest) hudBest.textContent = String(best);
    if (hudStatus) hudStatus.textContent = status;
  }
}

function placeStack(level: number): void {
  const s = stack[level];
  const n = app.nodes.require(`s${level}`);
  if (!s) {
    n.setPosition(0, -50, 0);
    return;
  }
  n.setScale([s.w, SLAB_H, DEPTH]).setPosition(s.cx, slabY(level), 0).setColor?.(hue(level));
}

function spawnDebris(x: number, y: number, w: number, level: number, dir: number): void {
  const d = debris[nextDebris]!;
  nextDebris = (nextDebris + 1) % POOL_DEBRIS;
  d.alive = true;
  d.x = x; d.y = y; d.w = w; d.level = level;
  d.vx = dir * 1.2; d.vy = 0.5; d.rz = 0; d.vr = -dir * 1.5;
  app.nodes.require(`d${debris.indexOf(d)}`).setColor?.(hue(level)).setScale([w, SLAB_H, DEPTH]);
}

function reset(): void {
  stack.length = 0;
  stack.push({ cx: 0, w: BASE_W });
  status = "playing";
  score = 0;
  phase = 0;
  camY = 1;
  for (let i = 0; i < POOL_STACK; i += 1) placeStack(i);
  for (let i = 0; i < POOL_DEBRIS; i += 1) {
    debris[i]!.alive = false;
    app.nodes.require(`d${i}`).setPosition(0, -50, 0);
  }
  app.nodes.require("mv").setColor?.(hue(1));
  publish();
}

function drop(): void {
  if (status !== "playing") return;
  const top = stack[stack.length - 1]!;
  const level = stack.length;
  const mx = top.cx + SWING * Math.sin(phase);
  const dx = mx - top.cx;
  const adx = Math.abs(dx);
  const dir = dx >= 0 ? 1 : -1;

  if (adx >= top.w) {
    status = "lost";
    spawnDebris(mx, slabY(level), top.w, level, dir);
    best = Math.max(best, score);
    app.nodes.require("mv").setPosition(0, -50, 0);
    publish();
    return;
  }

  let slab: Slab;
  if (adx <= PERFECT_TOL) {
    slab = { cx: top.cx, w: top.w };
    score += 2; // 1 for the slab + 1 perfect bonus
  } else {
    const w = top.w - adx;
    const cx = top.cx + dx / 2;
    slab = { cx, w };
    const cutW = adx;
    const cutX = dx > 0 ? top.cx + top.w / 2 + cutW / 2 : top.cx - top.w / 2 - cutW / 2;
    spawnDebris(cutX, slabY(level), cutW, level, dir);
    score += 1;
  }
  stack.push(slab);
  placeStack(level);
  best = Math.max(best, score);
  if (height() >= WIN_HEIGHT) {
    status = "won";
    app.nodes.require("mv").setPosition(0, -50, 0);
  } else {
    app.nodes.require("mv").setColor?.(hue(level + 1));
  }
  publish();
}

function restart(): void {
  reset();
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) drop();
  } else if (e.code === "KeyR") {
    restart();
  }
});
const canvas = document.getElementById("app");
canvas?.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (status === "playing") drop();
  else restart();
});

reset();

let first = true;
app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.05);

  if (status === "playing") {
    phase += omega() * dt;
    const top = stack[stack.length - 1]!;
    const level = stack.length;
    app.nodes
      .require("mv")
      .setScale([top.w, SLAB_H, DEPTH])
      .setPosition(top.cx + SWING * Math.sin(phase), slabY(level), 0);
  }

  for (let i = 0; i < POOL_DEBRIS; i += 1) {
    const d = debris[i]!;
    if (!d.alive) continue;
    d.vy -= 14 * dt;
    d.y += d.vy * dt;
    d.x += d.vx * dt;
    d.rz += d.vr * dt;
    const n = app.nodes.require(`d${i}`);
    n.setPosition(d.x, d.y, 0).setRotation(0, 0, d.rz);
    if (d.y < -12) {
      d.alive = false;
      n.setPosition(0, -50, 0);
    }
  }

  // Camera rises with the tower.
  const topY = (stack.length + 1) * SLAB_H;
  const wantY = Math.max(1.2, topY - 1.2);
  camY += (wantY - camY) * Math.min(1, dt * 4);
  app.camera?.setPose({ position: [7, camY + 4.2, 9.5], target: [0, camY, 0], fov: 40 });

  if (first) {
    first = false;
    requestAnimationFrame(() => {
      window.__TASK_READY__ = true;
      window.__EVAL_READY__ = true;
    });
  }
});
void app.ready();
