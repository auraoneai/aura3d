import { camera, createAuraApp, looks, material, primitives, scene } from "@aura3d/engine";

type Status = "playing" | "won" | "lost";

declare global {
  interface Window {
    __TASK_STATE__: { status: Status; score: number; height: number };
    __TASK_READY__: boolean;
  }
}

// ---- tuning -------------------------------------------------------------
const WIN_HEIGHT = 25;
const SLAB_H = 0.4;
const SLAB_D = 3;
const BASE_W = 3;
const AMPLITUDE = 3.2;
const PERFECT_TOL = 0.08;
const POOL = WIN_HEIGHT + 1; // level 0 is the base slab

// ---- helpers ------------------------------------------------------------
function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): string => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Hue drifts gradually from level to level. */
function levelColor(level: number): string {
  return hslToHex((200 + level * 13) % 360, 0.68, 0.56);
}

function slabNode(id: string, level: number) {
  return primitives
    .box({
      name: id,
      size: [1, 1, 1],
      material: material.pbr({ color: levelColor(level), roughness: 0.45, metallic: 0.05 }),
      castShadow: true,
      receiveShadow: true
    })
    .position(0, -100, 0)
    .runtime({ id, mutable: true });
}

// ---- scene --------------------------------------------------------------
const cameraPos = (y: number): [number, number, number] => [5.5, y + 4.2, 10];

let sceneBuilder = scene()
  .add(looks.preset("product-studio"))
  .add(
    primitives
      .box({
        name: "floor",
        size: [12, 0.3, 9],
        material: material.pbr({ color: "#2b2f3a", roughness: 0.8 }),
        receiveShadow: true
      })
      .position(0, -0.15, 0)
  )
  .camera(camera.perspective({ position: cameraPos(1.2), target: [0, 1.2, 0], fov: 40 }));

for (let i = 0; i < POOL; i++) {
  sceneBuilder = sceneBuilder.add(slabNode(`slab-${i}`, i)).add(slabNode(`debris-${i}`, i));
}

const app = createAuraApp("#app", {
  scene: sceneBuilder,
  ...looks.appOptions("product-studio")
});

// ---- HUD (DOM, outside the canvas) ---------------------------------------
const hud = document.createElement("div");
hud.style.cssText = "width:640px;box-sizing:border-box;padding:6px 10px;display:flex;gap:18px;font:14px/1.4 system-ui,sans-serif;background:#111;color:#fff";
const scoreEl = document.createElement("span");
const bestEl = document.createElement("span");
const statusEl = document.createElement("span");
const helpEl = document.createElement("span");
helpEl.style.cssText = "margin-left:auto;opacity:0.65";
helpEl.textContent = "Space / click: drop. R: restart";
hud.append(scoreEl, bestEl, statusEl, helpEl);
document.body.appendChild(hud);

// ---- game state ---------------------------------------------------------
interface Debris {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
}

let status: Status = "playing";
let score = 0;
let best = 0;
let height = 0;
let topX = 0;
let topW = BASE_W;
let movingW = BASE_W;
let phase = -Math.PI / 2;
let camY = 1.2;
const debris: Debris[] = Array.from({ length: POOL }, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, w: 1 }));

function slab(i: number) {
  return app.nodes.require(`slab-${i}`);
}
function debrisNode(i: number) {
  return app.nodes.require(`debris-${i}`);
}
function levelY(level: number): number {
  return level * SLAB_H + SLAB_H / 2;
}
function speedFor(level: number): number {
  return Math.min(3.2, 1.5 + 0.12 * Math.floor((level - 1) / 3));
}
function movingX(): number {
  return AMPLITUDE * Math.sin(phase);
}

function publish(): void {
  window.__TASK_STATE__ = { status, score, height };
  scoreEl.textContent = `Score: ${score}`;
  bestEl.textContent = `Best: ${best}`;
  statusEl.textContent = `Status: ${status}`;
  statusEl.style.color = status === "won" ? "#7dff9a" : status === "lost" ? "#ff7d7d" : "#fff";
}

function placeSlab(i: number, x: number, w: number): void {
  slab(i).setVisible(true).setScale([w, SLAB_H, SLAB_D]).setPosition(x, levelY(i), 0);
}

function startDebris(level: number, x: number, w: number, vx: number): void {
  const d = debris[level];
  if (!d) return;
  d.active = true;
  d.x = x;
  d.y = levelY(level);
  d.vx = vx;
  d.vy = 0.5;
  d.rot = 0;
  d.vr = vx * 0.6;
  d.w = w;
  debrisNode(level).setVisible(true).setScale([w, SLAB_H, SLAB_D]).setPosition(x, d.y, 0).setRotation(0, 0, 0);
}

function spawnMoving(): void {
  movingW = topW;
  phase = -Math.PI / 2;
  placeSlab(height + 1, movingX(), movingW);
}

function restart(): void {
  for (let i = 0; i < POOL; i++) {
    slab(i).setVisible(false);
    debrisNode(i).setVisible(false);
    const d = debris[i];
    if (d) d.active = false;
  }
  status = "playing";
  score = 0;
  height = 0;
  topX = 0;
  topW = BASE_W;
  placeSlab(0, 0, BASE_W);
  spawnMoving();
  camY = 1.2;
  publish();
}

function drop(): void {
  if (status !== "playing") return;
  const level = height + 1;
  const cx = movingX();
  const w = movingW;
  const delta = cx - topX;

  const left = Math.max(cx - w / 2, topX - topW / 2);
  const right = Math.min(cx + w / 2, topX + topW / 2);
  const overlap = right - left;

  if (overlap <= 0) {
    slab(level).setVisible(false);
    startDebris(level, cx, w, delta > 0 ? 1.5 : -1.5);
    status = "lost";
    best = Math.max(best, score);
    publish();
    return;
  }

  let newX = (left + right) / 2;
  let newW = overlap;
  let bonus = 0;
  if (Math.abs(delta) <= PERFECT_TOL) {
    newX = topX;
    newW = w;
    bonus = 1;
  } else {
    const overW = w - overlap;
    const overX = delta > 0 ? right + overW / 2 : left - overW / 2;
    startDebris(level, overX, overW, delta > 0 ? 1.6 : -1.6);
  }

  placeSlab(level, newX, newW);
  topX = newX;
  topW = newW;
  height = level;
  score += 1 + bonus;

  if (height >= WIN_HEIGHT) {
    status = "won";
    best = Math.max(best, score);
  } else {
    spawnMoving();
  }
  publish();
}

// ---- input --------------------------------------------------------------
let started = false;
window.addEventListener("keydown", (e) => {
  if (!started) return;
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) drop();
  } else if (e.code === "KeyR") {
    restart();
  }
});
const canvas = document.getElementById("app");
canvas?.addEventListener("click", () => {
  if (!started) return;
  if (status === "playing") drop();
  else restart();
});

// ---- main loop ----------------------------------------------------------
let last = performance.now();
let frames = 0;

function tick(now: number): void {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;

  if (started) {
    if (status === "playing") {
      phase += speedFor(height + 1) * dt;
      slab(height + 1).setPosition(movingX(), levelY(height + 1), 0);
    }

    for (let i = 0; i < POOL; i++) {
      const d = debris[i];
      if (!d || !d.active) continue;
      d.vy -= 22 * dt;
      d.y += d.vy * dt;
      d.x += d.vx * dt;
      d.rot += d.vr * dt;
      debrisNode(i).setPosition(d.x, d.y, 0).setRotation(0, 0, d.rot);
      if (d.y < camY - 14) {
        d.active = false;
        debrisNode(i).setVisible(false);
      }
    }

    const targetY = Math.max(1.2, height * SLAB_H - 0.6);
    camY += (targetY - camY) * (1 - Math.exp(-dt * 4));
    app.camera?.setPose({ position: cameraPos(camY), target: [0, camY, 0] });
  }

  if (started) frames++;
  if (frames >= 3 && !window.__TASK_READY__) window.__TASK_READY__ = true;
  requestAnimationFrame(tick);
}

window.__TASK_READY__ = false;
publish();
requestAnimationFrame(tick);

void app.ready().then(() => {
  restart();
  started = true;
});
