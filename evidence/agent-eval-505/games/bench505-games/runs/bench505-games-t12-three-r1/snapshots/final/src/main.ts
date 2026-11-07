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

const WIN_HEIGHT = 25;
const SLAB_H = 0.5;
const SLAB_D = 3;
const BASE_W = 3;
const RANGE = 4; // slider center moves within [-RANGE, RANGE]
const PERFECT_TOL = 0.12;
const BONUS = 1;

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 640 / 360, 0.1, 200);
scene.add(new THREE.AmbientLight(0xffffff, 0.65));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(5, 12, 8);
scene.add(sun);

// HUD (DOM, outside canvas)
const hud = document.createElement('div');
hud.id = 'hud';
hud.style.cssText = 'display:flex;gap:24px;padding:6px 10px;width:620px;background:#111;font:14px system-ui,sans-serif;';
const scoreEl = document.createElement('span');
const bestEl = document.createElement('span');
const statusEl = document.createElement('span');
const helpEl = document.createElement('span');
helpEl.style.marginLeft = 'auto';
helpEl.style.opacity = '0.7';
helpEl.textContent = 'Space/click: drop · R: restart';
hud.append(scoreEl, bestEl, statusEl, helpEl);
canvas.insertAdjacentElement('afterend', hud);

const geometry = new THREE.BoxGeometry(1, 1, 1);

interface Slab {
  mesh: THREE.Mesh;
  x: number;
  width: number;
}
interface Faller {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
}

let stack: Slab[] = [];
let fallers: Faller[] = [];
let current: Slab | null = null;
let dir = 1;
let status: Status = 'playing';
let score = 0;
let best = 0;
let perfectFlash = 0;
let camTargetY = 0;
let camY = 0;

function levelColor(level: number): THREE.Color {
  return new THREE.Color().setHSL(((level * 12) % 360) / 360, 0.65, 0.55);
}

function makeSlab(level: number, x: number, width: number): Slab {
  const mat = new THREE.MeshLambertMaterial({ color: levelColor(level) });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.scale.set(width, SLAB_H, SLAB_D);
  mesh.position.set(x, level * SLAB_H + SLAB_H / 2, 0);
  scene.add(mesh);
  return { mesh, x, width };
}

function speedFor(height: number): number {
  return 3 + Math.floor(height / 4) * 0.5;
}

function publish(): void {
  window.__TASK_STATE__ = { status, score, height: stack.length - 1 };
  scoreEl.textContent = `Score: ${score}`;
  bestEl.textContent = `Best: ${best}`;
  statusEl.textContent = `Status: ${status}`;
}

function disposeMesh(mesh: THREE.Mesh): void {
  scene.remove(mesh);
  (mesh.material as THREE.Material).dispose();
}

function spawnSlider(): void {
  const top = stack[stack.length - 1];
  dir = stack.length % 2 === 0 ? 1 : -1;
  const x = dir === 1 ? -RANGE : RANGE;
  current = makeSlab(stack.length, x, top.width);
}

function restart(): void {
  for (const s of stack) disposeMesh(s.mesh);
  for (const f of fallers) disposeMesh(f.mesh);
  if (current) disposeMesh(current.mesh);
  stack = [];
  fallers = [];
  current = null;
  status = 'playing';
  score = 0;
  stack.push(makeSlab(0, 0, BASE_W));
  spawnSlider();
  camTargetY = SLAB_H;
  publish();
}

function addFaller(level: number, x: number, width: number, outward: number): void {
  const mat = new THREE.MeshLambertMaterial({ color: levelColor(level) });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.scale.set(width, SLAB_H, SLAB_D);
  mesh.position.set(x, level * SLAB_H + SLAB_H / 2, 0);
  scene.add(mesh);
  fallers.push({
    mesh,
    vel: new THREE.Vector3(outward * 1.5, 1, 0),
    spin: new THREE.Vector3(0, 0, -outward * 2),
  });
}

function drop(): void {
  if (status !== 'playing' || !current) return;
  const top = stack[stack.length - 1];
  const level = stack.length;
  const cur = current;
  const curL = cur.x - cur.width / 2;
  const curR = cur.x + cur.width / 2;
  const topL = top.x - top.width / 2;
  const topR = top.x + top.width / 2;
  const lo = Math.max(curL, topL);
  const hi = Math.min(curR, topR);
  const overlap = hi - lo;

  if (overlap <= 0) {
    // complete miss: the whole slab falls away
    const outward = cur.x >= top.x ? 1 : -1;
    addFaller(level, cur.x, cur.width, outward);
    disposeMesh(cur.mesh);
    current = null;
    status = 'lost';
    best = Math.max(best, score);
    publish();
    return;
  }

  let newX: number;
  let newW: number;
  if (Math.abs(cur.x - top.x) <= PERFECT_TOL) {
    newX = top.x;
    newW = top.width;
    score += 1 + BONUS;
    perfectFlash = 0.4;
  } else {
    newX = (lo + hi) / 2;
    newW = overlap;
    score += 1;
    // cut-off part
    if (curR > topR) {
      const w = curR - topR;
      addFaller(level, topR + w / 2, w, 1);
    } else if (curL < topL) {
      const w = topL - curL;
      addFaller(level, topL + -w / 2 - 0, w, -1);
    }
  }

  disposeMesh(cur.mesh);
  stack.push(makeSlab(level, newX, newW));
  current = null;
  camTargetY = (level + 1) * SLAB_H;

  if (stack.length - 1 >= WIN_HEIGHT) {
    status = 'won';
    best = Math.max(best, score);
  } else {
    spawnSlider();
  }
  best = Math.max(best, score);
  publish();
}

function onAction(): void {
  if (status === 'playing') drop();
  else restart();
}

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (e.repeat) return;
    if (status === 'playing') drop();
  } else if (e.code === 'KeyR') {
    restart();
  }
});
canvas.addEventListener('pointerdown', (e: PointerEvent) => {
  e.preventDefault();
  onAction();
});

function update(dt: number): void {
  if (status === 'playing' && current) {
    const speed = speedFor(stack.length - 1);
    current.x += dir * speed * dt;
    if (current.x > RANGE) {
      current.x = RANGE - (current.x - RANGE);
      dir = -1;
    } else if (current.x < -RANGE) {
      current.x = -RANGE + (-RANGE - current.x);
      dir = 1;
    }
    current.mesh.position.x = current.x;
  }

  for (let i = fallers.length - 1; i >= 0; i--) {
    const f = fallers[i];
    f.vel.y -= 25 * dt;
    f.mesh.position.addScaledVector(f.vel, dt);
    f.mesh.rotation.x += f.spin.x * dt;
    f.mesh.rotation.y += f.spin.y * dt;
    f.mesh.rotation.z += f.spin.z * dt;
    if (f.mesh.position.y < camY - 25) {
      disposeMesh(f.mesh);
      fallers.splice(i, 1);
    }
  }

  camY += (camTargetY - camY) * Math.min(1, dt * 4);
  camera.position.set(7, camY + 6, 10);
  camera.lookAt(0, camY - 0.5, 0);

  perfectFlash = Math.max(0, perfectFlash - dt);
  const level = Math.max(0, stack.length - 1);
  const bg = new THREE.Color().setHSL(((level * 12 + 200) % 360) / 360, 0.35, 0.18 + (perfectFlash > 0 ? 0.08 : 0));
  scene.background = bg;
}

restart();

let last = performance.now();
let first = true;
function frame(now: number): void {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  update(dt);
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__TASK_READY__ = true;
  }
  requestAnimationFrame(frame);
}
window.__TASK_READY__ = false;
requestAnimationFrame(frame);
