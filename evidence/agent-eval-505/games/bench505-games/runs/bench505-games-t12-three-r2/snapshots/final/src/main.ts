import * as THREE from 'three';

type Status = 'playing' | 'won' | 'lost';

declare global {
  interface Window {
    __TASK_STATE__: { status: Status; score: number; height: number };
    __TASK_READY__: boolean;
  }
}

const SLAB_H = 0.5;
const SLAB_D = 4;
const BASE_W = 4;
const RANGE = 4.5;
const WIN_HEIGHT = 25;
const PERFECT_TOL = 0.12;
const PERFECT_BONUS = 1;
const LEVELS_PER_SPEEDUP = 3;

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x151a2b);
scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(5, 12, 8);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(40, 640 / 360, 0.1, 200);
const CAM_OFFSET = new THREE.Vector3(9, 6, 11);
let camTarget = 0;
let camY = 0;

// HUD
const hud = document.createElement('div');
hud.id = 'hud';
hud.style.cssText =
  'display:flex;gap:24px;padding:6px 10px;width:620px;background:#10131f;color:#fff;font:14px system-ui,sans-serif;';
hud.innerHTML =
  '<span>Score: <b id="hud-score">0</b></span>' +
  '<span>Best: <b id="hud-best">0</b></span>' +
  '<span>Status: <b id="hud-status">playing</b></span>' +
  '<span style="margin-left:auto;opacity:.6">Space / click: drop · R: restart</span>';
document.body.appendChild(hud);
const hudScore = document.getElementById('hud-score') as HTMLElement;
const hudBest = document.getElementById('hud-best') as HTMLElement;
const hudStatus = document.getElementById('hud-status') as HTMLElement;

interface Slab {
  mesh: THREE.Mesh;
  x: number;
  w: number;
}
interface Falling {
  mesh: THREE.Mesh;
  vy: number;
  vx: number;
  spin: number;
}

const geo = new THREE.BoxGeometry(1, SLAB_H, SLAB_D);

let tower: Slab[] = [];
let falling: Falling[] = [];
let current: Slab | null = null;
let status: Status = 'playing';
let score = 0;
let best = 0;
let phase = 0;

function colorFor(level: number): THREE.Color {
  return new THREE.Color().setHSL(((level * 11) % 360) / 360, 0.65, 0.58);
}

function makeSlab(level: number, x: number, w: number): Slab {
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: colorFor(level) }));
  mesh.scale.x = w;
  mesh.position.set(x, level * SLAB_H, 0);
  scene.add(mesh);
  return { mesh, x, w };
}

function speed(): number {
  const level = tower.length;
  return Math.min(1.6 + 0.35 * Math.floor(level / LEVELS_PER_SPEEDUP), 5);
}

function spawnFalling(level: number, x: number, w: number, dir: number): void {
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: colorFor(level) }));
  mesh.scale.x = w;
  mesh.position.set(x, level * SLAB_H, 0);
  scene.add(mesh);
  falling.push({ mesh, vy: 0, vx: dir * 1.5, spin: -dir * 1.5 });
}

function disposeMesh(m: THREE.Mesh): void {
  scene.remove(m);
  (m.material as THREE.Material).dispose();
}

function publish(): void {
  const height = tower.length - 1;
  window.__TASK_STATE__ = { status, score, height };
  hudScore.textContent = String(score);
  hudBest.textContent = String(best);
  hudStatus.textContent = status;
}

function spawnCurrent(): void {
  const top = tower[tower.length - 1];
  phase = 0;
  current = makeSlab(tower.length, -RANGE, top.w);
}

function restart(): void {
  for (const s of tower) disposeMesh(s.mesh);
  for (const f of falling) disposeMesh(f.mesh);
  if (current) disposeMesh(current.mesh);
  tower = [];
  falling = [];
  current = null;
  score = 0;
  status = 'playing';
  tower.push(makeSlab(0, 0, BASE_W));
  spawnCurrent();
  publish();
}

function drop(): void {
  if (status !== 'playing' || !current) return;
  const prev = tower[tower.length - 1];
  const level = tower.length;
  const cx = current.x;
  const w = current.w;
  const left = Math.max(prev.x - prev.w / 2, cx - w / 2);
  const right = Math.min(prev.x + prev.w / 2, cx + w / 2);
  const overlap = right - left;

  if (overlap <= 0) {
    spawnFalling(level, cx, w, cx >= prev.x ? 1 : -1);
    disposeMesh(current.mesh);
    current = null;
    status = 'lost';
    publish();
    return;
  }

  let placed: Slab;
  if (Math.abs(cx - prev.x) <= PERFECT_TOL) {
    placed = makeSlab(level, prev.x, w);
    score += 1 + PERFECT_BONUS;
  } else {
    const nx = (left + right) / 2;
    placed = makeSlab(level, nx, overlap);
    score += 1;
    if (cx > prev.x) {
      const cutW = cx + w / 2 - right;
      spawnFalling(level, right + cutW / 2, cutW, 1);
    } else {
      const cutW = left - (cx - w / 2);
      spawnFalling(level, left - cutW / 2, cutW, -1);
    }
  }
  disposeMesh(current.mesh);
  current = null;
  tower.push(placed);
  best = Math.max(best, score);

  if (tower.length - 1 >= WIN_HEIGHT) {
    status = 'won';
  } else {
    spawnCurrent();
  }
  publish();
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) drop();
  } else if (e.code === 'KeyR') {
    restart();
  }
});
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (status === 'playing') drop();
  else restart();
});

restart();
camY = camTarget = 0;

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  if (current && status === 'playing') {
    phase += dt * speed();
    current.x = -RANGE * Math.cos(phase);
    current.mesh.position.x = current.x;
  }

  for (let i = falling.length - 1; i >= 0; i--) {
    const f = falling[i];
    f.vy -= 25 * dt;
    f.mesh.position.y += f.vy * dt;
    f.mesh.position.x += f.vx * dt;
    f.mesh.rotation.z += f.spin * dt;
    if (f.mesh.position.y < camY - 20) {
      disposeMesh(f.mesh);
      falling.splice(i, 1);
    }
  }

  camTarget = (tower.length - 1) * SLAB_H;
  camY += (camTarget - camY) * Math.min(1, dt * 4);
  camera.position.set(CAM_OFFSET.x, camY + CAM_OFFSET.y + 1.5, CAM_OFFSET.z);
  camera.lookAt(0, camY + 1.5, 0);

  renderer.render(scene, camera);
  if (!window.__TASK_READY__) window.__TASK_READY__ = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
