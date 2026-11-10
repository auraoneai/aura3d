import { camera, createAuraApp, environments, lights, scene } from "@aura3d/engine";
import { primitives, material } from "@aura3d/engine";
import { stageBackground, stageModel, stageOutput } from "./three-bridge/stage.bridge";

// ---- tuning -------------------------------------------------------------------------------------------------------
const SLAB_H = 0.5;
const SLAB_D = 3.2;
const START_W = 3.2;
const RANGE = 4.4; // half travel of the sliding slab
const BASE_Y = -0.4; // top of the plinth
const WIN_HEIGHT = 25;
const PERFECT_TOL = 0.12;
const POOL = WIN_HEIGHT + 2;

type Status = "playing" | "won" | "lost";
interface Slab { x: number; w: number }
interface Debris { active: boolean; x: number; y: number; vx: number; vy: number; rz: number; vr: number }

declare global {
  interface Window {
    __TASK_STATE__?: Record<string, unknown>;
    __TASK_READY__?: boolean;
    __EVAL_READY__?: boolean;
  }
}

// ---- colours ------------------------------------------------------------------------------------------------------
function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}
const slabColor = (level: number) => hslToHex((205 + level * 13) % 360, 0.62, 0.56);
const slabY = (level: number) => BASE_Y + SLAB_H * (level + 0.5);

// ---- scene --------------------------------------------------------------------------------------------------------
let sceneBuilder = scene(stageBackground ? { background: stageBackground } : { background: "#0d0f16" })
  .add(environments.neutral({ intensity: 0.55, background: false }))
  .add(lights.directional({ name: "sun", position: [6, 12, 8], target: [0, 0, 0], intensity: 2.4, color: "#fff1dd" }))
  .add(lights.directional({ name: "fill", position: [-8, 5, -4], target: [0, 0, 0], intensity: 0.9, color: "#8fb4ff" }))
  .add(stageModel());

for (let i = 0; i < POOL; i += 1) {
  const mat = material.pbr({ color: slabColor(i), roughness: 0.45, metallic: 0.05 });
  sceneBuilder = sceneBuilder
    .add(primitives.box({ name: `slab-${i}`, size: [1, SLAB_H, SLAB_D], material: mat }).position(0, slabY(i), 0).runtime({ id: `slab-${i}`, mutable: true }))
    .add(primitives.box({ name: `chop-${i}`, size: [1, SLAB_H, SLAB_D], material: mat }).position(0, -50, 0).runtime({ id: `chop-${i}`, mutable: true }));
}
sceneBuilder = sceneBuilder.camera(camera.perspective({ position: [5.5, 4.5, 10.5], target: [0, -1, 0], fov: 40, near: 0.1, far: 200 }));

const app = createAuraApp("#app", { scene: sceneBuilder, output: stageOutput });

// ---- HUD (DOM, outside the canvas) ---------------------------------------------------------------------------------
const canvasEl = document.getElementById("app") as HTMLCanvasElement;
const hud = document.createElement("div");
hud.id = "hud";
hud.style.cssText = "width:640px;box-sizing:border-box;padding:6px 10px;display:flex;gap:18px;align-items:baseline;background:#11141c;color:#e8ecf5;font:14px/1.4 system-ui,sans-serif";
hud.innerHTML =
  '<span>Score: <b id="hud-score">0</b></span><span>Best: <b id="hud-best">0</b></span>' +
  '<span>Status: <b id="hud-status">playing</b></span><span id="hud-msg" style="margin-left:auto;color:#9fb0d0"></span>';
canvasEl.insertAdjacentElement("afterend", hud);
const elScore = document.getElementById("hud-score") as HTMLElement;
const elBest = document.getElementById("hud-best") as HTMLElement;
const elStatus = document.getElementById("hud-status") as HTMLElement;
const elMsg = document.getElementById("hud-msg") as HTMLElement;

// ---- game state ---------------------------------------------------------------------------------------------------
let status: Status = "playing";
let score = 0;
let best = 0;
let stack: Slab[] = [{ x: 0, w: START_W }];
let phase = -Math.PI / 2;
let moving: Slab = { x: -RANGE, w: START_W };
let message = "Space / click to drop";
let messageTime = 0;
let camY = BASE_Y + SLAB_H - 1.2;
const debris: Debris[] = Array.from({ length: POOL }, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, rz: 0, vr: 0 }));

const height = () => stack.length - 1;
const omega = () => 1.5 + 0.18 * Math.floor(height() / 3);
const node = (id: string) => app.nodes.require(id);

function placeSlab(level: number, s: Slab): void {
  node(`slab-${level}`).setVisible(true).setPosition(s.x, slabY(level), 0).setScale(Math.max(s.w, 0.001), 1, 1);
}

function spawnDebris(level: number, x: number, w: number, dir: number): void {
  const d = debris[level];
  if (!d) return;
  d.active = true;
  d.x = x;
  d.y = slabY(level);
  d.vx = dir * 1.6;
  d.vy = 0.5;
  d.rz = 0;
  d.vr = -dir * 1.8;
  node(`chop-${level}`).setVisible(true).setScale(Math.max(w, 0.001), 1, 1).setPosition(x, d.y, 0).setRotation(0, 0, 0);
}

function publish(): void {
  window.__TASK_STATE__ = {
    status,
    score,
    height: height(),
    best,
    top: { x: stack[stack.length - 1]?.x ?? 0, width: stack[stack.length - 1]?.w ?? 0 },
    moving: { x: moving.x, width: moving.w }
  };
  elScore.textContent = String(score);
  elBest.textContent = String(best);
  elStatus.textContent = status;
  elMsg.textContent = message;
}

function resetGame(): void {
  for (let i = 0; i < POOL; i += 1) {
    node(`slab-${i}`).setVisible(false);
    node(`chop-${i}`).setVisible(false).setPosition(0, -50, 0);
    const d = debris[i];
    if (d) d.active = false;
  }
  status = "playing";
  score = 0;
  stack = [{ x: 0, w: START_W }];
  placeSlab(0, stack[0] as Slab);
  phase = -Math.PI / 2;
  moving = { x: -RANGE, w: START_W };
  placeSlab(1, moving);
  message = "Space / click to drop";
  messageTime = 0;
  publish();
}

function endGame(next: Status): void {
  status = next;
  best = Math.max(best, score);
  node(`slab-${stack.length}`).setVisible(false);
  message = next === "won" ? "You win! R or click to restart" : "Missed! R or click to restart";
}

function drop(): void {
  if (status !== "playing") return;
  const top = stack[stack.length - 1] as Slab;
  const level = stack.length;
  const dx = moving.x - top.x;
  if (Math.abs(dx) <= PERFECT_TOL) {
    const placed: Slab = { x: top.x, w: moving.w };
    stack.push(placed);
    placeSlab(level, placed);
    score += 2; // one for the slab, one bonus
    message = "Perfect! +1 bonus";
    messageTime = 1.2;
  } else {
    const left = Math.max(moving.x - moving.w / 2, top.x - top.w / 2);
    const right = Math.min(moving.x + moving.w / 2, top.x + top.w / 2);
    const ow = right - left;
    if (ow <= 0) {
      node(`slab-${level}`).setVisible(false);
      spawnDebris(level, moving.x, moving.w, dx >= 0 ? 1 : -1);
      endGame("lost");
      publish();
      return;
    }
    const placed: Slab = { x: (left + right) / 2, w: ow };
    stack.push(placed);
    placeSlab(level, placed);
    const dir = dx >= 0 ? 1 : -1;
    const chopW = moving.w - ow;
    const chopX = dir > 0 ? right + chopW / 2 : left - chopW / 2;
    spawnDebris(level, chopX, chopW, dir);
    score += 1;
    message = "";
    messageTime = 0;
  }
  if (height() >= WIN_HEIGHT) {
    endGame("won");
    publish();
    return;
  }
  const next = stack[stack.length - 1] as Slab;
  moving = { x: moving.x, w: next.w };
  placeSlab(stack.length, moving);
  publish();
}

// ---- input --------------------------------------------------------------------------------------------------------
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) drop();
  } else if (e.code === "KeyR") {
    resetGame();
  }
});
canvasEl.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (status === "playing") drop();
  else resetGame();
});

// ---- per frame ----------------------------------------------------------------------------------------------------
let initialised = false;
let frames = 0;
app.onFrame((f) => {
  if (!initialised) {
    initialised = true;
    resetGame();
  }
  const dt = Math.min(f.dt, 0.05);

  if (status === "playing") {
    phase += omega() * dt;
    moving.x = RANGE * Math.sin(phase);
    node(`slab-${stack.length}`).setPosition(moving.x, slabY(stack.length), 0);
    window.__TASK_STATE__ = { ...(window.__TASK_STATE__ ?? {}), moving: { x: moving.x, width: moving.w } };
  }

  if (messageTime > 0) {
    messageTime -= dt;
    if (messageTime <= 0 && status === "playing") {
      message = "Space / click to drop";
      elMsg.textContent = message;
    }
  }

  for (let i = 0; i < debris.length; i += 1) {
    const d = debris[i] as Debris;
    if (!d.active) continue;
    d.vy -= 20 * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.rz += d.vr * dt;
    node(`chop-${i}`).setPosition(d.x, d.y, 0).setRotation(0, 0, d.rz);
    if (d.y < -25) {
      d.active = false;
      node(`chop-${i}`).setVisible(false);
    }
  }

  // camera rises with the tower
  const topY = BASE_Y + SLAB_H * stack.length;
  const targetY = topY - 1.2;
  camY += (targetY - camY) * Math.min(1, dt * 3);
  app.camera?.setPose({ position: [5.5, camY + 5.7, 10.5], target: [0, camY, 0] });

  frames += 1;
  if (frames === 2) {
    requestAnimationFrame(() => {
      window.__TASK_READY__ = true;
      window.__EVAL_READY__ = true;
    });
  }
});

void app.ready();
