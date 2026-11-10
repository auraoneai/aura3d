import * as THREE from 'three';

type Status = 'playing' | 'won' | 'lost';

declare global {
  interface Window {
    __TASK_STATE__: { status: Status; score: number; height: number };
    __TASK_READY__?: boolean;
    __EVAL_READY__?: boolean;
  }
}

// ---- constants ----
const SLAB_H = 0.5;
const SLAB_DEPTH = 4;
const BASE_WIDTH = 4;
const RANGE = 5; // moving slab center oscillates in [-RANGE, RANGE]
const PERFECT_TOL = 0.15;
const WIN_HEIGHT = 25;
const BASE_SPEED = 3;
const SPEED_STEP = 0.45; // added every LEVELS_PER_STEP levels
const LEVELS_PER_STEP = 3;
const MAX_SPEED = 9;
const VIEW_H = 9;

// ---- DOM ----
const canvas = document.getElementById('app') as HTMLCanvasElement;

const hud = document.createElement('div');
hud.style.cssText =
  'width:640px;box-sizing:border-box;display:flex;justify-content:space-between;padding:6px 10px;' +
  'background:#111;color:#fff;font:14px/1.4 system-ui,sans-serif;';
const scoreEl = document.createElement('span');
const bestEl = document.createElement('span');
const statusEl = document.createElement('span');
const noteEl = document.createElement('span');
scoreEl.id = 'hud-score';
bestEl.id = 'hud-best';
statusEl.id = 'hud-status';
noteEl.id = 'hud-note';
hud.append(scoreEl, bestEl, statusEl, noteEl);
canvas.insertAdjacentElement('afterend', hud);

// ---- three setup ----
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b2338);

const aspect = 640 / 360;
const camera = new THREE.OrthographicCamera(
  (-VIEW_H * aspect) / 2,
  (VIEW_H * aspect) / 2,
  VIEW_H / 2,
  -VIEW_H / 2,
  0.1,
  100,
);
const CAM_OFFSET = new THREE.Vector3(7, 8, 11);

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(4, 10, 6);
scene.add(sun);

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

// ---- game state ----
interface Slab {
  mesh: THREE.Mesh;
  x: number;
  w: number;
}
interface Debris {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  spin: number;
}

let stack: Slab[] = [];
let debris: Debris[] = [];
let moving: Slab | null = null;
let dir = 1;
let status: Status = 'playing';
let score = 0;
let height = 0;
let best = 0;
let camY = 0;
let bgHue = 0;

window.__TASK_STATE__ = { status, score, height };

function colorFor(level: number): THREE.Color {
  const c = new THREE.Color();
  c.setHSL((0.55 + level * 0.025) % 1, 0.6, 0.55);
  return c;
}

function makeSlab(level: number, x: number, w: number): Slab {
  const mat = new THREE.MeshLambertMaterial({ color: colorFor(level) });
  const mesh = new THREE.Mesh(boxGeo, mat);
  mesh.scale.set(w, SLAB_H, SLAB_DEPTH);
  mesh.position.set(x, level * SLAB_H + SLAB_H / 2, 0);
  scene.add(mesh);
  return { mesh, x, w };
}

function speedFor(level: number): number {
  return Math.min(MAX_SPEED, BASE_SPEED + Math.floor(level / LEVELS_PER_STEP) * SPEED_STEP);
}

function topY(): number {
  return stack.length * SLAB_H;
}

function removeMesh(m: THREE.Mesh): void {
  scene.remove(m);
  (m.material as THREE.Material).dispose();
}

function spawnDebris(level: number, left: number, right: number, fromMesh: THREE.Mesh | null): void {
  const w = right - left;
  if (w <= 1e-4) return;
  const mat = fromMesh
    ? (fromMesh.material as THREE.MeshLambertMaterial).clone()
    : new THREE.MeshLambertMaterial({ color: colorFor(level) });
  const mesh = new THREE.Mesh(boxGeo, mat);
  const cx = (left + right) / 2;
  mesh.scale.set(w, SLAB_H, SLAB_DEPTH);
  mesh.position.set(cx, level * SLAB_H + SLAB_H / 2, 0);
  scene.add(mesh);
  const side = cx >= (stack[stack.length - 1]?.x ?? 0) ? 1 : -1;
  debris.push({ mesh, vx: side * 1.5, vy: 0.5, spin: side * -2 });
}

function updateStateAndHud(note = ''): void {
  if (score > best) best = score;
  window.__TASK_STATE__.status = status;
  window.__TASK_STATE__.score = score;
  window.__TASK_STATE__.height = height;
  scoreEl.textContent = `Score: ${score}`;
  bestEl.textContent = `Best: ${best}`;
  statusEl.textContent = `Status: ${status}`;
  noteEl.textContent =
    note ||
    (status === 'playing'
      ? 'Space / click to drop'
      : status === 'won'
        ? 'You win! R or click to restart'
        : 'Missed! R or click to restart');
}

function spawnMoving(): void {
  const prev = stack[stack.length - 1];
  const level = stack.length;
  moving = makeSlab(level, -RANGE, prev.w);
  dir = 1;
}

function reset(): void {
  for (const s of stack) removeMesh(s.mesh);
  for (const d of debris) removeMesh(d.mesh);
  if (moving) removeMesh(moving.mesh);
  stack = [];
  debris = [];
  moving = null;
  status = 'playing';
  score = 0;
  height = 0;
  stack.push(makeSlab(0, 0, BASE_WIDTH));
  spawnMoving();
  camY = topY() - 1.5;
  updateStateAndHud();
}

function drop(): void {
  if (status !== 'playing' || !moving) return;
  const prev = stack[stack.length - 1];
  const level = stack.length;
  const cl = moving.x - moving.w / 2;
  const cr = moving.x + moving.w / 2;
  const pl = prev.x - prev.w / 2;
  const pr = prev.x + prev.w / 2;
  const lo = Math.max(cl, pl);
  const hi = Math.min(cr, pr);

  if (hi - lo <= 0) {
    // complete miss
    status = 'lost';
    const m = moving.mesh;
    moving = null;
    debris.push({ mesh: m, vx: m.position.x >= prev.x ? 1.5 : -1.5, vy: 0.5, spin: 2 });
    updateStateAndHud();
    return;
  }

  const cut = moving.w - (hi - lo);
  let newX: number;
  let newW: number;
  let note = '';
  if (cut <= PERFECT_TOL) {
    newW = moving.w;
    newX = moving.x;
    if (cr > pr) newX -= cr - pr;
    if (cl < pl) newX += pl - cl;
    score += 1; // bonus
    note = 'Perfect! +1 bonus';
  } else {
    newW = hi - lo;
    newX = (hi + lo) / 2;
    if (cr > hi) spawnDebris(level, hi, cr, moving.mesh);
    else if (cl < lo) spawnDebris(level, cl, lo, moving.mesh);
  }

  // settle moving slab into the tower
  const placed = moving;
  placed.x = newX;
  placed.w = newW;
  placed.mesh.scale.x = newW;
  placed.mesh.position.x = newX;
  stack.push(placed);
  moving = null;
  height = stack.length - 1;
  score += 1;

  if (height >= WIN_HEIGHT) {
    status = 'won';
  } else {
    spawnMoving();
  }
  updateStateAndHud(status === 'playing' ? note : '');
}

// ---- input ----
window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.code === 'Space' || e.key === ' ') {
    e.preventDefault();
    if (!e.repeat) drop();
  } else if (e.key === 'r' || e.key === 'R') {
    reset();
  }
});
canvas.addEventListener('click', () => {
  if (status === 'playing') drop();
  else reset();
});

// ---- loop ----
function update(dt: number): void {
  if (status === 'playing' && moving) {
    const sp = speedFor(stack.length - 1);
    moving.x += dir * sp * dt;
    if (moving.x > RANGE) {
      moving.x = RANGE - (moving.x - RANGE);
      dir = -1;
    } else if (moving.x < -RANGE) {
      moving.x = -RANGE + (-RANGE - moving.x);
      dir = 1;
    }
    moving.mesh.position.x = moving.x;
  }

  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i];
    d.vy -= 25 * dt;
    d.mesh.position.x += d.vx * dt;
    d.mesh.position.y += d.vy * dt;
    d.mesh.rotation.z += d.spin * dt;
    if (d.mesh.position.y < camY - VIEW_H * 2) {
      removeMesh(d.mesh);
      debris.splice(i, 1);
    }
  }

  const target = topY() - 1.5;
  camY += (target - camY) * (1 - Math.exp(-3 * dt));
  camera.position.set(CAM_OFFSET.x, camY + CAM_OFFSET.y, CAM_OFFSET.z);
  camera.lookAt(0, camY, 0);

  bgHue = (0.62 + stack.length * 0.01) % 1;
  (scene.background as THREE.Color).setHSL(bgHue, 0.35, 0.16);
}

let last = performance.now();
let firstFrame = true;
function frame(now: number): void {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  update(dt);
  renderer.render(scene, camera);
  if (firstFrame) {
    firstFrame = false;
    window.__TASK_READY__ = true;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);
