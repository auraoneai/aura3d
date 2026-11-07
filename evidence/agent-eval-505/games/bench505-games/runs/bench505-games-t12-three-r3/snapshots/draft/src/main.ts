import * as THREE from 'three';

type Status = 'playing' | 'won' | 'lost';

interface TaskState {
  status: Status;
  score: number;
  height: number;
}

declare global {
  interface Window {
    __TASK_STATE__: TaskState;
    __TASK_READY__: boolean;
  }
}

interface Slab {
  x: number;
  z: number;
  w: number; // size along x
  d: number; // size along z
  y: number; // center y
}

interface Debris {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
}

const SLAB_H = 0.5;
const BASE_SIZE = 3;
const WIN_HEIGHT = 25;
const PERFECT_TOL = 0.1;
const RANGE = 4;
const MIN_OVERLAP = 0.001;

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b2233);

const VIEW = 9;
const camera = new THREE.OrthographicCamera(
  (-VIEW * 16) / 9 / 2,
  (VIEW * 16) / 9 / 2,
  VIEW / 2,
  -VIEW / 2,
  0.1,
  200,
);
const CAM_OFFSET = new THREE.Vector3(10, 10, 10);

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(5, 12, 7);
scene.add(sun);

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

// HUD (DOM, outside the canvas)
const hud = document.createElement('div');
hud.style.cssText = 'display:flex;gap:24px;padding:6px 10px;width:620px;font:14px system-ui,sans-serif;background:#111;color:#fff;';
hud.innerHTML =
  '<span>Score: <b id="hud-score">0</b></span>' +
  '<span>Best: <b id="hud-best">0</b></span>' +
  '<span>Status: <b id="hud-status">playing</b></span>' +
  '<span style="margin-left:auto;opacity:.7">Space / click = drop, R = restart</span>';
document.body.appendChild(hud);
const hudScore = document.getElementById('hud-score') as HTMLElement;
const hudBest = document.getElementById('hud-best') as HTMLElement;
const hudStatus = document.getElementById('hud-status') as HTMLElement;

let best = 0;
let status: Status = 'playing';
let score = 0;
let height = 0;

let tower: Slab[] = [];
let towerMeshes: THREE.Mesh[] = [];
let debris: Debris[] = [];
let moving: THREE.Mesh | null = null;
let mSlab: Slab = { x: 0, z: 0, w: 0, d: 0, y: 0 };
let axis: 'x' | 'z' = 'x';
let dir = 1;
let camY = 0;

function levelColor(level: number): THREE.Color {
  const c = new THREE.Color();
  c.setHSL((0.55 + level * 0.025) % 1, 0.6, 0.55);
  return c;
}

function makeMesh(s: Slab, level: number): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({ color: levelColor(level), roughness: 0.6 });
  const m = new THREE.Mesh(boxGeo, mat);
  m.scale.set(s.w, SLAB_H, s.d);
  m.position.set(s.x, s.y, s.z);
  scene.add(m);
  return m;
}

function publish(): void {
  window.__TASK_STATE__ = { status, score, height };
  hudScore.textContent = String(score);
  hudBest.textContent = String(best);
  hudStatus.textContent = status;
}

function speed(): number {
  return Math.min(2.5 + Math.floor(height / 3) * 0.4, 7);
}

function spawnMoving(): void {
  const top = tower[tower.length - 1];
  axis = height % 2 === 0 ? 'x' : 'z';
  mSlab = { x: top.x, z: top.z, w: top.w, d: top.d, y: top.y + SLAB_H };
  dir = 1;
  if (axis === 'x') mSlab.x = top.x - RANGE;
  else mSlab.z = top.z - RANGE;
  moving = makeMesh(mSlab, height + 1);
}

function reset(): void {
  for (const m of towerMeshes) scene.remove(m);
  for (const d of debris) scene.remove(d.mesh);
  if (moving) scene.remove(moving);
  towerMeshes = [];
  debris = [];
  moving = null;
  status = 'playing';
  score = 0;
  height = 0;
  const base: Slab = { x: 0, z: 0, w: BASE_SIZE, d: BASE_SIZE, y: SLAB_H / 2 };
  tower = [base];
  towerMeshes.push(makeMesh(base, 0));
  spawnMoving();
  publish();
}

function addDebris(s: Slab, level: number): void {
  const m = makeMesh(s, level);
  debris.push({
    mesh: m,
    vel: new THREE.Vector3(0, 0, 0),
    spin: new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3),
  });
}

function drop(): void {
  if (status !== 'playing' || !moving) return;
  const top = tower[tower.length - 1];
  const level = height + 1;
  const a = axis;
  const size = a === 'x' ? 'w' : 'd';
  const prevC = top[a];
  const curC = mSlab[a];
  const prevS = top[size];
  const curS = mSlab[size];

  const lo = Math.max(prevC - prevS / 2, curC - curS / 2);
  const hi = Math.min(prevC + prevS / 2, curC + curS / 2);
  const overlap = hi - lo;

  scene.remove(moving);

  if (overlap < MIN_OVERLAP) {
    // complete miss: the whole slab falls away
    addDebris({ ...mSlab }, level);
    moving = null;
    status = 'lost';
    best = Math.max(best, score);
    publish();
    return;
  }

  let placed: Slab;
  let bonus = 0;
  if (Math.abs(curC - prevC) <= PERFECT_TOL) {
    placed = { ...mSlab, x: top.x, z: top.z, w: top.w, d: top.d };
    bonus = 1;
  } else {
    placed = { ...mSlab };
    placed[a] = (lo + hi) / 2;
    placed[size] = overlap;
    // overhanging part
    const cutS = curS - overlap;
    const curLo = curC - curS / 2;
    const cutC = curLo < lo ? (curLo + lo) / 2 : (hi + curC + curS / 2) / 2;
    const cut: Slab = { ...mSlab };
    cut[a] = cutC;
    cut[size] = cutS;
    addDebris(cut, level);
  }

  tower.push(placed);
  towerMeshes.push(makeMesh(placed, level));
  height += 1;
  score += 1 + bonus;
  moving = null;

  if (height >= WIN_HEIGHT) {
    status = 'won';
    best = Math.max(best, score);
  } else {
    spawnMoving();
  }
  publish();
}

function onKey(e: KeyboardEvent): void {
  if (e.code === 'Space' || e.key === ' ') {
    e.preventDefault();
    if (!e.repeat) drop();
  } else if (e.code === 'KeyR' || e.key === 'r' || e.key === 'R') {
    reset();
  }
}
window.addEventListener('keydown', onKey);
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (status === 'playing') drop();
  else reset();
});

function update(dt: number): void {
  if (status === 'playing' && moving) {
    const lim = tower[tower.length - 1][axis];
    let p = mSlab[axis] + dir * speed() * dt;
    if (p > lim + RANGE) {
      p = lim + RANGE - (p - (lim + RANGE));
      dir = -1;
    } else if (p < lim - RANGE) {
      p = lim - RANGE + (lim - RANGE - p);
      dir = 1;
    }
    mSlab[axis] = p;
    moving.position.set(mSlab.x, mSlab.y, mSlab.z);
  }

  for (const d of debris) {
    d.vel.y -= 20 * dt;
    d.mesh.position.addScaledVector(d.vel, dt);
    d.mesh.rotation.x += d.spin.x * dt;
    d.mesh.rotation.z += d.spin.z * dt;
  }
  for (let i = debris.length - 1; i >= 0; i--) {
    if (debris[i].mesh.position.y < camY - 15) {
      scene.remove(debris[i].mesh);
      debris.splice(i, 1);
    }
  }

  // camera follows the top of the tower
  const targetY = tower[tower.length - 1].y + 1.5;
  camY += (targetY - camY) * Math.min(1, dt * 4);
  camera.position.set(CAM_OFFSET.x, CAM_OFFSET.y + camY, CAM_OFFSET.z);
  camera.lookAt(0, camY, 0);
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  renderer.render(scene, camera);
  if (!window.__TASK_READY__) window.__TASK_READY__ = true;
  requestAnimationFrame(frame);
}

window.__TASK_READY__ = false;
reset();
camY = tower[0].y + 1.5;
requestAnimationFrame(frame);
