import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

declare global {
  interface Window {
    __TASK_STATE__: { turntableAngleDeg: number; paintFinish: string };
    __EVAL_READY__?: boolean;
  }
}

const canvas = document.getElementById('app') as HTMLCanvasElement;
const W = 640;
const H = 360;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030409);

const camera = new THREE.PerspectiveCamera(34, W / H, 0.1, 100);
camera.position.set(4.9, 1.55, 6.6);
camera.lookAt(0, 0.62, 0);

// ---------------------------------------------------------------------------
// Studio layout: soft-box strips. Used both for the reflection environment
// and (as visible emissive boxes) in the main scene.
// ---------------------------------------------------------------------------
interface Strip {
  size: [number, number, number];
  pos: [number, number, number];
  color: [number, number, number];
  rot?: [number, number, number];
}

const strips: Strip[] = [
  // overhead long strips
  { size: [11, 0.14, 0.9], pos: [0, 5.6, 1.6], color: [7, 7, 7.2] },
  { size: [11, 0.14, 0.55], pos: [0, 5.8, -2.4], color: [6, 6, 6.4] },
  // side strips
  { size: [0.14, 3.2, 10], pos: [-7, 3.0, 0], color: [5, 5.2, 5.6] },
  { size: [0.14, 2.4, 8], pos: [7.5, 2.8, -1.5], color: [4, 4.2, 4.6] },
  // cool rim strip behind
  { size: [10, 0.22, 0.22], pos: [0, 2.4, -8], color: [0.7, 1.7, 4.5] },
  // dim front fill, behind the camera
  { size: [7, 2.2, 0.1], pos: [1, 3.0, 11], color: [0.9, 0.9, 1.0] },
];

function makeStripMesh(s: Strip): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
  mat.color.setRGB(s.color[0], s.color[1], s.color[2]);
  const m = new THREE.Mesh(new THREE.BoxGeometry(...s.size), mat);
  m.position.set(...s.pos);
  if (s.rot) m.rotation.set(...s.rot);
  return m;
}

function buildEnvironment(): THREE.Texture {
  const envScene = new THREE.Scene();
  // gradient dome
  const dome = new THREE.SphereGeometry(40, 32, 16);
  const pos = dome.getAttribute('position');
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 40;
    const h = Math.exp(-Math.pow(y / 0.35, 2));
    const base = y < 0 ? 0.012 : 0.01;
    cols[i * 3] = base + 0.03 * h;
    cols[i * 3 + 1] = base + 0.034 * h;
    cols[i * 3 + 2] = base * 1.4 + 0.045 * h;
  }
  dome.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  envScene.add(
    new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })),
  );
  for (const s of strips) envScene.add(makeStripMesh(s));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(envScene, 0.01, 0.1, 100);
  pmrem.dispose();
  return rt.texture;
}

scene.environment = buildEnvironment();
scene.environmentIntensity = 1.0;

for (const s of strips) scene.add(makeStripMesh(s));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function smoothSeams(geo: THREE.BufferGeometry): void {
  geo.computeVertexNormals();
  const p = geo.getAttribute('position');
  const n = geo.getAttribute('normal');
  const sums = new Map<string, THREE.Vector3>();
  const key = (i: number) =>
    `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(i);
    let v = sums.get(k);
    if (!v) {
      v = new THREE.Vector3();
      sums.set(k, v);
    }
    v.x += n.getX(i);
    v.y += n.getY(i);
    v.z += n.getZ(i);
  }
  for (let i = 0; i < p.count; i++) {
    const v = sums.get(key(i))!.clone().normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
}

/** Ellipsoid with poles on the x axis (nose/tail), optionally deformed. */
function ellipsoid(
  a: number,
  b: number,
  c: number,
  deform?: (v: THREE.Vector3) => void,
  opts: { thetaLength?: number } = {},
): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 96, 64, 0, Math.PI * 2, 0, opts.thetaLength ?? Math.PI);
  g.rotateZ(-Math.PI / 2); // poles (y) -> x axis
  const p = g.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    if (deform) deform(v);
    p.setXYZ(i, v.x * a, v.y * b, v.z * c);
  }
  smoothSeams(g);
  return g;
}

function makeFlakeNormalMap(): THREE.DataTexture {
  const size = 512;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const strong = Math.random() < 0.3;
    const amp = strong ? 0.95 : 0.12;
    let nx = (Math.random() * 2 - 1) * amp;
    let ny = (Math.random() * 2 - 1) * amp;
    const l = Math.hypot(nx, ny);
    if (l > 0.97) {
      nx *= 0.97 / l;
      ny *= 0.97 / l;
    }
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    data[i * 4] = Math.round((nx * 0.5 + 0.5) * 255);
    data[i * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
    data[i * 4 + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
const paint = new THREE.MeshPhysicalMaterial({
  color: 0xb8000c,
  metalness: 0.62,
  roughness: 0.34,
  normalMap: makeFlakeNormalMap(),
  normalScale: new THREE.Vector2(0.55, 0.55),
  clearcoat: 1,
  clearcoatRoughness: 0.025,
  envMapIntensity: 1.1,
});

const glass = new THREE.MeshPhysicalMaterial({
  color: 0x020203,
  metalness: 0.0,
  roughness: 0.08,
  clearcoat: 1,
  clearcoatRoughness: 0.02,
  envMapIntensity: 1.3,
});

const chrome = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  metalness: 1,
  roughness: 0.06,
  envMapIntensity: 1.2,
});

const rubber = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.75, metalness: 0 });

const tailLight = new THREE.MeshStandardMaterial({
  color: 0x400004,
  emissive: 0xff1010,
  emissiveIntensity: 1.6,
  roughness: 0.2,
});

// ---------------------------------------------------------------------------
// The car
// ---------------------------------------------------------------------------
const car = new THREE.Group();

const bodyCY = 0.74;
const bodyA = 2.1;
const bodyB = 0.58;
const bodyC = 0.95;
const bodyDeform = (v: THREE.Vector3) => {
  // v is on a unit sphere with x the long axis
  v.y = v.y * (1 - 0.18 * Math.max(0, -v.y)); // flatter underside
  v.z *= 1 - 0.14 * v.x; // narrower nose
  v.y -= 0.12 * Math.max(0, v.x) * Math.max(0, v.y); // sloping bonnet
};
const body = new THREE.Mesh(ellipsoid(bodyA, bodyB, bodyC, bodyDeform), paint);
body.position.y = bodyCY;
car.add(body);

// cabin: dark glass dome with a painted roof cap
const cabinPos = new THREE.Vector3(-0.2, 1.12, 0);
const cabinDeform = (v: THREE.Vector3) => {
  v.z *= 1 - 0.12 * v.x;
};
const cabin = new THREE.Mesh(ellipsoid(1.05, 0.55, 0.72, cabinDeform), glass);
cabin.position.copy(cabinPos);
car.add(cabin);

const roof = new THREE.Mesh(
  (() => {
    // cap of a slightly larger ellipsoid, built from a sphere with poles on y then rotated
    const g = new THREE.SphereGeometry(1, 96, 24, 0, Math.PI * 2, 0, 0.78);
    const p = g.getAttribute('position');
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      v.z *= 1 - 0.12 * v.x;
      p.setXYZ(i, v.x * 1.075, v.y * 0.575, v.z * 0.755);
    }
    smoothSeams(g);
    return g;
  })(),
  paint,
);
roof.position.copy(cabinPos);
car.add(roof);

// chrome belt strip around the body
{
  const pts: THREE.Vector3[] = [];
  const y = -0.07;
  const N = 128;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(t), 0, Math.sin(t));
    // find radius along dir where the deformed body surface lies (march outward)
    let lo = 0.2;
    let hi = 2.6;
    for (let k = 0; k < 20; k++) {
      const mid = (lo + hi) / 2;
      const x = dir.x * mid;
      const z = dir.z * mid;
      const inside = bodyContains(x, y, z);
      if (inside) lo = mid;
      else hi = mid;
    }
    const r = lo + 0.004;
    pts.push(new THREE.Vector3(dir.x * r, y + bodyCY, dir.z * r));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 256, 0.022, 10, true), chrome);
  car.add(tube);
}

/** Approximate inside test for the deformed body (relative to body centre). */
function bodyContains(x: number, y: number, z: number): boolean {
  // sample the deformation numerically: invert by search over unit-sphere param is costly,
  // so scan a fine grid along the sphere's latitude for the given direction.
  const ux = x / bodyA;
  // find the max |z| allowed at this x and y by scanning the unit sphere
  const v = new THREE.Vector3();
  const sx = Math.max(-1, Math.min(1, ux));
  const ring = Math.sqrt(Math.max(0, 1 - sx * sx));
  let best = 0;
  const steps = 360;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    v.set(sx, ring * Math.cos(a), ring * Math.sin(a));
    bodyDeform(v);
    const py = v.y * bodyB;
    if (Math.abs(py - y) < 0.03) {
      best = Math.max(best, Math.abs(v.z) * bodyC);
    }
  }
  return Math.abs(ux) < 1 && Math.abs(z) < best;
}

// headlights and tail lights
for (const side of [-1, 1]) {
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 32, 20), chrome);
  head.scale.set(0.8, 1, 1.2);
  head.position.set(1.72, 0.84, side * 0.46);
  car.add(head);
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), tailLight);
  tail.scale.set(0.6, 0.8, 1.4);
  tail.position.set(-1.86, 0.84, side * 0.48);
  car.add(tail);
}

// front bumper strip (chrome)
{
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = -0.9 + (i / 24) * 1.8;
    const x = 1.74 - 0.08 * Math.pow(a / 0.9, 2) * 0 - Math.pow(a, 2) * 0.45;
    pts.push(new THREE.Vector3(x, 0.5, a * 0.62));
  }
  const bump = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.03, 10, false),
    chrome,
  );
  car.add(bump);
}

// wheels
function makeWheel(): THREE.Group {
  const g = new THREE.Group();
  const profile = [
    new THREE.Vector2(0.2, -0.15),
    new THREE.Vector2(0.34, -0.15),
    new THREE.Vector2(0.385, -0.13),
    new THREE.Vector2(0.405, -0.09),
    new THREE.Vector2(0.41, 0),
    new THREE.Vector2(0.405, 0.09),
    new THREE.Vector2(0.385, 0.13),
    new THREE.Vector2(0.34, 0.15),
    new THREE.Vector2(0.2, 0.15),
  ];
  const tire = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), rubber);
  g.add(tire);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.3, 40), chrome);
  g.add(hub);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.32, 24), rubber);
  g.add(cap);
  g.rotation.x = Math.PI / 2;
  return g;
}
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    const w = makeWheel();
    w.position.set(sx * 1.2, 0.41, sz * 0.8);
    car.add(w);
  }
}

// ---------------------------------------------------------------------------
// Turntable
// ---------------------------------------------------------------------------
const turntable = new THREE.Group();
scene.add(turntable);
turntable.add(car);

const platformR = 3.0;
const platform = new THREE.Group();
scene.add(platform);

const sideMat = new THREE.MeshStandardMaterial({ color: 0x14161b, metalness: 0.85, roughness: 0.28 });
const side = new THREE.Mesh(new THREE.CylinderGeometry(platformR + 0.05, platformR + 0.05, 0.3, 96, 1, true), sideMat);
side.position.y = -0.15;
platform.add(side);
const under = new THREE.Mesh(new THREE.CircleGeometry(platformR + 0.05, 96), new THREE.MeshBasicMaterial({ color: 0x020203 }));
under.rotation.x = -Math.PI / 2;
under.position.y = -0.02;
platform.add(under);

const mirror = new Reflector(new THREE.CircleGeometry(platformR, 96), {
  color: 0xffffff,
  textureWidth: 1024,
  textureHeight: 576,
  clipBias: 0.003,
});
mirror.rotation.x = -Math.PI / 2;
platform.add(mirror);

// dark tinted overlay so the reflection stays faint
function makeOverlayTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(6,7,10,0.70)');
  grad.addColorStop(0.7, 'rgba(6,8,12,0.80)');
  grad.addColorStop(1, 'rgba(8,10,16,0.93)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const overlay = new THREE.Mesh(
  new THREE.CircleGeometry(platformR, 96),
  new THREE.MeshBasicMaterial({
    map: makeOverlayTexture(),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  }),
);
overlay.rotation.x = -Math.PI / 2;
overlay.position.y = 0.004;
platform.add(overlay);

// ring light + chrome edge
const ringMat = new THREE.MeshBasicMaterial({ toneMapped: false });
ringMat.color.setRGB(0.5, 1.2, 2.6);
const ring = new THREE.Mesh(new THREE.TorusGeometry(platformR - 0.2, 0.022, 12, 160), ringMat);
ring.rotation.x = Math.PI / 2;
ring.position.y = 0.02;
platform.add(ring);

const glowMat = new THREE.MeshBasicMaterial({
  color: 0x2a6bff,
  transparent: true,
  opacity: 0.22,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const glow = new THREE.Mesh(new THREE.TorusGeometry(platformR - 0.2, 0.09, 12, 160), glowMat);
glow.rotation.x = Math.PI / 2;
glow.position.y = 0.02;
platform.add(glow);

const edge = new THREE.Mesh(new THREE.TorusGeometry(platformR + 0.02, 0.035, 12, 160), chrome);
edge.rotation.x = Math.PI / 2;
platform.add(edge);

const innerRing = new THREE.Mesh(
  new THREE.RingGeometry(1.2, 1.23, 128),
  new THREE.MeshBasicMaterial({ color: 0x1a2a44, transparent: true, opacity: 0.8, depthWrite: false }),
);
innerRing.rotation.x = -Math.PI / 2;
innerRing.position.y = 0.008;
platform.add(innerRing);

// showroom floor
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(45, 64),
  new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.85, metalness: 0.2 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.32;
scene.add(floor);

// ---------------------------------------------------------------------------
// Lights (direct): faint cool rim and a very soft key
// ---------------------------------------------------------------------------
const rim = new THREE.DirectionalLight(0x6f9bff, 1.6);
rim.position.set(-3, 3.5, -5);
scene.add(rim);
const rim2 = new THREE.DirectionalLight(0x5a85ff, 0.8);
rim2.position.set(5, 2.5, -5);
scene.add(rim2);
scene.add(new THREE.AmbientLight(0x202838, 0.35));

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
const SPEED_DEG = 20;
window.__TASK_STATE__ = { turntableAngleDeg: 0, paintFinish: 'clearcoat' };

let startTime = performance.now();
let angleDeg = 25;
let last = startTime;
let first = true;

function frame(now: number): void {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  angleDeg += SPEED_DEG * dt;
  turntable.rotation.y = THREE.MathUtils.degToRad(angleDeg);
  window.__TASK_STATE__.turntableAngleDeg = angleDeg;
  window.__TASK_STATE__.paintFinish = 'clearcoat';
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
void startTime;
requestAnimationFrame((t) => {
  last = t;
  frame(t);
});
