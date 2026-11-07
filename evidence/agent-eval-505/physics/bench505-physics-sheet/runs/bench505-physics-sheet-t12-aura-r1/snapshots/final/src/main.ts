import { camera, createAuraApp, environments, lights, material, primitives, scene } from "@aura3d/engine";

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

// ---------- layout (world units, board front faces +z) ----------
const BOARD_W = 8;
const HALF_W = BOARD_W / 2;
const BIN_COUNT = 7;
const BIN_W = BOARD_W / BIN_COUNT;
const BIN_H = 2;
const BOARD_TOP = 14; // board spans y = 2..14 above 2 units of bins (12 tall)
const BALL_R = 0.15;
const PEG_R = 0.12;
const BALL_COUNT = 20;
const SPAWN_INTERVAL = 0.25;
const SPAWN_Y = 13.7;
const RESTITUTION = 0.4;
const GRAVITY = 9.8;
const STEP = 1 / 240;
const DIVIDER_R = 0.04;

const CAM_Y = 6.6;
const CAM_D = 22;
const FOV = 40;
const PX_PER_UNIT = 180 / (CAM_D * Math.tan((FOV * Math.PI) / 360));

// ---------- pegs ----------
const pegs: Array<[number, number]> = [];
for (let r = 0; r < 8; r += 1) {
  const y = 12.4 - r * 1.15;
  const count = r % 2 === 0 ? 6 : 7;
  for (let k = 0; k < count; k += 1) {
    const x = (k - (count - 1) / 2) * BIN_W;
    pegs.push([x, y]);
  }
}

// ---------- scene ----------
const matPeg = material.pbr({ color: "#d3dbe8", metallic: 0.9, roughness: 0.25 });
const matBall = material.pbr({ color: "#ff7a2f", metallic: 0.1, roughness: 0.3 });
const matBin = material.pbr({ color: "#2f8f9d", metallic: 0.2, roughness: 0.6 });
const matDivider = material.pbr({ color: "#e8c15a", metallic: 0.5, roughness: 0.4 });
const matBack = material.pbr({ color: "#1d2540", metallic: 0, roughness: 0.9 });
const matWall = material.pbr({ color: "#4a5683", metallic: 0.3, roughness: 0.5 });
const matGlass = material.pbr({ color: "#bfe4ff", metallic: 0, roughness: 0.05, opacity: 0.1 });

let sc = scene({ background: "#0b0e18" })
  .camera(camera.perspective({ position: [0, CAM_Y, CAM_D], target: [0, CAM_Y, 0], fov: FOV, near: 1, far: 100 }))
  .add(environments.neutral({ intensity: 0.45, background: false }))
  .add(lights.directional({ name: "key", position: [-6, 13, 14], target: [0, 7, 0], intensity: 3.2, shadow: true }))
  .add(lights.directional({ name: "rim", position: [5, 9, -9], target: [0, 7, 0], intensity: 4, color: "#6aa8ff" }))
  .add(primitives.box({ name: "back", size: [BOARD_W + 0.4, BOARD_TOP, 0.2], material: matBack }).position(0, BOARD_TOP / 2, -0.35))
  .add(primitives.box({ name: "wall-l", size: [0.2, BOARD_TOP, 0.8], material: matWall }).position(-HALF_W - 0.1, BOARD_TOP / 2, 0))
  .add(primitives.box({ name: "wall-r", size: [0.2, BOARD_TOP, 0.8], material: matWall }).position(HALF_W + 0.1, BOARD_TOP / 2, 0))
  .add(primitives.box({ name: "bin-floor", size: [BOARD_W + 0.4, 0.2, 0.8], material: matBin }).position(0, -0.1, 0))
  .add(primitives.box({ name: "glass", size: [BOARD_W, BOARD_TOP, 0.04], material: matGlass, castShadow: false }).position(0, BOARD_TOP / 2, 0.4));

for (let k = 1; k < BIN_COUNT; k += 1) {
  sc = sc.add(
    primitives.box({ name: `divider${k}`, size: [DIVIDER_R * 2, BIN_H, 0.5], material: matDivider }).position(-HALF_W + k * BIN_W, BIN_H / 2, 0)
  );
}
pegs.forEach(([x, y], i) => {
  sc = sc.add(
    primitives.cylinder({ name: `peg${i}`, size: [PEG_R * 2, 0.5, PEG_R * 2], material: matPeg }).position(x, y, 0).rotate(Math.PI / 2, 0, 0)
  );
});
for (let i = 0; i < BALL_COUNT; i += 1) {
  sc = sc.add(
    primitives.sphere({ name: `ball${i}`, size: BALL_R * 2, material: matBall }).position(0, -50, 0).runtime({ id: `ball${i}`, mutable: true })
  );
}

// ---------- physics (fixed step, deterministic) ----------
interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  still: number;
}
let balls: Ball[] = [];
let rng = 12345;
const jitter = (): number => {
  rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
  return rng / 4294967296 - 0.5;
};

function collideCircle(b: Ball, cx: number, cy: number, cr: number, jit: boolean): void {
  let dx = b.x - cx;
  let dy = b.y - cy;
  const minD = BALL_R + cr;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minD * minD) return;
  if (jit) dx += jitter() * 0.006;
  if (d2 < 1e-12) dy = 1e-6;
  const d = Math.hypot(dx, dy);
  const nx = dx / d;
  const ny = dy / d;
  b.x = cx + nx * minD;
  b.y = cy + ny * minD;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    const e = -vn < 0.3 ? 0 : RESTITUTION;
    b.vx -= (1 + e) * vn * nx;
    b.vy -= (1 + e) * vn * ny;
    // light tangential friction
    const tx = -ny;
    const ty = nx;
    const vt = b.vx * tx + b.vy * ty;
    b.vx -= vt * 0.03 * tx;
    b.vy -= vt * 0.03 * ty;
  }
}

function step(): void {
  for (const b of balls) {
    b.vy -= GRAVITY * STEP;
    b.x += b.vx * STEP;
    b.y += b.vy * STEP;
    for (const [px, py] of pegs) {
      if (Math.abs(b.x - px) < 0.5 && Math.abs(b.y - py) < 0.5) collideCircle(b, px, py, PEG_R, true);
    }
    if (b.y < BIN_H + 0.2) {
      for (let k = 1; k < BIN_COUNT; k += 1) {
        const dxk = -HALF_W + k * BIN_W;
        if (Math.abs(b.x - dxk) < 0.5) collideCircle(b, dxk, Math.min(Math.max(b.y, 0), BIN_H), DIVIDER_R, false);
      }
    }
    // side walls
    if (b.x < -HALF_W + BALL_R) {
      b.x = -HALF_W + BALL_R;
      if (b.vx < 0) b.vx = -b.vx * RESTITUTION;
    } else if (b.x > HALF_W - BALL_R) {
      b.x = HALF_W - BALL_R;
      if (b.vx > 0) b.vx = -b.vx * RESTITUTION;
    }
    // bin floor
    if (b.y < BALL_R) {
      b.y = BALL_R;
      if (b.vy < 0) b.vy = -b.vy < 0.3 ? 0 : -b.vy * RESTITUTION;
      b.vx *= 0.98;
    }
  }
  for (let i = 0; i < balls.length; i += 1) {
    const a = balls[i]!;
    for (let j = i + 1; j < balls.length; j += 1) {
      const c = balls[j]!;
      let dx = c.x - a.x;
      const dy = c.y - a.y;
      const minD = BALL_R * 2;
      if (Math.abs(dx) >= minD || Math.abs(dy) >= minD) continue;
      if (dx * dx + dy * dy >= minD * minD) continue;
      if (dx === 0 && dy === 0) dx = 1e-6;
      const d = Math.hypot(dx, dy);
      const nx = dx / d;
      const ny = dy / d;
      const overlap = (minD - d) / 2;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      c.x += nx * overlap;
      c.y += ny * overlap;
      const vn = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
      if (vn < 0) {
        const e = -vn < 0.3 ? 0 : RESTITUTION;
        const imp = (-(1 + e) * vn) / 2;
        a.vx -= imp * nx;
        a.vy -= imp * ny;
        c.vx += imp * nx;
        c.vy += imp * ny;
      }
    }
  }
  // unstick balls balanced on pegs / divider tops
  for (let i = 0; i < balls.length; i += 1) {
    const b = balls[i]!;
    if (b.y >= BIN_H && Math.hypot(b.vx, b.vy) < 0.1) {
      b.still += STEP;
      if (b.still > 0.5) {
        b.vx += (jitter() < 0 ? -1 : 1) * 0.8;
        b.still = 0;
      }
    } else {
      b.still = 0;
    }
  }
}

// ---------- state ----------
let phase: TaskState["phase"] = "ready";
let spawned = 0;
let simTime = 0;
let accumulator = 0;
let settleTimer = 0;
let state: TaskState = { phase: "ready", spawned: 0, bins: new Array<number>(BIN_COUNT).fill(0), total: 0 };
Object.defineProperty(window, "__TASK_STATE__", { get: () => state, set: () => undefined, enumerable: true, configurable: false });

function binOf(x: number): number {
  return Math.min(BIN_COUNT - 1, Math.max(0, Math.floor((x + HALF_W) / BIN_W)));
}

function startDrop(): void {
  if (phase === "dropping") return;
  resetAll();
  phase = "dropping";
}

function resetAll(): void {
  balls = [];
  spawned = 0;
  simTime = 0;
  accumulator = 0;
  settleTimer = 0;
  rng = 12345;
  phase = "ready";
}

// ---------- DOM overlay (buttons + bin labels) ----------
const overlay = document.createElement("div");
overlay.style.cssText = "position:absolute;left:0;top:0;width:640px;height:360px;pointer-events:none;overflow:hidden;font-family:system-ui,sans-serif;color:#fff";
document.body.appendChild(overlay);

function makeButton(text: string, top: number, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = text;
  btn.style.cssText = `position:absolute;left:14px;top:${top}px;width:140px;padding:8px 0;font-size:14px;font-weight:600;border:0;border-radius:6px;background:#ff7a2f;color:#111;cursor:pointer;pointer-events:auto`;
  btn.addEventListener("click", onClick);
  overlay.appendChild(btn);
  return btn;
}
makeButton("Drop 20 Balls", 14, startDrop);
makeButton("Reset", 56, resetAll);

const info = document.createElement("div");
info.style.cssText = "position:absolute;right:14px;top:14px;width:150px;font-size:13px;line-height:1.5;text-align:right;color:#cfd8f0";
overlay.appendChild(info);

const kPx = PX_PER_UNIT;
const countEls: HTMLDivElement[] = [];
for (let k = 0; k < BIN_COUNT; k += 1) {
  const cx = 320 + (-HALF_W + (k + 0.5) * BIN_W) * kPx;
  const top = 180 - (-0.15 - CAM_Y) * kPx;
  const label = document.createElement("div");
  label.style.cssText = `position:absolute;left:${cx - 20}px;top:${top}px;width:40px;text-align:center;line-height:1.1`;
  const num = document.createElement("div");
  num.textContent = String(k + 1);
  num.style.cssText = "font-size:16px;font-weight:700;color:#ffe08a";
  const cnt = document.createElement("div");
  cnt.textContent = "0";
  cnt.style.cssText = "font-size:13px;color:#7fe0ee";
  label.appendChild(num);
  label.appendChild(cnt);
  overlay.appendChild(label);
  countEls.push(cnt);
}

// ---------- app ----------
const app = createAuraApp("#app", { scene: sc });
const ballNodes = Array.from({ length: BALL_COUNT }, (_, i) => app.nodes.require(`ball${i}`));

app.onFrame((f) => {
  const dt = Math.min(Math.max(f.dt, 0), 0.1);
  if (phase === "dropping") {
    accumulator += dt;
    while (accumulator >= STEP) {
      accumulator -= STEP;
      while (spawned < BALL_COUNT && simTime >= spawned * SPAWN_INTERVAL - 1e-9) {
        const off = (((spawned * 37) % 11) - 5) * 0.02;
        balls.push({ x: off, y: SPAWN_Y, vx: 0, vy: 0, still: 0 });
        spawned += 1;
      }
      step();
      simTime += STEP;
    }
  }

  const bins = new Array<number>(BIN_COUNT).fill(0);
  for (const b of balls) {
    if (b.y < BIN_H && Math.hypot(b.vx, b.vy) < 0.25) bins[binOf(b.x)]! += 1;
  }
  const total = bins.reduce((s, n) => s + n, 0);

  if (phase === "dropping") {
    if (spawned === BALL_COUNT && total === BALL_COUNT) {
      settleTimer += dt;
      if (settleTimer > 0.5) phase = "settled";
    } else {
      settleTimer = 0;
    }
  }

  for (let i = 0; i < BALL_COUNT; i += 1) {
    const b = balls[i];
    if (b) ballNodes[i]!.setPosition(b.x, b.y, 0);
    else ballNodes[i]!.setPosition(0, -50, 0);
  }

  for (let k = 0; k < BIN_COUNT; k += 1) {
    const t = String(bins[k]);
    if (countEls[k]!.textContent !== t) countEls[k]!.textContent = t;
  }
  info.textContent = `Dropped ${spawned}/${BALL_COUNT} · In bins ${total} · ${phase}`;

  state = { phase, spawned, bins, total };
});

await app.ready();
window.__EVAL_READY__ = true;
