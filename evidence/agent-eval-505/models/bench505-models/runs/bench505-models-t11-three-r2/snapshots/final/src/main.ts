import * as THREE from 'three';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { ready: boolean; wheelCount: number; spokeCount: number; plankCount: number };
  }
}

// ---------- utilities ----------
let seed = 1234567;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
function rr(a: number, b: number): number {
  return a + (b - a) * rand();
}

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// ---------- textures ----------
function makeWoodTexture(vertical: boolean): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgb(196,152,104)';
  g.fillRect(0, 0, S, S);
  // grain lines run along the canvas x direction (u)
  for (let i = 0; i < 110; i++) {
    const y0 = rand() * S;
    const dark = rand() < 0.7;
    const a = 0.05 + rand() * 0.18;
    g.strokeStyle = dark ? `rgba(70,42,20,${a})` : `rgba(235,200,150,${a * 0.8})`;
    g.lineWidth = 0.6 + rand() * 2.2;
    const amp = 0.5 + rand() * 2.5;
    const ph = rand() * 6.28;
    g.beginPath();
    for (let x = 0; x <= S; x += 8) {
      const y = y0 + Math.sin((x / S) * 6.283 + ph) * amp;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  // knots
  for (let i = 0; i < 2; i++) {
    const kx = rand() * S;
    const ky = rand() * S;
    for (let r = 4; r > 0; r--) {
      g.strokeStyle = `rgba(60,34,16,${0.15 + (4 - r) * 0.05})`;
      g.lineWidth = 1.2;
      g.beginPath();
      g.ellipse(kx, ky, r * 4 + 4, r * 1.6 + 1.5, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
  if (vertical) {
    // stave seams are vertical lines in the final mapping
    g.strokeStyle = 'rgba(40,24,10,0.55)';
    g.lineWidth = 3;
    for (let x = 0; x < S; x += 64) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, S);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (vertical) {
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI / 2;
  }
  return t;
}

function makeBurlapTexture(): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgb(205,185,145)';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 4) {
    g.fillStyle = `rgba(90,70,40,${0.15 + rand() * 0.2})`;
    g.fillRect(i, 0, 1.5, S);
    g.fillStyle = `rgba(90,70,40,${0.15 + rand() * 0.2})`;
    g.fillRect(0, i, S, 1.5);
  }
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '60,45,25' : '240,220,180'},0.12)`;
    g.fillRect(rand() * S, rand() * S, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeGroundTexture(): THREE.CanvasTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // periodic-ish noise: sum of sines wrapped by tile via hashing on wrapped lattice
      const n = 0.5 * hash2(x % S, y % S) + 0.5 * vnoise((x / 16) % 32, (y / 16) % 32);
      const v = 170 + n * 70;
      const i = (y * S + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v * 0.95;
      img.data[i + 2] = v * 0.88;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 160; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 1 + rand() * 3;
    g.fillStyle = rand() < 0.5 ? 'rgba(60,45,30,0.35)' : 'rgba(200,180,150,0.35)';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(16, 16);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const woodTex = makeWoodTexture(false);
const staveTex = makeWoodTexture(true);
const burlapTex = makeBurlapTexture();

// ---------- materials & mesh helpers ----------
function woodMat(base = 0.85, spread = 0.3, map: THREE.Texture = woodTex): THREE.MeshStandardMaterial {
  const k = base - rand() * spread;
  return new THREE.MeshStandardMaterial({
    map,
    color: new THREE.Color(k, k * (0.92 + rand() * 0.06), k * (0.82 + rand() * 0.1)),
    roughness: 0.85,
    metalness: 0,
  });
}

const ironMat = new THREE.MeshStandardMaterial({ color: 0x3a3b3f, roughness: 0.5, metalness: 0.6 });

function addTo(parent: THREE.Object3D, m: THREE.Object3D, x: number, y: number, z: number): void {
  m.position.set(x, y, z);
  m.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  parent.add(m);
}

function woodUV(geo: THREE.BoxGeometry, dims: number[], off: number): void {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const uv = geo.attributes.uv;
  const a = dims.indexOf(Math.max(...dims));
  const others = [0, 1, 2].filter((k) => k !== a);
  for (let i = 0; i < p.count; i++) {
    const nv = [Math.abs(n.getX(i)), Math.abs(n.getY(i)), Math.abs(n.getZ(i))];
    const pv = [p.getX(i), p.getY(i), p.getZ(i)];
    const na = nv.indexOf(Math.max(...nv));
    const b = na === a ? others[0] : others.find((k) => k !== na)!;
    uv.setXY(i, pv[a] / 1.0 + off, pv[b] / 0.45 + off * 1.7);
  }
  uv.needsUpdate = true;
}

function woodBox(
  w: number,
  h: number,
  d: number,
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material = woodMat(),
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  woodUV(geo, [w, h, d], rand() * 3);
  const m = new THREE.Mesh(geo, mat);
  addTo(parent, m, x, y, z);
  return m;
}

function ironBox(w: number, h: number, d: number, parent: THREE.Object3D, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), ironMat);
  addTo(parent, m, x, y, z);
  return m;
}

const boltGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.012, 8);
function bolt(parent: THREE.Object3D, x: number, y: number, z: number, axis: 'x' | 'y' | 'z'): void {
  const m = new THREE.Mesh(boltGeo, ironMat);
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  addTo(parent, m, x, y, z);
}

function beamBetween(a: THREE.Vector3, b: THREE.Vector3, t: number, parent: THREE.Object3D): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.BoxGeometry(t, len, t);
  woodUV(geo, [t, len, t], rand() * 3);
  const m = new THREE.Mesh(geo, woodMat());
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  addTo(parent, m, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return m;
}

// ---------- renderer / scene ----------
const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const skyColor = new THREE.Color(0xe6d7b8);
scene.background = skyColor;
scene.fog = new THREE.Fog(skyColor, 16, 42);

const camera = new THREE.PerspectiveCamera(36, 640 / 360, 0.1, 100);
camera.position.set(5.2, 3.3, 6.6);
camera.lookAt(0, 0.8, 0);

const hemi = new THREE.HemisphereLight(0xfff1d6, 0x6a5238, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffdfa8, 3.2);
sun.position.set(-4.5, 7.5, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -5;
sun.shadow.camera.right = 5;
sun.shadow.camera.top = 5;
sun.shadow.camera.bottom = -5;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 24;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 4;
scene.add(sun);

// ---------- ground ----------
{
  const geo = new THREE.PlaneGeometry(90, 90, 180, 180);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c1 = new THREE.Color(0x6f5438);
  const c2 = new THREE.Color(0x967a52);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const edge = Math.min(1, Math.max(0, (r - 3.5) / 3));
    const bump = (vnoise(x * 0.5, z * 0.5) - 0.5) * 0.25 + (vnoise(x * 1.7, z * 1.7) - 0.5) * 0.06;
    pos.setY(i, bump * edge);
    const n = vnoise(x * 0.35 + 10, z * 0.35) * 0.6 + vnoise(x * 1.3, z * 1.3) * 0.4;
    tmp.copy(c1).lerp(c2, n);
    col[i * 3] = tmp.r;
    col[i * 3 + 1] = tmp.g;
    col[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ map: makeGroundTexture(), vertexColors: true, roughness: 1, metalness: 0 }),
  );
  ground.receiveShadow = true;
  scene.add(ground);
}

// stones and pebbles
{
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8b857b, roughness: 0.95, flatShading: true });
  const stoneMat2 = new THREE.MeshStandardMaterial({ color: 0x6e6a63, roughness: 0.95, flatShading: true });
  const stones: [number, number, number, number, number][] = [
    // x, z, sx, sy, sz
    [2.9, 1.6, 0.34, 0.2, 0.28],
    [3.3, 2.2, 0.18, 0.11, 0.16],
    [-3.0, 2.4, 0.42, 0.25, 0.34],
    [-2.7, -2.5, 0.26, 0.15, 0.22],
    [1.6, -3.1, 0.3, 0.17, 0.24],
    [3.6, -1.2, 0.2, 0.12, 0.18],
    [-1.2, 3.2, 0.22, 0.13, 0.2],
    [-3.6, 0.2, 0.15, 0.09, 0.13],
  ];
  stones.forEach(([x, z, sx, sy, sz], i) => {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const f = 0.85 + hash2(Math.round(p.getX(k) * 50) + i, Math.round(p.getY(k) * 50) + Math.round(p.getZ(k) * 50)) * 0.3;
      p.setXYZ(k, p.getX(k) * f, p.getY(k) * f, p.getZ(k) * f);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, i % 2 ? stoneMat2 : stoneMat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, sy * 0.35, z);
    m.rotation.y = rand() * 6;
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  });
  const pebGeo = new THREE.IcosahedronGeometry(1, 0);
  const peb = new THREE.InstancedMesh(pebGeo, stoneMat, 140);
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i < 140; i++) {
    const a = rand() * Math.PI * 2;
    const r = 2.6 + rand() * 9;
    const s = 0.015 + rand() * 0.035;
    e.set(rand() * 3, rand() * 3, rand() * 3);
    q.setFromEuler(e);
    mtx.compose(
      new THREE.Vector3(Math.cos(a) * r, s * 0.2, Math.sin(a) * r),
      q,
      new THREE.Vector3(s * 1.3, s * 0.8, s),
    );
    peb.setMatrixAt(i, mtx);
  }
  peb.castShadow = true;
  peb.receiveShadow = true;
  scene.add(peb);
}

// ---------- the cart ----------
const turntable = new THREE.Group();
scene.add(turntable);
const cart = new THREE.Group();
cart.position.z = 0.65;
turntable.add(cart);

let plankCount = 0;
const FLOOR_Y = 0.79; // centre of floor planks
const FLOOR_TOP = 0.81;
const AXLE_Y = 0.605;

// floor planks (run along z)
for (let i = 0; i < 8; i++) {
  const len = 2.0 + rr(-0.05, 0.05);
  const m = woodBox(0.172, 0.04, len, cart, -0.72 + 0.09 + i * 0.18 + rr(-0.004, 0.004), FLOOR_Y + rr(-0.004, 0.004), rr(-0.03, 0.03));
  m.rotation.z = rr(-0.012, 0.012);
  m.rotation.y = rr(-0.006, 0.006);
  plankCount++;
}

// level runners under the floor
for (const sx of [-1, 1]) {
  woodBox(0.08, 0.09, 2.35, cart, sx * 0.45, 0.72, 0.125);
}
// cross bearers under the floor
for (const z of [-0.8, 0.8]) {
  woodBox(1.3, 0.05, 0.09, cart, 0, 0.725, z);
}

// axle
{
  const ax = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.35, 16), woodMat(0.7, 0.1));
  ax.rotation.z = Math.PI / 2;
  addTo(cart, ax, 0, AXLE_Y, 0);
  for (const sx of [-1, 1]) {
    ironBox(0.16, 0.05, 0.16, cart, sx * 0.45, 0.68, 0);
    ironBox(0.16, 0.12, 0.025, cart, sx * 0.45, 0.65, 0.09);
    ironBox(0.16, 0.12, 0.025, cart, sx * 0.45, 0.65, -0.09);
    // linchpin cap
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.03, 16), ironMat);
    cap.rotation.z = Math.PI / 2;
    addTo(cart, cap, sx * 1.07, AXLE_Y, 0);
    bolt(cart, sx * 1.1, AXLE_Y - 0.03, 0, 'y');
  }
}

// posts
const POST_X = 0.7;
const POST_Z = 0.96;
const POST_H = 0.73; // 0.77 .. 1.50
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    woodBox(0.08, POST_H, 0.08, cart, sx * POST_X, 0.77 + POST_H / 2, sz * POST_Z);
  }
}

// side walls: 3 boards + 2 rails per side
const boardYs = [0.895, 1.045, 1.195];
for (const sx of [-1, 1]) {
  for (const y of boardYs) {
    const len = 2.04 + rr(-0.03, 0.03);
    const m = woodBox(0.035, 0.14, len, cart, sx * 0.7575, y + rr(-0.004, 0.004), rr(-0.02, 0.02));
    m.rotation.x = rr(-0.006, 0.006);
    plankCount++;
  }
  for (const y of [1.33, 1.45]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.08, 12), woodMat(0.8, 0.2));
    rail.rotation.x = Math.PI / 2;
    addTo(cart, rail, sx * POST_X, y, 0);
  }
}
// end walls: 3 boards + 2 rails each
for (const sz of [-1, 1]) {
  for (const y of boardYs) {
    const len = 1.46 + rr(-0.03, 0.03);
    const m = woodBox(len, 0.14, 0.035, cart, rr(-0.02, 0.02), y + rr(-0.004, 0.004), sz * 1.0175);
    m.rotation.z = rr(-0.006, 0.006);
    plankCount++;
  }
  for (const y of [1.33, 1.45]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 12), woodMat(0.8, 0.2));
    rail.rotation.z = Math.PI / 2;
    addTo(cart, rail, 0, y, sz * POST_Z);
  }
}

// iron straps and bolts on the walls
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    const x = sx * 0.78;
    ironBox(0.008, 0.5, 0.05, cart, x, 1.045, sz * 0.96);
    for (const y of [0.85, 1.045, 1.24]) bolt(cart, sx * 0.786, y, sz * 0.96, 'x');
    // strap along the end wall
    ironBox(0.05, 0.5, 0.008, cart, sx * 0.62, 1.045, sz * 1.037);
    for (const y of [0.85, 1.045, 1.24]) bolt(cart, sx * 0.62, y, sz * 1.043, 'z');
  }
  // long strap along side wall near the floor
  ironBox(0.008, 0.04, 1.7, cart, sx * 0.78, 0.84, 0);
  for (const z of [-0.7, -0.35, 0, 0.35, 0.7]) bolt(cart, sx * 0.786, 0.84, z, 'x');
}
// post-top caps
for (const sx of [-1, 1]) for (const sz of [-1, 1]) ironBox(0.095, 0.025, 0.095, cart, sx * POST_X, 1.51, sz * POST_Z);

// handles (rear) rising towards the back
for (const sx of [-1, 1]) {
  const hg = new THREE.Group();
  hg.position.set(sx * 0.45, 0.72, -0.7);
  hg.rotation.x = 0.105;
  woodBox(0.08, 0.09, 1.95, hg, 0, 0, -0.975, woodMat(0.8, 0.15));
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.05, 0.95, 14), woodMat(0.65, 0.1));
  grip.rotation.x = Math.PI / 2;
  addTo(hg, grip, 0, 0, -1.45);
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.04, 14), ironMat);
  ferrule.rotation.x = Math.PI / 2;
  addTo(hg, ferrule, 0, 0, -0.98);
  addTo(cart, hg, hg.position.x, hg.position.y, hg.position.z);
  // iron strap tying handle to the runner
  ironBox(0.1, 0.11, 0.04, cart, sx * 0.45, 0.72, -0.85);
}

// front prop stand
{
  const footY = 0.035;
  for (const sx of [-1, 1]) {
    beamBetween(new THREE.Vector3(sx * 0.45, 0.72, 1.18), new THREE.Vector3(sx * 0.45, footY, 1.55), 0.075, cart);
    ironBox(0.1, 0.11, 0.04, cart, sx * 0.45, 0.72, 1.18);
  }
  woodBox(1.0, 0.07, 0.1, cart, 0, footY, 1.56);
  woodBox(0.9, 0.04, 0.05, cart, 0, 0.3, 1.38);
  for (const sx of [-1, 1]) bolt(cart, sx * 0.45, 0.3, 1.405, 'z');
}

// wheels
const wheels: THREE.Group[] = [];
let spokeCount = 0;
const SPOKES = 12;
{
  const rimGeo = new THREE.TorusGeometry(0.54, 0.045, 10, 12, (Math.PI * 2) / 6 + 0.01);
  const tireGeo = new THREE.TorusGeometry(0.58, 0.025, 8, 64);
  const hubGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.3, 20);
  hubGeo.rotateX(Math.PI / 2);
  const hubFatGeo = new THREE.CylinderGeometry(0.115, 0.115, 0.14, 20);
  hubFatGeo.rotateX(Math.PI / 2);
  const bandFat = new THREE.CylinderGeometry(0.123, 0.123, 0.022, 20);
  bandFat.rotateX(Math.PI / 2);
  const bandEnd = new THREE.CylinderGeometry(0.097, 0.097, 0.03, 20);
  bandEnd.rotateX(Math.PI / 2);
  const rivetGeo = new THREE.SphereGeometry(0.015, 8, 6);

  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.9, AXLE_Y, 0);
    pivot.rotation.y = Math.PI / 2;
    const wheel = new THREE.Group();
    pivot.add(wheel);

    addTo(wheel, new THREE.Mesh(hubGeo, woodMat(0.7, 0.1)), 0, 0, 0);
    addTo(wheel, new THREE.Mesh(hubFatGeo, woodMat(0.7, 0.1)), 0, 0, 0);
    for (const z of [-0.05, 0.05]) addTo(wheel, new THREE.Mesh(bandFat, ironMat), 0, 0, z);
    for (const z of [-0.135, 0.135]) addTo(wheel, new THREE.Mesh(bandEnd, ironMat), 0, 0, z);

    // felloes
    for (let i = 0; i < 6; i++) {
      const f = new THREE.Mesh(rimGeo, woodMat(0.85, 0.3));
      f.scale.z = 1.6;
      f.rotation.z = (i * Math.PI * 2) / 6;
      addTo(wheel, f, 0, 0, 0);
    }
    // iron tire
    const tire = new THREE.Mesh(tireGeo, ironMat);
    tire.scale.z = 2.6;
    addTo(wheel, tire, 0, 0, 0);

    // spokes
    for (let i = 0; i < SPOKES; i++) {
      const a = (i * Math.PI * 2) / SPOKES;
      const geo = new THREE.BoxGeometry(0.055, 0.46, 0.07);
      woodUV(geo, [0.055, 0.46, 0.07], rand() * 3);
      const s = new THREE.Mesh(geo, woodMat(0.85, 0.2));
      s.rotation.z = a - Math.PI / 2;
      addTo(wheel, s, Math.cos(a) * 0.31, Math.sin(a) * 0.31, 0);
      spokeCount++;
      // rivets on the tire
      for (const z of [-0.045, 0.045]) {
        const rv = new THREE.Mesh(rivetGeo, ironMat);
        addTo(wheel, rv, Math.cos(a + 0.26) * 0.605, Math.sin(a + 0.26) * 0.605, z);
      }
    }
    cart.add(pivot);
    wheels.push(wheel);
  }
}

// ---------- cargo ----------
function smoothSeams(geo: THREE.BufferGeometry): void {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const map = new Map<string, number[]>();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    const arr = map.get(k);
    if (arr) arr.push(i);
    else map.set(k, [i]);
  }
  map.forEach((idx) => {
    if (idx.length < 2) return;
    const v = new THREE.Vector3();
    idx.forEach((i) => v.add(new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i))));
    v.normalize();
    idx.forEach((i) => n.setXYZ(i, v.x, v.y, v.z));
  });
  n.needsUpdate = true;
}

function makeSack(r: number, h: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(1, 28, 22);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i);
    const py = p.getY(i);
    const pz = p.getZ(i);
    const t = Math.min(1, Math.max(0, (py + 0.8) / 1.8));
    const k = Math.max(0, (t - 0.7) / 0.3);
    const neck = 1 - 0.55 * k * k;
    const wob = 1 + Math.sin(px * 6 + pz * 4 + py * 2) * 0.05 + Math.sin(py * 9 - px * 3) * 0.035;
    const bulge = 1 + 0.12 * Math.sin(t * Math.PI);
    const m = neck * wob * bulge * r;
    p.setXYZ(i, px * m, t * h, pz * m);
  }
  geo.computeVertexNormals();
  smoothSeams(geo);
  const mat = new THREE.MeshStandardMaterial({ map: burlapTex, color, roughness: 1 });
  addTo(g, new THREE.Mesh(geo, mat), 0, 0, 0);
  const tie = new THREE.Mesh(new THREE.TorusGeometry(r * 0.6, 0.022, 8, 20), new THREE.MeshStandardMaterial({ color: 0x5a4126, roughness: 1 }));
  tie.rotation.x = Math.PI / 2;
  addTo(g, tie, 0, h * 0.85, 0);
  const tuft = new THREE.Mesh(new THREE.ConeGeometry(r * 0.3, h * 0.14, 10, 1, true), mat.clone());
  (tuft.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  tuft.rotation.z = 0.15;
  addTo(g, tuft, 0, h * 0.93, 0);
  return g;
}

function makeBarrel(r: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const prof = (t: number) => r * (1 - 0.13 * Math.pow(2 * t - 1, 2));
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
  const N = 16;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push(new THREE.Vector2(prof(t), t * h));
  }
  pts.push(new THREE.Vector2(r * 0.8, h - 0.015));
  pts.push(new THREE.Vector2(0, h - 0.015));
  const geo = new THREE.LatheGeometry(pts, 28);
  const mat = woodMat(0.8, 0.1, staveTex);
  addTo(g, new THREE.Mesh(geo, mat), 0, 0, 0);
  for (const t of [0.08, 0.3, 0.7, 0.92]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(prof(t) + 0.004, 0.014, 6, 32), ironMat);
    hoop.rotation.x = Math.PI / 2;
    addTo(g, hoop, 0, t * h, 0);
  }
  return g;
}

function makeCrate(sx: number, sy: number, sz: number): THREE.Group {
  const g = new THREE.Group();
  const t = 0.05;
  woodBox(sx - 0.03, sy - 0.03, sz - 0.03, g, 0, sy / 2, 0, woodMat(0.6, 0.1));
  const frameMat = woodMat(0.9, 0.2);
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      woodBox(t, sy, t, g, a * (sx / 2 - t / 2), sy / 2, b * (sz / 2 - t / 2), frameMat);
      for (const y of [t / 2, sy - t / 2]) {
        woodBox(sx, t, t, g, 0, y, b * (sz / 2 - t / 2), frameMat);
        woodBox(t, t, sz - 2 * t, g, a * (sx / 2 - t / 2), y, 0, frameMat);
      }
    }
  }
  // slats on the faces
  for (const b of [-1, 1]) {
    const lenX = sx - 2 * t;
    const lenY = sy - 2 * t;
    const diag = Math.hypot(lenX, lenY);
    const d = woodBox(diag, t * 0.8, 0.022, g, 0, sy / 2, b * (sz / 2 - 0.011), woodMat(0.95, 0.2));
    d.rotation.z = Math.atan2(lenY, lenX) * (b > 0 ? 1 : -1);
    // top slats
  }
  for (let i = 0; i < 3; i++) {
    const z = -sz / 2 + t + ((i + 0.5) * (sz - 2 * t)) / 3;
    woodBox(sx - 0.01, 0.022, (sz - 2 * t) / 3 - 0.012, g, 0, sy - 0.012, z, woodMat(0.9, 0.25));
  }
  return g;
}

const sackColors = [0xd9c08c, 0xc7ab78, 0xe0cc9e, 0xbfa371];

const barrel = makeBarrel(0.26, 0.64);
addTo(cart, barrel, -0.38, FLOOR_TOP, -0.64);

const sack1 = makeSack(0.23, 0.58, sackColors[0]);
addTo(cart, sack1, 0.4, FLOOR_TOP, -0.64);
sack1.rotation.y = 0.6;

const sack2 = makeSack(0.2, 0.5, sackColors[1]);
addTo(cart, sack2, -0.42, FLOOR_TOP, -0.03);
sack2.rotation.set(0.04, 1.8, -0.05);

const sack3 = makeSack(0.2, 0.55, sackColors[2]);
sack3.rotation.z = Math.PI / 2;
sack3.rotation.y = 0.12;
addTo(cart, sack3, 0.46, FLOOR_TOP + 0.17, 0.0);

const crate1 = makeCrate(0.5, 0.4, 0.5);
addTo(cart, crate1, -0.38, FLOOR_TOP, 0.68);
crate1.rotation.y = 0.04;

const crate2 = makeCrate(0.42, 0.34, 0.42);
addTo(cart, crate2, 0.4, FLOOR_TOP, 0.7);
crate2.rotation.y = -0.06;

const crate3 = makeCrate(0.3, 0.24, 0.3);
addTo(cart, crate3, -0.38, FLOOR_TOP + 0.4, 0.68);
crate3.rotation.y = 0.35;

const sack4 = makeSack(0.15, 0.32, sackColors[3]);
addTo(cart, sack4, 0.4, FLOOR_TOP + 0.34, 0.7);
sack4.rotation.set(0.1, 0.5, -0.12);

// ---------- loop ----------
turntable.rotation.y = 0.5;
const clock = new THREE.Clock();
let first = true;

function frame(): void {
  const dt = Math.min(clock.getDelta(), 0.1);
  turntable.rotation.y += dt * 0.18;
  for (const w of wheels) w.rotation.z -= dt * 0.5;
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
    window.__TASK_STATE__ = { ready: true, wheelCount: wheels.length, spokeCount, plankCount };
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
