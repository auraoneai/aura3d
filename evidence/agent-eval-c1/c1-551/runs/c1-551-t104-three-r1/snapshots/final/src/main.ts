import * as THREE from 'three';

type Status = 'playing' | 'won' | 'lost';

interface TaskState {
  status: Status;
  score: number;
  height: number;
  paused: boolean;
}

declare global {
  interface Window {
    __TASK_STATE__: TaskState;
    __TASK_READY__?: boolean;
    __EVAL_READY__?: boolean;
  }
}

const WIN_HEIGHT = 25;
const SLAB_H = 0.5;
const SLAB_D = 3;
const BASE_W = 3.5;
const RANGE = 5;
const PERFECT_TOL = 0.12;
const BONUS = 1;

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);

const scene = new THREE.Scene();
const background = new THREE.Color(0x223344);
scene.background = background;
const camera = new THREE.PerspectiveCamera(40, 640 / 360, 0.1, 200);
scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(4, 10, 6);
scene.add(sun);

const geometry = new THREE.BoxGeometry(1, 1, 1);

// HUD (DOM, outside the canvas)
const hud = document.createElement('div');
hud.id = 'hud';
hud.style.cssText = 'width:640px;display:flex;justify-content:space-between;padding:6px 10px;box-sizing:border-box;font:14px system-ui,sans-serif;';
const scoreEl = document.createElement('span');
const bestEl = document.createElement('span');
const statusEl = document.createElement('span');
hud.append(scoreEl, bestEl, statusEl);
document.body.appendChild(hud);
const help = document.createElement('div');
help.style.cssText = 'padding:0 10px;font:12px system-ui,sans-serif;color:#aaa;';
help.textContent = 'Space / click: drop slab. R / click after game ends: restart.';
document.body.appendChild(help);

interface Slab {
  mesh: THREE.Mesh;
  x: number;
  w: number;
  index: number;
}

interface Debris {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  spin: number;
}

let tower: Slab[] = [];
let debris: Debris[] = [];
let active: Slab | null = null;
let dir = 1;
let status: Status = 'playing';
let score = 0;
let best = 0;
let camY = 0;
let paused = false;

function levelColor(level: number): THREE.Color {
  return new THREE.Color().setHSL(((level * 11) % 360) / 360, 0.65, 0.55);
}

function makeSlabMesh(x: number, w: number, index: number): THREE.Mesh {
  const mat = new THREE.MeshLambertMaterial({ color: levelColor(index) });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.scale.set(w, SLAB_H, SLAB_D);
  mesh.position.set(x, index * SLAB_H, 0);
  scene.add(mesh);
  return mesh;
}

function speedFor(stacked: number): number {
  return Math.min(3 + Math.floor(stacked / 3) * 0.5, 9);
}

function publish(): void {
  const height = tower.length - 1;
  window.__TASK_STATE__ = { status, score, height, paused };
  scoreEl.textContent = `Score: ${score}`;
  bestEl.textContent = `Best: ${best}`;
  statusEl.textContent = paused ? `Status: ${status} (Paused)` : `Status: ${status}`;
}

function disposeMesh(mesh: THREE.Mesh): void {
  scene.remove(mesh);
  (mesh.material as THREE.Material).dispose();
}

function spawnActive(): void {
  const top = tower[tower.length - 1];
  const index = tower.length;
  dir = index % 2 === 0 ? 1 : -1;
  const x = -dir * RANGE;
  active = { mesh: makeSlabMesh(x, top.w, index), x, w: top.w, index };
}

function reset(): void {
  for (const s of tower) disposeMesh(s.mesh);
  for (const d of debris) disposeMesh(d.mesh);
  if (active) disposeMesh(active.mesh);
  tower = [];
  debris = [];
  active = null;
  score = 0;
  status = 'playing';
  paused = false;
  tower.push({ mesh: makeSlabMesh(0, BASE_W, 0), x: 0, w: BASE_W, index: 0 });
  spawnActive();
  camY = 0;
  updateCamera(true);
  publish();
}

function addDebris(left: number, right: number, index: number): void {
  const w = right - left;
  if (w <= 1e-4) return;
  const cx = (left + right) / 2;
  const mesh = makeSlabMesh(cx, w, index);
  debris.push({
    mesh,
    vx: cx > 0 ? 1.2 : -1.2,
    vy: 0,
    spin: (cx > 0 ? -1 : 1) * 1.5,
  });
}

function drop(): void {
  if (status !== 'playing' || !active || paused) return;
  const prev = tower[tower.length - 1];
  const cur = active;
  active = null;

  const curL = cur.x - cur.w / 2;
  const curR = cur.x + cur.w / 2;
  const prevL = prev.x - prev.w / 2;
  const prevR = prev.x + prev.w / 2;
  const overL = Math.max(curL, prevL);
  const overR = Math.min(curR, prevR);

  if (overR - overL <= 1e-4) {
    // Missed entirely: the whole slab falls.
    debris.push({
      mesh: cur.mesh,
      vx: cur.x > prev.x ? 1.2 : -1.2,
      vy: 0,
      spin: cur.x > prev.x ? -1.5 : 1.5,
    });
    status = 'lost';
    best = Math.max(best, score);
    publish();
    return;
  }

  let placed: Slab;
  if (Math.abs(cur.x - prev.x) <= PERFECT_TOL) {
    cur.mesh.position.x = prev.x;
    placed = { mesh: cur.mesh, x: prev.x, w: prev.w, index: cur.index };
    score += 1 + BONUS;
  } else {
    const w = overR - overL;
    const x = (overL + overR) / 2;
    cur.mesh.scale.x = w;
    cur.mesh.position.x = x;
    placed = { mesh: cur.mesh, x, w, index: cur.index };
    if (curL < overL) addDebris(curL, overL, cur.index);
    if (curR > overR) addDebris(overR, curR, cur.index);
    score += 1;
  }
  tower.push(placed);

  if (tower.length - 1 >= WIN_HEIGHT) {
    status = 'won';
  } else {
    spawnActive();
  }
  best = Math.max(best, score);
  publish();
}

function updateCamera(snap: boolean, dt = 0): void {
  const topY = (tower.length - 1) * SLAB_H;
  const target = Math.max(0, topY);
  camY = snap ? target : camY + (target - camY) * Math.min(1, dt * 4);
  camera.position.set(7, camY + 5, 11);
  camera.lookAt(0, camY + 1, 0);
  const bg = levelColor(tower.length + 20).offsetHSL(0, -0.35, -0.3);
  background.copy(bg);
}

function step(dt: number): void {
  if (paused) return;
  if (active && status === 'playing') {
    const speed = speedFor(tower.length - 1);
    active.x += dir * speed * dt;
    if (active.x > RANGE) {
      active.x = RANGE;
      dir = -1;
    } else if (active.x < -RANGE) {
      active.x = -RANGE;
      dir = 1;
    }
    active.mesh.position.x = active.x;
  }

  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i];
    d.vy -= 20 * dt;
    d.mesh.position.x += d.vx * dt;
    d.mesh.position.y += d.vy * dt;
    d.mesh.rotation.z += d.spin * dt;
    if (d.mesh.position.y < camY - 15) {
      disposeMesh(d.mesh);
      debris.splice(i, 1);
    }
  }
  updateCamera(false, dt);
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) drop();
  } else if (e.code === 'KeyR') {
    reset();
  } else if (e.code === 'KeyP') {
    if (!e.repeat && status === 'playing') {
      paused = !paused;
      publish();
    }
  }
});

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (paused) return;
  if (status === 'playing') drop();
  else reset();
});

reset();

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  step(dt);
  renderer.render(scene, camera);
  if (!window.__TASK_READY__) {
    window.__TASK_READY__ = true;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
