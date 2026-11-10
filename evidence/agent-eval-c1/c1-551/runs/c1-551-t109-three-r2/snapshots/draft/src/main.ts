import * as THREE from 'three';

declare global {
  interface Window {
    __TASK_STATE__: { turntableAngleDeg: number; paintFinish: string };
    __EVAL_READY__: boolean;
  }
}

const canvas = document.getElementById('app') as HTMLCanvasElement;
const W = 640;
const H = 360;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// ---------- Studio rig (used for the reflection environment and for visible lights) ----------
function strip(
  parent: THREE.Object3D,
  size: [number, number, number],
  pos: [number, number, number],
  color: number,
  intensity: number,
): void {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) });
  mat.toneMapped = false;
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  m.position.set(...pos);
  parent.add(m);
}

function buildRig(forEnv: boolean): THREE.Group {
  const g = new THREE.Group();
  // two long overhead soft boxes
  strip(g, [10, 0.12, 0.7], [0, 5, -1.6], 0xffffff, 9);
  strip(g, [10, 0.12, 0.7], [0, 5, 1.9], 0xfff2e0, 7);
  // tall side strips
  strip(g, [0.15, 1.4, 9], [-6.5, 2.4, 0], 0xffffff, 8);
  strip(g, [9, 1.0, 0.15], [-1, 2.0, 6.5], 0xffffff, 5);
  // faint cool rim strips behind
  strip(g, [10, 0.5, 0.15], [0, 2.8, -6.5], 0x6aa8ff, 4);
  strip(g, [0.15, 3.5, 0.5], [6.5, 2.0, -3.5], 0x6aa8ff, 3);
  if (forEnv) {
    // dim ceiling fill and dark surround
    strip(g, [16, 0.1, 16], [0, 8, 0], 0xcfd8ff, 0.35);
    strip(g, [30, 0.1, 30], [0, -0.6, 0], 0x15171c, 0.5);
  }
  return g;
}

const envScene = new THREE.Scene();
envScene.background = new THREE.Color(0x07080b);
envScene.add(buildRig(true));
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(envScene, 0, 0.1, 100).texture;

// ---------- Scene ----------
const scene = new THREE.Scene();
scene.environment = envTex;
scene.environmentIntensity = 1.0;

{
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#05060a');
  grad.addColorStop(0.55, '#10131b');
  grad.addColorStop(0.7, '#0a0c12');
  grad.addColorStop(1, '#020203');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  const bg = new THREE.CanvasTexture(c);
  bg.colorSpace = THREE.SRGBColorSpace;
  scene.background = bg;
}

const visibleRig = buildRig(false);
scene.add(visibleRig);

const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
camera.position.set(6.6, 2.3, 8.6);
camera.lookAt(0, 0.55, 0);

const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(3, 6, 4);
scene.add(key);
const rim = new THREE.DirectionalLight(0x6a9cff, 2.2);
rim.position.set(-4, 3, -6);
scene.add(rim);

// ---------- Materials ----------
function makeFlakeNormalMap(): THREE.CanvasTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const img = ctx.createImageData(S, S);
  let seed = 1337;
  const rnd = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < S * S; i++) {
    let nx = (rnd() - 0.5) * 2;
    let ny = (rnd() - 0.5) * 2;
    const strength = rnd() < 0.35 ? 0.9 : 0.25;
    nx *= strength;
    ny *= strength;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    img.data[i * 4] = Math.round((nx * 0.5 + 0.5) * 255);
    img.data[i * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
    img.data[i * 4 + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 3);
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}

const paint = new THREE.MeshPhysicalMaterial({
  color: 0x8c0010,
  metalness: 0.55,
  roughness: 0.38,
  normalMap: makeFlakeNormalMap(),
  normalScale: new THREE.Vector2(0.9, 0.9),
  clearcoat: 1.0,
  clearcoatRoughness: 0.025,
  envMapIntensity: 1.0,
});

const glass = new THREE.MeshPhysicalMaterial({
  color: 0x030305,
  metalness: 0.2,
  roughness: 0.08,
  clearcoat: 1.0,
  clearcoatRoughness: 0.02,
});

const chrome = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1.0, roughness: 0.06 });
const rubber = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, metalness: 0.0, roughness: 0.85 });
const darkMetal = new THREE.MeshStandardMaterial({ color: 0x15161a, metalness: 0.9, roughness: 0.35 });
const lampMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0xfff4dd,
  emissiveIntensity: 1.5,
  roughness: 0.1,
});

// ---------- Car ----------
const car = new THREE.Group();

const BODY_Y = 0.85;
const BODY_R = new THREE.Vector3(2.1, 0.6, 1.0);

const body = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 80), paint);
body.scale.copy(BODY_R);
body.position.y = BODY_Y;
car.add(body);

// cabin: dark glass dome with a painted roof cap
const CAB = new THREE.Vector3(1.05, 0.5, 0.8);
const CAB_POS = new THREE.Vector3(-0.2, 1.2, 0);
const cabin = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), glass);
cabin.scale.copy(CAB);
cabin.position.copy(CAB_POS);
car.add(cabin);

const roof = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 24, 0, Math.PI * 2, 0, 0.62), paint);
roof.scale.copy(CAB).multiplyScalar(1.015);
roof.position.copy(CAB_POS);
car.add(roof);

// chrome ring where roof cap meets glass
{
  const th = 0.62;
  const r = Math.sin(th) * 1.015;
  const yy = Math.cos(th) * 1.015;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.018, 16, 96), chrome);
  ring.rotation.x = Math.PI / 2;
  ring.scale.set(CAB.x, CAB.z, 1);
  // torus tube is scaled non-uniformly in-plane; acceptable for a thin trim
  ring.position.set(CAB_POS.x, CAB_POS.y + yy * CAB.y, CAB_POS.z);
  car.add(ring);
}

// chrome belt-line trim following the body ellipse
{
  const h = 0.1;
  const s = Math.sqrt(1 - (h / BODY_R.y) ** 2) * 1.004;
  const pts: THREE.Vector3[] = [];
  const N = 128;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    pts.push(new THREE.Vector3(BODY_R.x * s * Math.cos(t), BODY_Y + h, BODY_R.z * s * Math.sin(t)));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true);
  car.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 256, 0.024, 12, true), chrome));
}

// headlights and tail lights
for (const sz of [-1, 1]) {
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), lampMat);
  lamp.scale.set(0.1, 0.09, 0.15);
  lamp.position.set(1.8, 0.98, sz * 0.42);
  lamp.rotation.y = -sz * 0.35;
  car.add(lamp);
  const lr = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.015, 12, 32), chrome);
  lr.position.set(1.82, 0.98, sz * 0.42);
  lr.rotation.y = Math.PI / 2 - sz * 0.35;
  lr.scale.set(1, 0.85, 1);
  car.add(lr);
  const tail = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff1010, emissiveIntensity: 1.2, roughness: 0.2 }),
  );
  tail.scale.set(0.08, 0.06, 0.16);
  tail.position.set(-1.82, 0.95, sz * 0.4);
  car.add(tail);
}

// front chrome bumper strip
{
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = -0.8 + (1.6 * i) / 24;
    const x = 2.1 * Math.sqrt(Math.max(0, 1 - (0.38 / 0.6) ** 2)) * Math.cos(a) * 1.003;
    const z = 1.0 * Math.sqrt(Math.max(0, 1 - (0.38 / 0.6) ** 2)) * Math.sin(a) * 1.003;
    pts.push(new THREE.Vector3(x, BODY_Y - 0.38, z));
  }
  car.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.02, 10, false), chrome));
}

// wheels
const WHEEL_R = 0.4;
for (const wx of [-1.25, 1.3]) {
  for (const wz of [-1, 1]) {
    const w = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.1, 24, 48), rubber);
    tire.scale.z = 1.5;
    w.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.2, 40), chrome);
    rim.rotation.x = Math.PI / 2;
    w.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.23, 24), darkMetal);
    hub.rotation.x = Math.PI / 2;
    w.add(hub);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), chrome);
    cap.position.z = wz * 0.12;
    w.add(cap);
    w.position.set(wx, WHEEL_R, wz * 0.82);
    car.add(w);
  }
}

// ---------- Turntable ----------
const turntable = new THREE.Group();
scene.add(turntable);

const PLAT_R = 3.3;
const rimMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(PLAT_R, PLAT_R, 0.22, 128, 1, true),
  new THREE.MeshStandardMaterial({ color: 0x1a1c22, metalness: 0.9, roughness: 0.25, side: THREE.DoubleSide }),
);
rimMesh.position.y = -0.11;
turntable.add(rimMesh);

const topMat = new THREE.MeshPhysicalMaterial({
  color: 0x07080b,
  metalness: 0.6,
  roughness: 0.12,
  transparent: true,
  opacity: 0.82,
  depthWrite: false,
});
const top = new THREE.Mesh(new THREE.CircleGeometry(PLAT_R, 128), topMat);
top.rotation.x = -Math.PI / 2;
top.renderOrder = 2;
turntable.add(top);

// ring light on the platform
const ringLight = new THREE.Mesh(
  new THREE.TorusGeometry(PLAT_R - 0.18, 0.03, 12, 160),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7fb4ff).multiplyScalar(1.6) }),
);
ringLight.rotation.x = Math.PI / 2;
ringLight.position.y = 0.01;
turntable.add(ringLight);

// tick marks so the rotation is readable
const tickMat = new THREE.MeshBasicMaterial({ color: 0x3a4660 });
for (let i = 0; i < 36; i++) {
  const a = (i / 36) * Math.PI * 2;
  const long = i % 3 === 0;
  const t = new THREE.Mesh(new THREE.BoxGeometry(long ? 0.3 : 0.14, 0.004, 0.025), tickMat);
  t.position.set(Math.cos(a) * (PLAT_R - 0.5), 0.006, Math.sin(a) * (PLAT_R - 0.5));
  t.rotation.y = -a;
  turntable.add(t);
}

turntable.add(car);

// faint mirror image seen through the glossy platform top
const mirror = car.clone(true);
mirror.scale.y = -1;
turntable.add(mirror);

// ---------- Loop ----------
window.__TASK_STATE__ = { turntableAngleDeg: 0, paintFinish: 'clearcoat' };
window.__EVAL_READY__ = false;

const SPEED_DEG = 20;
const startTime = performance.now();
let first = true;

function frame(): void {
  const t = (performance.now() - startTime) / 1000;
  const deg = t * SPEED_DEG;
  turntable.rotation.y = THREE.MathUtils.degToRad(deg);
  window.__TASK_STATE__.turntableAngleDeg = deg;
  window.__TASK_STATE__.paintFinish = 'clearcoat';
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
