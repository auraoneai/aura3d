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
const BOARD_W = 8;
const HALF_W = BOARD_W / 2;
const BOARD_H = 12;
const BIN_COUNT = 7;
const BIN_W = BOARD_W / BIN_COUNT;
const DIV_H = 2.4; // divider height
const DIV_T = 0.04; // divider half thickness
const PEG_R = 0.12;
const BALL_R = 0.16;
const BALL_COUNT = 20;
const SPAWN_INTERVAL = 0.25;
const SPAWN_Y = 11.6;
const GRAVITY = 9.81;
const RESTITUTION = 0.4;
const STEP = 1 / 240;
const MAX_FRAME_SIM = 0.25;
const ROWS = 8;
const ROW_TOP = 10.4;
const ROW_GAP = 1.0;
const OFFSCREEN_Y = -50;

type Vec3 = [number, number, number];

// ----------------------------------------------------------- board geometry
const pegs: { x: number; y: number }[] = [];
for (let r = 0; r < ROWS; r += 1) {
  const y = ROW_TOP - r * ROW_GAP;
  if (r % 2 === 0) {
    for (let k = 0; k < 7; k += 1) pegs.push({ x: (k - 3) * BIN_W, y });
  } else {
    for (let k = 0; k < 6; k += 1) pegs.push({ x: (k - 2.5) * BIN_W, y });
  }
}
const dividerXs: number[] = [];
for (let i = 1; i < BIN_COUNT; i += 1) dividerXs.push(-HALF_W + i * BIN_W);
const binCenter = (i: number): number => -HALF_W + (i + 0.5) * BIN_W;

// ------------------------------------------------------------------- scene
const BIN_COLORS = ["#e5484d", "#f08c3a", "#f2c94c", "#4cc38a", "#3fa7e0", "#7c6df0", "#d663c4"];

const pegTransforms: AuraTransformSpec[] = pegs.map((p) => ({
  position: [p.x, p.y, 0] as Vec3,
  rotation: [Math.PI / 2, 0, 0] as Vec3,
  scale: [PEG_R * 2, 0.5, PEG_R * 2] as Vec3
}));

const dividerTransforms: AuraTransformSpec[] = dividerXs.map((x) => ({
  position: [x, DIV_H / 2, 0] as Vec3,
  scale: [DIV_T * 2, DIV_H, 0.5] as Vec3
}));

const binFloorTransforms: AuraTransformSpec[] = BIN_COLORS.map((_, i) => ({
  position: [binCenter(i), 0.03, 0] as Vec3,
  scale: [BIN_W - 0.1, 0.06, 0.5] as Vec3
}));

const binBackTransforms: AuraTransformSpec[] = BIN_COLORS.map((_, i) => ({
  position: [binCenter(i), DIV_H / 2, -0.28] as Vec3,
  scale: [BIN_W - 0.06, DIV_H, 0.04] as Vec3
}));

let board = scene({ background: "#0d1220" })
  .add(environments.neutral({ intensity: 0.7, background: false }))
  .add(lights.hemisphere({ name: "fill", intensity: 0.5 }))
  .add(
    lights.directional({
      name: "key",
      position: [-5, 10, 16],
      target: [0, 6, 0],
      intensity: 3.2,
      color: "#fff3e0",
      shadow: true
    })
  )
  .add(
    lights.directional({
      name: "rim",
      position: [6, 9, -9],
      target: [0, 6, 0],
      intensity: 3,
      color: "#6fb4ff"
    })
  )
  .add(
    primitives.box({
      name: "back-panel",
      position: [0, BOARD_H / 2, -0.35],
      size: [BOARD_W + 0.4, BOARD_H, 0.1],
      material: material.pbr({ color: "#1b2540", roughness: 0.8, metallic: 0 })
    })
  )
  .add(
    primitives.box({
      name: "wall-left",
      position: [-HALF_W - 0.1, BOARD_H / 2, 0],
      size: [0.2, BOARD_H + 0.2, 0.7],
      material: material.pbr({ color: "#5a6a8c", roughness: 0.5, metallic: 0.2 })
    })
  )
  .add(
    primitives.box({
      name: "wall-right",
      position: [HALF_W + 0.1, BOARD_H / 2, 0],
      size: [0.2, BOARD_H + 0.2, 0.7],
      material: material.pbr({ color: "#5a6a8c", roughness: 0.5, metallic: 0.2 })
    })
  )
  .add(
    primitives.box({
      name: "base",
      position: [0, -0.1, 0],
      size: [BOARD_W + 0.4, 0.2, 0.7],
      material: material.pbr({ color: "#5a6a8c", roughness: 0.5, metallic: 0.2 })
    })
  )
  .add(
    instances.cylinder({
      name: "pegs",
      transforms: pegTransforms,
      material: material.pbr({ color: "#d9dee8", metallic: 0.9, roughness: 0.25 })
    })
  )
  .add(
    instances.box({
      name: "dividers",
      transforms: dividerTransforms,
      material: material.pbr({ color: "#e0b050", metallic: 0.6, roughness: 0.35 })
    })
  )
  .add(
    instances.box({
      name: "bin-floors",
      transforms: binFloorTransforms,
      colors: BIN_COLORS,
      material: material.pbr({ color: "#ffffff", roughness: 0.6, metallic: 0 })
    })
  )
  .add(
    instances.box({
      name: "bin-backs",
      transforms: binBackTransforms,
      colors: BIN_COLORS.map((c) => c),
      material: material.pbr({ color: "#ffffff", roughness: 0.9, metallic: 0, opacity: 1 })
    })
  );

for (let i = 0; i < BALL_COUNT; i += 1) {
  board = board.add(
    primitives
      .sphere({
        name: `ball-${i}`,
        position: [0, OFFSCREEN_Y, 0],
        size: BALL_R * 2,
        material: material.pbr({ color: "#ff4d2e", roughness: 0.2, metallic: 0.15 })
      })
      .runtime({ id: `ball-${i}`, mutable: true })
  );
}

// camera framing: vertical fov, looking straight at the board front
const FOV = 40;
const CAM_TARGET_Y = 5.5;
const CAM_DIST = 18.7;
board = board.camera(
  camera.perspective({ position: [0, CAM_TARGET_Y, CAM_DIST], target: [0, CAM_TARGET_Y, 0], fov: FOV })
);

// --------------------------------------------------------------- simulation
interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean;
  stuck: number;
}
const balls: Ball[] = [];
for (let i = 0; i < BALL_COUNT; i += 1) balls.push({ x: 0, y: OFFSCREEN_Y, vx: 0, vy: 0, active: false, stuck: 0 });

let spawned = 0;
let simTime = 0;
let nextSpawnTime = 0;
let dropping = false;
let settledTimer = 0;
let settled = false;
let accumulator = 0;

const binOf = (x: number): number => Math.max(0, Math.min(BIN_COUNT - 1, Math.floor((x + HALF_W) / BIN_W)));
const inBinZone = (b: Ball): boolean => b.active && b.y < DIV_H - BALL_R * 0.5;

function collideCircle(b: Ball, cx: number, cy: number, r: number): void {
  const dx = b.x - cx;
  const dy = b.y - cy;
  const min = BALL_R + r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return;
  let d = Math.sqrt(d2);
  let nx: number;
  let ny: number;
  if (d < 1e-9) {
    nx = 0;
    ny = 1;
    d = 0;
  } else {
    nx = dx / d;
    ny = dy / d;
  }
  b.x = cx + nx * min;
  b.y = cy + ny * min;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    const j = -(1 + RESTITUTION) * vn;
    b.vx += j * nx;
    b.vy += j * ny;
    // light tangential friction so balls do not slide on pegs forever
    const tx = -ny;
    const ty = nx;
    const vt = b.vx * tx + b.vy * ty;
    b.vx -= vt * 0.03 * tx;
    b.vy -= vt * 0.03 * ty;
  }
}

function collideDivider(b: Ball, dx: number): void {
  const cy = Math.max(0, Math.min(DIV_H, b.y));
  collideCircle(b, dx, cy, DIV_T);
}

function collideBalls(a: Ball, c: Ball): void {
  const dx = c.x - a.x;
  const dy = c.y - a.y;
  const min = BALL_R * 2;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return;
  let d = Math.sqrt(d2);
  let nx = 1;
  let ny = 0;
  if (d > 1e-9) {
    nx = dx / d;
    ny = dy / d;
  } else {
    d = 0;
  }
  const overlap = (min - d) / 2;
  a.x -= nx * overlap;
  a.y -= ny * overlap;
  c.x += nx * overlap;
  c.y += ny * overlap;
  const rvn = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
  if (rvn < 0) {
    const j = (-(1 + RESTITUTION) * rvn) / 2;
    a.vx -= j * nx;
    a.vy -= j * ny;
    c.vx += j * nx;
    c.vy += j * ny;
  }
}

function spawnBall(i: number): void {
  const b = balls[i];
  if (!b) return;
  const offset = (((i * 37) % 11) - 5) * 0.02;
  b.x = offset;
  b.y = SPAWN_Y;
  b.vx = 0;
  b.vy = 0;
  b.active = true;
  b.stuck = 0;
}

function step(): void {
  simTime += STEP;
  if (dropping) {
    while (spawned < BALL_COUNT && simTime >= nextSpawnTime) {
      spawnBall(spawned);
      spawned += 1;
      nextSpawnTime += SPAWN_INTERVAL;
    }
  }
  for (const b of balls) {
    if (!b.active) continue;
    b.vy -= GRAVITY * STEP;
    b.x += b.vx * STEP;
    b.y += b.vy * STEP;
  }
  for (let iter = 0; iter < 2; iter += 1) {
    for (let i = 0; i < BALL_COUNT; i += 1) {
      const b = balls[i];
      if (!b || !b.active) continue;
      // pegs only matter above the bins
      if (b.y > DIV_H) {
        for (const p of pegs) {
          if (Math.abs(p.y - b.y) < BALL_R + PEG_R + 0.05) collideCircle(b, p.x, p.y, PEG_R);
        }
      }
      if (b.y < DIV_H + BALL_R + DIV_T) {
        for (const dx of dividerXs) collideDivider(b, dx);
      }
      if (b.x < -HALF_W + BALL_R) {
        b.x = -HALF_W + BALL_R;
        if (b.vx < 0) b.vx = -b.vx * RESTITUTION;
      } else if (b.x > HALF_W - BALL_R) {
        b.x = HALF_W - BALL_R;
        if (b.vx > 0) b.vx = -b.vx * RESTITUTION;
      }
      if (b.y < BALL_R + 0.06) {
        b.y = BALL_R + 0.06;
        if (b.vy < 0) b.vy = -b.vy * RESTITUTION;
        b.vx *= 0.98;
      }
    }
    for (let i = 0; i < BALL_COUNT; i += 1) {
      const a = balls[i];
      if (!a || !a.active) continue;
      for (let j = i + 1; j < BALL_COUNT; j += 1) {
        const c = balls[j];
        if (c && c.active) collideBalls(a, c);
      }
    }
  }
  // deterministic anti-stall nudge for a ball balanced on a peg
  let maxSpeed = 0;
  let allIn = spawned === BALL_COUNT;
  for (let i = 0; i < BALL_COUNT; i += 1) {
    const b = balls[i];
    if (!b || !b.active) continue;
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > maxSpeed) maxSpeed = speed;
    if (!inBinZone(b)) {
      allIn = false;
      if (speed < 0.05) {
        b.stuck += STEP;
        if (b.stuck > 0.5) {
          b.vx += i % 2 === 0 ? 0.6 : -0.6;
          b.stuck = 0;
        }
      } else {
        b.stuck = 0;
      }
    }
  }
  if (dropping && allIn && maxSpeed < 0.25) {
    settledTimer += STEP;
    if (settledTimer > 0.5) settled = true;
  } else {
    settledTimer = 0;
  }
}

// -------------------------------------------------------------------- state
interface TaskState {
  phase: "ready" | "dropping" | "settled";
  spawned: number;
  bins: number[];
  total: number;
}
const state: TaskState = { phase: "ready", spawned: 0, bins: [0, 0, 0, 0, 0, 0, 0], total: 0 };
Object.defineProperty(window, "__TASK_STATE__", {
  get: () => state,
  set: () => undefined,
  configurable: false,
  enumerable: true
});

function updateState(): void {
  const bins = [0, 0, 0, 0, 0, 0, 0];
  for (const b of balls) {
    if (inBinZone(b)) {
      const idx = binOf(b.x);
      bins[idx] = (bins[idx] ?? 0) + 1;
    }
  }
  for (let i = 0; i < BIN_COUNT; i += 1) state.bins[i] = bins[i] ?? 0;
  state.total = state.bins.reduce((s, n) => s + n, 0);
  state.spawned = spawned;
  state.phase = !dropping ? "ready" : settled ? "settled" : "dropping";
}

// ----------------------------------------------------------------------- UI
const canvas = document.getElementById("app");
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("#app canvas missing");
const wrapper = document.createElement("div");
wrapper.style.cssText = "position:relative;width:640px;height:360px;overflow:hidden;";
canvas.parentNode?.insertBefore(wrapper, canvas);
wrapper.appendChild(canvas);

const K = 180 / (CAM_DIST * Math.tan((FOV * Math.PI) / 360));
const sx = (x: number): number => 320 + x * K;
const sy = (y: number): number => 180 - (y - CAM_TARGET_Y) * K;

const overlay = document.createElement("div");
overlay.style.cssText = "position:absolute;left:0;top:0;width:640px;height:360px;pointer-events:none;";
wrapper.appendChild(overlay);

const btnStyle =
  "pointer-events:auto;display:block;width:150px;margin:0 0 8px 0;padding:8px 10px;font:600 13px system-ui,sans-serif;" +
  "color:#fff;background:#2d5bd6;border:1px solid #6f95ff;border-radius:6px;cursor:pointer;";

const panel = document.createElement("div");
panel.style.cssText = "position:absolute;left:14px;top:14px;width:160px;";
const dropBtn = document.createElement("button");
dropBtn.id = "drop-btn";
dropBtn.textContent = "Drop 20 Balls";
dropBtn.style.cssText = btnStyle;
const resetBtn = document.createElement("button");
resetBtn.id = "reset-btn";
resetBtn.textContent = "Reset";
resetBtn.style.cssText = btnStyle + "background:#444b5e;border-color:#8a93aa;";
panel.appendChild(dropBtn);
panel.appendChild(resetBtn);
overlay.appendChild(panel);

const info = document.createElement("div");
info.style.cssText =
  "position:absolute;right:14px;top:14px;width:170px;text-align:right;font:13px/1.5 system-ui,sans-serif;color:#dfe6ff;" +
  "text-shadow:0 1px 2px #000;";
overlay.appendChild(info);

const binLabels: HTMLDivElement[] = [];
const binCounts: HTMLSpanElement[] = [];
for (let i = 0; i < BIN_COUNT; i += 1) {
  const label = document.createElement("div");
  label.className = "bin-label";
  label.dataset.bin = String(i + 1);
  label.style.cssText =
    `position:absolute;left:${sx(binCenter(i)) - BIN_W * K * 0.5}px;top:${sy(0) + 4}px;width:${BIN_W * K}px;` +
    `text-align:center;font:700 14px/1.1 system-ui,sans-serif;color:${BIN_COLORS[i] ?? "#fff"};`;
  const num = document.createElement("div");
  num.className = "bin-number";
  num.textContent = String(i + 1);
  const cnt = document.createElement("span");
  cnt.className = "bin-count";
  cnt.dataset.bin = String(i + 1);
  cnt.style.cssText = "display:block;font:600 13px/1.3 system-ui,sans-serif;color:#fff;";
  cnt.textContent = "0";
  label.appendChild(num);
  label.appendChild(cnt);
  overlay.appendChild(label);
  binLabels.push(label);
  binCounts.push(cnt);
}

function refreshUi(): void {
  for (let i = 0; i < BIN_COUNT; i += 1) {
    const el = binCounts[i];
    const text = String(state.bins[i] ?? 0);
    if (el && el.textContent !== text) el.textContent = text;
  }
  const text = `Phase: ${state.phase}<br>Spawned: ${state.spawned} / ${BALL_COUNT}<br>Total in bins: ${state.total}`;
  if (info.innerHTML !== text) info.innerHTML = text;
}

// ---------------------------------------------------------------------- app
const app = createAuraApp("#app", { scene: board });

function hideBall(i: number): void {
  const node = app.nodes.require(`ball-${i}`);
  node.setPosition(0, OFFSCREEN_Y, 0);
}

function resetAll(): void {
  for (let i = 0; i < BALL_COUNT; i += 1) {
    const b = balls[i];
    if (b) {
      b.active = false;
      b.x = 0;
      b.y = OFFSCREEN_Y;
      b.vx = 0;
      b.vy = 0;
      b.stuck = 0;
    }
    hideBall(i);
  }
  spawned = 0;
  simTime = 0;
  nextSpawnTime = 0;
  dropping = false;
  settled = false;
  settledTimer = 0;
  accumulator = 0;
  updateState();
  refreshUi();
}

function startDrop(): void {
  if (dropping && !settled) return;
  if (dropping) resetAll();
  dropping = true;
  settled = false;
  settledTimer = 0;
  simTime = 0;
  nextSpawnTime = 0;
  accumulator = 0;
  updateState();
  refreshUi();
}

dropBtn.addEventListener("click", startDrop);
resetBtn.addEventListener("click", resetAll);

app.onFrame((frame) => {
  const dt = Math.min(Math.max(frame.dt, 0), MAX_FRAME_SIM);
  if (dropping && !settled) {
    accumulator += dt;
    while (accumulator >= STEP) {
      accumulator -= STEP;
      step();
      if (settled) break;
    }
  }
  for (let i = 0; i < BALL_COUNT; i += 1) {
    const b = balls[i];
    if (b && b.active) app.nodes.require(`ball-${i}`).setPosition(b.x, b.y, 0);
  }
  updateState();
  refreshUi();
});

updateState();
refreshUi();

void app.ready().then(() => {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      (window as unknown as { __EVAL_READY__: boolean }).__EVAL_READY__ = true;
    })
  );
});
