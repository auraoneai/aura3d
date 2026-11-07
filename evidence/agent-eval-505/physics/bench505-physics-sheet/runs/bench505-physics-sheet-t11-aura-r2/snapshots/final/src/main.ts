import { camera, createAuraApp, effects, environments, group, lights, material, primitives, scene, sky } from "@aura3d/engine";
import { quatToEulerZYX, World } from "./physics";

type Phase = "ready" | "swinging" | "settled";
interface TaskState {
  readonly phase: Phase;
  readonly crates: number;
  readonly displaced: number;
  readonly ballAngleDeg: number;
}

declare global {
  interface Window {
    __TASK_STATE__?: TaskState;
    __EVAL_READY__?: boolean;
  }
}

// ---------- layout ----------
const PIVOT = { x: -2, y: 6.9, z: 0 };
const ROPE = 6;
const STACK_X = 1.6;
const START_ANGLE = (60 * Math.PI) / 180;
const H = 1 / 240;

const world = new World(PIVOT, ROPE);
world.reset(STACK_X);

// ---------- scene ----------
const wood = material.pbr({ color: "#c58f50", roughness: 0.85 });
const woodDark = material.pbr({ color: "#7a4b22", roughness: 0.9 });
const concrete = material.pbr({ color: "#9b9b96", roughness: 0.95 });
const seam = material.pbr({ color: "#6f6f6b", roughness: 1 });
const steel = material.pbr({ color: "#5d6571", metallic: 0.9, roughness: 0.3 });
const paint = material.pbr({ color: "#e0a21a", roughness: 0.6, metallic: 0.2 });
const chain = material.pbr({ color: "#2e3238", metallic: 0.7, roughness: 0.5 });

function crateNode(i: number) {
  const kids = [primitives.box({ name: `crate-core-${i}`, size: [0.96, 0.96, 0.96], material: wood })];
  let k = 0;
  const bar = (size: [number, number, number], x: number, y: number, z: number) => {
    kids.push(primitives.box({ name: `crate-bar-${i}-${k++}`, size, material: woodDark }).position(x, y, z));
  };
  for (const a of [-0.46, 0.46]) {
    for (const b of [-0.46, 0.46]) {
      bar([1, 0.08, 0.08], 0, a, b);
      bar([0.08, 1, 0.08], a, 0, b);
      bar([0.08, 0.08, 1], a, b, 0);
    }
  }
  for (const z of [-0.485, 0.485]) {
    kids.push(primitives.box({ name: `crate-brace-${i}-${k++}`, size: [1.2, 0.07, 0.03], material: woodDark }).position(0, 0, z).rotate(0, 0, Math.PI / 4));
  }
  const c = world.crates[i]!;
  return group(`crate-${i}`, kids, { position: [c.pos.x, c.pos.y, c.pos.z] }).runtime({ id: `crate-${i}`, mutable: true });
}

let sc = scene({ background: "#bcd3e6" })
  .camera(camera.perspective({ position: [-1.5, 5.6, 15.5], target: [-3, 3.2, 0], fov: 45, near: 0.5, far: 200 }))
  .add(sky.gradient({ zenith: "#6f9fd6", horizon: "#dfe9f2" }))
  .add(environments.neutral({ intensity: 0.55, background: false }))
  .add(lights.hemisphere({ skyColor: "#d6e6f5", groundColor: "#8a8a82", intensity: 0.8 }))
  .add(lights.directional({ name: "key", position: [9, 15, 11], target: [-2, 0, 0], intensity: 2.8, color: "#fff3e0", shadow: { mapSize: 2048, filter: "pcf", softness: 1.5 } }))
  .add(primitives.plane({ name: "yard", size: [70, 1, 40], material: concrete }));

// slab seams on the concrete
for (let i = -5; i <= 5; i += 1) {
  sc = sc.add(primitives.box({ name: `seam-x-${i}`, size: [70, 0.01, 0.06], material: seam, castShadow: false }).position(0, 0.006, i * 4));
}
for (let i = -8; i <= 8; i += 1) {
  sc = sc.add(primitives.box({ name: `seam-z-${i}`, size: [0.06, 0.01, 40], material: seam, castShadow: false }).position(i * 4 + 2, 0.006, 0));
}
// back wall of the yard
sc = sc
  .add(primitives.box({ name: "wall", size: [70, 2.4, 0.6], material: material.pbr({ color: "#8a8a86", roughness: 1 }) }).position(0, 1.2, -9))
  .add(primitives.box({ name: "wall-cap", size: [70, 0.2, 0.9], material: material.pbr({ color: "#a2a29d", roughness: 1 }) }).position(0, 2.5, -9));

// crane: base, mast, jib, brace, hook block
sc = sc
  .add(primitives.box({ name: "crane-base", size: [2.4, 0.5, 1.8], material: paint }).position(-9, 0.25, 0))
  .add(primitives.box({ name: "crane-mast", size: [0.7, 7.4, 0.7], material: paint }).position(-9, 4.2, 0))
  .add(primitives.box({ name: "crane-jib", size: [8.0, 0.5, 0.6], material: paint }).position(-5.4, 7.15, 0))
  .add(primitives.box({ name: "crane-brace", size: [3.62, 0.25, 0.3], material: paint }).position(-7.6, 5.75, 0).rotate(0, 0, 0.69))
  .add(primitives.box({ name: "crane-counter", size: [1.0, 0.7, 0.8], material: steel }).position(-9.6, 7.0, 0))
  .add(primitives.box({ name: "hook-block", size: [0.5, 0.2, 0.4], material: chain }).position(PIVOT.x, PIVOT.y + 0.05, 0));

const ballStart = world.ball.pos;
sc = sc
  .add(group("rope", [primitives.cylinder({ name: "rope-line", size: [0.09, 1, 0.09], material: chain })], { position: [PIVOT.x, PIVOT.y - ROPE / 2, 0], scale: [1, ROPE, 1] }).runtime({ id: "rope", mutable: true }))
  .add(primitives.sphere({ name: "ball", size: 1.6, material: steel }).position(ballStart.x, ballStart.y, ballStart.z).runtime({ id: "ball", mutable: true }));

for (let i = 0; i < 15; i += 1) sc = sc.add(crateNode(i));
sc = sc.add(effects.fog({ color: "#cfdde9", density: 0.006 }));

const app = createAuraApp("#app", { scene: sc });

// ---------- UI ----------
const ui = document.createElement("div");
ui.style.cssText = "position:fixed;left:8px;top:8px;display:flex;gap:6px;align-items:center;z-index:10;font:13px system-ui,sans-serif";
const mkButton = (label: string): HTMLButtonElement => {
  const b = document.createElement("button");
  b.textContent = label;
  b.id = `btn-${label.toLowerCase()}`;
  b.style.cssText = "padding:6px 14px;font:600 13px system-ui,sans-serif;border:0;border-radius:4px;background:#e0a21a;color:#1b1b1b;cursor:pointer";
  return b;
};
const swingBtn = mkButton("Swing");
const resetBtn = mkButton("Reset");
const label = document.createElement("span");
label.style.cssText = "color:#10202c;background:rgba(255,255,255,0.65);padding:3px 7px;border-radius:4px";
ui.append(swingBtn, resetBtn, label);
document.body.appendChild(ui);

// ---------- simulation state ----------
type Mode = "idle" | "pull" | "free";
let mode: Mode = "idle";
let pullT = 0;
let pullFrom = 0;
let sinceRelease = 0;
let acc = 0;
let fullSync = true;
const PULL_TIME = 0.6;

swingBtn.addEventListener("click", () => {
  if (mode === "pull") return;
  mode = "pull";
  pullT = 0;
  pullFrom = world.ballAngle();
  world.ball.kinematic = true;
  sinceRelease = 0;
});

resetBtn.addEventListener("click", () => {
  world.reset(STACK_X);
  mode = "idle";
  acc = 0;
  sinceRelease = 0;
  fullSync = true;
});

function fixedStep(): void {
  const ball = world.ball;
  if (mode === "pull") {
    pullT += H;
    const s = Math.min(1, pullT / PULL_TIME);
    const e = s * s * (3 - 2 * s);
    const prev = { ...ball.pos };
    world.setBallAngle(pullFrom + (-START_ANGLE - pullFrom) * e);
    ball.vel = { x: (ball.pos.x - prev.x) / H, y: (ball.pos.y - prev.y) / H, z: 0 };
    if (s >= 1) {
      ball.kinematic = false;
      ball.vel = { x: 0, y: 0, z: 0 };
      mode = "free";
      sinceRelease = 0;
    }
  } else if (mode === "free") {
    sinceRelease += H;
  }
  world.step(H);
}

function phase(): Phase {
  if (mode === "idle") return "ready";
  if (mode === "free" && sinceRelease > 2.5 && world.allCratesAsleep()) return "settled";
  return "swinging";
}

function displacedCount(): number {
  let n = 0;
  for (const c of world.crates) {
    if (Math.hypot(c.pos.x - c.home.x, c.pos.y - c.home.y, c.pos.z - c.home.z) > 0.75) n += 1;
  }
  return n;
}

function publish(): void {
  const state: TaskState = Object.freeze({
    phase: phase(),
    crates: world.crates.length,
    displaced: displacedCount(),
    ballAngleDeg: Math.abs((world.ballAngle() * 180) / Math.PI)
  });
  current = state;
  label.textContent = `${state.phase} | displaced ${state.displaced}/${state.crates} | angle ${state.ballAngleDeg.toFixed(1)}°`;
}

let current: TaskState = Object.freeze({ phase: "ready" as Phase, crates: 15, displaced: 0, ballAngleDeg: 0 });
Object.defineProperty(window, "__TASK_STATE__", { get: () => current, enumerable: true, configurable: false });

app.onFrame((f) => {
  acc += Math.min(f.dt, 0.1);
  let steps = 0;
  while (acc >= H && steps < 30) {
    fixedStep();
    acc -= H;
    steps += 1;
  }
  if (acc > H * 30) acc = 0;

  const ball = world.ball;
  const theta = world.ballAngle();
  app.nodes.require("ball").setPosition(ball.pos.x, ball.pos.y, ball.pos.z);
  const rope = app.nodes.require("rope");
  rope.setPosition((PIVOT.x + ball.pos.x) / 2, (PIVOT.y + ball.pos.y) / 2, 0);
  rope.setRotation(0, 0, theta);
  for (let i = 0; i < world.crates.length; i += 1) {
    const c = world.crates[i]!;
    if (c.asleep && !fullSync) continue;
    const h = app.nodes.require(`crate-${i}`);
    h.setPosition(c.pos.x, c.pos.y, c.pos.z);
    const e = quatToEulerZYX(c.q);
    h.setRotation(e[0], e[1], e[2]);
  }
  fullSync = false;
  publish();
});

await app.ready();
publish();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
