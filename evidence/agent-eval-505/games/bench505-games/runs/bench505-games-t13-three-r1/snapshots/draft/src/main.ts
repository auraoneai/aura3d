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

// ---------- constants ----------
const GOAL = 500;
const BASE_SPEED = 8;
const SPEED_GAIN = 0.025; // m/s per meter
const GRAVITY = 28;
const JUMP_VELOCITY = 9;
const RUNNER_HALF_DEPTH = 0.3;
const HURDLE_HALF_DEPTH = 0.25;
const FIRST_HURDLE = 22;
const TRACK_HALF_WIDTH = 1.6;

const speedAt = (d: number): number => BASE_SPEED + d * SPEED_GAIN;

// ---------- seeded random ----------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seedParam = new URLSearchParams(location.search).get('seed');
const parsedSeed = seedParam === null ? NaN : Number(seedParam);
const SEED = Number.isFinite(parsedSeed) ? parsedSeed : 12345;

// ---------- DOM ----------
const canvas = document.getElementById('app') as HTMLCanvasElement;

const hud = document.createElement('div');
hud.style.cssText =
  'width:640px;box-sizing:border-box;padding:6px 10px;display:flex;justify-content:space-between;' +
  'background:#111;color:#fff;font:14px/1.4 system-ui,sans-serif;';
const distEl = document.createElement('span');
const bestEl = document.createElement('span');
const statusEl = document.createElement('span');
hud.append(distEl, bestEl, statusEl);
document.body.appendChild(hud);

const overlay = document.createElement('div');
overlay.style.cssText =
  'position:absolute;left:0;top:0;width:640px;height:360px;display:flex;flex-direction:column;' +
  'align-items:center;justify-content:center;text-align:center;pointer-events:none;' +
  'font:16px/1.5 system-ui,sans-serif;color:#fff;text-shadow:0 2px 4px #000;';
const overlayTitle = document.createElement('div');
overlayTitle.style.cssText = 'font-size:36px;font-weight:700;';
const overlaySub = document.createElement('div');
overlay.append(overlayTitle, overlaySub);
document.body.appendChild(overlay);

// ---------- three.js setup ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);

const scene = new THREE.Scene();
const SKY = 0x8ecdf0;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 25, 75);

const camera = new THREE.PerspectiveCamera(60, 640 / 360, 0.1, 150);

scene.add(new THREE.HemisphereLight(0xffffff, 0x557744, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(4, 10, 6);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 200),
  new THREE.MeshLambertMaterial({ color: 0x4caf50 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01;
scene.add(ground);

const track = new THREE.Mesh(
  new THREE.PlaneGeometry(TRACK_HALF_WIDTH * 2, 200),
  new THREE.MeshLambertMaterial({ color: 0xc8764a }),
);
track.rotation.x = -Math.PI / 2;
track.position.y = 0;
scene.add(track);

// Edge lines
const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const edges: THREE.Mesh[] = [];
for (const s of [-1, 1]) {
  const e = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 200), edgeMat);
  e.position.set(s * TRACK_HALF_WIDTH, 0.01, 0);
  scene.add(e);
  edges.push(e);
}

// Wrapped scenery pools: items cycle around the runner to convey speed.
interface Wrapped {
  obj: THREE.Object3D;
  index: number;
  spacing: number;
  count: number;
}
const wrapped: Wrapped[] = [];
const BEHIND = 10;

function addWrapped(obj: THREE.Object3D, index: number, spacing: number, count: number): void {
  scene.add(obj);
  wrapped.push({ obj, index, spacing, count });
}

const dashGeo = new THREE.BoxGeometry(0.15, 0.02, 1.6);
const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
for (let i = 0; i < 20; i++) {
  const m = new THREE.Mesh(dashGeo, dashMat);
  m.position.x = 0;
  addWrapped(m, i, 4, 20);
}
// Lane stripes at +-0.8
for (const x of [-0.8, 0.8]) {
  for (let i = 0; i < 20; i++) {
    const m = new THREE.Mesh(dashGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    m.scale.set(0.6, 1, 1);
    m.position.x = x;
    addWrapped(m, i, 4, 20);
    m.userData.offsetZ = 2;
  }
}

const postGeo = new THREE.BoxGeometry(0.2, 1.2, 0.2);
const postMats = [new THREE.MeshLambertMaterial({ color: 0xd32f2f }), new THREE.MeshLambertMaterial({ color: 0xfafafa })];
for (const s of [-1, 1]) {
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(postGeo, postMats[i % 2]);
    m.position.x = s * (TRACK_HALF_WIDTH + 0.5);
    m.position.y = 0.6;
    addWrapped(m, i, 5, 16);
  }
}

const trunkGeo = new THREE.CylinderGeometry(0.2, 0.28, 1.6, 8);
const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6d4c41 });
const leafGeo = new THREE.ConeGeometry(1.1, 3, 8);
const leafMats = [new THREE.MeshLambertMaterial({ color: 0x2e7d32 }), new THREE.MeshLambertMaterial({ color: 0x1b5e20 })];
const decoRand = mulberry32(777);
for (const s of [-1, 1]) {
  for (let i = 0; i < 14; i++) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.8;
    const leaves = new THREE.Mesh(leafGeo, leafMats[i % 2]);
    leaves.position.y = 3;
    tree.add(trunk, leaves);
    const sc = 0.8 + decoRand() * 0.8;
    tree.scale.setScalar(sc);
    tree.position.x = s * (4 + decoRand() * 4);
    addWrapped(tree, i, 7, 14);
  }
}

function updateWrapped(d: number): void {
  for (const w of wrapped) {
    const L = w.spacing * w.count;
    const off = (w.obj.userData.offsetZ as number | undefined) ?? 0;
    const rel = ((((w.index * w.spacing + off - d) % L) + L) % L) - BEHIND;
    w.obj.position.z = -d - rel;
  }
}

// Finish line
const finish = new THREE.Group();
{
  const mat1 = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const mat2 = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const cols = 16;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < cols; c++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry((TRACK_HALF_WIDTH * 2) / cols, 0.03, 0.5), (r + c) % 2 ? mat1 : mat2);
      m.position.set(-TRACK_HALF_WIDTH + ((c + 0.5) * TRACK_HALF_WIDTH * 2) / cols, 0.02, r * 0.5);
      finish.add(m);
    }
  }
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.5, 0.2), mat1);
    p.position.set(s * (TRACK_HALF_WIDTH + 0.2), 1.75, 0.25);
    finish.add(p);
  }
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(TRACK_HALF_WIDTH * 2 + 0.6, 0.6, 0.15),
    new THREE.MeshLambertMaterial({ color: 0xffc107 }),
  );
  banner.position.set(0, 3.5, 0.25);
  finish.add(banner);
  finish.position.z = -GOAL;
  scene.add(finish);
}

// ---------- runner ----------
const runner = new THREE.Group();
scene.add(runner);
const skin = new THREE.MeshLambertMaterial({ color: 0xffcc99 });
const shirt = new THREE.MeshLambertMaterial({ color: 0x1565c0 });
const shorts = new THREE.MeshLambertMaterial({ color: 0xff6f00 });

const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.3), shirt);
torso.position.y = 1.0;
const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), skin);
head.position.y = 1.55;
const hair = new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3e2723 }));
hair.position.y = 1.57;
runner.add(torso, head, hair);

function makeLimb(w: number, h: number, mat: THREE.Material, x: number, y: number): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
  m.position.y = -h / 2;
  pivot.add(m);
  runner.add(pivot);
  return pivot;
}
const legL = makeLimb(0.2, 0.7, shorts, -0.14, 0.7);
const legR = makeLimb(0.2, 0.7, shorts, 0.14, 0.7);
const armL = makeLimb(0.14, 0.55, skin, -0.34, 1.27);
const armR = makeLimb(0.14, 0.55, skin, 0.34, 1.27);

// ---------- hurdles ----------
interface Hurdle {
  z: number; // distance along the track (meters)
  h: number;
  mesh: THREE.Group;
}
const hurdleBarMats = [new THREE.MeshLambertMaterial({ color: 0xe53935 }), new THREE.MeshLambertMaterial({ color: 0xffffff })];
const hurdleSideMat = new THREE.MeshLambertMaterial({ color: 0x37474f });
let hurdles: Hurdle[] = [];

function makeHurdleMesh(h: number): THREE.Group {
  const g = new THREE.Group();
  const w = TRACK_HALF_WIDTH * 2 - 0.2;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, HURDLE_HALF_DEPTH * 2), hurdleSideMat);
  body.position.y = h / 2;
  g.add(body);
  const stripes = 6;
  const bandH = Math.min(0.3, h);
  for (let i = 0; i < stripes; i++) {
    const seg = new THREE.Mesh(
      new THREE.BoxGeometry(w / stripes, bandH, HURDLE_HALF_DEPTH * 2 + 0.04),
      hurdleBarMats[i % 2],
    );
    seg.position.set(-w / 2 + ((i + 0.5) * w) / stripes, h - bandH / 2, 0);
    g.add(seg);
  }
  return g;
}

// ---------- game state ----------
let rand = mulberry32(SEED);
let nextHurdleAt = FIRST_HURDLE;
let status: Status = 'ready';
let distance = 0;
let speed = speedAt(0);
let y = 0;
let vy = 0;
let airborne = false;
let best = 0;
let runPhase = 0;

const state: TaskState = { status, score: 0, speed, airborne };
window.__TASK_STATE__ = state;
window.__TASK_READY__ = false;

function syncState(): void {
  state.status = status;
  state.score = distance;
  state.speed = speed;
  state.airborne = airborne;
}

function spawnHurdlesUpTo(limit: number): void {
  while (nextHurdleAt < limit && nextHurdleAt < GOAL - 5) {
    const h = 0.35 + rand() * 0.65;
    const mesh = makeHurdleMesh(h);
    mesh.position.set(0, 0, -nextHurdleAt);
    scene.add(mesh);
    hurdles.push({ z: nextHurdleAt, h, mesh });
    const s = speedAt(nextHurdleAt);
    nextHurdleAt += s * 0.8 + 5 + rand() * 12;
  }
}

function resetGame(): void {
  for (const h of hurdles) scene.remove(h.mesh);
  hurdles = [];
  rand = mulberry32(SEED);
  nextHurdleAt = FIRST_HURDLE;
  distance = 0;
  speed = speedAt(0);
  y = 0;
  vy = 0;
  airborne = false;
  runPhase = 0;
  status = 'ready';
  spawnHurdlesUpTo(distance + 70);
  syncState();
}

function jump(): void {
  if (status === 'won' || status === 'lost') {
    resetGame();
    return;
  }
  if (status === 'ready') status = 'playing';
  if (!airborne) {
    airborne = true;
    vy = JUMP_VELOCITY;
  }
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    e.preventDefault();
    if (!e.repeat) jump();
  } else if (e.code === 'KeyR') {
    resetGame();
  }
});
window.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  jump();
});

// ---------- update ----------
function update(dt: number): void {
  if (status !== 'playing') return;

  speed = speedAt(distance);
  const prev = distance;
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

  // Collision (check against the swept range to avoid tunneling)
  for (const h of hurdles) {
    const front = h.z - HURDLE_HALF_DEPTH - RUNNER_HALF_DEPTH;
    const back = h.z + HURDLE_HALF_DEPTH + RUNNER_HALF_DEPTH;
    if (distance > front && prev < back && y < h.h - 0.02) {
      status = 'lost';
      break;
    }
  }

  if (status === 'playing' && distance >= GOAL) {
    distance = GOAL;
    status = 'won';
  }

  if (distance > best) best = distance;
  if (status === 'playing') runPhase += dt * speed * 1.3;
  spawnHurdlesUpTo(distance + 70);
  hurdles = hurdles.filter((h) => {
    if (h.z < distance - 15) {
      scene.remove(h.mesh);
      return false;
    }
    return true;
  });
}

function updateVisuals(): void {
  runner.position.set(0, y, -distance);
  const swing = status === 'playing' && !airborne ? Math.sin(runPhase) * 0.9 : 0;
  if (airborne) {
    legL.rotation.x = -0.9;
    legR.rotation.x = 0.5;
    armL.rotation.x = -2.2;
    armR.rotation.x = -2.2;
  } else if (status === 'lost') {
    legL.rotation.x = legR.rotation.x = armL.rotation.x = armR.rotation.x = 0;
  } else {
    legL.rotation.x = swing;
    legR.rotation.x = -swing;
    armL.rotation.x = -swing;
    armR.rotation.x = swing;
  }
  runner.rotation.x = status === 'lost' ? -0.5 : 0;

  camera.position.set(0, 2.8, -distance + 6);
  camera.lookAt(0, 1.0, -distance - 6);
  ground.position.z = -distance;
  track.position.z = -distance;
  for (const e of edges) e.position.z = -distance;
  updateWrapped(distance);
}

function updateHud(): void {
  distEl.textContent = `Distance: ${Math.floor(distance)} m`;
  bestEl.textContent = `Best: ${Math.floor(best)} m`;
  statusEl.textContent = `Status: ${status}`;
  if (status === 'lost') {
    overlay.style.display = 'flex';
    overlay.style.background = 'rgba(120,0,0,0.35)';
    overlayTitle.textContent = 'Game Over';
    overlaySub.textContent = `You ran ${Math.floor(distance)} m. Press R or jump (Space / click) to restart.`;
  } else if (status === 'won') {
    overlay.style.display = 'flex';
    overlay.style.background = 'rgba(0,90,0,0.35)';
    overlayTitle.textContent = 'You Win!';
    overlaySub.textContent = `${GOAL} m reached. Press R or jump (Space / click) to restart.`;
  } else if (status === 'ready') {
    overlay.style.display = 'flex';
    overlay.style.background = 'transparent';
    overlayTitle.textContent = '';
    overlaySub.textContent = 'Press Space / W / ArrowUp or click to start. Jump over the hurdles!';
  } else {
    overlay.style.display = 'none';
  }
}

// ---------- main loop ----------
resetGame();
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  update(dt);
  updateVisuals();
  updateHud();
  syncState();
  renderer.render(scene, camera);
  if (!window.__TASK_READY__) window.__TASK_READY__ = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
