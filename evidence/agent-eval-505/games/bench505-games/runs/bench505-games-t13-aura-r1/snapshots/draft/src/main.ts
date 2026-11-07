import { camera, createAuraApp, group, looks, material, primitives, scene } from "@aura3d/engine";

type Status = "ready" | "playing" | "won" | "lost";

interface TaskState {
  status: Status;
  score: number;
  speed: number;
  airborne: boolean;
}

interface Hurdle {
  id: number;
  d: number;
  h: number;
}

declare global {
  interface Window {
    __TASK_STATE__?: TaskState;
    __TASK_READY__?: boolean;
  }
}

// ---------- tuning ----------
const GOAL = 500;
const BASE_SPEED = 8;
const SPEED_GAIN = 0.024; // m/s per meter: 8 -> 20 at 500 m
const GRAVITY = 24;
const JUMP_V = 8; // apex = v^2 / (2g) = 1.33 m
const STEP = 1 / 120;
const HALF_DEPTH = 0.45; // runner + hurdle half-depth overlap window along the track
const HURDLE_POOL = 12;
const VIEW_AHEAD = 95;
const TRACK_W = 3.4;
const HURDLE_W = 3.0;

const seedParam = Number(new URLSearchParams(location.search).get("seed"));
const SEED = Number.isFinite(seedParam) && seedParam !== 0 ? seedParam >>> 0 : 12345;

function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function speedAt(distance: number): number {
  return BASE_SPEED + SPEED_GAIN * distance;
}

// ---------- scenery layout ----------
const Z_NEAR = 5;
const DASH_N = 16;
const DASH_SP = 5;
const POST_N = 14;
const POST_SP = 6;
const TREE_N = 9;
const TREE_SP = 10;

const sceneBuilder = scene()
  .add(looks.preset("outdoor-day"))
  .camera(camera.perspective({ position: [0, 3.1, 6.8], target: [0, 0.9, -7], fov: 52 }))
  .add(primitives.box({ name: "grass", size: [200, 1, 400], position: [0, -0.55, -150], material: material.pbr({ color: "#4f9a46", roughness: 1 }) }))
  .add(primitives.box({ name: "track", size: [TRACK_W, 0.1, 400], position: [0, -0.05, -150], material: material.pbr({ color: "#5b5f68", roughness: 0.9 }) }))
  .add(primitives.box({ name: "edgeL", size: [0.12, 0.12, 400], position: [-TRACK_W / 2, 0, -150], material: material.pbr({ color: "#f4f4f4" }) }))
  .add(primitives.box({ name: "edgeR", size: [0.12, 0.12, 400], position: [TRACK_W / 2, 0, -150], material: material.pbr({ color: "#f4f4f4" }) }));

const runtimeIds: string[] = [];
function mutable<T extends { runtime(spec: { id: string; mutable: boolean }): T }>(node: T, id: string): T {
  runtimeIds.push(id);
  return node.runtime({ id, mutable: true });
}

for (let i = 0; i < DASH_N; i += 1) {
  sceneBuilder.add(mutable(primitives.box({ name: `dash${i}`, size: [0.18, 0.04, 1.6], position: [0, 0.01, -100], material: material.pbr({ color: "#f1e9b8" }) }), `dash${i}`));
}
for (let i = 0; i < POST_N; i += 1) {
  for (const side of [-1, 1]) {
    const key = `post${side < 0 ? "L" : "R"}${i}`;
    sceneBuilder.add(
      mutable(
        group(key, [
          primitives.box({ name: `${key}-pole`, size: [0.14, 1.2, 0.14], position: [0, 0.6, 0], material: material.pbr({ color: "#e9e9e9" }) }),
          primitives.box({ name: `${key}-cap`, size: [0.2, 0.2, 0.2], position: [0, 1.25, 0], material: material.pbr({ color: i % 2 === 0 ? "#e8412c" : "#2c7be8" }) })
        ]),
        key
      )
    );
  }
}
for (let i = 0; i < TREE_N; i += 1) {
  for (const side of [-1, 1]) {
    const key = `tree${side < 0 ? "L" : "R"}${i}`;
    sceneBuilder.add(
      mutable(
        group(key, [
          primitives.cylinder({ name: `${key}-trunk`, size: [0.5, 1.6, 0.5], position: [0, 0.8, 0], material: material.pbr({ color: "#6b4a2b" }) }),
          primitives.cone({ name: `${key}-top`, size: [2.2, 3.2, 2.2], position: [0, 3.0, 0], material: material.pbr({ color: i % 2 === 0 ? "#2f7d3a" : "#3f9a47" }) })
        ]),
        key
      )
    );
  }
}
for (let i = 0; i < HURDLE_POOL; i += 1) {
  sceneBuilder.add(
    mutable(
      primitives.box({ name: `hurdle${i}`, size: [HURDLE_W, 1, 0.4], position: [0, -50, 0], material: material.pbr({ color: i % 2 === 0 ? "#e8412c" : "#f08a24", roughness: 0.6 }) }),
      `hurdle${i}`
    )
  );
}

// Runner: simple character from shapes
const SHIRT = material.pbr({ color: "#ff7a1a", roughness: 0.7 });
const PANTS = material.pbr({ color: "#2b4c9b", roughness: 0.7 });
const SKIN = material.pbr({ color: "#f2c9a0", roughness: 0.8 });
sceneBuilder
  .add(mutable(primitives.box({ name: "torso", size: [0.5, 0.62, 0.3], material: SHIRT }), "torso"))
  .add(mutable(primitives.sphere({ name: "head", size: 0.36, material: SKIN }), "head"))
  .add(mutable(group("legL", [primitives.box({ size: [0.2, 0.55, 0.22], position: [0, -0.27, 0], material: PANTS })]), "legL"))
  .add(mutable(group("legR", [primitives.box({ size: [0.2, 0.55, 0.22], position: [0, -0.27, 0], material: PANTS })]), "legR"))
  .add(mutable(group("armL", [primitives.box({ size: [0.14, 0.5, 0.14], position: [0, -0.22, 0], material: SKIN })]), "armL"))
  .add(mutable(group("armR", [primitives.box({ size: [0.14, 0.5, 0.14], position: [0, -0.22, 0], material: SKIN })]), "armR"));

const app = createAuraApp("#app", {
  scene: sceneBuilder,
  resize: false,
  ...looks.appOptions("outdoor-day")
});

// ---------- DOM HUD ----------
const hud = document.createElement("div");
hud.style.cssText = "width:640px;box-sizing:border-box;padding:6px 10px;display:flex;justify-content:space-between;background:#111;color:#fff;font:14px system-ui,sans-serif";
const distEl = document.createElement("span");
const bestEl = document.createElement("span");
const statusEl = document.createElement("span");
hud.append(distEl, bestEl, statusEl);
document.body.append(hud);

const overlay = document.createElement("div");
overlay.style.cssText = "position:absolute;left:0;top:0;width:640px;height:360px;display:none;align-items:center;justify-content:center;flex-direction:column;background:rgba(0,0,0,0.5);color:#fff;font:20px system-ui,sans-serif;text-align:center;pointer-events:none";
const overlayTitle = document.createElement("div");
overlayTitle.style.cssText = "font-size:34px;font-weight:700;margin-bottom:8px";
const overlayHint = document.createElement("div");
overlay.append(overlayTitle, overlayHint);
document.body.append(overlay);

// ---------- game state ----------
let rng = makeRng(SEED);
let status: Status = "ready";
let distance = 0;
let best = 0;
let jumpY = 0;
let jumpV = 0;
let airborne = false;
let phase = 0;
let hurdles: Hurdle[] = [];
let nextId = 0;
let lastD = 20;
let cursor = 0;

function spawnHurdles(): void {
  while (lastD < distance + VIEW_AHEAD + 20) {
    const sp = speedAt(lastD);
    const gap = sp * 0.95 + 6 + rng() * 14;
    lastD += gap;
    hurdles.push({ id: nextId, d: lastD, h: 0.35 + rng() * 0.65 });
    nextId += 1;
  }
}

function resetRun(): void {
  rng = makeRng(SEED);
  status = "ready";
  distance = 0;
  jumpY = 0;
  jumpV = 0;
  airborne = false;
  phase = 0;
  hurdles = [];
  nextId = 0;
  lastD = 20;
  cursor = 0;
  spawnHurdles();
}
resetRun();

function endRun(next: "won" | "lost"): void {
  status = next;
  best = Math.max(best, Math.floor(distance));
}

function jumpInput(): void {
  if (status === "won" || status === "lost") {
    resetRun();
    return;
  }
  if (status === "ready") status = "playing";
  if (!airborne) {
    airborne = true;
    jumpV = JUMP_V;
  }
}

function step(dt: number): void {
  if (status !== "playing") return;
  const sp = speedAt(distance);
  distance += sp * dt;
  phase += sp * dt * 1.1;
  if (airborne) {
    jumpV -= GRAVITY * dt;
    jumpY += jumpV * dt;
    if (jumpY <= 0) {
      jumpY = 0;
      jumpV = 0;
      airborne = false;
    }
  }
  while (cursor < hurdles.length && hurdles[cursor].d - distance < -3) cursor += 1;
  for (let i = cursor; i < hurdles.length; i += 1) {
    const hd = hurdles[i];
    const rel = hd.d - distance;
    if (rel > HALF_DEPTH) break;
    if (Math.abs(rel) < HALF_DEPTH && jumpY < hd.h - 0.02) {
      endRun("lost");
      return;
    }
  }
  if (distance >= GOAL) {
    distance = GOAL;
    endRun("won");
    return;
  }
  spawnHurdles();
}

// ---------- input ----------
const JUMP_KEYS = new Set(["Space", "ArrowUp", "KeyW"]);
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyR") {
    if (!e.repeat) resetRun();
    return;
  }
  if (JUMP_KEYS.has(e.code)) {
    e.preventDefault();
    if (e.repeat && status !== "playing") return;
    jumpInput();
  }
});
window.addEventListener("pointerdown", () => jumpInput());

// ---------- presentation ----------
const wrap = (a: number, span: number): number => ((a % span) + span) % span;

function present(): void {
  const n = app.nodes;
  const sp = status === "playing" ? speedAt(distance) : 0;

  for (let i = 0; i < DASH_N; i += 1) {
    n.require(`dash${i}`).setPosition(0, 0.01, Z_NEAR - wrap(i * DASH_SP - distance, DASH_N * DASH_SP));
  }
  for (let i = 0; i < POST_N; i += 1) {
    const z = Z_NEAR - wrap(i * POST_SP - distance, POST_N * POST_SP);
    n.require(`postL${i}`).setPosition(-(TRACK_W / 2 + 0.6), 0, z);
    n.require(`postR${i}`).setPosition(TRACK_W / 2 + 0.6, 0, z);
  }
  for (let i = 0; i < TREE_N; i += 1) {
    const z = Z_NEAR - wrap(i * TREE_SP - distance, TREE_N * TREE_SP);
    n.require(`treeL${i}`).setPosition(-(5.5 + (i % 3) * 1.4), 0, z);
    n.require(`treeR${i}`).setPosition(5.5 + ((i + 1) % 3) * 1.4, 0, z - 3);
  }

  const used = new Set<number>();
  for (let i = cursor; i < hurdles.length; i += 1) {
    const hd = hurdles[i];
    const rel = hd.d - distance;
    if (rel > VIEW_AHEAD) break;
    const slot = hd.id % HURDLE_POOL;
    used.add(slot);
    const node = n.require(`hurdle${slot}`);
    node.setScale([1, hd.h, 1]);
    node.setPosition(0, hd.h / 2, -rel);
  }
  for (let s = 0; s < HURDLE_POOL; s += 1) {
    if (!used.has(s)) n.require(`hurdle${s}`).setPosition(0, -50, 0);
  }

  // runner
  const swing = airborne ? 0.7 : Math.sin(phase * 2.2) * 0.9;
  const lift = status === "playing" && !airborne ? Math.abs(Math.sin(phase * 2.2)) * 0.05 : 0;
  const base = jumpY + lift;
  const hipY = base + 0.55;
  n.require("torso").setPosition(0, hipY + 0.31, 0);
  n.require("head").setPosition(0, hipY + 0.82, 0);
  n.require("legL").setPosition(-0.12, hipY, 0).setRotation(swing, 0, 0);
  n.require("legR").setPosition(0.12, hipY, 0).setRotation(-swing, 0, 0);
  n.require("armL").setPosition(-0.33, hipY + 0.55, 0).setRotation(-swing, 0, 0);
  n.require("armR").setPosition(0.33, hipY + 0.55, 0).setRotation(swing, 0, 0);

  // HUD + state
  const score = Math.floor(distance);
  distEl.textContent = `Distance: ${score} m`;
  bestEl.textContent = `Best: ${Math.max(best, status === "playing" ? score : 0)} m`;
  statusEl.textContent = `Status: ${status}`;
  if (status === "lost" || status === "won") {
    overlay.style.display = "flex";
    overlayTitle.textContent = status === "won" ? `You won! ${score} m` : `Game over: ${score} m`;
    overlayHint.textContent = "Press R, Space or click to restart";
  } else if (status === "ready") {
    overlay.style.display = "flex";
    overlayTitle.textContent = "Endless Runner";
    overlayHint.textContent = "Press Space, W, Up or click to start";
  } else {
    overlay.style.display = "none";
  }
  window.__TASK_STATE__ = { status, score, speed: sp, airborne };
}

// ---------- loop ----------
window.__TASK_STATE__ = { status, score: 0, speed: 0, airborne: false };

let last = 0;
let acc = 0;
let first = true;
function frame(t: number): void {
  const dt = last === 0 ? 0 : Math.min(0.05, (t - last) / 1000);
  last = t;
  acc += dt;
  while (acc >= STEP) {
    step(STEP);
    acc -= STEP;
  }
  present();
  if (first) {
    first = false;
    window.__TASK_READY__ = true;
  }
  requestAnimationFrame(frame);
}

void app.ready().then(() => {
  requestAnimationFrame(frame);
});
