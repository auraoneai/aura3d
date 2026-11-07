import * as THREE from 'three';

type Status = 'ready' | 'playing' | 'won' | 'lost';

interface TaskState {
  status: Status;
  score: number;
  speed: number;
  airborne: boolean;
}

declare global {
  interface Window {
    __TASK_STATE__: TaskState;
    __TASK_READY__: boolean;
  }
}

// ---------- config ----------
const WIN_DISTANCE = 500;
const BASE_SPEED = 10;
const SPEED_GAIN = 0.02; // m/s per meter -> 20 m/s at 500 m
const GRAVITY = 22;
const JUMP_VELOCITY = 8;
const TRACK_WIDTH = 4;
const RUNNER_HALF_DEPTH = 0.25;
const HURDLE_HALF_DEPTH = 0.2;
const SPAWN_AHEAD = 90;

const seedParam = new URLSearchParams(location.search).get('seed');
const SEED = seedParam !== null && seedParam !== '' && Number.isFinite(Number(seedParam)) ? Number(seedParam) >>> 0 : 12345;

function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- renderer / scene ----------
const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);

const scene = new THREE.Scene();
const SKY = 0x9fd4f5;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 30, 110);

const camera = new THREE.PerspectiveCamera(60, 640 / 360, 0.1, 200);

scene.add(new THREE.HemisphereLight(0xffffff, 0x557744, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(5, 10, 4);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 300),
  new THREE.MeshLambertMaterial({ color: 0x4f9d4a }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01;
scene.add(ground);

const track = new THREE.Mesh(
  new THREE.PlaneGeometry(TRACK_WIDTH, 300),
  new THREE.MeshLambertMaterial({ color: 0xb5651d }),
);
track.rotation.x = -Math.PI / 2;
track.position.y = 0;
scene.add(track);

// Scrolling scenery pools: objects are moved ahead of the runner when passed.
interface Recycled {
  obj: THREE.Object3D;
  spacing: number;
  count: number;
}
const recycled: Recycled[] = [];

function makePool(count: number, spacing: number, build: (i: number) => THREE.Object3D): void {
  for (let i = 0; i < count; i++) {
    const obj = build(i);
    obj.position.z = 10 - i * spacing;
    scene.add(obj);
    recycled.push({ obj, spacing, count });
  }
}

const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const dashGeo = new THREE.PlaneGeometry(0.15, 1.6);
for (const lane of [-TRACK_WIDTH / 6, TRACK_WIDTH / 6]) {
  makePool(20, 5, () => {
    const m = new THREE.Mesh(dashGeo, dashMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(lane, 0.02, 0);
    return m;
  });
}

const edgeMat = new THREE.MeshBasicMaterial({ color: 0xf2e6c9 });
const edgeGeo = new THREE.PlaneGeometry(0.2, 3);
for (const side of [-1, 1]) {
  makePool(30, 6, () => {
    const m = new THREE.Mesh(edgeGeo, edgeMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(side * (TRACK_WIDTH / 2 - 0.1), 0.02, 0);
    return m;
  });
}

const postMat = new THREE.MeshLambertMaterial({ color: 0xdd3333 });
const postGeo = new THREE.BoxGeometry(0.25, 1.2, 0.25);
for (const side of [-1, 1]) {
  makePool(16, 8, () => {
    const m = new THREE.Mesh(postGeo, postMat);
    m.position.set(side * (TRACK_WIDTH / 2 + 0.6), 0.6, 0);
    return m;
  });
}

const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4423 });
const leafMat = new THREE.MeshLambertMaterial({ color: 0x1f6f34 });
const trunkGeo = new THREE.CylinderGeometry(0.2, 0.25, 1.4, 6);
const leafGeo = new THREE.ConeGeometry(1.1, 3, 7);
for (const side of [-1, 1]) {
  makePool(14, 11, (i) => {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.7;
    const leaves = new THREE.Mesh(leafGeo, leafMat);
    leaves.position.y = 2.7;
    g.add(trunk, leaves);
    g.position.x = side * (TRACK_WIDTH / 2 + 3 + ((i * 37) % 5));
    g.scale.setScalar(0.8 + ((i * 13) % 5) * 0.1);
    return g;
  });
}
// keep x of pooled trees: position.z only is modified on recycle

// ---------- runner ----------
const runner = new THREE.Group();
scene.add(runner);
const skin = new THREE.MeshLambertMaterial({ color: 0xf1c27d });
const shirt = new THREE.MeshLambertMaterial({ color: 0x2255ee });
const pants = new THREE.MeshLambertMaterial({ color: 0x222233 });

const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.3), shirt);
torso.position.y = 0.95;
const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), skin);
head.position.y = 1.5;
runner.add(torso, head);

function makeLimb(mat: THREE.Material, w: number, len: number, x: number, y: number): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat);
  m.position.y = -len / 2;
  pivot.add(m);
  runner.add(pivot);
  return pivot;
}
const legL = makeLimb(pants, 0.18, 0.65, -0.14, 0.65);
const legR = makeLimb(pants, 0.18, 0.65, 0.14, 0.65);
const armL = makeLimb(skin, 0.14, 0.55, -0.34, 1.2);
const armR = makeLimb(skin, 0.14, 0.55, 0.34, 1.2);

// ---------- hurdles ----------
interface Hurdle {
  z: number; // world z (negative = ahead)
  height: number;
  mesh: THREE.Group;
}
let hurdles: Hurdle[] = [];
const hurdleBarMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
const hurdleLegMat = new THREE.MeshLambertMaterial({ color: 0xe03030 });

function buildHurdle(height: number): THREE.Group {
  const g = new THREE.Group();
  const w = TRACK_WIDTH - 0.6;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, height, HURDLE_HALF_DEPTH * 2), hurdleLegMat);
  body.position.y = height / 2;
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.02, Math.min(0.25, height * 0.5), HURDLE_HALF_DEPTH * 2 + 0.02),
    hurdleBarMat,
  );
  stripe.position.y = height - Math.min(0.25, height * 0.5) / 2;
  g.add(body, stripe);
  return g;
}

// ---------- game state ----------
let rng = mulberry32(SEED);
let status: Status = 'ready';
let distance = 0;
let speed = BASE_SPEED;
let y = 0;
let vy = 0;
let airborne = false;
let best = 0;
let nextHurdleZ = 25; // distance along track where next hurdle is placed
let runPhase = 0;

function clearHurdles(): void {
  for (const h of hurdles) scene.remove(h.mesh);
  hurdles = [];
}

function resetGame(): void {
  rng = mulberry32(SEED);
  clearHurdles();
  status = 'ready';
  distance = 0;
  speed = BASE_SPEED;
  y = 0;
  vy = 0;
  airborne = false;
  nextHurdleZ = 25;
  runPhase = 0;
}

function spawnHurdles(): void {
  while (nextHurdleZ < distance + SPAWN_AHEAD) {
    const height = 0.4 + rng() * 0.7;
    const mesh = buildHurdle(height);
    mesh.position.z = -nextHurdleZ;
    scene.add(mesh);
    hurdles.push({ z: -nextHurdleZ, height, mesh });
    // spacing grows with the speed so each hurdle stays clearable
    const s = BASE_SPEED + SPEED_GAIN * nextHurdleZ;
    nextHurdleZ += s * 0.95 + 4 + rng() * 14;
  }
}

function jump(): void {
  if (status === 'won' || status === 'lost') {
    resetGame();
    publish();
    return;
  }
  if (status === 'ready') status = 'playing';
  if (airborne) return;
  airborne = true;
  vy = JUMP_VELOCITY;
}

function endRun(s: 'won' | 'lost'): void {
  status = s;
  if (s === 'won') distance = WIN_DISTANCE;
  best = Math.max(best, distance);
}

function step(dt: number): void {
  if (status !== 'playing') {
    if (status === 'ready') runPhase += dt * 3; // idle bob
    return;
  }
  speed = BASE_SPEED + SPEED_GAIN * distance;
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
  runPhase += dt * speed * 0.9;

  spawnHurdles();
  const rz = -distance;
  for (const h of hurdles) {
    if (Math.abs(h.z - rz) < RUNNER_HALF_DEPTH + HURDLE_HALF_DEPTH && y < h.height) {
      endRun('lost');
      return;
    }
  }
  hurdles = hurdles.filter((h) => {
    if (h.z > rz + 8) {
      scene.remove(h.mesh);
      return false;
    }
    return true;
  });

  if (distance >= WIN_DISTANCE) endRun('won');
}

// ---------- HUD ----------
const hud = document.createElement('div');
hud.style.cssText = 'width:640px;box-sizing:border-box;padding:6px 10px;display:flex;justify-content:space-between;background:#111;font:14px/1.4 system-ui,sans-serif;';
const elDist = document.createElement('span');
const elBest = document.createElement('span');
const elStatus = document.createElement('span');
hud.append(elDist, elBest, elStatus);
document.body.appendChild(hud);

const overlay = document.createElement('div');
overlay.style.cssText =
  'position:absolute;left:0;top:0;width:640px;height:360px;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);text-align:center;font:bold 32px system-ui,sans-serif;pointer-events:none;';
const ovTitle = document.createElement('div');
const ovHint = document.createElement('div');
ovHint.style.cssText = 'font:16px system-ui,sans-serif;margin-top:10px;';
overlay.append(ovTitle, ovHint);
document.body.appendChild(overlay);

const readyHint = document.createElement('div');
readyHint.style.cssText = 'position:absolute;left:0;top:300px;width:640px;text-align:center;font:16px system-ui,sans-serif;text-shadow:0 1px 3px #000;pointer-events:none;';
readyHint.textContent = 'Press Space / W / ↑ or click to jump and start';
document.body.appendChild(readyHint);

function publish(): void {
  const st = window.__TASK_STATE__;
  st.status = status;
  st.score = distance;
  st.speed = status === 'playing' ? speed : status === 'ready' ? BASE_SPEED : speed;
  st.airborne = airborne;

  elDist.textContent = `Distance: ${Math.floor(distance)} m`;
  elBest.textContent = `Best: ${Math.floor(best)} m`;
  elStatus.textContent = `Status: ${status}`;
  const over = status === 'won' || status === 'lost';
  overlay.style.display = over ? 'flex' : 'none';
  readyHint.style.display = status === 'ready' ? 'block' : 'none';
  if (over) {
    ovTitle.textContent = status === 'won' ? `You won! ${WIN_DISTANCE} m` : `Game over: ${Math.floor(distance)} m`;
    ovHint.textContent = 'Press R, Space or click to restart';
  }
}

window.__TASK_STATE__ = { status: 'ready', score: 0, speed: BASE_SPEED, airborne: false };
window.__TASK_READY__ = false;

// ---------- input ----------
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    e.preventDefault();
    if (e.repeat) return;
    jump();
    publish();
  } else if (e.code === 'KeyR') {
    if (e.repeat) return;
    resetGame();
    publish();
  }
});
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  jump();
  publish();
});

// ---------- render loop ----------
function updateVisuals(): void {
  const rz = -distance;
  runner.position.set(0, y, rz);

  const swing = airborne ? 0 : Math.sin(runPhase * 2) * 0.9;
  const tuck = airborne ? 0.6 : 0;
  legL.rotation.x = swing - tuck;
  legR.rotation.x = -swing + tuck * 0.3;
  armL.rotation.x = -swing + (airborne ? -2.2 : 0);
  armR.rotation.x = swing + (airborne ? -2.2 : 0);
  torso.rotation.x = -0.15;

  for (const r of recycled) {
    const span = r.spacing * r.count;
    while (r.obj.position.z > rz + 12) r.obj.position.z -= span;
    while (r.obj.position.z < rz + 12 - span) r.obj.position.z += span;
  }

  ground.position.z = rz - 100;
  track.position.z = rz - 100;

  camera.position.set(0, 3.2 + y * 0.3, rz + 6.5);
  camera.lookAt(0, 1.0, rz - 6);
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  step(dt);
  updateVisuals();
  publish();
  renderer.render(scene, camera);
  if (!window.__TASK_READY__) window.__TASK_READY__ = true;
  requestAnimationFrame(frame);
}
resetGame();
publish();
requestAnimationFrame(frame);
