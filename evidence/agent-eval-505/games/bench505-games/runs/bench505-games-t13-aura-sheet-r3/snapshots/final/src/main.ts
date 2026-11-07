import { camera, createAuraApp, effects, group, lights, material, primitives, scene } from "@aura3d/engine";

type Status = "ready" | "playing" | "won" | "lost";
type Kids = Parameters<typeof group>[1];

declare global {
  interface Window {
    __TASK_STATE__?: { status: Status; score: number; speed: number; airborne: boolean };
    __TASK_READY__?: boolean;
  }
}

// ---------- tunables ----------
const WIN_DISTANCE = 500;
const GRAVITY = 26;
const JUMP_V = 9;
const BASE_SPEED = 9;
const SPEED_GAIN = 0.016; // m/s per metre travelled
const TRACK_W = 6;
const HURDLE_DEPTH = 0.5;
const RUNNER_DEPTH = 0.5;
const HURDLE_POOL = 14;
const SPAWN_AHEAD = 90;
const PERIOD = 8;

const seedParam = Number(new URLSearchParams(location.search).get("seed"));
const SEED = Number.isFinite(seedParam) && seedParam !== 0 ? seedParam >>> 0 : 1337;

const makeRng = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const speedAt = (d: number): number => BASE_SPEED + SPEED_GAIN * d;

// ---------- scene ----------
let uid = 0;
const nm = (p: string): string => `${p}-${uid++}`;
const mat = (color: string, roughness = 0.85) => material.pbr({ color, roughness });

const SKY = "#9fc9e8";
let sc = scene({ background: SKY })
  .camera(camera.perspective({ position: [0, 3.4, 7.5], target: [0, 1, -6], fov: 55, near: 0.3, far: 250 }))
  .add(lights.hemisphere({ skyColor: "#e0eefc", groundColor: "#6b7a4a", intensity: 1.3 }))
  .add(lights.directional({ position: [20, 40, 25], target: [0, 0, -10], intensity: 2.6 }))
  .add(effects.fog({ color: SKY, density: 0.012 }))
  .add(primitives.plane({ name: "grass", size: [400, 1, 400], material: mat("#5f9a45", 1), castShadow: false }).position(0, -0.03, -120))
  .add(primitives.plane({ name: "track", size: [TRACK_W, 1, 400], material: mat("#6d6f78", 0.95), castShadow: false }).position(0, 0, -150))
  .add(primitives.box({ name: "edge-l", size: [0.15, 0.03, 400], material: mat("#f4f4f4"), castShadow: false }).position(-TRACK_W / 2 + 0.1, 0.02, -150))
  .add(primitives.box({ name: "edge-r", size: [0.15, 0.03, 400], material: mat("#f4f4f4"), castShadow: false }).position(TRACK_W / 2 - 0.1, 0.02, -150));

// Scrolling scenery: everything repeats every PERIOD metres, so one group offset is enough.
const scenery: Kids = [];
const sceneryList = scenery as unknown as unknown[];
const addScenery = (node: unknown): void => { sceneryList.push(node); };
const stripeMat = mat("#55575f", 0.95);
const dashMat = mat("#f2f2f2");
const postMat = mat("#c9c9d0");
const capMats = [mat("#e8503a"), mat("#f2c230")];
const trunkMat = mat("#6b4a2b");
const leafMat = mat("#2f7d3a");
for (let k = -2; k <= 13; k += 1) {
  const z0 = -PERIOD * k;
  // dark cross stripes every 2 m
  for (let j = 0; j < 4; j += 1) {
    addScenery(primitives.box({ name: nm("stripe"), size: [TRACK_W - 0.4, 0.02, 0.45], material: stripeMat, castShadow: false }).position(0, 0.015, z0 - j * 2));
  }
  // centre dashes every 4 m
  for (let j = 0; j < 2; j += 1) {
    for (const x of [-1.5, 1.5]) {
      addScenery(primitives.box({ name: nm("dash"), size: [0.18, 0.03, 1.5], material: dashMat, castShadow: false }).position(x, 0.03, z0 - j * 4 - 1));
    }
  }
  // posts and trees on both sides
  for (const side of [-1, 1]) {
    addScenery(primitives.cylinder({ name: nm("post"), size: [0.18, 1.4, 0.18], material: postMat }).position(side * 3.6, 0.7, z0));
    addScenery(primitives.sphere({ name: nm("cap"), size: 0.3, material: capMats[(k + (side > 0 ? 1 : 0)) & 1] ?? dashMat }).position(side * 3.6, 1.5, z0));
    const tx = side * (6 + ((k * 7 + (side > 0 ? 3 : 0)) % 4));
    const tz = z0 - 4;
    addScenery(primitives.cylinder({ name: nm("trunk"), size: [0.4, 1.6, 0.4], material: trunkMat }).position(tx, 0.8, tz));
    addScenery(primitives.cone({ name: nm("leaf"), size: [2.2, 3.2, 2.2], material: leafMat }).position(tx, 3, tz));
  }
}
sc = sc.add(group("scroll", scenery, { position: [0, 0, 0] }).runtime({ id: "scroll", mutable: true }));

// Hurdle pool (unit boxes, scaled to each hurdle)
const hurdleMat = mat("#ff5a2a", 0.6);
for (let i = 0; i < HURDLE_POOL; i += 1) {
  sc = sc.add(primitives.box({ name: `hurdle-${i}`, size: 1, material: hurdleMat }).position(0, -100, 0).runtime({ id: `hurdle-${i}`, mutable: true }));
}

// Runner built from shapes; joints are groups pivoting at their origin
const skin = mat("#ffd9b0", 0.7), shirt = mat("#2a6fff", 0.6), pants = mat("#1b2a55", 0.7), shoe = mat("#ffffff", 0.6);
const joint = (id: string, position: [number, number, number], kids: Kids) => group(id, kids, { position }).runtime({ id, mutable: true });
const leg = (side: string, x: number) =>
  joint(`hip-${side}`, [x, 0.7, 0], [
    primitives.box({ name: nm("thigh"), size: [0.2, 0.7, 0.22], material: pants }).position(0, -0.3, 0),
    primitives.box({ name: nm("shoe"), size: [0.22, 0.12, 0.34], material: shoe }).position(0, -0.62, 0.05)
  ]);
const arm = (side: string, x: number) =>
  joint(`shoulder-${side}`, [x, 1.4, 0], [
    primitives.box({ name: nm("arm"), size: [0.15, 0.6, 0.15], material: skin }).position(0, -0.28, 0)
  ]);
sc = sc.add(group("runner", [
  leg("l", -0.15), leg("r", 0.15),
  primitives.box({ name: "torso", size: [0.5, 0.65, 0.3], material: shirt }).position(0, 1.05, 0),
  primitives.sphere({ name: "head", size: 0.38, material: skin }).position(0, 1.58, 0),
  primitives.box({ name: "hair", size: [0.4, 0.14, 0.4], material: mat("#3a2412") }).position(0, 1.72, -0.02),
  arm("l", -0.37), arm("r", 0.37)
], { position: [0, 0, 0] }).runtime({ id: "runner", mutable: true }));

const app = createAuraApp("#app", { scene: sc });

// ---------- DOM HUD ----------
const hud = document.createElement("div");
hud.id = "hud";
hud.style.cssText = "width:640px;box-sizing:border-box;padding:6px 10px;font:14px/1.4 system-ui,sans-serif;background:#111;color:#fff;display:flex;justify-content:space-between;";
const elDist = document.createElement("span");
const elBest = document.createElement("span");
const elStatus = document.createElement("span");
hud.append(elDist, elBest, elStatus);
document.body.appendChild(hud);

const overlay = document.createElement("div");
overlay.id = "overlay";
overlay.style.cssText = "position:absolute;left:0;top:0;width:640px;height:360px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;pointer-events:none;color:#fff;text-shadow:0 2px 6px #000;font:600 18px/1.5 system-ui,sans-serif;";
document.body.appendChild(overlay);

// ---------- game state ----------
let status: Status = "ready";
let dist = 0;
let best = 0;
let y = 0;
let vy = 0;
let airborne = false;
let phase = 0;
let rng = makeRng(SEED);
let hurdles: { s: number; h: number }[] = [];
let nextS = 0;

const resetRun = (): void => {
  status = "ready";
  dist = 0;
  y = 0;
  vy = 0;
  airborne = false;
  phase = 0;
  rng = makeRng(SEED);
  hurdles = [];
  nextS = 28;
};

const spawnAhead = (): void => {
  while (nextS < dist + SPAWN_AHEAD && nextS < WIN_DISTANCE + 40) {
    const h = 0.35 + rng() * 0.65;
    hurdles.push({ s: nextS, h });
    const sp = speedAt(nextS);
    nextS += sp * 0.7 + 3.5 + rng() * 10;
  }
};

const syncState = (): void => {
  window.__TASK_STATE__ = {
    status,
    score: Math.round(dist * 100) / 100,
    speed: status === "playing" ? Math.round(speedAt(dist) * 100) / 100 : 0,
    airborne
  };
};

const renderHud = (): void => {
  elDist.textContent = `Distance: ${Math.floor(dist)} m`;
  elBest.textContent = `Best: ${Math.floor(best)} m`;
  elStatus.textContent = `Status: ${status}`;
  if (status === "ready") {
    overlay.innerHTML = "<div>Endless Runner</div><div style='font-size:14px;font-weight:400'>Press Space / W / ↑ or click to start and jump</div>";
  } else if (status === "lost") {
    overlay.innerHTML = `<div style='font-size:30px'>Game over</div><div>${Math.floor(dist)} m</div><div style='font-size:14px;font-weight:400'>Press R, Space or click to restart</div>`;
  } else if (status === "won") {
    overlay.innerHTML = `<div style='font-size:30px'>You win!</div><div>${WIN_DISTANCE} m reached</div><div style='font-size:14px;font-weight:400'>Press R, Space or click to restart</div>`;
  } else {
    overlay.innerHTML = "";
  }
};

const jumpInput = (): void => {
  if (status === "won" || status === "lost") {
    resetRun();
  } else {
    if (status === "ready") status = "playing";
    if (!airborne) {
      airborne = true;
      vy = JUMP_V;
    }
  }
  syncState();
  renderHud();
};

window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
    e.preventDefault();
    if (!e.repeat) jumpInput();
  } else if (e.code === "KeyR") {
    if (!e.repeat) {
      resetRun();
      syncState();
      renderHud();
    }
  }
});
window.addEventListener("pointerdown", () => jumpInput());

// ---------- simulation ----------
const step = (dt: number): void => {
  const sp = speedAt(dist);
  dist += sp * dt;
  phase += sp * dt * 0.9;
  if (airborne) {
    y += vy * dt;
    vy -= GRAVITY * dt;
    if (y <= 0) {
      y = 0;
      vy = 0;
      airborne = false;
    }
  }
  if (dist > best) best = dist;
  for (const hd of hurdles) {
    if (Math.abs(hd.s - dist) < (HURDLE_DEPTH + RUNNER_DEPTH) / 2 && y < hd.h - 0.03) {
      status = "lost";
      return;
    }
  }
  if (dist >= WIN_DISTANCE) {
    dist = WIN_DISTANCE;
    best = Math.max(best, dist);
    status = "won";
  }
};

const update = (dt: number): void => {
  if (status !== "playing") return;
  const before = status;
  let left = Math.min(dt, 0.1);
  while (left > 0 && status === "playing") {
    const h = Math.min(left, 1 / 120);
    spawnAhead();
    step(h);
    left -= h;
  }
  if (status !== before) renderHud();
};

let hudTick = 0;
const n = (id: string) => app.nodes.require(id);
const draw = (t: number): void => {
  n("scroll").setPosition(0, 0, dist % PERIOD);
  spawnAhead();
  while (hurdles.length > 0 && hurdles[0]!.s < dist - 8) hurdles.shift();
  let slot = 0;
  for (const hd of hurdles) {
    if (slot >= HURDLE_POOL) break;
    const node = n(`hurdle-${slot}`);
    node.setScale([TRACK_W - 0.6, hd.h, HURDLE_DEPTH]);
    node.setPosition(0, hd.h / 2, -(hd.s - dist));
    slot += 1;
  }
  for (; slot < HURDLE_POOL; slot += 1) n(`hurdle-${slot}`).setPosition(0, -100, 0);

  const runner = n("runner");
  runner.setPosition(0, y, 0);
  let la: number, ra: number, ll: number, rl: number, lean = 0;
  if (status === "playing" && airborne) {
    la = -2.2; ra = -2.2; ll = -0.9; rl = 0.5; lean = 0.1;
  } else if (status === "playing") {
    const s = Math.sin(phase * 2);
    ll = s * 0.9; rl = -s * 0.9; la = -s * 0.9; ra = s * 0.9; lean = 0.15;
  } else if (status === "won") {
    la = -3; ra = -3; ll = 0; rl = 0;
  } else if (status === "lost") {
    la = -0.6; ra = 0.6; ll = 0.4; rl = -0.4; lean = -0.6;
  } else {
    const s = Math.sin(t * 2) * 0.05;
    la = s; ra = -s; ll = 0; rl = 0;
  }
  runner.setRotation(lean, 0, 0);
  n("hip-l").setRotation(ll, 0, 0);
  n("hip-r").setRotation(rl, 0, 0);
  n("shoulder-l").setRotation(la, 0, 0);
  n("shoulder-r").setRotation(ra, 0, 0);
};

resetRun();
syncState();
renderHud();

let clock = 0;
app.onFrame((f) => {
  clock += f.dt;
  update(f.dt);
  draw(clock);
  syncState();
  hudTick += f.dt;
  if (hudTick > 0.05) {
    hudTick = 0;
    elDist.textContent = `Distance: ${Math.floor(dist)} m`;
    elBest.textContent = `Best: ${Math.floor(best)} m`;
    elStatus.textContent = `Status: ${status}`;
  }
});

await app.ready();
requestAnimationFrame(() => {
  window.__TASK_READY__ = true;
});
