import * as THREE from 'three';

type Status = 'ready' | 'playing' | 'won' | 'lost';
type CellKind = 'lantern' | 'bomb';

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

const ROUND_SECONDS = 45;
const WIN_SCORE = 150;
const SPACING = 2.3;

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

const seedParam = new URLSearchParams(location.search).get('seed');
const parsedSeed = seedParam !== null ? Number(seedParam) : NaN;
const SEED = Number.isFinite(parsedSeed) ? Math.floor(parsedSeed) : 1337;
let rng = mulberry32(SEED);

// ---------- DOM ----------
const canvas = document.getElementById('app') as HTMLCanvasElement;

const hud = document.createElement('div');
hud.style.cssText =
  'width:640px;box-sizing:border-box;display:flex;justify-content:space-between;padding:6px 12px;background:#10141f;color:#fff;font:14px system-ui,sans-serif;';
hud.innerHTML =
  '<span>Score: <b id="hud-score">0</b></span>' +
  '<span id="hud-msg" style="opacity:.8"></span>' +
  '<span>Time: <b id="hud-time">45.0</b></span>' +
  '<span>Status: <b id="hud-status">ready</b></span>';
document.body.appendChild(hud);
const hudScore = document.getElementById('hud-score') as HTMLElement;
const hudTime = document.getElementById('hud-time') as HTMLElement;
const hudStatus = document.getElementById('hud-status') as HTMLElement;
const hudMsg = document.getElementById('hud-msg') as HTMLElement;

const wrap = document.createElement('div');
wrap.style.cssText = 'position:absolute;left:0;top:0;width:640px;height:360px;';
document.body.appendChild(wrap);
const overlay = document.createElement('div');
overlay.id = 'overlay';
overlay.style.cssText =
  'position:absolute;left:0;top:0;width:640px;height:360px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(5,8,20,.72);text-align:center;font-family:system-ui,sans-serif;';
wrap.appendChild(overlay);
const ovTitle = document.createElement('div');
ovTitle.style.cssText = 'font-size:32px;font-weight:700;';
const ovText = document.createElement('div');
ovText.style.cssText = 'font-size:14px;max-width:420px;opacity:.9;';
const ovButton = document.createElement('button');
ovButton.id = 'start-button';
ovButton.style.cssText =
  'font-size:18px;padding:8px 24px;border-radius:6px;border:0;background:#ffb53d;color:#222;cursor:pointer;font-weight:700;';
overlay.append(ovTitle, ovText, ovButton);

// ---------- three.js setup ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.setClearColor(0x0b1020);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b1020, 12, 26);
const camera = new THREE.PerspectiveCamera(42, 640 / 360, 0.1, 100);
const camBase = new THREE.Vector3(0, 8.2, 7.6);
camera.position.copy(camBase);
camera.lookAt(0, 0, 0.2);

scene.add(new THREE.AmbientLight(0x8890b8, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(3, 8, 5);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: 0x1a2236, roughness: 0.95 }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const board = new THREE.Mesh(
  new THREE.BoxGeometry(3 * SPACING + 0.6, 0.1, 3 * SPACING + 0.6),
  new THREE.MeshStandardMaterial({ color: 0x2a3350, roughness: 0.8 }),
);
board.position.y = 0.0;
scene.add(board);

// shared geometry / materials
const pedGeo = new THREE.CylinderGeometry(0.95, 1.0, 0.25, 28);
const pedMat = new THREE.MeshStandardMaterial({ color: 0x4a5578, roughness: 0.7 });
const holeGeo = new THREE.CircleGeometry(0.58, 28);
const holeMat = new THREE.MeshBasicMaterial({ color: 0x03050a });
const ringGeo = new THREE.RingGeometry(0.98, 1.12, 36);
const hitGeo = new THREE.CylinderGeometry(1.0, 1.0, 1.9, 12);
const hitMat = new THREE.MeshBasicMaterial({ visible: false });

const lanternBodyGeo = new THREE.CylinderGeometry(0.34, 0.42, 0.7, 14);
const lanternBodyMat = new THREE.MeshStandardMaterial({
  color: 0xffa726,
  emissive: 0xff8a00,
  emissiveIntensity: 1.3,
});
const capGeo = new THREE.CylinderGeometry(0.28, 0.46, 0.14, 14);
const capMat = new THREE.MeshStandardMaterial({ color: 0x5a2d0c, roughness: 0.6 });
const handleGeo = new THREE.TorusGeometry(0.2, 0.04, 8, 16);
const glowGeo = new THREE.SphereGeometry(0.75, 16, 12);
const glowMat = new THREE.MeshBasicMaterial({
  color: 0xffc860,
  transparent: true,
  opacity: 0.22,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

const bombBodyGeo = new THREE.SphereGeometry(0.46, 20, 16);
const bombBodyMat = new THREE.MeshStandardMaterial({
  color: 0x6a1b9a,
  emissive: 0x4a0072,
  emissiveIntensity: 0.9,
  roughness: 0.35,
  metalness: 0.4,
});
const fuseGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8);
const fuseMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
const sparkGeo = new THREE.SphereGeometry(0.1, 8, 8);
const sparkMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
const bombGlowMat = new THREE.MeshBasicMaterial({
  color: 0xd500f9,
  transparent: true,
  opacity: 0.2,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

interface Cell {
  index: number;
  x: number;
  z: number;
  active: boolean;
  kind: CellKind;
  age: number;
  life: number;
  height: number; // 0 hidden .. 1 raised
  lantern: THREE.Group;
  bomb: THREE.Group;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  ped: THREE.Mesh;
  missT: number;
  hitT: number;
}

const cells: Cell[] = [];
const hitMeshes: THREE.Mesh[] = [];

for (let i = 0; i < 9; i++) {
  const col = i % 3;
  const row = Math.floor(i / 3);
  const x = (col - 1) * SPACING;
  const z = (row - 1) * SPACING;

  const ped = new THREE.Mesh(pedGeo, pedMat.clone());
  ped.position.set(x, 0.12, z);
  scene.add(ped);

  const hole = new THREE.Mesh(holeGeo, holeMat);
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(x, 0.26, z);
  scene.add(hole);

  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x6f7fb0,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.3, z);
  scene.add(ring);

  const lantern = new THREE.Group();
  const body = new THREE.Mesh(lanternBodyGeo, lanternBodyMat);
  body.position.y = 0.5;
  const capTop = new THREE.Mesh(capGeo, capMat);
  capTop.position.y = 0.92;
  const capBot = new THREE.Mesh(capGeo, capMat);
  capBot.position.y = 0.08;
  capBot.rotation.x = Math.PI;
  const handle = new THREE.Mesh(handleGeo, capMat);
  handle.position.y = 1.08;
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.y = 0.5;
  lantern.add(body, capTop, capBot, handle, glow);
  lantern.position.set(x, -1.4, z);
  lantern.visible = false;
  scene.add(lantern);

  const bomb = new THREE.Group();
  const bBody = new THREE.Mesh(bombBodyGeo, bombBodyMat);
  bBody.position.y = 0.5;
  const fuse = new THREE.Mesh(fuseGeo, fuseMat);
  fuse.position.y = 1.05;
  const spark = new THREE.Mesh(sparkGeo, sparkMat);
  spark.position.y = 1.25;
  spark.name = 'spark';
  const bGlow = new THREE.Mesh(glowGeo, bombGlowMat);
  bGlow.position.y = 0.5;
  bomb.add(bBody, fuse, spark, bGlow);
  bomb.position.set(x, -1.4, z);
  bomb.visible = false;
  scene.add(bomb);

  const hit = new THREE.Mesh(hitGeo, hitMat);
  hit.position.set(x, 0.75, z);
  hit.userData.cell = i;
  scene.add(hit);
  hitMeshes.push(hit);

  cells.push({
    index: i,
    x,
    z,
    active: false,
    kind: 'lantern',
    age: 0,
    life: 1,
    height: 0,
    lantern,
    bomb,
    ring,
    ringMat,
    ped,
    missT: 0,
    hitT: 0,
  });
}

// ---------- particles ----------
interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  spin: number;
}
const particles: Particle[] = [];
const partGeo = new THREE.OctahedronGeometry(0.1);
const partMats: Record<string, THREE.MeshBasicMaterial> = {
  gold: new THREE.MeshBasicMaterial({ color: 0xffd54f }),
  orange: new THREE.MeshBasicMaterial({ color: 0xff7043 }),
  white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  red: new THREE.MeshBasicMaterial({ color: 0xff1744 }),
  purple: new THREE.MeshBasicMaterial({ color: 0xd500f9 }),
};
const fxRng = mulberry32(99);

function burst(x: number, z: number, colors: string[], count: number, power: number): void {
  for (let i = 0; i < count; i++) {
    const mat = partMats[colors[i % colors.length]];
    const mesh = new THREE.Mesh(partGeo, mat);
    mesh.position.set(x, 0.9, z);
    const a = fxRng() * Math.PI * 2;
    const s = (0.4 + fxRng() * 0.8) * power;
    const vel = new THREE.Vector3(Math.cos(a) * s, 2 + fxRng() * 3 * (power / 3), Math.sin(a) * s);
    const maxLife = 0.5 + fxRng() * 0.4;
    scene.add(mesh);
    particles.push({ mesh, vel, life: maxLife, maxLife, spin: fxRng() * 10 });
  }
}

interface Flash {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  t: number;
  dur: number;
}
const flashes: Flash[] = [];
const flashGeo = new THREE.RingGeometry(0.5, 0.7, 32);
function flashRing(x: number, z: number, color: number): void {
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(flashGeo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.35, z);
  scene.add(mesh);
  flashes.push({ mesh, mat, t: 0, dur: 0.45 });
}

// ---------- game state ----------
const state: TaskState = { status: 'ready', score: 0, timeLeft: ROUND_SECONDS, activeCells: [] };
window.__TASK_STATE__ = state;
window.__TASK_READY__ = false;

let spawnTimer = 0;
let hoverCell = -1;
let shake = 0;
let msgTimer = 0;
let endReason = '';

function setMsg(text: string): void {
  hudMsg.textContent = text;
  msgTimer = 1.2;
}

function syncState(): void {
  state.activeCells = cells.filter((c) => c.active).map((c) => c.index);
  hudScore.textContent = String(state.score);
  hudTime.textContent = state.timeLeft.toFixed(1);
  hudStatus.textContent = state.status;
}

function updateOverlay(): void {
  if (state.status === 'playing') {
    overlay.style.display = 'none';
    return;
  }
  overlay.style.display = 'flex';
  if (state.status === 'ready') {
    ovTitle.textContent = 'Lantern Pop';
    ovText.textContent =
      'Click raised lanterns (+10). Missing costs 5. Never click the purple bomb! Score ' +
      WIN_SCORE +
      ' in ' +
      ROUND_SECONDS +
      ' seconds to win.';
    ovButton.textContent = 'Start';
    ovButton.id = 'start-button';
  } else {
    ovTitle.textContent = state.status === 'won' ? 'You win!' : 'You lose';
    ovTitle.style.color = state.status === 'won' ? '#8bc34a' : '#ff5252';
    ovText.textContent = endReason + ' Final score: ' + state.score + '.';
    ovButton.textContent = 'Restart';
    ovButton.id = 'restart-button';
  }
}

function resetCells(): void {
  for (const c of cells) {
    c.active = false;
    c.height = 0;
    c.age = 0;
    c.missT = 0;
    c.hitT = 0;
    c.lantern.visible = false;
    c.bomb.visible = false;
  }
  for (const p of particles) scene.remove(p.mesh);
  particles.length = 0;
}

function startRound(): void {
  rng = mulberry32(SEED);
  resetCells();
  state.status = 'playing';
  state.score = 0;
  state.timeLeft = ROUND_SECONDS;
  spawnTimer = 0.4;
  endReason = '';
  ovTitle.style.color = '#fff';
  hudMsg.textContent = '';
  syncState();
  updateOverlay();
}

function endRound(status: 'won' | 'lost', reason: string): void {
  state.status = status;
  endReason = reason;
  for (const c of cells) c.active = false;
  syncState();
  updateOverlay();
}

function currentLife(): number {
  return Math.max(0.5, 1.4 - state.score * 0.006);
}

function spawn(): void {
  const free = cells.filter((c) => !c.active);
  if (free.length === 0) return;
  const cell = free[Math.floor(rng() * free.length)];
  const isBomb = rng() < 0.14;
  cell.kind = isBomb ? 'bomb' : 'lantern';
  cell.active = true;
  cell.age = 0;
  cell.life = currentLife() * (isBomb ? 1.1 : 1);
  cell.lantern.visible = !isBomb;
  cell.bomb.visible = isBomb;
  const gap = Math.max(0.35, 0.85 - state.score * 0.002);
  spawnTimer = gap + rng() * 0.4;
  syncState();
}

function handleHit(index: number): void {
  if (state.status !== 'playing') return;
  const c = cells[index];
  if (c.active && c.kind === 'bomb') {
    burst(c.x, c.z, ['red', 'orange', 'purple', 'white'], 40, 5);
    flashRing(c.x, c.z, 0xff1744);
    shake = 0.5;
    c.active = false;
    c.height = 1;
    endRound('lost', 'You hit a bomb!');
    return;
  }
  if (c.active && c.kind === 'lantern') {
    c.active = false;
    c.hitT = 0.4;
    state.score += 10;
    burst(c.x, c.z, ['gold', 'orange', 'white'], 24, 3);
    flashRing(c.x, c.z, 0xffd54f);
    setMsg('Pop! +10');
    syncState();
    return;
  }
  const before = state.score;
  state.score = Math.max(0, state.score - 5);
  c.missT = 0.4;
  flashRing(c.x, c.z, 0xff3d3d);
  shake = Math.max(shake, 0.2);
  setMsg(before > 0 ? 'Miss! -5' : 'Miss!');
  syncState();
}

// ---------- input ----------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function pickCell(ev: PointerEvent): number {
  const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -(((ev.clientY - r.top) / r.height) * 2 - 1));
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(hitMeshes, false);
  if (hits.length === 0) return -1;
  return hits[0].object.userData.cell as number;
}

canvas.addEventListener('pointermove', (ev) => {
  hoverCell = pickCell(ev);
});
canvas.addEventListener('pointerleave', () => {
  hoverCell = -1;
});
canvas.addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  const idx = pickCell(ev);
  hoverCell = idx;
  if (idx >= 0) {
    handleHit(idx);
  } else if (state.status === 'playing') {
    // clicked outside every cell: counts as an empty click
    const before = state.score;
    state.score = Math.max(0, state.score - 5);
    setMsg(before > 0 ? 'Miss! -5' : 'Miss!');
    shake = Math.max(shake, 0.15);
    syncState();
  }
});

ovButton.addEventListener('click', () => {
  if (state.status === 'ready' || state.status === 'won' || state.status === 'lost') startRound();
});

window.addEventListener('keydown', (ev) => {
  if (ev.repeat) return;
  if (ev.key === 'Enter' && state.status === 'ready') {
    ev.preventDefault();
    startRound();
  } else if (ev.key === 'r' || ev.key === 'R') {
    startRound();
  }
});

// ---------- loop ----------
const tmpColor = new THREE.Color();
const COLOR_IDLE = new THREE.Color(0x6f7fb0);
const COLOR_HOVER = new THREE.Color(0x4dd0ff);
const COLOR_MISS = new THREE.Color(0xff3d3d);
const COLOR_HIT = new THREE.Color(0xffd54f);

let last = performance.now();
let firstFrame = true;

function frame(now: number): void {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  const t = now / 1000;

  if (state.status === 'playing') {
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      const won = state.score >= WIN_SCORE;
      endRound(won ? 'won' : 'lost', won ? 'Time is up. Great reflexes!' : 'Time is up. You needed ' + WIN_SCORE + ' points.');
    } else {
      spawnTimer -= dt;
      if (spawnTimer <= 0) spawn();
      for (const c of cells) {
        if (!c.active) continue;
        c.age += dt;
        if (c.age >= c.life) {
          c.active = false; // dropped unpopped, no penalty
        }
      }
      syncState();
    }
  }

  if (msgTimer > 0) {
    msgTimer -= dt;
    if (msgTimer <= 0) hudMsg.textContent = '';
  }

  // cell visuals
  for (const c of cells) {
    const target = c.active ? 1 : 0;
    const speed = c.active ? 8 : c.hitT > 0 ? 14 : 4.5;
    if (c.height < target) c.height = Math.min(target, c.height + speed * dt);
    else if (c.height > target) c.height = Math.max(target, c.height - speed * dt);
    c.missT = Math.max(0, c.missT - dt);
    c.hitT = Math.max(0, c.hitT - dt);

    const eased = c.height * c.height * (3 - 2 * c.height);
    const y = -1.4 + eased * 1.6 + (c.active ? Math.sin(t * 5 + c.index) * 0.04 : 0);
    const grp = c.kind === 'bomb' ? c.bomb : c.lantern;
    grp.position.y = y;
    if (c.height <= 0.001 && !c.active) {
      c.lantern.visible = false;
      c.bomb.visible = false;
    }
    if (c.kind === 'bomb') {
      const spark = c.bomb.getObjectByName('spark');
      if (spark) spark.visible = Math.sin(t * 30) > -0.3;
    }

    // ring colour: miss > hit > hover > idle
    const hovered = c.index === hoverCell;
    if (c.missT > 0) {
      c.ringMat.color.copy(COLOR_MISS);
      c.ringMat.opacity = 1;
    } else if (c.hitT > 0) {
      c.ringMat.color.copy(COLOR_HIT);
      c.ringMat.opacity = 1;
    } else if (hovered) {
      c.ringMat.color.copy(COLOR_HOVER);
      c.ringMat.opacity = 1;
    } else {
      c.ringMat.color.copy(COLOR_IDLE);
      c.ringMat.opacity = 0.4;
    }
    const pedMat2 = c.ped.material as THREE.MeshStandardMaterial;
    if (hovered) tmpColor.set(0x1c5870);
    else if (c.missT > 0) tmpColor.set(0x6a1010);
    else tmpColor.set(0x000000);
    pedMat2.emissive.copy(tmpColor);
    const sc = hovered ? 1.06 : 1;
    c.ring.scale.set(sc, sc, sc);
  }

  // particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      particles.splice(i, 1);
      continue;
    }
    p.vel.y -= 9 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.rotation.x += p.spin * dt;
    p.mesh.rotation.y += p.spin * dt;
    const k = p.life / p.maxLife;
    p.mesh.scale.setScalar(Math.max(0.01, k) * 1.4);
  }
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i];
    f.t += dt;
    const k = f.t / f.dur;
    if (k >= 1) {
      scene.remove(f.mesh);
      f.mat.dispose();
      flashes.splice(i, 1);
      continue;
    }
    f.mesh.scale.setScalar(1 + k * 1.8);
    f.mat.opacity = 1 - k;
  }

  // camera shake
  shake = Math.max(0, shake - dt * 1.5);
  camera.position.set(
    camBase.x + (Math.random() - 0.5) * shake * 0.5,
    camBase.y + (Math.random() - 0.5) * shake * 0.5,
    camBase.z,
  );
  camera.lookAt(0, 0, 0.2);

  hudTime.textContent = state.timeLeft.toFixed(1);
  hudScore.textContent = String(state.score);
  hudStatus.textContent = state.status;

  renderer.render(scene, camera);
  if (firstFrame) {
    firstFrame = false;
    window.__TASK_READY__ = true;
  }
  requestAnimationFrame(frame);
}

syncState();
updateOverlay();
requestAnimationFrame(frame);
