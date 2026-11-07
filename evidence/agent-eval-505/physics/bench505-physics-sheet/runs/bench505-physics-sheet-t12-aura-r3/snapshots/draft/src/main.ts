import { camera, createAuraApp, environments, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: TaskState;
  }
}

interface TaskState {
  phase: "ready" | "dropping" | "settled";
  spawned: number;
  bins: number[];
  total: number;
}

// ---------- layout ----------
const HALF_W = 4;
const BIN_COUNT = 7;
const BIN_W = (HALF_W * 2) / BIN_COUNT;
const FLOOR_Y = -2;
const DIVIDER_TOP = 1;
const BOARD_TOP = 12;
const BALL_COUNT = 20;
const BALL_R = 0.15;
const PEG_R = 0.12;
const ROWS = 9;
const ROW_TOP = 10.4;
const ROW_STEP = 0.9;
const SPAWN_Y = 11.6;
const SPAWN_INTERVAL = 0.25;

// ---------- physics (fixed step, 2D in the board plane) ----------
const DT = 1 / 240;
const GRAVITY = 9.8;
const RESTITUTION = 0.4;

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean;
  asleep: boolean;
  slow: number;
}

interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  r: number;
}

const statics: Seg[] = [];
const pegTransforms: AuraTransformSpec[] = [];
for (let r = 0; r < ROWS; r += 1) {
  const y = ROW_TOP - r * ROW_STEP;
  const wide = r % 2 === 1; // row 0 has 6 pegs (above the dividers), next row 7
  const n = wide ? 7 : 6;
  for (let j = 0; j < n; j += 1) {
    const x = wide ? -HALF_W + (j + 0.5) * BIN_W : -HALF_W + (j + 1) * BIN_W;
    statics.push({ ax: x, ay: y, bx: x, by: y, r: PEG_R });
    pegTransforms.push({ position: [x, y, 0], rotation: [Math.PI / 2, 0, 0], scale: [PEG_R * 2, 0.6, PEG_R * 2] });
  }
}
const dividerXs: number[] = [];
for (let k = 1; k < BIN_COUNT; k += 1) {
  const x = -HALF_W + k * BIN_W;
  dividerXs.push(x);
  statics.push({ ax: x, ay: FLOOR_Y, bx: x, by: DIVIDER_TOP, r: 0.04 });
}
statics.push({ ax: -HALF_W, ay: FLOOR_Y, bx: -HALF_W, by: BOARD_TOP + 2, r: 0 });
statics.push({ ax: HALF_W, ay: FLOOR_Y, bx: HALF_W, by: BOARD_TOP + 2, r: 0 });
statics.push({ ax: -HALF_W, ay: FLOOR_Y, bx: HALF_W, by: FLOOR_Y, r: 0 });

const balls: Ball[] = [];
for (let i = 0; i < BALL_COUNT; i += 1) balls.push({ x: 0, y: -50, vx: 0, vy: 0, active: false, asleep: false, slow: 0 });

let simTime = 0;
let dropping = false;
let spawned = 0;
let acc = 0;

function resolveStatic(b: Ball, s: Seg): void {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((b.x - s.ax) * dx + (b.y - s.ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = s.ax + dx * t;
  const py = s.ay + dy * t;
  let nx = b.x - px;
  let ny = b.y - py;
  const minD = BALL_R + s.r;
  const d2 = nx * nx + ny * ny;
  if (d2 >= minD * minD) return;
  let d = Math.sqrt(d2);
  if (d < 1e-9) {
    nx = 0;
    ny = 1;
    d = 0;
  } else {
    nx /= d;
    ny /= d;
  }
  b.x += nx * (minD - d);
  b.y += ny * (minD - d);
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    const e = vn < -0.8 ? RESTITUTION : 0;
    b.vx -= (1 + e) * vn * nx;
    b.vy -= (1 + e) * vn * ny;
    // light tangential friction
    const tx = -ny;
    const ty = nx;
    const vt = b.vx * tx + b.vy * ty;
    b.vx -= vt * 0.02 * tx;
    b.vy -= vt * 0.02 * ty;
  }
}

function resolvePair(a: Ball, b: Ball): void {
  if (a.asleep && b.asleep) return;
  let nx = b.x - a.x;
  let ny = b.y - a.y;
  const minD = BALL_R * 2;
  const d2 = nx * nx + ny * ny;
  if (d2 >= minD * minD) return;
  let d = Math.sqrt(d2);
  if (d < 1e-9) {
    nx = 0;
    ny = 1;
    d = 0;
  } else {
    nx /= d;
    ny /= d;
  }
  const pen = minD - d;
  const wa = a.asleep ? 0 : 1;
  const wb = b.asleep ? 0 : 1;
  const wsum = wa + wb;
  a.x -= (nx * pen * wa) / wsum;
  a.y -= (ny * pen * wa) / wsum;
  b.x += (nx * pen * wb) / wsum;
  b.y += (ny * pen * wb) / wsum;
  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (vn < 0) {
    if (-vn > 1.0) {
      a.asleep = false;
      b.asleep = false;
      a.slow = 0;
      b.slow = 0;
    }
    const e = vn < -0.8 ? RESTITUTION : 0;
    const j = (-(1 + e) * vn) / (a.asleep || b.asleep ? 1 : 2);
    if (!a.asleep) {
      a.vx -= j * nx;
      a.vy -= j * ny;
    }
    if (!b.asleep) {
      b.vx += j * nx;
      b.vy += j * ny;
    }
  }
}

function step(): void {
  simTime += DT;
  while (dropping && spawned < BALL_COUNT && simTime >= spawned * SPAWN_INTERVAL) {
    const i = spawned;
    const b = balls[i]!;
    b.x = ((i * 37) % 11 - 5) * 0.02;
    b.y = SPAWN_Y;
    b.vx = 0;
    b.vy = 0;
    b.active = true;
    b.asleep = false;
    b.slow = 0;
    spawned += 1;
  }
  for (const b of balls) {
    if (!b.active || b.asleep) continue;
    b.vy -= GRAVITY * DT;
    b.x += b.vx * DT;
    b.y += b.vy * DT;
  }
  for (let it = 0; it < 4; it += 1) {
    for (const b of balls) {
      if (!b.active || b.asleep) continue;
      for (const s of statics) {
        if (Math.abs(b.y - s.ay) > 20 && Math.abs(b.y - s.by) > 20) continue;
        resolveStatic(b, s);
      }
    }
    for (let i = 0; i < BALL_COUNT; i += 1) {
      const a = balls[i]!;
      if (!a.active) continue;
      for (let j = i + 1; j < BALL_COUNT; j += 1) {
        const b = balls[j]!;
        if (!b.active) continue;
        resolvePair(a, b);
      }
    }
  }
  for (let i = 0; i < BALL_COUNT; i += 1) {
    const b = balls[i]!;
    if (!b.active || b.asleep) continue;
    const speed = Math.hypot(b.vx, b.vy);
    if (b.y < DIVIDER_TOP - 0.1) {
      b.slow = speed < 0.15 ? b.slow + 1 : 0;
      if (b.slow > 120) {
        b.asleep = true;
        b.vx = 0;
        b.vy = 0;
      }
    } else {
      b.slow = speed < 0.05 ? b.slow + 1 : 0;
      if (b.slow > 90) {
        // deterministic nudge if a ball balances on a peg
        b.vx += i % 2 === 0 ? 0.4 : -0.4;
        b.slow = 0;
      }
    }
  }
}

// ---------- scene ----------
const camFov = 40;
const camY = 4.5;
const camZ = 7.9 / Math.tan((camFov / 2) * (Math.PI / 180));

const pegMat = material.pbr({ color: "#d7dde6", metallic: 0.9, roughness: 0.25 });
const ballMat = material.pbr({ color: "#ff7a1a", metallic: 0.1, roughness: 0.3 });
const binMatA = material.pbr({ color: "#1f6f8b", roughness: 0.7 });
const binMatB = material.pbr({ color: "#2a9d8f", roughness: 0.7 });
const dividerMat = material.pbr({ color: "#e9c46a", metallic: 0.5, roughness: 0.4 });
const frameMat = material.pbr({ color: "#3a3f55", metallic: 0.3, roughness: 0.6 });
const backMat = material.pbr({ color: "#141a2e", roughness: 0.9 });
const glassMat = material.pbr({ color: "#bfd8ff", roughness: 0.05, opacity: 0.07 });

let sc = scene({ background: "#0b0e18" })
  .camera(camera.perspective({ position: [0, camY, camZ], target: [0, camY, 0], fov: camFov, near: 1, far: 100 }))
  .add(environments.neutral({ intensity: 0.45, background: false }))
  .add(lights.directional({ name: "key", position: [-6, 10, 16], target: [0, 4, 0], intensity: 3.2, shadow: true }))
  .add(lights.directional({ name: "rim", position: [6, 7, -9], target: [0, 4, 0], intensity: 4, color: "#6fb5ff" }));

sc = sc
  .add(primitives.box({ name: "back", size: [HALF_W * 2 + 0.4, BOARD_TOP - FLOOR_Y + 0.4, 0.2], material: backMat }).position(0, (BOARD_TOP + FLOOR_Y) / 2, -0.35))
  .add(primitives.box({ name: "wallL", size: [0.2, BOARD_TOP - FLOOR_Y + 0.2, 0.7], material: frameMat }).position(-HALF_W - 0.1, (BOARD_TOP + FLOOR_Y) / 2, 0))
  .add(primitives.box({ name: "wallR", size: [0.2, BOARD_TOP - FLOOR_Y + 0.2, 0.7], material: frameMat }).position(HALF_W + 0.1, (BOARD_TOP + FLOOR_Y) / 2, 0))
  .add(primitives.box({ name: "floor", size: [HALF_W * 2 + 0.4, 0.2, 0.7], material: frameMat }).position(0, FLOOR_Y - 0.1, 0))
  .add(primitives.box({ name: "glass", size: [HALF_W * 2, BOARD_TOP - FLOOR_Y, 0.02], material: glassMat, castShadow: false }).position(0, (BOARD_TOP + FLOOR_Y) / 2, 0.4));

for (let k = 0; k < BIN_COUNT; k += 1) {
  const cx = -HALF_W + (k + 0.5) * BIN_W;
  sc = sc.add(
    primitives
      .box({ name: `binBack${k}`, size: [BIN_W - 0.1, DIVIDER_TOP - FLOOR_Y, 0.05], material: k % 2 === 0 ? binMatA : binMatB })
      .position(cx, (DIVIDER_TOP + FLOOR_Y) / 2, -0.2)
  );
}
dividerXs.forEach((x, k) => {
  sc = sc.add(primitives.box({ name: `divider${k}`, size: [0.08, DIVIDER_TOP - FLOOR_Y, 0.5], material: dividerMat }).position(x, (DIVIDER_TOP + FLOOR_Y) / 2, 0));
});
sc = sc.add(instances.cylinder({ name: "pegs", transforms: pegTransforms, material: pegMat, params: { radialSegments: 16 } }));
for (let i = 0; i < BALL_COUNT; i += 1) {
  sc = sc.add(primitives.sphere({ name: `ball${i}`, size: BALL_R * 2, material: ballMat }).position(0, -50, 0).runtime({ id: `ball${i}`, mutable: true }));
}

const app = createAuraApp("#app", { scene: sc });

// ---------- UI overlay ----------
const canvas = document.getElementById("app") as HTMLCanvasElement;
const rect = { w: 640, h: 360 };
const tanHalf = Math.tan((camFov / 2) * (Math.PI / 180));
const halfH = camZ * tanHalf;
const halfWd = halfH * (rect.w / rect.h);
const toScreen = (x: number, y: number): [number, number] => [rect.w / 2 + (x / halfWd) * (rect.w / 2), rect.h / 2 - ((y - camY) / halfH) * (rect.h / 2)];

const overlay = document.createElement("div");
overlay.style.cssText = `position:absolute;left:${canvas.offsetLeft}px;top:${canvas.offsetTop}px;width:${rect.w}px;height:${rect.h}px;pointer-events:none;overflow:hidden;font-family:system-ui,sans-serif;color:#fff`;
document.body.appendChild(overlay);

const btnCss = "pointer-events:auto;display:block;margin:0 0 6px 0;padding:6px 10px;font:600 12px system-ui,sans-serif;color:#fff;background:#2a6fdb;border:1px solid #8fb4ff;border-radius:4px;cursor:pointer";
const panel = document.createElement("div");
panel.style.cssText = "position:absolute;left:10px;top:10px";
const dropBtn = document.createElement("button");
dropBtn.textContent = "Drop 20 Balls";
dropBtn.style.cssText = btnCss;
const resetBtn = document.createElement("button");
resetBtn.textContent = "Reset";
resetBtn.style.cssText = btnCss.replace("#2a6fdb", "#555b6e");
panel.append(dropBtn, resetBtn);
overlay.appendChild(panel);

const info = document.createElement("div");
info.style.cssText = "position:absolute;right:10px;top:10px;text-align:right;font:12px/1.5 system-ui,sans-serif";
overlay.appendChild(info);

const binLabels: HTMLDivElement[] = [];
const labelW = Math.abs(toScreen(BIN_W, 0)[0] - toScreen(0, 0)[0]);
for (let k = 0; k < BIN_COUNT; k += 1) {
  const [sx, sy] = toScreen(-HALF_W + (k + 0.5) * BIN_W, FLOOR_Y - 0.25);
  const el = document.createElement("div");
  el.style.cssText = `position:absolute;left:${sx - labelW / 2}px;top:${sy}px;width:${labelW}px;text-align:center;font:700 11px/12px system-ui,sans-serif`;
  overlay.appendChild(el);
  binLabels.push(el);
}
const labelText: string[] = [];

dropBtn.addEventListener("click", () => {
  if (spawned === 0 && !dropping) {
    dropping = true;
    simTime = 0;
    acc = 0;
  }
});
resetBtn.addEventListener("click", () => {
  dropping = false;
  spawned = 0;
  simTime = 0;
  acc = 0;
  for (const b of balls) {
    b.active = false;
    b.asleep = false;
    b.slow = 0;
    b.vx = 0;
    b.vy = 0;
    b.x = 0;
    b.y = -50;
  }
});

// ---------- state ----------
const state: TaskState = { phase: "ready", spawned: 0, bins: [0, 0, 0, 0, 0, 0, 0], total: 0 };
Object.defineProperty(window, "__TASK_STATE__", { get: () => state, set: () => undefined, configurable: false, enumerable: true });

app.onFrame((f) => {
  acc += Math.min(f.dt, 0.1);
  while (acc >= DT) {
    acc -= DT;
    if (dropping) step();
  }
  const bins = [0, 0, 0, 0, 0, 0, 0];
  let allAsleep = true;
  for (let i = 0; i < BALL_COUNT; i += 1) {
    const b = balls[i]!;
    app.nodes.require(`ball${i}`).setPosition(b.x, b.active ? b.y : -50, 0);
    if (!b.active) continue;
    if (!b.asleep) allAsleep = false;
    if (b.y < DIVIDER_TOP - 0.1) {
      const k = Math.min(BIN_COUNT - 1, Math.max(0, Math.floor((b.x + HALF_W) / BIN_W)));
      bins[k] = (bins[k] ?? 0) + 1;
    }
  }
  let total = 0;
  for (let k = 0; k < BIN_COUNT; k += 1) {
    state.bins[k] = bins[k]!;
    total += bins[k]!;
  }
  state.total = total;
  state.spawned = spawned;
  state.phase = spawned === 0 ? "ready" : spawned < BALL_COUNT || !allAsleep ? "dropping" : "settled";
  for (let k = 0; k < BIN_COUNT; k += 1) {
    const text = `${k + 1}<br><span style="color:#ffd166">${bins[k]}</span>`;
    if (labelText[k] !== text) {
      labelText[k] = text;
      binLabels[k]!.innerHTML = text;
    }
  }
  info.textContent = `${state.phase} | spawned ${spawned}/${BALL_COUNT} | total ${total}`;
});

await app.ready();
window.__EVAL_READY__ = true;
