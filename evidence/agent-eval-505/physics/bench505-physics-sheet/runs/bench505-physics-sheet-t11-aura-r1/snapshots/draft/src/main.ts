import { camera, createAuraApp, effects, environments, group, lights, material, primitives, scene, sky } from "@aura3d/engine";
import { World, makeBox, makeCircle, type Body } from "./physics";

type Phase = "ready" | "swinging" | "settled";
interface TaskState { phase: Phase; crates: number; displaced: number; ballAngleDeg: number }

declare global {
  interface Window {
    __TASK_STATE__?: Readonly<TaskState>;
    __EVAL_READY__?: boolean;
  }
}

// ---- layout constants ----
const DT = 1 / 120;
const PIVOT_X = 0, PIVOT_Y = 8, ROPE_LEN = 6, BALL_R = 0.8;
const REST_ANGLE = 60; // degrees
const ROWS = 5;
const PYRAMID_LEFT = 0.6;
const CHAIN_LINKS = 22;

// ---- physics world ----
interface Sim { world: World; crates: Body[]; initial: Array<[number, number]>; ball: Body }

function buildSim(): Sim {
  const world = new World();
  world.add(makeBox("ground", 0, -1, 60, 1, 0, 0.8, 0));
  const crates: Body[] = [];
  const initial: Array<[number, number]> = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let i = 0; i < ROWS - r; i += 1) {
      const x = PYRAMID_LEFT + 0.5 + 0.5 * r + i, y = 0.5 + r;
      crates.push(world.add(makeBox("crate", x, y, 0.5, 0.5, 1, 0.6, 0.1)));
      initial.push([x, y]);
    }
  }
  const ball = world.add(makeCircle("ball", PIVOT_X, PIVOT_Y - ROPE_LEN, BALL_R, 20, 0.4, 0.2));
  world.setRope(ball, PIVOT_X, PIVOT_Y, ROPE_LEN);
  return { world, crates, initial, ball };
}

// ---- scene ----
const woodMat = material.pbr({ color: "#b9803f", roughness: 0.85 });
const trimMat = material.pbr({ color: "#6e4420", roughness: 0.9 });
const steel = material.pbr({ color: "#8d96a3", metallic: 0.9, roughness: 0.3 });
const darkSteel = material.pbr({ color: "#3a3f48", metallic: 0.8, roughness: 0.45 });
const paint = material.pbr({ color: "#e0a11b", roughness: 0.6 });

function crateNode(i: number, x: number, y: number) {
  const n = `crate-${i}`;
  return group(n, [
    primitives.box({ name: `${n}-body`, size: [1, 1, 1], material: woodMat }),
    primitives.box({ name: `${n}-top`, size: [1.04, 0.12, 1.04], material: trimMat }).position(0, 0.44, 0),
    primitives.box({ name: `${n}-bot`, size: [1.04, 0.12, 1.04], material: trimMat }).position(0, -0.44, 0),
    primitives.box({ name: `${n}-left`, size: [0.12, 0.76, 1.04], material: trimMat }).position(-0.44, 0, 0),
    primitives.box({ name: `${n}-right`, size: [0.12, 0.76, 1.04], material: trimMat }).position(0.44, 0, 0)
  ], { position: [x, y, 0] }).runtime({ id: n, mutable: true });
}

let sim = buildSim();

let sc = scene({ background: "#a9c4dc" })
  .camera(camera.perspective({ position: [2.5, 5.5, 18.5], target: [-1.2, 4.1, 0], fov: 36, near: 0.5, far: 300 }))
  .add(sky.gradient({ zenith: "#6f9bc8", horizon: "#d6e4ee" }))
  .add(environments.neutral({ intensity: 0.55, background: false }))
  .add(lights.hemisphere({ skyColor: "#cfe0f2", groundColor: "#7a766e", intensity: 0.9 }))
  .add(lights.directional({
    position: [-9, 18, 13], target: [0, 2, 0], intensity: 2.6,
    shadow: { filter: "pcf", mapSize: 2048, softness: 1.5 }
  }))
  .add(effects.fog({ color: "#c4d6e4", density: 0.006 }))
  .add(primitives.plane({ name: "ground", size: [120, 1, 60], material: material.pbr({ color: "#9b9b97", roughness: 0.95 }) }));

// expansion joints in the concrete slab
for (let i = -5; i <= 5; i += 1) {
  sc = sc.add(primitives.box({ name: `joint-x-${i}`, size: [0.07, 0.02, 60], material: material.pbr({ color: "#6f6f6c", roughness: 1 }), castShadow: false }).position(i * 6, 0.01, 0));
}
for (let k = -2; k <= 4; k += 1) {
  sc = sc.add(primitives.box({ name: `joint-z-${k}`, size: [120, 0.02, 0.07], material: material.pbr({ color: "#6f6f6c", roughness: 1 }), castShadow: false }).position(0, 0.01, k * 6 - 2));
}

// yard backdrop: wall and barrels
sc = sc.add(primitives.box({ name: "wall", size: [60, 3, 0.6], material: material.pbr({ color: "#868a8e", roughness: 0.95 }) }).position(0, 1.5, -9));
for (let i = 0; i < 4; i += 1) {
  sc = sc.add(primitives.cylinder({ name: `barrel-${i}`, size: [0.9, 1.2, 0.9], material: material.pbr({ color: i % 2 ? "#b0382c" : "#2f5f8f", roughness: 0.55, metallic: 0.3 }) }).position(7 + i * 1.1, 0.6, -5 + (i % 2) * 0.8));
}

// crane
sc = sc
  .add(primitives.box({ name: "crane-base", size: [2.6, 0.3, 2.6], material: darkSteel }).position(-7.5, 0.15, 0))
  .add(primitives.box({ name: "crane-tower", size: [0.7, 8.8, 0.7], material: paint }).position(-7.5, 4.6, 0))
  .add(primitives.box({ name: "crane-cab", size: [1.1, 0.9, 1.0], material: darkSteel }).position(-7.5, 1.1, 0.4))
  .add(primitives.box({ name: "crane-arm", size: [8.6, 0.5, 0.5], material: paint }).position(-3.7, 8.4, 0))
  .add(primitives.box({ name: "crane-counterweight", size: [1.1, 0.9, 0.9], material: darkSteel }).position(-8.1, 8.0, 0))
  .add(primitives.box({ name: "crane-hook", size: [0.3, 0.2, 0.3], material: darkSteel }).position(PIVOT_X, 8.1, 0));

for (let i = 0; i < CHAIN_LINKS; i += 1) {
  sc = sc.add(primitives.sphere({ name: `chain-${i}`, size: 0.16, material: darkSteel }).position(PIVOT_X, PIVOT_Y - (i * 0.25), 0).runtime({ id: `chain-${i}`, mutable: true }));
}
sc = sc.add(primitives.sphere({ name: "ball", size: BALL_R * 2, material: steel }).position(PIVOT_X, PIVOT_Y - ROPE_LEN, 0).runtime({ id: "ball", mutable: true }));

sim.crates.forEach((c, i) => {
  sc = sc.add(crateNode(i, c.x, c.y));
});

const app = createAuraApp("#app", { scene: sc });

// ---- UI ----
const bar = document.createElement("div");
bar.style.cssText = "position:fixed;left:8px;top:8px;display:flex;gap:8px;z-index:10";
function makeButton(id: string, label: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.id = id;
  b.type = "button";
  b.textContent = label;
  b.style.cssText = "padding:6px 14px;font:600 13px system-ui,sans-serif;color:#fff;background:rgba(20,28,40,0.82);border:1px solid rgba(255,255,255,0.5);border-radius:5px;cursor:pointer";
  bar.appendChild(b);
  return b;
}
const swingBtn = makeButton("swing", "Swing");
const resetBtn = makeButton("reset", "Reset");
document.body.appendChild(bar);

// ---- game state ----
let released = false;
let swingTime = 0;
let calmTimer = 0;
let acc = 0;
let current: Readonly<TaskState> = Object.freeze({ phase: "ready" as Phase, crates: sim.crates.length, displaced: 0, ballAngleDeg: 0 });
Object.defineProperty(window, "__TASK_STATE__", { get: () => current, set: () => undefined, configurable: true, enumerable: true });

function ballAngleDeg(): number {
  const b = sim.ball;
  return (Math.atan2(-(b.x - PIVOT_X), -(b.y - PIVOT_Y)) * 180) / Math.PI;
}

function swing(): void {
  const a = (REST_ANGLE * Math.PI) / 180;
  const b = sim.ball;
  b.x = PIVOT_X - ROPE_LEN * Math.sin(a);
  b.y = PIVOT_Y - ROPE_LEN * Math.cos(a);
  b.vx = 0; b.vy = 0; b.w = 0;
  sim.world.ballHit = false;
  released = true;
  swingTime = 0;
  calmTimer = 0;
}

function reset(): void {
  sim = buildSim();
  released = false;
  swingTime = 0;
  calmTimer = 0;
  acc = 0;
  syncNodes();
}

swingBtn.addEventListener("click", swing);
resetBtn.addEventListener("click", reset);

function syncNodes(): void {
  const nodes = app.nodes;
  sim.crates.forEach((c, i) => {
    const n = nodes.require(`crate-${i}`);
    n.setPosition(c.x, c.y, 0);
    n.setRotation(0, 0, c.a);
  });
  const b = sim.ball;
  nodes.require("ball").setPosition(b.x, b.y, 0);
  const dx = b.x - PIVOT_X, dy = b.y - PIVOT_Y;
  const d = Math.hypot(dx, dy) || 1;
  const chainLen = ROPE_LEN - BALL_R;
  for (let i = 0; i < CHAIN_LINKS; i += 1) {
    const s = (i / (CHAIN_LINKS - 1)) * chainLen;
    nodes.require(`chain-${i}`).setPosition(PIVOT_X + (dx / d) * s, PIVOT_Y + (dy / d) * s, 0);
  }
}

app.onFrame((f) => {
  acc += Math.min(f.dt, 0.05);
  let steps = 0;
  while (acc >= DT && steps < 12) {
    sim.world.step(DT);
    acc -= DT;
    steps += 1;
  }
  if (steps === 12) acc = 0;
  const elapsed = steps * DT;

  let maxV = 0, maxW = 0, displaced = 0;
  sim.crates.forEach((c, i) => {
    maxV = Math.max(maxV, Math.hypot(c.vx, c.vy));
    maxW = Math.max(maxW, Math.abs(c.w));
    const [x0, y0] = sim.initial[i]!;
    if (Math.hypot(c.x - x0, c.y - y0) > 0.75) displaced += 1;
  });
  if (released) {
    swingTime += elapsed;
    calmTimer = maxV < 0.12 && maxW < 0.3 ? calmTimer + elapsed : 0;
  }
  let phase: Phase = "ready";
  if (released) {
    phase = calmTimer >= 0.75 && (sim.world.ballHit || swingTime > 8) ? "settled" : "swinging";
  }
  syncNodes();
  current = Object.freeze({ phase, crates: sim.crates.length, displaced, ballAngleDeg: ballAngleDeg() });
});

await app.ready();
window.__EVAL_READY__ = true;
