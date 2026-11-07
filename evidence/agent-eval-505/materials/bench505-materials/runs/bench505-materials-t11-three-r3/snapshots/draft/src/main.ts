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

// ---------- Background (dark showroom gradient) ----------
{
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#05060a');
  grad.addColorStop(0.55, '#0d0f16');
  grad.addColorStop(1, '#040406');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
}

// ---------- Studio environment (soft-box strips) ----------
function buildEnvironment(): THREE.Texture {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(40, 20, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.03, 0.033, 0.04), side: THREE.BackSide }),
  );
  room.position.y = 6;
  env.add(room);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.06, 0.06, 0.07) }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.5;
  env.add(floor);

  const strip = (w: number, h: number, d: number, x: number, y: number, z: number, r: number, g: number, b: number) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(r, g, b) }),
    );
    m.position.set(x, y, z);
    env.add(m);
  };
  // two long overhead strips
  strip(14, 0.1, 0.9, 0, 5, -1.6, 14, 13.5, 13);
  strip(14, 0.1, 0.7, 0, 5, 2.2, 10, 9.8, 9.5);
  // long side strips
  strip(12, 0.9, 0.1, -3, 1.8, 5.5, 9, 9, 9.2);
  strip(12, 0.7, 0.1, 1, 2.4, -5.5, 7, 7, 7.4);
  // faint cool rim strip behind/left
  strip(0.1, 4.5, 0.5, -6, 2, -3, 1.2, 2.4, 5);
  // cool low fill on the right
  strip(0.1, 0.4, 8, 6.5, 0.8, 0, 0.8, 1.4, 3);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.03, 0.1, 100);
  pmrem.dispose();
  env.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  });
  return rt.texture;
}
scene.environment = buildEnvironment();

// ---------- Materials ----------
function makeFlakeNormalMap(): THREE.DataTexture {
  const size = 512;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    let x = (Math.random() + Math.random() + Math.random() - 1.5) * 1.3;
    let y = (Math.random() + Math.random() + Math.random() - 1.5) * 1.3;
    const z = 1;
    const l = Math.hypot(x, y, z);
    x /= l;
    y /= l;
    data[i * 4] = Math.round((x * 0.5 + 0.5) * 255);
    data[i * 4 + 1] = Math.round((y * 0.5 + 0.5) * 255);
    data[i * 4 + 2] = Math.round(((z / l) * 0.5 + 0.5) * 255);
    data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 3);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

const paint = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color(0.55, 0.005, 0.02),
  metalness: 0.55,
  roughness: 0.38,
  normalMap: makeFlakeNormalMap(),
  normalScale: new THREE.Vector2(0.7, 0.7),
  clearcoat: 1,
  clearcoatRoughness: 0.02,
  envMapIntensity: 1.1,
});

const glass = new THREE.MeshPhysicalMaterial({
  color: 0x020204,
  metalness: 0,
  roughness: 0.06,
  clearcoat: 1,
  clearcoatRoughness: 0.02,
  envMapIntensity: 1.6,
});

const chrome = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  metalness: 1,
  roughness: 0.06,
  envMapIntensity: 1.3,
});

const rubber = new THREE.MeshStandardMaterial({ color: 0x0a0a0b, metalness: 0, roughness: 0.75 });
const darkRim = new THREE.MeshStandardMaterial({ color: 0x151518, metalness: 0.6, roughness: 0.4 });

// ---------- Car ----------
function buildCar(): THREE.Group {
  const car = new THREE.Group();

  // streamlined body: capsule along X
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 2.4, 24, 64), paint);
  body.rotation.z = Math.PI / 2;
  // Capsule runs along local Y; rotated about Z it lies along world X.
  // Local X becomes world height, local Z stays world width.
  body.scale.set(0.8, 1, 1.4);
  body.position.y = 0.55;
  car.add(body);

  // cabin: glass ellipsoid with painted roof cap
  const cabin = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), glass);
  cabin.scale.set(0.85, 0.42, 0.55);
  cabin.position.set(-0.1, 0.85, 0);
  car.add(cabin);

  const roof = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 24, 0, Math.PI * 2, 0, 0.62), paint);
  roof.scale.set(0.865, 0.435, 0.565);
  roof.position.copy(cabin.position);
  car.add(roof);

  // chrome belt ring around the cabin base
  const belt = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 16, 96), chrome);
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(0.84, 0.545, 1);
  belt.position.set(-0.1, 0.9, 0);
  car.add(belt);

  // chrome bumper bands near nose and tail
  for (const sx of [-1, 1]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.022, 16, 64), chrome);
    band.rotation.y = Math.PI / 2;
    // torus lies in local XY; after rotation.y local X -> world Z (width), Y stays height
    band.scale.set(1.4 * 0.885, 0.8 * 0.885, 1);
    band.position.set(sx * 1.45, 0.55, 0);
    car.add(band);
  }

  // chrome side strips (belt line) following the flank
  for (const sz of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const x = -1.55 + 3.1 * t;
      // body half-width at height y=0.5 (slightly below centre)
      const ex = Math.min(1, Math.abs(x) <= 1.2 ? 0 : (Math.abs(x) - 1.2) / 0.5);
      const hw = 0.686;
      const capScale = Math.sqrt(Math.max(0.02, 1 - ex * ex));
      pts.push(new THREE.Vector3(x, 0.47, sz * (hw * capScale + 0.008)));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.012, 8, false), chrome);
    car.add(tube);
  }

  // wheels
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const w = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.08, 20, 48), rubber);
      tire.scale.z = 1.6;
      w.add(tire);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.2, 40), darkRim);
      disc.rotation.x = Math.PI / 2;
      w.add(disc);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.25, 40), chrome);
      hub.rotation.x = Math.PI / 2;
      w.add(hub);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 12), chrome);
      cap.position.z = 0.125;
      cap.scale.z = 0.5;
      const cap2 = cap.clone();
      cap2.position.z = -0.125;
      w.add(cap, cap2);
      w.position.set(sx * 1.0, 0.325, sz * 0.68);
      car.add(w);
    }
  }
  return car;
}

// ---------- Turntable ----------
function makePlatformTexture(): THREE.CanvasTexture {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#0b0c10';
  g.fillRect(0, 0, s, s);
  g.translate(s / 2, s / 2);
  g.strokeStyle = '#2a2d38';
  for (const r of [0.97, 0.8, 0.45]) {
    g.lineWidth = r > 0.9 ? 6 : 2;
    g.beginPath();
    g.arc(0, 0, r * s * 0.5, 0, Math.PI * 2);
    g.stroke();
  }
  g.strokeStyle = '#3a3e4c';
  g.lineWidth = 3;
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const r0 = 0.84 * s * 0.5;
    const r1 = (i % 6 === 0 ? 0.94 : 0.89) * s * 0.5;
    g.beginPath();
    g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function makeShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.85)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const turntable = new THREE.Group(); // rotates
scene.add(turntable);

const PLATFORM_R = 2.35;

const mirrorGroup = new THREE.Group();
mirrorGroup.scale.y = -1;
mirrorGroup.add(buildCar());
turntable.add(mirrorGroup);

const car = buildCar();
turntable.add(car);

const top = new THREE.Mesh(
  new THREE.CircleGeometry(PLATFORM_R, 96),
  new THREE.MeshPhysicalMaterial({
    map: makePlatformTexture(),
    color: 0xffffff,
    metalness: 0.35,
    roughness: 0.16,
    transparent: true,
    opacity: 0.82,
    envMapIntensity: 0.9,
  }),
);
top.rotation.x = -Math.PI / 2;
top.renderOrder = 0;
turntable.add(top);

const wall = new THREE.Mesh(
  new THREE.CylinderGeometry(PLATFORM_R + 0.04, PLATFORM_R + 0.04, 0.35, 96, 1, true),
  new THREE.MeshStandardMaterial({ color: 0x14151a, metalness: 0.8, roughness: 0.3 }),
);
wall.position.y = -0.175;
turntable.add(wall);

const edgeLight = new THREE.Mesh(
  new THREE.TorusGeometry(PLATFORM_R - 0.08, 0.03, 12, 160),
  new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.9, 1.6, 3.2) }),
);
edgeLight.rotation.x = Math.PI / 2;
edgeLight.position.y = 0.012;
turntable.add(edgeLight);

const glow = new THREE.Mesh(
  new THREE.RingGeometry(PLATFORM_R - 0.45, PLATFORM_R - 0.05, 128, 1),
  new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(0.05, 0.12, 0.3),
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
glow.rotation.x = -Math.PI / 2;
glow.position.y = 0.006;
glow.renderOrder = 2;
turntable.add(glow);

const shadow = new THREE.Mesh(
  new THREE.PlaneGeometry(4.4, 2.3),
  new THREE.MeshBasicMaterial({ map: makeShadowTexture(), transparent: true, depthWrite: false, opacity: 0.9 }),
);
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = 0.004;
shadow.renderOrder = 1;
turntable.add(shadow);

// ---------- Lights (supplement the environment) ----------
const key = new THREE.DirectionalLight(0xfff2e6, 1.2);
key.position.set(-3, 6, 4);
scene.add(key);
const rim = new THREE.DirectionalLight(0x6f9bff, 1.4);
rim.position.set(-4, 3, -6);
scene.add(rim);
scene.add(new THREE.HemisphereLight(0x223048, 0x050507, 0.25));

// ---------- Camera ----------
const camera = new THREE.PerspectiveCamera(30, 640 / 360, 0.1, 100);
camera.position.set(6.0, 1.7, 7.4);
camera.lookAt(0, 0.45, 0);

// ---------- Loop ----------
const DEG_PER_SEC = 20;
const state = { turntableAngleDeg: 0, paintFinish: 'clearcoat' };
window.__TASK_STATE__ = state;

const t0 = performance.now();
let first = true;
function frame(now: number) {
  const angle = ((now - t0) / 1000) * DEG_PER_SEC;
  state.turntableAngleDeg = angle;
  turntable.rotation.y = THREE.MathUtils.degToRad(angle);
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
