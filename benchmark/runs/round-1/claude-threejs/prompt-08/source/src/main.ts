// Prompt 08: Procedural City Block
// 20 box buildings of varying heights with windows, streets, street lights,
// and a day/night toggle that changes lighting and sky.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---------------------------------------------------------------------------
// Renderer + scene + camera
// ---------------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const appEl = document.getElementById('app')!;
appEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x9ec5ec, 120, 360);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  2000,
);
camera.position.set(72, 56, 72);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49; // keep the camera above the ground
controls.minDistance = 20;
controls.maxDistance = 240;
controls.target.set(0, 6, 0);

// ---------------------------------------------------------------------------
// Lights (their parameters are driven by the day/night toggle)
// ---------------------------------------------------------------------------

const hemiLight = new THREE.HemisphereLight(0xbfd8ff, 0x5a5d63, 1.0);
scene.add(hemiLight);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff4e0, 2.4);
sunLight.position.set(90, 130, 60);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 500;
const s = 140;
sunLight.shadow.camera.left = -s;
sunLight.shadow.camera.right = s;
sunLight.shadow.camera.top = s;
sunLight.shadow.camera.bottom = -s;
sunLight.shadow.bias = -0.0004;
scene.add(sunLight);
scene.add(sunLight.target);

// Sun / moon disc that visibly moves and recolors with the toggle.
const sunDisc = new THREE.Mesh(
  new THREE.SphereGeometry(10, 24, 24),
  new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false }),
);
scene.add(sunDisc);

// ---------------------------------------------------------------------------
// Deterministic pseudo-random generator (stable layout every load)
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20240808);

// ---------------------------------------------------------------------------
// Window facade textures (diffuse + emissive so windows glow at night)
// ---------------------------------------------------------------------------

const WALL_COLORS = [0x8d99ae, 0x9aa6b2, 0x77808c, 0xa7a2a0, 0x6f7a87, 0x99a3ad];

function makeFacadeTextures(cols: number, rows: number, wallColor: number) {
  const cell = 24; // pixels per window cell
  const w = cols * cell;
  const h = rows * cell;

  const diffuseCanvas = document.createElement('canvas');
  diffuseCanvas.width = w;
  diffuseCanvas.height = h;
  const emissiveCanvas = document.createElement('canvas');
  emissiveCanvas.width = w;
  emissiveCanvas.height = h;

  const d = diffuseCanvas.getContext('2d')!;
  const e = emissiveCanvas.getContext('2d')!;

  const wall = '#' + new THREE.Color(wallColor).getHexString();
  d.fillStyle = wall;
  d.fillRect(0, 0, w, h);
  e.fillStyle = '#000000';
  e.fillRect(0, 0, w, h);

  const pad = 5;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = rand() < 0.45;
      const x = c * cell + pad;
      const y = r * cell + pad;
      const ww = cell - pad * 2;
      const wh = cell - pad * 2;

      // Diffuse: dark glass by day, warm tint where lit.
      d.fillStyle = lit ? '#ffd98a' : '#1d2733';
      d.fillRect(x, y, ww, wh);

      // Emissive: only lit windows glow (scaled by emissiveIntensity).
      if (lit) {
        e.fillStyle = '#ffdf9e';
        e.fillRect(x, y, ww, wh);
      }
    }
  }

  const diffuseMap = new THREE.CanvasTexture(diffuseCanvas);
  diffuseMap.colorSpace = THREE.SRGBColorSpace;
  diffuseMap.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const emissiveMap = new THREE.CanvasTexture(emissiveCanvas);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;

  return { diffuseMap, emissiveMap };
}

// ---------------------------------------------------------------------------
// Ground + streets
// ---------------------------------------------------------------------------

const GRID_COLS = 5;
const GRID_ROWS = 4; // 5 x 4 = 20 building plots
const LOT = 26; // distance between plot centres (building + street)
const halfW = ((GRID_COLS - 1) * LOT) / 2;
const halfH = ((GRID_ROWS - 1) * LOT) / 2;

const cityGroup = new THREE.Group();
scene.add(cityGroup);

// Base ground (sidewalks / lots tone)
const groundMat = new THREE.MeshStandardMaterial({ color: 0x3c4250, roughness: 1 });
const groundSize = Math.max(GRID_COLS, GRID_ROWS) * LOT + 90;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, groundSize), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
cityGroup.add(ground);

// Roads: asphalt strips running between the plot rows/columns.
const roadMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 1 });
const ROAD_W = 10;
const roadLen = groundSize;

function addRoad(x: number, z: number, horizontal: boolean) {
  const geo = horizontal
    ? new THREE.PlaneGeometry(roadLen, ROAD_W)
    : new THREE.PlaneGeometry(ROAD_W, roadLen);
  const road = new THREE.Mesh(geo, roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(x, 0.02, z);
  road.receiveShadow = true;
  cityGroup.add(road);
}

// Dashed lane markings down the centre of each road.
const laneMat = new THREE.MeshBasicMaterial({ color: 0xf2d24a });
function addLaneMarks(x: number, z: number, horizontal: boolean) {
  const dash = 2.4;
  const gap = 3.2;
  const count = Math.floor(roadLen / (dash + gap));
  const start = -roadLen / 2 + dash / 2;
  for (let i = 0; i < count; i++) {
    const geo = horizontal
      ? new THREE.PlaneGeometry(dash, 0.5)
      : new THREE.PlaneGeometry(0.5, dash);
    const m = new THREE.Mesh(geo, laneMat);
    m.rotation.x = -Math.PI / 2;
    const along = start + i * (dash + gap);
    m.position.set(horizontal ? along : x, 0.04, horizontal ? z : along);
    cityGroup.add(m);
  }
}

// Vertical roads sit between the building columns (and at the outer edges).
const vRoadXs: number[] = [];
for (let c = 0; c <= GRID_COLS; c++) {
  const x = -halfW - LOT / 2 + c * LOT;
  vRoadXs.push(x);
  addRoad(x, 0, false);
  addLaneMarks(x, 0, false);
}
const hRoadZs: number[] = [];
for (let r = 0; r <= GRID_ROWS; r++) {
  const z = -halfH - LOT / 2 + r * LOT;
  hRoadZs.push(z);
  addRoad(0, z, true);
  addLaneMarks(0, z, true);
}

// ---------------------------------------------------------------------------
// Buildings (20, varying heights, window facades)
// ---------------------------------------------------------------------------

const litWindowEmissive = new THREE.Color(0xffdf9e);
const buildingMaterials: THREE.MeshStandardMaterial[] = [];

const boxGeo = new THREE.BoxGeometry(1, 1, 1); // shared unit cube, scaled per building

for (let r = 0; r < GRID_ROWS; r++) {
  for (let c = 0; c < GRID_COLS; c++) {
    const cx = -halfW + c * LOT;
    const cz = -halfH + r * LOT;

    const width = 9 + rand() * 5; // 9..14
    const depth = 9 + rand() * 5;
    const height = 12 + rand() * 48; // 12..60 -> clearly varying heights

    const cols = Math.max(3, Math.round(width / 2.2));
    const rows = Math.max(4, Math.round(height / 3.2));
    const wallColor = WALL_COLORS[Math.floor(rand() * WALL_COLORS.length) % WALL_COLORS.length];
    const { diffuseMap, emissiveMap } = makeFacadeTextures(cols, rows, wallColor);

    const facadeMat = new THREE.MeshStandardMaterial({
      map: diffuseMap,
      emissive: litWindowEmissive,
      emissiveMap: emissiveMap,
      emissiveIntensity: 0.0, // day default; raised at night
      roughness: 0.75,
      metalness: 0.1,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x2b2f38,
      roughness: 0.9,
    });
    buildingMaterials.push(facadeMat);

    // BoxGeometry material order: +x,-x,+y(top),-y(bottom),+z,-z
    const mats = [facadeMat, facadeMat, roofMat, roofMat, facadeMat, facadeMat];
    const building = new THREE.Mesh(boxGeo, mats);
    building.scale.set(width, height, depth);
    building.position.set(cx, height / 2, cz);
    building.castShadow = true;
    building.receiveShadow = true;
    cityGroup.add(building);
  }
}

// ---------------------------------------------------------------------------
// Street lights (poles + lamp heads + point lights toggled at night)
// ---------------------------------------------------------------------------

const poleMat = new THREE.MeshStandardMaterial({ color: 0x202329, roughness: 0.6, metalness: 0.7 });
const lampMat = new THREE.MeshStandardMaterial({
  color: 0x2a2a22,
  emissive: new THREE.Color(0xffd27a),
  emissiveIntensity: 0.0,
  roughness: 0.5,
});
const poleGeo = new THREE.CylinderGeometry(0.22, 0.28, 9, 10);
const armGeo = new THREE.BoxGeometry(2.2, 0.25, 0.25);
const lampGeo = new THREE.SphereGeometry(0.6, 16, 16);

const streetLightLamps: THREE.PointLight[] = [];

function addStreetLight(x: number, z: number) {
  const g = new THREE.Group();

  const pole = new THREE.Mesh(poleGeo, poleMat);
  pole.position.y = 4.5;
  pole.castShadow = true;
  g.add(pole);

  const arm = new THREE.Mesh(armGeo, poleMat);
  arm.position.set(1.0, 9, 0);
  g.add(arm);

  const lamp = new THREE.Mesh(lampGeo, lampMat);
  lamp.position.set(2.0, 8.9, 0);
  g.add(lamp);

  const point = new THREE.PointLight(0xffd27a, 0, 36, 1.6);
  point.position.set(2.0, 8.6, 0);
  g.add(point);
  streetLightLamps.push(point);

  g.position.set(x, 0, z);
  cityGroup.add(g);
}

// Place street lights at the road intersections (offset onto the corner sidewalks).
for (const x of vRoadXs) {
  for (const z of hRoadZs) {
    addStreetLight(x + ROAD_W * 0.5 + 1.5, z + ROAD_W * 0.5 + 1.5);
  }
}

// ---------------------------------------------------------------------------
// Stars (only visible at night)
// ---------------------------------------------------------------------------

const starGeo = new THREE.BufferGeometry();
const STAR_COUNT = 1200;
const starPos = new Float32Array(STAR_COUNT * 3);
for (let i = 0; i < STAR_COUNT; i++) {
  const theta = rand() * Math.PI * 2;
  const phi = Math.acos(1 - rand()); // upper hemisphere
  const radius = 600 + rand() * 200;
  starPos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
  starPos[i * 3 + 1] = radius * Math.cos(phi) + 30;
  starPos[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 2.0,
  sizeAttenuation: false,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  fog: false,
});
const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);

// ---------------------------------------------------------------------------
// Day / night state
// ---------------------------------------------------------------------------

const DAY = {
  sky: new THREE.Color(0x87b8e8),
  fog: new THREE.Color(0x9ec5ec),
  hemiSky: new THREE.Color(0xbfd8ff),
  hemiGround: new THREE.Color(0x5a5d63),
  hemiInt: 1.0,
  ambientInt: 0.45,
  sunColor: new THREE.Color(0xfff4e0),
  sunInt: 2.4,
  sunPos: new THREE.Vector3(90, 130, 60),
  sunDiscColor: new THREE.Color(0xfff2c0),
  windowEmissive: 0.0,
  lampEmissive: 0.0,
  streetLightInt: 0.0,
  starOpacity: 0.0,
  exposure: 1.05,
};

const NIGHT = {
  sky: new THREE.Color(0x070a16),
  fog: new THREE.Color(0x0a0f1f),
  hemiSky: new THREE.Color(0x223055),
  hemiGround: new THREE.Color(0x05060a),
  hemiInt: 0.22,
  ambientInt: 0.08,
  sunColor: new THREE.Color(0xaecbff),
  sunInt: 0.35,
  sunPos: new THREE.Vector3(-90, 80, -60),
  sunDiscColor: new THREE.Color(0xdfe8ff),
  windowEmissive: 1.35,
  lampEmissive: 1.6,
  streetLightInt: 2.2,
  starOpacity: 0.9,
  exposure: 1.25,
};

let isNight = false;

function applyMode(state: typeof DAY) {
  scene.background = state.sky.clone();
  (scene.fog as THREE.Fog).color.copy(state.fog);

  hemiLight.color.copy(state.hemiSky);
  hemiLight.groundColor.copy(state.hemiGround);
  hemiLight.intensity = state.hemiInt;

  ambientLight.intensity = state.ambientInt;

  sunLight.color.copy(state.sunColor);
  sunLight.intensity = state.sunInt;
  sunLight.position.copy(state.sunPos);
  sunDisc.position.copy(state.sunPos).multiplyScalar(2.0);
  (sunDisc.material as THREE.MeshBasicMaterial).color.copy(state.sunDiscColor);

  renderer.toneMappingExposure = state.exposure;

  for (const m of buildingMaterials) m.emissiveIntensity = state.windowEmissive;
  lampMat.emissiveIntensity = state.lampEmissive;
  for (const p of streetLightLamps) p.intensity = state.streetLightInt;

  starMat.opacity = state.starOpacity;
}

applyMode(DAY);

// ---------------------------------------------------------------------------
// UI: day / night toggle button
// ---------------------------------------------------------------------------

const ui = document.createElement('div');
ui.style.cssText =
  'position:fixed;top:16px;left:16px;z-index:10;font-family:system-ui,sans-serif;';
const button = document.createElement('button');
button.textContent = '🌙 Switch to Night';
button.style.cssText =
  'padding:12px 18px;font-size:15px;font-weight:600;border:none;border-radius:10px;' +
  'cursor:pointer;background:#1f2937;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,0.35);' +
  'transition:background .2s;';
button.addEventListener('mouseenter', () => (button.style.background = '#374151'));
button.addEventListener(
  'mouseleave',
  () => (button.style.background = isNight ? '#0b1220' : '#1f2937'),
);
button.addEventListener('click', () => {
  isNight = !isNight;
  applyMode(isNight ? NIGHT : DAY);
  button.textContent = isNight ? '☀️ Switch to Day' : '🌙 Switch to Night';
  button.style.background = isNight ? '#0b1220' : '#1f2937';
});
ui.appendChild(button);

const hint = document.createElement('div');
hint.textContent = 'Drag to orbit · Scroll to zoom';
hint.style.cssText =
  'margin-top:10px;font-size:12px;color:rgba(255,255,255,0.9);' +
  'text-shadow:0 1px 3px rgba(0,0,0,0.7);';
ui.appendChild(hint);
document.body.appendChild(ui);

// ---------------------------------------------------------------------------
// Resize + render loop
// ---------------------------------------------------------------------------

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
