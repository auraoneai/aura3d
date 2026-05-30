import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --------------------------------------------------------------------------
// Deterministic pseudo-random generator so the city is "procedural" but
// stable across reloads (helps reproducible visual evidence).
// --------------------------------------------------------------------------
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}
const rng = makeRng(1337);
const randRange = (min: number, max: number) => min + (max - min) * rng();

// --------------------------------------------------------------------------
// Renderer / scene / camera
// --------------------------------------------------------------------------
const app = document.getElementById('app') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x000000, 120, 360);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  2000,
);
camera.position.set(95, 78, 110);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.set(0, 8, 0);
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 30;
controls.maxDistance = 320;

// --------------------------------------------------------------------------
// Lighting (values are mutated by the day/night toggle)
// --------------------------------------------------------------------------
const hemiLight = new THREE.HemisphereLight(0xbfd9ff, 0x444433, 1.0);
scene.add(hemiLight);

const ambient = new THREE.AmbientLight(0xffffff, 0.25);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
sun.position.set(80, 120, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 400;
const shadowExtent = 160;
sun.shadow.camera.left = -shadowExtent;
sun.shadow.camera.right = shadowExtent;
sun.shadow.camera.top = shadowExtent;
sun.shadow.camera.bottom = -shadowExtent;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(sun.target);

// Glowing sun/moon disc in the sky
const skyDiscMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false });
const skyDisc = new THREE.Mesh(new THREE.SphereGeometry(14, 32, 16), skyDiscMat);
scene.add(skyDisc);

// Stars (only visible at night)
const stars = (() => {
  const count = 1500;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 700;
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(rng()); // upper hemisphere
    positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi) + 20;
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 2.2,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.0,
    fog: false,
  });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  return pts;
})();

// --------------------------------------------------------------------------
// City layout: 5 x 4 grid of lots => 20 buildings.
// --------------------------------------------------------------------------
const GRID_COLS = 5;
const GRID_ROWS = 4;
const CELL = 26; // distance between lot centres (building lot + road)
const halfW = (GRID_COLS * CELL) / 2;
const halfD = (GRID_ROWS * CELL) / 2;

function colX(i: number) {
  return -halfW + CELL * 0.5 + i * CELL;
}
function rowZ(j: number) {
  return -halfD + CELL * 0.5 + j * CELL;
}

// --------------------------------------------------------------------------
// Ground / city base plate
// --------------------------------------------------------------------------
const groundGeo = new THREE.PlaneGeometry(GRID_COLS * CELL + 80, GRID_ROWS * CELL + 80);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 1.0 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// --------------------------------------------------------------------------
// Streets: a grid of roads running between the building lots.
// --------------------------------------------------------------------------
const ROAD_W = 9;
const roadMat = new THREE.MeshStandardMaterial({ color: 0x202327, roughness: 1.0 });
const laneMat = new THREE.MeshBasicMaterial({ color: 0xf2d14a });

const cityRoot = new THREE.Group();
scene.add(cityRoot);

const roadsGroup = new THREE.Group();
cityRoot.add(roadsGroup);

const roadXs: number[] = [];
for (let i = 0; i <= GRID_COLS; i++) roadXs.push(-halfW + i * CELL);
const roadZs: number[] = [];
for (let j = 0; j <= GRID_ROWS; j++) roadZs.push(-halfD + j * CELL);

const roadSpanX = GRID_COLS * CELL + ROAD_W;
const roadSpanZ = GRID_ROWS * CELL + ROAD_W;

// Vertical roads (run along Z)
for (const x of roadXs) {
  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, roadSpanZ), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(x, 0.02, 0);
  road.receiveShadow = true;
  roadsGroup.add(road);

  const dashCount = 18;
  for (let d = 0; d < dashCount; d++) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.4), laneMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(x, 0.05, -roadSpanZ / 2 + (d + 0.5) * (roadSpanZ / dashCount));
    roadsGroup.add(dash);
  }
}

// Horizontal roads (run along X)
for (const z of roadZs) {
  const road = new THREE.Mesh(new THREE.PlaneGeometry(roadSpanX, ROAD_W), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.02, z);
  road.receiveShadow = true;
  roadsGroup.add(road);

  const dashCount = 18;
  for (let d = 0; d < dashCount; d++) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), laneMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(-roadSpanX / 2 + (d + 0.5) * (roadSpanX / dashCount), 0.05, z);
    roadsGroup.add(dash);
  }
}

// --------------------------------------------------------------------------
// Window facade textures.
// A canvas holds a grid of windows. The colour map shows dark glass with a
// faint frame (so windows read in daylight); the emissive map lights a subset
// of windows so they glow at night. Repeats are set per-building so windows
// stay a roughly constant real-world size.
// --------------------------------------------------------------------------
interface FacadeTextures {
  map: THREE.CanvasTexture;
  emissive: THREE.CanvasTexture;
}

function makeFacadeTextures(cols: number, rows: number, litSeed: number): FacadeTextures {
  const cell = 32;
  const w = cols * cell;
  const h = rows * cell;

  // base colour map (facade + window glass)
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#2b2f38';
  ctx.fillRect(0, 0, w, h);

  // emissive map (black = off, bright = lit window)
  const e = document.createElement('canvas');
  e.width = w;
  e.height = h;
  const ectx = e.getContext('2d')!;
  ectx.fillStyle = '#000000';
  ectx.fillRect(0, 0, w, h);

  const litRng = makeRng(litSeed);
  const margin = 6;
  const glow = ['#fff4c4', '#ffe08a', '#cfe8ff', '#ffd27a'];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = x * cell + margin;
      const py = y * cell + margin;
      const pw = cell - margin * 2;
      const ph = cell - margin * 2;

      // glass on the colour map (visible in daytime)
      ctx.fillStyle = '#5b6b82';
      ctx.fillRect(px, py, pw, ph);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(px, py, pw, ph * 0.4);

      // a subset of windows are "lit" on the emissive map
      if (litRng() > 0.45) {
        ectx.fillStyle = glow[(litRng() * glow.length) | 0];
        ectx.fillRect(px, py, pw, ph);
      }
    }
  }

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const emissive = new THREE.CanvasTexture(e);
  emissive.colorSpace = THREE.SRGBColorSpace;
  emissive.wrapS = emissive.wrapT = THREE.RepeatWrapping;
  emissive.anisotropy = map.anisotropy;

  return { map, emissive };
}

const facadeVariants = [
  makeFacadeTextures(6, 6, 11),
  makeFacadeTextures(6, 6, 47),
  makeFacadeTextures(6, 6, 91),
  makeFacadeTextures(6, 6, 203),
];

// --------------------------------------------------------------------------
// Buildings
// --------------------------------------------------------------------------
const buildingMaterials: THREE.MeshStandardMaterial[] = [];
const buildingGroup = new THREE.Group();
cityRoot.add(buildingGroup);

const facadeColors = [0x8a8f99, 0x9aa0ab, 0x76808f, 0xa6a29a, 0x7f8a86];

const FLOOR_H = 3.2; // approximate real height of one window row
const buildingGeo = new THREE.BoxGeometry(1, 1, 1); // scaled per building

let buildingCount = 0;
for (let j = 0; j < GRID_ROWS; j++) {
  for (let i = 0; i < GRID_COLS; i++) {
    const cx = colX(i);
    const cz = rowZ(j);

    const footprint = randRange(9, 13);
    const depth = randRange(9, 13);
    const floors = Math.round(randRange(4, 16)); // varied heights
    const height = floors * FLOOR_H;

    const variant = facadeVariants[(rng() * facadeVariants.length) | 0];

    // Clone so each building can have its own repeat.
    const map = variant.map.clone();
    const emissiveMap = variant.emissive.clone();
    map.needsUpdate = true;
    emissiveMap.needsUpdate = true;

    const colsW = Math.max(2, Math.round(footprint / 2.4));
    map.repeat.set(colsW, floors);
    emissiveMap.repeat.set(colsW, floors);

    const mat = new THREE.MeshStandardMaterial({
      color: facadeColors[(rng() * facadeColors.length) | 0],
      map,
      emissive: 0xffffff,
      emissiveMap,
      emissiveIntensity: 0.0, // raised at night
      roughness: 0.78,
      metalness: 0.1,
    });
    buildingMaterials.push(mat);

    const mesh = new THREE.Mesh(buildingGeo, mat);
    mesh.scale.set(footprint, height, depth);
    mesh.position.set(cx, height / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    buildingGroup.add(mesh);

    // Flat roof cap so the top doesn't show stretched windows.
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(footprint + 0.1, 0.6, depth + 0.1),
      new THREE.MeshStandardMaterial({ color: 0x3c4048, roughness: 0.9 }),
    );
    roof.position.set(cx, height + 0.3, cz);
    roof.castShadow = true;
    buildingGroup.add(roof);

    buildingCount++;
  }
}

// --------------------------------------------------------------------------
// Street lights along the roads.
// Each has emissive lamp geometry + a PointLight that switches on at night.
// --------------------------------------------------------------------------
interface StreetLamp {
  light: THREE.PointLight;
  bulbMat: THREE.MeshStandardMaterial;
}
const streetLamps: StreetLamp[] = [];

const poleMat = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.6, metalness: 0.5 });
const poleGeo = new THREE.CylinderGeometry(0.18, 0.22, 7, 10);
const armGeo = new THREE.BoxGeometry(2.2, 0.18, 0.18);
const bulbGeo = new THREE.SphereGeometry(0.45, 16, 12);

function addStreetLamp(x: number, z: number, faceX: number) {
  const g = new THREE.Group();

  const pole = new THREE.Mesh(poleGeo, poleMat);
  pole.position.y = 3.5;
  pole.castShadow = true;
  g.add(pole);

  const arm = new THREE.Mesh(armGeo, poleMat);
  arm.position.set(faceX * 1.0, 6.9, 0);
  g.add(arm);

  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0x222218,
    emissive: 0xffd27a,
    emissiveIntensity: 0.0,
  });
  const bulb = new THREE.Mesh(bulbGeo, bulbMat);
  bulb.position.set(faceX * 2.0, 6.8, 0);
  g.add(bulb);

  const light = new THREE.PointLight(0xffd27a, 0.0, 26, 2.0);
  light.position.set(faceX * 2.0, 6.6, 0);
  g.add(light);

  g.position.set(x, 0, z);
  cityRoot.add(g);

  streetLamps.push({ light, bulbMat });
}

// Lamps along the inner vertical roads, on both kerbs, spaced down each road.
for (let ri = 1; ri < roadXs.length - 1; ri++) {
  const x = roadXs[ri];
  for (let s = -1; s <= 1; s++) {
    addStreetLamp(x - ROAD_W * 0.5 - 0.6, s * (CELL * 0.7), 1);
    addStreetLamp(x + ROAD_W * 0.5 + 0.6, s * (CELL * 0.7) + CELL * 0.35, -1);
  }
}
// A few along the outer edges too.
for (const z of [-halfD + 4, halfD - 4]) {
  for (let i = 0; i < GRID_COLS; i++) {
    addStreetLamp(colX(i), z, z < 0 ? 1 : -1);
  }
}

// --------------------------------------------------------------------------
// Day / Night state
// --------------------------------------------------------------------------
const DAY = {
  sky: new THREE.Color(0x87b6e8),
  fog: new THREE.Color(0xb8d2ec),
  sun: { color: new THREE.Color(0xfff4e0), intensity: 2.4 },
  hemi: { sky: new THREE.Color(0xbfd9ff), ground: new THREE.Color(0x55563f), intensity: 1.0 },
  ambient: 0.35,
  sunPos: new THREE.Vector3(80, 120, 60),
  disc: new THREE.Color(0xfff2c0),
  windowEmissive: 0.04,
  streetLight: 0.0,
  bulbEmissive: 0.0,
  stars: 0.0,
  exposure: 1.05,
};

const NIGHT = {
  sky: new THREE.Color(0x070b18),
  fog: new THREE.Color(0x0a0f1f),
  sun: { color: new THREE.Color(0x9fb4e6), intensity: 0.18 },
  hemi: { sky: new THREE.Color(0x1a2238), ground: new THREE.Color(0x05060a), intensity: 0.25 },
  ambient: 0.06,
  sunPos: new THREE.Vector3(-70, 90, -50),
  disc: new THREE.Color(0xdfe7ff),
  windowEmissive: 1.5,
  streetLight: 14.0,
  bulbEmissive: 2.0,
  stars: 0.9,
  exposure: 1.15,
};

let isNight = false;

function applyState(s: typeof DAY) {
  scene.background = s.sky.clone();
  scene.fog!.color.copy(s.fog);

  sun.color.copy(s.sun.color);
  sun.intensity = s.sun.intensity;
  sun.position.copy(s.sunPos);
  sun.target.position.set(0, 0, 0);

  hemiLight.color.copy(s.hemi.sky);
  hemiLight.groundColor.copy(s.hemi.ground);
  hemiLight.intensity = s.hemi.intensity;

  ambient.intensity = s.ambient;

  skyDiscMat.color.copy(s.disc);
  skyDisc.position.copy(s.sunPos).multiplyScalar(3.2);

  renderer.toneMappingExposure = s.exposure;

  for (const m of buildingMaterials) m.emissiveIntensity = s.windowEmissive;
  for (const lamp of streetLamps) {
    lamp.light.intensity = s.streetLight;
    lamp.bulbMat.emissiveIntensity = s.bulbEmissive;
  }
  (stars.material as THREE.PointsMaterial).opacity = s.stars;
}

applyState(DAY);

// --------------------------------------------------------------------------
// UI: day/night toggle button + label
// --------------------------------------------------------------------------
const ui = document.createElement('div');
ui.style.cssText = [
  'position:fixed',
  'top:16px',
  'left:16px',
  'z-index:10',
  'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
  'color:#fff',
  'user-select:none',
].join(';');

const toggleBtn = document.createElement('button');
toggleBtn.textContent = '🌙 Switch to Night';
toggleBtn.style.cssText = [
  'font-size:15px',
  'font-weight:600',
  'padding:10px 16px',
  'border:none',
  'border-radius:10px',
  'cursor:pointer',
  'background:#1f6feb',
  'color:#fff',
  'box-shadow:0 4px 14px rgba(0,0,0,0.35)',
].join(';');

const hint = document.createElement('div');
hint.textContent = 'Procedural City Block — drag to orbit, scroll to zoom (press N to toggle)';
hint.style.cssText =
  'margin-top:8px;font-size:12px;opacity:0.85;text-shadow:0 1px 2px rgba(0,0,0,0.6)';

ui.appendChild(toggleBtn);
ui.appendChild(hint);
document.body.appendChild(ui);

function setMode(night: boolean) {
  isNight = night;
  applyState(night ? NIGHT : DAY);
  toggleBtn.textContent = night ? '☀️ Switch to Day' : '🌙 Switch to Night';
  toggleBtn.style.background = night ? '#f0a500' : '#1f6feb';
  toggleBtn.style.color = night ? '#1a1a1a' : '#fff';
}

toggleBtn.addEventListener('click', () => setMode(!isNight));
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'n') setMode(!isNight);
});

// --------------------------------------------------------------------------
// Resize + render loop
// --------------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

// Small hook for harness / debugging.
(window as unknown as { __city: { buildings: number; toggle: () => void } }).__city = {
  buildings: buildingCount,
  toggle: () => setMode(!isNight),
};
