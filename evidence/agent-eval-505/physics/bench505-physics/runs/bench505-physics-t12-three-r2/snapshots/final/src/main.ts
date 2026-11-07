import * as THREE from 'three';

type Phase = 'ready' | 'dropping' | 'settled';
interface TaskState {
  phase: Phase;
  spawned: number;
  bins: number[];
  total: number;
}
declare global {
  interface Window {
    __TASK_STATE__: TaskState;
    __EVAL_READY__?: boolean;
  }
}

// ---------- constants ----------
const BOARD_W = 8;
const HALF_W = BOARD_W / 2;
const BOARD_H = 12;
const NUM_BINS = 7;
const BIN_W = BOARD_W / NUM_BINS;
const BIN_TOP = 2.0; // dividers go from y=0 to BIN_TOP
const DIV_R = 0.04;
const PEG_R = 0.12;
const BALL_R = 0.15;
const ROWS = 10;
const ROW_DY = 0.8;
const ROW_Y0 = 10.5;
const BALL_COUNT = 20;
const SPAWN_INTERVAL = 0.25;
const SPAWN_Y = 11.4;
const GRAVITY = -20;
const RESTITUTION = 0.4;
const DT = 1 / 240;
const MAX_FRAME = 0.25;
const DEPTH = 0.6;

// ---------- renderer / scene ----------
const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10131c);

const camera = new THREE.PerspectiveCamera(35, 640 / 360, 0.1, 100);
camera.position.set(0, 5.2, 24);
camera.lookAt(0, 5.2, 0);

scene.add(new THREE.HemisphereLight(0x8899bb, 0x222233, 0.7));

const key = new THREE.DirectionalLight(0xfff2dd, 2.6);
key.position.set(-6, 12, 14);
key.target.position.set(0, 5, 0);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -9;
key.shadow.camera.right = 9;
key.shadow.camera.top = 10;
key.shadow.camera.bottom = -4;
key.shadow.camera.near = 1;
key.shadow.camera.far = 40;
key.shadow.bias = -0.0005;
scene.add(key, key.target);

const rim = new THREE.DirectionalLight(0x66aaff, 2.2);
rim.position.set(7, 9, -10);
rim.target.position.set(0, 5, 0);
scene.add(rim, rim.target);

// ---------- materials ----------
const matPeg = new THREE.MeshStandardMaterial({ color: 0xd8dde6, metalness: 0.9, roughness: 0.25 });
const matBack = new THREE.MeshStandardMaterial({ color: 0x1f2a44, roughness: 0.9 });
const matFrame = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.7 });
const matBinFloor = new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.6 });
const matDivider = new THREE.MeshStandardMaterial({ color: 0xe9a23b, metalness: 0.3, roughness: 0.45 });
const matGlass = new THREE.MeshPhysicalMaterial({
  color: 0xaad4ff,
  transparent: true,
  opacity: 0.08,
  roughness: 0.05,
  depthWrite: false,
});

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  scene.add(m);
  return m;
}

// back panel
box(BOARD_W + 0.6, BOARD_H + BIN_TOP * 0 + 0.6, 0.2, matBack, 0, BOARD_H / 2, -DEPTH / 2 - 0.1, false);
// side walls (full height, covering bins too)
box(0.3, BOARD_H + 0.3, DEPTH, matFrame, -HALF_W - 0.15, BOARD_H / 2, 0);
box(0.3, BOARD_H + 0.3, DEPTH, matFrame, HALF_W + 0.15, BOARD_H / 2, 0);
// top
box(BOARD_W + 0.6, 0.3, DEPTH, matFrame, 0, BOARD_H + 0.15, 0);
// bin floor
box(BOARD_W, 0.3, DEPTH, matBinFloor, 0, -0.15, 0);
// transparent front
{
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, BOARD_H), matGlass);
  glass.position.set(0, BOARD_H / 2, DEPTH / 2);
  scene.add(glass);
}

// dividers
const dividerXs: number[] = [];
for (let k = 1; k < NUM_BINS; k++) {
  const x = -HALF_W + k * BIN_W;
  dividerXs.push(x);
  box(DIV_R * 2, BIN_TOP, DEPTH, matDivider, x, BIN_TOP / 2, 0);
}

// pegs
interface Peg { x: number; y: number }
const pegs: Peg[] = [];
for (let r = 0; r < ROWS; r++) {
  const y = ROW_Y0 - r * ROW_DY;
  if (r % 2 === 0) {
    for (let k = 0; k < 6; k++) pegs.push({ x: -HALF_W + BIN_W * (k + 1), y });
  } else {
    for (let k = 0; k < 7; k++) pegs.push({ x: -HALF_W + BIN_W * (k + 0.5), y });
  }
}
{
  const geo = new THREE.CylinderGeometry(PEG_R, PEG_R, DEPTH, 20);
  geo.rotateX(Math.PI / 2);
  for (const p of pegs) {
    const m = new THREE.Mesh(geo, matPeg);
    m.position.set(p.x, p.y, 0);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }
}

// ---------- labels ----------
const labelCanvases: HTMLCanvasElement[] = [];
const labelTextures: THREE.CanvasTexture[] = [];
function drawLabel(i: number, count: number): void {
  const c = labelCanvases[i];
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgba(10,14,24,0.85)';
  g.fillRect(8, 8, c.width - 16, c.height - 16);
  g.strokeStyle = '#e9a23b';
  g.lineWidth = 6;
  g.strokeRect(8, 8, c.width - 16, c.height - 16);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffffff';
  g.font = 'bold 110px system-ui, sans-serif';
  g.fillText(String(i + 1), c.width / 2, 78);
  g.fillStyle = '#7dffb0';
  g.font = 'bold 90px system-ui, sans-serif';
  g.fillText(String(count), c.width / 2, 185);
  labelTextures[i].needsUpdate = true;
}
for (let i = 0; i < NUM_BINS; i++) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  labelCanvases.push(c);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  labelTextures.push(tex);
  drawLabel(i, 0);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  spr.scale.set(1.05, 1.05, 1);
  spr.position.set(-HALF_W + BIN_W * (i + 0.5), -1.0, 0.5);
  scene.add(spr);
}

// ---------- balls ----------
interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean;
  rest: boolean;
  contact: boolean;
  mesh: THREE.Mesh;
}
const balls: Ball[] = [];
{
  const geo = new THREE.SphereGeometry(BALL_R, 24, 16);
  for (let i = 0; i < BALL_COUNT; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL((i * 0.083) % 1, 0.85, 0.55),
      metalness: 0.1,
      roughness: 0.25,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.visible = false;
    scene.add(mesh);
    balls.push({ x: 0, y: 0, vx: 0, vy: 0, active: false, rest: false, contact: false, mesh });
  }
}

// ---------- physics ----------
let spawned = 0;
let simTime = 0;
let dropping = false;

function spawnBall(i: number): void {
  const b = balls[i];
  const offset = ((i * 37) % 11 - 5) * 0.02;
  b.x = offset;
  b.y = SPAWN_Y;
  // small deterministic, never-zero sideways velocity so no ball balances on a peg
  b.vx = (((i * 13) % 7) - 3) * 0.04 + 0.013;
  b.vy = 0;
  b.active = true;
  b.rest = false;
  b.contact = false;
  b.mesh.visible = true;
}

function collidePoint(b: Ball, px: number, py: number, pr: number, bias: boolean): void {
  const dx = b.x - px;
  const dy = b.y - py;
  const rr = BALL_R + pr;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return;
  const d = Math.sqrt(d2);
  let nx = 0;
  let ny = 1;
  if (d > 1e-9) {
    nx = dx / d;
    ny = dy / d;
  }
  const overlap = rr - d;
  b.x += nx * overlap;
  b.y += ny * overlap;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    b.vx -= (1 + RESTITUTION) * vn * nx;
    b.vy -= (1 + RESTITUTION) * vn * ny;
  }
  if (bias && Math.abs(nx) < 0.02 && ny > 0.9) {
    // balanced on top of a peg: nudge sideways, direction fixed by position parity
    b.vx += (b.y * 1000) % 2 < 1 ? 0.15 : -0.15;
  }
  b.contact = true;
}

function step(dt: number): void {
  // spawn
  if (dropping) {
    while (spawned < BALL_COUNT && simTime >= spawned * SPAWN_INTERVAL - 1e-9) {
      spawnBall(spawned);
      spawned++;
    }
  }
  simTime += dt;

  for (const b of balls) {
    if (!b.active) continue;
    b.contact = false;
    b.vy += GRAVITY * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }

  // ball vs ball
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (!a.active) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const c = balls[j];
      if (!c.active) continue;
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const rr = BALL_R * 2;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2);
      let nx = 1;
      let ny = 0;
      if (d > 1e-9) {
        nx = dx / d;
        ny = dy / d;
      }
      const half = (rr - d) / 2;
      a.x -= nx * half;
      a.y -= ny * half;
      c.x += nx * half;
      c.y += ny * half;
      const vn = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
      if (vn < 0) {
        const j2 = (-(1 + RESTITUTION) * vn) / 2;
        a.vx -= j2 * nx;
        a.vy -= j2 * ny;
        c.vx += j2 * nx;
        c.vy += j2 * ny;
      }
      a.contact = true;
      c.contact = true;
    }
  }

  for (const b of balls) {
    if (!b.active) continue;
    for (const p of pegs) {
      if (Math.abs(b.x - p.x) < 0.5 && Math.abs(b.y - p.y) < 0.5) collidePoint(b, p.x, p.y, PEG_R, true);
    }
    for (const dx of dividerXs) {
      if (Math.abs(b.x - dx) < 0.5 && b.y < BIN_TOP + 0.5) {
        const cy = Math.min(Math.max(b.y, 0), BIN_TOP);
        collidePoint(b, dx, cy, DIV_R, false);
      }
    }
    // walls
    if (b.x < -HALF_W + BALL_R) {
      b.x = -HALF_W + BALL_R;
      if (b.vx < 0) b.vx = -b.vx * RESTITUTION;
      b.contact = true;
    } else if (b.x > HALF_W - BALL_R) {
      b.x = HALF_W - BALL_R;
      if (b.vx > 0) b.vx = -b.vx * RESTITUTION;
      b.contact = true;
    }
    // floor
    if (b.y < BALL_R) {
      b.y = BALL_R;
      if (b.vy < 0) b.vy = -b.vy * RESTITUTION;
      b.contact = true;
    }
    // resting inside a bin: damp and sleep
    if (b.y < BIN_TOP) {
      const sp = Math.hypot(b.vx, b.vy);
      if (b.contact) {
        b.vx *= 0.995;
        if (sp < 0.4) {
          b.vx = 0;
          b.vy = 0;
          b.rest = true;
        } else {
          b.rest = false;
        }
      } else {
        b.rest = false;
      }
    } else {
      b.rest = false;
    }
  }
}

// ---------- state ----------
const state: TaskState = { phase: 'ready', spawned: 0, bins: [0, 0, 0, 0, 0, 0, 0], total: 0 };
Object.defineProperty(window, '__TASK_STATE__', {
  get: () => state,
  enumerable: true,
  configurable: false,
});
const lastCounts: number[] = [0, 0, 0, 0, 0, 0, 0];

function updateState(): void {
  const bins = [0, 0, 0, 0, 0, 0, 0];
  let allRest = true;
  let any = false;
  for (const b of balls) {
    if (!b.active) continue;
    any = true;
    if (b.y < BIN_TOP) {
      const idx = Math.min(NUM_BINS - 1, Math.max(0, Math.floor((b.x + HALF_W) / BIN_W)));
      bins[idx]++;
      if (!b.rest) allRest = false;
    } else {
      allRest = false;
    }
  }
  let total = 0;
  for (let i = 0; i < NUM_BINS; i++) {
    state.bins[i] = bins[i];
    total += bins[i];
    if (lastCounts[i] !== bins[i]) {
      lastCounts[i] = bins[i];
      drawLabel(i, bins[i]);
    }
  }
  state.total = total;
  state.spawned = spawned;
  if (!dropping && !any) state.phase = 'ready';
  else if (spawned >= BALL_COUNT && allRest && total === BALL_COUNT) {
    state.phase = 'settled';
    dropping = false;
  } else state.phase = 'dropping';
}

function resetAll(): void {
  for (const b of balls) {
    b.active = false;
    b.rest = false;
    b.mesh.visible = false;
  }
  spawned = 0;
  simTime = 0;
  dropping = false;
  updateState();
}

function startDrop(): void {
  if (state.phase === 'dropping') return;
  resetAll();
  dropping = true;
  updateState();
}

// ---------- UI ----------
const ui = document.createElement('div');
ui.style.cssText = 'position:fixed;left:8px;top:8px;display:flex;flex-direction:column;gap:6px;z-index:10';
function makeButton(text: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.style.cssText =
    'padding:6px 10px;font:600 13px system-ui,sans-serif;border:1px solid #e9a23b;border-radius:4px;background:#2a3350;color:#fff;cursor:pointer';
  btn.addEventListener('click', onClick);
  ui.appendChild(btn);
  return btn;
}
const dropBtn = makeButton('Drop 20 Balls', startDrop);
dropBtn.id = 'drop';
const resetBtn = makeButton('Reset', resetAll);
resetBtn.id = 'reset';
document.body.appendChild(ui);

// ---------- loop ----------
let acc = 0;
let last = performance.now();
let firstFrame = true;

function frame(now: number): void {
  const dt = Math.min(MAX_FRAME, (now - last) / 1000);
  last = now;
  acc += dt;
  while (acc >= DT) {
    // dropping flag may clear mid-frame once settled; physics still runs for active balls
    step(DT);
    acc -= DT;
  }
  for (const b of balls) {
    if (b.active) b.mesh.position.set(b.x, b.y, 0);
  }
  updateState();
  renderer.render(scene, camera);
  if (firstFrame) {
    firstFrame = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
updateState();
requestAnimationFrame(frame);
