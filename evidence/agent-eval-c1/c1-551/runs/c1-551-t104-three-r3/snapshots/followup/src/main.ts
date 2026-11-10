import * as THREE from 'three';

type Status = 'playing' | 'won' | 'lost';

declare global {
  interface Window {
    __TASK_STATE__?: { status: Status; score: number; height: number; paused: boolean };
    __TASK_READY__?: boolean;
    __EVAL_READY__?: boolean;
  }
}

const SLAB_H = 0.6;
const SLAB_D = 4;
const BASE_W = 4;
const AMPLITUDE = 5.5;
const PERFECT_TOL = 0.12;
const WIN_HEIGHT = 25;
const PERFECT_BONUS = 1;

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b2233);
scene.fog = new THREE.Fog(0x1b2233, 25, 60);

const camera = new THREE.PerspectiveCamera(40, 640 / 360, 0.1, 100);

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(6, 12, 8);
scene.add(sun);

// HUD (DOM, outside the canvas)
const hud = document.createElement('div');
hud.style.cssText =
  'width:640px;box-sizing:border-box;padding:6px 10px;display:flex;justify-content:space-between;' +
  'background:#111;color:#fff;font:14px/1.4 system-ui,sans-serif;';
const scoreEl = document.createElement('span');
const bestEl = document.createElement('span');
const statusEl = document.createElement('span');
hud.append(scoreEl, bestEl, statusEl);
canvas.insertAdjacentElement('afterend', hud);

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

interface Slab {
  mesh: THREE.Mesh;
  x: number;
  w: number;
}

interface Debris {
  mesh: THREE.Mesh;
  vy: number;
  vx: number;
  spin: number;
}

let tower: Slab[] = [];
let debris: Debris[] = [];
let current: Slab | null = null;
let status: Status = 'playing';
let score = 0;
let best = 0;
let phase = 0;
let camY = 0;
let paused = false;

function colorFor(level: number): THREE.Color {
  return new THREE.Color().setHSL(((level * 11) % 360) / 360, 0.65, 0.58);
}

function makeSlab(level: number, x: number, w: number): Slab {
  const mat = new THREE.MeshStandardMaterial({ color: colorFor(level), roughness: 0.6 });
  const mesh = new THREE.Mesh(boxGeo, mat);
  mesh.scale.set(w, SLAB_H, SLAB_D);
  mesh.position.set(x, level * SLAB_H + SLAB_H / 2, 0);
  scene.add(mesh);
  return { mesh, x, w };
}

function spawnDebris(level: number, x: number, w: number, dir: number): void {
  const d = makeSlab(level, x, w);
  debris.push({ mesh: d.mesh, vy: 0, vx: dir * 1.5, spin: -dir * 1.5 });
}

function removeMesh(m: THREE.Mesh): void {
  scene.remove(m);
  (m.material as THREE.Material).dispose();
}

function height(): number {
  return tower.length - 1;
}

function speed(): number {
  return Math.min(1.6 + 0.2 * Math.floor(height() / 3), 4.2);
}

function publish(): void {
  window.__TASK_STATE__ = { status, score, height: height(), paused };
  scoreEl.textContent = `Score: ${score}`;
  bestEl.textContent = `Best: ${best}`;
  statusEl.textContent = paused ? `Status: ${status} | Paused` : `Status: ${status}`;
}

function spawnCurrent(): void {
  const prev = tower[tower.length - 1];
  phase = -Math.PI / 2;
  current = makeSlab(tower.length, -AMPLITUDE, prev.w);
}

function restart(): void {
  for (const s of tower) removeMesh(s.mesh);
  for (const d of debris) removeMesh(d.mesh);
  if (current) removeMesh(current.mesh);
  tower = [];
  debris = [];
  current = null;
  score = 0;
  status = 'playing';
  paused = false;
  tower.push(makeSlab(0, 0, BASE_W));
  spawnCurrent();
  publish();
}

function drop(): void {
  if (status !== 'playing' || paused || !current) return;
  const prev = tower[tower.length - 1];
  const level = tower.length;
  const cur = current;
  const diff = cur.x - prev.x;
  const overlap = cur.w - Math.abs(diff);

  if (overlap <= 0) {
    // complete miss: whole slab falls away
    debris.push({ mesh: cur.mesh, vy: 0, vx: Math.sign(diff || 1) * 1.5, spin: -Math.sign(diff || 1) * 1.5 });
    current = null;
    status = 'lost';
    best = Math.max(best, score);
    publish();
    return;
  }

  let placed: Slab;
  if (Math.abs(diff) <= PERFECT_TOL) {
    cur.x = prev.x;
    cur.mesh.position.x = prev.x;
    placed = cur;
    score += 1 + PERFECT_BONUS;
  } else {
    const left = Math.max(cur.x - cur.w / 2, prev.x - prev.w / 2);
    const right = Math.min(cur.x + cur.w / 2, prev.x + prev.w / 2);
    const nw = right - left;
    const nx = (left + right) / 2;
    const dir = Math.sign(diff);
    const cutW = cur.w - nw;
    const cutX = dir > 0 ? right + cutW / 2 : left - cutW / 2;
    removeMesh(cur.mesh);
    placed = makeSlab(level, nx, nw);
    spawnDebris(level, cutX, cutW, dir);
    score += 1;
  }
  tower.push(placed);
  current = null;
  best = Math.max(best, score);

  if (height() >= WIN_HEIGHT) {
    status = 'won';
  } else {
    spawnCurrent();
  }
  publish();
}

function action(): void {
  if (status === 'playing') drop();
  else restart();
}

function togglePause(): void {
  if (status !== 'playing') return;
  paused = !paused;
  publish();
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (e.repeat) return;
    if (status === 'playing') drop();
  } else if (e.code === 'KeyR') {
    restart();
  } else if (e.code === 'KeyP') {
    if (!e.repeat) togglePause();
  }
});
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (paused) return;
  action();
});

restart();
camY = SLAB_H * 2;

let last = performance.now();
let readySet = false;

function frame(now: number): void {
  const dt = paused ? 0 : Math.min((now - last) / 1000, 0.05);
  last = now;

  if (status === 'playing' && current) {
    phase += speed() * dt;
    current.x = AMPLITUDE * Math.sin(phase);
    current.mesh.position.x = current.x;
  }

  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i];
    d.vy -= 20 * dt;
    d.mesh.position.x += d.vx * dt;
    d.mesh.position.y += d.vy * dt;
    d.mesh.rotation.z += d.spin * dt;
    if (d.mesh.position.y < camY - 15) {
      removeMesh(d.mesh);
      debris.splice(i, 1);
    }
  }

  const targetY = height() * SLAB_H + 2;
  camY += (targetY - camY) * Math.min(1, dt * 3);
  camera.position.set(11, camY + 8, 11);
  camera.lookAt(0, camY, 0);

  renderer.render(scene, camera);

  if (!readySet) {
    readySet = true;
    window.__TASK_READY__ = true;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
