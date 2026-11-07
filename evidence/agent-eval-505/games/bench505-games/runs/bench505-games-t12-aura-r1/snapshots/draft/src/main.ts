import { camera, createAuraApp, looks, material, primitives, scene } from "@aura3d/engine";
import type { AuraRuntimeNodeHandle } from "@aura3d/engine";

type Status = "playing" | "won" | "lost";

interface TaskState {
  status: Status;
  score: number;
  height: number;
}

declare global {
  interface Window {
    __TASK_STATE__?: TaskState;
    __TASK_READY__?: boolean;
  }
}

// ---- tuning -------------------------------------------------------------
const WIN_HEIGHT = 25; // stacked slabs (not counting the base) needed to win
const SLAB_H = 0.4;
const SLAB_D = 3;
const BASE_W = 3;
const RANGE = 3.4; // mover centre oscillates in [-RANGE, RANGE]
const PERFECT_TOL = 0.1;
const BONUS = 1;
const GRAVITY = 18;
const LOOK = "outdoor-day" as const;

function speedFor(height: number): number {
  return 2.2 + 0.35 * Math.floor(height / 3);
}

function levelColor(level: number): string {
  const h = (205 + level * 13) % 360;
  const s = 0.62;
  const l = 0.58;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): string => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function slabY(level: number): number {
  return (level + 0.5) * SLAB_H;
}

// ---- scene --------------------------------------------------------------
const stage = scene()
  .add(looks.preset(LOOK))
  .camera(camera.follow({ targetNode: "cam", offset: [5.5, 4.2, 9], fov: 40, smoothing: 0 }));

stage.add(
  primitives
    .box({ name: "pillar", size: [BASE_W + 0.4, 60, SLAB_D + 0.4], material: material.pbr({ color: "#4a4f5a", roughness: 0.8 }), receiveShadow: true })
    .position(0, -30 - 0.02, 0)
);

for (let level = 0; level <= WIN_HEIGHT; level++) {
  stage.add(
    primitives
      .box({
        name: `slab-${level}`,
        size: [1, 1, 1],
        material: material.pbr({ color: levelColor(level), roughness: 0.45, metallic: 0.1 }),
        castShadow: true,
        receiveShadow: true
      })
      .position(0, -1000, 0)
      .runtime({ id: `slab-${level}`, mutable: true })
  );
}
for (let level = 1; level <= WIN_HEIGHT; level++) {
  stage.add(
    primitives
      .box({
        name: `debris-${level}`,
        size: [1, 1, 1],
        material: material.pbr({ color: levelColor(level), roughness: 0.45, metallic: 0.1 }),
        castShadow: true
      })
      .position(0, -1000, 0)
      .runtime({ id: `debris-${level}`, mutable: true })
  );
}
stage.add(primitives.box({ name: "cam", size: [0.01, 0.01, 0.01] }).position(0, 2, 0).runtime({ id: "cam", mutable: true }));

// ---- game state ---------------------------------------------------------
interface Piece {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rz: number;
  vr: number;
  w: number;
}

let status: Status = "playing";
let score = 0;
let height = 0;
let best = 0;
let topX = 0;
let topW = BASE_W;
let moverX = -RANGE;
let moverDir = 1;
let moverW = BASE_W;
let camY = 2;

const pieces: Piece[] = [];
for (let i = 0; i < WIN_HEIGHT; i++) pieces.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, rz: 0, vr: 0, w: 1 });

function publish(): void {
  window.__TASK_STATE__ = { status, score, height };
  hudScore.textContent = String(score);
  hudBest.textContent = String(best);
  hudStatus.textContent = status;
  hudStatus.style.color = status === "won" ? "#7dff9b" : status === "lost" ? "#ff7d7d" : "#fff";
}

function startMover(): void {
  moverW = topW;
  const fromLeft = height % 2 === 0;
  moverX = fromLeft ? -RANGE : RANGE;
  moverDir = fromLeft ? 1 : -1;
}

function resetGame(): void {
  status = "playing";
  score = 0;
  height = 0;
  topX = 0;
  topW = BASE_W;
  for (const p of pieces) p.active = false;
  startMover();
  camY = 2;
  handlesDirty = true;
  publish();
}

function spawnPiece(level: number, x: number, w: number, dir: number): void {
  const p = pieces[level - 1];
  if (!p) return;
  p.active = true;
  p.x = x;
  p.y = slabY(level);
  p.w = w;
  p.vx = dir * 1.2;
  p.vy = 0.5;
  p.rz = 0;
  p.vr = -dir * 1.8;
}

function drop(): void {
  if (status !== "playing") return;
  const level = height + 1;
  const dx = moverX - topX;
  if (Math.abs(dx) <= PERFECT_TOL) {
    moverX = topX;
    score += 1 + BONUS;
  } else {
    const left = Math.max(moverX - moverW / 2, topX - topW / 2);
    const right = Math.min(moverX + moverW / 2, topX + topW / 2);
    const overlap = right - left;
    const dir = dx > 0 ? 1 : -1;
    if (overlap <= 0.001) {
      spawnPiece(level, moverX, moverW, dir);
      status = "lost";
      hideMover = true;
      publish();
      return;
    }
    if (dx > 0) {
      spawnPiece(level, (right + moverX + moverW / 2) / 2, moverX + moverW / 2 - right, dir);
    } else {
      spawnPiece(level, (moverX - moverW / 2 + left) / 2, left - (moverX - moverW / 2), dir);
    }
    moverX = (left + right) / 2;
    moverW = overlap;
    score += 1;
  }
  height = level;
  topX = moverX;
  topW = moverW;
  best = Math.max(best, score);
  fixedLevels = Math.max(fixedLevels, level);
  fixedState[level] = { x: topX, w: topW };
  if (height >= WIN_HEIGHT) {
    status = "won";
    hideMover = true;
  } else {
    startMover();
  }
  publish();
}

// ---- DOM HUD (outside the canvas) ---------------------------------------
const hud = document.createElement("div");
hud.id = "hud";
hud.style.cssText = "display:flex;gap:24px;width:640px;box-sizing:border-box;padding:6px 10px;background:#111;font:600 14px system-ui,sans-serif;color:#fff";
function hudItem(label: string): HTMLSpanElement {
  const wrap = document.createElement("div");
  wrap.append(`${label}: `);
  const value = document.createElement("span");
  wrap.append(value);
  hud.append(wrap);
  return value;
}
const hudScore = hudItem("Score");
const hudBest = hudItem("Best");
const hudStatus = hudItem("Status");
const hint = document.createElement("div");
hint.style.cssText = "margin-left:auto;font-weight:400;opacity:.7";
hint.textContent = "Space / click: drop. R: restart";
hud.append(hint);
document.body.append(hud);

// ---- runtime handles ----------------------------------------------------
let slabHandles: AuraRuntimeNodeHandle[] = [];
let debrisHandles: AuraRuntimeNodeHandle[] = [];
let camHandle: AuraRuntimeNodeHandle | undefined;
let mounted = false;
let handlesDirty = true;
let hideMover = false;
let fixedLevels = 0;
const fixedState: Array<{ x: number; w: number } | undefined> = [];

function syncScene(dt: number): void {
  if (!mounted || !camHandle) return;
  if (handlesDirty) {
    handlesDirty = false;
    hideMover = false;
    fixedLevels = 0;
    fixedState.length = 0;
    for (const h of slabHandles) h.setVisible(false);
    for (const h of debrisHandles) h.setVisible(false);
    fixedState[0] = { x: 0, w: BASE_W };
  }
  // fixed slabs (index 0 is the base)
  for (let level = 0; level <= fixedLevels; level++) {
    const s = fixedState[level];
    const h = slabHandles[level];
    if (!s || !h) continue;
    h.setPosition(s.x, slabY(level), 0).setScale([s.w, SLAB_H, SLAB_D]).setVisible(true);
  }
  // moving slab
  const moverLevel = height + 1;
  const mh = slabHandles[moverLevel];
  if (mh) {
    if (status === "playing" && !hideMover) {
      mh.setPosition(moverX, slabY(moverLevel), 0).setScale([moverW, SLAB_H, SLAB_D]).setVisible(true);
    } else {
      mh.setVisible(false);
    }
  }
  // debris
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    const h = debrisHandles[i];
    if (!p || !h) continue;
    if (p.active) {
      h.setPosition(p.x, p.y, 0).setRotation(0, 0, p.rz).setScale([p.w, SLAB_H, SLAB_D]).setVisible(true);
    } else {
      h.setVisible(false);
    }
  }
  // camera rises with the tower
  const targetY = Math.max(2, slabY(height + 1) + 0.9);
  camY += (targetY - camY) * (1 - Math.exp(-4 * dt));
  camHandle.setPosition(0, camY, 0);
}

function step(dt: number): void {
  if (status === "playing") {
    moverX += moverDir * speedFor(height) * dt;
    if (moverX > RANGE) {
      moverX = RANGE;
      moverDir = -1;
    } else if (moverX < -RANGE) {
      moverX = -RANGE;
      moverDir = 1;
    }
  }
  for (const p of pieces) {
    if (!p.active) continue;
    p.vy -= GRAVITY * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rz += p.vr * dt;
    if (p.y < camY - 14) p.active = false;
  }
}

// ---- input --------------------------------------------------------------
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) drop();
  } else if (e.code === "KeyR") {
    resetGame();
  }
});

const canvas = document.getElementById("app");
canvas?.addEventListener("click", () => {
  if (status === "playing") drop();
  else resetGame();
});

// ---- boot ---------------------------------------------------------------
resetGame();

let last = performance.now();
let frames = 0;
function tick(now: number): void {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  step(dt);
  try {
    syncScene(dt);
  } catch (error) {
    console.error(error);
  }
  frames++;
  if (frames === 2 && !window.__TASK_READY__) window.__TASK_READY__ = true;
  requestAnimationFrame(tick);
}

function boot(): void {
  try {
    const app = createAuraApp("#app", { scene: stage, ...looks.appOptions(LOOK) });
    app
      .ready()
      .then(() => {
        slabHandles = [];
        for (let level = 0; level <= WIN_HEIGHT; level++) slabHandles.push(app.nodes.require(`slab-${level}`));
        debrisHandles = [];
        for (let level = 1; level <= WIN_HEIGHT; level++) debrisHandles.push(app.nodes.require(`debris-${level}`));
        camHandle = app.nodes.require("cam");
        camHandle.setVisible(false);
        mounted = true;
        handlesDirty = true;
      })
      .catch((error: unknown) => console.error(error));
  } catch (error) {
    console.error(error);
  }
  requestAnimationFrame(tick);
}

boot();
