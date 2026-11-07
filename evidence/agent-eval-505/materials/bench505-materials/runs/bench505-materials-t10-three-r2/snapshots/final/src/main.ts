import * as THREE from 'three';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const W = 640;
const H = 360;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbdbdc0);

const camera = new THREE.PerspectiveCamera(36, W / H, 0.1, 100);
camera.position.set(2.0, 2.7, 8.6);
camera.lookAt(0, 1.0, 0);

const SPHERE_Y = 1;
const SPHERE_X = [-2.6, 0, 2.6];

/* ---------- procedural textures ---------- */

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  return [c, ctx];
}

// Floor texture with baked soft contact shadows (world x -8..8, z -6..6).
const FLOOR_X0 = -8;
const FLOOR_XS = 16;
const FLOOR_Z0 = -6;
const FLOOR_ZS = 12;
function makeFloorTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 768;
  const [c, ctx] = makeCanvas(w, h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  const sx = w / FLOOR_XS;
  const sz = h / FLOOR_ZS;
  const strengths = [0.55, 0.85, 0.85];
  SPHERE_X.forEach((x, i) => {
    const px = (x - FLOOR_X0) * sx;
    const py = (0 - FLOOR_Z0) * sz;
    const k = strengths[i];
    // wide ambient occlusion
    let g = ctx.createRadialGradient(px, py, 0, px, py, 3.0 * sz);
    g.addColorStop(0, `rgba(0,0,0,${0.35 * k})`);
    g.addColorStop(0.5, `rgba(0,0,0,${0.14 * k})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px - 3.1 * sz, py - 3.1 * sz, 6.2 * sz, 6.2 * sz);
    // tight contact shadow
    g = ctx.createRadialGradient(px, py, 0, px, py, 1.35 * sz);
    g.addColorStop(0, `rgba(0,0,0,${0.85 * k})`);
    g.addColorStop(0.55, `rgba(0,0,0,${0.5 * k})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px - 1.4 * sz, py - 1.4 * sz, 2.8 * sz, 2.8 * sz);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  return t;
}

// Woven cloth: plain weave of warp and weft threads with fibre noise.
function makeWeaveTexture(): THREE.CanvasTexture {
  const size = 256;
  const threads = 8;
  const cell = size / threads;
  const [c, ctx] = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = Math.floor(x / cell);
      const j = Math.floor(y / cell);
      const fx = (x % cell) / cell;
      const fy = (y % cell) / cell;
      const warpOver = (i + j) % 2 === 0;
      // thread cross-section profile: bright at middle, dark at edges
      const prof = warpOver ? Math.sin(Math.PI * fx) : Math.sin(Math.PI * fy);
      // thread ends dip under the crossing thread
      const along = warpOver ? fy : fx;
      const dip = 0.75 + 0.25 * Math.sin(Math.PI * along);
      let v = 0.35 + 0.65 * Math.pow(prof, 0.7) * dip;
      v *= 0.85 + 0.15 * Math.random();
      const p = (y * size + x) * 4;
      const b = Math.max(0, Math.min(255, Math.round(v * 255)));
      img.data[p] = b;
      img.data[p + 1] = b;
      img.data[p + 2] = b;
      img.data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// Brushed metal: long horizontal streaks (u direction), varying per row.
function makeBrushedTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 1024;
  const [c, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const rowBias = (Math.random() - 0.5) * 0.5;
    let v = 0.5;
    for (let x = 0; x < w; x++) {
      v = v * 0.93 + (0.5 + rowBias + (Math.random() - 0.5) * 0.5) * 0.07;
      const b = Math.max(0, Math.min(255, Math.round(v * 255)));
      const p = (y * w + x) * 4;
      img.data[p] = b;
      img.data[p + 1] = b;
      img.data[p + 2] = b;
      img.data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/* ---------- studio environment (reflection source) ---------- */

const envScene = new THREE.Scene();
const hdr = (v: number): THREE.Color => new THREE.Color().setRGB(v, v, v);

function addPanel(w: number, h: number, intensity: number, pos: THREE.Vector3): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ color: hdr(intensity), side: THREE.DoubleSide })
  );
  m.position.copy(pos);
  m.lookAt(0, 0, 0);
  envScene.add(m);
  return m;
}

{
  // room: mid-dark walls, light floor, soft ceiling
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(60, 40, 60),
    new THREE.MeshBasicMaterial({ color: hdr(0.12), side: THREE.BackSide })
  );
  room.position.y = 12;
  envScene.add(room);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshBasicMaterial({ color: hdr(0.5), side: THREE.DoubleSide })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1;
  envScene.add(floor);
  // backdrop wall, lit grey
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 30),
    new THREE.MeshBasicMaterial({ color: hdr(0.45), side: THREE.DoubleSide })
  );
  back.position.set(0, 8, -14);
  envScene.add(back);
  // dim ceiling strip
  addPanel(14, 4, 1.2, new THREE.Vector3(0, 12, 0));
}
const keyBox = addPanel(5, 4, 12, new THREE.Vector3(-2, 6, 6));
addPanel(3, 5, 3.5, new THREE.Vector3(9, 3, 4)); // fill box (right)
addPanel(10, 1.4, 14, new THREE.Vector3(0, 6, -7)); // rim strip behind
addPanel(1.2, 7, 5, new THREE.Vector3(-9, 3, -3)); // tall strip, left rear

const pmrem = new THREE.PMREMGenerator(renderer);
let envTarget: THREE.WebGLRenderTarget | null = null;

/* ---------- floor / cove ---------- */

function buildCove(): THREE.Mesh {
  const prof: Array<[number, number]> = [];
  const zFront = 16;
  const zCurve = -6;
  const R = 5;
  for (let i = 0; i <= 8; i++) prof.push([zFront + (zCurve - zFront) * (i / 8), 0]);
  const arcN = 24;
  for (let i = 1; i <= arcN; i++) {
    const th = (i / arcN) * (Math.PI / 2);
    prof.push([zCurve - R * Math.sin(th), R - R * Math.cos(th)]);
  }
  prof.push([zCurve - R, R + 6]);
  prof.push([zCurve - R, R + 16]);

  const half = 40;
  const pos: number[] = [];
  const uv: number[] = [];
  for (const [z, y] of prof) {
    for (const x of [-half, half]) {
      pos.push(x, y, z);
      uv.push((x - FLOOR_X0) / FLOOR_XS, 1 - (z - FLOOR_Z0) / FLOOR_ZS);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < prof.length - 1; i++) {
    const a = i * 2;
    const b = a + 1;
    const a2 = a + 2;
    const b2 = a + 3;
    idx.push(a, b, a2, b, b2, a2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xd2d2d4,
    roughness: 0.88,
    metalness: 0,
    map: makeFloorTexture(),
    envMapIntensity: 0.55,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  return mesh;
}
const cove = buildCove();
scene.add(cove);

/* ---------- spheres ---------- */

const sphereGeo = new THREE.SphereGeometry(1, 128, 96);

const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  metalness: 0,
  roughness: 0.02,
  transmission: 1,
  thickness: 1.8,
  ior: 1.5,
  specularIntensity: 1,
  attenuationColor: new THREE.Color(0xa8e6d8),
  attenuationDistance: 2.5,
  envMapIntensity: 1.6,
});
const glass = new THREE.Mesh(sphereGeo, glassMat);
glass.position.set(SPHERE_X[0], SPHERE_Y, 0);
scene.add(glass);

const brushed = makeBrushedTexture();
const metalMat = new THREE.MeshPhysicalMaterial({
  color: 0xdadde2,
  metalness: 1,
  roughness: 0.5,
  roughnessMap: brushed,
  bumpMap: brushed,
  bumpScale: 0.6,
  anisotropy: 0.85,
  anisotropyRotation: 0,
  envMapIntensity: 1.3,
});
const metal = new THREE.Mesh(sphereGeo, metalMat);
metal.position.set(SPHERE_X[1], SPHERE_Y, 0);
metal.rotation.x = Math.PI / 2; // brushing rings centred on the view axis
metal.castShadow = true;
scene.add(metal);

const weave = makeWeaveTexture();
weave.repeat.set(6, 3);
const fabricMat = new THREE.MeshPhysicalMaterial({
  color: 0x8a1020,
  map: weave,
  bumpMap: weave,
  bumpScale: 2.5,
  roughness: 1,
  metalness: 0,
  sheen: 1,
  sheenColor: new THREE.Color(0xff6a70),
  sheenRoughness: 0.4,
  envMapIntensity: 0.45,
});
const fabric = new THREE.Mesh(sphereGeo, fabricMat);
fabric.position.set(SPHERE_X[2], SPHERE_Y, 0);
fabric.castShadow = true;
scene.add(fabric);

/* ---------- lights ---------- */

const key = new THREE.SpotLight(0xfff4e8, 320, 0, 0.75, 1, 2);
key.position.set(-1, 7, 6.5);
key.target.position.set(0, 0.8, 0);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.near = 4;
key.shadow.camera.far = 22;
key.shadow.radius = 7;
key.shadow.blurSamples = 20;
key.shadow.bias = -0.0005;
scene.add(key, key.target);

const fill = new THREE.SpotLight(0xdfe8ff, 90, 0, 0.9, 1, 2);
fill.position.set(7, 3.5, 6);
fill.target.position.set(0, 0.8, 0);
scene.add(fill, fill.target);

const rim = new THREE.SpotLight(0xffffff, 260, 0, 0.7, 0.8, 2);
rim.position.set(1.5, 4.5, -5);
rim.target.position.set(0, 1, 0);
scene.add(rim, rim.target);

const rim2 = new THREE.SpotLight(0xffe6d8, 140, 0, 0.7, 0.8, 2);
rim2.position.set(-4.5, 3.5, -4.5);
rim2.target.position.set(0, 1, 0);
scene.add(rim2, rim2.target);

const wallLight = new THREE.SpotLight(0xffffff, 260, 0, 0.9, 1, 2);
wallLight.position.set(0, 9, 4);
wallLight.target.position.set(0, 3, -11);
scene.add(wallLight, wallLight.target);

/* ---------- state + loop ---------- */

interface TaskState {
  spheres: Array<{ name: string }>;
  keyLightX: number;
}
const state: TaskState = {
  spheres: [{ name: 'glass' }, { name: 'metal' }, { name: 'fabric' }],
  keyLightX: 0,
};
(window as unknown as { __TASK_STATE__: TaskState }).__TASK_STATE__ = state;

const envMaterials: THREE.MeshStandardMaterial[] = [
  glassMat,
  metalMat,
  fabricMat,
  cove.material as THREE.MeshStandardMaterial,
];

function updateEnvironment(): void {
  const next = pmrem.fromScene(envScene, 0, 0.1, 80, {
    size: 128,
    position: new THREE.Vector3(0, 0, 0),
  });
  for (const m of envMaterials) m.envMap = next.texture;
  if (envTarget) envTarget.dispose();
  envTarget = next;
}

let frame = 0;
let ready = false;
const t0 = performance.now();

function tick(): void {
  const t = (performance.now() - t0) / 1000;
  const keyX = -1 + 3.6 * Math.sin(t * 0.45);
  key.position.x = keyX;
  keyBox.position.x = keyX * 1.3 - 1;
  keyBox.lookAt(0, 0, 0);
  state.keyLightX = keyX;

  if (frame % 3 === 0) updateEnvironment();

  renderer.render(scene, camera);
  frame++;
  if (!ready) {
    ready = true;
    (window as unknown as { __EVAL_READY__: boolean }).__EVAL_READY__ = true;
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
