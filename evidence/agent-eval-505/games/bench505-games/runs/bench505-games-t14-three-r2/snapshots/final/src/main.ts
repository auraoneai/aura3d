import * as THREE from 'three';

type Status = 'ready' | 'playing' | 'won' | 'lost';
interface TaskState {
  status: Status;
  score: number;
  timeLeft: number;
  activeCells: number[];
}
declare global {
  interface Window {
    __TASK_STATE__: TaskState;
    __TASK_READY__: boolean;
  }
}

const ROUND_TIME = 45;
const WIN_SCORE = 150;
const SPACING = 1.8;
const CELL_HALF = 0.85;
const PICK_Y = 0.4;
const W = 640;
const H = 360;

// ---------- seeded RNG ----------
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
const SEED = Number.isFinite(seedParam) && seedParam !== 0 ? seedParam : 20240607;
let rng = mulberry32(SEED);

// ---------- renderer / scene ----------
const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(W, H, false);
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1020);
scene.fog = new THREE.Fog(0x0b1020, 10, 20);

const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 50);
const camBase = new THREE.Vector3(0, 7.2, 6.6);
camera.position.copy(camBase);
camera.lookAt(0, 0, 0.2);

scene.add(new THREE.AmbientLight(0x8090c0, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(3, 8, 4);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.BoxGeometry(6.6, 0.4, 6.6),
  new THREE.MeshStandardMaterial({ color: 0x2a3350, roughness: 0.9 }),
);
ground.position.y = -0.2;
scene.add(ground);

const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// ---------- cells ----------
interface Target {
  kind: 'lantern' | 'bomb';
  age: number;
  duration: number;
}
interface Cell {
  index: number;
  x: number;
  z: number;
  holder: THREE.Group;
  lantern: THREE.Group;
  bomb: THREE.Group;
  lanternMat: THREE.MeshStandardMaterial;
  ringMat: THREE.MeshStandardMaterial;
  flashRing: THREE.Mesh;
  flashMat: THREE.MeshBasicMaterial;
  flashT: number;
  flashColor: THREE.Color;
  h: number;
  target: Target | null;
}

const sphereGeo = new THREE.SphereGeometry(1, 20, 14);
const ringGeo = new THREE.TorusGeometry(0.68, 0.07, 10, 36);
const holeGeo = new THREE.CircleGeometry(0.6, 32);
const holeMat = new THREE.MeshBasicMaterial({ color: 0x03040a });
const flashGeo = new THREE.RingGeometry(0.6, 0.8, 40);

function clipped<T extends THREE.Material & { clippingPlanes: THREE.Plane[] | null }>(m: T): T {
  m.clippingPlanes = [clipPlane];
  return m;
}

function buildLantern(): { group: THREE.Group; mat: THREE.MeshStandardMaterial } {
  const g = new THREE.Group();
  const mat = clipped(
    new THREE.MeshStandardMaterial({
      color: 0xffb030,
      emissive: 0xff8a00,
      emissiveIntensity: 1.4,
      roughness: 0.4,
    }),
  );
  const body = new THREE.Mesh(sphereGeo, mat);
  body.scale.set(0.4, 0.48, 0.4);
  g.add(body);
  const metal = clipped(new THREE.MeshStandardMaterial({ color: 0x5a3b1a, roughness: 0.6 }));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.12, 16), metal);
  cap.position.y = 0.5;
  g.add(cap);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.1, 16), metal);
  base.position.y = -0.5;
  g.add(base);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 8, 16), metal);
  handle.position.y = 0.66;
  g.add(handle);
  return { group: g, mat };
}

function buildBomb(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    sphereGeo,
    clipped(
      new THREE.MeshStandardMaterial({
        color: 0x1a1020,
        emissive: 0x6a00c0,
        emissiveIntensity: 0.9,
        roughness: 0.3,
        metalness: 0.5,
      }),
    ),
  );
  body.scale.setScalar(0.44);
  g.add(body);
  const fuse = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8),
    clipped(new THREE.MeshStandardMaterial({ color: 0xbbbbbb })),
  );
  fuse.position.y = 0.55;
  g.add(fuse);
  const spark = new THREE.Mesh(
    sphereGeo,
    clipped(new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 2 })),
  );
  spark.scale.setScalar(0.09);
  spark.position.y = 0.74;
  g.add(spark);
  const skull = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.035, 8, 24),
    clipped(new THREE.MeshStandardMaterial({ color: 0xff2040, emissive: 0xff2040, emissiveIntensity: 1.2 })),
  );
  skull.position.set(0, 0.02, 0);
  skull.rotation.x = Math.PI / 2;
  g.add(skull);
  return g;
}

const cells: Cell[] = [];
for (let i = 0; i < 9; i++) {
  const x = ((i % 3) - 1) * SPACING;
  const z = (Math.floor(i / 3) - 1) * SPACING;
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  scene.add(root);

  const hole = new THREE.Mesh(holeGeo, holeMat);
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = 0.01;
  root.add(hole);

  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x6b7aa8,
    emissive: 0x000000,
    roughness: 0.5,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.04;
  root.add(ring);

  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const flashRing = new THREE.Mesh(flashGeo, flashMat);
  flashRing.rotation.x = -Math.PI / 2;
  flashRing.position.y = 0.06;
  root.add(flashRing);

  const holder = new THREE.Group();
  root.add(holder);
  const l = buildLantern();
  const bomb = buildBomb();
  holder.add(l.group);
  holder.add(bomb);
  l.group.visible = false;
  bomb.visible = false;

  cells.push({
    index: i,
    x,
    z,
    holder,
    lantern: l.group,
    bomb,
    lanternMat: l.mat,
    ringMat,
    flashRing,
    flashMat,
    flashT: 0,
    flashColor: new THREE.Color(0xffffff),
    h: 0,
    target: null,
  });
}

// ---------- particles ----------
interface Particle {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}
const particles: Particle[] = [];
const particleGeo = new THREE.SphereGeometry(0.07, 8, 6);
for (let i = 0; i < 160; i++) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
  const mesh = new THREE.Mesh(particleGeo, mat);
  mesh.visible = false;
  scene.add(mesh);
  particles.push({ mesh, mat, vel: new THREE.Vector3(), life: 0, maxLife: 1 });
}
function burst(x: number, y: number, z: number, color: number, count: number, speed: number): void {
  let n = 0;
  for (const p of particles) {
    if (p.life > 0) continue;
    p.life = p.maxLife = 0.5 + Math.random() * 0.4;
    p.mesh.visible = true;
    p.mesh.position.set(x, y, z);
    const a = Math.random() * Math.PI * 2;
    const up = 0.4 + Math.random();
    const s = speed * (0.4 + Math.random() * 0.8);
    p.vel.set(Math.cos(a) * s, up * speed, Math.sin(a) * s);
    p.mat.color.setHex(color);
    p.mat.opacity = 1;
    if (++n >= count) break;
  }
}

// ---------- DOM HUD ----------
const hud = document.createElement('div');
hud.style.cssText = `width:${W}px;display:flex;justify-content:space-between;padding:6px 10px;box-sizing:border-box;font:600 15px system-ui,sans-serif;background:#111827;color:#fff;`;
const scoreEl = document.createElement('span');
const timeEl = document.createElement('span');
const statusEl = document.createElement('span');
scoreEl.id = 'hud-score';
timeEl.id = 'hud-time';
statusEl.id = 'hud-status';
hud.append(scoreEl, timeEl, statusEl);
document.body.appendChild(hud);

const startBtn = document.createElement('button');
startBtn.id = 'start-btn';
startBtn.textContent = 'Start';
const restartBtn = document.createElement('button');
restartBtn.id = 'restart-btn';
restartBtn.textContent = 'Restart';
for (const b of [startBtn, restartBtn]) {
  b.style.cssText =
    'font:700 18px system-ui,sans-serif;padding:8px 24px;margin-top:12px;border:0;border-radius:6px;background:#ffb030;color:#201000;cursor:pointer;';
}

const overlay = document.createElement('div');
overlay.id = 'overlay';
overlay.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(5,8,20,0.7);text-align:center;font:16px system-ui,sans-serif;`;
const overlayTitle = document.createElement('div');
overlayTitle.style.cssText = 'font:800 32px system-ui,sans-serif;';
const overlayText = document.createElement('div');
overlayText.style.cssText = 'margin-top:6px;max-width:460px;';
overlay.append(overlayTitle, overlayText, startBtn, restartBtn);
document.body.style.position = 'relative';
document.body.appendChild(overlay);

// ---------- game state ----------
const state: TaskState = { status: 'ready', score: 0, timeLeft: ROUND_TIME, activeCells: [] };
window.__TASK_STATE__ = state;
window.__TASK_READY__ = false;

let spawnTimer = 0;
let hovered = -1;
let shake = 0;
let scoreFlash = 0;
let endReason = '';

function syncState(): void {
  state.activeCells = cells.filter((c) => c.target !== null).map((c) => c.index);
  scoreEl.textContent = `Score: ${state.score}`;
  timeEl.textContent = `Time: ${state.timeLeft.toFixed(1)}`;
  statusEl.textContent = `Status: ${state.status}`;

  const showOverlay = state.status !== 'playing';
  overlay.style.display = showOverlay ? 'flex' : 'none';
  startBtn.style.display = state.status === 'ready' ? '' : 'none';
  restartBtn.style.display = state.status === 'won' || state.status === 'lost' ? '' : 'none';
  if (state.status === 'ready') {
    overlayTitle.textContent = 'Lantern Pop';
    overlayText.textContent =
      `Click raised lanterns (+10). Misses cost 5. Avoid the purple bombs! Score ${WIN_SCORE}+ in ${ROUND_TIME}s to win. Press Enter to start.`;
  } else if (state.status === 'won') {
    overlayTitle.textContent = 'You won!';
    overlayText.textContent = `Final score ${state.score}. Press R or Restart to play again.`;
  } else if (state.status === 'lost') {
    overlayTitle.textContent = 'You lost';
    overlayText.textContent = `${endReason} Final score ${state.score}. Press R or Restart to play again.`;
  }
}

function flashCell(c: Cell, color: number): void {
  c.flashColor.setHex(color);
  c.flashMat.color.copy(c.flashColor);
  c.flashT = 1;
}

function startRound(): void {
  rng = mulberry32(SEED);
  state.status = 'playing';
  state.score = 0;
  state.timeLeft = ROUND_TIME;
  spawnTimer = 0.6;
  endReason = '';
  for (const c of cells) {
    c.target = null;
    c.h = 0;
    c.flashT = 0;
  }
  syncState();
}

function endRound(status: 'won' | 'lost', reason: string): void {
  state.status = status;
  endReason = reason;
  for (const c of cells) c.target = null;
  syncState();
}

function addScore(delta: number): void {
  state.score = Math.max(0, state.score + delta);
  scoreFlash = 1;
  scoreEl.style.color = delta > 0 ? '#7dff9a' : '#ff6b6b';
}

function spawn(): void {
  // Draw all random numbers every spawn so the sequence only depends on the seed.
  const cellIdx = Math.floor(rng() * 9);
  const bombRoll = rng();
  const gapRoll = rng();
  const durRoll = rng();
  const difficulty = Math.max(0.5, 1 - state.score / 400);
  spawnTimer = (0.35 + gapRoll * 0.45) * difficulty;
  const c = cells[cellIdx];
  if (c.target) return;
  const kind = bombRoll < 0.12 ? 'bomb' : 'lantern';
  const base = Math.max(0.5, 1.3 - state.score * 0.005);
  c.target = { kind, age: 0, duration: base * (0.85 + durRoll * 0.3) };
  c.lantern.visible = kind === 'lantern';
  c.bomb.visible = kind === 'bomb';
}

// ---------- input ----------
const raycaster = new THREE.Raycaster();
const pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -PICK_Y);
const hitPoint = new THREE.Vector3();
const ndc = new THREE.Vector2();

function pickCell(ev: PointerEvent): number {
  const r = canvas.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return -1;
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -(((ev.clientY - r.top) / r.height) * 2 - 1));
  raycaster.setFromCamera(ndc, camera);
  if (!raycaster.ray.intersectPlane(pickPlane, hitPoint)) return -1;
  for (const c of cells) {
    if (Math.abs(hitPoint.x - c.x) <= CELL_HALF && Math.abs(hitPoint.z - c.z) <= CELL_HALF) return c.index;
  }
  return -1;
}

canvas.addEventListener('pointermove', (ev) => {
  hovered = pickCell(ev);
});
canvas.addEventListener('pointerleave', () => {
  hovered = -1;
});
canvas.addEventListener('pointerdown', (ev) => {
  hovered = pickCell(ev);
  if (state.status !== 'playing' || hovered < 0) return;
  const c = cells[hovered];
  const t = c.target;
  const wx = c.x;
  const wz = c.z;
  if (t && t.age < t.duration) {
    if (t.kind === 'lantern') {
      addScore(10);
      flashCell(c, 0xffe070);
      burst(wx, 0.8, wz, 0xffc040, 28, 3.2);
      burst(wx, 0.8, wz, 0xffffff, 10, 2);
      c.target = null;
      c.h = 0;
      c.lantern.visible = false;
    } else {
      flashCell(c, 0xff2020);
      burst(wx, 0.8, wz, 0xff3030, 50, 5);
      burst(wx, 0.8, wz, 0xb040ff, 30, 4);
      shake = 1;
      c.target = null;
      c.bomb.visible = false;
      endRound('lost', 'You hit a bomb!');
    }
  } else {
    addScore(-5);
    flashCell(c, 0xff3b3b);
    burst(wx, 0.2, wz, 0xff5050, 8, 1.6);
    shake = 0.6;
  }
  syncState();
});

startBtn.addEventListener('click', () => {
  if (state.status === 'ready') startRound();
});
restartBtn.addEventListener('click', () => {
  if (state.status === 'won' || state.status === 'lost') startRound();
});
window.addEventListener('keydown', (ev) => {
  if (ev.repeat) return;
  if (ev.key === 'Enter' && state.status === 'ready') {
    startRound();
  } else if (ev.key === 'r' || ev.key === 'R') {
    startRound();
  }
});

// ---------- loop ----------
const hoverColor = new THREE.Color(0x66ccff);
const tmpColor = new THREE.Color();
let last = performance.now();
let firstFrame = true;

function frame(now: number): void {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  const time = now / 1000;

  if (state.status === 'playing') {
    state.timeLeft = Math.max(0, state.timeLeft - dt);
    spawnTimer -= dt;
    while (spawnTimer <= 0 && state.timeLeft > 0) spawn();
    for (const c of cells) {
      if (c.target) {
        c.target.age += dt;
        if (c.target.age >= c.target.duration) c.target = null;
      }
    }
    if (state.timeLeft <= 0) {
      endRound(state.score >= WIN_SCORE ? 'won' : 'lost', state.score >= WIN_SCORE ? '' : 'Not enough points.');
    }
    syncState();
  }

  for (const c of cells) {
    const goal = c.target ? 1 : 0;
    const speed = goal ? 9 : 6;
    c.h += Math.sign(goal - c.h) * Math.min(Math.abs(goal - c.h), speed * dt);
    const e = c.h * c.h * (3 - 2 * c.h);
    c.holder.position.y = -0.95 + 1.5 * e;
    const bob = Math.sin(time * 6 + c.index) * 0.02 * c.h;
    c.holder.position.y += bob;
    c.holder.rotation.y = time * 1.5 + c.index;
    if (c.h <= 0.001 && !c.target) {
      c.lantern.visible = false;
      c.bomb.visible = false;
    }
    c.lanternMat.emissiveIntensity = 1.2 + Math.sin(time * 9 + c.index) * 0.4;

    // ring: hover highlight + flash
    const isHover = hovered === c.index && state.status === 'playing';
    tmpColor.setHex(0x000000);
    if (isHover) tmpColor.copy(hoverColor).multiplyScalar(0.9);
    c.ringMat.emissive.copy(tmpColor);
    c.ringMat.color.setHex(isHover ? 0xbfe8ff : 0x6b7aa8);
    c.ringMat.emissiveIntensity = 1;
    if (c.flashT > 0) {
      c.flashT = Math.max(0, c.flashT - dt * 2.2);
      const k = 1 - c.flashT;
      c.flashMat.opacity = c.flashT;
      c.flashRing.scale.setScalar(1 + k * 0.8);
      c.ringMat.emissive.copy(c.flashColor).multiplyScalar(c.flashT);
    } else {
      c.flashMat.opacity = 0;
    }
  }

  for (const p of particles) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.mesh.visible = false;
      continue;
    }
    p.vel.y -= 9 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mat.opacity = Math.min(1, p.life / p.maxLife * 1.5);
  }

  if (shake > 0) shake = Math.max(0, shake - dt * 3);
  camera.position.set(
    camBase.x + (Math.random() - 0.5) * 0.15 * shake,
    camBase.y + (Math.random() - 0.5) * 0.15 * shake,
    camBase.z,
  );
  camera.lookAt(0, 0, 0.2);

  if (scoreFlash > 0) {
    scoreFlash = Math.max(0, scoreFlash - dt * 2);
    if (scoreFlash === 0) scoreEl.style.color = '#fff';
  }

  renderer.render(scene, camera);
  if (firstFrame) {
    firstFrame = false;
    window.__TASK_READY__ = true;
  }
  requestAnimationFrame(frame);
}

syncState();
requestAnimationFrame(frame);
