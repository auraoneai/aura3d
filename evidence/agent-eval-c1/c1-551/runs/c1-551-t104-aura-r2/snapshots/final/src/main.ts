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
    __TASK_STATE__?: { status: Status; score: number; height: number; paused: boolean };
    __TASK_READY__?: boolean;
    __EVAL_READY__?: boolean;
  }
}

// ---- tuning -------------------------------------------------------------
const WIN_HEIGHT = 25;
const SLAB_H = 0.5;
const SLAB_D = 3;
const BASE_W = 3;
const RANGE = 3.4; // slider amplitude (world units)
const PERFECT_TOL = 0.12;
const BASE_SPEED = 1.5; // rad/s of the slide phase
const SPEED_STEP = 0.2; // added every 3 levels
const POOL = 80;
const GRAVITY = 18;

// ---- state --------------------------------------------------------------
interface Slab { x: number; w: number; level: number }
interface Piece { x: number; y: number; w: number; level: number; vx: number; vy: number; rot: number; spin: number }

let stack: Slab[] = [];
let pieces: Piece[] = [];
let cur: Slab = { x: 0, w: BASE_W, level: 1 };
let phase = 0;
let status: Status = "playing";
let paused = false;
let score = 0;
let height = 0;
let best = 0;
let camY = 0;
let flash = 0;
let message = "";

function hueColor(level: number): string {
  const h = ((level * 17 + 200) % 360) / 360;
  const s = 0.62;
  const l = 0.56;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): string => {
    const k = (n + h * 12) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function speedFor(h: number): number {
  return BASE_SPEED + Math.floor(h / 3) * SPEED_STEP;
}

function topY(): number {
  return stack.length * SLAB_H; // top surface of the tower
}

function reset(): void {
  stack = [{ x: 0, w: BASE_W, level: 0 }];
  pieces = [];
  status = "playing";
  paused = false;
  score = 0;
  height = 0;
  phase = 0;
  flash = 0;
  message = "";
  cur = { x: 0, w: BASE_W, level: 1 };
  syncState();
}

function syncState(): void {
  window.__TASK_STATE__ = { status, score, height, paused };
  if (score > best) best = score;
  renderHud();
}

function togglePause(): void {
  if (status !== "playing") return;
  paused = !paused;
  syncState();
}

function drop(): void {
  if (status !== "playing" || paused) return;
  const prev = stack[stack.length - 1]!;
  const pl = prev.x - prev.w / 2;
  const pr = prev.x + prev.w / 2;
  const cl = cur.x - cur.w / 2;
  const cr = cur.x + cur.w / 2;
  const lo = Math.max(pl, cl);
  const hi = Math.min(pr, cr);
  const y = topY() + SLAB_H / 2;
  if (hi - lo <= 0.001) {
    // complete miss: the whole slab falls
    pieces.push({ x: cur.x, y, w: cur.w, level: cur.level, vx: cur.x > prev.x ? 1.2 : -1.2, vy: 0, rot: 0, spin: cur.x > prev.x ? -1.5 : 1.5 });
    status = "lost";
    message = "Missed! Press R or click to restart";
    syncState();
    return;
  }
  let placed: Slab;
  if (Math.abs(cur.x - prev.x) <= PERFECT_TOL) {
    placed = { x: prev.x, w: prev.w, level: cur.level };
    score += 2; // 1 for the slab + 1 bonus
    flash = 1;
    message = "Perfect! +1 bonus";
  } else {
    placed = { x: (lo + hi) / 2, w: hi - lo, level: cur.level };
    score += 1;
    message = "";
    // overhanging part falls away
    if (cl < lo - 1e-6) {
      const w = lo - cl;
      pieces.push({ x: cl + w / 2, y, w, level: cur.level, vx: -1.2, vy: 0, rot: 0, spin: 1.5 });
    }
    if (cr > hi + 1e-6) {
      const w = cr - hi;
      pieces.push({ x: hi + w / 2, y, w, level: cur.level, vx: 1.2, vy: 0, rot: 0, spin: -1.5 });
    }
  }
  stack.push(placed);
  height = stack.length - 1;
  if (height >= WIN_HEIGHT) {
    status = "won";
    message = "You win! Press R or click to play again";
    syncState();
    return;
  }
  cur = { x: placed.x, w: placed.w, level: cur.level + 1 };
  // keep the slide continuous: restart from the middle of the range
  phase = 0;
  syncState();
}

// ---- HUD ----------------------------------------------------------------
const canvas = document.getElementById("app") as HTMLCanvasElement;
const hud = document.createElement("div");
hud.id = "hud";
hud.style.cssText = "width:640px;box-sizing:border-box;padding:6px 10px;display:flex;gap:18px;font:14px/1.4 system-ui,sans-serif;background:#10131a;color:#fff";
canvas.insertAdjacentElement("afterend", hud);

function renderHud(): void {
  hud.innerHTML =
    `<span>Score: <b id="hud-score">${score}</b></span>` +
    `<span>Best: <b id="hud-best">${best}</b></span>` +
    `<span>Status: <b id="hud-status">${status}</b></span>` +
    (paused ? `<span id="hud-paused" style="color:#ffd166"><b>Paused</b></span>` : "") +
    `<span style="margin-left:auto;opacity:.75">${message || "Space / click: drop &middot; P: pause &middot; R: restart"}</span>`;
}

// ---- scene --------------------------------------------------------------
const white = "#ffffff";
const stage = scene({ background: "#141a2b" })
  .add(environments.neutral({ intensity: 0.7, background: false }))
  .add(lights.directional({ name: "sun", position: [6, 14, 8], target: [0, 0, 0], intensity: 2.2, shadow: false }))
  .add(primitives.plane({ name: "ground", size: [60, 1, 60], material: material.pbr({ color: "#232b40", roughness: 1 }) }).position(0, -0.01, 0))
  .add(instances.box({
    name: "slabs",
    transforms: Array.from({ length: POOL }, () => ({ position: [0, -200, 0] as [number, number, number], scale: [0.01, 0.01, 0.01] as [number, number, number] })),
    colors: Array.from({ length: POOL }, () => white),
    material: material.pbr({ color: white, roughness: 0.55 })
  }).runtime({ id: "slabs", mutable: true }))
  .camera(camera.perspective({ position: [7, 5, 9], target: [0, 1, 0], fov: 40 }));

const app = createAuraApp("#app", { scene: stage });

const HIDDEN: AuraTransformSpec = { position: [0, -200, 0], scale: [0.01, 0.01, 0.01] };

function buildInstances(): { t: AuraTransformSpec[]; c: string[] } {
  const t: AuraTransformSpec[] = [];
  const c: string[] = [];
  const add = (x: number, y: number, w: number, level: number, rot = 0): void => {
    t.push({ position: [x, y, 0], rotation: [0, 0, rot], scale: [w, SLAB_H * 0.96, SLAB_D] });
    c.push(hueColor(level));
  };
  stack.forEach((s, i) => add(s.x, i * SLAB_H + SLAB_H / 2, s.w, s.level));
  if (status === "playing") add(cur.x, topY() + SLAB_H / 2 + 0.02, cur.w, cur.level);
  for (const p of pieces) add(p.x, p.y, p.w, p.level, p.rot);
  while (t.length < POOL) {
    t.push(HIDDEN);
    c.push(white);
  }
  return { t: t.slice(0, POOL), c: c.slice(0, POOL) };
}

let first = true;
app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.05);
  const simDt = paused ? 0 : dt;

  if (status === "playing" && !paused) {
    phase += speedFor(height) * dt;
    cur.x = RANGE * Math.sin(phase);
  }
  for (const p of pieces) {
    p.vy -= GRAVITY * simDt;
    p.y += p.vy * simDt;
    p.x += p.vx * simDt;
    p.rot += p.spin * simDt;
  }
  pieces = pieces.filter((p) => p.y > -25).slice(-30);
  flash = Math.max(0, flash - simDt * 2);

  const { t, c } = buildInstances();
  app.nodes.require("slabs").setInstances(t, c);

  // camera follows the tower top
  const targetY = topY();
  camY += (targetY - camY) * Math.min(1, dt * 4);
  app.camera?.setPose({
    position: [7.5, camY + 5, 10.5],
    target: [0, camY + 0.5, 0],
    fov: 40
  });

  if (first) {
    first = false;
    requestAnimationFrame(() => {
      window.__TASK_READY__ = true;
      window.__EVAL_READY__ = true;
    });
  }
});

// ---- input --------------------------------------------------------------
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) drop();
  } else if (e.code === "KeyR") {
    reset();
  } else if (e.code === "KeyP") {
    if (!e.repeat) togglePause();
  }
});
canvas.addEventListener("click", () => {
  if (paused) return;
  if (status === "playing") drop();
  else reset();
});

reset();
void app.ready();
