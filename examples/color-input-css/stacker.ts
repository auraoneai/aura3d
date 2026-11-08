import { camera, createAuraApp, environments, lights, material, primitives, scene } from "@aura3d/engine";

type Status = "playing" | "won" | "lost";

declare global {
  interface Window {
    __TASK_STATE__?: { status: Status; score: number; height: number };
    __TASK_READY__?: boolean;
  }
}

// ---- tuning ----
const SLAB_H = 0.5;
const SLAB_D = 3;
const BASE_W = 3;
const RANGE = 3.4; // slab centre travels within [-RANGE, RANGE]
const WIN_HEIGHT = 25;
const PERFECT_TOL = 0.12;
const BONUS = 1;
const MAX_LEVELS = WIN_HEIGHT + 1; // base + 25 stacked
const GRAVITY = 18;

const hue = (level: number): string => `hsl(${(205 + level * 9) % 360}, 65%, 58%)`;
const speedFor = (level: number): number => Math.min(2.6 + 0.4 * Math.floor(level / 3), 7);

// ---- scene ----
let stage = scene({ background: "#0f1424" })
  .add(environments.neutral({ intensity: 0.9, background: false }))
  .add(lights.hemisphere({ skyColor: "#cfe0ff", groundColor: "#2a2f45", intensity: 0.6 }))
  .add(lights.directional({ name: "key", position: [5, 9, 6], target: [0, 0, 0], intensity: 2.6, shadow: true }))
  .add(lights.directional({ name: "fill", position: [-6, 3, 4], target: [0, 0, 0], intensity: 0.8, color: "#9db8ff" }))
  .add(
    primitives
      .box({ name: "floor", size: [40, 0.4, 40], material: material.pbr({ color: "#1c2238", roughness: 0.9 }), receiveShadow: true })
      .runtime({ id: "floor", mutable: true })
  );

for (let i = 0; i < MAX_LEVELS; i += 1) {
  stage = stage.add(
    primitives
      .box({ name: `slab-${i}`, size: [1, 1, 1], material: material.pbr({ color: hue(i), roughness: 0.45, metallic: 0.1 }), castShadow: true, receiveShadow: true })
      .runtime({ id: `slab-${i}`, mutable: true })
  );
  stage = stage.add(
    primitives
      .box({ name: `cut-${i}`, size: [1, 1, 1], material: material.pbr({ color: hue(i), roughness: 0.45, metallic: 0.1 }), castShadow: true })
      .runtime({ id: `cut-${i}`, mutable: true })
  );
}
stage = stage.camera(camera.perspective({ position: [5.5, 4.2, 8], target: [0, 0.4, 0], fov: 42 }));

const app = createAuraApp("#app", { scene: stage, resize: false });
type Handle = ReturnType<typeof app.nodes.require>;

// ---- game state ----
interface Level { x: number; w: number }
interface Faller { node: Handle; x: number; y: number; w: number; vx: number; vy: number; rot: number; vrot: number; age: number }

let levels: Level[] = [];
let status: Status = "playing";
let score = 0;
let best = 0;
let activeX = 0;
let activeDir = 1;
let camY = 0;
let fallers: Faller[] = [];
let message = "";
let messageTime = 0;

const hud = document.createElement("div");
hud.id = "hud";
hud.style.cssText = "width:640px;display:flex;justify-content:space-between;padding:6px 8px;box-sizing:border-box;font:600 14px system-ui,sans-serif";
const scoreEl = document.createElement("span");
scoreEl.id = "hud-score";
const bestEl = document.createElement("span");
bestEl.id = "hud-best";
const statusEl = document.createElement("span");
statusEl.id = "hud-status";
const msgEl = document.createElement("span");
msgEl.id = "hud-message";
const mk = (label: string, el: HTMLElement): HTMLElement => {
  const wrap = document.createElement("span");
  wrap.append(`${label}: `, el);
  return wrap;
};
hud.append(mk("Score", scoreEl), mk("Best", bestEl), mk("Status", statusEl), msgEl);
document.body.appendChild(hud);
const help = document.createElement("div");
help.style.cssText = "padding:0 8px;color:#9aa4c0;font:12px system-ui,sans-serif";
help.textContent = "Space / click: drop slab. R or click after the game ends: restart.";
document.body.appendChild(help);

function sync(): void {
  const height = Math.max(0, levels.length - 1);
  best = Math.max(best, score);
  window.__TASK_STATE__ = { status, score, height };
  scoreEl.textContent = String(score);
  bestEl.textContent = String(best);
  statusEl.textContent = status;
  msgEl.textContent = message && messageTime > 0 ? message : "";
}

function startActive(): void {
  const n = levels.length;
  activeDir = n % 2 === 0 ? 1 : -1;
  activeX = -activeDir * RANGE;
}

function restart(): void {
  levels = [{ x: 0, w: BASE_W }];
  status = "playing";
  score = 0;
  fallers = [];
  message = "";
  messageTime = 0;
  startActive();
  sync();
}

function drop(): void {
  if (status !== "playing") return;
  const n = levels.length;
  const prev = levels[n - 1]!;
  const w = prev.w;
  const left = Math.max(activeX - w / 2, prev.x - prev.w / 2);
  const right = Math.min(activeX + w / 2, prev.x + prev.w / 2);
  const overlap = right - left;

  if (overlap <= 0) {
    status = "lost";
    message = "missed";
    messageTime = 99;
    fallers.push({ node: app.nodes.require(`slab-${n}`), x: activeX, y: n * SLAB_H, w, vx: activeX > prev.x ? 1 : -1, vy: 0, rot: 0, vrot: activeX > prev.x ? -2 : 2, age: 0 });
    sync();
    return;
  }

  let next: Level;
  if (Math.abs(activeX - prev.x) <= PERFECT_TOL) {
    next = { x: prev.x, w };
    score += 1 + BONUS;
    message = "perfect +" + BONUS;
    messageTime = 1.2;
  } else {
    next = { x: (left + right) / 2, w: overlap };
    score += 1;
    const right_side = activeX > prev.x;
    const cutW = w - overlap;
    const cutX = right_side ? right + cutW / 2 : left - cutW / 2;
    fallers.push({ node: app.nodes.require(`cut-${n}`), x: cutX, y: n * SLAB_H, w: cutW, vx: right_side ? 1.2 : -1.2, vy: 0, rot: 0, vrot: right_side ? -2.5 : 2.5, age: 0 });
    message = "";
    messageTime = 0;
  }
  levels.push(next);

  if (levels.length - 1 >= WIN_HEIGHT) {
    status = "won";
    message = "tower complete";
    messageTime = 99;
  } else {
    startActive();
  }
  sync();
}

// ---- input ----
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.key === " ") {
    e.preventDefault();
    if (!e.repeat) drop();
  } else if (e.key === "r" || e.key === "R") {
    restart();
  }
});

const canvas = document.getElementById("app");
let lastPointer = -1000;
function onPointer(e: Event): void {
  const now = performance.now();
  if (e.type === "click" && now - lastPointer < 400) return; // pointerdown already handled this press
  if (e.type === "pointerdown") lastPointer = now;
  if (status === "playing") drop();
  else restart();
}
canvas?.addEventListener("pointerdown", onPointer);
canvas?.addEventListener("click", onPointer);

// ---- per-frame update ----
const hidden = new Set<string>();
function show(node: Handle, id: string, visible: boolean): void {
  if (visible) {
    node.setVisible(true);
    hidden.delete(id);
  } else if (!hidden.has(id)) {
    node.setVisible(false);
    hidden.add(id);
  }
}

function update(dt: number): void {
  if (status === "playing") {
    activeX += activeDir * speedFor(levels.length - 1) * dt;
    if (activeX > RANGE) { activeX = RANGE; activeDir = -1; }
    else if (activeX < -RANGE) { activeX = -RANGE; activeDir = 1; }
  }
  if (messageTime > 0 && messageTime < 50) {
    messageTime -= dt;
    if (messageTime <= 0) sync();
  }

  const target = (levels.length - 1) * SLAB_H;
  camY += (target - camY) * Math.min(1, dt * 3);

  for (const f of fallers) {
    f.age += dt;
    f.vy -= GRAVITY * dt;
    f.y += f.vy * dt;
    f.x += f.vx * dt;
    f.rot += f.vrot * dt;
  }
  fallers = fallers.filter((f) => f.age < 3);
}

function render(): void {
  app.nodes.require("floor").setPosition(0, -SLAB_H / 2 - 0.2 - camY, 0);
  const fallingIds = new Set<string>();
  for (const f of fallers) fallingIds.add(f.node.id);

  for (let i = 0; i < MAX_LEVELS; i += 1) {
    const slabId = `slab-${i}`;
    const cutId = `cut-${i}`;
    const slab = app.nodes.require(slabId);
    const cut = app.nodes.require(cutId);
    const placed = i < levels.length;
    const isActive = status === "playing" && i === levels.length;
    if (placed) {
      const l = levels[i]!;
      slab.setRotation(0, 0, 0);
      slab.setPosition(l.x, i * SLAB_H - camY, 0);
      slab.setScale([l.w, SLAB_H, SLAB_D]);
      show(slab, slabId, true);
    } else if (isActive) {
      const w = levels[levels.length - 1]!.w;
      slab.setRotation(0, 0, 0);
      slab.setPosition(activeX, i * SLAB_H - camY, 0);
      slab.setScale([w, SLAB_H, SLAB_D]);
      show(slab, slabId, true);
    } else if (!fallingIds.has(slabId)) {
      show(slab, slabId, false);
    }
    if (!fallingIds.has(cutId)) show(cut, cutId, false);
  }

  for (const f of fallers) {
    f.node.setRotation(0, 0, f.rot);
    f.node.setPosition(f.x, f.y - camY, 0);
    f.node.setScale([f.w, SLAB_H, SLAB_D]);
    show(f.node, f.node.id, true);
  }
}

restart();
render();

app.onFrame((frame) => {
  update(Math.min(frame.dt, 0.05));
  render();
});

void app.ready().then(() => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__TASK_READY__ = true;
    });
  });
});
