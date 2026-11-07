import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

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

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

interface TexSpec {
  base: string;
  bands: string[];
  bandCount: number;
  blobs: string[];
  blobCount: number;
  blobSize: number;
}

function makePlanetTexture(spec: TexSpec, seed: number): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const rnd = mulberry32(seed);
  g.fillStyle = spec.base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < spec.bandCount; i++) {
    g.globalAlpha = 0.2 + rnd() * 0.4;
    g.fillStyle = spec.bands[Math.floor(rnd() * spec.bands.length)];
    g.fillRect(0, rnd() * h, w, 2 + rnd() * 12);
  }
  for (let i = 0; i < spec.blobCount; i++) {
    g.globalAlpha = 0.3 + rnd() * 0.5;
    g.fillStyle = spec.blobs[Math.floor(rnd() * spec.blobs.length)];
    const x = rnd() * w;
    const y = rnd() * h;
    const rx = 2 + rnd() * spec.blobSize;
    const ry = rx * (0.5 + rnd() * 0.5);
    for (const dx of [-w, 0, w]) {
      g.beginPath();
      g.ellipse(x + dx, y, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function makeGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,245,200,1)');
  grad.addColorStop(0.2, 'rgba(255,200,90,0.75)');
  grad.addColorStop(0.5, 'rgba(255,140,40,0.25)');
  grad.addColorStop(1, 'rgba(255,100,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSunTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#ffcf55');
  grad.addColorStop(0.5, '#fff0a0');
  grad.addColorStop(1, '#ffcf55');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 128);
  const rnd = mulberry32(99);
  for (let i = 0; i < 160; i++) {
    g.globalAlpha = 0.15 + rnd() * 0.25;
    g.fillStyle = rnd() < 0.5 ? '#ff9d2e' : '#fffbe0';
    const x = rnd() * 256;
    const y = rnd() * 128;
    const r = 2 + rnd() * 9;
    for (const dx of [-256, 0, 256]) {
      g.beginPath();
      g.arc(x + dx, y, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRingTexture(colors: string[], seed: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 4;
  const g = c.getContext('2d')!;
  const rnd = mulberry32(seed);
  for (let x = 0; x < 256; x++) {
    const u = x / 255;
    let a = 0.35 + 0.55 * rnd();
    if (u < 0.08 || u > 0.97) a *= 0.3;
    if (u > 0.62 && u < 0.68) a = 0.05; // gap
    g.globalAlpha = a;
    g.fillStyle = colors[Math.floor(rnd() * colors.length)];
    g.fillRect(x, 0, 1, 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- data ----------
interface MoonDef {
  radius: number;
  orbit: number;
  periodSec: number;
  color: number;
}
interface PlanetDef {
  name: string;
  radius: number;
  orbit: number;
  periodDays: number;
  distanceMkm: number;
  spin: number;
  tex: TexSpec;
  ring?: { inner: number; outer: number; colors: string[] };
  moons: MoonDef[];
}

const PLANETS: PlanetDef[] = [
  {
    name: 'Mercury', radius: 0.7, orbit: 10, periodDays: 88, distanceMkm: 57.9, spin: 0.4,
    tex: { base: '#8c8279', bands: ['#6f665e', '#a39a90'], bandCount: 6, blobs: ['#5e5750', '#b0a89d'], blobCount: 60, blobSize: 8 },
    moons: [],
  },
  {
    name: 'Venus', radius: 1.2, orbit: 14, periodDays: 224.7, distanceMkm: 108.2, spin: -0.2,
    tex: { base: '#d9b36a', bands: ['#e8cc8f', '#c39a52', '#f0dfae'], bandCount: 22, blobs: ['#e9d29a'], blobCount: 20, blobSize: 14 },
    moons: [],
  },
  {
    name: 'Earth', radius: 1.3, orbit: 19, periodDays: 365.25, distanceMkm: 149.6, spin: 1.2,
    tex: { base: '#1f5fa8', bands: ['#2a74c4', '#ffffff'], bandCount: 6, blobs: ['#3f8f3f', '#5a9a43', '#8a7b4a'], blobCount: 45, blobSize: 16 },
    moons: [{ radius: 0.35, orbit: 2.6, periodSec: 5, color: 0xbdbdbd }],
  },
  {
    name: 'Mars', radius: 0.9, orbit: 25, periodDays: 687, distanceMkm: 227.9, spin: 1.1,
    tex: { base: '#b5532f', bands: ['#8f3d20', '#d07a4a'], bandCount: 8, blobs: ['#7d3519', '#d9946a'], blobCount: 45, blobSize: 10 },
    moons: [],
  },
  {
    name: 'Jupiter', radius: 3.0, orbit: 35, periodDays: 4331, distanceMkm: 778.5, spin: 2.0,
    tex: { base: '#c9a27a', bands: ['#a8744c', '#e8d4b4', '#8c5b3a', '#f1e4cc'], bandCount: 40, blobs: ['#b5472f'], blobCount: 3, blobSize: 9 },
    moons: [{ radius: 0.4, orbit: 4.8, periodSec: 7, color: 0xd8c9a8 }],
  },
  {
    name: 'Saturn', radius: 2.6, orbit: 45, periodDays: 10747, distanceMkm: 1432, spin: 1.8,
    tex: { base: '#dcc58f', bands: ['#c9ae75', '#eedfb0', '#b89a62'], bandCount: 30, blobs: ['#e8d7a6'], blobCount: 10, blobSize: 10 },
    ring: { inner: 3.4, outer: 5.9, colors: ['#d8c79c', '#b9a77e', '#eadcb8', '#9c8b66'] },
    moons: [],
  },
  {
    name: 'Uranus', radius: 1.8, orbit: 55, periodDays: 30589, distanceMkm: 2867, spin: -1.0,
    tex: { base: '#8fd3d8', bands: ['#7cc3ca', '#a8e2e6'], bandCount: 10, blobs: ['#b5eef0'], blobCount: 8, blobSize: 12 },
    moons: [],
  },
  {
    name: 'Neptune', radius: 1.7, orbit: 64, periodDays: 59800, distanceMkm: 4515, spin: 1.0,
    tex: { base: '#2f4fc2', bands: ['#2540a0', '#4c6fe0'], bandCount: 14, blobs: ['#1b2f80', '#8fa6ff'], blobCount: 8, blobSize: 10 },
    moons: [],
  },
];

// ---------- renderer / scene ----------
const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.setClearColor(0x02030a, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 640 / 360, 0.1, 3000);
const OVERVIEW_POS = new THREE.Vector3(0, 85, 125);
const OVERVIEW_TARGET = new THREE.Vector3(0, 0, 0);
camera.position.copy(OVERVIEW_POS);
camera.lookAt(OVERVIEW_TARGET);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(OVERVIEW_TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 35;
controls.maxDistance = 300;
controls.maxPolarAngle = Math.PI * 0.47;
controls.update();

// starfield
{
  const rnd = mulberry32(1234);
  const n = 1500;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = rnd() * 2 - 1;
    const th = rnd() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const r = 1200;
    pos[i * 3] = r * s * Math.cos(th);
    pos[i * 3 + 1] = r * u;
    pos[i * 3 + 2] = r * s * Math.sin(th);
    const b = 0.4 + rnd() * 0.6;
    const warm = rnd();
    col[i * 3] = b * (0.8 + 0.2 * warm);
    col[i * 3 + 1] = b * 0.9;
    col[i * 3 + 2] = b * (1 - 0.2 * warm);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, depthWrite: false });
  scene.add(new THREE.Points(geo, mat));
}

// star
const STAR_RADIUS = 4;
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(STAR_RADIUS, 48, 32),
  new THREE.MeshBasicMaterial({ map: makeSunTexture() }),
);
scene.add(sun);
const glow = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  }),
);
glow.scale.setScalar(26);
scene.add(glow);
const sunLight = new THREE.PointLight(0xfff1d6, 3, 0, 0);
scene.add(sunLight);
scene.add(new THREE.AmbientLight(0x30384f, 1.2));

// planets
interface PlanetRuntime {
  def: PlanetDef;
  pivot: THREE.Group;
  body: THREE.Mesh;
  hit: THREE.Mesh;
  phase: number;
  periodSec: number;
  moons: { def: MoonDef; pivot: THREE.Group; phase: number }[];
  focusDist: number;
}

const hitGeo = new THREE.SphereGeometry(1, 12, 8);
const planets: PlanetRuntime[] = PLANETS.map((def, i) => {
  const pivot = new THREE.Group();
  scene.add(pivot);

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(def.radius, 48, 32),
    new THREE.MeshStandardMaterial({ map: makePlanetTexture(def.tex, 100 + i * 17), roughness: 0.9, metalness: 0 }),
  );
  body.rotation.z = 0.2;
  pivot.add(body);

  const hit = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false }));
  hit.userData.index = i;
  pivot.add(hit);

  if (def.ring) {
    const rg = new THREE.RingGeometry(def.ring.inner, def.ring.outer, 96, 1);
    const p = rg.attributes.position as THREE.BufferAttribute;
    const uv = rg.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      const r = Math.hypot(p.getX(k), p.getY(k));
      uv.setXY(k, (r - def.ring.inner) / (def.ring.outer - def.ring.inner), 0.5);
    }
    const ring = new THREE.Mesh(
      rg,
      new THREE.MeshStandardMaterial({
        map: makeRingTexture(def.ring.colors, 7 + i),
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        roughness: 1,
      }),
    );
    ring.rotation.x = Math.PI / 2 - 0.1;
    ring.rotation.y = 0.2;
    pivot.add(ring);
  }

  const moons = def.moons.map((m, k) => {
    const mp = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(m.radius, 24, 16),
      new THREE.MeshStandardMaterial({ color: m.color, roughness: 1 }),
    );
    mesh.position.x = m.orbit;
    mp.add(mesh);
    mp.rotation.x = 0.15;
    pivot.add(mp);
    return { def: m, pivot: mp, phase: k * 2 + i };
  });

  // orbit line
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k < 160; k++) {
    const a = (k / 160) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * def.orbit, 0, Math.sin(a) * def.orbit));
  }
  const line = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x5b6b8c, transparent: true, opacity: 0.55 }),
  );
  scene.add(line);

  const outer = def.ring ? def.ring.outer : def.radius;
  return {
    def,
    pivot,
    body,
    hit,
    phase: i * 1.7 + 0.5,
    periodSec: 7 * Math.pow(def.periodDays / 88, 0.55),
    moons,
    focusDist: Math.max(def.radius * 4.5, outer * 2.6, 4.5),
  };
});

// ---------- UI ----------
const uiStyle = document.createElement('style');
uiStyle.textContent = `
  #pauseBtn { position: absolute; left: 10px; top: 10px; padding: 5px 14px; font: 600 13px system-ui, sans-serif;
    color: #e8efff; background: rgba(20,30,60,0.75); border: 1px solid #5b6b8c; border-radius: 4px; cursor: pointer; }
  #pauseBtn:hover { background: rgba(40,60,110,0.85); }
  #infoPanel { position: absolute; right: 10px; top: 10px; width: 170px; padding: 8px 10px; display: none;
    color: #e8efff; background: rgba(10,16,34,0.8); border: 1px solid #5b6b8c; border-radius: 4px; pointer-events: none; }
  #infoPanel h2 { margin: 0 0 4px; font-size: 16px; }
  #infoPanel div { font-size: 12px; }
  #infoPanel span { color: #9fb4e0; }
  #hint { position: absolute; left: 10px; top: 340px; font-size: 11px; color: #8fa0c4; pointer-events: none; }
`;
document.head.appendChild(uiStyle);

const pauseBtn = document.createElement('button');
pauseBtn.id = 'pauseBtn';
pauseBtn.type = 'button';
pauseBtn.textContent = 'Pause';
document.body.appendChild(pauseBtn);

const panel = document.createElement('div');
panel.id = 'infoPanel';
const panelName = document.createElement('h2');
const panelPeriod = document.createElement('div');
const panelDist = document.createElement('div');
panel.append(panelName, panelPeriod, panelDist);
document.body.appendChild(panel);

const hint = document.createElement('div');
hint.id = 'hint';
hint.textContent = 'Click a planet to focus · Esc to return · drag/scroll to explore';
document.body.appendChild(hint);

// ---------- state ----------
let paused = false;
let simTime = 0;
let focusedIndex: number | null = null;
type Mode = 'overview' | 'transition' | 'follow';
let mode: Mode = 'overview';
const savedPos = OVERVIEW_POS.clone();
const savedTarget = OVERVIEW_TARGET.clone();
const startPos = new THREE.Vector3();
const startTarget = new THREE.Vector3();
let transT = 0;
const TRANS_DURATION = 1.5;
let ready = false;

pauseBtn.addEventListener('click', () => {
  paused = !paused;
  pauseBtn.textContent = paused ? 'Play' : 'Pause';
});

function beginTransition(): void {
  if (mode === 'overview') {
    savedPos.copy(camera.position);
    savedTarget.copy(controls.target);
  }
  startPos.copy(camera.position);
  startTarget.copy(mode === 'overview' ? controls.target : currentLookTarget);
  controls.enabled = false;
  transT = 0;
  mode = 'transition';
}

const currentLookTarget = new THREE.Vector3();

function focusPlanet(index: number): void {
  if (focusedIndex === index) return;
  focusedIndex = index;
  const d = planets[index].def;
  panelName.textContent = d.name;
  panelPeriod.innerHTML = '';
  panelDist.innerHTML = '';
  const l1 = document.createElement('span');
  l1.textContent = 'Orbital period: ';
  panelPeriod.append(l1, `${d.periodDays.toLocaleString('en-US')} Earth days`);
  const l2 = document.createElement('span');
  l2.textContent = 'Distance from star: ';
  panelDist.append(l2, `${d.distanceMkm.toLocaleString('en-US')} million km`);
  panel.style.display = 'block';
  beginTransition();
}

function unfocus(): void {
  if (focusedIndex === null) return;
  focusedIndex = null;
  panel.style.display = 'none';
  beginTransition();
}

function findPlanet(name: string): number {
  return planets.findIndex((p) => p.def.name.toLowerCase() === String(name).toLowerCase());
}

const tmpR = new THREE.Vector3();
const tmpT = new THREE.Vector3();
const desiredPos = new THREE.Vector3();
const desiredTarget = new THREE.Vector3();

function computeDesired(): void {
  if (focusedIndex === null) {
    desiredPos.copy(savedPos);
    desiredTarget.copy(savedTarget);
    return;
  }
  const p = planets[focusedIndex];
  const pp = p.pivot.position;
  tmpR.set(pp.x, 0, pp.z).normalize();
  tmpT.set(-tmpR.z, 0, tmpR.x);
  desiredPos
    .copy(tmpR)
    .multiplyScalar(-0.6)
    .addScaledVector(tmpT, 0.7)
    .setY(0.4)
    .normalize()
    .multiplyScalar(p.focusDist)
    .add(pp);
  desiredTarget.copy(pp);
}

// click handling
let downX = 0;
let downY = 0;
let downValid = false;
canvas.addEventListener('pointerdown', (e) => {
  downX = e.clientX;
  downY = e.clientY;
  downValid = true;
});
const raycaster = new THREE.Raycaster();
canvas.addEventListener('pointerup', (e) => {
  if (!downValid) return;
  downValid = false;
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -(((e.clientY - rect.top) / rect.height) * 2 - 1),
  );
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(planets.map((p) => p.hit), false);
  if (hits.length > 0) {
    focusPlanet(hits[0].object.userData.index as number);
  } else {
    unfocus();
  }
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') unfocus();
});

// ---------- global API ----------
const w = window as unknown as Record<string, unknown>;
w.__focusPlanet = (name: string): void => {
  const i = findPlanet(name);
  if (i >= 0) focusPlanet(i);
};
w.__unfocus = (): void => unfocus();
const stateObj = {};
Object.defineProperties(stateObj, {
  ready: { get: () => ready, enumerable: true },
  focused: { get: () => (focusedIndex === null ? null : planets[focusedIndex].def.name), enumerable: true },
  paused: { get: () => paused, enumerable: true },
  planets: {
    get: () => planets.map((p) => ({ name: p.def.name, x: p.pivot.position.x, y: p.pivot.position.y, z: p.pivot.position.z })),
    enumerable: true,
  },
  cameraDistanceToFocus: {
    get: () => (focusedIndex === null ? null : camera.position.distanceTo(planets[focusedIndex].pivot.position)),
    enumerable: true,
  },
});
Object.defineProperty(w, '__TASK_STATE__', { value: stateObj, writable: false, configurable: false });

// ---------- loop ----------
const clock = new THREE.Clock();

function updatePlanets(dt: number): void {
  if (!paused) simTime += dt;
  for (const p of planets) {
    const a = p.phase + (simTime * Math.PI * 2) / p.periodSec;
    p.pivot.position.set(Math.cos(a) * p.def.orbit, 0, Math.sin(a) * p.def.orbit);
    p.body.rotation.y += p.def.spin * dt;
    for (const m of p.moons) {
      m.pivot.rotation.y = m.phase + (simTime * Math.PI * 2) / m.def.periodSec;
    }
  }
  sun.rotation.y += 0.05 * dt;
}

function updateHitProxies(): void {
  for (const p of planets) {
    const d = camera.position.distanceTo(p.pivot.position);
    p.hit.scale.setScalar(Math.max(p.def.radius * 1.05, d * 0.018));
  }
}

function frame(): void {
  const dt = Math.min(clock.getDelta(), 0.1);
  updatePlanets(dt);

  if (mode === 'overview') {
    controls.update();
  } else {
    computeDesired();
    if (mode === 'transition') {
      transT += dt / TRANS_DURATION;
      if (transT >= 1) {
        transT = 1;
        if (focusedIndex !== null) {
          mode = 'follow';
        } else {
          mode = 'overview';
        }
      }
      const e = easeInOutCubic(transT);
      camera.position.lerpVectors(startPos, desiredPos, e);
      currentLookTarget.lerpVectors(startTarget, desiredTarget, e);
      camera.lookAt(currentLookTarget);
      if (mode === 'overview') {
        controls.target.copy(savedTarget);
        controls.enabled = true;
        controls.update();
      }
    } else {
      camera.position.copy(desiredPos);
      currentLookTarget.copy(desiredTarget);
      camera.lookAt(currentLookTarget);
    }
  }

  updateHitProxies();
  renderer.render(scene, camera);
  if (!ready) {
    ready = true;
    (window as unknown as Record<string, unknown>).__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
