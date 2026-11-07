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

// ---------------------------------------------------------------- constants
const BOARD_HALF_W = 4; // interior spans x in [-4, 4]
const BIN_COUNT = 7;
const BIN_W = (BOARD_HALF_W * 2) / BIN_COUNT;
const BIN_TOP = 2.4;
const BOARD_TOP = 12;
const BALL_R = 0.15;
const PEG_R = 0.12;
const TOTAL_BALLS = 20;
const SPAWN_INTERVAL = 0.25;
const SPAWN_Y = 11.6;
const GRAVITY = -9.81;
const DT = 1 / 120; // fixed physics step
const RESTITUTION = 0.4;
const OFFSCREEN_Y = -100;

const PEG_ROWS = 8;
const PEG_TOP_Y = 10.6;
const PEG_ROW_GAP = 1.0;

// Camera framing (vertical fov in degrees, looking down -z).
const CAM_FOV = 40;
const CAM_DIST = 20;
const CAM_Y = 5.4;
const CANVAS_W = 640;
const CANVAS_H = 360;

type Phase = "ready" | "dropping" | "settled";
interface TaskState {
  phase: Phase;
  spawned: number;
  bins: number[];
  total: number;
}

declare global {
  interface Window {
    __TASK_STATE__?: Readonly<TaskState>;
    __EVAL_READY__?: boolean;
  }
}

// ------------------------------------------------------------------ layout
interface Peg { x: number; y: number }
interface Rect { minX: number; maxX: number; minY: number; maxY: number }

const pegs: Peg[] = [];
for (let row = 0; row < PEG_ROWS; row += 1) {
  const y = PEG_TOP_Y - row * PEG_ROW_GAP;
  if (row % 2 === 0) {
    // 7 pegs centred over the bins
    for (let k = 0; k < BIN_COUNT; k += 1) pegs.push({ x: -BOARD_HALF_W + (k + 0.5) * BIN_W, y });
  } else {
    // 6 pegs over the dividers
    for (let k = 1; k < BIN_COUNT; k += 1) pegs.push({ x: -BOARD_HALF_W + k * BIN_W, y });
  }
}

const DIVIDER_HALF = 0.04;
const rects: Rect[] = [
  { minX: -BOARD_HALF_W - 1, maxX: -BOARD_HALF_W, minY: -1, maxY: BOARD_TOP + 1 },
  { minX: BOARD_HALF_W, maxX: BOARD_HALF_W + 1, minY: -1, maxY: BOARD_TOP + 1 },
  { minX: -BOARD_HALF_W - 1, maxX: BOARD_HALF_W + 1, minY: -1, maxY: 0 }
];
const dividerX: number[] = [];
for (let k = 1; k < BIN_COUNT; k += 1) {
  const x = -BOARD_HALF_W + k * BIN_W;
  dividerX.push(x);
  rects.push({ minX: x - DIVIDER_HALF, maxX: x + DIVIDER_HALF, minY: 0, maxY: BIN_TOP });
}

// -------------------------------------------------------------- simulation
interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean;
  rest: number;
  stuck: number;
}

const balls: Ball[] = [];
for (let i = 0; i < TOTAL_BALLS; i += 1) {
  balls.push({ x: 0, y: OFFSCREEN_Y, vx: 0, vy: 0, active: false, rest: 0, stuck: 0 });
}

let simSteps = 0;
let spawned = 0;
let started = false;
let settled = false;

function bounceFactor(vn: number): number {
  // Tiny closing speeds are treated as resting contact (no micro-bounce jitter).
  return -vn > 0.5 ? 1 + RESTITUTION : 1;
}

function collideCircle(b: Ball, cx: number, cy: number, r: number): void {
  const dx = b.x - cx;
  const dy = b.y - cy;
  const minD = r + BALL_R;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minD * minD) return;
  const d = Math.sqrt(d2);
  const nx = d > 1e-9 ? dx / d : 0;
  const ny = d > 1e-9 ? dy / d : 1;
  const pen = minD - d;
  b.x += nx * pen;
  b.y += ny * pen;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    const k = bounceFactor(vn) * vn;
    b.vx -= k * nx;
    b.vy -= k * ny;
  }
}

function collideRect(b: Ball, r: Rect): void {
  const cx = Math.min(Math.max(b.x, r.minX), r.maxX);
  const cy = Math.min(Math.max(b.y, r.minY), r.maxY);
  let dx = b.x - cx;
  let dy = b.y - cy;
  let d2 = dx * dx + dy * dy;
  let nx: number;
  let ny: number;
  let pen: number;
  if (d2 > 1e-12) {
    if (d2 >= BALL_R * BALL_R) return;
    const d = Math.sqrt(d2);
    nx = dx / d;
    ny = dy / d;
    pen = BALL_R - d;
  } else {
    // centre inside the rectangle: leave through the nearest face
    const left = b.x - r.minX;
    const right = r.maxX - b.x;
    const bottom = b.y - r.minY;
    const top = r.maxY - b.y;
    const m = Math.min(left, right, bottom, top);
    nx = 0;
    ny = 0;
    if (m === left) nx = -1;
    else if (m === right) nx = 1;
    else if (m === bottom) ny = -1;
    else ny = 1;
    pen = m + BALL_R;
  }
  b.x += nx * pen;
  b.y += ny * pen;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    const k = bounceFactor(vn) * vn;
    b.vx -= k * nx;
    b.vy -= k * ny;
  }
}

function collideBalls(a: Ball, b: Ball): void {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  const minD = BALL_R * 2;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minD * minD) return;
  const d = Math.sqrt(d2);
  let nx = 1;
  let ny = 0;
  if (d > 1e-9) {
    nx = dx / d;
    ny = dy / d;
  }
  const pen = minD - d;
  a.x -= nx * pen * 0.5;
  a.y -= ny * pen * 0.5;
  b.x += nx * pen * 0.5;
  b.y += ny * pen * 0.5;
  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (vn < 0) {
    const j = (bounceFactor(vn) * vn) * 0.5; // equal masses
    a.vx += j * nx;
    a.vy += j * ny;
    b.vx -= j * nx;
    b.vy -= j * ny;
  }
  dx = 0;
  dy = 0;
}

function spawnBall(i: number): void {
  const b = balls[i];
  const offset = (((i * 37) % 11) - 5) * 0.02;
  b.x = offset;
  b.y = SPAWN_Y;
  b.vx = 0;
  b.vy = 0;
  b.active = true;
  b.rest = 0;
  b.stuck = 0;
}

function binOf(b: Ball): number {
  const k = Math.floor((b.x + BOARD_HALF_W) / BIN_W);
  return Math.min(BIN_COUNT - 1, Math.max(0, k));
}

function physicsStep(): void {
  const time = simSteps * DT;
  while (started && spawned < TOTAL_BALLS && time + 1e-9 >= spawned * SPAWN_INTERVAL) {
    spawnBall(spawned);
    spawned += 1;
  }

  for (const b of balls) {
    if (!b.active) continue;
    b.vy += GRAVITY * DT;
    b.x += b.vx * DT;
    b.y += b.vy * DT;
  }

  for (let iter = 0; iter < 4; iter += 1) {
    for (const b of balls) {
      if (!b.active) continue;
      for (const p of pegs) collideCircle(b, p.x, p.y, PEG_R);
      for (const r of rects) collideRect(b, r);
    }
    for (let i = 0; i < balls.length; i += 1) {
      if (!balls[i].active) continue;
      for (let j = i + 1; j < balls.length; j += 1) {
        if (balls[j].active) collideBalls(balls[i], balls[j]);
      }
    }
  }

  let allRest = true;
  for (let i = 0; i < balls.length; i += 1) {
    const b = balls[i];
    if (!b.active) continue;
    const speed = Math.hypot(b.vx, b.vy);
    b.rest = speed < 0.2 ? b.rest + DT : 0;
    // Deterministic nudge for a ball balanced on a peg or divider crest.
    if (speed < 0.25 && b.y > BIN_TOP) b.stuck += DT;
    else b.stuck = 0;
    if (b.stuck > 0.3) {
      b.vx += (i % 2 === 0 ? -1 : 1) * 0.6;
      b.vy += 1;
      b.stuck = 0;
    }
    if (b.rest < 0.5 || b.y > BIN_TOP) allRest = false;
  }
  settled = started && spawned === TOTAL_BALLS && allRest;
  simSteps += 1;
}

function resetSim(): void {
  for (const b of balls) {
    b.x = 0;
    b.y = OFFSCREEN_Y;
    b.vx = 0;
    b.vy = 0;
    b.active = false;
    b.rest = 0;
    b.stuck = 0;
  }
  simSteps = 0;
  spawned = 0;
  started = false;
  settled = false;
}

// ------------------------------------------------------------------- scene
const metalPeg = material.metal({ color: "#d9dee8", roughness: 0.25 });
const ballMat = material.pbr({ color: "#ff6a2b", roughness: 0.28, metallic: 0.05 });
const binMat = material.pbr({ color: "#17b3a3", roughness: 0.5 });
const wallMat = material.pbr({ color: "#6a55b0", roughness: 0.6 });
const backMat = material.pbr({ color: "#1a2140", roughness: 0.9 });
const glassMat = material.pbr({ color: "#bcd8ff", roughness: 0.1, opacity: 0.08 });

const pegTransforms: AuraTransformSpec[] = pegs.map((p) => ({
  position: [p.x, p.y, 0.05] as const,
  rotation: [Math.PI / 2, 0, 0] as const,
  scale: [PEG_R * 2, 0.5, PEG_R * 2] as const
}));

const boardMidY = BOARD_TOP / 2;
const gameScene = scene({ background: "#0d1120" })
  .add(environments.neutral({ intensity: 0.7, background: false }))
  .add(lights.directional({ name: "key", position: [-6, 10, 14], target: [0, 5, 0], intensity: 3, color: "#fff3e0", shadow: true }))
  .add(lights.directional({ name: "rim", position: [5, 12, -8], target: [0, 5, 0], intensity: 2.2, color: "#7fb4ff" }))
  .add(primitives.box({ name: "back-panel", size: [BOARD_HALF_W * 2 + 0.6, BOARD_TOP + 0.4, 0.2], position: [0, boardMidY + 0.1, -0.3], material: backMat, castShadow: false }))
  .add(primitives.box({ name: "wall-left", size: [0.4, BOARD_TOP + 0.4, 0.8], position: [-BOARD_HALF_W - 0.2, boardMidY + 0.1, 0.05], material: wallMat }))
  .add(primitives.box({ name: "wall-right", size: [0.4, BOARD_TOP + 0.4, 0.8], position: [BOARD_HALF_W + 0.2, boardMidY + 0.1, 0.05], material: wallMat }))
  .add(primitives.box({ name: "top-bar", size: [BOARD_HALF_W * 2 + 0.8, 0.4, 0.8], position: [0, BOARD_TOP + 0.3, 0.05], material: wallMat }))
  .add(primitives.box({ name: "bin-floor", size: [BOARD_HALF_W * 2 + 0.8, 0.3, 0.8], position: [0, -0.15, 0.05], material: binMat }))
  .add(instances.cylinder({ name: "pegs", transforms: pegTransforms, material: metalPeg, params: { radialSegments: 16 } }))
  .add(primitives.box({ name: "front-glass", size: [BOARD_HALF_W * 2, BOARD_TOP, 0.02], position: [0, boardMidY, 0.42], material: glassMat, castShadow: false, receiveShadow: false }));

for (let k = 0; k < BIN_COUNT; k += 1) {
  gameScene.add(
    primitives.box({
      name: `bin-back-${k + 1}`,
      size: [BIN_W - 0.14, BIN_TOP, 0.04],
      position: [-BOARD_HALF_W + (k + 0.5) * BIN_W, BIN_TOP / 2, -0.17],
      material: material.pbr({ color: k % 2 === 0 ? "#243a6b" : "#2c2f63", roughness: 0.8 }),
      castShadow: false
    })
  );
}
dividerX.forEach((x, idx) => {
  gameScene.add(
    primitives.box({
      name: `divider-${idx + 1}`,
      size: [DIVIDER_HALF * 2, BIN_TOP, 0.5],
      position: [x, BIN_TOP / 2, 0.05],
      material: binMat
    })
  );
});
for (let i = 0; i < TOTAL_BALLS; i += 1) {
  gameScene.add(
    primitives
      .sphere({ name: `ball-${i}`, size: BALL_R * 2, position: [0, OFFSCREEN_Y, 0], material: ballMat })
      .runtime({ id: `ball-${i}`, mutable: true })
  );
}
gameScene.camera(camera.perspective({ position: [0, CAM_Y, CAM_DIST], target: [0, CAM_Y, 0], fov: CAM_FOV }));

const app = createAuraApp("#app", { scene: gameScene, resize: false });
const ballNodes = balls.map((_, i) => app.nodes.require(`ball-${i}`));

// --------------------------------------------------------------------- HUD
const PX_PER_UNIT = CANVAS_H / (2 * CAM_DIST * Math.tan((CAM_FOV * Math.PI) / 360));
const toScreenX = (x: number): number => CANVAS_W / 2 + x * PX_PER_UNIT;
const toScreenY = (y: number): number => CANVAS_H / 2 - (y - CAM_Y) * PX_PER_UNIT;

const overlay = document.createElement("div");
overlay.style.cssText = `position:absolute;left:0;top:0;width:${CANVAS_W}px;height:${CANVAS_H}px;pointer-events:none;overflow:hidden;font:12px/1.2 system-ui,sans-serif;color:#fff;`;
document.body.appendChild(overlay);

const buttonCss = "pointer-events:auto;display:block;margin:0 0 6px 0;padding:6px 10px;font:600 12px system-ui,sans-serif;color:#fff;background:#2f6fed;border:1px solid #7fa6ff;border-radius:4px;cursor:pointer;";
const panel = document.createElement("div");
panel.style.cssText = "position:absolute;left:10px;top:10px;";
const dropButton = document.createElement("button");
dropButton.id = "drop-button";
dropButton.textContent = "Drop 20 Balls";
dropButton.style.cssText = buttonCss;
const resetButton = document.createElement("button");
resetButton.id = "reset-button";
resetButton.textContent = "Reset";
resetButton.style.cssText = buttonCss + "background:#444b5e;border-color:#8a93a8;";
panel.appendChild(dropButton);
panel.appendChild(resetButton);
overlay.appendChild(panel);

const status = document.createElement("div");
status.style.cssText = "position:absolute;right:10px;top:10px;text-align:right;text-shadow:0 1px 2px #000;";
overlay.appendChild(status);

const countEls: HTMLElement[] = [];
for (let k = 0; k < BIN_COUNT; k += 1) {
  const label = document.createElement("div");
  label.className = "bin-label";
  label.dataset.bin = String(k + 1);
  const cx = toScreenX(-BOARD_HALF_W + (k + 0.5) * BIN_W);
  const top = toScreenY(-0.35);
  label.style.cssText = `position:absolute;left:${cx - 16}px;top:${top}px;width:32px;text-align:center;text-shadow:0 1px 2px #000;`;
  const num = document.createElement("div");
  num.className = "bin-number";
  num.textContent = String(k + 1);
  num.style.cssText = "font-weight:700;font-size:13px;color:#7ff0e0;";
  const count = document.createElement("div");
  count.className = "bin-count";
  count.textContent = "0";
  count.style.cssText = "font-size:13px;color:#ffd9a8;";
  label.appendChild(num);
  label.appendChild(count);
  overlay.appendChild(label);
  countEls.push(count);
}

dropButton.addEventListener("click", () => {
  if (started && !settled) return; // already dropping
  if (started) resetSim();
  started = true;
});
resetButton.addEventListener("click", () => {
  resetSim();
});

// ------------------------------------------------------------------- state
const taskState: TaskState = { phase: "ready", spawned: 0, bins: [0, 0, 0, 0, 0, 0, 0], total: 0 };
Object.defineProperty(window, "__TASK_STATE__", {
  configurable: false,
  enumerable: true,
  get: (): Readonly<TaskState> => ({ phase: taskState.phase, spawned: taskState.spawned, bins: taskState.bins.slice(), total: taskState.total })
});

function updateState(): void {
  const bins = [0, 0, 0, 0, 0, 0, 0];
  for (const b of balls) {
    if (b.active && b.y < BIN_TOP && b.y > 0) bins[binOf(b)] += 1;
  }
  taskState.bins = bins;
  taskState.total = bins.reduce((a, c) => a + c, 0);
  taskState.spawned = spawned;
  taskState.phase = !started ? "ready" : settled ? "settled" : "dropping";
  for (let k = 0; k < BIN_COUNT; k += 1) {
    const text = String(bins[k]);
    if (countEls[k].textContent !== text) countEls[k].textContent = text;
  }
  status.textContent = `Phase: ${taskState.phase}  Spawned: ${spawned}/${TOTAL_BALLS}  In bins: ${taskState.total}`;
}

// -------------------------------------------------------------------- loop
let accumulator = 0;
let readyFlagged = false;

app.onFrame((frame) => {
  const dt = Math.min(0.25, Math.max(0, frame.dt));
  accumulator += dt;
  while (accumulator >= DT) {
    physicsStep();
    accumulator -= DT;
  }
  for (let i = 0; i < balls.length; i += 1) {
    const b = balls[i];
    ballNodes[i].setPosition(b.x, b.active ? b.y : OFFSCREEN_Y, 0);
  }
  updateState();
  if (!readyFlagged) {
    readyFlagged = true;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});

updateState();
void app.ready();
