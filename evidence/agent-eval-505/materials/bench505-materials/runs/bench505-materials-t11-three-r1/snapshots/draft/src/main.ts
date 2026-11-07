import * as THREE from 'three';

declare global {
  interface Window {
    __TASK_STATE__: { turntableAngleDeg: number; paintFinish: string };
    __EVAL_READY__?: boolean;
  }
}

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();

// ---------- background gradient ----------
{
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#0a0c11');
  grad.addColorStop(0.55, '#07080b');
  grad.addColorStop(1, '#020203');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  scene.background = t;
}

// ---------- studio environment (soft-box strips) ----------
function softTexture(): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = Math.abs((x + 0.5) / size - 0.5) * 2;
      const v = Math.abs((y + 0.5) / size - 0.5) * 2;
      const f = (d: number) => {
        const s = Math.min(1, Math.max(0, (1 - d) / 0.25));
        return s * s * (3 - 2 * s);
      };
      const a = Math.round(255 * f(u) * f(v));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = a;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

function buildEnvironment(): THREE.WebGLRenderTarget {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(40, 24, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.012, 0.013, 0.017), side: THREE.BackSide }),
  );
  room.position.y = 6;
  env.add(room);

  const soft = softTexture();
  const addStrip = (
    w: number,
    h: number,
    pos: [number, number, number],
    rgb: [number, number, number],
  ) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        map: soft,
        color: new THREE.Color(rgb[0], rgb[1], rgb[2]),
        side: THREE.DoubleSide,
      }),
    );
    m.position.set(...pos);
    m.lookAt(0, 0.6, 0);
    env.add(m);
  };

  // overhead long strips
  addStrip(16, 1.8, [0, 10, -2.5], [11, 11, 11.5]);
  addStrip(16, 1.4, [0, 10, 3.5], [8, 8, 8]);
  // long side strips (left / right), vertical and horizontal
  addStrip(1.6, 11, [-12, 5, 0], [9, 9, 9.5]);
  addStrip(1.2, 11, [12, 5, -1], [7, 7, 7.2]);
  addStrip(14, 0.7, [-11.5, 2.2, 0], [4, 4, 4.2]);
  addStrip(14, 0.7, [11.5, 2.2, 0], [3.2, 3.2, 3.4]);
  // faint cool rim strips behind the object
  addStrip(14, 1.2, [0, 4, -14], [0.9, 1.5, 3.2]);
  // dim fill behind the camera so front panels are not black
  addStrip(14, 3, [3, 4, 15], [0.35, 0.36, 0.4]);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.012, 0.1, 100, { size: 512 });
  pmrem.dispose();
  return rt;
}
scene.environment = buildEnvironment().texture;
scene.environmentIntensity = 1.0;

// ---------- paint flake textures ----------
function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function flakeTextures(): { normal: THREE.CanvasTexture; color: THREE.CanvasTexture } {
  const size = 256;
  const r = rand(1234);
  const nc = document.createElement('canvas');
  const cc = document.createElement('canvas');
  nc.width = nc.height = cc.width = cc.height = size;
  const ng = nc.getContext('2d')!;
  const cg = cc.getContext('2d')!;
  const nimg = ng.createImageData(size, size);
  const cimg = cg.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    let nx = 0;
    let ny = 0;
    let bright = 1;
    if (r() < 0.55) {
      const ang = r() * Math.PI * 2;
      const tilt = 0.25 + r() * 0.65;
      nx = Math.cos(ang) * tilt;
      ny = Math.sin(ang) * tilt;
      bright = 1 + r() * 0.6;
    } else {
      nx = (r() - 0.5) * 0.06;
      ny = (r() - 0.5) * 0.06;
    }
    const len = Math.hypot(nx, ny, 1);
    nimg.data[i * 4] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
    nimg.data[i * 4 + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
    nimg.data[i * 4 + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
    nimg.data[i * 4 + 3] = 255;
    const v = Math.min(255, 215 * bright);
    cimg.data[i * 4] = Math.min(255, v + 25);
    cimg.data[i * 4 + 1] = Math.min(255, v * (bright > 1.2 ? 0.95 : 0.88));
    cimg.data[i * 4 + 2] = Math.min(255, v * (bright > 1.2 ? 0.9 : 0.86));
    cimg.data[i * 4 + 3] = 255;
  }
  ng.putImageData(nimg, 0, 0);
  cg.putImageData(cimg, 0, 0);
  const normal = new THREE.CanvasTexture(nc);
  const color = new THREE.CanvasTexture(cc);
  color.colorSpace = THREE.SRGBColorSpace;
  for (const t of [normal, color]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 2);
    t.anisotropy = 4;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
  }
  return { normal, color };
}

const flakes = flakeTextures();

// ---------- materials ----------
const paint = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color(0x9c0612),
  map: flakes.color,
  metalness: 0.62,
  roughness: 0.36,
  normalMap: flakes.normal,
  normalScale: new THREE.Vector2(0.9, 0.9),
  clearcoat: 1.0,
  clearcoatRoughness: 0.025,
  envMapIntensity: 1.0,
});

const glass = new THREE.MeshPhysicalMaterial({
  color: 0x020204,
  metalness: 0.0,
  roughness: 0.05,
  clearcoat: 1.0,
  clearcoatRoughness: 0.02,
  envMapIntensity: 1.3,
});

const chrome = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  metalness: 1.0,
  roughness: 0.06,
  envMapIntensity: 1.4,
});

const rubber = new THREE.MeshStandardMaterial({
  color: 0x0b0b0c,
  metalness: 0.0,
  roughness: 0.85,
  envMapIntensity: 0.5,
});

const hubDark = new THREE.MeshStandardMaterial({ color: 0x111114, metalness: 0.6, roughness: 0.4 });

const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.0) });
const tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 0.08, 0.05) });

// ---------- object ----------
const BODY_Y = 0.66;
const BODY = { sx: 2.1, sy: 0.5, sz: 0.95 };

function ellipsoid(
  mat: THREE.Material,
  sx: number,
  sy: number,
  sz: number,
  pos: [number, number, number],
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 72), mat);
  m.scale.set(sx, sy, sz);
  m.position.set(...pos);
  return m;
}

function ellipseTube(
  cx: number,
  cy: number,
  a: number,
  b: number,
  radius: number,
  mat: THREE.Material,
): THREE.Mesh {
  const pts: THREE.Vector3[] = [];
  const n = 160;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push(new THREE.Vector3(cx + a * Math.cos(t), cy, b * Math.sin(t)));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 240, radius, 10, true), mat);
}

function buildCar(): THREE.Group {
  const car = new THREE.Group();

  // body
  car.add(ellipsoid(paint, BODY.sx, BODY.sy, BODY.sz, [0, BODY_Y, 0]));

  // cabin: dark glass with painted roof cap
  const cab = { x: -0.15, y: 1.0, sx: 0.95, sy: 0.36, sz: 0.68 };
  car.add(ellipsoid(glass, cab.sx, cab.sy, cab.sz, [cab.x, cab.y, 0]));
  const capTheta = 0.75;
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(1, 96, 32, 0, Math.PI * 2, 0, capTheta),
    paint,
  );
  cap.scale.set(cab.sx * 1.012, cab.sy * 1.012, cab.sz * 1.012);
  cap.position.set(cab.x, cab.y, 0);
  car.add(cap);
  // chrome trim ring where roof meets glass
  const sr = Math.sin(capTheta) * 1.012;
  car.add(
    ellipseTube(
      cab.x,
      cab.y + cab.sy * 1.012 * Math.cos(capTheta),
      cab.sx * sr,
      cab.sz * sr,
      0.013,
      chrome,
    ),
  );

  // chrome waist strip hugging the body
  const hy = 0.13;
  const s = Math.sqrt(1 - (hy / BODY.sy) ** 2) * 1.008;
  car.add(ellipseTube(0, BODY_Y + hy, BODY.sx * s, BODY.sz * s, 0.017, chrome));

  // wheels
  const wr = 0.34;
  const wheelGeo = new THREE.CylinderGeometry(wr, wr, 0.26, 56);
  const rimGeo = new THREE.CylinderGeometry(wr * 0.66, wr * 0.66, 0.02, 40);
  const capGeo = new THREE.CylinderGeometry(wr * 0.2, wr * 0.2, 0.03, 24);
  for (const wx of [-1.12, 1.15]) {
    for (const side of [-1, 1]) {
      const w = new THREE.Group();
      w.position.set(wx, wr, side * 0.8);
      w.rotation.x = Math.PI / 2;
      w.add(new THREE.Mesh(wheelGeo, rubber));
      const rim = new THREE.Mesh(rimGeo, chrome);
      rim.position.y = 0.135;
      w.add(rim);
      const hub = new THREE.Mesh(capGeo, hubDark);
      hub.position.y = 0.15;
      w.add(hub);
      if (side < 0) w.rotation.x = -Math.PI / 2;
      car.add(w);
    }
  }

  // lights
  for (const side of [-1, 1]) {
    const hl = ellipsoid(headMat, 0.07, 0.07, 0.13, [1.93, 0.64, side * 0.4]);
    hl.rotation.y = side * 0.4;
    car.add(hl);
    const tl = ellipsoid(tailMat, 0.06, 0.06, 0.15, [-1.93, 0.66, side * 0.4]);
    tl.rotation.y = -side * 0.4;
    car.add(tl);
  }

  return car;
}

const turntable = new THREE.Group();
scene.add(turntable);

const car = buildCar();
turntable.add(car);
// faint mirror image seen through the glossy platform top
const mirror = car.clone();
mirror.scale.y = -1;
turntable.add(mirror);

// ---------- platform ----------
const PLATFORM_R = 3.1;
const topMat = new THREE.MeshStandardMaterial({
  color: 0x07080b,
  metalness: 0.85,
  roughness: 0.16,
  transparent: true,
  opacity: 0.78,
});
const top = new THREE.Mesh(new THREE.CircleGeometry(PLATFORM_R, 128), topMat);
top.rotation.x = -Math.PI / 2;
top.renderOrder = 2;
turntable.add(top);

const rimMat = new THREE.MeshStandardMaterial({ color: 0x15171c, metalness: 0.9, roughness: 0.25 });
const skirt = new THREE.Mesh(
  new THREE.CylinderGeometry(PLATFORM_R, PLATFORM_R, 0.18, 128, 1, true),
  rimMat,
);
skirt.position.y = -0.09;
turntable.add(skirt);

const edge = new THREE.Mesh(new THREE.TorusGeometry(PLATFORM_R, 0.025, 12, 160), chrome);
edge.rotation.x = Math.PI / 2;
turntable.add(edge);

const ringLight = new THREE.Mesh(
  new THREE.TorusGeometry(PLATFORM_R - 0.18, 0.018, 8, 200),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.0, 1.8) }),
);
ringLight.rotation.x = Math.PI / 2;
ringLight.position.y = 0.012;
turntable.add(ringLight);

// tick marks so the rotation is visible on the symmetric platform
const tickGeo = new THREE.BoxGeometry(0.05, 0.004, 0.22);
const tickMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.4, 0.7) });
for (let i = 0; i < 36; i++) {
  const a = (i / 36) * Math.PI * 2;
  const t = new THREE.Mesh(tickGeo, tickMat);
  const r = PLATFORM_R - 0.45;
  t.position.set(Math.cos(a) * r, 0.008, Math.sin(a) * r);
  t.rotation.y = -a + Math.PI / 2;
  turntable.add(t);
}

// ---------- lights (specular glints + cool rim) ----------
const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(-3, 8, 4);
scene.add(key);
const rim = new THREE.DirectionalLight(0x6c9dff, 2.2);
rim.position.set(-4, 3, -7);
scene.add(rim);
const rim2 = new THREE.DirectionalLight(0x5b86ff, 1.2);
rim2.position.set(6, 2.5, -6);
scene.add(rim2);

// ---------- camera ----------
const camera = new THREE.PerspectiveCamera(30, 640 / 360, 0.1, 100);
camera.position.set(5.6, 1.5, 7.0);
camera.lookAt(0, 0.35, 0);

// ---------- animate ----------
const SPEED_DEG_PER_SEC = 20;
const START_DEG = 0;
let angleDeg = START_DEG;
let last = performance.now();
window.__TASK_STATE__ = { turntableAngleDeg: angleDeg, paintFinish: 'clearcoat' };

function frame(now: number) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  angleDeg += SPEED_DEG_PER_SEC * dt;
  turntable.rotation.y = THREE.MathUtils.degToRad(angleDeg);
  window.__TASK_STATE__.turntableAngleDeg = angleDeg;
  window.__TASK_STATE__.paintFinish = 'clearcoat';
  renderer.render(scene, camera);
  if (!window.__EVAL_READY__) window.__EVAL_READY__ = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
