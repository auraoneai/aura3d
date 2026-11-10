import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const W = 640;
const H = 360;

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
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  return [c, ctx];
}

function toTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function shade(hex: string, amt: number): string {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt);
  return '#' + c.getHexString();
}

function rockyTexture(base: string, seed: number, blotches: number): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 128);
  const rnd = mulberry32(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 128);
  for (let i = 0; i < blotches; i++) {
    const x = rnd() * 256;
    const y = rnd() * 128;
    const r = 3 + rnd() * 16;
    ctx.fillStyle = shade(base, (rnd() - 0.5) * 0.25);
    ctx.globalAlpha = 0.35;
    for (const dx of [-256, 0, 256]) {
      ctx.beginPath();
      ctx.arc(x + dx, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  return toTexture(c);
}

function earthTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 128);
  const rnd = mulberry32(7);
  ctx.fillStyle = '#2a63b8';
  ctx.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * 256;
    const y = 20 + rnd() * 88;
    const r = 5 + rnd() * 16;
    ctx.fillStyle = rnd() > 0.3 ? '#3f9a4a' : '#8a7a46';
    for (const dx of [-256, 0, 256]) {
      ctx.beginPath();
      ctx.ellipse(x + dx, y, r * 1.3, r, rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = '#f2f6fa';
  ctx.fillRect(0, 0, 256, 7);
  ctx.fillRect(0, 121, 256, 7);
  return toTexture(c);
}

function bandedTexture(colors: string[], seed: number): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 128);
  const rnd = mulberry32(seed);
  let y = 0;
  while (y < 128) {
    const h = 4 + rnd() * 14;
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
    ctx.fillRect(0, y, 256, h);
    y += h;
  }
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = rnd() > 0.5 ? '#ffffff' : '#000000';
    ctx.beginPath();
    ctx.ellipse(rnd() * 256, rnd() * 128, 6 + rnd() * 14, 1 + rnd() * 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return toTexture(c);
}

function sunTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 128);
  const rnd = mulberry32(99);
  ctx.fillStyle = '#ffb320';
  ctx.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 260; i++) {
    const r = 3 + rnd() * 12;
    ctx.fillStyle = rnd() > 0.5 ? '#ffd860' : '#ff8a10';
    ctx.globalAlpha = 0.3;
    const x = rnd() * 256;
    const y = rnd() * 128;
    for (const dx of [-256, 0, 256]) {
      ctx.beginPath();
      ctx.arc(x + dx, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  return toTexture(c);
}

function glowTexture(inner: string, mid: string): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.25, mid);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function ringTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 4);
  const rnd = mulberry32(31);
  for (let x = 0; x < 256; x++) {
    const u = x / 255;
    let a = 0.25 + 0.6 * rnd();
    if (u > 0.42 && u < 0.5) a = 0.05; // gap
    if (u < 0.08) a *= u / 0.08;
    if (u > 0.92) a *= (1 - u) / 0.08;
    const l = 62 + rnd() * 14;
    ctx.fillStyle = `hsla(40, 35%, ${l}%, ${a})`;
    ctx.fillRect(x, 0, 1, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- renderer / scene ----------
const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.setClearColor(0x02030a, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 3000);
const OVERVIEW_POS = new THREE.Vector3(0, 80, 125);
const OVERVIEW_TARGET = new THREE.Vector3(0, 0, 0);
camera.position.copy(OVERVIEW_POS);
camera.lookAt(OVERVIEW_TARGET);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 25;
controls.maxDistance = 260;
controls.maxPolarAngle = Math.PI * 0.95;
controls.target.copy(OVERVIEW_TARGET);
controls.update();

// stars
{
  const n = 1800;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const rnd = mulberry32(2024);
  const tmp = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const u = rnd() * 2 - 1;
    const th = rnd() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const R = 1200;
    pos[i * 3] = R * s * Math.cos(th);
    pos[i * 3 + 1] = R * u;
    pos[i * 3 + 2] = R * s * Math.sin(th);
    tmp.setHSL(0.55 + rnd() * 0.15, 0.3, 0.6 + rnd() * 0.4);
    col[i * 3] = tmp.r;
    col[i * 3 + 1] = tmp.g;
    col[i * 3 + 2] = tmp.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: 1.8, sizeAttenuation: false, vertexColors: true, fog: false });
  scene.add(new THREE.Points(g, m));
}

scene.add(new THREE.AmbientLight(0x56607a, 0.9));

// sun
const SUN_RADIUS = 6;
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(SUN_RADIUS, 48, 32),
  new THREE.MeshBasicMaterial({ map: sunTexture() }),
);
scene.add(sun);
{
  const glow1 = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,240,190,1)', 'rgba(255,170,50,0.55)'),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  );
  glow1.scale.setScalar(26);
  sun.add(glow1);
  const glow2 = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,200,120,0.5)', 'rgba(255,120,30,0.15)'),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  );
  glow2.scale.setScalar(60);
  sun.add(glow2);
}
const sunLight = new THREE.PointLight(0xfff0d8, 6, 0, 0);
scene.add(sunLight);

// ---------- planets ----------
interface PlanetDef {
  name: string;
  radius: number;
  orbit: number; // scene units
  periodDays: number;
  distanceMkm: number;
  spin: number; // rad/s
  tilt: number;
  phase: number;
  map: THREE.Texture;
  ring?: boolean;
  moon?: boolean;
}

const defs: PlanetDef[] = [
  { name: 'Mercury', radius: 0.8, orbit: 13, periodDays: 87.97, distanceMkm: 57.9, spin: 0.6, tilt: 0.03, phase: 0.5, map: rockyTexture('#9a928a', 1, 120) },
  { name: 'Venus', radius: 1.4, orbit: 18.5, periodDays: 224.7, distanceMkm: 108.2, spin: -0.3, tilt: 3.0, phase: 2.4, map: bandedTexture(['#e0b878', '#d3a560', '#e8c890', '#caa060'], 5) },
  { name: 'Earth', radius: 1.5, orbit: 25, periodDays: 365.25, distanceMkm: 149.6, spin: 1.5, tilt: 0.41, phase: 4.1, map: earthTexture(), moon: true },
  { name: 'Mars', radius: 1.1, orbit: 31, periodDays: 687, distanceMkm: 227.9, spin: 1.4, tilt: 0.44, phase: 1.2, map: rockyTexture('#b5532f', 11, 160) },
  { name: 'Jupiter', radius: 3.6, orbit: 42, periodDays: 4333, distanceMkm: 778.5, spin: 2.5, tilt: 0.05, phase: 5.3, map: bandedTexture(['#d9b48a', '#b9855a', '#efe0c8', '#a0714c', '#cfa77a'], 21) },
  { name: 'Saturn', radius: 3.0, orbit: 55, periodDays: 10759, distanceMkm: 1432, spin: 2.3, tilt: 0.47, phase: 3.2, map: bandedTexture(['#e6d3a0', '#d2bd86', '#f0e2b8', '#c4ac72'], 33), ring: true },
  { name: 'Uranus', radius: 2.0, orbit: 66, periodDays: 30687, distanceMkm: 2867, spin: -1.2, tilt: 1.7, phase: 0.1, map: bandedTexture(['#8fd6dc', '#7cc8d2', '#a0e0e4'], 44) },
];

// stylised period in seconds: monotonic in real period, compressed
function periodSeconds(days: number): number {
  return 30 * Math.pow(days / 365.25, 0.7);
}

interface Planet {
  def: PlanetDef;
  group: THREE.Group;
  body: THREE.Mesh;
  hit: THREE.Mesh;
  moonPivot?: THREE.Group;
  angle: number;
  omega: number;
}

const planets: Planet[] = [];
const hitMeshes: THREE.Object3D[] = [];

for (const def of defs) {
  const group = new THREE.Group();
  scene.add(group);

  const tiltGroup = new THREE.Group();
  tiltGroup.rotation.z = def.tilt;
  group.add(tiltGroup);

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(def.radius, 40, 28),
    new THREE.MeshStandardMaterial({ map: def.map, roughness: 0.9, metalness: 0 }),
  );
  tiltGroup.add(body);

  if (def.ring) {
    const inner = def.radius * 1.4;
    const outer = def.radius * 2.3;
    const rg = new THREE.RingGeometry(inner, outer, 96, 1);
    const p = rg.attributes.position;
    const uv = rg.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getY(i));
      uv.setXY(i, (r - inner) / (outer - inner), 0.5);
    }
    const ring = new THREE.Mesh(
      rg,
      new THREE.MeshBasicMaterial({
        map: ringTexture(),
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    tiltGroup.add(ring);
  }

  let moonPivot: THREE.Group | undefined;
  if (def.moon) {
    moonPivot = new THREE.Group();
    moonPivot.rotation.x = 0.1;
    group.add(moonPivot);
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 24, 16),
      new THREE.MeshStandardMaterial({ map: rockyTexture('#b0b0b0', 77, 80), roughness: 1 }),
    );
    moon.position.set(3, 0, 0);
    moonPivot.add(moon);
  }

  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(def.radius * 1.3, 1.8), 12, 8),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hit.userData.planetName = def.name;
  group.add(hit);
  hitMeshes.push(hit);

  // orbit line
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * def.orbit, 0, Math.sin(a) * def.orbit));
  }
  const line = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x6f86b8, transparent: true, opacity: 0.4 }),
  );
  scene.add(line);

  const pl: Planet = {
    def,
    group,
    body,
    hit,
    moonPivot,
    angle: def.phase,
    omega: (Math.PI * 2) / periodSeconds(def.periodDays),
  };
  group.position.set(Math.cos(pl.angle) * def.orbit, 0, Math.sin(pl.angle) * def.orbit);
  planets.push(pl);
}

// ---------- DOM ----------
const overlay = document.createElement('div');
overlay.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none;overflow:hidden;font:13px/1.4 system-ui,sans-serif;color:#e8eefc;`;
document.body.appendChild(overlay);

const panel = document.createElement('div');
panel.id = 'info-panel';
panel.style.cssText =
  'position:absolute;left:10px;top:10px;min-width:160px;padding:8px 12px;background:rgba(10,16,34,0.78);border:1px solid rgba(140,170,255,0.45);border-radius:6px;display:none;';
overlay.appendChild(panel);

const button = document.createElement('button');
button.id = 'pause-btn';
button.type = 'button';
button.textContent = 'Pause';
button.style.cssText =
  'position:absolute;right:10px;top:10px;pointer-events:auto;padding:5px 14px;background:rgba(10,16,34,0.85);color:#e8eefc;border:1px solid rgba(140,170,255,0.6);border-radius:6px;cursor:pointer;font:inherit;';
overlay.appendChild(button);

let paused = false;
button.addEventListener('click', () => {
  paused = !paused;
  button.textContent = paused ? 'Play' : 'Pause';
});

// Tour button lives below the canvas, outside it.
const toolbar = document.createElement('div');
toolbar.id = 'toolbar';
toolbar.style.cssText = `width:${W}px;padding:8px 0;display:flex;gap:8px;justify-content:center;`;
document.body.appendChild(toolbar);

const tourBtn = document.createElement('button');
tourBtn.id = 'tour-btn';
tourBtn.type = 'button';
tourBtn.textContent = 'Tour';
tourBtn.style.cssText =
  'padding:5px 14px;background:#0a1022;color:#e8eefc;border:1px solid rgba(140,170,255,0.6);border-radius:6px;cursor:pointer;font:inherit;';
toolbar.appendChild(tourBtn);

function showPanel(p: Planet): void {
  panel.innerHTML = '';
  const title = document.createElement('div');
  title.style.cssText = 'font-weight:600;font-size:15px;margin-bottom:2px;';
  title.textContent = p.def.name;
  const period = document.createElement('div');
  period.textContent = `Orbital period: ${p.def.periodDays.toLocaleString('en-US')} Earth days`;
  const dist = document.createElement('div');
  dist.textContent = `Distance from star: ${p.def.distanceMkm.toLocaleString('en-US')} million km`;
  panel.append(title, period, dist);
  panel.style.display = 'block';
}

// ---------- focus / camera transitions ----------
let focused: Planet | null = null;
let transitioning = false;
let tT = 0;
const TRANS_DURATION = 1.5;
const fromPos = new THREE.Vector3();
const fromTarget = new THREE.Vector3();
const curTarget = controls.target.clone();
const destPos = new THREE.Vector3();
const destTarget = new THREE.Vector3();

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function computeFocusDest(p: Planet, outPos: THREE.Vector3, outTarget: THREE.Vector3): void {
  const c = p.group.position;
  outTarget.copy(c);
  const inward = new THREE.Vector3(-c.x, 0, -c.z).normalize();
  const tangent = new THREE.Vector3(-inward.z, 0, inward.x); // direction of travel-ish
  const dir = inward.multiplyScalar(0.45).addScaledVector(tangent, 0.8).add(new THREE.Vector3(0, 0.38, 0)).normalize();
  const dist = p.def.radius * 4.5 + 2;
  outPos.copy(c).addScaledVector(dir, dist);
}

function beginTransition(): void {
  fromPos.copy(camera.position);
  fromTarget.copy(curTarget);
  tT = 0;
  transitioning = true;
  controls.enabled = false;
}

function focusPlanet(name: string): void {
  const p = planets.find((q) => q.def.name.toLowerCase() === String(name).toLowerCase());
  if (!p || p === focused) return;
  if (!focused && !transitioning) curTarget.copy(controls.target);
  focused = p;
  showPanel(p);
  beginTransition();
}

function unfocus(): void {
  if (!focused) return;
  focused = null;
  panel.style.display = 'none';
  beginTransition();
}

// ---------- tour ----------
const TOUR_SECONDS = 3;
let touring = false;
let tourIndex = 0;
let tourTimer = 0;

function cancelTour(): void {
  touring = false;
  tourBtn.textContent = 'Tour';
}

function startTour(): void {
  touring = true;
  tourIndex = 0;
  tourTimer = 0;
  tourBtn.textContent = 'Stop tour';
  focusPlanet(planets[0].def.name);
}

function updateTour(dt: number): void {
  if (!touring) return;
  tourTimer += dt;
  if (tourTimer < TOUR_SECONDS) return;
  tourTimer -= TOUR_SECONDS;
  tourIndex++;
  if (tourIndex >= planets.length) {
    cancelTour();
    unfocus();
  } else {
    focusPlanet(planets[tourIndex].def.name);
  }
}

tourBtn.addEventListener('click', () => {
  if (touring) {
    cancelTour();
    unfocus();
  } else {
    startTour();
  }
});

// Manual actions behave like a click and end any running tour.
function userFocus(name: string): void {
  cancelTour();
  focusPlanet(name);
}
function userUnfocus(): void {
  cancelTour();
  unfocus();
}

window.__focusPlanet = userFocus;
window.__unfocus = userUnfocus;

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') userUnfocus();
});

// click vs drag
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
  const hits = raycaster.intersectObjects([...hitMeshes, sun], false);
  const first = hits[0];
  const name = first ? (first.object.userData.planetName as string | undefined) : undefined;
  if (name) userFocus(name);
  else userUnfocus();
});

// ---------- state exposure ----------
const state = {
  get ready(): boolean {
    return ready;
  },
  get focused(): string | null {
    return focused ? focused.def.name : null;
  },
  get paused(): boolean {
    return paused;
  },
  get touring(): boolean {
    return touring;
  },
  get planets(): { name: string; x: number; y: number; z: number }[] {
    return planets.map((p) => ({ name: p.def.name, x: p.group.position.x, y: p.group.position.y, z: p.group.position.z }));
  },
  get cameraDistanceToFocus(): number | null {
    return focused ? camera.position.distanceTo(focused.group.position) : null;
  },
};
let ready = false;
Object.defineProperty(window, '__TASK_STATE__', { value: state, writable: false, configurable: false, enumerable: true });

// ---------- loop ----------
const clock = new THREE.Clock();
const moonOmega = (Math.PI * 2) / 4;

function frame(): void {
  const dt = Math.min(clock.getDelta(), 0.1);
  updateTour(dt);

  if (!paused) {
    for (const p of planets) {
      p.angle += p.omega * dt;
      p.group.position.set(Math.cos(p.angle) * p.def.orbit, 0, Math.sin(p.angle) * p.def.orbit);
      p.body.rotation.y += p.def.spin * dt;
      if (p.moonPivot) p.moonPivot.rotation.y += moonOmega * dt;
    }
    sun.rotation.y += 0.1 * dt;
  }

  if (transitioning) {
    tT = Math.min(1, tT + dt / TRANS_DURATION);
    if (focused) computeFocusDest(focused, destPos, destTarget);
    else {
      destPos.copy(OVERVIEW_POS);
      destTarget.copy(OVERVIEW_TARGET);
    }
    const e = easeInOutCubic(tT);
    camera.position.lerpVectors(fromPos, destPos, e);
    curTarget.lerpVectors(fromTarget, destTarget, e);
    camera.lookAt(curTarget);
    if (tT >= 1) {
      transitioning = false;
      if (!focused) {
        controls.target.copy(OVERVIEW_TARGET);
        controls.enabled = true;
        controls.update();
      }
    }
  } else if (focused) {
    computeFocusDest(focused, destPos, destTarget);
    camera.position.copy(destPos);
    curTarget.copy(destTarget);
    camera.lookAt(curTarget);
  } else {
    controls.update();
    curTarget.copy(controls.target);
  }

  renderer.render(scene, camera);
  if (!ready) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
