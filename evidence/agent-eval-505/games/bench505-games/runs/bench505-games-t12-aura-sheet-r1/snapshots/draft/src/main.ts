import { camera, createAuraApp, environments, group, lights, material, primitives, scene } from "@aura3d/engine";

type TaskStatus = "playing" | "won" | "lost";

declare global {
  interface Window {
    __TASK_STATE__?: { status: TaskStatus; score: number; height: number };
    __TASK_READY__?: boolean;
  }
}

const SLAB_H = 0.5;
const SLAB_D = 3;
const BASE_W = 3.2;
const RANGE = 4.5; // slab slides between -RANGE and +RANGE
const TOLERANCE = 0.12;
const WIN_HEIGHT = 25;
const LEVELS = WIN_HEIGHT + 1; // base + 25 stacked
const HIDDEN_Y = -200;

const levelColor = (level: number): string => `hsl(${(200 + level * 11) % 360}, 65%, 55%)`;

// ---------- scene ----------
const kids = [
  primitives.plane({ name: "floor", size: [60, 1, 60], material: material.pbr({ color: "#1d2433", roughness: 1 }) }).position(0, -0.01, 0)
];
for (let i = 0; i < LEVELS; i += 1) {
  const mat = material.pbr({ color: levelColor(i), roughness: 0.45 });
  kids.push(
    primitives
      .box({ name: `slab-${i}`, size: [1, 1, 1], material: mat })
      .position(0, i === 0 ? SLAB_H / 2 : HIDDEN_Y, 0)
      .scale([BASE_W, SLAB_H, SLAB_D])
      .runtime({ id: `slab-${i}`, mutable: true })
  );
  kids.push(
    primitives
      .box({ name: `debris-${i}`, size: [1, 1, 1], material: mat })
      .position(0, HIDDEN_Y, 0)
      .scale([1, SLAB_H, SLAB_D])
      .runtime({ id: `debris-${i}`, mutable: true })
  );
}

const sc = scene({ background: "#0f131c" })
  .camera(camera.perspective({ position: [9, 8, 11], target: [0, 3.2, 0], fov: 40, near: 0.5, far: 200 }))
  .add(environments.neutral({ intensity: 0.5, background: false }))
  .add(lights.hemisphere({ skyColor: "#dbe6ff", groundColor: "#3a3f55", intensity: 0.9 }))
  .add(lights.directional({ position: [6, 14, 8], target: [0, 3, 0], intensity: 2.6, shadow: true }))
  .add(group("world", kids, { position: [0, 0, 0] }).runtime({ id: "world", mutable: true }));

const app = createAuraApp("#app", { scene: sc });

// ---------- HUD (DOM, outside the canvas) ----------
const hud = document.createElement("div");
hud.id = "hud";
hud.style.cssText = "width:640px;box-sizing:border-box;padding:6px 10px;display:flex;gap:18px;font:14px/1.4 system-ui,sans-serif;background:#000;color:#fff";
const mk = (id: string): HTMLSpanElement => {
  const el = document.createElement("span");
  el.id = id;
  hud.appendChild(el);
  return el;
};
const scoreEl = mk("hud-score");
const bestEl = mk("hud-best");
const statusEl = mk("hud-status");
const msgEl = mk("hud-msg");
msgEl.style.marginLeft = "auto";
msgEl.style.color = "#ffd54a";
document.body.appendChild(hud);

// ---------- game state ----------
interface Slab { cx: number; w: number }
interface Falling {
  id: string;
  x: number; y: number; z: number;
  vx: number; vy: number;
  rx: number; rz: number; vrx: number; vrz: number;
  w: number;
}

let status: TaskStatus = "playing";
let score = 0;
let best = 0;
let stack: Slab[] = [{ cx: 0, w: BASE_W }];
let mx = 0; // moving slab x
let mdir = 1;
let mw = BASE_W;
let speed = 2.4;
let offset = 0; // world scroll
let falling: Falling[] = [];
let message = "";
let messageTime = 0;
let inited = false;

const node = (id: string) => app.nodes.require(id);
const slabY = (level: number): number => level * SLAB_H + SLAB_H / 2;

function publish(): void {
  window.__TASK_STATE__ = { status, score, height: stack.length - 1 };
  scoreEl.textContent = `Score: ${score}`;
  bestEl.textContent = `Best: ${best}`;
  statusEl.textContent = `Status: ${status}`;
  msgEl.textContent =
    status === "won" ? "You win! Press R or click to restart"
    : status === "lost" ? "Missed! Press R or click to restart"
    : message;
}

function spawnMoving(): void {
  const level = stack.length;
  const height = level - 1;
  mw = stack[stack.length - 1]!.w;
  mdir = level % 2 === 0 ? 1 : -1;
  mx = -mdir * RANGE;
  speed = Math.min(8, 2.4 + 0.45 * Math.floor(height / 3));
  node(`slab-${level}`).setTransform({ position: [mx, slabY(level), 0], rotation: [0, 0, 0], scale: [mw, SLAB_H, SLAB_D] }).setVisible(true);
}

function resetGame(): void {
  for (let i = 0; i < LEVELS; i += 1) {
    node(`slab-${i}`).setTransform({ position: [0, HIDDEN_Y, 0], rotation: [0, 0, 0], scale: [BASE_W, SLAB_H, SLAB_D] });
    node(`debris-${i}`).setTransform({ position: [0, HIDDEN_Y, 0], rotation: [0, 0, 0], scale: [1, SLAB_H, SLAB_D] });
  }
  falling = [];
  stack = [{ cx: 0, w: BASE_W }];
  score = 0;
  status = "playing";
  message = "";
  offset = 0;
  node("world").setPosition(0, 0, 0);
  node("slab-0").setPosition(0, slabY(0), 0);
  spawnMoving();
  publish();
}

function drop(): void {
  if (status !== "playing") return;
  const level = stack.length;
  const top = stack[stack.length - 1]!;
  const slab = node(`slab-${level}`);
  const delta = mx - top.cx;
  const abs = Math.abs(delta);

  if (abs >= mw) {
    // complete miss: the whole slab falls
    status = "lost";
    best = Math.max(best, score);
    falling.push({ id: `slab-${level}`, x: mx, y: slabY(level), z: 0, vx: delta > 0 ? 1.5 : -1.5, vy: 0, rx: 0, rz: 0, vrx: 0.5, vrz: delta > 0 ? -1.2 : 1.2, w: mw });
    publish();
    return;
  }

  if (abs <= TOLERANCE) {
    // perfect: snap onto the tower, keep the width
    stack.push({ cx: top.cx, w: top.w });
    slab.setTransform({ position: [top.cx, slabY(level), 0], scale: [top.w, SLAB_H, SLAB_D] });
    score += 2; // slab + bonus
    message = "Perfect! +1";
    messageTime = 1.2;
  } else {
    const left = Math.max(mx - mw / 2, top.cx - top.w / 2);
    const right = Math.min(mx + mw / 2, top.cx + top.w / 2);
    const w = right - left;
    const cx = (left + right) / 2;
    stack.push({ cx, w });
    slab.setTransform({ position: [cx, slabY(level), 0], scale: [w, SLAB_H, SLAB_D] });
    // overhang piece
    const oLeft = delta > 0 ? right : mx - mw / 2;
    const oRight = delta > 0 ? mx + mw / 2 : left;
    const ow = oRight - oLeft;
    const ocx = (oLeft + oRight) / 2;
    node(`debris-${level}`).setTransform({ position: [ocx, slabY(level), 0], rotation: [0, 0, 0], scale: [ow, SLAB_H, SLAB_D] }).setVisible(true);
    falling.push({ id: `debris-${level}`, x: ocx, y: slabY(level), z: 0, vx: delta > 0 ? 1.2 : -1.2, vy: 0, rx: 0, rz: 0, vrx: 0.4, vrz: delta > 0 ? -1.5 : 1.5, w: ow });
    score += 1;
    message = "";
  }

  best = Math.max(best, score);
  if (stack.length - 1 >= WIN_HEIGHT) {
    status = "won";
    publish();
    return;
  }
  spawnMoving();
  publish();
}

function restart(): void {
  resetGame();
}

// ---------- input ----------
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat && inited) drop();
  } else if (e.code === "KeyR") {
    if (inited) restart();
  }
});
const canvas = document.getElementById("app") as HTMLCanvasElement;
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (!inited) return;
  if (status === "playing") drop();
  else restart();
});

// ---------- frame loop ----------
app.onFrame((f) => {
  if (!inited) {
    if (!app.nodes.has("world")) return;
    inited = true;
    resetGame();
  }
  const dt = Math.min(f.dt, 0.05);

  if (status === "playing") {
    mx += mdir * speed * dt;
    if (mx > RANGE) { mx = RANGE; mdir = -1; }
    else if (mx < -RANGE) { mx = -RANGE; mdir = 1; }
    node(`slab-${stack.length}`).setPosition(mx, slabY(stack.length), 0);
  }

  if (messageTime > 0) {
    messageTime -= dt;
    if (messageTime <= 0 && message !== "") { message = ""; publish(); }
  }

  // falling pieces
  const alive: Falling[] = [];
  for (const p of falling) {
    p.vy -= 24 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rx += p.vrx * dt;
    p.rz += p.vrz * dt;
    const h = node(p.id);
    if (p.y < -30) {
      h.setVisible(false);
      h.setPosition(0, HIDDEN_Y, 0);
    } else {
      h.setPosition(p.x, p.y, p.z);
      h.setRotation(p.rx, 0, p.rz);
      alive.push(p);
    }
  }
  falling = alive;

  // camera follow: scroll the world down so the top stays in view
  const target = Math.max(0, (stack.length + 1) * SLAB_H - 4.5);
  offset += (target - offset) * Math.min(1, dt * 5);
  node("world").setPosition(0, -offset, 0);
});

await app.ready();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__TASK_READY__ = true;
  });
});
publish();
