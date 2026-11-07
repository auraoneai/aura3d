import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type RGB = [number, number, number];
type Kind = 'rock' | 'gas' | 'ice' | 'earth';

interface PlanetDef {
  name: string;
  radius: number;
  orbit: number; // scene units
  speed: number; // rad/s (stylised)
  spin: number; // rad/s
  periodDays: number;
  distMkm: number;
  kind: Kind;
  c1: RGB;
  c2: RGB;
  tilt?: number;
  ring?: { inner: number; outer: number; color: RGB };
  moons?: { radius: number; dist: number; speed: number; color: number }[];
  viewDist: number;
}

const DEFS: PlanetDef[] = [
  { name: 'Mercury', radius: 0.55, orbit: 9, speed: 0.6, spin: 0.5, periodDays: 88, distMkm: 57.9, kind: 'rock', c1: [120, 112, 105], c2: [182, 170, 156], viewDist: 3.2 },
  { name: 'Venus', radius: 0.95, orbit: 12.5, speed: 0.47, spin: -0.3, periodDays: 224.7, distMkm: 108.2, kind: 'gas', c1: [214, 170, 96], c2: [244, 222, 168], viewDist: 4.8 },
  {
    name: 'Earth', radius: 1.0, orbit: 16.5, speed: 0.39, spin: 1.2, periodDays: 365.2, distMkm: 149.6, kind: 'earth', c1: [30, 82, 170], c2: [70, 140, 60], tilt: 0.4,
    moons: [{ radius: 0.28, dist: 2.1, speed: 1.6, color: 0xbdbdbd }], viewDist: 5.6,
  },
  { name: 'Mars', radius: 0.72, orbit: 20.5, speed: 0.32, spin: 1.1, periodDays: 687, distMkm: 227.9, kind: 'rock', c1: [150, 62, 34], c2: [212, 126, 74], viewDist: 4.0 },
  {
    name: 'Jupiter', radius: 2.4, orbit: 28, speed: 0.17, spin: 2.0, periodDays: 4331, distMkm: 778.5, kind: 'gas', c1: [168, 118, 78], c2: [238, 218, 190],
    moons: [{ radius: 0.35, dist: 3.9, speed: 1.1, color: 0xd8c8a0 }], viewDist: 12,
  },
  {
    name: 'Saturn', radius: 2.0, orbit: 36, speed: 0.115, spin: 1.8, periodDays: 10747, distMkm: 1434, kind: 'gas', c1: [196, 168, 108], c2: [240, 224, 170], tilt: 0.45,
    ring: { inner: 2.8, outer: 4.8, color: [214, 196, 154] }, viewDist: 15,
  },
  {
    name: 'Uranus', radius: 1.5, orbit: 43.5, speed: 0.075, spin: -1.2, periodDays: 30589, distMkm: 2871, kind: 'ice', c1: [120, 200, 214], c2: [176, 232, 238], tilt: 1.2,
    ring: { inner: 2.0, outer: 2.6, color: [170, 210, 220] }, viewDist: 9,
  },
];

// ---------- procedural helpers ----------
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x: number, y: number, period: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const xa = ((x0 % period) + period) % period;
  const xb = (xa + 1) % period;
  const a = hash(xa, y0, seed);
  const b = hash(xb, y0, seed);
  const c = hash(xa, y0 + 1, seed);
  const d = hash(xb, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(u: number, v: number, base: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < 4; o++) {
    sum += amp * vnoise(u * base * f, v * base * 0.5 * f, base * f, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

function mix(a: RGB, b: RGB, t: number): RGB {
  const k = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

function makePlanetTexture(def: PlanetDef, seed: number): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      let c: RGB;
      if (def.kind === 'rock') {
        const n = fbm(u, v, 8, seed);
        const crater = fbm(u, v, 24, seed + 5);
        c = mix(def.c1, def.c2, n * 1.4 - 0.2);
        c = mix(c, [60, 50, 46], crater > 0.62 ? 0.35 : 0);
      } else if (def.kind === 'gas') {
        const warp = fbm(u, v, 6, seed) * 2.2;
        const bands = 0.5 + 0.5 * Math.sin(v * Math.PI * 14 + warp * 3);
        const fine = fbm(u, v, 16, seed + 3);
        c = mix(def.c1, def.c2, bands * 0.75 + fine * 0.3);
      } else if (def.kind === 'ice') {
        const bands = 0.5 + 0.5 * Math.sin(v * Math.PI * 6 + fbm(u, v, 4, seed) * 2);
        c = mix(def.c1, def.c2, bands * 0.6 + 0.2);
      } else {
        const n = fbm(u, v, 6, seed) + 0.25 * fbm(u, v, 18, seed + 9);
        const land = n > 0.52;
        if (land) {
          c = mix(def.c2, [168, 150, 96], (n - 0.52) * 4);
        } else {
          c = mix([14, 48, 120], def.c1, (n - 0.2) * 2.5);
        }
        const pole = Math.abs(v - 0.5) * 2;
        if (pole > 0.86) c = mix(c, [240, 244, 250], (pole - 0.86) * 12);
        const cloud = fbm(u, v, 10, seed + 31);
        if (cloud > 0.58) c = mix(c, [255, 255, 255], (cloud - 0.58) * 3);
      }
      const i = (y * w + x) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function makeSunTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm(x / w, y / h, 8, 77);
      const c = mix([255, 150, 30], [255, 245, 170], n * 1.3 - 0.1);
      const i = (y * w + x) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function makeGlowTexture(): THREE.CanvasTexture {
  const s = 256;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,240,200,1)');
  g.addColorStop(0.2, 'rgba(255,200,110,0.65)');
  g.addColorStop(0.5, 'rgba(255,140,50,0.2)');
  g.addColorStop(1, 'rgba(255,100,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRingTexture(color: RGB, seed: number): THREE.CanvasTexture {
  const w = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = 4;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const rnd = mulberry32(seed);
  for (let x = 0; x < w; x++) {
    const n = 0.55 + 0.45 * Math.sin(x * 0.35 + rnd() * 0.8) * Math.sin(x * 0.11);
    const edge = Math.min(x / 10, (w - x) / 10, 1);
    const gap = x > w * 0.55 && x < w * 0.62 ? 0.1 : 1;
    const a = Math.max(0, n) * edge * gap * 0.9;
    ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${a.toFixed(3)})`;
    ctx.fillRect(x, 0, 1, 4);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- renderer / scene ----------
const canvas = document.getElementById('app') as HTMLCanvasElement;
const W = 640;
const H = 360;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.setClearColor(0x02030a, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 2000);
const OVERVIEW_POS = new THREE.Vector3(0, 62, 92);
const OVERVIEW_TARGET = new THREE.Vector3(0, 0, 0);
camera.position.copy(OVERVIEW_POS);
camera.lookAt(OVERVIEW_TARGET);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 20;
controls.maxDistance = 170;
controls.maxPolarAngle = Math.PI * 0.95;
controls.enablePan = false;
controls.target.copy(OVERVIEW_TARGET);
controls.update();

// starfield
{
  const rnd = mulberry32(12345);
  const n = 1800;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = rnd() * 2 - 1;
    const th = rnd() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const R = 700;
    pos[i * 3] = R * r * Math.cos(th);
    pos[i * 3 + 1] = R * u;
    pos[i * 3 + 2] = R * r * Math.sin(th);
    const b = 0.5 + rnd() * 0.5;
    const warm = rnd();
    col[i * 3] = b * (0.8 + 0.2 * warm);
    col[i * 3 + 1] = b * 0.9;
    col[i * 3 + 2] = b * (1 - 0.2 * warm);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false });
  scene.add(new THREE.Points(g, m));
}

// star
const sunTex = makeSunTexture();
const sun = new THREE.Mesh(new THREE.SphereGeometry(4.5, 48, 32), new THREE.MeshBasicMaterial({ map: sunTex }));
scene.add(sun);
const glow = new THREE.Sprite(
  new THREE.SpriteMaterial({ map: makeGlowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
);
glow.scale.set(24, 24, 1);
scene.add(glow);
const sunLight = new THREE.PointLight(0xfff0d8, 3.2, 0, 0);
scene.add(sunLight);
scene.add(new THREE.AmbientLight(0x303848, 0.9));

// planets
interface Planet {
  def: PlanetDef;
  pivot: THREE.Group; // positioned on orbit
  mesh: THREE.Mesh;
  hit: THREE.Mesh;
  angle: number;
  moons: { pivot: THREE.Object3D; angle: number; speed: number }[];
}
const planets: Planet[] = [];
const hitMeshes: THREE.Mesh[] = [];

DEFS.forEach((def, i) => {
  const pivot = new THREE.Group();
  scene.add(pivot);

  const mat = new THREE.MeshStandardMaterial({ map: makePlanetTexture(def, 101 + i * 13), roughness: 0.9, metalness: 0 });
  const tiltGroup = new THREE.Group();
  tiltGroup.rotation.z = def.tilt ?? 0;
  pivot.add(tiltGroup);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(def.radius, 48, 32), mat);
  tiltGroup.add(mesh);

  if (def.ring) {
    const rg = new THREE.RingGeometry(def.ring.inner, def.ring.outer, 96, 1);
    const p = rg.attributes.position as THREE.BufferAttribute;
    const uv = rg.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      const len = Math.hypot(p.getX(k), p.getY(k));
      uv.setXY(k, (len - def.ring.inner) / (def.ring.outer - def.ring.inner), 0.5);
    }
    const ring = new THREE.Mesh(
      rg,
      new THREE.MeshBasicMaterial({
        map: makeRingTexture(def.ring.color, 7 + i),
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    tiltGroup.add(ring);
  }

  const moons: Planet['moons'] = [];
  (def.moons ?? []).forEach((md, mi) => {
    const mp = new THREE.Object3D();
    pivot.add(mp);
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(md.radius, 24, 16),
      new THREE.MeshStandardMaterial({ color: md.color, roughness: 1 }),
    );
    moon.position.x = md.dist;
    mp.add(moon);
    mp.rotation.x = 0.15 * (mi + 1);
    moons.push({ pivot: mp, angle: mi * 2, speed: md.speed });
  });

  // orbit line
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k < 160; k++) {
    const a = (k / 160) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * def.orbit, 0, Math.sin(a) * def.orbit));
  }
  const line = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x6f86b8, transparent: true, opacity: 0.55 }),
  );
  scene.add(line);

  // generous invisible hit target
  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(def.radius * 1.25, 1.3), 12, 8),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  pivot.add(hit);
  hitMeshes.push(hit);

  const angle = (i * 2.399963) % (Math.PI * 2);
  pivot.position.set(Math.cos(angle) * def.orbit, 0, Math.sin(angle) * def.orbit);
  planets.push({ def, pivot, mesh, hit, angle, moons });
});

// ---------- UI ----------
const style = document.createElement('style');
style.textContent = `
  .ui { position: fixed; z-index: 10; font: 12px/1.4 system-ui, sans-serif; color: #e8eefc; }
  #pauseBtn { left: 8px; top: 8px; padding: 4px 12px; background: rgba(20,28,50,.8); border: 1px solid #5b72a8; border-radius: 4px; cursor: pointer; font: inherit; }
  #pauseBtn:hover { background: rgba(40,56,100,.9); }
  #infoPanel { left: 440px; top: 8px; width: 190px; box-sizing: border-box; padding: 8px 10px; background: rgba(10,16,34,.82); border: 1px solid #5b72a8; border-radius: 6px; display: none; }
  #infoPanel h2 { margin: 0 0 4px; font-size: 15px; }
  #infoPanel div { margin: 2px 0; }
  #infoPanel span { color: #9fb4e6; }
  #hint { left: 8px; top: 338px; color: #9fb0d8; font-size: 11px; pointer-events: none; }
`;
document.head.appendChild(style);

const pauseBtn = document.createElement('button');
pauseBtn.id = 'pauseBtn';
pauseBtn.className = 'ui';
pauseBtn.type = 'button';
pauseBtn.textContent = 'Pause';
document.body.appendChild(pauseBtn);

const panel = document.createElement('div');
panel.id = 'infoPanel';
panel.className = 'ui';
panel.innerHTML =
  '<h2 id="infoName"></h2><div><span>Orbital period:</span> <b id="infoPeriod"></b></div><div><span>Distance from star:</span> <b id="infoDist"></b></div>';
document.body.appendChild(panel);
const infoName = document.getElementById('infoName') as HTMLElement;
const infoPeriod = document.getElementById('infoPeriod') as HTMLElement;
const infoDist = document.getElementById('infoDist') as HTMLElement;

const hint = document.createElement('div');
hint.id = 'hint';
hint.className = 'ui';
hint.textContent = 'Click a planet to focus. Esc: back to overview.';
document.body.appendChild(hint);

// ---------- state / camera logic ----------
let paused = false;
let focused: Planet | null = null;
const lookTarget = OVERVIEW_TARGET.clone();

interface Tween {
  t0: number;
  from: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toOverview: boolean;
}
let tween: Tween | null = null;
const DURATION = 1.5;
const ease = (k: number): number => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

const tmpP = new THREE.Vector3();
function planetWorld(p: Planet, out: THREE.Vector3): THREE.Vector3 {
  return p.pivot.getWorldPosition(out);
}

const desiredPos = new THREE.Vector3();
function computeFocusPose(p: Planet, pos: THREE.Vector3, target: THREE.Vector3): void {
  planetWorld(p, target);
  const radial = new THREE.Vector3(target.x, 0, target.z).normalize();
  const tangent = new THREE.Vector3(-radial.z, 0, radial.x);
  const d = p.def.viewDist;
  pos.copy(target).addScaledVector(radial, -d * 0.8).addScaledVector(tangent, d * 0.35);
  pos.y += d * 0.3;
}

function startTween(toOverview: boolean): void {
  controls.enabled = false;
  tween = { t0: performance.now(), from: camera.position.clone(), fromTarget: lookTarget.clone(), toOverview };
}

function focusPlanet(p: Planet): void {
  if (focused === p) return;
  if (!focused && !tween) lookTarget.copy(controls.target);
  focused = p;
  infoName.textContent = p.def.name;
  infoPeriod.textContent = `${p.def.periodDays.toLocaleString('en-US')} Earth days`;
  infoDist.textContent = `${p.def.distMkm.toLocaleString('en-US')} million km`;
  panel.style.display = 'block';
  startTween(false);
}

function unfocus(): void {
  if (!focused) return;
  focused = null;
  panel.style.display = 'none';
  startTween(true);
}

function findPlanet(name: string): Planet | undefined {
  const n = String(name).trim().toLowerCase();
  return planets.find((p) => p.def.name.toLowerCase() === n);
}

// input
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
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1));
  camera.updateMatrixWorld();
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(hitMeshes, false);
  if (hits.length > 0) {
    const p = planets.find((pl) => pl.hit === hits[0].object);
    if (p) focusPlanet(p);
  } else {
    unfocus();
  }
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') unfocus();
});
pauseBtn.addEventListener('click', () => {
  paused = !paused;
  pauseBtn.textContent = paused ? 'Play' : 'Pause';
});

// globals
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
  get planets(): { name: string; x: number; y: number; z: number }[] {
    return planets.map((p) => {
      const v = planetWorld(p, new THREE.Vector3());
      return { name: p.def.name, x: v.x, y: v.y, z: v.z };
    });
  },
  get cameraDistanceToFocus(): number | null {
    return focused ? camera.position.distanceTo(planetWorld(focused, new THREE.Vector3())) : null;
  },
};
let ready = false;
Object.defineProperty(window, '__TASK_STATE__', { value: Object.freeze(state), writable: false, configurable: false });
const w = window as unknown as Record<string, unknown>;
w.__focusPlanet = (name: string): void => {
  const p = findPlanet(name);
  if (p) focusPlanet(p);
};
w.__unfocus = (): void => unfocus();
w.__EVAL_READY__ = false;

// ---------- loop ----------
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (!paused) {
    for (const p of planets) {
      p.angle += p.def.speed * dt;
      p.pivot.position.set(Math.cos(p.angle) * p.def.orbit, 0, Math.sin(p.angle) * p.def.orbit);
      p.mesh.rotation.y += p.def.spin * dt;
      for (const m of p.moons) {
        m.angle += m.speed * dt;
        m.pivot.rotation.y = m.angle;
      }
    }
    sun.rotation.y += 0.05 * dt;
  }
  p_update();

  renderer.render(scene, camera);
  if (!ready) {
    ready = true;
    w.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}

function p_update(): void {
  const tNow = performance.now();
  const k = tween ? Math.min(1, (tNow - tween.t0) / (DURATION * 1000)) : 1;
  const e = ease(k);

  if (focused) {
    const target = new THREE.Vector3();
    computeFocusPose(focused, desiredPos, target);
    if (tween) {
      camera.position.lerpVectors(tween.from, desiredPos, e);
      lookTarget.lerpVectors(tween.fromTarget, target, e);
      if (k >= 1) tween = null;
    } else {
      camera.position.copy(desiredPos);
      lookTarget.copy(target);
    }
    camera.lookAt(lookTarget);
  } else if (tween) {
    camera.position.lerpVectors(tween.from, OVERVIEW_POS, e);
    lookTarget.lerpVectors(tween.fromTarget, OVERVIEW_TARGET, e);
    camera.lookAt(lookTarget);
    if (k >= 1) {
      tween = null;
      controls.target.copy(OVERVIEW_TARGET);
      lookTarget.copy(OVERVIEW_TARGET);
      controls.enabled = true;
      controls.update();
    }
  } else {
    controls.update();
    lookTarget.copy(controls.target);
  }
  void tmpP;
}

requestAnimationFrame(frame);
