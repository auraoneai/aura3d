import * as THREE from 'three';

type Status = 'ready' | 'playing' | 'won' | 'lost';
type Kind = 'lantern' | 'bomb';

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
const SPACING = 2.4;
const RISE_Y = 1.05; // height of object centre offset when fully raised
const HIDE_Y = -1.3;

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
const SEED = Number.isFinite(seedParam) && seedParam !== 0 ? Math.floor(seedParam) : 1337;
let rng = mulberry32(SEED);

// ---------- DOM ----------
const canvas = document.getElementById('app') as HTMLCanvasElement;
canvas.style.touchAction = 'none';

const hud = document.createElement('div');
hud.style.cssText =
  'width:640px;box-sizing:border-box;display:flex;justify-content:space-between;padding:6px 12px;background:#111826;color:#fff;font:600 15px system-ui,sans-serif;';
hud.innerHTML =
  '<span>Score: <b id="hud-score">0</b></span><span>Time: <b id="hud-time">45.0</b>s</span><span>Status: <b id="hud-status">ready</b></span>';
document.body.appendChild(hud);
const hudScore = document.getElementById('hud-score') as HTMLElement;
const hudTime = document.getElementById('hud-time') as HTMLElement;
const hudStatus = document.getElementById('hud-status') as HTMLElement;

const layer = document.createElement('div');
layer.style.cssText = 'position:absolute;left:0;top:0;width:640px;height:360px;overflow:hidden;pointer-events:none;';
document.body.appendChild(layer);

const overlay = document.createElement('div');
overlay.style.cssText =
  'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(5,8,20,0.72);text-align:center;pointer-events:auto;';
const overlayTitle = document.createElement('div');
overlayTitle.style.cssText = 'font:700 30px system-ui,sans-serif;';
const overlayMsg = document.createElement('div');
overlayMsg.style.cssText = 'font:15px system-ui,sans-serif;max-width:460px;';
const overlayBtn = document.createElement('button');
overlayBtn.id = 'start-button';
overlayBtn.style.cssText =
  'font:700 18px system-ui,sans-serif;padding:8px 26px;border-radius:8px;border:0;background:#ffb938;color:#222;cursor:pointer;';
overlay.append(overlayTitle, overlayMsg, overlayBtn);
layer.appendChild(overlay);

// ---------- three.js ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1226);
scene.fog = new THREE.Fog(0x0b1226, 14, 28);

const camera = new THREE.PerspectiveCamera(45, 640 / 360, 0.1, 100);
camera.position.set(0, 8.2, 8.6);
camera.lookAt(0, 0.2, 0.2);

scene.add(new THREE.HemisphereLight(0x8899cc, 0x222233, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(3, 8, 5);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.BoxGeometry(10.5, 0.6, 10.5),
  new THREE.MeshStandardMaterial({ color: 0x2b3a2a, roughness: 0.95 }),
);
ground.position.y = -0.3;
scene.add(ground);

const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function clipped<T extends THREE.Material>(m: T): T {
  m.clippingPlanes = [clipPlane];
  return m;
}

const holeGeo = new THREE.CircleGeometry(0.85, 32);
holeGeo.rotateX(-Math.PI / 2);
const holeMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
const ringGeo = new THREE.TorusGeometry(0.95, 0.09, 8, 40);
ringGeo.rotateX(Math.PI / 2);

const lanternGeos = {
  body: new THREE.CylinderGeometry(0.42, 0.42, 0.8, 20),
  cap: new THREE.CylinderGeometry(0.3, 0.5, 0.14, 20),
  base: new THREE.CylinderGeometry(0.5, 0.3, 0.14, 20),
  halo: new THREE.SphereGeometry(0.75, 16, 12),
  handle: new THREE.TorusGeometry(0.22, 0.04, 6, 16, Math.PI),
};

function makeLantern(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    lanternGeos.body,
    clipped(new THREE.MeshStandardMaterial({ color: 0xffc247, emissive: 0xff9a1a, emissiveIntensity: 1.1 })),
  );
  const darkMat = clipped(new THREE.MeshStandardMaterial({ color: 0x5a2e12, roughness: 0.6 }));
  const cap = new THREE.Mesh(lanternGeos.cap, darkMat);
  cap.position.y = 0.47;
  const base = new THREE.Mesh(lanternGeos.base, darkMat);
  base.position.y = -0.47;
  const handle = new THREE.Mesh(lanternGeos.handle, darkMat);
  handle.position.y = 0.54;
  const halo = new THREE.Mesh(
    lanternGeos.halo,
    clipped(
      new THREE.MeshBasicMaterial({
        color: 0xffc860,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    ),
  );
  g.add(body, cap, base, handle, halo);
  return g;
}

function makeBomb(): THREE.Group {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 24, 18),
    clipped(new THREE.MeshStandardMaterial({ color: 0x3b1a66, emissive: 0x2a0a55, emissiveIntensity: 0.8, roughness: 0.35, metalness: 0.4 })),
  );
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.2, 0.2, 12),
    clipped(new THREE.MeshStandardMaterial({ color: 0x777777 })),
  );
  neck.position.y = 0.55;
  const spark = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 10, 8),
    clipped(new THREE.MeshBasicMaterial({ color: 0xff3322 })),
  );
  spark.position.y = 0.85;
  spark.name = 'spark';
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.05, 6, 28),
    clipped(new THREE.MeshBasicMaterial({ color: 0xff2255 })),
  );
  band.rotation.x = Math.PI / 2;
  g.add(ball, neck, spark, band);
  return g;
}

interface Cell {
  index: number;
  x: number;
  z: number;
  lantern: THREE.Group;
  bomb: THREE.Group;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  height: number; // 0..1 animated
  kind: Kind | null; // object currently shown (may be dropping)
  active: boolean; // raised and clickable
  remaining: number;
  flash: number; // red miss flash 0..1
  good: number; // pop flash 0..1
  shake: number;
}

const cells: Cell[] = [];
const hitMeshes: THREE.Mesh[] = [];
const hitGeo = new THREE.CylinderGeometry(1.0, 1.0, 2.4, 12);
const hitMat = new THREE.MeshBasicMaterial({ visible: false });

for (let i = 0; i < 9; i++) {
  const col = i % 3;
  const row = Math.floor(i / 3);
  const x = (col - 1) * SPACING;
  const z = (row - 1) * SPACING;

  const hole = new THREE.Mesh(holeGeo, holeMat);
  hole.position.set(x, 0.01, z);
  scene.add(hole);

  const ringMat = new THREE.MeshBasicMaterial({ color: 0x4a6a8a });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.set(x, 0.05, z);
  scene.add(ring);

  const lantern = makeLantern();
  const bomb = makeBomb();
  lantern.visible = false;
  bomb.visible = false;
  lantern.position.set(x, HIDE_Y, z);
  bomb.position.set(x, HIDE_Y, z);
  scene.add(lantern, bomb);

  const hit = new THREE.Mesh(hitGeo, hitMat);
  hit.position.set(x, 1.0, z);
  hit.userData.cell = i;
  scene.add(hit);
  hitMeshes.push(hit);

  cells.push({
    index: i, x, z, lantern, bomb, ring, ringMat,
    height: 0, kind: null, active: false, remaining: 0, flash: 0, good: 0, shake: 0,
  });
}
scene.updateMatrixWorld(true);

// ---------- particles ----------
interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}
const particles: Particle[] = [];
const particleGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);

function burst(x: number, y: number, z: number, colors: number[], count: number): void {
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: colors[i % colors.length],
      transparent: true,
    });
    const mesh = new THREE.Mesh(particleGeo, mat);
    mesh.position.set(x, y, z);
    const a = Math.random() * Math.PI * 2;
    const sp = 1.5 + Math.random() * 3;
    const vel = new THREE.Vector3(Math.cos(a) * sp, 2 + Math.random() * 4, Math.sin(a) * sp);
    scene.add(mesh);
    particles.push({ mesh, vel, life: 0.7, maxLife: 0.7 });
  }
}

function floatText(text: string, px: number, py: number, color: string): void {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = `position:absolute;left:${px}px;top:${py}px;transform:translate(-50%,-50%);font:800 26px system-ui,sans-serif;color:${color};text-shadow:0 2px 4px #000;pointer-events:none;`;
  layer.appendChild(el);
  const anim = el.animate(
    [
      { transform: 'translate(-50%,-50%)', opacity: 1 },
      { transform: 'translate(-50%,-90px)', opacity: 0 },
    ],
    { duration: 700, easing: 'ease-out' },
  );
  anim.onfinish = () => el.remove();
  window.setTimeout(() => el.remove(), 1000);
}

// ---------- game state ----------
let status: Status = 'ready';
let score = 0;
let timeLeft = ROUND_SECONDS;
let spawnTimer = 0.8;
let spawnCount = 0;
let hoverCell = -1;
let shakeCam = 0;

function activeCells(): number[] {
  return cells.filter((c) => c.active).map((c) => c.index);
}

function syncState(): void {
  window.__TASK_STATE__ = {
    status,
    score,
    timeLeft: Math.max(0, timeLeft),
    activeCells: activeCells(),
  };
}

function showOverlay(): void {
  if (status === 'playing') {
    overlay.style.display = 'none';
    return;
  }
  overlay.style.display = 'flex';
  if (status === 'ready') {
    overlayTitle.textContent = 'Lantern Pop';
    overlayMsg.textContent =
      'Click raised lanterns (+10). Avoid the purple bombs and empty cells (-5). Score 150 in 45 s to win.';
    overlayBtn.textContent = 'Start';
  } else {
    overlayTitle.textContent = status === 'won' ? 'You win!' : 'You lost';
    overlayMsg.textContent = `Final score: ${score}` + (status === 'lost' && timeLeft > 0 ? ' (bomb!)' : '');
    overlayBtn.textContent = 'Restart';
  }
}

function updateHud(): void {
  hudScore.textContent = String(score);
  hudTime.textContent = Math.max(0, timeLeft).toFixed(1);
  hudStatus.textContent = status;
  syncState();
}

function resetCells(): void {
  for (const c of cells) {
    c.active = false;
    c.kind = null;
    c.height = 0;
    c.remaining = 0;
    c.flash = 0;
    c.good = 0;
    c.shake = 0;
    c.lantern.visible = false;
    c.bomb.visible = false;
  }
}

function startRound(): void {
  rng = mulberry32(SEED);
  score = 0;
  timeLeft = ROUND_SECONDS;
  spawnTimer = 0.8;
  spawnCount = 0;
  resetCells();
  status = 'playing';
  showOverlay();
  updateHud();
}

function endRound(result: 'won' | 'lost'): void {
  status = result;
  for (const c of cells) c.active = false;
  showOverlay();
  updateHud();
}

function spawn(): void {
  const free = cells.filter((c) => !c.active);
  if (free.length === 0) return;
  const cell = free[Math.floor(rng() * free.length)];
  const bombRoll = rng();
  const kind: Kind = spawnCount > 0 && bombRoll < 0.16 ? 'bomb' : 'lantern';
  spawnCount++;
  const duration = Math.max(0.55, 1.5 - score * 0.006);
  cell.kind = kind;
  cell.active = true;
  cell.remaining = duration;
  cell.lantern.visible = kind === 'lantern';
  cell.bomb.visible = kind === 'bomb';
}

function cellScreenPos(c: Cell): { x: number; y: number } {
  const v = new THREE.Vector3(c.x, 0.9, c.z).project(camera);
  return { x: (v.x * 0.5 + 0.5) * 640, y: (-v.y * 0.5 + 0.5) * 360 };
}

function pickCell(clientX: number, clientY: number): number {
  const rect = canvas.getBoundingClientRect();
  const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
  const rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2(nx, ny), camera);
  const hits = rc.intersectObjects(hitMeshes, false);
  if (hits.length === 0) return -1;
  return hits[0].object.userData.cell as number;
}

function handleClick(clientX: number, clientY: number): void {
  if (status !== 'playing') return;
  const idx = pickCell(clientX, clientY);
  const rect = canvas.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  if (idx < 0) {
    // clicked outside every cell: costs nothing
    return;
  }
  const c = cells[idx];
  if (c.active && c.kind === 'lantern') {
    c.active = false;
    c.good = 1;
    score += 10;
    burst(c.x, c.lantern.position.y, c.z, [0xffd24a, 0xff9a1a, 0xffffff], 22);
    floatText('+10', px, py, '#ffd24a');
    c.lantern.visible = false;
    c.kind = null;
  } else if (c.active && c.kind === 'bomb') {
    c.active = false;
    burst(c.x, c.bomb.position.y, c.z, [0xff3322, 0xff9900, 0x8844ff], 40);
    floatText('BOOM', px, py, '#ff4433');
    c.bomb.visible = false;
    c.kind = null;
    shakeCam = 1;
    endRound('lost');
    return;
  } else {
    score = Math.max(0, score - 5);
    c.flash = 1;
    c.shake = 1;
    floatText('-5', px, py, '#ff5555');
  }
  updateHud();
}

// ---------- input ----------
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  hoverCell = pickCell(e.clientX, e.clientY);
  handleClick(e.clientX, e.clientY);
});
canvas.addEventListener('pointermove', (e) => {
  hoverCell = pickCell(e.clientX, e.clientY);
});
canvas.addEventListener('pointerleave', () => {
  hoverCell = -1;
});

overlayBtn.addEventListener('click', () => {
  overlayBtn.blur();
  if (status === 'ready') startRound();
  else if (status !== 'playing') startRound();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (status === 'ready') {
      e.preventDefault();
      startRound();
    }
  } else if (e.key === 'r' || e.key === 'R') {
    startRound();
  }
});

// ---------- loop ----------
const tmpColor = new THREE.Color();
const baseRing = new THREE.Color(0x4a6a8a);
const hoverRing = new THREE.Color(0x66ffe0);
const missRing = new THREE.Color(0xff3333);
const goodRing = new THREE.Color(0xffe066);

function update(dt: number): void {
  if (status === 'playing') {
    timeLeft -= dt;
    const diff = Math.max(0.3, 0.85 - score * 0.0035);
    spawnTimer -= dt;
    while (spawnTimer <= 0 && status === 'playing') {
      spawn();
      spawnTimer += diff * (0.7 + rng() * 0.6);
    }
    for (const c of cells) {
      if (c.active) {
        c.remaining -= dt;
        if (c.remaining <= 0) c.active = false;
      }
    }
    if (timeLeft <= 0) {
      timeLeft = 0;
      endRound(score >= WIN_SCORE ? 'won' : 'lost');
    }
    updateHud();
  }

  const t = performance.now() / 1000;
  for (const c of cells) {
    const target = c.active ? 1 : 0;
    const speed = c.active ? 9 : 6;
    c.height += (target - c.height) * Math.min(1, speed * dt);
    if (!c.active && c.height < 0.02) {
      c.height = 0;
      c.lantern.visible = false;
      c.bomb.visible = false;
      c.kind = null;
    }
    const y = HIDE_Y + (RISE_Y - HIDE_Y) * c.height + (c.active ? Math.sin(t * 5 + c.index) * 0.04 : 0);
    c.lantern.position.y = y;
    c.bomb.position.y = y;
    c.bomb.rotation.y = t * 2;
    const spark = c.bomb.getObjectByName('spark');
    if (spark) spark.scale.setScalar(0.8 + 0.5 * Math.abs(Math.sin(t * 14)));

    c.flash = Math.max(0, c.flash - dt * 2.5);
    c.good = Math.max(0, c.good - dt * 2.5);
    c.shake = Math.max(0, c.shake - dt * 4);

    tmpColor.copy(baseRing);
    if (hoverCell === c.index) tmpColor.copy(hoverRing);
    if (c.good > 0) tmpColor.lerp(goodRing, c.good);
    if (c.flash > 0) tmpColor.lerp(missRing, c.flash);
    c.ringMat.color.copy(tmpColor);
    const sc = 1 + (hoverCell === c.index ? 0.08 : 0) + c.good * 0.25 + c.flash * 0.15;
    c.ring.scale.set(sc, 1 + c.flash * 3, sc);
    const sx = Math.sin(t * 60) * 0.08 * c.shake;
    c.ring.position.x = c.x + sx;
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      (p.mesh.material as THREE.Material).dispose();
      particles.splice(i, 1);
      continue;
    }
    p.vel.y -= 12 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.rotation.x += dt * 8;
    p.mesh.rotation.y += dt * 6;
    (p.mesh.material as THREE.MeshBasicMaterial).opacity = p.life / p.maxLife;
  }

  shakeCam = Math.max(0, shakeCam - dt * 2);
  camera.position.x = Math.sin(t * 70) * 0.15 * shakeCam;
}

// ---------- start ----------
showOverlay();
updateHud();
window.__TASK_READY__ = false;

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  update(dt);
  camera.lookAt(0, 0.2, 0.2);
  renderer.render(scene, camera);
  if (!window.__TASK_READY__) window.__TASK_READY__ = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// keep references used only for typing/completeness
void cellScreenPos;
