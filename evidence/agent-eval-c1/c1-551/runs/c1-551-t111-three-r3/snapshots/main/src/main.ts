import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface PlanetDef {
  name: string;
  radius: number;
  orbit: number; // scene units
  periodDays: number;
  distanceMkm: number;
  color: string;
  accent: string;
  kind: 'rock' | 'earth' | 'gas' | 'ice';
  spin: number;
  tilt: number;
  ring?: boolean;
  moon?: boolean;
  focusDist: number;
}

interface Planet {
  def: PlanetDef;
  group: THREE.Group; // positioned on orbit
  mesh: THREE.Mesh;
  hit: THREE.Mesh;
  angle: number;
  omega: number;
  moonPivot?: THREE.Group;
  moonOmega: number;
}

interface TaskState {
  readonly ready: boolean;
  readonly focused: string | null;
  readonly paused: boolean;
  readonly planets: { name: string; x: number; y: number; z: number }[];
  readonly cameraDistanceToFocus: number | null;
}

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: TaskState;
    __focusPlanet?: (name: string) => void;
    __unfocus?: () => void;
  }
}

const W = 640;
const H = 360;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeTexture(def: { color: string; accent: string; kind: string }, seed: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  const rand = rng(seed);
  g.fillStyle = def.color;
  g.fillRect(0, 0, c.width, c.height);
  if (def.kind === 'gas' || def.kind === 'ice') {
    let y = 0;
    while (y < c.height) {
      const h = 3 + rand() * 12;
      g.globalAlpha = 0.25 + rand() * 0.4;
      g.fillStyle = rand() > 0.5 ? def.accent : def.color;
      g.fillRect(0, y, c.width, h);
      y += h;
    }
    g.globalAlpha = 1;
  } else if (def.kind === 'earth') {
    g.fillStyle = def.accent;
    for (let i = 0; i < 14; i++) {
      const x = rand() * c.width;
      const y = 15 + rand() * 98;
      const rx = 8 + rand() * 24;
      const ry = 5 + rand() * 14;
      for (const dx of [-c.width, 0, c.width]) {
        g.beginPath();
        g.ellipse(x + dx, y, rx, ry, rand() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = '#f2f6fa';
    g.fillRect(0, 0, c.width, 8);
    g.fillRect(0, c.height - 8, c.width, 8);
    g.globalAlpha = 0.35;
    for (let i = 0; i < 25; i++) {
      g.beginPath();
      g.ellipse(rand() * c.width, rand() * c.height, 10 + rand() * 20, 2 + rand() * 4, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  } else {
    for (let i = 0; i < 90; i++) {
      const r = 1 + rand() * 7;
      g.globalAlpha = 0.2 + rand() * 0.4;
      g.fillStyle = rand() > 0.5 ? def.accent : '#000000';
      g.beginPath();
      g.arc(rand() * c.width, rand() * c.height, r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

const DEFS: PlanetDef[] = [
  { name: 'Mercury', radius: 0.5, orbit: 7, periodDays: 88, distanceMkm: 57.9, color: '#9a9288', accent: '#d8d0c4', kind: 'rock', spin: 0.6, tilt: 0.03, focusDist: 3 },
  { name: 'Venus', radius: 0.9, orbit: 10, periodDays: 224.7, distanceMkm: 108.2, color: '#d9a85a', accent: '#f1d9a0', kind: 'gas', spin: -0.4, tilt: 0.1, focusDist: 5 },
  { name: 'Earth', radius: 1.0, orbit: 13.5, periodDays: 365.25, distanceMkm: 149.6, color: '#2a5fb8', accent: '#3f9a4f', kind: 'earth', spin: 1.5, tilt: 0.41, moon: true, focusDist: 6 },
  { name: 'Mars', radius: 0.7, orbit: 17, periodDays: 687, distanceMkm: 227.9, color: '#b8502e', accent: '#e08a5a', kind: 'rock', spin: 1.4, tilt: 0.44, focusDist: 4 },
  { name: 'Jupiter', radius: 2.2, orbit: 23, periodDays: 4331, distanceMkm: 778.5, color: '#c9a37c', accent: '#8a5a3c', kind: 'gas', spin: 2.2, tilt: 0.05, focusDist: 10 },
  { name: 'Saturn', radius: 1.8, orbit: 29.5, periodDays: 10747, distanceMkm: 1432, color: '#dcc58a', accent: '#b89a58', kind: 'gas', spin: 2.0, tilt: 0.47, ring: true, focusDist: 13 },
  { name: 'Uranus', radius: 1.3, orbit: 35.5, periodDays: 30589, distanceMkm: 2867, color: '#7fd3d8', accent: '#b4eef0', kind: 'ice', spin: -1.2, tilt: 0.3, focusDist: 7 },
];

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.setClearColor(0x000005, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 2000);
const OVERVIEW_POS = new THREE.Vector3(0, 48, 72);
camera.position.copy(OVERVIEW_POS);
camera.lookAt(0, 0, 0);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = false;
controls.enablePan = false;
controls.minDistance = 20;
controls.maxDistance = 140;
controls.maxPolarAngle = Math.PI * 0.95;
controls.target.set(0, 0, 0);
controls.update();

// Starfield
{
  const n = 1500;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const r = rng(42);
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1;
    const th = r() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const d = 600 + r() * 100;
    pos[i * 3] = d * s * Math.cos(th);
    pos[i * 3 + 1] = d * u;
    pos[i * 3 + 2] = d * s * Math.sin(th);
    const b = 0.5 + r() * 0.5;
    col[i * 3] = b;
    col[i * 3 + 1] = b * (0.85 + r() * 0.15);
    col[i * 3 + 2] = b * (0.8 + r() * 0.2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, fog: false }));
  stars.frustumCulled = false;
  scene.add(stars);
}

// Star
const STAR_RADIUS = 3;
{
  const tex = makeTexture({ color: '#ffb52e', accent: '#fff2a0', kind: 'rock' }, 7);
  const star = new THREE.Mesh(new THREE.SphereGeometry(STAR_RADIUS, 48, 32), new THREE.MeshBasicMaterial({ map: tex, color: 0xffe0a0 }));
  scene.add(star);

  const gc = document.createElement('canvas');
  gc.width = gc.height = 256;
  const g = gc.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,240,200,1)');
  grad.addColorStop(0.2, 'rgba(255,200,100,0.65)');
  grad.addColorStop(0.5, 'rgba(255,140,40,0.2)');
  grad.addColorStop(1, 'rgba(255,100,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const gt = new THREE.CanvasTexture(gc);
  gt.colorSpace = THREE.SRGBColorSpace;
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: gt, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
  );
  glow.scale.set(20, 20, 1);
  scene.add(glow);

  const light = new THREE.PointLight(0xfff0dd, 3.5, 0, 0);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x404858, 0.8));
}

// Ring texture
function makeRingTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 4;
  const g = c.getContext('2d')!;
  const rand = rng(99);
  const img = g.createImageData(256, 4);
  for (let x = 0; x < 256; x++) {
    const base = 0.55 + 0.35 * Math.sin(x * 0.35) * Math.sin(x * 0.11) + (rand() - 0.5) * 0.25;
    let a = Math.max(0, Math.min(1, base));
    if (x > 120 && x < 135) a *= 0.1; // gap
    for (let y = 0; y < 4; y++) {
      const i = (y * 256 + x) * 4;
      img.data[i] = 220;
      img.data[i + 1] = 200 - (x % 7) * 3;
      img.data[i + 2] = 150;
      img.data[i + 3] = Math.round(a * 230);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Planets
const planets: Planet[] = [];
const orbitMat = new THREE.LineBasicMaterial({ color: 0x5a6a88, transparent: true, opacity: 0.55 });

DEFS.forEach((def, i) => {
  // orbit line
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k < 160; k++) {
    const a = (k / 160) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * def.orbit, 0, Math.sin(a) * def.orbit));
  }
  scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), orbitMat));

  const group = new THREE.Group();
  scene.add(group);
  const tilt = new THREE.Group();
  tilt.rotation.z = def.tilt;
  group.add(tilt);

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(def.radius, 40, 28),
    new THREE.MeshStandardMaterial({ map: makeTexture(def, 100 + i * 13), roughness: 0.9, metalness: 0 }),
  );
  tilt.add(mesh);

  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(def.radius * 1.3, 1.1), 12, 8),
    new THREE.MeshBasicMaterial(),
  );
  hit.material.visible = false;
  group.add(hit);

  if (def.ring) {
    const inner = def.radius * 1.35;
    const outer = def.radius * 2.3;
    const rg = new THREE.RingGeometry(inner, outer, 96, 1);
    const p = rg.attributes.position as THREE.BufferAttribute;
    const uv = rg.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      const r = Math.hypot(p.getX(k), p.getY(k));
      uv.setXY(k, (r - inner) / (outer - inner), 0.5);
    }
    const ring = new THREE.Mesh(
      rg,
      new THREE.MeshStandardMaterial({ map: makeRingTexture(), transparent: true, side: THREE.DoubleSide, roughness: 1, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    tilt.add(ring);
  }

  let moonPivot: THREE.Group | undefined;
  if (def.moon) {
    moonPivot = new THREE.Group();
    group.add(moonPivot);
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 24, 16),
      new THREE.MeshStandardMaterial({ map: makeTexture({ color: '#a9a9a9', accent: '#e0e0e0', kind: 'rock' }, 5), roughness: 1 }),
    );
    moon.position.set(2.0, 0, 0);
    moonPivot.add(moon);
  }

  const omega = 0.5 * Math.sqrt(88 / def.periodDays);
  const angle = (i * 2.4) % (Math.PI * 2);
  const planet: Planet = { def, group, mesh, hit, angle, omega, moonPivot, moonOmega: 2.2 };
  planets.push(planet);
  placePlanet(planet);
});

function placePlanet(p: Planet): void {
  p.group.position.set(Math.cos(p.angle) * p.def.orbit, 0, Math.sin(p.angle) * p.def.orbit);
}

// UI
const ui = document.createElement('div');
ui.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none;overflow:hidden;font:13px/1.4 system-ui,sans-serif;color:#fff;`;
document.body.appendChild(ui);

const pauseBtn = document.createElement('button');
pauseBtn.id = 'pause-btn';
pauseBtn.textContent = 'Pause';
pauseBtn.style.cssText =
  'position:absolute;right:10px;top:10px;pointer-events:auto;padding:5px 14px;font:inherit;color:#fff;background:rgba(30,40,70,0.8);border:1px solid #6a7aa8;border-radius:4px;cursor:pointer;';
ui.appendChild(pauseBtn);

const panel = document.createElement('div');
panel.id = 'info-panel';
panel.style.cssText =
  'position:absolute;left:10px;bottom:10px;display:none;padding:8px 12px;background:rgba(10,15,35,0.8);border:1px solid #6a7aa8;border-radius:6px;pointer-events:none;min-width:170px;';
const pName = document.createElement('div');
pName.style.cssText = 'font-size:16px;font-weight:600;margin-bottom:2px;';
const pPeriod = document.createElement('div');
const pDist = document.createElement('div');
panel.append(pName, pPeriod, pDist);
ui.appendChild(panel);

// State
let ready = false;
let paused = false;
let focused: Planet | null = null;

type Mode = 'overview' | 'toFocus' | 'focused' | 'toOverview';
let mode: Mode = 'overview';
const DURATION = 1500;
let tStart = 0;
const startPos = new THREE.Vector3();
const startTarget = new THREE.Vector3();
const lookTarget = new THREE.Vector3(0, 0, 0);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function focusCameraPos(p: Planet, out: THREE.Vector3): THREE.Vector3 {
  const a = p.angle;
  const rx = Math.cos(a);
  const rz = Math.sin(a);
  // inward radial, slight tangent offset, raised
  tmpB.set(-rx * 0.8 + -rz * 0.3, 0.45, -rz * 0.8 + rx * 0.3).normalize().multiplyScalar(p.def.focusDist);
  return out.copy(p.group.position).add(tmpB);
}

function beginTransition(newMode: Mode): void {
  mode = newMode;
  tStart = performance.now();
  startPos.copy(camera.position);
  startTarget.copy(lookTarget);
  controls.enabled = false;
}

function focusPlanet(name: string): void {
  const p = planets.find((q) => q.def.name.toLowerCase() === String(name).toLowerCase());
  if (!p) return;
  focused = p;
  pName.textContent = p.def.name;
  pPeriod.textContent = `Orbital period: ${p.def.periodDays.toLocaleString('en-US')} Earth days`;
  pDist.textContent = `Distance from star: ${p.def.distanceMkm.toLocaleString('en-US')} million km`;
  panel.style.display = 'block';
  beginTransition('toFocus');
}

function unfocus(): void {
  if (focused === null && mode === 'overview') return;
  focused = null;
  panel.style.display = 'none';
  if (mode !== 'toOverview') beginTransition('toOverview');
}

window.__focusPlanet = focusPlanet;
window.__unfocus = unfocus;

pauseBtn.addEventListener('click', () => {
  paused = !paused;
  pauseBtn.textContent = paused ? 'Play' : 'Pause';
  pauseBtn.blur();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') unfocus();
});

// Click picking (ignore drags)
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let downX = 0;
let downY = 0;
let downValid = false;
canvas.addEventListener('pointerdown', (e) => {
  downX = e.clientX;
  downY = e.clientY;
  downValid = true;
});
canvas.addEventListener('pointerup', (e) => {
  if (!downValid) return;
  downValid = false;
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
  const rect = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(planets.map((p) => p.hit), false);
  if (hits.length > 0) {
    const p = planets.find((q) => q.hit === hits[0].object);
    if (p) focusPlanet(p.def.name);
  } else {
    unfocus();
  }
});

// Task state
const state: TaskState = {
  get ready() {
    return ready;
  },
  get focused() {
    return focused ? focused.def.name : null;
  },
  get paused() {
    return paused;
  },
  get planets() {
    return planets.map((p) => {
      p.group.getWorldPosition(tmpA);
      return { name: p.def.name, x: tmpA.x, y: tmpA.y, z: tmpA.z };
    });
  },
  get cameraDistanceToFocus() {
    if (!focused) return null;
    focused.group.getWorldPosition(tmpA);
    return camera.position.distanceTo(tmpA);
  },
};
Object.defineProperty(window, '__TASK_STATE__', { value: state, writable: false, configurable: false, enumerable: true });

// Loop
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  if (!paused) {
    for (const p of planets) {
      p.angle += p.omega * dt;
      p.mesh.rotation.y += p.def.spin * dt;
      if (p.moonPivot) p.moonPivot.rotation.y += p.moonOmega * dt;
      placePlanet(p);
    }
  }

  if (mode === 'overview') {
    controls.update();
    lookTarget.copy(controls.target);
  } else if (mode === 'toFocus' || mode === 'focused') {
    if (!focused) {
      mode = 'overview';
    } else {
      const endPos = focusCameraPos(focused, tmpA);
      if (mode === 'toFocus') {
        const t = Math.min((performance.now() - tStart) / DURATION, 1);
        const e = ease(t);
        camera.position.lerpVectors(startPos, endPos, e);
        lookTarget.lerpVectors(startTarget, focused.group.position, e);
        if (t >= 1) mode = 'focused';
      } else {
        camera.position.copy(endPos);
        lookTarget.copy(focused.group.position);
      }
      camera.lookAt(lookTarget);
    }
  } else if (mode === 'toOverview') {
    const t = Math.min((performance.now() - tStart) / DURATION, 1);
    const e = ease(t);
    camera.position.lerpVectors(startPos, OVERVIEW_POS, e);
    lookTarget.lerpVectors(startTarget, tmpB.set(0, 0, 0), e);
    camera.lookAt(lookTarget);
    if (t >= 1) {
      mode = 'overview';
      controls.target.set(0, 0, 0);
      camera.position.copy(OVERVIEW_POS);
      controls.enabled = true;
      controls.update();
      lookTarget.set(0, 0, 0);
    }
  }

  renderer.render(scene, camera);
  if (!ready) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
