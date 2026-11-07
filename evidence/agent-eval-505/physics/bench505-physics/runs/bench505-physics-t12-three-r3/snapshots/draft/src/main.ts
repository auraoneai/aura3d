import * as THREE from 'three';

// ---------- constants ----------
const BOARD_W = 8;
const HALF_W = BOARD_W / 2;
const BOARD_BOTTOM = 2; // top of the dividers / bottom of the pegboard
const BOARD_TOP = 14; // board is 12 tall
const BINS = 7;
const BIN_W = BOARD_W / BINS;
const ROWS = 12;
const ROW_SPACING = 0.8;
const FIRST_ROW_Y = 12.2;
const PEG_R = 0.1;
const BALL_R = 0.18;
const DIVIDER_R = 0.04;
const GRAVITY = 9.81;
const RESTITUTION = 0.4;
const FIXED_DT = 1 / 120;
const ITERATIONS = 4;
const BALLS_PER_DROP = 20;
const SPAWN_INTERVAL = 0.25;
const SPAWN_Y = 13.5;

// ---------- physics ----------
interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  id: number;
  mesh: THREE.Mesh;
}

interface StaticSeg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  r: number;
}

const statics: StaticSeg[] = [];
const pegPositions: { x: number; y: number }[] = [];

for (let row = 0; row < ROWS; row++) {
  const y = FIRST_ROW_Y - row * ROW_SPACING;
  const seven = row % 2 === 1;
  const n = seven ? 7 : 6;
  for (let k = 0; k < n; k++) {
    const x = seven ? -HALF_W + (k + 0.5) * BIN_W : -HALF_W + (k + 1) * BIN_W;
    pegPositions.push({ x, y });
    statics.push({ ax: x, ay: y, bx: x, by: y, r: PEG_R });
  }
}
const dividerXs: number[] = [];
for (let k = 1; k < BINS; k++) {
  const x = -HALF_W + k * BIN_W;
  dividerXs.push(x);
  statics.push({ ax: x, ay: 0, bx: x, by: BOARD_BOTTOM, r: DIVIDER_R });
}

let balls: Ball[] = [];

function collideStatic(b: Ball, s: StaticSeg): void {
  const abx = s.bx - s.ax;
  const aby = s.by - s.ay;
  const len2 = abx * abx + aby * aby;
  let t = 0;
  if (len2 > 0) {
    t = ((b.x - s.ax) * abx + (b.y - s.ay) * aby) / len2;
    t = Math.max(0, Math.min(1, t));
  }
  const qx = s.ax + abx * t;
  const qy = s.ay + aby * t;
  let dx = b.x - qx;
  let dy = b.y - qy;
  const minD = BALL_R + s.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minD * minD) return;
  let d = Math.sqrt(d2);
  if (d < 1e-9) {
    dx = 0;
    dy = 1;
    d = 1;
  }
  let nx = dx / d;
  const ny = dy / d;
  // Break perfect symmetry so a ball can never balance on a peg top.
  if (Math.abs(nx) < 1e-3 && ny > 0.99) {
    nx = b.id % 2 === 0 ? 1e-3 : -1e-3;
  }
  const nl = Math.hypot(nx, ny);
  nx /= nl;
  const ny2 = ny / nl;
  b.x = qx + nx * minD;
  b.y = qy + ny2 * minD;
  const vn = b.vx * nx + b.vy * ny2;
  if (vn < 0) {
    const e = vn < -1 ? RESTITUTION : 0;
    b.vx -= (1 + e) * vn * nx;
    b.vy -= (1 + e) * vn * ny2;
  }
}

function collideBounds(b: Ball): void {
  const lim = HALF_W - BALL_R;
  if (b.x > lim) {
    b.x = lim;
    if (b.vx > 0) b.vx = b.vx > 1 ? -RESTITUTION * b.vx : 0;
  } else if (b.x < -lim) {
    b.x = -lim;
    if (b.vx < 0) b.vx = b.vx < -1 ? -RESTITUTION * b.vx : 0;
    // (mirrors the right wall)
  }
  if (b.y < BALL_R) {
    b.y = BALL_R;
    if (b.vy < 0) b.vy = b.vy < -1 ? -RESTITUTION * b.vy : 0;
  }
}

function collideBalls(a: Ball, b: Ball): void {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  const minD = BALL_R * 2;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minD * minD) return;
  let d = Math.sqrt(d2);
  if (d < 1e-9) {
    dx = a.id < b.id ? 1e-3 : -1e-3;
    dy = 0;
    d = 1e-3;
  }
  const nx = dx / d;
  const ny = dy / d;
  const overlap = minD - d;
  a.x -= nx * overlap * 0.5;
  a.y -= ny * overlap * 0.5;
  b.x += nx * overlap * 0.5;
  b.y += ny * overlap * 0.5;
  const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rvn < 0) {
    const e = rvn < -1 ? RESTITUTION : 0;
    const j = (-(1 + e) * rvn) / 2;
    a.vx -= j * nx;
    a.vy -= j * ny;
    b.vx += j * nx;
    b.vy += j * ny;
  }
}

function physicsStep(dt: number): void {
  for (const b of balls) {
    b.vy -= GRAVITY * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }
  for (let it = 0; it < ITERATIONS; it++) {
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) collideBalls(balls[i], balls[j]);
    }
    for (const b of balls) {
      // only test statics near the ball (cheap broad phase)
      for (const s of statics) {
        const minY = Math.min(s.ay, s.by) - 0.6;
        const maxY = Math.max(s.ay, s.by) + 0.6;
        if (b.y < minY || b.y > maxY) continue;
        collideStatic(b, s);
      }
      collideBounds(b);
    }
  }
}

// ---------- rendering setup ----------
const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.setClearColor(0x0b0f1a);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f1a);

const camera = new THREE.PerspectiveCamera(40, 640 / 360, 0.1, 100);
const camCenterY = 6.1;
camera.position.set(0, camCenterY, 23);
camera.lookAt(0, camCenterY, 0);

scene.add(new THREE.HemisphereLight(0xaab8ff, 0x202030, 0.7));
const keyLight = new THREE.DirectionalLight(0xfff1dd, 2.6);
keyLight.position.set(5, 12, 14);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x5fa8ff, 2.4);
rimLight.position.set(-8, 9, -9);
scene.add(rimLight);

// board back panel
const backMat = new THREE.MeshStandardMaterial({ color: 0x16224a, roughness: 0.8, metalness: 0.1 });
const back = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W + 0.6, BOARD_TOP, 0.1), backMat);
back.position.set(0, BOARD_TOP / 2, -0.35);
scene.add(back);

// side walls
const wallMat = new THREE.MeshStandardMaterial({ color: 0x8a94a8, roughness: 0.4, metalness: 0.6 });
for (const sx of [-1, 1]) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.3, BOARD_TOP, 0.7), wallMat);
  wall.position.set(sx * (HALF_W + 0.15), BOARD_TOP / 2, 0);
  scene.add(wall);
}
// top beam
const beam = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W + 0.6, 0.3, 0.7), wallMat);
beam.position.set(0, BOARD_TOP + 0.15, 0);
scene.add(beam);
// base
const base = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W + 0.6, 0.3, 0.7), wallMat);
base.position.set(0, -0.15, 0);
scene.add(base);

// transparent front glass
const glass = new THREE.Mesh(
  new THREE.PlaneGeometry(BOARD_W, BOARD_TOP),
  new THREE.MeshStandardMaterial({
    color: 0x99ccff,
    transparent: true,
    opacity: 0.07,
    roughness: 0.1,
    metalness: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
);
glass.position.set(0, BOARD_TOP / 2, 0.33);
scene.add(glass);

// pegs
const pegMat = new THREE.MeshStandardMaterial({ color: 0xe8edf5, roughness: 0.25, metalness: 0.7 });
const pegGeo = new THREE.CylinderGeometry(PEG_R, PEG_R, 0.5, 20);
pegGeo.rotateX(Math.PI / 2);
const pegs = new THREE.InstancedMesh(pegGeo, pegMat, pegPositions.length);
const m4 = new THREE.Matrix4();
pegPositions.forEach((p, i) => {
  m4.makeTranslation(p.x, p.y, 0);
  pegs.setMatrixAt(i, m4);
});
scene.add(pegs);

// bins: alternating tinted back/floor, dividers
const binColors = [0x1f7a6e, 0x2a5f9e];
for (let k = 0; k < BINS; k++) {
  const cx = -HALF_W + (k + 0.5) * BIN_W;
  const binBack = new THREE.Mesh(
    new THREE.BoxGeometry(BIN_W, BOARD_BOTTOM, 0.1),
    new THREE.MeshStandardMaterial({ color: binColors[k % 2], roughness: 0.6, metalness: 0.2 }),
  );
  binBack.position.set(cx, BOARD_BOTTOM / 2, -0.35);
  scene.add(binBack);
}
const dividerMat = new THREE.MeshStandardMaterial({ color: 0xf2b134, roughness: 0.35, metalness: 0.5 });
for (const x of dividerXs) {
  const d = new THREE.Mesh(new THREE.BoxGeometry(DIVIDER_R * 2, BOARD_BOTTOM, 0.5), dividerMat);
  d.position.set(x, BOARD_BOTTOM / 2, 0);
  scene.add(d);
}

// labels (textures drawn on an off-screen canvas that is never attached to the DOM)
class Label {
  readonly sprite: THREE.Sprite;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private text = '';
  constructor(
    private readonly color: string,
    width: number,
    height: number,
    private readonly font: string,
  ) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    this.ctx = c.getContext('2d') as CanvasRenderingContext2D;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthTest: false }));
    this.sprite.scale.set(width, height, 1);
    this.sprite.renderOrder = 10;
  }
  set(text: string): void {
    if (text === this.text) return;
    this.text = text;
    const g = this.ctx;
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = this.color;
    g.font = this.font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 64, 68);
    this.tex.needsUpdate = true;
  }
}

const countLabels: Label[] = [];
for (let k = 0; k < BINS; k++) {
  const cx = -HALF_W + (k + 0.5) * BIN_W;
  const num = new Label('#ffffff', 1.1, 1.1, 'bold 100px system-ui, sans-serif');
  num.set(String(k + 1));
  num.sprite.position.set(cx, -0.65, 0.4);
  scene.add(num.sprite);
  const cnt = new Label('#ffd34d', 1.0, 1.0, 'bold 84px system-ui, sans-serif');
  cnt.set('0');
  cnt.sprite.position.set(cx, -1.55, 0.4);
  scene.add(cnt.sprite);
  countLabels.push(cnt);
}

// balls
const ballGeo = new THREE.SphereGeometry(BALL_R, 24, 16);
const ballMat = new THREE.MeshStandardMaterial({ color: 0xff4d3d, roughness: 0.2, metalness: 0.1 });

// ---------- UI ----------
const ui = document.createElement('div');
ui.style.cssText = 'position:absolute;left:8px;top:8px;display:flex;flex-direction:column;gap:6px;width:130px;';
function makeButton(label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.style.cssText =
    'padding:6px 8px;font:600 13px system-ui,sans-serif;border:1px solid #556;border-radius:4px;background:#243a6e;color:#fff;cursor:pointer;';
  return b;
}
const dropBtn = makeButton('Drop 20 Balls');
const resetBtn = makeButton('Reset');
const info = document.createElement('div');
info.style.cssText = 'font:12px system-ui,sans-serif;color:#cfd8ff;';
ui.append(dropBtn, resetBtn, info);
document.body.appendChild(ui);

// ---------- simulation state ----------
type Phase = 'ready' | 'dropping' | 'settled';
let phase: Phase = 'ready';
let spawned = 0;
let batchRemaining = 0;
let batchIndex = 0;
let nextSpawnTime = 0;
let simTime = 0;
let calmSteps = 0;
let dropStartTime = 0;
let accumulator = 0;
let binCounts: number[] = new Array<number>(BINS).fill(0);
let nextId = 0;

function spawnBall(i: number): void {
  const offset = (((i * 37) % 11) - 5) * 0.02;
  const mesh = new THREE.Mesh(ballGeo, ballMat);
  mesh.position.set(offset, SPAWN_Y, 0);
  scene.add(mesh);
  balls.push({ x: offset, y: SPAWN_Y, vx: 0, vy: 0, id: nextId++, mesh });
  spawned++;
}

dropBtn.addEventListener('click', () => {
  if (phase === 'dropping') return;
  phase = 'dropping';
  batchRemaining = BALLS_PER_DROP;
  batchIndex = 0;
  nextSpawnTime = simTime;
  dropStartTime = simTime;
  calmSteps = 0;
});

resetBtn.addEventListener('click', () => {
  for (const b of balls) scene.remove(b.mesh);
  balls = [];
  spawned = 0;
  batchRemaining = 0;
  batchIndex = 0;
  calmSteps = 0;
  nextId = 0;
  phase = 'ready';
  binCounts = new Array<number>(BINS).fill(0);
});

function fixedStep(): void {
  while (batchRemaining > 0 && simTime >= nextSpawnTime - 1e-9) {
    spawnBall(batchIndex);
    batchIndex++;
    batchRemaining--;
    nextSpawnTime += SPAWN_INTERVAL;
  }
  physicsStep(FIXED_DT);
  simTime += FIXED_DT;

  if (phase === 'dropping' && batchRemaining === 0) {
    let maxSpeed = 0;
    let allInBins = true;
    for (const b of balls) {
      maxSpeed = Math.max(maxSpeed, Math.hypot(b.vx, b.vy));
      if (b.y >= BOARD_BOTTOM) allInBins = false;
    }
    if (allInBins && maxSpeed < 0.2) calmSteps++;
    else calmSteps = 0;
    if (calmSteps >= 60 || simTime - dropStartTime > 40) phase = 'settled';
  }
}

function updateBinCounts(): void {
  const counts = new Array<number>(BINS).fill(0);
  for (const b of balls) {
    if (b.y < BOARD_BOTTOM && b.y > 0) {
      const k = Math.floor((b.x + HALF_W) / BIN_W);
      if (k >= 0 && k < BINS) counts[k]++;
    }
  }
  binCounts = counts;
}

let state = { phase: 'ready' as Phase, spawned: 0, bins: new Array<number>(BINS).fill(0), total: 0 };
Object.defineProperty(window, '__TASK_STATE__', {
  get: () => state,
  enumerable: true,
  configurable: false,
});

// ---------- main loop ----------
let last = performance.now();
let firstFrame = true;

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < 30) {
    fixedStep();
    accumulator -= FIXED_DT;
    steps++;
  }
  if (steps === 30) accumulator = 0;

  updateBinCounts();
  for (const b of balls) b.mesh.position.set(b.x, b.y, 0);
  const total = binCounts.reduce((a, c) => a + c, 0);
  for (let k = 0; k < BINS; k++) countLabels[k].set(String(binCounts[k]));
  state = { phase, spawned, bins: binCounts.slice(), total };
  info.textContent = `Dropped: ${spawned}  In bins: ${total}`;

  renderer.render(scene, camera);
  if (firstFrame) {
    firstFrame = false;
    (window as unknown as { __EVAL_READY__: boolean }).__EVAL_READY__ = true;
  }
}
requestAnimationFrame(frame);
