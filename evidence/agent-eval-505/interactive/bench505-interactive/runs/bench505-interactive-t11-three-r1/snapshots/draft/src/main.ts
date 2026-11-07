import * as THREE from 'three';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: unknown;
    __focusPlanet?: (name: string) => void;
    __unfocus?: () => void;
  }
}

// ---------- helpers ----------
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

type RGB = [number, number, number];
const css = (c: RGB, a = 1): string =>
  `rgba(${Math.round(Math.max(0, Math.min(255, c[0])))},${Math.round(Math.max(0, Math.min(255, c[1])))},${Math.round(Math.max(0, Math.min(255, c[2])))},${a})`;
const shade = (c: RGB, f: number): RGB => [c[0] * f, c[1] * f, c[2] * f];

function canvasTexture(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

type TexKind = 'rocky' | 'banded' | 'earth' | 'sun' | 'moon';

function makePlanetTexture(kind: TexKind, base: RGB, seed: number): THREE.CanvasTexture {
  const W = 256;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const rnd = mulberry32(seed);

  if (kind === 'banded') {
    let y = 0;
    while (y < H) {
      const h = 2 + rnd() * 9;
      const f = 0.72 + rnd() * 0.5;
      g.fillStyle = css(shade(base, f));
      g.fillRect(0, y, W, h + 1);
      y += h;
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = css(shade(base, 0.8 + rnd() * 0.5), 0.25);
      g.beginPath();
      g.ellipse(rnd() * W, rnd() * H, 6 + rnd() * 20, 1 + rnd() * 3, 0, 0, Math.PI * 2);
      g.fill();
    }
  } else if (kind === 'earth') {
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#dfeaf2');
    grad.addColorStop(0.12, '#2a62b0');
    grad.addColorStop(0.88, '#2a62b0');
    grad.addColorStop(1, '#dfeaf2');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) {
      const x = rnd() * W;
      const y = 22 + rnd() * (H - 44);
      const r = 5 + rnd() * 16;
      for (let k = 0; k < 6; k++) {
        g.fillStyle = rnd() > 0.3 ? 'rgba(70,140,70,0.9)' : 'rgba(150,130,80,0.9)';
        g.beginPath();
        g.ellipse(x + (rnd() - 0.5) * r * 1.2, y + (rnd() - 0.5) * r * 0.8, r * (0.4 + rnd() * 0.5), r * (0.3 + rnd() * 0.4), rnd() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }
    for (let i = 0; i < 30; i++) {
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.beginPath();
      g.ellipse(rnd() * W, rnd() * H, 8 + rnd() * 20, 1.5 + rnd() * 2.5, 0, 0, Math.PI * 2);
      g.fill();
    }
  } else if (kind === 'sun') {
    g.fillStyle = css(base);
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 500; i++) {
      const light = rnd() > 0.45;
      g.fillStyle = light ? 'rgba(255,230,120,0.25)' : 'rgba(210,90,10,0.25)';
      g.beginPath();
      g.arc(rnd() * W, rnd() * H, 2 + rnd() * 8, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    // rocky / moon
    g.fillStyle = css(base);
    g.fillRect(0, 0, W, H);
    const n = kind === 'moon' ? 140 : 320;
    for (let i = 0; i < n; i++) {
      const f = 0.7 + rnd() * 0.6;
      g.fillStyle = css(shade(base, f), 0.35);
      g.beginPath();
      g.arc(rnd() * W, rnd() * H, 1.5 + rnd() * (kind === 'moon' ? 9 : 6), 0, Math.PI * 2);
      g.fill();
    }
  }
  return canvasTexture(c);
}

function makeRingTexture(base: RGB, seed: number): THREE.CanvasTexture {
  const W = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = 4;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const rnd = mulberry32(seed);
  for (let x = 0; x < W; x++) {
    const u = x / W;
    let a = 0.35 + 0.55 * rnd();
    if (u < 0.08) a *= u / 0.08;
    if (u > 0.93) a *= (1 - u) / 0.07;
    if (u > 0.5 && u < 0.56) a *= 0.1; // gap
    g.fillStyle = css(shade(base, 0.8 + rnd() * 0.3), a);
    g.fillRect(x, 0, 1, 4);
  }
  return canvasTexture(c);
}

function makeGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,240,190,1)');
  grad.addColorStop(0.25, 'rgba(255,190,90,0.55)');
  grad.addColorStop(0.55, 'rgba(255,130,40,0.15)');
  grad.addColorStop(1, 'rgba(255,100,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return canvasTexture(c);
}

// ---------- renderer / scene ----------
const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.setClearColor(0x02030a, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 640 / 360, 0.1, 1200);

// Starfield
{
  const rnd = mulberry32(12345);
  const N = 1800;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = rnd() * 2 - 1;
    const th = rnd() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const R = 600;
    pos[i * 3] = R * s * Math.cos(th);
    pos[i * 3 + 1] = R * u;
    pos[i * 3 + 2] = R * s * Math.sin(th);
    const b = 0.4 + rnd() * 0.6;
    const warm = rnd();
    col[i * 3] = b * (0.8 + 0.2 * warm);
    col[i * 3 + 1] = b * 0.9;
    col[i * 3 + 2] = b * (1 - 0.2 * warm);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false });
  const stars = new THREE.Points(geo, mat);
  stars.frustumCulled = false;
  scene.add(stars);
}

// Star
const SUN_RADIUS = 5;
const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(SUN_RADIUS, 48, 32),
  new THREE.MeshBasicMaterial({ map: makePlanetTexture('sun', [255, 170, 40], 7) }),
);
scene.add(sunMesh);
const glow = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  }),
);
glow.scale.set(26, 26, 1);
scene.add(glow);

scene.add(new THREE.PointLight(0xfff1d6, 3.6, 0, 0));
scene.add(new THREE.AmbientLight(0x6070a0, 0.55));

// ---------- planets ----------
interface MoonDef {
  radius: number;
  dist: number;
  period: number; // seconds
  color: RGB;
}
interface PlanetDef {
  name: string;
  orbit: number; // scene units
  size: number;
  color: RGB;
  kind: TexKind;
  periodDays: number;
  distMkm: number;
  spin: number; // rad/s
  tilt: number;
  focusDist: number;
  ring?: { inner: number; outer: number; color: RGB };
  moons?: MoonDef[];
}

const DEFS: PlanetDef[] = [
  { name: 'Mercury', orbit: 11, size: 0.5, color: [150, 140, 130], kind: 'rocky', periodDays: 88, distMkm: 57.9, spin: 0.4, tilt: 0.03, focusDist: 3.6 },
  { name: 'Venus', orbit: 15.5, size: 0.9, color: [225, 190, 120], kind: 'rocky', periodDays: 224.7, distMkm: 108.2, spin: -0.3, tilt: 0.1, focusDist: 5.5 },
  {
    name: 'Earth', orbit: 20.5, size: 1.0, color: [60, 110, 190], kind: 'earth', periodDays: 365.25, distMkm: 149.6, spin: 1.2, tilt: 0.41, focusDist: 7,
    moons: [{ radius: 0.27, dist: 2.1, period: 5, color: [185, 185, 190] }],
  },
  { name: 'Mars', orbit: 26, size: 0.7, color: [195, 95, 55], kind: 'rocky', periodDays: 687, distMkm: 227.9, spin: 1.1, tilt: 0.44, focusDist: 4.6 },
  {
    name: 'Jupiter', orbit: 35, size: 2.5, color: [205, 165, 125], kind: 'banded', periodDays: 4333, distMkm: 778.5, spin: 2.0, tilt: 0.05, focusDist: 16,
    moons: [
      { radius: 0.4, dist: 4.2, period: 6, color: [200, 190, 160] },
      { radius: 0.3, dist: 5.5, period: 10, color: [160, 150, 140] },
    ],
  },
  {
    name: 'Saturn', orbit: 45, size: 2.0, color: [225, 200, 140], kind: 'banded', periodDays: 10759, distMkm: 1434, spin: 1.8, tilt: 0.47, focusDist: 15,
    ring: { inner: 2.8, outer: 4.6, color: [215, 195, 160] },
  },
  { name: 'Uranus', orbit: 54, size: 1.4, color: [140, 215, 225], kind: 'banded', periodDays: 30687, distMkm: 2871, spin: -1.0, tilt: 1.5, focusDist: 9 },
  { name: 'Neptune', orbit: 62, size: 1.3, color: [60, 90, 205], kind: 'banded', periodDays: 60190, distMkm: 4495, spin: 1.0, tilt: 0.5, focusDist: 8.5 },
];

interface Planet {
  def: PlanetDef;
  group: THREE.Group;
  mesh: THREE.Mesh;
  pick: THREE.Mesh;
  moons: { pivot: THREE.Object3D; mesh: THREE.Mesh; def: MoonDef; phase: number }[];
  phase: number;
  omega: number; // rad/s
}

const BASE_ORBIT_SECONDS = 14; // Mercury
const planets: Planet[] = [];
const pickMeshes: THREE.Mesh[] = [];

DEFS.forEach((def, i) => {
  const group = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.rotation.z = def.tilt;
  group.add(tilt);

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(def.size, 40, 28),
    new THREE.MeshStandardMaterial({
      map: makePlanetTexture(def.kind, def.color, 100 + i * 17),
      roughness: 0.95,
      metalness: 0,
    }),
  );
  tilt.add(mesh);

  if (def.ring) {
    const geo = new THREE.RingGeometry(def.ring.inner, def.ring.outer, 96, 1);
    const p = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      const len = Math.hypot(p.getX(k), p.getY(k));
      uv.setXY(k, (len - def.ring.inner) / (def.ring.outer - def.ring.inner), 0.5);
    }
    const ring = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        map: makeRingTexture(def.ring.color, 55),
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    tilt.add(ring);
  }

  const pick = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(def.size * (def.ring ? 1.9 : 1.1), 0.9), 12, 8),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  pick.userData.index = i;
  group.add(pick);
  pickMeshes.push(pick);

  const moons: Planet['moons'] = [];
  (def.moons ?? []).forEach((md, k) => {
    const pivot = new THREE.Object3D();
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(md.radius, 20, 14),
      new THREE.MeshStandardMaterial({ map: makePlanetTexture('moon', md.color, 900 + i * 7 + k), roughness: 1 }),
    );
    m.position.x = md.dist;
    pivot.add(m);
    pivot.rotation.x = 0.15 * (k + 1);
    group.add(pivot);
    moons.push({ pivot, mesh: m, def: md, phase: k * 2.1 });
  });

  // orbit line
  const pts: THREE.Vector3[] = [];
  const SEG = 160;
  for (let s = 0; s < SEG; s++) {
    const a = (s / SEG) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * def.orbit, 0, Math.sin(a) * def.orbit));
  }
  const line = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x6f86a8, transparent: true, opacity: 0.55 }),
  );
  scene.add(line);

  scene.add(group);
  const periodSec = BASE_ORBIT_SECONDS * Math.pow(def.periodDays / DEFS[0].periodDays, 0.6);
  planets.push({
    def,
    group,
    mesh,
    pick,
    moons,
    phase: i * 2.3 + 0.5,
    omega: (Math.PI * 2) / periodSec,
  });
});

let simTime = 0;
function updateSim(dt: number): void {
  simTime += dt;
  for (const p of planets) {
    const a = p.phase + p.omega * simTime;
    p.group.position.set(Math.cos(a) * p.def.orbit, 0, Math.sin(a) * p.def.orbit);
    p.mesh.rotation.y = p.def.spin * simTime;
    for (const m of p.moons) {
      m.pivot.rotation.y = m.phase + ((Math.PI * 2) / m.def.period) * simTime;
    }
  }
  sunMesh.rotation.y = simTime * 0.05;
}
updateSim(0);

// ---------- camera control ----------
const view = { theta: 0.6, phi: 1.0, radius: 100 };
const MIN_R = 25;
const MAX_R = 170;
const MIN_PHI = 0.12;
const MAX_PHI = 1.5;

interface Pose {
  pos: THREE.Vector3;
  target: THREE.Vector3;
}

function overviewPose(): Pose {
  const s = Math.sin(view.phi);
  return {
    pos: new THREE.Vector3(view.radius * s * Math.sin(view.theta), view.radius * Math.cos(view.phi), view.radius * s * Math.cos(view.theta)),
    target: new THREE.Vector3(0, 0, 0),
  };
}

const UP = new THREE.Vector3(0, 1, 0);
function focusPose(p: Planet): Pose {
  const pp = p.group.position;
  const radial = new THREE.Vector3(pp.x, 0, pp.z).normalize();
  const tangent = new THREE.Vector3(-radial.z, 0, radial.x);
  const dir = radial.multiplyScalar(-0.75).addScaledVector(tangent, 0.5).addScaledVector(UP, 0.4).normalize();
  return { pos: pp.clone().addScaledVector(dir, p.def.focusDist), target: pp.clone() };
}

let focusIndex = -1;
const camPos = overviewPose().pos;
const camTarget = new THREE.Vector3();
const TRANSITION_MS = 1500;
let transition: { fromPos: THREE.Vector3; fromTarget: THREE.Vector3; start: number } | null = null;

const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function beginTransition(): void {
  transition = { fromPos: camPos.clone(), fromTarget: camTarget.clone(), start: performance.now() };
}

function updateCamera(now: number): void {
  const end = focusIndex >= 0 ? focusPose(planets[focusIndex]) : overviewPose();
  if (transition) {
    const t = Math.min(1, (now - transition.start) / TRANSITION_MS);
    const e = easeInOutCubic(t);
    camPos.lerpVectors(transition.fromPos, end.pos, e);
    camTarget.lerpVectors(transition.fromTarget, end.target, e);
    if (t >= 1) transition = null;
  } else {
    camPos.copy(end.pos);
    camTarget.copy(end.target);
  }
  camera.position.copy(camPos);
  camera.lookAt(camTarget);
}

// ---------- UI ----------
const panel = document.createElement('div');
panel.style.cssText =
  'position:absolute;left:8px;top:8px;width:190px;padding:8px 10px;background:rgba(10,16,32,0.78);border:1px solid rgba(140,170,220,0.5);border-radius:6px;color:#e8eefc;pointer-events:none;display:none;font:13px/1.45 system-ui,sans-serif;';
const panelName = document.createElement('div');
panelName.id = 'planet-name';
panelName.style.cssText = 'font-size:16px;font-weight:600;margin-bottom:4px;';
const panelPeriod = document.createElement('div');
panelPeriod.id = 'planet-period';
const panelDist = document.createElement('div');
panelDist.id = 'planet-distance';
panel.append(panelName, panelPeriod, panelDist);
panel.id = 'info-panel';
document.body.appendChild(panel);

const hint = document.createElement('div');
hint.textContent = 'Click a planet · Drag to orbit · Scroll to zoom · Esc to return';
hint.style.cssText = 'position:absolute;left:8px;top:340px;color:rgba(200,215,240,0.7);font-size:11px;pointer-events:none;';
document.body.appendChild(hint);

const pauseBtn = document.createElement('button');
pauseBtn.id = 'pause-btn';
pauseBtn.textContent = 'Pause';
pauseBtn.style.cssText =
  'position:absolute;left:566px;top:8px;width:66px;padding:5px 0;background:rgba(10,16,32,0.8);color:#e8eefc;border:1px solid rgba(140,170,220,0.6);border-radius:5px;font:13px system-ui,sans-serif;cursor:pointer;';
document.body.appendChild(pauseBtn);

let paused = false;
pauseBtn.addEventListener('click', () => {
  paused = !paused;
  pauseBtn.textContent = paused ? 'Play' : 'Pause';
});

function focusPlanetByIndex(i: number): void {
  if (i === focusIndex) return;
  focusIndex = i;
  const d = planets[i].def;
  panelName.textContent = d.name;
  panelPeriod.textContent = `Orbital period: ${d.periodDays.toLocaleString('en-US')} Earth days`;
  panelDist.textContent = `Distance from star: ${d.distMkm.toLocaleString('en-US')} million km`;
  panel.style.display = 'block';
  beginTransition();
}

function unfocus(): void {
  if (focusIndex < 0) return;
  focusIndex = -1;
  panel.style.display = 'none';
  beginTransition();
}

window.__focusPlanet = (name: string): void => {
  const i = planets.findIndex((p) => p.def.name.toLowerCase() === String(name).toLowerCase());
  if (i >= 0) focusPlanetByIndex(i);
};
window.__unfocus = (): void => unfocus();

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') unfocus();
});

// ---------- pointer interaction ----------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pickAt(clientX: number, clientY: number): number {
  const r = canvas.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1));
  camera.updateMatrixWorld();
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(pickMeshes, false);
  return hits.length ? (hits[0].object.userData.index as number) : -1;
}

let dragging = false;
let moved = 0;
let lastX = 0;
let lastY = 0;
canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  moved = 0;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  moved += Math.abs(dx) + Math.abs(dy);
  if (focusIndex < 0 && !transition) {
    view.theta -= dx * 0.006;
    view.phi = Math.min(MAX_PHI, Math.max(MIN_PHI, view.phi - dy * 0.006));
  }
});
canvas.addEventListener('pointerup', (e) => {
  if (!dragging) return;
  dragging = false;
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  if (moved < 5) {
    const i = pickAt(e.clientX, e.clientY);
    if (i >= 0) focusPlanetByIndex(i);
    else unfocus();
  }
});
canvas.addEventListener('pointercancel', () => {
  dragging = false;
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    if (focusIndex >= 0 || transition) return;
    view.radius = Math.min(MAX_R, Math.max(MIN_R, view.radius * Math.exp(e.deltaY * 0.001)));
  },
  { passive: false },
);

// ---------- state ----------
Object.defineProperty(window, '__TASK_STATE__', {
  configurable: false,
  enumerable: true,
  get() {
    return Object.freeze({
      ready: ready,
      focused: focusIndex >= 0 ? planets[focusIndex].def.name : null,
      paused,
      planets: planets.map((p) => ({ name: p.def.name, x: p.group.position.x, y: p.group.position.y, z: p.group.position.z })),
      cameraDistanceToFocus: focusIndex >= 0 ? camera.position.distanceTo(planets[focusIndex].group.position) : null,
    });
  },
});

// ---------- loop ----------
let ready = false;
let last = performance.now();
camTarget.set(0, 0, 0);

function frame(): void {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) updateSim(dt);
  updateCamera(now);
  renderer.render(scene, camera);
  if (!ready) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
