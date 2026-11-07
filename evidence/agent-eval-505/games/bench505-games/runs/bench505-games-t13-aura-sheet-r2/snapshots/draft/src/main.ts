import { camera, createAuraApp, effects, group, lights, material, primitives, scene } from "@aura3d/engine";

type Status = "ready" | "playing" | "won" | "lost";
interface TaskState { status: Status; score: number; speed: number; airborne: boolean }
declare global {
  interface Window { __TASK_STATE__?: TaskState; __TASK_READY__?: boolean }
}

// ---------- tuning ----------
const GOAL = 500;
const BASE_SPEED = 10;
const SPEED_GAIN = 0.02; // m/s per metre travelled (20 m/s at 500 m)
const GRAVITY = 28;
const JUMP_V = 10;
const RUNNER_HALF_DEPTH = 0.3;
const HURDLE_HALF_DEPTH = 0.25;
const POOL = 10;
const SPAWN_AHEAD = 75;
const SEED = Number(new URLSearchParams(location.search).get("seed") ?? "12345") >>> 0 || 12345;

// ---------- seeded random ----------
let rngState = SEED;
const rand = (): number => ((rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0) / 4294967296);

// ---------- scene ----------
const FOG = "#b9d3e6";
const grass = material.pbr({ color: "#5e8a3e", roughness: 1 });
const asphalt = material.pbr({ color: "#6a6e78", roughness: 0.9 });
const white = material.pbr({ color: "#f4f4f4", roughness: 0.8 });
const red = material.pbr({ color: "#e0383a", roughness: 0.6 });
const trunkMat = material.pbr({ color: "#5a3d24", roughness: 1 });
const leafMat = material.pbr({ color: "#2f7a35", roughness: 0.9 });
const yellow = material.pbr({ color: "#ffd23a", roughness: 0.6 });
const skin = material.pbr({ color: "#ff8a1e", roughness: 0.5 });
const pants = material.pbr({ color: "#1f4fd8", roughness: 0.6 });
const visorMat = material.pbr({ color: "#101018", roughness: 0.3 });

const scroller = (id: string, period: number, kids: Parameters<typeof group>[1]) =>
  group(id, kids, { position: [0, 0, 0] }).runtime({ id, mutable: true });

// lane dashes (period 6 m)
const dashes = [];
for (let k = -1; k < 23; k += 1) {
  dashes.push(primitives.box({ name: `dash${k}`, size: [0.28, 0.02, 2.4], material: white, castShadow: false }).position(0, 0.03, -k * 6));
}
// side posts (period 10 m)
const posts = [];
for (let k = -1; k < 14; k += 1) {
  for (const side of [-1, 1]) {
    posts.push(primitives.box({ name: `post${k}_${side}`, size: [0.28, 1.5, 0.28], material: white }).position(side * 3.3, 0.75, -k * 10));
    posts.push(primitives.sphere({ name: `postTop${k}_${side}`, size: 0.4, material: red }).position(side * 3.3, 1.6, -k * 10));
  }
}
// trees (period 24 m)
const treeSlots: Array<[number, number, number]> = [[-7, -3, 1], [9, -9, 1.3], [-11.5, -15, 1.1], [7.5, -21, 0.9]];
const trees = [];
for (let k = -1; k < 6; k += 1) {
  treeSlots.forEach(([x, z, s], i) => {
    const zz = z - k * 24;
    trees.push(primitives.cylinder({ name: `trunk${k}_${i}`, size: [0.5 * s, 2 * s, 0.5 * s], material: trunkMat }).position(x, s, zz));
    trees.push(primitives.cone({ name: `leaf${k}_${i}`, size: [2.6 * s, 4.5 * s, 2.6 * s], material: leafMat }).position(x, 2 * s + 2.2 * s, zz));
  });
}

// hurdle pool
const hurdleNodes = [];
for (let i = 0; i < POOL; i += 1) {
  hurdleNodes.push(
    primitives.box({ name: `hurdle${i}`, size: [1, 1, 1], material: red }).position(0, -50, 0).runtime({ id: `hurdle${i}`, mutable: true })
  );
}

// runner
const joint = (id: string, position: [number, number, number], kids: Parameters<typeof group>[1]) =>
  group(id, kids, { position }).runtime({ id, mutable: true });
const runner = group("runner", [
  primitives.box({ name: "torso", size: [0.5, 0.6, 0.3], material: skin }).position(0, 1.15, 0),
  primitives.sphere({ name: "head", size: 0.38, material: skin }).position(0, 1.67, 0),
  primitives.box({ name: "visor", size: [0.3, 0.1, 0.06], material: visorMat }).position(0, 1.7, -0.17),
  primitives.box({ name: "band", size: [0.52, 0.08, 0.32], material: yellow }).position(0, 0.88, 0),
  joint("legL", [-0.13, 0.85, 0], [primitives.capsule({ name: "legLm", size: [0.17, 0.82, 0.17], material: pants }).position(0, -0.4, 0)]),
  joint("legR", [0.13, 0.85, 0], [primitives.capsule({ name: "legRm", size: [0.17, 0.82, 0.17], material: pants }).position(0, -0.4, 0)]),
  joint("armL", [-0.34, 1.4, 0], [primitives.capsule({ name: "armLm", size: [0.13, 0.55, 0.13], material: skin }).position(0, -0.27, 0)]),
  joint("armR", [0.34, 1.4, 0], [primitives.capsule({ name: "armRm", size: [0.13, 0.55, 0.13], material: skin }).position(0, -0.27, 0)])
], { position: [0, 0, 0] }).runtime({ id: "runner", mutable: true });

const sc = scene({ background: FOG })
  .camera(camera.perspective({ position: [0, 3.4, 7], target: [0, 1, -7], fov: 55, near: 0.5, far: 300 }))
  .add(lights.hemisphere({ skyColor: "#dbe9f6", groundColor: "#5d6b45", intensity: 1.1 }))
  .add(lights.directional({ position: [8, 14, 6], target: [0, 0, -4], intensity: 3, shadow: true }))
  .add(effects.fog({ color: FOG, density: 0.025 }))
  .add(primitives.plane({ name: "ground", size: [240, 1, 300], material: grass, castShadow: false }).position(0, 0, -120))
  .add(primitives.plane({ name: "track", size: [5, 1, 300], material: asphalt, castShadow: false }).position(0, 0.01, -120))
  .add(primitives.box({ name: "railL", size: [0.2, 0.08, 300], material: white, castShadow: false }).position(-2.5, 0.04, -120))
  .add(primitives.box({ name: "railR", size: [0.2, 0.08, 300], material: white, castShadow: false }).position(2.5, 0.04, -120))
  .add(scroller("dashes", 6, dashes))
  .add(scroller("posts", 10, posts))
  .add(scroller("trees", 24, trees))
  .addMany(hurdleNodes)
  .add(runner);

// ---------- HUD ----------
const hud = document.createElement("div");
hud.style.cssText = "width:640px;box-sizing:border-box;padding:6px 10px;display:flex;justify-content:space-between;background:#111;color:#fff;font:14px/1.4 system-ui,sans-serif;";
const distEl = document.createElement("span");
const bestEl = document.createElement("span");
const statusEl = document.createElement("span");
hud.append(distEl, bestEl, statusEl);
document.body.appendChild(hud);

const overlay = document.createElement("div");
overlay.style.cssText = "position:absolute;left:0;top:0;width:640px;height:360px;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;color:#fff;text-align:center;font:bold 28px/1.3 system-ui,sans-serif;text-shadow:0 2px 6px #000;";
document.body.appendChild(overlay);

// ---------- game state ----------
interface Hurdle { dist: number; h: number }
let status: Status = "ready";
let distance = 0;
let speed = 0;
let y = 0;
let vy = 0;
let airborne = false;
let best = 0;
let hurdles: Hurdle[] = [];
let nextHurdle = 30;

const app = createAuraApp("#app", { scene: sc });

function resetRun(): void {
  rngState = SEED;
  status = "ready";
  distance = 0;
  speed = 0;
  y = 0;
  vy = 0;
  airborne = false;
  hurdles = [];
  nextHurdle = 30;
  spawnHurdles();
}

function spawnHurdles(): void {
  while (hurdles.length < POOL - 1 && nextHurdle < distance + SPAWN_AHEAD) {
    hurdles.push({ dist: nextHurdle, h: 0.45 + rand() * 0.65 });
    nextHurdle += 15 + rand() * 14 + Math.min(distance * 0.03, 10);
  }
}

function jump(): void {
  y = 0.0001;
  vy = JUMP_V;
  airborne = true;
}

function pressJump(): void {
  if (status === "ready") {
    status = "playing";
    jump();
  } else if (status === "playing") {
    if (!airborne) jump();
  } else {
    resetRun();
    status = "playing";
    jump();
  }
  publish();
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
    e.preventDefault();
    if (!e.repeat) pressJump();
  } else if (e.code === "KeyR") {
    resetRun();
    publish();
  }
});
window.addEventListener("pointerdown", () => pressJump());

function publish(): void {
  const score = Math.floor(distance);
  if (score > best) best = score;
  window.__TASK_STATE__ = { status, score, speed: Math.round(speed * 100) / 100, airborne };
  distEl.textContent = `Distance: ${score} m`;
  bestEl.textContent = `Best: ${best} m`;
  statusEl.textContent = `Status: ${status}`;
  if (status === "lost") {
    overlay.innerHTML = `<div>Game over</div><div style="font-size:18px">${score} m. Press R, Space or click to restart</div>`;
  } else if (status === "won") {
    overlay.innerHTML = `<div>You win! ${GOAL} m</div><div style="font-size:18px">Press R, Space or click to restart</div>`;
  } else if (status === "ready") {
    overlay.innerHTML = `<div style="font-size:20px">Press Space / W / ArrowUp or click to start</div>`;
  } else {
    overlay.innerHTML = "";
  }
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.05);
  if (status === "playing") {
    const prev = distance;
    speed = BASE_SPEED + distance * SPEED_GAIN;
    distance += speed * dt;
    if (airborne) {
      vy -= GRAVITY * dt;
      y += vy * dt;
      if (y <= 0) {
        y = 0;
        vy = 0;
        airborne = false;
      }
    }
    for (const h of hurdles) {
      if (h.dist > prev - HURDLE_HALF_DEPTH - RUNNER_HALF_DEPTH && h.dist < distance + HURDLE_HALF_DEPTH + RUNNER_HALF_DEPTH && y < h.h - 0.05) {
        status = "lost";
      }
    }
    if (status === "playing" && distance >= GOAL) {
      distance = GOAL;
      status = "won";
    }
    if (status !== "playing") speed = 0;
    hurdles = hurdles.filter((h) => h.dist > distance - 6);
    spawnHurdles();
    publish();
  }

  // scenery scroll
  app.nodes.require("dashes").setPosition(0, 0, mod(distance, 6));
  app.nodes.require("posts").setPosition(0, 0, mod(distance, 10));
  app.nodes.require("trees").setPosition(0, 0, mod(distance, 24));

  // hurdles
  for (let i = 0; i < POOL; i += 1) {
    const n = app.nodes.require(`hurdle${i}`);
    const h = hurdles[i];
    if (h) {
      n.setScale([4.6, h.h, HURDLE_HALF_DEPTH * 2]);
      n.setPosition(0, h.h / 2, -(h.dist - distance));
    } else {
      n.setPosition(0, -50, 0);
    }
  }

  // runner
  app.nodes.require("runner").setPosition(0, y, 0);
  const running = status === "playing" && !airborne;
  const phase = distance * 1.7;
  let swing = running ? Math.sin(phase) * 0.9 : 0;
  if (airborne) swing = 0.7;
  if (status === "lost") swing = 0.3;
  app.nodes.require("legL").setRotation(swing, 0, 0);
  app.nodes.require("legR").setRotation(airborne ? -0.5 : -swing, 0, 0);
  app.nodes.require("armL").setRotation(airborne ? -1.2 : -swing, 0, 0);
  app.nodes.require("armR").setRotation(airborne ? -1.2 : swing, 0, 0);
});

resetRun();
publish();
await app.ready();
window.__TASK_READY__ = true;
