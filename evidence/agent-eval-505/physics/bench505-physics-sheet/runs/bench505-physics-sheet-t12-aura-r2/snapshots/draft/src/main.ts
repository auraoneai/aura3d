import {
  camera,
  createAuraApp,
  environments,
  instances,
  lights,
  material,
  primitives,
  scene,
  text3D,
  type AuraTransformSpec
} from "@aura3d/engine";

type Phase = "ready" | "dropping" | "settled";
interface TaskState {
  phase: Phase;
  spawned: number;
  bins: number[];
  total: number;
}

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    readonly __TASK_STATE__?: TaskState;
  }
}

// ---------- layout constants (world units, board front faces +z) ----------
const BOARD_W = 8;
const HALF_W = BOARD_W / 2;
const BIN_COUNT = 7;
const BIN_W = BOARD_W / BIN_COUNT;
const BIN_TOP = 2.2; // divider height
const PEG_R = 0.12;
const BALL_R = 0.14;
const ROWS = 9;
const ROW_TOP = 10.4;
const ROW_STEP = 0.85;
const BOARD_TOP = 12;
const SPAWN_Y = 11.4;
const BALL_COUNT = 20;
const SPAWN_INTERVAL = 0.25;
const DEPTH = 0.7;

// ---------- physics constants ----------
const DT = 1 / 240;
const GRAVITY = 9.81;
const RESTITUTION = 0.4;
const FRICTION = 0.15;
const REST_SPEED = 1.0; // below this approach speed, contacts are inelastic
const ITERATIONS = 3;

// ---------- static geometry ----------
interface Peg { x: number; y: number }
const pegs: Peg[] = [];
for (let r = 0; r < ROWS; r += 1) {
  const y = ROW_TOP - r * ROW_STEP;
  if (r % 2 === 0) {
    for (let k = 0; k < 7; k += 1) pegs.push({ x: -HALF_W + BIN_W * (k + 0.5), y });
  } else {
    for (let k = 0; k < 6; k += 1) pegs.push({ x: -HALF_W + BIN_W * (k + 1), y });
  }
}

interface Box { x0: number; x1: number; y0: number; y1: number }
const DIV_HALF = 0.05;
const boxes: Box[] = [
  { x0: -HALF_W - 0.4, x1: -HALF_W, y0: -1, y1: BOARD_TOP + 2 }, // left wall
  { x0: HALF_W, x1: HALF_W + 0.4, y0: -1, y1: BOARD_TOP + 2 }, // right wall
  { x0: -HALF_W - 0.4, x1: HALF_W + 0.4, y0: -1, y1: 0 } // floor
];
for (let k = 1; k < BIN_COUNT; k += 1) {
  const x = -HALF_W + BIN_W * k;
  boxes.push({ x0: x - DIV_HALF, x1: x + DIV_HALF, y0: 0, y1: BIN_TOP });
}

// ---------- simulation ----------
interface Ball { id: number; x: number; y: number; vx: number; vy: number }
let balls: Ball[] = [];
let spawned = 0;
let simSteps = 0;
let phase: Phase = "ready";
let calmSteps = 0;
let acc = 0;

const ballOffset = (i: number): number => (((i * 37) % 11) - 5) * 0.02;

function contact(b: Ball, nx: number, ny: number, pen: number): void {
  b.x += nx * pen;
  b.y += ny * pen;
  const vn = b.vx * nx + b.vy * ny;
  if (vn >= 0) return;
  const e = -vn > REST_SPEED ? RESTITUTION : 0;
  const dvn = -(1 + e) * vn;
  b.vx += dvn * nx;
  b.vy += dvn * ny;
  const tx = -ny;
  const ty = nx;
  const vt = b.vx * tx + b.vy * ty;
  const dvt = Math.min(Math.abs(vt), FRICTION * dvn);
  const s = vt >= 0 ? -1 : 1;
  b.vx += s * dvt * tx;
  b.vy += s * dvt * ty;
}

function collideCircle(b: Ball, cx: number, cy: number, r: number): void {
  let dx = b.x - cx;
  let dy = b.y - cy;
  const rr = r + BALL_R;
  if (Math.abs(dx) > rr || Math.abs(dy) > rr) return;
  let d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return;
  // Break exact vertical symmetry deterministically so a ball cannot balance on a peg.
  if (Math.abs(dx) < 1e-3 && dy > 0) {
    dx = (b.id % 2 === 0 ? -1 : 1) * 1e-3;
    d2 = dx * dx + dy * dy;
  }
  const d = Math.sqrt(d2) || 1e-9;
  contact(b, dx / d, dy / d, rr - d);
}

function collideBox(b: Ball, bx: Box): void {
  const px = Math.min(Math.max(b.x, bx.x0), bx.x1);
  const py = Math.min(Math.max(b.y, bx.y0), bx.y1);
  let dx = b.x - px;
  let dy = b.y - py;
  const d2 = dx * dx + dy * dy;
  if (d2 >= BALL_R * BALL_R) return;
  if (d2 === 0) {
    // centre inside the box: push out through the nearest face
    const l = b.x - bx.x0, r = bx.x1 - b.x, t = bx.y1 - b.y, u = b.y - bx.y0;
    const m = Math.min(l, r, t, u);
    if (m === t) contact(b, 0, 1, t + BALL_R);
    else if (m === u) contact(b, 0, -1, u + BALL_R);
    else if (m === l) contact(b, -1, 0, l + BALL_R);
    else contact(b, 1, 0, r + BALL_R);
    return;
  }
  if (Math.abs(dx) < 1e-3 && dy > 0) {
    dx = (b.id % 2 === 0 ? -1 : 1) * 1e-3;
  }
  const d = Math.sqrt(dx * dx + dy * dy);
  const pen = BALL_R - Math.sqrt(d2);
  contact(b, dx / d, dy / d, pen);
}

function collideBalls(a: Ball, c: Ball): void {
  let dx = a.x - c.x;
  const dy = a.y - c.y;
  const rr = BALL_R * 2;
  if (Math.abs(dx) > rr || Math.abs(dy) > rr) return;
  let d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return;
  if (Math.abs(dx) < 1e-5) {
    dx = (a.id > c.id ? 1 : -1) * 1e-4;
    d2 = dx * dx + dy * dy;
  }
  const d = Math.sqrt(d2) || 1e-9;
  const nx = dx / d;
  const ny = dy / d;
  const pen = (rr - d) / 2;
  a.x += nx * pen; a.y += ny * pen;
  c.x -= nx * pen; c.y -= ny * pen;
  const vn = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
  if (vn >= 0) return;
  const e = -vn > REST_SPEED ? RESTITUTION : 0;
  const j = (-(1 + e) * vn) / 2;
  a.vx += j * nx; a.vy += j * ny;
  c.vx -= j * nx; c.vy -= j * ny;
}

function binOf(b: Ball): number {
  return Math.min(BIN_COUNT - 1, Math.max(0, Math.floor((b.x + HALF_W) / BIN_W)));
}

function step(): void {
  simSteps += 1;
  if (phase === "dropping" || phase === "settled") {
    const t = simSteps * DT;
    while (spawned < BALL_COUNT && t >= spawned * SPAWN_INTERVAL - 1e-9) {
      balls.push({ id: spawned, x: ballOffset(spawned), y: SPAWN_Y, vx: 0, vy: 0 });
      spawned += 1;
    }
  }
  for (const b of balls) {
    b.vy -= GRAVITY * DT;
    b.x += b.vx * DT;
    b.y += b.vy * DT;
  }
  for (let it = 0; it < ITERATIONS; it += 1) {
    for (const b of balls) {
      for (const p of pegs) collideCircle(b, p.x, p.y, PEG_R);
      for (const bx of boxes) collideBox(b, bx);
    }
    for (let i = 0; i < balls.length; i += 1) {
      for (let j = i + 1; j < balls.length; j += 1) collideBalls(balls[i]!, balls[j]!);
    }
  }
  if (phase === "dropping" && spawned === BALL_COUNT) {
    const calm = balls.every((b) => b.y < BIN_TOP - BALL_R && Math.hypot(b.vx, b.vy) < 0.25);
    calmSteps = calm ? calmSteps + 1 : 0;
    if (calmSteps >= 120) phase = "settled";
  }
}

function resetSim(): void {
  balls = [];
  spawned = 0;
  simSteps = 0;
  calmSteps = 0;
  acc = 0;
  phase = "ready";
}

function startDrop(): void {
  if (phase === "dropping") return;
  resetSim();
  phase = "dropping";
}

// ---------- scene ----------
const pegMat = material.pbr({ color: "#d5dce6", metallic: 0.85, roughness: 0.28 });
const ballMat = material.pbr({ color: "#ffb52e", metallic: 0.5, roughness: 0.3 });
const binMat = material.pbr({ color: "#2d6f94", metallic: 0.1, roughness: 0.6 });
const frameMat = material.pbr({ color: "#3a3f4d", metallic: 0.3, roughness: 0.55 });
const backMat = material.pbr({ color: "#161b2b", roughness: 0.9 });
const glassMat = material.pbr({ color: "#a8d0ff", roughness: 0.1, opacity: 0.07 });
const labelMat = material.pbr({ color: "#ffffff", roughness: 0.5 });

const pegTransforms: AuraTransformSpec[] = pegs.map((p) => ({
  position: [p.x, p.y, 0],
  rotation: [Math.PI / 2, 0, 0],
  scale: [PEG_R * 2, DEPTH, PEG_R * 2]
}));

let sc = scene({ background: "#0b0f1c" })
  .camera(camera.perspective({ position: [0, 5.3, 20], target: [0, 5.3, 0], fov: 42, near: 1, far: 80 }))
  .add(environments.neutral({ intensity: 0.55, background: false }))
  .add(lights.directional({ name: "key", position: [5, 11, 14], target: [0, 5, 0], intensity: 3, shadow: true }))
  .add(lights.directional({ name: "rim", position: [-5, 9, -9], target: [0, 5, 0], intensity: 4, color: "#58aaff" }))
  .add(primitives.box({ name: "back", size: [BOARD_W + 0.8, BOARD_TOP + 0.4, 0.1], material: backMat }).position(0, BOARD_TOP / 2 - 0.1, -DEPTH / 2 - 0.05))
  .add(primitives.box({ name: "wall-l", size: [0.3, BOARD_TOP + 0.4, DEPTH + 0.1], material: frameMat }).position(-HALF_W - 0.15, BOARD_TOP / 2 - 0.1, 0))
  .add(primitives.box({ name: "wall-r", size: [0.3, BOARD_TOP + 0.4, DEPTH + 0.1], material: frameMat }).position(HALF_W + 0.15, BOARD_TOP / 2 - 0.1, 0))
  .add(primitives.box({ name: "floor", size: [BOARD_W + 0.6, 0.3, DEPTH + 0.1], material: frameMat }).position(0, -0.15, 0))
  .add(instances.cylinder({ name: "pegs", transforms: pegTransforms, material: pegMat, params: { radialSegments: 20 } }))
  .add(primitives.box({ name: "glass", size: [BOARD_W, BOARD_TOP, 0.02], material: glassMat, castShadow: false }).position(0, BOARD_TOP / 2, DEPTH / 2));

for (let k = 1; k < BIN_COUNT; k += 1) {
  sc = sc.add(
    primitives.box({ name: `divider-${k}`, size: [DIV_HALF * 2, BIN_TOP, DEPTH], material: binMat }).position(-HALF_W + BIN_W * k, BIN_TOP / 2, 0)
  );
}
for (let k = 0; k < BIN_COUNT; k += 1) {
  const cx = -HALF_W + BIN_W * (k + 0.5);
  sc = sc
    .add(primitives.box({
      name: `bin-back-${k}`,
      size: [BIN_W - 0.1, BIN_TOP, 0.04],
      material: material.pbr({ color: k % 2 === 0 ? "#1f4f6e" : "#7a3b63", roughness: 0.7 })
    }).position(cx, BIN_TOP / 2, -DEPTH / 2 + 0.03))
    .add(text3D(String(k + 1), { name: `bin-label-${k + 1}`, size: 0.7, depth: 0.1, material: labelMat }).position(cx - 0.25, -1.2, 0.2));
}
for (let i = 0; i < BALL_COUNT; i += 1) {
  sc = sc.add(primitives.sphere({ name: `ball-${i}`, size: BALL_R * 2, material: ballMat }).position(0, -50, 0).runtime({ id: `ball-${i}`, mutable: true }));
}

const app = createAuraApp("#app", { scene: sc });

// ---------- DOM overlay: buttons and live counts ----------
const canvas = document.getElementById("app") as HTMLCanvasElement;
const PX = 180 / (20 * Math.tan((42 * Math.PI) / 360));
const overlay = document.createElement("div");
overlay.style.cssText = `position:absolute;left:0;top:0;width:${canvas.clientWidth || 640}px;height:${canvas.clientHeight || 360}px;pointer-events:none;overflow:hidden;font:600 14px system-ui,sans-serif;color:#fff`;
document.body.appendChild(overlay);

function makeButton(id: string, label: string, top: number, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.id = id;
  btn.type = "button";
  btn.textContent = label;
  btn.style.cssText = `position:absolute;left:12px;top:${top}px;width:120px;padding:7px 0;pointer-events:auto;cursor:pointer;border:1px solid #6aa7d8;border-radius:6px;background:#1c3a57;color:#fff;font:600 13px system-ui,sans-serif`;
  btn.addEventListener("click", onClick);
  overlay.appendChild(btn);
  return btn;
}
makeButton("drop", "Drop 20 Balls", 12, startDrop);
makeButton("reset", "Reset", 52, resetSim);

const countEls: HTMLDivElement[] = [];
for (let k = 0; k < BIN_COUNT; k += 1) {
  const el = document.createElement("div");
  el.className = "bin-count";
  el.dataset.bin = String(k + 1);
  el.textContent = "0";
  const cx = 320 + (-HALF_W + BIN_W * (k + 0.5)) * PX;
  const cy = 180 + (5.3 + 1.75) * PX;
  el.style.cssText = `position:absolute;left:${cx - 20}px;top:${cy - 9}px;width:40px;text-align:center;color:#ffd166;text-shadow:0 0 3px #000`;
  overlay.appendChild(el);
  countEls.push(el);
}

// ---------- state + frame loop ----------
let state: TaskState = { phase: "ready", spawned: 0, bins: [0, 0, 0, 0, 0, 0, 0], total: 0 };
Object.defineProperty(window, "__TASK_STATE__", { get: () => state, configurable: false, enumerable: true });

function refreshState(): void {
  const bins = [0, 0, 0, 0, 0, 0, 0];
  for (const b of balls) {
    if (b.y < BIN_TOP && b.y > -0.5) bins[binOf(b)]! += 1;
  }
  const total = bins.reduce((s, n) => s + n, 0);
  state = { phase, spawned, bins, total };
  for (let k = 0; k < BIN_COUNT; k += 1) {
    const text = String(bins[k]);
    if (countEls[k]!.textContent !== text) countEls[k]!.textContent = text;
  }
}

app.onFrame((f) => {
  acc += Math.min(f.dt, 0.25);
  while (acc >= DT) {
    acc -= DT;
    if (phase === "dropping") step();
  }
  for (let i = 0; i < BALL_COUNT; i += 1) {
    const b = balls[i];
    const node = app.nodes.require(`ball-${i}`);
    if (b) node.setPosition(b.x, b.y, 0);
    else node.setPosition(0, -50, 0);
  }
  refreshState();
});

await app.ready();
refreshState();
window.__EVAL_READY__ = true;
