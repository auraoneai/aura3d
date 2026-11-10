import * as THREE from 'three';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const W = 640;
const H = 360;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9a9a9a);

const camera = new THREE.PerspectiveCamera(31, W / H, 0.1, 100);
camera.position.set(2.2, 3.2, 9.5);
camera.lookAt(0, 0.95, 0);

const maxAniso = renderer.capabilities.getMaxAnisotropy();

// ---------------------------------------------------------------- environment
const envScene = new THREE.Scene();
{
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(60, 40, 60),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.16, 0.16, 0.17), side: THREE.BackSide }),
  );
  room.position.y = 10;
  envScene.add(room);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.45, 0.45, 0.45) }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.2;
  envScene.add(floor);
}

function addSoftbox(w: number, h: number, intensity: number, tint: THREE.Color, pos: THREE.Vector3): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(tint.r * intensity, tint.g * intensity, tint.b * intensity),
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.copy(pos);
  m.lookAt(0, 0, 0);
  envScene.add(m);
  return m;
}

const keyBox = addSoftbox(6, 4.5, 9, new THREE.Color(1, 0.97, 0.93), new THREE.Vector3(0, 7, 5));
addSoftbox(4, 5, 2.2, new THREE.Color(0.85, 0.92, 1), new THREE.Vector3(-10, 3, 5));
addSoftbox(1.2, 7, 6, new THREE.Color(1, 1, 1), new THREE.Vector3(-5, 4, -10));
addSoftbox(1.2, 7, 6, new THREE.Color(1, 1, 1), new THREE.Vector3(6, 4, -9));
addSoftbox(8, 5, 2.5, new THREE.Color(1, 1, 1), new THREE.Vector3(0, 13, -2));

const pmrem = new THREE.PMREMGenerator(renderer);
let envTarget: THREE.WebGLRenderTarget | null = null;

function updateEnvironment(keyX: number): void {
  const dir = new THREE.Vector3(keyX, 7, 5).normalize().multiplyScalar(12);
  keyBox.position.copy(dir);
  keyBox.lookAt(0, 0, 0);
  const next = pmrem.fromScene(envScene, 0, 0.1, 100, { size: 128 });
  scene.environment = next.texture;
  if (envTarget) envTarget.dispose();
  envTarget = next;
}
scene.environmentIntensity = 0.55;

// ---------------------------------------------------------------- studio cove
{
  const R = 3;
  const zStart = -4;
  const profile: Array<{ z: number; y: number; nz: number; ny: number }> = [];
  profile.push({ z: 14, y: 0, nz: 0, ny: 1 });
  profile.push({ z: zStart, y: 0, nz: 0, ny: 1 });
  const steps = 24;
  for (let i = 1; i <= steps; i++) {
    const th = (i / steps) * (Math.PI / 2);
    const z = zStart - R * Math.sin(th);
    const y = R - R * Math.cos(th);
    profile.push({ z, y, nz: Math.sin(th), ny: Math.cos(th) });
  }
  profile.push({ z: zStart - R, y: 16, nz: 1, ny: 0 });

  const hw = 30;
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  profile.forEach((p) => {
    pos.push(-hw, p.y, p.z, hw, p.y, p.z);
    nor.push(0, p.ny, p.nz, 0, p.ny, p.nz);
  });
  for (let i = 0; i < profile.length - 1; i++) {
    const a = i * 2;
    const b = a + 1;
    const a2 = a + 2;
    const b2 = a + 3;
    idx.push(a, b, a2, b, b2, a2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  const cove = new THREE.Mesh(
    g,
    new THREE.MeshStandardMaterial({ color: 0xcfcfcf, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }),
  );
  cove.receiveShadow = true;
  scene.add(cove);
}

// ---------------------------------------------------------------- textures
function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  return [c, ctx];
}

// Deterministic random so output is stable.
let seed = 1234567;
function rnd(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

function brushedTexture(): THREE.CanvasTexture {
  const size = 512;
  const [c, ctx] = makeCanvas(size);
  ctx.fillStyle = 'rgb(200,200,200)';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 4000; i++) {
    const y = rnd() * size;
    const x = rnd() * size;
    const len = 40 + rnd() * 300;
    const v = Math.floor(120 + rnd() * 135);
    ctx.strokeStyle = `rgba(${v},${v},${v},${0.15 + rnd() * 0.35})`;
    ctx.lineWidth = 0.5 + rnd() * 1.0;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();
    if (x + len > size) {
      ctx.beginPath();
      ctx.moveTo(x - size, y);
      ctx.lineTo(x + len - size, y);
      ctx.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  return t;
}

function weaveTextures(): { color: THREE.CanvasTexture; height: THREE.CanvasTexture } {
  const size = 128;
  const cell = 8; // 16 x 16 cells per tile
  const [cc, cctx] = makeCanvas(size);
  const [hc, hctx] = makeCanvas(size);
  const cImg = cctx.createImageData(size, size);
  const hImg = hctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.floor(x / cell);
      const cy = Math.floor(y / cell);
      const warpOver = (cx + cy) % 2 === 0;
      const fx = ((x % cell) + 0.5) / cell;
      const fy = ((y % cell) + 0.5) / cell;
      // Thread cross-section: rounded across thread, slight dip at the crossings.
      const across = warpOver ? Math.sin(Math.PI * fx) : Math.sin(Math.PI * fy);
      const along = warpOver ? Math.sin(Math.PI * fy) : Math.sin(Math.PI * fx);
      let h = 0.25 + 0.55 * across * (0.55 + 0.45 * along) + (warpOver ? 0.12 : 0);
      const fibre = rnd();
      h = Math.min(1, Math.max(0, h + (fibre - 0.5) * 0.18));
      const i = (y * size + x) * 4;
      const shade = 0.35 + 0.65 * h;
      const tone = 0.85 + 0.3 * fibre;
      cImg.data[i] = Math.min(255, 120 * shade * tone);
      cImg.data[i + 1] = Math.min(255, 14 * shade * tone);
      cImg.data[i + 2] = Math.min(255, 28 * shade * tone);
      cImg.data[i + 3] = 255;
      const hv = Math.floor(h * 255);
      hImg.data[i] = hv;
      hImg.data[i + 1] = hv;
      hImg.data[i + 2] = hv;
      hImg.data[i + 3] = 255;
    }
  }
  cctx.putImageData(cImg, 0, 0);
  hctx.putImageData(hImg, 0, 0);
  const color = new THREE.CanvasTexture(cc);
  color.colorSpace = THREE.SRGBColorSpace;
  const height = new THREE.CanvasTexture(hc);
  for (const t of [color, height]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 2);
    t.anisotropy = maxAniso;
  }
  return { color, height };
}

function contactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const [c, ctx] = makeCanvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.75)');
  g.addColorStop(0.35, 'rgba(0,0,0,0.4)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

// ---------------------------------------------------------------- spheres
const sphereGeo = new THREE.SphereGeometry(1, 128, 64);

const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  metalness: 0,
  roughness: 0.02,
  transmission: 1,
  thickness: 1.8,
  ior: 1.5,
  attenuationColor: new THREE.Color(0xa8e6d8),
  attenuationDistance: 2.5,
  specularIntensity: 1,
  envMapIntensity: 1.6,
});

const brushed = brushedTexture();
const metalMat = new THREE.MeshPhysicalMaterial({
  color: 0xd4d7dc,
  metalness: 1,
  roughness: 0.42,
  roughnessMap: brushed,
  bumpMap: brushed,
  bumpScale: 0.4,
  anisotropy: 0.9,
  anisotropyRotation: 0,
  envMapIntensity: 1.3,
});

const weave = weaveTextures();
const fabricMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  map: weave.color,
  bumpMap: weave.height,
  bumpScale: 1.0,
  roughness: 1,
  metalness: 0,
  specularIntensity: 0,
  sheen: 1,
  sheenColor: new THREE.Color(0xff5a6e),
  sheenRoughness: 0.35,
  envMapIntensity: 0.6,
});

const xs = [-2.5, 0, 2.5];
const mats = [glassMat, metalMat, fabricMat];
const shadowTex = contactShadowTexture();
const shadowMat = new THREE.MeshBasicMaterial({
  map: shadowTex,
  transparent: true,
  depthWrite: false,
  opacity: 0.8,
});

const sphereMeshes: THREE.Mesh[] = [];

mats.forEach((m, i) => {
  const s = new THREE.Mesh(sphereGeo, m);
  s.position.set(xs[i], 1, 0);
  s.castShadow = true;
  scene.add(s);
  sphereMeshes.push(s);

  const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), shadowMat);
  blob.rotation.x = -Math.PI / 2;
  blob.position.set(xs[i], 0.01, 0);
  blob.renderOrder = 1;
  scene.add(blob);
});

// ---------------------------------------------------------------- lights
const key = new THREE.SpotLight(0xfff3e6, 330, 0, 0.62, 1, 2);
key.position.set(0, 7, 5);
key.target.position.set(0, 0.8, 0);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.near = 3;
key.shadow.camera.far = 20;
key.shadow.radius = 7;
key.shadow.blurSamples = 16;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
scene.add(key, key.target);

const fill = new THREE.SpotLight(0xdbe7ff, 90, 0, 0.8, 1, 2);
fill.position.set(-8, 3.5, 5);
fill.target.position.set(0, 0.8, 0);
scene.add(fill, fill.target);

const rim = new THREE.SpotLight(0xffffff, 380, 0, 0.7, 0.6, 2);
rim.position.set(-1.5, 5, -5);
rim.target.position.set(0, 1, 0);
scene.add(rim, rim.target);

const rim2 = new THREE.SpotLight(0xffeedd, 220, 0, 0.7, 0.6, 2);
rim2.position.set(4.5, 4.5, -5);
rim2.target.position.set(1.5, 1, 0);
scene.add(rim2, rim2.target);

// ---------------------------------------------------------------- state / loop
type SphereName = 'glass' | 'metal' | 'fabric';
interface TaskState {
  spheres: Array<{ name: string }>;
  keyLightX: number;
  selected: SphereName | null;
}
const state: TaskState = {
  spheres: [{ name: 'glass' }, { name: 'metal' }, { name: 'fabric' }],
  keyLightX: 0,
  selected: null,
};
const sphereNames: SphereName[] = ['glass', 'metal', 'fabric'];
window.addEventListener('keydown', (e: KeyboardEvent) => {
  const i = ['1', '2', '3'].indexOf(e.key);
  if (i >= 0) state.selected = sphereNames[i];
});
const SPIN_SPEED = 0.8; // rad/s
let lastT = 0;
(window as unknown as { __TASK_STATE__: TaskState }).__TASK_STATE__ = state;

let frame = 0;
let ready = false;
const t0 = performance.now();

function keyXAt(t: number): number {
  return 1.0 + 3.2 * Math.sin(t * 0.5);
}

updateEnvironment(keyXAt(0));

function animate(): void {
  const t = (performance.now() - t0) / 1000;
  const dt = Math.min(0.1, t - lastT);
  lastT = t;
  if (state.selected) {
    sphereMeshes[sphereNames.indexOf(state.selected)].rotation.y += SPIN_SPEED * dt;
  }
  const kx = keyXAt(t);
  key.position.x = kx;
  state.keyLightX = kx;

  if (frame % 3 === 0) updateEnvironment(kx);

  renderer.render(scene, camera);
  frame++;
  if (!ready) {
    ready = true;
    (window as unknown as { __EVAL_READY__: boolean }).__EVAL_READY__ = true;
  }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
