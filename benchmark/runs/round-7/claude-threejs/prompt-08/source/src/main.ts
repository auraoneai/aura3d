import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------
const app = document.getElementById('app') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  2000,
);
camera.position.set(48, 38, 58);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 6, 0);
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 15;
controls.maxDistance = 220;

// ---------------------------------------------------------------------------
// Deterministic PRNG so the layout is procedural but stable per load
// ---------------------------------------------------------------------------
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
const rand = mulberry32(1337);
const range = (min: number, max: number) => min + rand() * (max - min);

// ---------------------------------------------------------------------------
// Window texture — a canvas grid of lit / unlit windows, reused per building
// ---------------------------------------------------------------------------
function makeWindowTexture(cols: number, rows: number): THREE.CanvasTexture {
  const cell = 32;
  const canvas = document.createElement('canvas');
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext('2d')!;

  // facade base colour
  ctx.fillStyle = '#3a4254';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const margin = cell * 0.22;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = rand() > 0.4;
      ctx.fillStyle = lit ? '#ffe9a8' : '#161b26';
      ctx.fillRect(
        x * cell + margin,
        y * cell + margin,
        cell - margin * 2,
        cell - margin * 2,
      );
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Emissive map: white where windows are lit, used so windows glow at night.
function makeEmissiveTexture(src: THREE.CanvasTexture): THREE.CanvasTexture {
  const srcCanvas = src.image as HTMLCanvasElement;
  const canvas = document.createElement('canvas');
  canvas.width = srcCanvas.width;
  canvas.height = srcCanvas.height;
  const ctx = canvas.getContext('2d')!;
  const sctx = srcCanvas.getContext('2d')!;
  const img = sctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    // lit windows are bright/warm -> keep them, everything else goes black
    const bright = data[i] > 180 && data[i + 1] > 150;
    if (bright) {
      data[i] = 255;
      data[i + 1] = 233;
      data[i + 2] = 168;
    } else {
      data[i] = data[i + 1] = data[i + 2] = 0;
    }
    data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ---------------------------------------------------------------------------
// Ground + streets
// ---------------------------------------------------------------------------
const cityGroup = new THREE.Group();
scene.add(cityGroup);

const GRID = 4; // 4x4 lots minus none = up to 16; we add extras to reach ~20
const LOT = 22; // spacing between lot centres
const half = ((GRID - 1) * LOT) / 2;
const ROAD_W = 9;

// Asphalt base covering the whole block
const groundSize = GRID * LOT + 30;
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(groundSize, groundSize),
  new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.95 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
cityGroup.add(ground);

// Streets: lighter strips between the building rows/columns
const streetMat = new THREE.MeshStandardMaterial({ color: 0x3c3f47, roughness: 0.9 });
const lineMat = new THREE.MeshStandardMaterial({
  color: 0xf4d35e,
  emissive: 0x554400,
  emissiveIntensity: 0.2,
  roughness: 0.6,
});

function addStreet(horizontal: boolean, offset: number) {
  const len = groundSize;
  const geo = horizontal
    ? new THREE.PlaneGeometry(len, ROAD_W)
    : new THREE.PlaneGeometry(ROAD_W, len);
  const street = new THREE.Mesh(geo, streetMat);
  street.rotation.x = -Math.PI / 2;
  street.position.set(horizontal ? 0 : offset, 0.02, horizontal ? offset : 0);
  street.receiveShadow = true;
  cityGroup.add(street);

  // dashed centre line
  const dashCount = 18;
  const dashLen = len / (dashCount * 2);
  for (let i = 0; i < dashCount; i++) {
    const dGeo = horizontal
      ? new THREE.PlaneGeometry(dashLen, 0.5)
      : new THREE.PlaneGeometry(0.5, dashLen);
    const dash = new THREE.Mesh(dGeo, lineMat);
    dash.rotation.x = -Math.PI / 2;
    const t = -len / 2 + dashLen + i * dashLen * 2;
    dash.position.set(
      horizontal ? t : offset,
      0.04,
      horizontal ? offset : t,
    );
    cityGroup.add(dash);
  }
}

// roads run between lots (at the midpoints) and around the edges
const roadOffsets: number[] = [];
for (let i = 0; i <= GRID; i++) roadOffsets.push(-half - LOT / 2 + i * LOT);
for (const o of roadOffsets) {
  addStreet(true, o);
  addStreet(false, o);
}

// ---------------------------------------------------------------------------
// Buildings — ~20 boxes of varying height with window facades
// ---------------------------------------------------------------------------
const buildings: THREE.Mesh[] = [];
const boxGeo = new THREE.BoxGeometry(1, 1, 1); // shared, scaled per building

interface Lot { x: number; z: number; }
const lots: Lot[] = [];
for (let gx = 0; gx < GRID; gx++) {
  for (let gz = 0; gz < GRID; gz++) {
    lots.push({ x: -half + gx * LOT, z: -half + gz * LOT });
  }
}
// 16 lots from the grid; add 4 more offset lots so we reach 20 buildings.
lots.push({ x: -half - LOT, z: -half + LOT });
lots.push({ x: half + LOT, z: -half + 2 * LOT });
lots.push({ x: -half + LOT, z: half + LOT });
lots.push({ x: half + LOT, z: half + LOT });

const facadeColors = [0x8a93a6, 0x9fa8bd, 0x76808f, 0xb0b8c9, 0x68707e];

for (let i = 0; i < lots.length; i++) {
  const lot = lots[i];

  const w = range(7, 11);
  const d = range(7, 11);
  const floors = Math.floor(range(3, 16)); // varying heights
  const floorH = 2.4;
  const h = floors * floorH;

  // window grid scaled to building proportions
  const cols = Math.max(2, Math.round(w / 2.2));
  const rows = floors;
  const winTex = makeWindowTexture(cols, rows);
  const emiTex = makeEmissiveTexture(winTex);

  const baseColor = facadeColors[i % facadeColors.length];
  const mat = new THREE.MeshStandardMaterial({
    color: baseColor,
    map: winTex,
    emissive: 0xffffff,
    emissiveMap: emiTex,
    emissiveIntensity: 0.0, // raised at night
    roughness: 0.7,
    metalness: 0.1,
  });

  const b = new THREE.Mesh(boxGeo, mat);
  b.scale.set(w, h, d);
  // jitter within the lot so it isn't a perfect grid
  b.position.set(
    lot.x + range(-2, 2),
    h / 2,
    lot.z + range(-2, 2),
  );
  b.castShadow = true;
  b.receiveShadow = true;
  cityGroup.add(b);
  buildings.push(b);

  // a flat rooftop cap for variety
  const cap = new THREE.Mesh(
    boxGeo,
    new THREE.MeshStandardMaterial({ color: 0x4a4f5a, roughness: 0.8 }),
  );
  cap.scale.set(w * 0.4, 0.8, d * 0.4);
  cap.position.set(b.position.x, h + 0.4, b.position.z);
  cap.castShadow = true;
  cityGroup.add(cap);
}

// ---------------------------------------------------------------------------
// Street lights along the roads — pole + glowing lamp + point light at night
// ---------------------------------------------------------------------------
interface StreetLamp {
  bulb: THREE.Mesh;
  light: THREE.PointLight;
  mat: THREE.MeshStandardMaterial;
}
const lamps: StreetLamp[] = [];
const poleMat = new THREE.MeshStandardMaterial({ color: 0x20232a, roughness: 0.6, metalness: 0.5 });
const poleGeo = new THREE.CylinderGeometry(0.18, 0.22, 6, 8);
const armGeo = new THREE.BoxGeometry(2, 0.18, 0.18);
const bulbGeo = new THREE.SphereGeometry(0.45, 12, 12);

function addStreetLamp(x: number, z: number) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  const pole = new THREE.Mesh(poleGeo, poleMat);
  pole.position.y = 3;
  pole.castShadow = true;
  g.add(pole);

  const arm = new THREE.Mesh(armGeo, poleMat);
  arm.position.set(0.9, 6, 0);
  g.add(arm);

  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xfff2cc,
    emissive: 0xffd27f,
    emissiveIntensity: 1.0,
  });
  const bulb = new THREE.Mesh(bulbGeo, bulbMat);
  bulb.position.set(1.7, 5.9, 0);
  g.add(bulb);

  const light = new THREE.PointLight(0xffd27f, 0, 22, 2);
  light.position.set(1.7, 5.8, 0);
  g.add(light);

  cityGroup.add(g);
  lamps.push({ bulb, light, mat: bulbMat });
}

// place lamps along the inner road intersections / edges
const lampPositions: Array<[number, number]> = [];
for (const o of roadOffsets) {
  lampPositions.push([o, -half - LOT / 2 - 4]);
  lampPositions.push([o, half + LOT / 2 + 4]);
}
for (const o of roadOffsets) {
  lampPositions.push([-half - LOT / 2 - 4, o]);
  lampPositions.push([half + LOT / 2 + 4, o]);
}
for (const [lx, lz] of lampPositions) addStreetLamp(lx, lz);

// ---------------------------------------------------------------------------
// Lighting + sky (day / night states)
// ---------------------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xffffff, 0x444455, 1.0);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff3e0, 2.0);
sun.position.set(60, 90, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 400;
const sc = sun.shadow.camera as THREE.OrthographicCamera;
sc.left = -120;
sc.right = 120;
sc.top = 120;
sc.bottom = -120;
sc.updateProjectionMatrix();
scene.add(sun);

const ambient = new THREE.AmbientLight(0x223044, 0.0);
scene.add(ambient);

// Sky dome via large back-side sphere with vertex-ish gradient material
const skyGeo = new THREE.SphereGeometry(800, 32, 16);
const skyUniforms = {
  topColor: { value: new THREE.Color(0x2a6fdb) },
  bottomColor: { value: new THREE.Color(0xbfe3ff) },
  offset: { value: 100 },
  exponent: { value: 0.7 },
};
const skyMat = new THREE.ShaderMaterial({
  uniforms: skyUniforms,
  side: THREE.BackSide,
  depthWrite: false,
  vertexShader: `
    varying vec3 vWorldPosition;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPosition = wp.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 topColor;
    uniform vec3 bottomColor;
    uniform float offset;
    uniform float exponent;
    varying vec3 vWorldPosition;
    void main() {
      float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
      float t = max(pow(max(h, 0.0), exponent), 0.0);
      gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
    }
  `,
});
const sky = new THREE.Mesh(skyGeo, skyMat);
scene.add(sky);

// Stars (only shown at night)
const starGeo = new THREE.BufferGeometry();
const starCount = 1200;
const starPos = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  const r = 600;
  const theta = rand() * Math.PI * 2;
  const phi = Math.acos(rand()); // upper hemisphere
  starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
  starPos[i * 3 + 1] = r * Math.cos(phi);
  starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false });
const stars = new THREE.Points(starGeo, starMat);
stars.visible = false;
scene.add(stars);

// ---------------------------------------------------------------------------
// Day / night state
// ---------------------------------------------------------------------------
let isNight = false;

function applyDay() {
  // sky
  skyUniforms.topColor.value.set(0x2a6fdb);
  skyUniforms.bottomColor.value.set(0xbfe3ff);
  scene.fog = new THREE.Fog(0xbfe3ff, 200, 700);
  stars.visible = false;

  // lights
  hemi.color.set(0xffffff);
  hemi.groundColor.set(0x444455);
  hemi.intensity = 1.0;
  sun.intensity = 2.0;
  sun.color.set(0xfff3e0);
  ambient.intensity = 0.0;

  // buildings: windows not glowing
  for (const b of buildings) {
    (b.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.0;
  }
  // lamps off
  for (const l of lamps) {
    l.light.intensity = 0;
    l.mat.emissiveIntensity = 0.15;
  }
}

function applyNight() {
  // sky
  skyUniforms.topColor.value.set(0x05060f);
  skyUniforms.bottomColor.value.set(0x1a2240);
  scene.fog = new THREE.Fog(0x0a0e1c, 120, 600);
  stars.visible = true;

  // lights
  hemi.color.set(0x223055);
  hemi.groundColor.set(0x05060d);
  hemi.intensity = 0.25;
  sun.intensity = 0.12;
  sun.color.set(0x6a78b0);
  ambient.intensity = 0.35;

  // buildings: windows glow
  for (const b of buildings) {
    (b.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.3;
  }
  // lamps on
  for (const l of lamps) {
    l.light.intensity = 1.6;
    l.mat.emissiveIntensity = 1.4;
  }
}

applyDay();

const toggle = document.getElementById('toggle') as HTMLButtonElement;
function setMode(night: boolean) {
  isNight = night;
  if (night) {
    applyNight();
    toggle.textContent = '🌙 Night';
  } else {
    applyDay();
    toggle.textContent = '☀️ Day';
  }
}
toggle.addEventListener('click', () => setMode(!isNight));

// ---------------------------------------------------------------------------
// Resize + render loop
// ---------------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
