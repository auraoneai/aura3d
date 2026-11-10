import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

declare global {
  interface Window {
    __TASK_STATE__?: { turntableAngleDeg: number; paintFinish: string };
    __EVAL_READY__?: boolean;
  }
}

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const BG = 0x06070a;
scene.fog = new THREE.Fog(BG, 16, 42);

// ---------- background gradient ----------
{
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#030406');
  grd.addColorStop(0.55, '#0a0d13');
  grd.addColorStop(0.7, '#10141c');
  grd.addColorStop(1, '#06070a');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
}

// ---------- studio environment (generated in code) ----------
function strip(
  parent: THREE.Object3D,
  pos: [number, number, number],
  size: [number, number, number],
  color: THREE.Color,
  intensity: number,
): void {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(intensity), fog: false }),
  );
  m.position.set(pos[0], pos[1], pos[2]);
  parent.add(m);
}

const WHITE = new THREE.Color(1, 1, 1);
const WARM = new THREE.Color(1.0, 0.93, 0.85);
const COOL = new THREE.Color(0.45, 0.65, 1.0);

function buildStudioEnv(): THREE.Scene {
  const s = new THREE.Scene();
  // dim room with a faint horizon band
  const roomGeo = new THREE.SphereGeometry(30, 48, 32);
  const pos = roomGeo.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 30;
    const band = Math.exp(-Math.pow((y - 0.05) / 0.25, 2));
    const v = 0.012 + 0.07 * band + (y < -0.1 ? 0.01 : 0);
    cols[i * 3] = v * 0.95;
    cols[i * 3 + 1] = v;
    cols[i * 3 + 2] = v * 1.15;
  }
  roomGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  s.add(new THREE.Mesh(roomGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));

  strip(s, [0, 6, -1.5], [16, 0.2, 1.0], WHITE, 9);
  strip(s, [0, 6.5, 2.8], [16, 0.2, 0.6], WARM, 6);
  strip(s, [0, 2.4, 9], [16, 0.5, 0.2], WHITE, 5);
  strip(s, [0, 3.2, -9], [16, 1.2, 0.2], WHITE, 4);
  strip(s, [-8, 3, -4], [0.2, 6, 0.5], COOL, 6);
  strip(s, [9, 2, -3], [0.2, 4, 0.6], WHITE, 3);
  strip(s, [-9, 2.5, 4], [0.2, 5, 0.4], COOL, 2.5);
  return s;
}

const pmrem = new THREE.PMREMGenerator(renderer);
const envRT = pmrem.fromScene(buildStudioEnv(), 0.025);
scene.environment = envRT.texture;
scene.environmentIntensity = 1.0;

// visible strip lights in the showroom
{
  const vis = new THREE.Group();
  strip(vis, [-1, 4.1, -7], [13, 0.12, 0.5], WHITE, 6);
  strip(vis, [1, 3.0, -10], [16, 0.1, 0.3], WARM, 3);
  strip(vis, [-8.5, 2.5, -4.5], [0.12, 5, 0.3], COOL, 3);
  strip(vis, [8.5, 2.2, -6], [0.12, 4, 0.3], WHITE, 1.6);
  scene.add(vis);
}

// ---------- lights ----------
const key = new THREE.DirectionalLight(0xffffff, 0.5);
key.position.set(2, 8, 3);
scene.add(key);
const rim = new THREE.DirectionalLight(0x6f98ff, 1.2);
rim.position.set(-6, 3, -7);
scene.add(rim);

// ---------- helpers: parametric superellipsoid ----------
const spow = (x: number, e: number): number => (x < 0 ? -1 : 1) * Math.pow(Math.abs(x), e);

type Surf = (phi: number, theta: number) => THREE.Vector3;

function makeSurf(A: number, B: number, C: number, e1: number, e2: number, bottom: number, taper: number): Surf {
  return (phi, theta) => {
    const p = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, phi));
    const s1 = spow(Math.sin(p), e1);
    const c1 = spow(Math.cos(p), e1);
    const st = spow(Math.sin(theta), e2);
    const ct = spow(Math.cos(theta), e2);
    const x = A * s1;
    let y = B * c1 * st;
    if (y < 0) y *= bottom;
    y *= 1 - taper * s1;
    const z = C * c1 * ct;
    return new THREE.Vector3(x, y, z);
  };
}

function surfNormal(surf: Surf, phi: number, theta: number, sign: number): THREE.Vector3 {
  const h = 1e-3;
  const lo = -Math.PI / 2 + 1e-4;
  const hi = Math.PI / 2 - 1e-4;
  const tt = surf(phi, theta + h).sub(surf(phi, theta - h));
  const tp = surf(Math.min(hi, phi + h), theta).sub(surf(Math.max(lo, phi - h), theta));
  const n = new THREE.Vector3().crossVectors(tt, tp).multiplyScalar(sign);
  if (n.lengthSq() < 1e-16) return new THREE.Vector3(phi > 0 ? 1 : -1, 0, 0);
  return n.normalize();
}

function outwardSign(surf: Surf): number {
  const phi = 0.3;
  const theta = 0.4;
  const p = surf(phi, theta);
  const h = 1e-3;
  const tt = surf(phi, theta + h).sub(surf(phi, theta - h));
  const tp = surf(phi + h, theta).sub(surf(phi - h, theta));
  const n = new THREE.Vector3().crossVectors(tt, tp);
  return n.dot(p) >= 0 ? 1 : -1;
}

function buildSurfGeometry(surf: Surf, nPhi: number, nTheta: number, roofHalf: number): THREE.BufferGeometry {
  const sign = outwardSign(surf);
  const verts: number[] = [];
  const norms: number[] = [];
  const uvs: number[] = [];
  for (let i = 0; i <= nPhi; i++) {
    const phi = -Math.PI / 2 + (Math.PI * i) / nPhi;
    for (let j = 0; j <= nTheta; j++) {
      const theta = -Math.PI + (2 * Math.PI * j) / nTheta;
      const p = surf(phi, theta);
      const n = surfNormal(surf, phi, theta, sign);
      verts.push(p.x, p.y, p.z);
      norms.push(n.x, n.y, n.z);
      uvs.push(j / nTheta, i / nPhi);
    }
  }
  const glass: number[] = [];
  const roof: number[] = [];
  const row = nTheta + 1;
  for (let i = 0; i < nPhi; i++) {
    for (let j = 0; j < nTheta; j++) {
      const a = i * row + j;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      const thMid = -Math.PI + (2 * Math.PI * (j + 0.5)) / nTheta;
      const inRoof = roofHalf > 0 && Math.abs(thMid - Math.PI / 2) < roofHalf;
      const target = inRoof ? roof : glass;
      if (sign > 0) target.push(a, b, c, b, d, c);
      else target.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex([...glass, ...roof]);
  g.addGroup(0, glass.length, 0);
  if (roof.length > 0) g.addGroup(glass.length, roof.length, 1);
  return g;
}

function tube(points: THREE.Vector3[], radius: number, closed: boolean, mat: THREE.Material): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  return new THREE.Mesh(new THREE.TubeGeometry(curve, points.length * 3, radius, 10, closed), mat);
}

// ---------- materials ----------
function makeFlakeNormalMap(): THREE.CanvasTexture {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const img = g.createImageData(size, size);
  let seed = 1337;
  const rnd = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < size * size; i++) {
    const a = rnd() * Math.PI * 2;
    const t = Math.pow(rnd(), 0.6) * 0.95;
    const nx = Math.cos(a) * t;
    const ny = Math.sin(a) * t;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    img.data[i * 4] = Math.round((nx * 0.5 + 0.5) * 255);
    img.data[i * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
    img.data[i * 4 + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

const paint = new THREE.MeshPhysicalMaterial({
  color: 0x9c0414,
  metalness: 0.65,
  roughness: 0.32,
  normalMap: makeFlakeNormalMap(),
  normalScale: new THREE.Vector2(0.45, 0.45),
  clearcoat: 1.0,
  clearcoatRoughness: 0.025,
  envMapIntensity: 1.1,
});

const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0x10151c,
  metalness: 0.9,
  roughness: 0.07,
  clearcoat: 1.0,
  clearcoatRoughness: 0.02,
  envMapIntensity: 1.2,
});

const chrome = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1.0, roughness: 0.04 });
const rubber = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, metalness: 0.0, roughness: 0.85 });
const headMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0xfff2dd,
  emissiveIntensity: 2.5,
  roughness: 0.2,
});
const tailMat = new THREE.MeshStandardMaterial({
  color: 0x550000,
  emissive: 0xff1010,
  emissiveIntensity: 1.8,
  roughness: 0.3,
});

// ---------- the object ----------
const car = new THREE.Group();
const bodySurf = makeSurf(2.1, 0.5, 0.95, 0.8, 0.6, 0.55, 0.2);
const bodySign = outwardSign(bodySurf);
car.add(new THREE.Mesh(buildSurfGeometry(bodySurf, 120, 160, 0), [paint]));

// cabin: dark glass with a painted roof band
const cabinSurf = makeSurf(1.05, 0.62, 0.74, 1.0, 0.85, 1.0, 0.0);
const cabin = new THREE.Mesh(buildSurfGeometry(cabinSurf, 96, 128, 0.7), [glassMat, paint]);
cabin.position.set(-0.3, 0.28, 0);
car.add(cabin);

// chrome belt line around the body
{
  const thb = 0.2;
  const pts: THREE.Vector3[] = [];
  const steps = 40;
  const lim = (82 * Math.PI) / 180;
  for (let k = 0; k <= steps; k++) {
    const phi = -lim + (2 * lim * k) / steps;
    pts.push(bodySurf(phi, thb).multiply(new THREE.Vector3(1, 1.01, 1.01)));
  }
  for (let k = steps; k >= 0; k--) {
    const phi = -lim + (2 * lim * k) / steps;
    pts.push(bodySurf(phi, Math.PI - thb).multiply(new THREE.Vector3(1, 1.01, 1.01)));
  }
  car.add(tube(pts, 0.022, true, chrome));
}

// chrome trim along the edges of the roof band
for (const th of [Math.PI / 2 - 0.7, Math.PI / 2 + 0.7]) {
  const pts: THREE.Vector3[] = [];
  const steps = 36;
  const lim = (74 * Math.PI) / 180;
  for (let k = 0; k <= steps; k++) {
    const phi = -lim + (2 * lim * k) / steps;
    pts.push(cabinSurf(phi, th).multiplyScalar(1.004).add(cabin.position));
  }
  car.add(tube(pts, 0.016, false, chrome));
}

// headlights and tail lights
for (const side of [-1, 1]) {
  for (const [phi, lens, ringMat] of [
    [1.12, headMat, chrome],
    [-1.12, tailMat, chrome],
  ] as [number, THREE.Material, THREE.Material][]) {
    const theta = side > 0 ? 0.32 : Math.PI - 0.32;
    const p = bodySurf(phi, theta);
    const n = surfNormal(bodySurf, phi, theta, bodySign);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    const lensMesh = new THREE.Mesh(new THREE.SphereGeometry(0.085, 24, 16), lens);
    lensMesh.scale.set(1, 1, 0.45);
    lensMesh.position.copy(p).addScaledVector(n, 0.005);
    lensMesh.quaternion.copy(q);
    car.add(lensMesh);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.017, 12, 32), ringMat);
    ring.position.copy(p).addScaledVector(n, 0.005);
    ring.quaternion.copy(q);
    car.add(ring);
  }
}

// wheels
{
  const profile = [
    [0.17, -0.13],
    [0.29, -0.14],
    [0.34, -0.115],
    [0.36, -0.05],
    [0.36, 0.05],
    [0.34, 0.115],
    [0.29, 0.14],
    [0.17, 0.13],
  ].map(([r, a]) => new THREE.Vector2(r, a));
  const tireGeo = new THREE.LatheGeometry(profile, 48);
  tireGeo.rotateX(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.27, 40);
  hubGeo.rotateX(Math.PI / 2);
  const capGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.31, 20);
  capGeo.rotateX(Math.PI / 2);
  for (const wx of [-1.3, 1.3]) {
    for (const wz of [-0.9, 0.9]) {
      const w = new THREE.Group();
      w.add(new THREE.Mesh(tireGeo, rubber));
      w.add(new THREE.Mesh(hubGeo, chrome));
      w.add(new THREE.Mesh(capGeo, rubber));
      w.position.set(wx, -0.24, wz);
      car.add(w);
    }
  }
}

car.position.y = 0.6;

// ---------- turntable ----------
const spin = new THREE.Group();
spin.add(car);

// rotating tick ring (shows the rotation on the platform)
{
  const tickMat = new THREE.MeshBasicMaterial({ color: 0x4a587a });
  const tickMatBright = new THREE.MeshBasicMaterial({ color: 0xa8b8e0 });
  for (let i = 0; i < 72; i++) {
    const major = i % 6 === 0;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.004, major ? 0.22 : 0.1),
      major ? tickMatBright : tickMat,
    );
    const a = (i / 72) * Math.PI * 2;
    m.position.set(Math.cos(a) * 3.1, 0.006, Math.sin(a) * 3.1);
    m.rotation.y = -a;
    spin.add(m);
  }
}
scene.add(spin);

// platform body
const platformMat = new THREE.MeshStandardMaterial({ color: 0x14161b, metalness: 0.85, roughness: 0.3 });
const platform = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.7, 0.3, 96, 1, false), platformMat);
platform.position.y = -0.15;
scene.add(platform);

// reflective floor
const mirror = new Reflector(new THREE.CircleGeometry(3.5, 96), {
  textureWidth: 1024,
  textureHeight: 576,
  clipBias: 0.003,
  color: 0x9aa0aa,
});
mirror.rotation.x = -Math.PI / 2;
mirror.position.y = 0.002;
scene.add(mirror);

// dark tinted glass overlay so the reflection stays faint
{
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(4,5,8,0.55)');
  grd.addColorStop(0.7, 'rgba(4,5,8,0.7)');
  grd.addColorStop(1, 'rgba(4,5,8,0.92)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const overlay = new THREE.Mesh(
    new THREE.CircleGeometry(3.5, 96),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }),
  );
  overlay.rotation.x = -Math.PI / 2;
  overlay.position.y = 0.004;
  scene.add(overlay);
}

// ring light around the platform rim
{
  const ringLight = new THREE.Mesh(
    new THREE.TorusGeometry(3.54, 0.028, 12, 160),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.75, 1.0).multiplyScalar(2.2), fog: false }),
  );
  ringLight.rotation.x = Math.PI / 2;
  ringLight.position.y = 0.012;
  scene.add(ringLight);
  const glow = new THREE.PointLight(0x6aa0ff, 0.0);
  scene.add(glow);
}

// showroom ground
{
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(60, 64),
    new THREE.MeshStandardMaterial({ color: 0x0a0b0e, metalness: 0.2, roughness: 0.75 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.3;
  scene.add(ground);
}

// ---------- camera ----------
const camera = new THREE.PerspectiveCamera(36, 640 / 360, 0.1, 100);
camera.position.set(6, 1.6, 8);
camera.lookAt(0, 0.65, 0);

// ---------- loop ----------
const DEG_PER_SEC = 20;
const t0 = performance.now();
let first = true;

function frame(): void {
  const t = (performance.now() - t0) / 1000;
  const angleDeg = t * DEG_PER_SEC;
  spin.rotation.y = THREE.MathUtils.degToRad(angleDeg);
  window.__TASK_STATE__ = { turntableAngleDeg: angleDeg, paintFinish: 'clearcoat' };
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
