import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

type Status = "playing" | "won" | "lost";

declare global {
  interface Window {
    __TASK_STATE__?: { status: Status; score: number; height: number };
    __TASK_READY__?: boolean;
  }
}

// ---- constants ----
const WIN_HEIGHT = 25;
const SLAB_H = 0.6; // slab thickness
const SLAB_D = 4; // slab depth (z)
const BASE_W = 5; // base slab width
const AMPLITUDE = 5.5; // slide range of the moving slab (center x)
const PERFECT_TOL = 0.15; // perfect-drop tolerance (world units)
const GROUND_Y = -0.4; // ground plane height when the camera has not risen
const VIEW_TOP = 2.2; // where the moving slab sits on screen (world y after the rise)

const levelColor = (i: number): string => `hsl(${(205 + i * 11) % 360}, 68%, ${56 - (i % 3) * 2}%)`;

// ---- scene ----
let sc = scene({ background: "#1b2236" })
  .camera(camera.perspective({ position: [0, 7, 16], target: [0, 3, 0], fov: 40, near: 1, far: 120 }))
  .add(lights.hemisphere({ skyColor: "#dfe8ff", groundColor: "#3a4056", intensity: 1.1 }))
  .add(lights.directional({ position: [8, 16, 10], target: [0, 2, 0], intensity: 2.6, shadow: true }))
  .add(
    primitives
      .plane({ name: "ground", size: [120, 1, 120], material: material.pbr({ color: "#2c3450", roughness: 1 }) })
      .position(0, GROUND_Y, 0)
      .runtime({ id: "ground", mutable: true })
  );

for (let i = 0; i <= WIN_HEIGHT; i += 1) {
  const mat = material.pbr({ color: levelColor(i), roughness: 0.55 });
  sc = sc.add(
    primitives.box({ name: `slab${i}`, size: [1, 1, 1], material: mat }).position(0, -200, 0).runtime({ id: `slab${i}`, mutable: true })
  );
  sc = sc.add(
    primitives.box({ name: `debris${i}`, size: [1, 1, 1], material: mat }).position(0, -200, 0).runtime({ id: `debris${i}`, mutable: true })
  );
}

const app = createAuraApp("#app", { scene: sc });

// ---- HUD ----
const hud = document.createElement("div");
hud.id = "hud";
hud.style.cssText = "display:flex;gap:24px;padding:6px 10px;font:14px/1.4 system-ui,sans-serif;color:#fff;background:#111;width:620px;";
const scoreEl = document.createElement("span");
const bestEl = document.createElement("span");
const statusEl = document.createElement("span");
const helpEl = document.createElement("span");
helpEl.style.opacity = "0.6";
helpEl.textContent = "Space / click: drop. R: restart";
hud.append(scoreEl, bestEl, statusEl, helpEl);
document.body.appendChild(hud);

// ---- game state ----
interface Slab {
  x: number;
  w: number;
}
interface Debris {
  idx: number;
  x: number;
  y: number;
  w: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
}

let slabs: Slab[] = [];
let status: Status = "playing";
let score = 0;
let best = 0;
let phase = 0;
let shift = 0; // how far the world is lowered so the camera appears to rise
let debris: Debris[] = [];
let lastFlash = 0;

const height = (): number => slabs.length - 1;
const speedFor = (h: number): number => Math.min(1.7 + 0.22 * Math.floor(h / 4), 4.2);
const topY = (h: number): number => h * SLAB_H + SLAB_H / 2; // center y of slab index h
const movingX = (): number => AMPLITUDE * Math.sin(phase);

function publish(): void {
  window.__TASK_STATE__ = { status, score, height: height() };
  scoreEl.textContent = `Score: ${score}`;
  bestEl.textContent = `Best: ${best}`;
  statusEl.textContent = `Status: ${status}`;
}

function reset(): void {
  slabs = [{ x: 0, w: BASE_W }];
  status = "playing";
  score = 0;
  phase = -Math.PI / 2;
  shift = 0;
  debris = [];
  publish();
}

function drop(): void {
  if (status !== "playing") return;
  const top = slabs[slabs.length - 1]!;
  const idx = slabs.length;
  const mx = movingX();
  const mw = top.w;
  const tl = top.x - top.w / 2, tr = top.x + top.w / 2;
  const ml = mx - mw / 2, mr = mx + mw / 2;
  const overlap = Math.min(tr, mr) - Math.max(tl, ml);

  if (overlap <= 0) {
    // complete miss: the whole slab falls away
    debris.push({ idx, x: mx, y: topY(idx), w: mw, vx: mx >= top.x ? 1.2 : -1.2, vy: 0, rot: 0, vrot: mx >= top.x ? -1.5 : 1.5 });
    status = "lost";
    best = Math.max(best, score);
    publish();
    return;
  }

  if (Math.abs(mx - top.x) <= PERFECT_TOL) {
    slabs.push({ x: top.x, w: top.w });
    score += 2; // 1 for the slab + 1 bonus
    lastFlash = performance.now();
  } else {
    const l = Math.max(tl, ml), r = Math.min(tr, mr);
    slabs.push({ x: (l + r) / 2, w: r - l });
    score += 1;
    // overhanging part falls away
    if (ml < tl) {
      debris.push({ idx, x: (ml + tl) / 2, y: topY(idx), w: tl - ml, vx: -1.2, vy: 0, rot: 0, vrot: 1.5 });
    } else {
      debris.push({ idx, x: (tr + mr) / 2, y: topY(idx), w: mr - tr, vx: 1.2, vy: 0, rot: 0, vrot: -1.5 });
    }
  }

  if (height() >= WIN_HEIGHT) {
    status = "won";
  }
  best = Math.max(best, score);
  publish();
}

function restart(): void {
  reset();
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.key === " ") {
    e.preventDefault();
    if (!e.repeat) drop();
  } else if (e.key === "r" || e.key === "R") {
    restart();
  }
});
const canvas = document.querySelector<HTMLCanvasElement>("#app");
canvas?.addEventListener("click", () => {
  if (status === "playing") drop();
  else restart();
});

// ---- rendering ----
function render(dt: number): void {
  const n = (id: string) => app.nodes.require(id);

  // camera rise: lower the world so the top of the tower stays in view
  const topIdx = status === "playing" ? slabs.length : slabs.length - 1;
  const targetShift = Math.max(0, topY(topIdx) + SLAB_H / 2 - VIEW_TOP);
  shift += (targetShift - shift) * Math.min(1, dt * 5);

  n("ground").setPosition(0, GROUND_Y - shift, 0);

  for (let i = 0; i <= WIN_HEIGHT; i += 1) {
    const node = n(`slab${i}`);
    if (i < slabs.length) {
      const s = slabs[i]!;
      node.setVisible(true);
      node.setPosition(s.x, topY(i) - shift, 0);
      node.setScale([s.w, SLAB_H, SLAB_D]);
    } else if (i === slabs.length && status === "playing") {
      const w = slabs[slabs.length - 1]!.w;
      node.setVisible(true);
      node.setPosition(movingX(), topY(i) - shift, 0);
      node.setScale([w, SLAB_H, SLAB_D]);
    } else {
      node.setVisible(false);
    }
    const d = debris.find((q) => q.idx === i);
    const dn = n(`debris${i}`);
    if (d) {
      dn.setVisible(true);
      dn.setPosition(d.x, d.y - shift, 0);
      dn.setRotation(0, 0, d.rot);
      dn.setScale([d.w, SLAB_H, SLAB_D]);
    } else {
      dn.setVisible(false);
    }
  }
}

function step(dt: number): void {
  if (status === "playing") {
    phase += dt * speedFor(height());
  }
  for (const d of debris) {
    d.vy -= 28 * dt;
    d.y += d.vy * dt;
    d.x += d.vx * dt;
    d.rot += d.vrot * dt;
  }
  debris = debris.filter((d) => d.y > -60);
  // brief HUD highlight on a perfect drop
  statusEl.style.color = performance.now() - lastFlash < 400 ? "#ffe066" : "#fff";
}

reset();
app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.05);
  step(dt);
  render(dt);
});

await app.ready();
requestAnimationFrame(() => {
  window.__TASK_READY__ = true;
});
