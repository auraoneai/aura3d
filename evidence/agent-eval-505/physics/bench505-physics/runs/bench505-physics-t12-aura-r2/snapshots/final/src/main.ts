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

// ---------------------------------------------------------------- layout
const BOARD_HALF_W = 4; // inner half width (board is 8 wide)
const BIN_COUNT = 7;
const BIN_W = (BOARD_HALF_W * 2) / BIN_COUNT;
const BIN_H = 2; // dividers / bins occupy y in [0, BIN_H]
const BOARD_TOP = 14; // pegboard occupies y in [BIN_H, BOARD_TOP] (12 tall)
const SPAWN_Y = 13.5;
const BALL_R = 0.14;
const PEG_R = 0.16;
const DIVIDER_HALF_T = 0.05;
const ROWS = 10;
const ROW_SPACING = 1.0;
const FIRST_ROW_Y = 12.4;
const BALL_COUNT = 20;
const SPAWN_INTERVAL = 0.25;

// ---------------------------------------------------------------- physics (2D rigid circles, fixed step)
const STEP = 1 / 240;
const GRAVITY = 9.81;
const RESTITUTION = 0.4;
const REST_SPEED = 0.6; // below this normal speed, no bounce
const FRICTION = 0.03;

interface Vec2 {
  x: number;
  y: number;
}
interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean;
  stuck: number;
}

const pegs: Vec2[] = [];
for (let r = 0; r < ROWS; r += 1) {
  const count = r % 2 === 0 ? 6 : 7; // alternating 6 and 7 pegs, staggered
  const y = FIRST_ROW_Y - r * ROW_SPACING;
  for (let k = 0; k < count; k += 1) {
    pegs.push({ x: (k - (count - 1) / 2) * BIN_W, y });
  }
}
const dividerXs: number[] = [];
for (let k = 1; k < BIN_COUNT; k += 1) dividerXs.push(-BOARD_HALF_W + k * BIN_W);

const balls: Ball[] = [];
for (let i = 0; i < BALL_COUNT; i += 1) balls.push({ x: 0, y: -50, vx: 0, vy: 0, active: false, stuck: 0 });

let simTime = 0;
let spawned = 0;
let dropping = false;

function resolveStatic(b: Ball, cx: number, cy: number, radius: number): void {
  const dx = b.x - cx;
  const dy = b.y - cy;
  const minDist = BALL_R + radius;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minDist * minDist) return;
  const dist = Math.sqrt(d2);
  let nx = 0;
  let ny = 1;
  if (dist > 1e-9) {
    nx = dx / dist;
    ny = dy / dist;
  }
  b.x += nx * (minDist - dist);
  b.y += ny * (minDist - dist);
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    const e = -vn > REST_SPEED ? RESTITUTION : 0;
    b.vx -= (1 + e) * vn * nx;
    b.vy -= (1 + e) * vn * ny;
    // light tangential friction
    const tx = -ny;
    const ty = nx;
    const vt = b.vx * tx + b.vy * ty;
    b.vx -= vt * FRICTION * tx;
    b.vy -= vt * FRICTION * ty;
  }
}

function resolveBalls(a: Ball, b: Ball): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const minDist = BALL_R * 2;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minDist * minDist) return;
  const dist = Math.sqrt(d2);
  let nx = 0;
  let ny = 1;
  if (dist > 1e-9) {
    nx = dx / dist;
    ny = dy / dist;
  }
  const push = (minDist - dist) / 2;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rvn < 0) {
    const e = -rvn > REST_SPEED ? RESTITUTION : 0;
    const j = (-(1 + e) * rvn) / 2;
    a.vx -= j * nx;
    a.vy -= j * ny;
    b.vx += j * nx;
    b.vy += j * ny;
  }
}

function resolveDivider(b: Ball, dx: number): void {
  // vertical capsule from (dx, 0) to (dx, BIN_H)
  if (b.y > BIN_H + BALL_R + DIVIDER_HALF_T) return;
  const cy = Math.min(Math.max(b.y, 0), BIN_H);
  resolveStatic(b, dx, cy, DIVIDER_HALF_T);
}

function stepPhysics(): void {
  // spawn schedule: ball i appears at i * 0.25 simulated seconds
  while (dropping && spawned < BALL_COUNT && simTime + 1e-9 >= spawned * SPAWN_INTERVAL) {
    const i = spawned;
    const b = balls[i];
    if (b) {
      b.x = ((i * 37) % 11 - 5) * 0.02;
      b.y = SPAWN_Y;
      b.vx = 0;
      b.vy = 0;
      b.active = true;
      b.stuck = 0;
    }
    spawned += 1;
  }

  for (const b of balls) {
    if (!b.active) continue;
    b.vy -= GRAVITY * STEP;
    b.x += b.vx * STEP;
    b.y += b.vy * STEP;
  }

  for (let iter = 0; iter < 3; iter += 1) {
    for (let i = 0; i < balls.length; i += 1) {
      const b = balls[i];
      if (!b || !b.active) continue;
      if (b.y > BIN_H - 0.5) {
        for (const p of pegs) {
          if (Math.abs(p.y - b.y) < 0.5 && Math.abs(p.x - b.x) < 0.5) resolveStatic(b, p.x, p.y, PEG_R);
        }
      }
      for (const dx of dividerXs) {
        if (Math.abs(dx - b.x) < 0.5) resolveDivider(b, dx);
      }
      // side walls
      const maxX = BOARD_HALF_W - BALL_R;
      if (b.x > maxX) {
        b.x = maxX;
        if (b.vx > 0) b.vx = -b.vx * (b.vx > REST_SPEED ? RESTITUTION : 0);
      } else if (b.x < -maxX) {
        b.x = -maxX;
        if (b.vx < 0) b.vx = -b.vx * (-b.vx > REST_SPEED ? RESTITUTION : 0);
      }
      // floor
      if (b.y < BALL_R) {
        b.y = BALL_R;
        if (b.vy < 0) b.vy = -b.vy * (-b.vy > REST_SPEED ? RESTITUTION : 0);
        b.vx *= 0.98;
      }
    }
    for (let i = 0; i < balls.length; i += 1) {
      const a = balls[i];
      if (!a || !a.active) continue;
      for (let j = i + 1; j < balls.length; j += 1) {
        const c = balls[j];
        if (!c || !c.active) continue;
        if (Math.abs(a.x - c.x) < BALL_R * 2 && Math.abs(a.y - c.y) < BALL_R * 2) resolveBalls(a, c);
      }
    }
  }

  // deterministic nudge for a ball balanced on a peg or divider top
  for (let i = 0; i < balls.length; i += 1) {
    const b = balls[i];
    if (!b || !b.active) continue;
    const speed = Math.hypot(b.vx, b.vy);
    if (b.y > BIN_H + BALL_R && speed < 0.05) {
      b.stuck += STEP;
      if (b.stuck > 0.4) {
        b.vx += i % 2 === 0 ? 0.6 : -0.6;
        b.stuck = 0;
      }
    } else {
      b.stuck = 0;
    }
  }

  simTime += STEP;
}

function binOf(b: Ball): number {
  const idx = Math.floor((b.x + BOARD_HALF_W) / BIN_W);
  return Math.min(BIN_COUNT - 1, Math.max(0, idx));
}

function resetSim(): void {
  for (const b of balls) {
    b.x = 0;
    b.y = -50;
    b.vx = 0;
    b.vy = 0;
    b.active = false;
    b.stuck = 0;
  }
  simTime = 0;
  spawned = 0;
  dropping = false;
}

// ---------------------------------------------------------------- scene
const pegTransforms: AuraTransformSpec[] = pegs.map((p) => ({
  position: [p.x, p.y, 0],
  rotation: [Math.PI / 2, 0, 0],
  scale: [PEG_R * 2, 0.6, PEG_R * 2]
}));

const pegMat = material.pbr({ color: "#d5dbe3", metallic: 0.85, roughness: 0.28 });
const ballMat = material.pbr({ color: "#ff5a2e", metallic: 0.05, roughness: 0.22 });
const wallMat = material.pbr({ color: "#3c6e9e", metallic: 0.1, roughness: 0.55 });
const dividerMat = material.pbr({ color: "#f2c14e", metallic: 0.2, roughness: 0.45 });
const backMat = material.pbr({ color: "#121c33", metallic: 0, roughness: 0.9 });
const binMatA = material.pbr({ color: "#233b6e", metallic: 0, roughness: 0.8 });
const binMatB = material.pbr({ color: "#2e4d8c", metallic: 0, roughness: 0.8 });
const floorMat = material.pbr({ color: "#e07a5f", metallic: 0.1, roughness: 0.6 });

const boardHeight = BOARD_TOP;
const CAM_Y = 6.4;
const CAM_Z = 31;
const CAM_FOV = 30;

let sc = scene({ background: "#0b1020" })
  .add(environments.neutral({ intensity: 0.6, background: false }))
  .add(lights.directional({ name: "key", position: [-7, 18, 22], target: [0, 7, 0], intensity: 3, color: "#fff4e0" }))
  .add(lights.directional({ name: "rim", position: [9, 12, -14], target: [0, 7, 0], intensity: 3.5, color: "#7fd1ff" }))
  .add(primitives.box({ name: "back", size: [BOARD_HALF_W * 2 + 0.4, boardHeight + 0.3, 0.2], position: [0, boardHeight / 2 - 0.05, -0.45], material: backMat, castShadow: false }))
  .add(primitives.box({ name: "wallL", size: [0.2, boardHeight + 0.3, 0.8], position: [-BOARD_HALF_W - 0.1, boardHeight / 2 - 0.05, 0], material: wallMat, castShadow: false }))
  .add(primitives.box({ name: "wallR", size: [0.2, boardHeight + 0.3, 0.8], position: [BOARD_HALF_W + 0.1, boardHeight / 2 - 0.05, 0], material: wallMat, castShadow: false }))
  .add(primitives.box({ name: "top", size: [BOARD_HALF_W * 2 + 0.4, 0.2, 0.8], position: [0, boardHeight + 0.1, 0], material: wallMat, castShadow: false }))
  .add(primitives.box({ name: "floor", size: [BOARD_HALF_W * 2 + 0.4, 0.2, 0.8], position: [0, -0.1, 0], material: floorMat, castShadow: false }))
  .add(instances.cylinder({ name: "pegs", transforms: pegTransforms, material: pegMat, params: { radialSegments: 20 }, castShadow: false }));

for (let k = 0; k < BIN_COUNT; k += 1) {
  sc = sc.add(
    primitives.box({
      name: `binBack${k}`,
      size: [BIN_W, BIN_H, 0.06],
      position: [-BOARD_HALF_W + (k + 0.5) * BIN_W, BIN_H / 2, -0.32],
      material: k % 2 === 0 ? binMatA : binMatB,
      castShadow: false
    })
  );
}
for (let k = 0; k < dividerXs.length; k += 1) {
  sc = sc.add(
    primitives.box({
      name: `divider${k}`,
      size: [DIVIDER_HALF_T * 2, BIN_H, 0.6],
      position: [dividerXs[k] ?? 0, BIN_H / 2, 0],
      material: dividerMat,
      castShadow: false
    })
  );
}
for (let i = 0; i < BALL_COUNT; i += 1) {
  sc = sc.add(
    primitives
      .sphere({ name: `ball${i}`, size: BALL_R * 2, position: [0, -50, 0], material: ballMat, castShadow: false })
      .runtime({ id: `ball${i}`, mutable: true })
  );
}
sc = sc.camera(camera.perspective({ position: [0, CAM_Y, CAM_Z], target: [0, CAM_Y, 0], fov: CAM_FOV }));

const app = createAuraApp("#app", { scene: sc });

// ---------------------------------------------------------------- DOM HUD (labels, buttons)
const overlay = document.createElement("div");
overlay.style.cssText = "position:absolute;left:0;top:0;width:640px;height:360px;pointer-events:none;overflow:hidden;font:12px/1.2 system-ui,sans-serif;color:#fff";
document.body.appendChild(overlay);

const CANVAS_W = 640;
const CANVAS_H = 360;
const pxPerUnit = CANVAS_H / 2 / ((CAM_Z - 0.4) * Math.tan((CAM_FOV * Math.PI) / 360));
const toPx = (x: number, y: number): [number, number] => [CANVAS_W / 2 + x * pxPerUnit, CANVAS_H / 2 - (y - CAM_Y) * pxPerUnit];

const countEls: HTMLDivElement[] = [];
for (let k = 0; k < BIN_COUNT; k += 1) {
  const [px, py] = toPx(-BOARD_HALF_W + (k + 0.5) * BIN_W, -0.2);
  const label = document.createElement("div");
  label.className = "bin-label";
  label.dataset.bin = String(k + 1);
  label.style.cssText = `position:absolute;left:${px - 14}px;top:${py}px;width:28px;text-align:center;text-shadow:0 1px 2px #000`;
  const num = document.createElement("div");
  num.className = "bin-number";
  num.textContent = String(k + 1);
  num.style.cssText = "font-weight:700;font-size:14px;color:#f2c14e";
  const cnt = document.createElement("div");
  cnt.className = "bin-count";
  cnt.textContent = "0";
  cnt.style.cssText = "font-size:13px;color:#ffffff";
  label.appendChild(num);
  label.appendChild(cnt);
  overlay.appendChild(label);
  countEls.push(cnt);
}

const panel = document.createElement("div");
panel.style.cssText = "position:absolute;left:12px;top:12px;display:flex;flex-direction:column;gap:8px;pointer-events:auto";
const btnCss = "padding:8px 12px;font:600 13px system-ui,sans-serif;border:1px solid #5b7fb5;border-radius:6px;background:#1d3158;color:#fff;cursor:pointer";
const dropBtn = document.createElement("button");
dropBtn.id = "drop-btn";
dropBtn.textContent = "Drop 20 Balls";
dropBtn.style.cssText = btnCss;
const resetBtn = document.createElement("button");
resetBtn.id = "reset-btn";
resetBtn.textContent = "Reset";
resetBtn.style.cssText = btnCss;
panel.appendChild(dropBtn);
panel.appendChild(resetBtn);
overlay.appendChild(panel);

const info = document.createElement("div");
info.style.cssText = "position:absolute;right:12px;top:12px;text-align:right;text-shadow:0 1px 2px #000;font-size:13px";
overlay.appendChild(info);

// ---------------------------------------------------------------- state
type Phase = "ready" | "dropping" | "settled";
interface TaskState {
  phase: Phase;
  spawned: number;
  bins: number[];
  total: number;
}
let current: TaskState = { phase: "ready", spawned: 0, bins: [0, 0, 0, 0, 0, 0, 0], total: 0 };
Object.defineProperty(window, "__TASK_STATE__", {
  configurable: false,
  enumerable: true,
  get: (): TaskState => current
});

function startDrop(): void {
  resetSim();
  dropping = true;
}
dropBtn.addEventListener("click", () => {
  if (dropping && spawned < BALL_COUNT) return;
  if (current.phase === "dropping") return;
  startDrop();
});
resetBtn.addEventListener("click", () => {
  resetSim();
});

function computeState(): TaskState {
  const bins = [0, 0, 0, 0, 0, 0, 0];
  let allSlow = true;
  for (const b of balls) {
    if (!b.active) continue;
    if (b.y < BIN_H) bins[binOf(b)] = (bins[binOf(b)] ?? 0) + 1;
    else allSlow = false;
    if (Math.hypot(b.vx, b.vy) > 0.15) allSlow = false;
  }
  const total = bins.reduce((s, n) => s + n, 0);
  let phase: Phase = "ready";
  if (dropping) {
    phase = spawned >= BALL_COUNT && allSlow && total === spawned ? "settled" : "dropping";
  }
  return { phase, spawned, bins, total };
}

// ---------------------------------------------------------------- loop
let accumulator = 0;
let first = true;
app.onFrame((frame) => {
  const dt = Math.min(Math.max(frame.dt, 0), 0.5);
  accumulator += dt;
  let guard = 0;
  while (accumulator >= STEP && guard < 240 * 1) {
    if (dropping) stepPhysics();
    accumulator -= STEP;
    guard += 1;
  }
  if (guard >= 240) accumulator = 0;

  for (let i = 0; i < BALL_COUNT; i += 1) {
    const b = balls[i];
    if (!b) continue;
    const handle = app.nodes.require(`ball${i}`);
    if (b.active) handle.setPosition(b.x, b.y, 0);
    else handle.setPosition(0, -50, 0);
  }

  current = computeState();
  for (let k = 0; k < BIN_COUNT; k += 1) {
    const el = countEls[k];
    if (el) el.textContent = String(current.bins[k] ?? 0);
  }
  info.textContent = `Spawned ${current.spawned}/${BALL_COUNT}  |  Total in bins ${current.total}  |  ${current.phase}`;

  if (first) {
    first = false;
    (window as unknown as { __EVAL_READY__: boolean }).__EVAL_READY__ = true;
  }
});

await app.ready();
