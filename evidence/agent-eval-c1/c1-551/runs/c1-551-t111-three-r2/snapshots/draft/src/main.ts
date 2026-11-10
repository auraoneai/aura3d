import * as THREE from 'three';

// ---------- types & data ----------

interface MoonSpec {
  radius: number;
  distance: number;
  speed: number; // rad/s
  color: string;
  phase: number;
}

interface PlanetSpec {
  name: string;
  radius: number;
  orbit: number; // scene units
  color: string;
  accent: string;
  kind: 'rocky' | 'banded' | 'earth' | 'cloudy';
  periodDays: number;
  distanceMkm: number;
  tilt: number;
  spin: number; // rad/s
  focusDist: number;
  ring?: { inner: number; outer: number; colors: string[]; opacity: number };
  moons?: MoonSpec[];
  phase: number;
}

const SPECS: PlanetSpec[] = [
  { name: 'Mercury', radius: 1.0, orbit: 14, color: '#9b948c', accent: '#5e5953', kind: 'rocky', periodDays: 88, distanceMkm: 57.9, tilt: 0.03, spin: 0.4, focusDist: 5, phase: 0.6 },
  { name: 'Venus', radius: 1.8, orbit: 20, color: '#e3b97a', accent: '#c48a45', kind: 'cloudy', periodDays: 224.7, distanceMkm: 108.2, tilt: 3.0, spin: -0.25, focusDist: 8, phase: 2.4 },
  {
    name: 'Earth', radius: 2.0, orbit: 27, color: '#2f6fd0', accent: '#3f9f4f', kind: 'earth', periodDays: 365.25, distanceMkm: 149.6, tilt: 0.41, spin: 1.2, focusDist: 13, phase: 4.1,
    moons: [{ radius: 0.55, distance: 3.6, speed: 0.9, color: '#bdbdbd', phase: 1 }],
  },
  { name: 'Mars', radius: 1.4, orbit: 34, color: '#c1583a', accent: '#7d3320', kind: 'rocky', periodDays: 687, distanceMkm: 227.9, tilt: 0.44, spin: 1.1, focusDist: 6.5, phase: 5.3 },
  {
    name: 'Jupiter', radius: 4.8, orbit: 48, color: '#d8b48c', accent: '#9c6b43', kind: 'banded', periodDays: 4333, distanceMkm: 778.5, tilt: 0.05, spin: 1.8, focusDist: 32, phase: 1.5,
    moons: [
      { radius: 0.7, distance: 8, speed: 1.2, color: '#d9c06a', phase: 0 },
      { radius: 0.6, distance: 11, speed: 0.7, color: '#a99c8c', phase: 2.5 },
    ],
  },
  {
    name: 'Saturn', radius: 4.0, orbit: 65, color: '#e6d4a0', accent: '#b89a62', kind: 'banded', periodDays: 10759, distanceMkm: 1434, tilt: 0.47, spin: 1.6, focusDist: 30, phase: 3.3,
    ring: { inner: 1.4, outer: 2.3, colors: ['#8a7a5a', '#d8c9a0', '#a9987a', '#e8dcb8', '#7a6c52'], opacity: 0.9 },
  },
  {
    name: 'Uranus', radius: 2.8, orbit: 79, color: '#8fd8e0', accent: '#6bbac6', kind: 'cloudy', periodDays: 30687, distanceMkm: 2871, tilt: 1.7, spin: -1.0, focusDist: 17, phase: 5.9,
    ring: { inner: 1.5, outer: 1.9, colors: ['#9fc8cc', '#6f9aa0', '#b5d8dc'], opacity: 0.45 },
  },
  { name: 'Neptune', radius: 2.7, orbit: 92, color: '#3f5fe0', accent: '#27389a', kind: 'banded', periodDays: 60190, distanceMkm: 4495, tilt: 0.49, spin: 1.0, focusDist: 16, phase: 0.2 },
];

/** Visual orbital period in seconds: compressed so outer planets still visibly move. */
function visualPeriodSeconds(days: number): number {
  return 12 * Math.pow(days / 88, 0.4);
}

const TRANSITION_MS = 1500;

// ---------- procedural helpers ----------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  return [c, ctx];
}

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number): void {
  // draw wrapped horizontally so the seam is not obvious
  for (const ox of [-ctx.canvas.width, 0, ctx.canvas.width]) {
    const g = ctx.createRadialGradient(x + ox, y, 0, x + ox, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(x + ox - r, y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
}

function shade(hex: string, f: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return '#' + c.getHexString();
}

function planetTexture(spec: PlanetSpec): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const [canvas, ctx] = makeCanvas(W, H);
  const rnd = mulberry32(hashString(spec.name));

  ctx.fillStyle = spec.color;
  ctx.fillRect(0, 0, W, H);

  if (spec.kind === 'banded' || spec.kind === 'cloudy') {
    const bands = spec.kind === 'banded' ? 22 : 9;
    let y = 0;
    while (y < H) {
      const bh = (H / bands) * (0.5 + rnd());
      const f = 0.75 + rnd() * 0.5;
      ctx.globalAlpha = spec.kind === 'banded' ? 0.75 : 0.4;
      ctx.fillStyle = rnd() < 0.5 ? shade(spec.accent, f) : shade(spec.color, f);
      ctx.fillRect(0, y, W, bh);
      y += bh;
    }
    ctx.globalAlpha = 1;
    const streaks = spec.kind === 'banded' ? 90 : 40;
    for (let i = 0; i < streaks; i++) {
      const x = rnd() * W;
      const yy = rnd() * H;
      ctx.save();
      ctx.translate(x, yy);
      ctx.scale(4 + rnd() * 5, 1);
      blob(ctx, 0, 0, 6 + rnd() * 10, rnd() < 0.5 ? spec.accent : '#ffffff', 0.18);
      ctx.restore();
    }
    if (spec.name === 'Jupiter') {
      ctx.save();
      ctx.translate(W * 0.35, H * 0.62);
      ctx.scale(2.2, 1);
      blob(ctx, 0, 0, 16, '#b0482c', 0.9);
      ctx.restore();
    }
  } else if (spec.kind === 'rocky') {
    for (let i = 0; i < 160; i++) {
      const r = 4 + rnd() * 22;
      blob(ctx, rnd() * W, rnd() * H, r, rnd() < 0.6 ? spec.accent : '#ffffff', 0.2 + rnd() * 0.25);
    }
    for (let i = 0; i < 60; i++) {
      const x = rnd() * W;
      const y = rnd() * H;
      const r = 2 + rnd() * 6;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x - r * 0.2, y - r * 0.2, r * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fill();
    }
  } else {
    // earth: ocean with continents, clouds, polar caps
    const og = ctx.createLinearGradient(0, 0, 0, H);
    og.addColorStop(0, '#1d4ea8');
    og.addColorStop(0.5, '#2f7fe0');
    og.addColorStop(1, '#1d4ea8');
    ctx.fillStyle = og;
    ctx.fillRect(0, 0, W, H);
    for (let c = 0; c < 9; c++) {
      const cx = rnd() * W;
      const cy = H * (0.2 + rnd() * 0.6);
      for (let i = 0; i < 26; i++) {
        blob(ctx, cx + (rnd() - 0.5) * 70, cy + (rnd() - 0.5) * 40, 8 + rnd() * 16, rnd() < 0.75 ? spec.accent : '#b49a5a', 0.95);
      }
    }
    for (let i = 0; i < 70; i++) {
      ctx.save();
      const x = rnd() * W;
      const y = rnd() * H;
      ctx.translate(x, y);
      ctx.scale(3 + rnd() * 3, 1);
      blob(ctx, 0, 0, 5 + rnd() * 7, '#ffffff', 0.35);
      ctx.restore();
    }
    ctx.fillStyle = '#f2f6ff';
    ctx.fillRect(0, 0, W, 12);
    ctx.fillRect(0, H - 12, W, 12);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function sunTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 256);
  const rnd = mulberry32(7);
  ctx.fillStyle = '#ffb02e';
  ctx.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 400; i++) {
    blob(ctx, rnd() * 512, rnd() * 256, 6 + rnd() * 18, rnd() < 0.5 ? '#ffe27a' : '#e8651a', 0.35);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glowTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,240,190,1)');
  g.addColorStop(0.2, 'rgba(255,200,100,0.7)');
  g.addColorStop(0.5, 'rgba(255,140,40,0.22)');
  g.addColorStop(1, 'rgba(255,100,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function ringTexture(colors: string[], opacity: number): THREE.CanvasTexture {
  const W = 256;
  const [canvas, ctx] = makeCanvas(W, 4);
  const rnd = mulberry32(99 + colors.length);
  let x = 0;
  while (x < W) {
    const w = 2 + rnd() * 14;
    ctx.globalAlpha = Math.max(0.05, opacity * (0.35 + rnd() * 0.65));
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
    ctx.fillRect(x, 0, w, 4);
    x += w;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- renderer / scene ----------

const canvas = document.getElementById('app') as HTMLCanvasElement | null;
if (!canvas) throw new Error('canvas #app missing');
const W = 640;
const H = 360;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02030a);

const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 4000);

scene.add(new THREE.AmbientLight(0x8090b0, 0.55));
const sunLight = new THREE.PointLight(0xfff0d8, 6, 0, 0);
scene.add(sunLight);

// starfield
{
  const N = 2500;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const rnd = mulberry32(12345);
  const tmp = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const u = rnd() * 2 - 1;
    const t = rnd() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const r = 1500;
    pos[i * 3] = r * s * Math.cos(t);
    pos[i * 3 + 1] = r * u;
    pos[i * 3 + 2] = r * s * Math.sin(t);
    tmp.setHSL(rnd() < 0.5 ? 0.6 : 0.1, 0.4 * rnd(), 0.55 + 0.45 * rnd());
    col[i * 3] = tmp.r;
    col[i * 3 + 1] = tmp.g;
    col[i * 3 + 2] = tmp.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false });
  scene.add(new THREE.Points(geo, mat));
}

// star
const SUN_RADIUS = 7;
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(SUN_RADIUS, 64, 48),
  new THREE.MeshBasicMaterial({ map: sunTexture() }),
);
scene.add(sun);
{
  const gt = glowTexture();
  const mk = (scale: number, opacity: number) => {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: gt, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity }),
    );
    s.scale.set(scale, scale, 1);
    scene.add(s);
  };
  mk(40, 1);
  mk(90, 0.45);
}

// planets
interface MoonRuntime {
  pivot: THREE.Group;
  spec: MoonSpec;
}
interface Planet {
  spec: PlanetSpec;
  group: THREE.Group;
  body: THREE.Mesh;
  hit: THREE.Mesh;
  moons: MoonRuntime[];
  angle: number;
  angularSpeed: number;
}

const planets: Planet[] = [];
const hitMeshes: THREE.Mesh[] = [];
const sphereGeo = new THREE.SphereGeometry(1, 48, 32);
const moonGeo = new THREE.SphereGeometry(1, 24, 16);
const hitGeo = new THREE.SphereGeometry(1, 8, 6);

for (const spec of SPECS) {
  const group = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.rotation.z = spec.tilt;
  group.add(tilt);

  const body = new THREE.Mesh(
    sphereGeo,
    new THREE.MeshStandardMaterial({ map: planetTexture(spec), roughness: 0.9, metalness: 0 }),
  );
  body.scale.setScalar(spec.radius);
  tilt.add(body);

  if (spec.ring) {
    const inner = spec.ring.inner * spec.radius;
    const outer = spec.ring.outer * spec.radius;
    const rg = new THREE.RingGeometry(inner, outer, 96, 1);
    const p = rg.attributes.position;
    const uv = rg.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const len = Math.hypot(p.getX(i), p.getY(i));
      uv.setXY(i, (len - inner) / (outer - inner), 0.5);
    }
    const ring = new THREE.Mesh(
      rg,
      new THREE.MeshStandardMaterial({
        map: ringTexture(spec.ring.colors, spec.ring.opacity),
        transparent: true,
        side: THREE.DoubleSide,
        roughness: 1,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    tilt.add(ring);
  }

  const moons: MoonRuntime[] = [];
  for (const m of spec.moons ?? []) {
    const pivot = new THREE.Group();
    pivot.rotation.y = m.phase;
    const mesh = new THREE.Mesh(moonGeo, new THREE.MeshStandardMaterial({ color: m.color, roughness: 1 }));
    mesh.scale.setScalar(m.radius);
    mesh.position.x = m.distance;
    pivot.add(mesh);
    group.add(pivot);
    moons.push({ pivot, spec: m });

    // faint moon orbit line
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * m.distance, 0, Math.sin(a) * m.distance));
    }
    group.add(
      new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x8890a8, transparent: true, opacity: 0.25 }),
      ),
    );
  }

  const hit = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false }));
  hit.userData.planet = spec.name;
  group.add(hit);
  hitMeshes.push(hit);

  scene.add(group);

  // orbit line
  const pts: THREE.Vector3[] = [];
  const SEG = 192;
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * spec.orbit, 0, Math.sin(a) * spec.orbit));
  }
  scene.add(
    new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x7f93bb, transparent: true, opacity: 0.45 }),
    ),
  );

  planets.push({
    spec,
    group,
    body,
    hit,
    moons,
    angle: spec.phase,
    angularSpeed: (Math.PI * 2) / visualPeriodSeconds(spec.periodDays),
  });
}

function positionPlanet(p: Planet): void {
  p.group.position.set(Math.cos(p.angle) * p.spec.orbit, 0, Math.sin(p.angle) * p.spec.orbit);
}
planets.forEach(positionPlanet);

// ---------- DOM UI ----------

const uiStyle = document.createElement('style');
uiStyle.textContent = `
  .ss-ui { position: absolute; z-index: 10; font: 12px/1.4 system-ui, sans-serif; color: #e8eefc; }
  #ss-pause { left: 568px; top: 8px; padding: 5px 0; width: 64px; background: rgba(20,28,50,0.85);
    color: #e8eefc; border: 1px solid #5f78b0; border-radius: 4px; cursor: pointer; font: inherit; }
  #ss-pause:hover { background: rgba(40,56,100,0.95); }
  #ss-info { left: 8px; top: 8px; min-width: 170px; padding: 8px 12px; background: rgba(10,16,34,0.82);
    border: 1px solid #5f78b0; border-radius: 6px; display: none; pointer-events: none; }
  #ss-info h2 { margin: 0 0 4px; font-size: 16px; font-weight: 600; }
  #ss-info div { color: #b8c6e8; }
  #ss-info b { color: #fff; font-weight: 600; }
  #ss-hint { left: 8px; top: 338px; color: #7f8fb5; font-size: 11px; pointer-events: none; }
`;
document.head.appendChild(uiStyle);

const pauseBtn = document.createElement('button');
pauseBtn.id = 'ss-pause';
pauseBtn.type = 'button';
pauseBtn.className = 'ss-ui';
pauseBtn.textContent = 'Pause';
document.body.appendChild(pauseBtn);

const infoPanel = document.createElement('div');
infoPanel.id = 'ss-info';
infoPanel.className = 'ss-ui';
const infoName = document.createElement('h2');
const infoPeriod = document.createElement('div');
const infoDist = document.createElement('div');
infoPanel.append(infoName, infoPeriod, infoDist);
document.body.appendChild(infoPanel);

const hint = document.createElement('div');
hint.id = 'ss-hint';
hint.className = 'ss-ui';
hint.textContent = 'Drag: orbit  Scroll: zoom  Click planet: focus  Esc: back';
document.body.appendChild(hint);

// ---------- state & camera ----------

let paused = false;
let focused: Planet | null = null;

const view = { theta: 0.6, phi: 0.95, radius: 200 };
const MIN_R = 40;
const MAX_R = 380;
const MIN_PHI = 0.12;
const MAX_PHI = Math.PI / 2 - 0.03;

const camTarget = new THREE.Vector3();
const tmpPos = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();
const endPos = new THREE.Vector3();
const endTarget = new THREE.Vector3();
let trans: { t0: number; startPos: THREE.Vector3; startTarget: THREE.Vector3 } | null = null;

function overviewPose(pos: THREE.Vector3, target: THREE.Vector3): void {
  target.set(0, 0, 0);
  const s = Math.sin(view.phi);
  pos.set(view.radius * s * Math.sin(view.theta), view.radius * Math.cos(view.phi), view.radius * s * Math.cos(view.theta));
}

const radial = new THREE.Vector3();
const tangent = new THREE.Vector3();
function focusPose(p: Planet, pos: THREE.Vector3, target: THREE.Vector3): void {
  target.copy(p.group.position);
  radial.set(p.group.position.x, 0, p.group.position.z).normalize();
  tangent.set(-radial.z, 0, radial.x);
  pos.copy(radial).multiplyScalar(-0.55).addScaledVector(tangent, 0.6);
  pos.y += 0.42;
  pos.normalize().multiplyScalar(p.spec.focusDist).add(p.group.position);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function beginTransition(): void {
  trans = { t0: performance.now(), startPos: camera.position.clone(), startTarget: camTarget.clone() };
}

function updateInfo(): void {
  if (!focused) {
    infoPanel.style.display = 'none';
    return;
  }
  const s = focused.spec;
  infoName.textContent = s.name;
  infoPeriod.replaceChildren('Orbital period: ', bold(`${s.periodDays.toLocaleString('en-US')} Earth days`));
  infoDist.replaceChildren('Distance from star: ', bold(`${s.distanceMkm.toLocaleString('en-US')} million km`));
  infoPanel.style.display = 'block';
}

function bold(text: string): HTMLElement {
  const b = document.createElement('b');
  b.textContent = text;
  return b;
}

function findPlanet(name: string): Planet | undefined {
  const n = String(name).trim().toLowerCase();
  return planets.find((p) => p.spec.name.toLowerCase() === n);
}

function focusPlanet(p: Planet): void {
  if (focused === p) return;
  focused = p;
  beginTransition();
  updateInfo();
}

function unfocus(): void {
  if (!focused) return;
  focused = null;
  beginTransition();
  updateInfo();
}

pauseBtn.addEventListener('click', () => {
  paused = !paused;
  pauseBtn.textContent = paused ? 'Play' : 'Pause';
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') unfocus();
});

// ---------- pointer interaction ----------

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function pick(clientX: number, clientY: number): Planet | null {
  const rect = canvas!.getBoundingClientRect();
  ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(hitMeshes, false);
  if (hits.length === 0) return null;
  const name = hits[0].object.userData.planet as string;
  return findPlanet(name) ?? null;
}

let down: { x: number; y: number; id: number } | null = null;
let dragged = false;
let lastX = 0;
let lastY = 0;

canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, id: e.pointerId };
  lastX = e.clientX;
  lastY = e.clientY;
  dragged = false;
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (down && down.id === e.pointerId) {
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) dragged = true;
    if (dragged && !focused) {
      view.theta -= (e.clientX - lastX) * 0.007;
      view.phi = Math.min(MAX_PHI, Math.max(MIN_PHI, view.phi - (e.clientY - lastY) * 0.006));
    }
    lastX = e.clientX;
    lastY = e.clientY;
  } else {
    canvas.style.cursor = pick(e.clientX, e.clientY) ? 'pointer' : 'default';
  }
});

canvas.addEventListener('pointerup', (e) => {
  if (!down || down.id !== e.pointerId) return;
  const wasDrag = dragged;
  down = null;
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  if (wasDrag) return;
  const p = pick(e.clientX, e.clientY);
  if (p) focusPlanet(p);
  else unfocus();
});

canvas.addEventListener('pointercancel', () => {
  down = null;
});

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    if (focused) return;
    view.radius = Math.min(MAX_R, Math.max(MIN_R, view.radius * Math.exp(e.deltaY * 0.001)));
  },
  { passive: false },
);

// ---------- exposed API ----------

const state = {
  get ready(): boolean {
    return ready;
  },
  get focused(): string | null {
    return focused ? focused.spec.name : null;
  },
  get paused(): boolean {
    return paused;
  },
  get planets(): { name: string; x: number; y: number; z: number }[] {
    return planets.map((p) => ({ name: p.spec.name, x: p.group.position.x, y: p.group.position.y, z: p.group.position.z }));
  },
  get cameraDistanceToFocus(): number | null {
    return focused ? camera.position.distanceTo(focused.group.position) : null;
  },
};

declare global {
  interface Window {
    __TASK_STATE__: typeof state;
    __focusPlanet: (name: string) => void;
    __unfocus: () => void;
    __EVAL_READY__?: boolean;
  }
}

let ready = false;
Object.defineProperty(window, '__TASK_STATE__', { value: state, writable: false, configurable: false, enumerable: true });
window.__focusPlanet = (name: string) => {
  const p = findPlanet(name);
  if (p) focusPlanet(p);
};
window.__unfocus = () => unfocus();

// ---------- main loop ----------

overviewPose(camera.position, camTarget);
camera.lookAt(camTarget);

let last = performance.now();
const hitTmp = new THREE.Vector3();

function frame(now: number): void {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;

  if (!paused) {
    for (const p of planets) {
      p.angle += p.angularSpeed * dt;
      positionPlanet(p);
      p.body.rotation.y += p.spec.spin * dt;
      for (const m of p.moons) m.pivot.rotation.y += m.spec.speed * dt;
    }
    sun.rotation.y += 0.05 * dt;
  }

  // keep click targets a usable size on screen
  for (const p of planets) {
    const d = hitTmp.copy(p.group.position).distanceTo(camera.position);
    p.hit.scale.setScalar(Math.max(p.spec.radius * 1.15, d * 0.016));
  }

  if (focused) focusPose(focused, endPos, endTarget);
  else overviewPose(endPos, endTarget);

  if (trans) {
    const k = Math.min(1, (performance.now() - trans.t0) / TRANSITION_MS);
    const e = easeInOutCubic(k);
    tmpPos.copy(trans.startPos).lerp(endPos, e);
    tmpTarget.copy(trans.startTarget).lerp(endTarget, e);
    camera.position.copy(tmpPos);
    camTarget.copy(tmpTarget);
    if (k >= 1) trans = null;
  } else {
    camera.position.copy(endPos);
    camTarget.copy(endTarget);
  }
  camera.lookAt(camTarget);

  renderer.render(scene, camera);

  if (!ready) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
