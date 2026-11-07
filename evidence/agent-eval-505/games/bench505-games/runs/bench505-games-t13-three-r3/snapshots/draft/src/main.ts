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
const GRAVITY = 26;
const JUMP_V = 9.5;
const BASE_SPEED = 9;
const SPEED_GAIN = 0.022; // m/s per meter => 20 m/s at 500 m
const TRACK_W = 3.6;
const STEP = 1 / 120;
const FIRST_HURDLE = 28;
const LOOKAHEAD = 110;
const RUNNER_HALF_Z = 0.3;
const HURDLE_HALF_Z = 0.2;

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

const seedParam = Number(new URLSearchParams(location.search).get('seed'));
const SEED = Number.isFinite(seedParam) && seedParam !== 0 ? seedParam : 12345;

// ---------- renderer / scene ----------
const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);

const SKY = 0x9fd4f5;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 30, 120);

const camera = new THREE.PerspectiveCamera(60, 640 / 360, 0.1, 200);

scene.add(new THREE.HemisphereLight(0xffffff, 0x557744, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(5, 10, 4);
scene.add(sun);

// ground (follows runner)
const grass = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 300),
  new THREE.MeshLambertMaterial({ color: 0x4f9d4a }),
);
grass.rotation.x = -Math.PI / 2;
grass.position.y = -0.02;
scene.add(grass);

const track = new THREE.Mesh(
  new THREE.PlaneGeometry(TRACK_W, 300),
  new THREE.MeshLambertMaterial({ color: 0xb5651d }),
);
track.rotation.x = -Math.PI / 2;
scene.add(track);

// scrolling scenery pools
interface Pool {
  meshes: THREE.Object3D[];
  spacing: number;
  back: number;
}
function updatePool(pool: Pool, dist: number): void {
  const n = pool.meshes.length;
  const base = Math.floor(dist / pool.spacing) - pool.back;
  for (let k = base; k < base + n; k++) {
    pool.meshes[((k % n) + n) % n].position.z = -k * pool.spacing;
  }
}

// cross stripes
const stripeMatA = new THREE.MeshLambertMaterial({ color: 0xe8d9a8 });
const stripeGeo = new THREE.BoxGeometry(TRACK_W, 0.02, 0.35);
const stripePool: Pool = { meshes: [], spacing: 4, back: 5 };
for (let i = 0; i < 36; i++) {
  const m = new THREE.Mesh(stripeGeo, stripeMatA);
  m.position.y = 0.01;
  scene.add(m);
  stripePool.meshes.push(m);
}

// lane edge dashes
const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const dashGeo = new THREE.BoxGeometry(0.12, 0.02, 1.6);
const dashPool: Pool = { meshes: [], spacing: 3, back: 5 };
for (let i = 0; i < 48; i++) {
  const m = new THREE.Group();
  for (const x of [-TRACK_W / 2 + 0.2, TRACK_W / 2 - 0.2]) {
    const d = new THREE.Mesh(dashGeo, dashMat);
    d.position.set(x, 0.02, 0);
    m.add(d);
  }
  scene.add(m);
  dashPool.meshes.push(m);
}

// side posts
const postGeo = new THREE.BoxGeometry(0.25, 1.6, 0.25);
const postCapGeo = new THREE.BoxGeometry(0.35, 0.2, 0.35);
const postMat = new THREE.MeshLambertMaterial({ color: 0xdddddd });
const postCapMat = new THREE.MeshLambertMaterial({ color: 0xd63a3a });
const postPool: Pool = { meshes: [], spacing: 6, back: 4 };
for (let i = 0; i < 24; i++) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(postGeo, postMat);
    p.position.set(s * (TRACK_W / 2 + 0.6), 0.8, 0);
    const c = new THREE.Mesh(postCapGeo, postCapMat);
    c.position.set(s * (TRACK_W / 2 + 0.6), 1.7, 0);
    g.add(p, c);
  }
  scene.add(g);
  postPool.meshes.push(g);
}

// trees
const trunkGeo = new THREE.CylinderGeometry(0.2, 0.28, 1.4, 8);
const leafGeo = new THREE.ConeGeometry(1.2, 3.2, 8);
const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4423 });
const leafMat = new THREE.MeshLambertMaterial({ color: 0x1f6b35 });
const treePool: Pool = { meshes: [], spacing: 9, back: 4 };
for (let i = 0; i < 22; i++) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const off = s * (6 + ((i * 7) % 5) * 1.3);
    const t = new THREE.Mesh(trunkGeo, trunkMat);
    t.position.set(off, 0.7, 0);
    const l = new THREE.Mesh(leafGeo, leafMat);
    l.position.set(off, 3, 0);
    const sc = 0.8 + (((i + (s > 0 ? 3 : 0)) * 5) % 4) * 0.15;
    t.scale.setScalar(sc);
    l.scale.setScalar(sc);
    g.add(t, l);
  }
  // stagger left/right a bit
  scene.add(g);
  treePool.meshes.push(g);
}

// runner
const runner = new THREE.Group();
const skin = new THREE.MeshLambertMaterial({ color: 0xffcc99 });
const shirt = new THREE.MeshLambertMaterial({ color: 0x2255dd });
const pants = new THREE.MeshLambertMaterial({ color: 0x222244 });
const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.3), shirt);
body.position.y = 1.0;
const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), skin);
head.position.y = 1.55;
const hair = new THREE.Mesh(
  new THREE.SphereGeometry(0.23, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  new THREE.MeshLambertMaterial({ color: 0x331a00 }),
);
hair.position.y = 1.58;
runner.add(body, head, hair);

function limb(w: number, h: number, mat: THREE.Material, x: number, y: number): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
  m.position.y = -h / 2;
  pivot.add(m);
  runner.add(pivot);
  return pivot;
}
const legL = limb(0.2, 0.7, pants, -0.15, 0.7);
const legR = limb(0.2, 0.7, pants, 0.15, 0.7);
const armL = limb(0.15, 0.6, skin, -0.37, 1.28);
const armR = limb(0.15, 0.6, skin, 0.37, 1.28);
scene.add(runner);

// hurdles
interface Hurdle {
  z: number; // distance along track (meters)
  h: number;
  mesh: THREE.Mesh;
}
const hurdleGeo = new THREE.BoxGeometry(TRACK_W - 0.4, 1, HURDLE_HALF_Z * 2);
const hurdleMats = [0xf2c200, 0xf07f1a, 0xd62828].map(
  (c) => new THREE.MeshLambertMaterial({ color: c }),
);

// ---------- DOM HUD ----------
const hud = document.createElement('div');
hud.id = 'hud';
hud.style.cssText =
  'width:640px;box-sizing:border-box;padding:6px 10px;background:#111;color:#fff;font:14px/1.4 system-ui,sans-serif;display:flex;justify-content:space-between;';
const hudDist = document.createElement('span');
const hudBest = document.createElement('span');
const hudStatus = document.createElement('span');
hud.append(hudDist, hudBest, hudStatus);
document.body.appendChild(hud);

const overlay = document.createElement('div');
overlay.id = 'overlay';
overlay.style.cssText =
  'position:fixed;left:0;top:0;width:640px;height:360px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);color:#fff;font:bold 28px system-ui,sans-serif;text-align:center;pointer-events:none;';
const overlayTitle = document.createElement('div');
const overlayHint = document.createElement('div');
overlayHint.style.cssText = 'font:normal 16px system-ui,sans-serif;margin-top:8px;';
overlay.append(overlayTitle, overlayHint);
document.body.appendChild(overlay);

// ---------- game state ----------
let status: Status = 'ready';
let distance = 0;
let speed = BASE_SPEED;
let best = 0;
let y = 0;
let vy = 0;
let airborne = false;
let phase = 0;
let rand = mulberry32(SEED);
let hurdles: Hurdle[] = [];
let nextHurdleZ = FIRST_HURDLE;

function speedAt(d: number): number {
  return Math.min(BASE_SPEED + d * SPEED_GAIN, BASE_SPEED + GOAL * SPEED_GAIN);
}

function clearHurdles(): void {
  for (const h of hurdles) scene.remove(h.mesh);
  hurdles = [];
}

function reset(): void {
  clearHurdles();
  rand = mulberry32(SEED);
  distance = 0;
  speed = speedAt(0);
  y = 0;
  vy = 0;
  airborne = false;
  nextHurdleZ = FIRST_HURDLE;
  status = 'ready';
}

function spawnHurdles(): void {
  while (nextHurdleZ < distance + LOOKAHEAD && nextHurdleZ < GOAL + 20) {
    const r = rand();
    const h = 0.4 + Math.round(rand() * 7) * 0.1; // 0.4 .. 1.1
    const mesh = new THREE.Mesh(hurdleGeo, hurdleMats[h < 0.65 ? 0 : h < 0.9 ? 1 : 2]);
    mesh.scale.y = h;
    mesh.position.set(0, h / 2, -nextHurdleZ);
    scene.add(mesh);
    hurdles.push({ z: nextHurdleZ, h, mesh });
    // spacing scales with the speed expected there, so every gap is jumpable
    const sp = speedAt(nextHurdleZ);
    nextHurdleZ += sp * 0.95 + 5 + r * (6 + sp * 0.8);
  }
}

function jumpInput(): void {
  if (status === 'won' || status === 'lost') {
    reset();
    status = 'playing';
  } else if (status === 'ready') {
    status = 'playing';
  }
  if (!airborne) {
    airborne = true;
    vy = JUMP_V;
  }
}

function endRun(s: 'won' | 'lost'): void {
  status = s;
  if (distance > best) best = distance;
}

function step(dt: number): void {
  if (status !== 'playing') return;
  speed = speedAt(distance);
  distance += speed * dt;
  phase += speed * dt * 1.1;

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
    if (Math.abs(h.z - distance) < RUNNER_HALF_Z + HURDLE_HALF_Z && y < h.h) {
      endRun('lost');
      return;
    }
  }

  if (distance >= GOAL) {
    distance = GOAL;
    endRun('won');
  }
}

// ---------- input ----------
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    e.preventDefault();
    if (!e.repeat) jumpInput();
  } else if (e.code === 'KeyR') {
    reset();
  }
});
window.addEventListener('pointerdown', (e) => {
  if (e.button === 0 || e.pointerType !== 'mouse') jumpInput();
});

// ---------- per-frame visuals ----------
function updateVisuals(time: number): void {
  const d = distance;
  const z = -d;
  runner.position.set(0, y, z);

  if (status === 'lost') {
    runner.rotation.x = -0.5;
    legL.rotation.x = legR.rotation.x = 0;
  } else {
    runner.rotation.x = 0;
    if (airborne) {
      legL.rotation.x = -0.9;
      legR.rotation.x = 0.5;
      armL.rotation.x = -2.4;
      armR.rotation.x = -2.4;
    } else if (status === 'playing' || status === 'won') {
      const s = Math.sin(phase * 2);
      legL.rotation.x = s * 0.9;
      legR.rotation.x = -s * 0.9;
      armL.rotation.x = -s * 0.9;
      armR.rotation.x = s * 0.9;
    } else {
      const s = Math.sin(time * 0.003) * 0.05;
      legL.rotation.x = legR.rotation.x = 0;
      armL.rotation.x = armR.rotation.x = s;
    }
  }

  grass.position.z = z - 100;
  track.position.set(0, 0, z - 100);
  updatePool(stripePool, d);
  updatePool(dashPool, d);
  updatePool(postPool, d);
  updatePool(treePool, d);

  // camera follows
  camera.position.set(0, 3.2 + y * 0.35, z + 6.5);
  camera.lookAt(0, 1.0, z - 6);

  // drop hurdles well behind the camera
  while (hurdles.length > 0 && hurdles[0].z < d - 12) {
    scene.remove(hurdles[0].mesh);
    hurdles.shift();
  }
}

function updateHud(): void {
  hudDist.textContent = `Distance: ${Math.floor(distance)} m`;
  hudBest.textContent = `Best: ${Math.floor(Math.max(best, distance))} m`;
  hudStatus.textContent = `Status: ${status}`;
  if (status === 'ready') {
    overlay.style.display = 'flex';
    overlayTitle.textContent = 'Ready';
    overlayHint.textContent = 'Press Space / W / ArrowUp or click to start and jump';
  } else if (status === 'lost') {
    overlay.style.display = 'flex';
    overlayTitle.textContent = `Game over: ${Math.floor(distance)} m`;
    overlayHint.textContent = 'Press R or jump to restart';
  } else if (status === 'won') {
    overlay.style.display = 'flex';
    overlayTitle.textContent = `You win! ${GOAL} m`;
    overlayHint.textContent = 'Press R or jump to restart';
  } else {
    overlay.style.display = 'none';
  }
}

function publish(): void {
  window.__TASK_STATE__ = {
    status,
    score: Math.round(distance * 10) / 10,
    speed: Math.round(speed * 100) / 100,
    airborne,
  };
}

// ---------- main loop ----------
reset();
publish();
let last = performance.now();
let acc = 0;
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  acc += dt;
  while (acc >= STEP) {
    step(STEP);
    acc -= STEP;
    if (status !== 'playing') acc = 0;
  }
  spawnHurdles();
  updateVisuals(now);
  updateHud();
  publish();
  renderer.render(scene, camera);
  if (!window.__TASK_READY__) window.__TASK_READY__ = true;
  requestAnimationFrame(frame);
}
window.__TASK_READY__ = false;
requestAnimationFrame(frame);
