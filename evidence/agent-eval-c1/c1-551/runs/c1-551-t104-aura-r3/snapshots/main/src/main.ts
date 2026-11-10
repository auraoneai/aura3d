import {
  camera,
  createAuraApp,
  environments,
  lights,
  material,
  primitives,
  scene,
  type AuraRuntimeNodeHandle
} from "@aura3d/engine";

type Status = "playing" | "won" | "lost";

declare global {
  interface Window {
    __TASK_STATE__: { status: Status; score: number; height: number };
    __TASK_READY__: boolean;
    __EVAL_READY__: boolean;
  }
}

// ---- tunables -------------------------------------------------------------
const SLAB_H = 0.5;
const SLAB_D = 3;
const BASE_W = 3;
const WIN_HEIGHT = 25;
const PERFECT_TOL = 0.1;
const PERFECT_BONUS = 1;
const SLIDE_RANGE = 3.4;
const BASE_OMEGA = 1.7; // rad/s of the slide oscillation
const SPEEDUP_EVERY = 3; // levels
const SPEEDUP = 0.1; // +10% per step
const MAX_TOWER_NODES = WIN_HEIGHT + 2;
const DEBRIS_NODES = 10;

// ---- helpers ----------------------------------------------------------------
function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (hh < 60) { r = c; g = x; }
  else if (hh < 120) { r = x; g = c; }
  else if (hh < 180) { g = c; b = x; }
  else if (hh < 240) { g = x; b = c; }
  else if (hh < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const to = (v: number): string => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

const colorForLevel = (level: number): string => hslToHex(200 + level * 11, 0.62, 0.55);
const slabY = (level: number): number => SLAB_H / 2 + level * SLAB_H;

// ---- game state -------------------------------------------------------------
interface Slab { x: number; w: number; level: number; color: string }
interface Debris {
  active: boolean; x: number; y: number; w: number; color: string;
  vx: number; vy: number; rot: number; spin: number; age: number; dirty: boolean;
}

let tower: Slab[] = [];
let mover: Slab = { x: 0, w: BASE_W, level: 1, color: "#ffffff" };
let moverVisible = true;
let phase = 0;
let status: Status = "playing";
let score = 0;
let best = 0;
let flash = ""; // short feedback text in HUD
let flashTime = 0;
const debris: Debris[] = Array.from({ length: DEBRIS_NODES }, () => ({
  active: false, x: 0, y: 0, w: 1, color: "#ffffff", vx: 0, vy: 0, rot: 0, spin: 0, age: 0, dirty: true
}));
let nextDebris = 0;
let camY = 0;

function omegaFor(level: number): number {
  return BASE_OMEGA * (1 + SPEEDUP * Math.floor((level - 1) / SPEEDUP_EVERY));
}

function publish(): void {
  window.__TASK_STATE__ = { status, score, height: tower.length - 1 };
  if (score > best) best = score;
  hudScore.textContent = String(score);
  hudBest.textContent = String(best);
  hudStatus.textContent = status;
  hudStatus.style.color = status === "won" ? "#7be08b" : status === "lost" ? "#ff7a7a" : "#ffffff";
  hudMsg.textContent = flash || (status === "playing"
    ? "Space / click to drop"
    : "Press R or click the canvas to restart");
}

function spawnMover(): void {
  const top = tower[tower.length - 1]!;
  const level = tower.length;
  mover = { x: -SLIDE_RANGE, w: top.w, level, color: colorForLevel(level) };
  phase = -Math.PI / 2;
  moverVisible = true;
}

function spawnDebris(x: number, w: number, y: number, color: string, dir: number): void {
  const d = debris[nextDebris]!;
  nextDebris = (nextDebris + 1) % DEBRIS_NODES;
  d.active = true; d.x = x; d.y = y; d.w = w; d.color = color;
  d.vx = dir * 1.2; d.vy = 0.6; d.rot = 0; d.spin = -dir * 2.2; d.age = 0; d.dirty = true;
}

function reset(): void {
  tower = [{ x: 0, w: BASE_W, level: 0, color: colorForLevel(0) }];
  status = "playing";
  score = 0;
  flash = "";
  for (const d of debris) d.active = false;
  spawnMover();
  publish();
}

function drop(): void {
  if (status !== "playing") return;
  const top = tower[tower.length - 1]!;
  const y = slabY(mover.level);
  const left = Math.max(mover.x - mover.w / 2, top.x - top.w / 2);
  const right = Math.min(mover.x + mover.w / 2, top.x + top.w / 2);
  const overlap = right - left;

  if (overlap <= 0) {
    // complete miss: the slab falls away, game over
    spawnDebris(mover.x, mover.w, y, mover.color, mover.x >= top.x ? 1 : -1);
    moverVisible = false;
    status = "lost";
    flash = "";
    publish();
    return;
  }

  if (Math.abs(mover.x - top.x) <= PERFECT_TOL) {
    tower.push({ x: top.x, w: mover.w, level: mover.level, color: mover.color });
    score += 1 + PERFECT_BONUS;
    flash = "Perfect! +" + PERFECT_BONUS;
    flashTime = 1.2;
  } else {
    const cx = (left + right) / 2;
    tower.push({ x: cx, w: overlap, level: mover.level, color: mover.color });
    const cutW = mover.w - overlap;
    if (mover.x > top.x) {
      spawnDebris(right + cutW / 2, cutW, y, mover.color, 1);
    } else {
      spawnDebris(left - cutW / 2, cutW, y, mover.color, -1);
    }
    score += 1;
  }

  if (tower.length - 1 >= WIN_HEIGHT) {
    status = "won";
    moverVisible = false;
    flash = "";
    publish();
    return;
  }
  spawnMover();
  publish();
}

// ---- DOM HUD (outside the canvas) ---------------------------------------------
const canvas = document.getElementById("app") as HTMLCanvasElement;
const hud = document.createElement("div");
hud.id = "hud";
hud.style.cssText = "width:640px;box-sizing:border-box;padding:6px 10px;display:flex;gap:18px;align-items:baseline;background:#11151c;font:14px system-ui,sans-serif;";
hud.innerHTML =
  '<span>Score: <b id="hud-score">0</b></span>' +
  '<span>Best: <b id="hud-best">0</b></span>' +
  '<span>Status: <b id="hud-status">playing</b></span>' +
  '<span id="hud-msg" style="margin-left:auto;opacity:.75;font-size:12px"></span>';
canvas.insertAdjacentElement("afterend", hud);
const hudScore = hud.querySelector("#hud-score") as HTMLElement;
const hudBest = hud.querySelector("#hud-best") as HTMLElement;
const hudStatus = hud.querySelector("#hud-status") as HTMLElement;
const hudMsg = hud.querySelector("#hud-msg") as HTMLElement;

// ---- scene --------------------------------------------------------------------
const slabMaterial = (color: string) => material.pbr({ color, roughness: 0.55, metallic: 0.05 });
const stage = scene({ background: "#1b2433" })
  .add(environments.neutral({ intensity: 0.7, background: false }))
  .add(lights.directional({ name: "sun", position: [6, 14, 8], target: [0, 0, 0], intensity: 2.2, shadow: true }))
  .add(primitives.plane({ name: "floor", size: [300, 1, 300], material: material.pbr({ color: "#2c3647", roughness: 0.95 }) }));

for (let i = 0; i < MAX_TOWER_NODES; i += 1) {
  stage.add(primitives.box({ name: `slab-${i}`, size: 1, material: slabMaterial("#888888") }).position(0, -50, 0).runtime({ id: `slab-${i}`, mutable: true }));
}
for (let i = 0; i < DEBRIS_NODES; i += 1) {
  stage.add(primitives.box({ name: `debris-${i}`, size: 1, material: slabMaterial("#888888") }).position(0, -50, 0).runtime({ id: `debris-${i}`, mutable: true }));
}
stage.camera(camera.perspective({ position: [7, 5, 9], target: [0, 1, 0], fov: 40 }));

const app = createAuraApp("#app", { scene: stage });

const handles: { slab: AuraRuntimeNodeHandle[]; debris: AuraRuntimeNodeHandle[] } = { slab: [], debris: [] };
const slabColor: string[] = [];
const debrisColor: string[] = [];
let shownTower = -1; // number of slab nodes already written for the current tower

function placeSlab(i: number, x: number, y: number, w: number, color: string): void {
  const h = handles.slab[i]!;
  h.setPosition(x, y, 0).setScale([w, SLAB_H, SLAB_D]).setVisible(true);
  if (slabColor[i] !== color) {
    h.setColor?.(color);
    slabColor[i] = color;
  }
}

function render(dt: number): void {
  if (handles.slab.length === 0) {
    for (let i = 0; i < MAX_TOWER_NODES; i += 1) handles.slab.push(app.nodes.require(`slab-${i}`));
    for (let i = 0; i < DEBRIS_NODES; i += 1) handles.debris.push(app.nodes.require(`debris-${i}`));
  }

  // tower slabs (rewrite only when the tower changed)
  const sig = tower.length * 1000 + status.length;
  if (sig !== shownTower || tower.length === 1) {
    for (let i = 0; i < MAX_TOWER_NODES; i += 1) {
      const s = tower[i];
      if (s) placeSlab(i, s.x, slabY(s.level), s.w, s.color);
    }
    shownTower = sig;
  }
  // moving slab uses the next free node
  const mi = tower.length;
  if (mi < MAX_TOWER_NODES) {
    const h = handles.slab[mi]!;
    if (moverVisible && status === "playing") {
      placeSlab(mi, mover.x, slabY(mover.level), mover.w, mover.color);
    } else if (status !== "playing") {
      h.setVisible(false);
    }
  }
  for (let i = mi + 1; i < MAX_TOWER_NODES; i += 1) handles.slab[i]!.setVisible(false);

  // falling debris
  for (let i = 0; i < DEBRIS_NODES; i += 1) {
    const d = debris[i]!;
    const h = handles.debris[i]!;
    if (!d.active) {
      if (d.dirty) { h.setVisible(false); d.dirty = false; }
      continue;
    }
    d.vy -= 14 * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.rot += d.spin * dt;
    d.age += dt;
    if (d.age > 3 || d.y < -12) { d.active = false; d.dirty = true; continue; }
    h.setPosition(d.x, d.y, 0).setRotation(0, 0, d.rot).setScale([d.w, SLAB_H, SLAB_D]).setVisible(true);
    if (debrisColor[i] !== d.color) {
      h.setColor?.(d.color);
      debrisColor[i] = d.color;
    }
  }

  // camera follows the top of the tower (and the sliding slab above it)
  const targetY = slabY(tower.length) - 1.2;
  camY += (Math.max(targetY, 1.2) - camY) * Math.min(1, dt * 4);
  const dist = 10;
  app.camera?.setPose(
    { position: [dist * 0.62, camY + 4.2, dist * 0.8], target: [0, camY, 0], fov: 40 },
    { cut: true }
  );
}

// ---- input ----------------------------------------------------------------------
window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.code === "Space" || e.key === " ") {
    e.preventDefault();
    if (!e.repeat) drop();
  } else if (e.code === "KeyR" || e.key === "r" || e.key === "R") {
    reset();
  }
});
canvas.addEventListener("click", () => {
  if (status === "playing") drop();
  else reset();
});

// ---- loop -----------------------------------------------------------------------
let firstFrame = true;
reset();
app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.05);
  if (status === "playing") {
    phase += dt * omegaFor(mover.level);
    mover.x = SLIDE_RANGE * Math.sin(phase);
  }
  if (flash && status === "playing") {
    flashTime -= dt;
    if (flashTime <= 0) { flash = ""; publish(); }
  }
  render(dt);
  if (firstFrame) {
    firstFrame = false;
    window.__TASK_READY__ = true;
    window.__EVAL_READY__ = true;
  }
});
void app.ready();
