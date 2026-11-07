import { camera, createAuraApp, effects, environments, group, lights, material, primitives, scene, sky } from "@aura3d/engine";
import { eulerZYX, World } from "./physics";

type Vec3 = [number, number, number];
type Phase = "ready" | "swinging" | "settled";

interface TaskState {
  readonly phase: Phase;
  readonly crates: number;
  readonly displaced: number;
  readonly ballAngleDeg: number;
}

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    readonly __TASK_STATE__?: TaskState;
  }
}

// ------------------------------------------------------------------ constants
const ROPE_LENGTH = 6;
const PIVOT: Vec3 = [-3.4, 8.5, 0];
const BALL_RADIUS = 0.75;
const START_ANGLE_DEG = 60;
const ROWS = 5;
const DISPLACED_DISTANCE = 0.75;

const world = new World({
  pivot: PIVOT,
  ropeLength: ROPE_LENGTH,
  ballRadius: BALL_RADIUS,
  ballMass: 40,
  crateMass: 1,
  rows: ROWS,
  pyramidX: 0
});

// -------------------------------------------------------------------- scene
const concrete = material.pbr({ color: "#a9aaa5", roughness: 0.95 });
const concreteDark = material.pbr({ color: "#8e8f8b", roughness: 0.95 });
const jointMat = material.pbr({ color: "#5d5e5b", roughness: 1 });
const craneYellow = material.pbr({ color: "#e0a420", roughness: 0.55, metallic: 0.1 });
const craneDark = material.pbr({ color: "#3b3d41", roughness: 0.6, metallic: 0.5 });
const steel = material.pbr({ color: "#5b6068", roughness: 0.28, metallic: 1 });
const chainMat = material.pbr({ color: "#2f3236", roughness: 0.45, metallic: 0.9 });
const frameWood = material.pbr({ color: "#7a4d24", roughness: 0.85 });
const woodShades = ["#c9964f", "#bd8844", "#d3a25e"].map((color) => material.pbr({ color, roughness: 0.9 }));

const box = (name: string, size: Vec3, position: Vec3, mat = craneYellow, rotation: Vec3 = [0, 0, 0]) =>
  primitives.box({ name, size, position, rotation, material: mat });

function crateNode(index: number) {
  const body = world.crates[index];
  const kids = [
    primitives.box({ name: `crate-${index}-core`, size: 0.94, material: woodShades[index % woodShades.length] })
  ];
  const o = 0.44;
  for (const s1 of [-1, 1]) {
    for (const s2 of [-1, 1]) {
      const t = `${s1 > 0 ? "p" : "n"}${s2 > 0 ? "p" : "n"}`;
      kids.push(box(`crate-${index}-bx-${t}`, [1, 0.12, 0.12], [0, s1 * o, s2 * o], frameWood));
      kids.push(box(`crate-${index}-by-${t}`, [0.12, 1, 0.12], [s1 * o, 0, s2 * o], frameWood));
      kids.push(box(`crate-${index}-bz-${t}`, [0.12, 0.12, 1], [s1 * o, s2 * o, 0], frameWood));
    }
  }
  kids.push(box(`crate-${index}-brace-f`, [1.2, 0.1, 0.03], [0, 0, 0.485], frameWood, [0, 0, Math.PI / 4]));
  kids.push(box(`crate-${index}-brace-b`, [1.2, 0.1, 0.03], [0, 0, -0.485], frameWood, [0, 0, -Math.PI / 4]));
  return group(`crate-${index}`, kids, { position: [body.p[0], body.p[1], body.p[2]] }).runtime({ id: `crate-${index}`, mutable: true });
}

function buildCrane() {
  const parts = [];
  const tx = -10.8; // tower centre
  const hw = 0.6; // half width of the tower footprint
  const top = 10.6;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(box(`tower-post-${sx}-${sz}`, [0.22, top, 0.22], [tx + sx * hw, top / 2, sz * hw], craneYellow));
    }
  }
  const levels = 7;
  const step = top / levels;
  for (let i = 0; i <= levels; i += 1) {
    const y = i * step;
    parts.push(box(`tower-ring-x-${i}`, [2 * hw, 0.1, 0.1], [tx, y, hw], craneDark));
    parts.push(box(`tower-ring-x2-${i}`, [2 * hw, 0.1, 0.1], [tx, y, -hw], craneDark));
    parts.push(box(`tower-ring-z-${i}`, [0.1, 0.1, 2 * hw], [tx + hw, y, 0], craneDark));
    parts.push(box(`tower-ring-z2-${i}`, [0.1, 0.1, 2 * hw], [tx - hw, y, 0], craneDark));
  }
  const diagLen = Math.hypot(2 * hw, step);
  const diagAngle = Math.atan2(step, 2 * hw);
  for (let i = 0; i < levels; i += 1) {
    const y = (i + 0.5) * step;
    const dir = i % 2 === 0 ? 1 : -1;
    parts.push(box(`tower-diag-f-${i}`, [diagLen, 0.08, 0.08], [tx, y, hw], craneDark, [0, 0, dir * diagAngle]));
    parts.push(box(`tower-diag-b-${i}`, [diagLen, 0.08, 0.08], [tx, y, -hw], craneDark, [0, 0, -dir * diagAngle]));
  }
  parts.push(box("tower-base", [2.6, 0.3, 2.6], [tx, 0.15, 0], craneDark));
  // jib (working arm), counter jib, cab, counterweight
  const jibY = PIVOT[1] + 0.3;
  const jibLeft = -12.6;
  const jibRight = PIVOT[0] + 0.6;
  parts.push(box("jib", [jibRight - jibLeft, 0.5, 0.7], [(jibLeft + jibRight) / 2, jibY, 0], craneYellow));
  parts.push(box("jib-rail-top", [jibRight - jibLeft, 0.1, 0.1], [(jibLeft + jibRight) / 2, jibY + 0.45, 0], craneDark));
  parts.push(box("counterweight", [1.2, 1.1, 1.1], [jibLeft + 0.6, jibY - 0.8, 0], craneDark));
  parts.push(box("cab", [1.1, 1.0, 0.9], [tx + 0.9, jibY + 0.75, 0.9], craneDark));
  parts.push(box("apex", [0.3, 1.4, 0.3], [tx, top + 0.5, 0], craneYellow));
  // tie rods from the apex to the jib ends
  const apexY = top + 1.1;
  const rod = (name: string, x2: number, y2: number) => {
    const dx = x2 - tx;
    const dy = y2 - apexY;
    return box(name, [Math.hypot(dx, dy), 0.07, 0.07], [(tx + x2) / 2, (apexY + y2) / 2, 0], craneDark, [0, 0, Math.atan2(dy, dx)]);
  };
  parts.push(rod("tie-front", jibRight - 0.2, jibY + 0.4));
  parts.push(rod("tie-back", jibLeft + 0.2, jibY + 0.4));
  // trolley that carries the pivot
  parts.push(box("trolley", [0.7, 0.3, 0.6], [PIVOT[0], PIVOT[1] + 0.05, 0], craneDark));
  return group("crane", parts);
}

function buildYard() {
  const parts = [];
  parts.push(box("slab", [54, 0.4, 20], [-2, -0.2, 0], concrete));
  for (let x = -26; x <= 22; x += 6) parts.push(box(`joint-x-${x}`, [0.06, 0.02, 20], [x, 0.005, 0], jointMat));
  for (let z = -6; z <= 6; z += 6) parts.push(box(`joint-z-${z}`, [54, 0.02, 0.06], [-2, 0.005, z], jointMat));
  // low concrete wall at the back of the yard
  parts.push(box("wall", [54, 2.4, 0.6], [-2, 1.2, -9.6], concreteDark));
  parts.push(box("wall-cap", [54.4, 0.2, 0.9], [-2, 2.5, -9.6], concrete));
  for (let x = -26; x <= 22; x += 6) parts.push(box(`wall-post-${x}`, [0.5, 2.6, 0.9], [x, 1.3, -9.6], concrete));
  return group("yard", parts);
}

const crateNodes = world.crates.map((_, i) => crateNode(i));

const stage = scene({ background: "#9fc4e8" })
  .add(sky.preetham({ sun: { elevationDeg: 38, azimuthDeg: 55 } }))
  .add(environments.neutral({ intensity: 0.5, background: false }))
  .add(lights.hemisphere({ skyColor: "#cfe3ff", groundColor: "#5e5d55", intensity: 0.4 }))
  .add(lights.directional({ name: "key", position: [9, 15, 11], target: [-2, 0, 0], intensity: 2.4, color: "#fff1d9", shadow: true }))
  .add(effects.fog({ color: "#b7d2ea", density: 0.003 }))
  .add(primitives.plane({ name: "ground", size: [300, 1, 300], position: [0, -0.45, 0], material: material.pbr({ color: "#6f7a55", roughness: 1 }), castShadow: false }))
  .add(buildYard())
  .add(buildCrane())
  .addMany(crateNodes)
  .add(
    primitives
      .cylinder({ name: "chain", size: [0.09, 1, 0.09], position: [PIVOT[0], PIVOT[1] - ROPE_LENGTH / 2, 0], material: chainMat })
      .runtime({ id: "chain", mutable: true })
  )
  .add(
    primitives
      .cylinder({ name: "hook", size: [0.3, 0.35, 0.3], position: [PIVOT[0], PIVOT[1] - ROPE_LENGTH + BALL_RADIUS + 0.1, 0], material: craneDark })
      .runtime({ id: "hook", mutable: true })
  )
  .add(
    primitives
      .sphere({ name: "ball", size: BALL_RADIUS * 2, position: [PIVOT[0], PIVOT[1] - ROPE_LENGTH, 0], material: steel })
      .runtime({ id: "ball", mutable: true })
  )
  .camera(camera.perspective({ position: [-1.5, 6.2, 19.5], target: [-1.8, 4.5, 0], fov: 42, near: 0.1, far: 300 }));

// ------------------------------------------------------------------- state
let swingActive = false;
let swingTime = 0;
let hit = false;
let latchedSettled = false;
let forceSync = true;
let state: TaskState = { phase: "ready", crates: world.crates.length, displaced: 0, ballAngleDeg: 0 };

Object.defineProperty(window, "__TASK_STATE__", {
  configurable: false,
  enumerable: true,
  get: () => state
});

function countDisplaced(): number {
  let n = 0;
  for (const c of world.crates) {
    const dx = c.p[0] - c.initialP[0];
    const dy = c.p[1] - c.initialP[1];
    const dz = c.p[2] - c.initialP[2];
    if (Math.hypot(dx, dy, dz) > DISPLACED_DISTANCE) n += 1;
  }
  return n;
}

function currentPhase(): Phase {
  if (!swingActive) return "ready";
  if (latchedSettled) return "settled";
  if (!hit && world.crates.some((c) => !c.asleep)) hit = true;
  const quiet = world.crates.every((c) => c.asleep);
  const slow = world.crates.every((c) => Math.hypot(c.v[0], c.v[1], c.v[2]) < 0.3);
  if ((hit && swingTime > 2 && quiet) || (swingTime > 25 && slow) || (!hit && swingTime > 8)) {
    latchedSettled = true;
    return "settled";
  }
  return "swinging";
}

// ----------------------------------------------------------------- DOM HUD
function makeButton(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.id = `btn-${label.toLowerCase()}`;
  b.style.cssText =
    "font:600 14px system-ui,sans-serif;padding:6px 16px;margin-right:8px;border:1px solid #1b1d20;border-radius:4px;" +
    "background:#f2b21a;color:#1b1d20;cursor:pointer;";
  b.addEventListener("click", onClick);
  return b;
}

function swing(): void {
  world.releaseFrom(START_ANGLE_DEG);
  swingActive = true;
  swingTime = 0;
  hit = false;
  latchedSettled = false;
}

function reset(): void {
  world.reset();
  swingActive = false;
  swingTime = 0;
  hit = false;
  latchedSettled = false;
  forceSync = true;
}

const hud = document.createElement("div");
hud.style.cssText = "position:fixed;left:8px;top:8px;z-index:10;display:flex;align-items:center;";
hud.append(makeButton("Swing", swing), makeButton("Reset", reset));
document.body.append(hud);

// -------------------------------------------------------------------- loop
async function main(): Promise<void> {
  const app = createAuraApp("#app", { scene: stage });
  await app.ready();

  const crateHandles = world.crates.map((_, i) => app.nodes.require(`crate-${i}`));
  const ballNode = app.nodes.require("ball");
  const chainNode = app.nodes.require("chain");
  const hookNode = app.nodes.require("hook");

  let last = performance.now();
  let acc = 0;
  let firstFrame = true;

  app.onFrame(() => {
    const now = performance.now();
    const frameDt = Math.min((now - last) / 1000, 0.25);
    last = now;
    acc += frameDt;
    let steps = 0;
    while (acc >= world.dt && steps < 40) {
      world.step();
      acc -= world.dt;
      steps += 1;
      if (swingActive) swingTime += world.dt;
    }
    if (steps >= 40) acc = 0;

    // render sync
    for (let i = 0; i < world.crates.length; i += 1) {
      const c = world.crates[i];
      if (c.asleep && !forceSync) continue;
      const e = eulerZYX(c);
      crateHandles[i].setPosition(c.p[0], c.p[1], c.p[2]).setRotation(e[0], e[1], e[2]);
    }
    forceSync = false;
    const b = world.ball;
    const dx = b.p[0] - PIVOT[0];
    const dy = b.p[1] - PIVOT[1];
    const len = Math.hypot(dx, dy);
    const theta = Math.atan2(dx, -dy);
    ballNode.setPosition(b.p[0], b.p[1], b.p[2]);
    chainNode
      .setPosition(PIVOT[0] + dx / 2, PIVOT[1] + dy / 2, 0)
      .setRotation(0, 0, theta)
      .setScale([1, len, 1]);
    const up = BALL_RADIUS + 0.1;
    hookNode.setPosition(b.p[0] - (dx / len) * up, b.p[1] - (dy / len) * up, 0).setRotation(0, 0, theta);

    state = Object.freeze({
      phase: currentPhase(),
      crates: world.crates.length,
      displaced: countDisplaced(),
      ballAngleDeg: world.ballAngleDeg()
    });

    if (firstFrame) {
      firstFrame = false;
      // the engine draws after this callback; flag readiness on the next animation frame
      requestAnimationFrame(() => {
        window.__EVAL_READY__ = true;
      });
    }
  });
}

void main();
