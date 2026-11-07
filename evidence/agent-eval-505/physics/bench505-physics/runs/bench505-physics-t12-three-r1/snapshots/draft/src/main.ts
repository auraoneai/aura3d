import * as THREE from 'three';

// ---------- constants ----------
const BOARD_W = 8;
const BOARD_TOP = 12;
const FLOOR_Y = -2.2;
const DIVIDER_TOP = 1.2;
const BIN_COUNT = 7;
const BIN_W = BOARD_W / BIN_COUNT;
const HALF_W = BOARD_W / 2;
const BALL_R = 0.15;
const PEG_R = 0.09;
const DIVIDER_R = 0.04;
const BALL_COUNT = 20;
const SPAWN_INTERVAL = 0.25;
const SPAWN_Y = 11.6;
const GRAVITY = -12;
const RESTITUTION = 0.4;
const DT = 1 / 240;
const MAX_STEPS_PER_FRAME = 48;
const DEPTH = 0.45;
const BIN_COUNT_Y = 0.5; // balls below this height are inside a bin

// ---------- state ----------
type Phase = 'ready' | 'dropping' | 'settled';
interface TaskState {
  phase: Phase;
  spawned: number;
  bins: number[];
  total: number;
}
const state: TaskState = { phase: 'ready', spawned: 0, bins: [0, 0, 0, 0, 0, 0, 0], total: 0 };
Object.defineProperty(window, '__TASK_STATE__', {
  get: () => state,
  configurable: false,
  enumerable: true,
});
declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// ---------- renderer / scene ----------
const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.setClearColor(0x0d1020);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 640 / 360, 0.1, 100);
camera.position.set(0, 4.4, 22.5);
camera.lookAt(0, 4.4, 0);

scene.add(new THREE.HemisphereLight(0x8899cc, 0x221a2a, 0.55));
const key = new THREE.DirectionalLight(0xfff1dd, 2.4);
key.position.set(-6, 14, 14);
scene.add(key);
const rim = new THREE.DirectionalLight(0x55aaff, 2.2);
rim.position.set(7, 8, -10);
scene.add(rim);
const fill = new THREE.PointLight(0xffaa66, 60, 40);
fill.position.set(6, 2, 8);
scene.add(fill);

// materials
const pegMat = new THREE.MeshStandardMaterial({ color: 0xcfd6e0, metalness: 0.7, roughness: 0.3 });
const ballMat = new THREE.MeshStandardMaterial({ color: 0xff4a2e, metalness: 0.1, roughness: 0.25 });
const binMat = new THREE.MeshStandardMaterial({ color: 0x2a6f5c, metalness: 0.2, roughness: 0.6 });
const dividerMat = new THREE.MeshStandardMaterial({ color: 0xe8b84a, metalness: 0.3, roughness: 0.45 });
const wallMat = new THREE.MeshStandardMaterial({ color: 0x5a4a86, metalness: 0.2, roughness: 0.5 });
const backMat = new THREE.MeshStandardMaterial({ color: 0x1b2038, metalness: 0.0, roughness: 0.9 });
const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xaaccff,
  transparent: true,
  opacity: 0.08,
  roughness: 0.05,
  metalness: 0,
  depthWrite: false,
});

const boardGroup = new THREE.Group();
scene.add(boardGroup);

function addBox(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  boardGroup.add(m);
  return m;
}

const fullH = BOARD_TOP - FLOOR_Y;
const midY = (BOARD_TOP + FLOOR_Y) / 2;
// back panel
addBox(BOARD_W + 0.4, fullH, 0.1, 0, midY, -DEPTH / 2 - 0.05, backMat);
// side walls
addBox(0.2, fullH, DEPTH, -HALF_W - 0.1, midY, 0, wallMat);
addBox(0.2, fullH, DEPTH, HALF_W + 0.1, midY, 0, wallMat);
// top cap
addBox(BOARD_W + 0.4, 0.2, DEPTH, 0, BOARD_TOP + 0.1, 0, wallMat);
// floor of the bins
addBox(BOARD_W, 0.2, DEPTH, 0, FLOOR_Y - 0.1, 0, binMat);
// bin back tint
addBox(BOARD_W, DIVIDER_TOP - FLOOR_Y, 0.02, 0, (DIVIDER_TOP + FLOOR_Y) / 2, -DEPTH / 2 + 0.02, binMat);
// transparent front
const glass = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, fullH), glassMat);
glass.position.set(0, midY, DEPTH / 2);
boardGroup.add(glass);

// dividers
interface Seg { x: number }
const dividers: Seg[] = [];
for (let k = 1; k < BIN_COUNT; k++) {
  const x = -HALF_W + k * BIN_W;
  dividers.push({ x });
  const h = DIVIDER_TOP - FLOOR_Y;
  addBox(DIVIDER_R * 2, h, DEPTH, x, FLOOR_Y + h / 2, 0, dividerMat);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(DIVIDER_R, DIVIDER_R, DEPTH, 16), dividerMat);
  cap.rotation.x = Math.PI / 2;
  cap.position.set(x, DIVIDER_TOP, 0);
  boardGroup.add(cap);
}

// pegs: alternating 6 and 7 per row, 9 rows
interface Peg { x: number; y: number }
const pegs: Peg[] = [];
const ROWS = 9;
const pegGeo = new THREE.CylinderGeometry(PEG_R, PEG_R, DEPTH, 20);
for (let r = 0; r < ROWS; r++) {
  const y = 10.6 - r * 1.0;
  const six = r % 2 === 0;
  const n = six ? 6 : 7;
  for (let c = 0; c < n; c++) {
    const x = six ? -HALF_W + (c + 1) * BIN_W : -HALF_W + (c + 0.5) * BIN_W;
    pegs.push({ x, y });
    const m = new THREE.Mesh(pegGeo, pegMat);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, 0);
    boardGroup.add(m);
  }
}

// bin labels (number + live count)
interface Label { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; shown: number }
const labels: Label[] = [];
function drawLabel(l: Label, idx: number, count: number): void {
  const c = l.ctx;
  c.clearRect(0, 0, 256, 256);
  c.fillStyle = 'rgba(20,26,50,0.9)';
  c.fillRect(8, 8, 240, 240);
  c.strokeStyle = '#e8b84a';
  c.lineWidth = 6;
  c.strokeRect(8, 8, 240, 240);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = '#ffffff';
  c.font = 'bold 120px sans-serif';
  c.fillText(String(idx + 1), 128, 85);
  c.fillStyle = '#ff7a5c';
  c.font = 'bold 90px sans-serif';
  c.fillText(String(count), 128, 190);
  l.tex.needsUpdate = true;
  l.shown = count;
}
for (let i = 0; i < BIN_COUNT; i++) {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 256;
  const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const l: Label = { ctx, tex, shown: -1 };
  drawLabel(l, i, 0);
  labels.push(l);
  const size = BIN_W * 0.82;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
  );
  mesh.position.set(-HALF_W + (i + 0.5) * BIN_W, FLOOR_Y - 0.2 - size / 2 - 0.05, DEPTH / 2);
  scene.add(mesh);
}

// ---------- physics ----------
interface Ball {
  x: number; y: number; vx: number; vy: number;
  mesh: THREE.Mesh; slow: number; index: number;
}
const balls: Ball[] = [];
const ballGeo = new THREE.SphereGeometry(BALL_R, 24, 16);

let simTime = 0;
let dropping = false;
let spawned = 0;

function spawnBall(i: number): void {
  const offset = (((i * 37) % 11) - 5) * 0.02;
  const mesh = new THREE.Mesh(ballGeo, ballMat);
  scene.add(mesh);
  const b: Ball = { x: offset, y: SPAWN_Y, vx: 0, vy: 0, mesh, slow: 0, index: i };
  mesh.position.set(b.x, b.y, 0);
  balls.push(b);
  spawned++;
}

function collideStatic(b: Ball, cx: number, cy: number, rad: number): void {
  const dx = b.x - cx;
  const dy = b.y - cy;
  const rr = BALL_R + rad;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr || d2 === 0) return;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;
  b.x = cx + nx * rr;
  b.y = cy + ny * rr;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    const e = -vn < 0.4 ? 0 : RESTITUTION;
    b.vx -= (1 + e) * vn * nx;
    b.vy -= (1 + e) * vn * ny;
    // light tangential friction
    const tx = -ny;
    const ty = nx;
    const vt = b.vx * tx + b.vy * ty;
    b.vx -= vt * 0.01 * tx;
    b.vy -= vt * 0.01 * ty;
  }
}

function step(): void {
  // spawn on schedule (simulated time)
  while (dropping && spawned < BALL_COUNT && simTime >= spawned * SPAWN_INTERVAL - 1e-9) {
    spawnBall(spawned);
  }

  for (const b of balls) {
    b.vy += GRAVITY * DT;
    b.x += b.vx * DT;
    b.y += b.vy * DT;

    // pegs (only ones near)
    for (const p of pegs) {
      if (Math.abs(p.y - b.y) < 0.5 && Math.abs(p.x - b.x) < 0.5) collideStatic(b, p.x, p.y, PEG_R);
    }
    // dividers (vertical capsules)
    if (b.y < DIVIDER_TOP + 0.5) {
      for (const dv of dividers) {
        if (Math.abs(dv.x - b.x) > 0.5) continue;
        const cy = Math.min(Math.max(b.y, FLOOR_Y), DIVIDER_TOP);
        collideStatic(b, dv.x, cy, DIVIDER_R);
      }
    }
    // side walls
    const maxX = HALF_W - BALL_R;
    if (b.x > maxX) {
      b.x = maxX;
      if (b.vx > 0) b.vx = b.vx < 0.4 ? 0 : -b.vx * RESTITUTION;
    } else if (b.x < -maxX) {
      b.x = -maxX;
      if (b.vx < 0) b.vx = b.vx > -0.4 ? 0 : -b.vx * RESTITUTION;
    }
    // floor
    const minY = FLOOR_Y + BALL_R;
    if (b.y < minY) {
      b.y = minY;
      if (b.vy < 0) b.vy = b.vy > -0.6 ? 0 : -b.vy * RESTITUTION;
      b.vx *= 0.995;
    }
  }

  // ball-ball
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    for (let j = i + 1; j < balls.length; j++) {
      const c = balls[j];
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const rr = BALL_R * 2;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      let nx: number, ny: number, d: number;
      if (d2 < 1e-12) {
        nx = 1; ny = 0; d = 0;
      } else {
        d = Math.sqrt(d2);
        nx = dx / d;
        ny = dy / d;
      }
      const push = (rr - d) / 2;
      a.x -= nx * push; a.y -= ny * push;
      c.x += nx * push; c.y += ny * push;
      const vn = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
      if (vn < 0) {
        const e = -vn < 0.4 ? 0 : RESTITUTION;
        const j2 = (-(1 + e) * vn) / 2;
        a.vx -= j2 * nx; a.vy -= j2 * ny;
        c.vx += j2 * nx; c.vy += j2 * ny;
      }
    }
  }

  // anti-stall: nudge balls that sit still outside the bins
  for (const b of balls) {
    if (b.y > BIN_COUNT_Y && Math.abs(b.vx) + Math.abs(b.vy) < 0.05) {
      b.slow += DT;
      if (b.slow > 0.75) {
        b.vx += (b.index % 2 === 0 ? 1 : -1) * 0.8;
        b.slow = 0;
      }
    } else {
      b.slow = 0;
    }
  }

  simTime += DT;
}

function updateState(): void {
  const bins = [0, 0, 0, 0, 0, 0, 0];
  let moving = false;
  for (const b of balls) {
    if (b.y < BIN_COUNT_Y) {
      const k = Math.min(BIN_COUNT - 1, Math.max(0, Math.floor((b.x + HALF_W) / BIN_W)));
      bins[k]++;
      if (Math.abs(b.vx) + Math.abs(b.vy) > 0.1) moving = true;
    } else {
      moving = true;
    }
  }
  for (let i = 0; i < BIN_COUNT; i++) state.bins[i] = bins[i];
  state.total = bins.reduce((s, v) => s + v, 0);
  state.spawned = spawned;
  if (!dropping && spawned === 0) state.phase = 'ready';
  else if (spawned < BALL_COUNT || moving) state.phase = 'dropping';
  else state.phase = 'settled';
  for (let i = 0; i < BIN_COUNT; i++) {
    if (labels[i].shown !== bins[i]) drawLabel(labels[i], i, bins[i]);
  }
}

function reset(): void {
  for (const b of balls) scene.remove(b.mesh);
  balls.length = 0;
  spawned = 0;
  simTime = 0;
  dropping = false;
  updateState();
}

function startDrop(): void {
  if (dropping && state.phase === 'dropping') return;
  if (spawned > 0) reset();
  dropping = true;
  simTime = 0;
}

// ---------- UI ----------
const ui = document.createElement('div');
ui.style.cssText = 'position:absolute;left:8px;top:8px;display:flex;flex-direction:column;gap:6px;';
function makeButton(id: string, text: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.id = id;
  btn.textContent = text;
  btn.style.cssText =
    'font:600 13px system-ui,sans-serif;padding:6px 10px;border:1px solid #e8b84a;background:#232a4a;color:#fff;border-radius:4px;cursor:pointer;';
  btn.addEventListener('click', onClick);
  ui.appendChild(btn);
  return btn;
}
makeButton('drop', 'Drop 20 Balls', startDrop);
makeButton('reset', 'Reset', reset);
document.body.appendChild(ui);

// ---------- loop ----------
let last = performance.now();
let acc = 0;
let firstFrame = true;
function frame(now: number): void {
  const elapsed = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += elapsed;
  let steps = 0;
  while (acc >= DT && steps < MAX_STEPS_PER_FRAME) {
    step();
    acc -= DT;
    steps++;
  }
  if (acc > DT * MAX_STEPS_PER_FRAME) acc = 0;

  for (const b of balls) b.mesh.position.set(b.x, b.y, 0);
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
