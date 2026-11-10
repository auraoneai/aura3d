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

// ---------- background: dark showroom gradient ----------
{
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#05060a');
  grad.addColorStop(0.55, '#0d1018');
  grad.addColorStop(0.75, '#0a0c12');
  grad.addColorStop(1, '#030305');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const bg = new THREE.CanvasTexture(c);
  bg.colorSpace = THREE.SRGBColorSpace;
  scene.background = bg;
}

// ---------- studio environment (soft-box strips) ----------
function buildStudio(): THREE.Scene {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(60, 40, 60),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.012, 0.013, 0.018), side: THREE.BackSide }),
  );
  room.position.y = 8;
  env.add(room);

  // dim overhead diffuser for body-colour fill
  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(26, 0.2, 26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.22, 0.22, 0.25) }),
  );
  ceiling.position.set(0, 12, 0);
  env.add(ceiling);

  // floor glow
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(40, 0.2, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.03, 0.03, 0.035) }),
  );
  floor.position.y = -3;
  env.add(floor);

  const strip = (
    size: [number, number, number],
    pos: [number, number, number],
    rgb: [number, number, number],
  ) => {
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(...size),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(...rgb) }),
    );
    core.position.set(...pos);
    env.add(core);
    // dimmer halo makes the edges of the soft box fall off gradually
    const halo = new THREE.Mesh(
      new THREE.BoxGeometry(size[0] * 1.0 + (size[0] > size[2] ? 0 : 0.5), size[1] + 0.3, size[2] + (size[0] > size[2] ? 0.7 : 0)),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(rgb[0] * 0.18, rgb[1] * 0.18, rgb[2] * 0.18) }),
    );
    halo.position.set(pos[0], pos[1] - 0.05, pos[2]);
    env.add(halo);
  };

  // two long overhead strips
  strip([16, 0.3, 1.3], [0, 7, -2.5], [14, 13.5, 13]);
  strip([16, 0.3, 1.0], [0, 7, 3.5], [9, 9, 9]);
  // tall side strips
  strip([0.3, 9, 1.4], [-8, 3, 0], [9, 9, 9.5]);
  strip([0.3, 7, 1.0], [8, 3, 2.5], [6, 6, 6.5]);
  // faint cool rim strip behind
  strip([12, 0.3, 0.5], [0, 3, -10], [1.5, 3.0, 7.0]);

  return env;
}

const pmrem = new THREE.PMREMGenerator(renderer);
const envRT = pmrem.fromScene(buildStudio(), 0, 0.1, 100, { size: 512 });
scene.environment = envRT.texture;
scene.environmentIntensity = 1.0;
pmrem.dispose();

// ---------- procedural textures ----------
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

const FLAKE_SIZE = 256;
function makeFlakeTextures(): { normal: THREE.CanvasTexture; color: THREE.CanvasTexture } {
  const r = rand(1234);
  const nc = document.createElement('canvas');
  nc.width = nc.height = FLAKE_SIZE;
  const cc = document.createElement('canvas');
  cc.width = cc.height = FLAKE_SIZE;
  const nctx = nc.getContext('2d')!;
  const cctx = cc.getContext('2d')!;
  const nd = nctx.createImageData(FLAKE_SIZE, FLAKE_SIZE);
  const cd = cctx.createImageData(FLAKE_SIZE, FLAKE_SIZE);
  // flakes are 2x2 texel cells with a random facet orientation
  const cell = 2;
  const cells = FLAKE_SIZE / cell;
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const a = r() * Math.PI * 2;
      const tilt = Math.pow(r(), 0.6) * 0.9;
      let nx = Math.cos(a) * tilt;
      let ny = Math.sin(a) * tilt;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const bright = r() < 0.35 ? 0.6 + r() * 0.4 : 0.55 + r() * 0.1;
      for (let dy = 0; dy < cell; dy++) {
        for (let dx = 0; dx < cell; dx++) {
          const i = ((cy * cell + dy) * FLAKE_SIZE + cx * cell + dx) * 4;
          nd.data[i] = Math.round((nx * 0.5 + 0.5) * 255);
          nd.data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
          nd.data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
          nd.data[i + 3] = 255;
          const v = Math.round(bright * 255);
          cd.data[i] = v;
          cd.data[i + 1] = Math.round(v * 0.96);
          cd.data[i + 2] = Math.round(v * 0.92);
          cd.data[i + 3] = 255;
        }
      }
    }
  }
  nctx.putImageData(nd, 0, 0);
  cctx.putImageData(cd, 0, 0);
  const setup = (t: THREE.CanvasTexture) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 2);
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.NearestFilter;
    t.anisotropy = 1;
  };
  const normal = new THREE.CanvasTexture(nc);
  normal.colorSpace = THREE.NoColorSpace;
  setup(normal);
  const color = new THREE.CanvasTexture(cc);
  color.colorSpace = THREE.SRGBColorSpace;
  setup(color);
  return { normal, color };
}
const flake = makeFlakeTextures();

// ---------- materials ----------
const paint = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color(0xd0001a),
  map: flake.color,
  metalness: 0.45,
  roughness: 0.38,
  normalMap: flake.normal,
  normalScale: new THREE.Vector2(0.9, 0.9),
  clearcoat: 1.0,
  clearcoatRoughness: 0.03,
  envMapIntensity: 1.0,
});

const chrome = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, metalness: 1.0, roughness: 0.06 });
const glass = new THREE.MeshPhysicalMaterial({
  color: 0x020204,
  metalness: 0.0,
  roughness: 0.04,
  clearcoat: 1.0,
  clearcoatRoughness: 0.02,
  envMapIntensity: 1.2,
});
const rubber = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, metalness: 0.0, roughness: 0.75 });
const headlight = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.0) });
const taillight = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.05, 0.03) });

// ---------- the car ----------
const car = new THREE.Group();

const sphereGeo = (): THREE.SphereGeometry => {
  const g = new THREE.SphereGeometry(1, 128, 96);
  g.rotateZ(Math.PI / 2); // poles at nose/tail so the roof is not pinched
  return g;
};

const bodyCenterY = 0.82;
const bodyScale = new THREE.Vector3(2.1, 0.55, 0.95);
const body = new THREE.Mesh(sphereGeo(), paint);
body.scale.copy(bodyScale);
body.position.y = bodyCenterY;
car.add(body);

const glassMesh = new THREE.Mesh(sphereGeo(), glass);
glassMesh.scale.set(1.1, 0.5, 0.74);
glassMesh.position.set(-0.2, 1.2, 0);
car.add(glassMesh);

const roof = new THREE.Mesh(sphereGeo(), paint);
roof.scale.set(0.95, 0.42, 0.72);
roof.position.set(-0.2, 1.3, 0);
car.add(roof);

// chrome beltline trim around the body
{
  const belt = new THREE.Mesh(new THREE.TorusGeometry(1, 0.011, 12, 256), chrome);
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(bodyScale.x * 1.003, bodyScale.z * 1.003, 1);
  belt.position.y = bodyCenterY - 0.04;
  car.add(belt);
}

// chrome cross-section rings (front and rear bumper accents)
for (const x of [1.45, -1.55]) {
  const f = Math.sqrt(1 - (x / bodyScale.x) ** 2);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 12, 192), chrome);
  ring.rotation.y = Math.PI / 2;
  ring.scale.set(bodyScale.z * f * 1.004, bodyScale.y * f * 1.004, 1);
  ring.position.set(x, bodyCenterY, 0);
  car.add(ring);
}

// chrome window surround
{
  const surround = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 12, 256), chrome);
  surround.rotation.x = Math.PI / 2;
  surround.scale.set(1.0, 0.725, 1);
  surround.position.set(-0.2, 1.1, 0);
  car.add(surround);
}

// head and tail lights with chrome bezels
for (const side of [-1, 1]) {
  const hx = 1.86;
  const hy = bodyCenterY + 0.03;
  const hz = side * 0.42;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), headlight);
  lamp.position.set(hx + 0.02, hy, hz);
  lamp.scale.set(0.6, 1, 1);
  car.add(lamp);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.017, 12, 48), chrome);
  bezel.position.set(hx + 0.015, hy, hz);
  bezel.rotation.y = Math.PI / 2 - 0.35;
  car.add(bezel);

  const tx = -1.9;
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.09, 24, 16), taillight);
  tail.position.set(tx - 0.005, hy, hz * 0.95);
  tail.scale.set(0.5, 0.8, 1.3);
  car.add(tail);
}

// wheels
const wheelX = [1.18, -1.18];
const wheelZ = [0.86, -0.86];
for (const wx of wheelX) {
  for (const wz of wheelZ) {
    const w = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.12, 24, 48), rubber);
    w.add(tire);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.2, 40), chrome);
    hub.rotation.x = Math.PI / 2;
    w.add(hub);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.23, 24), rubber);
    cap.rotation.x = Math.PI / 2;
    w.add(cap);
    const sideFace = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 40), rubber);
    sideFace.rotation.x = Math.PI / 2;
    sideFace.scale.set(1, 1, 1);
    w.add(sideFace);
    // chrome hub disc sits slightly proud of the tyre face
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.26, 40), chrome);
    disc.rotation.x = Math.PI / 2;
    w.add(disc);
    w.position.set(wx, 0.44, wz);
    car.add(w);
  }
}

// ---------- turntable ----------
const turntable = new THREE.Group();
scene.add(turntable);
turntable.add(car);

// mirrored copy beneath the glossy floor
const mirror = car.clone();
mirror.scale.y = -1;
turntable.add(mirror);

const PLATFORM_R = 3.2;
const floorMat = new THREE.MeshPhysicalMaterial({
  color: 0x040405,
  metalness: 0.5,
  roughness: 0.14,
  transparent: true,
  opacity: 0.8,
  clearcoat: 1.0,
  clearcoatRoughness: 0.05,
  envMapIntensity: 0.8,
});
const platform = new THREE.Mesh(new THREE.CylinderGeometry(PLATFORM_R, PLATFORM_R, 0.1, 128), floorMat);
platform.position.y = -0.05;
platform.renderOrder = 1;
scene.add(platform);

// opaque skirt: hides the mirrored copy when seen from outside the platform
const skirt = new THREE.Mesh(
  new THREE.CylinderGeometry(PLATFORM_R, PLATFORM_R, 4, 128, 1, true),
  new THREE.MeshStandardMaterial({ color: 0x050506, metalness: 0.8, roughness: 0.4 }),
);
skirt.position.y = -0.1 - 2;
scene.add(skirt);

// ring lights on the platform
const ringMatOuter = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.5, 1.2) });
const ringOuter = new THREE.Mesh(new THREE.TorusGeometry(PLATFORM_R - 0.06, 0.03, 12, 192), ringMatOuter);
ringOuter.rotation.x = Math.PI / 2;
ringOuter.position.y = 0.005;
scene.add(ringOuter);

const ringInner = new THREE.Mesh(
  new THREE.TorusGeometry(2.6, 0.012, 8, 192),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.18, 0.4) }),
);
ringInner.rotation.x = Math.PI / 2;
ringInner.position.y = 0.003;
scene.add(ringInner);

// ---------- lights ----------
const key = new THREE.DirectionalLight(0xffffff, 0.8);
key.position.set(3, 7, 4);
scene.add(key);
const rim = new THREE.DirectionalLight(0x7aa8ff, 2.0);
rim.position.set(-5, 3, -6);
scene.add(rim);
const rim2 = new THREE.DirectionalLight(0x6a98ff, 1.0);
rim2.position.set(6, 2, -5);
scene.add(rim2);

// ---------- camera ----------
const camera = new THREE.PerspectiveCamera(32, 640 / 360, 0.1, 100);
camera.position.set(6.4, 1.55, 5.6);
camera.lookAt(0, 0.62, 0);

// ---------- loop ----------
window.__TASK_STATE__ = { turntableAngleDeg: 0, paintFinish: 'clearcoat' };

const DEG_PER_SEC = 20;
const t0 = performance.now();
let first = true;

function frame(now: number): void {
  const angle = Math.max(0, (now - t0) / 1000) * DEG_PER_SEC;
  turntable.rotation.y = THREE.MathUtils.degToRad(angle);
  window.__TASK_STATE__.turntableAngleDeg = angle;
  window.__TASK_STATE__.paintFinish = 'clearcoat';
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
