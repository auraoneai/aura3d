// Procedural City Block — raw Three.js
// 20 box buildings of varying heights with windows, streets, street lights,
// and a day/night toggle that changes lighting and sky.

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
renderer.toneMapping = THREE.ACESFilmicToneMapping;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  2000,
);
camera.position.set(70, 55, 70);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;
controls.target.set(0, 6, 0);
controls.update();

// ---------------------------------------------------------------------------
// Lighting (intensities are swapped by the day/night toggle)
// ---------------------------------------------------------------------------
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 1.0);
scene.add(hemiLight);

const ambient = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(80, 120, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 400;
sun.shadow.camera.left = -160;
sun.shadow.camera.right = 160;
sun.shadow.camera.top = 160;
sun.shadow.camera.bottom = -160;
scene.add(sun);

// ---------------------------------------------------------------------------
// Window texture (procedural canvas) — used as map + emissiveMap so windows
// read as dark glass by day and glow by night.
// ---------------------------------------------------------------------------
function makeWindowTextures(): { color: THREE.Texture; emissive: THREE.Texture } {
  const cols = 4;
  const rows = 8;
  const cell = 32;
  const w = cols * cell;
  const h = rows * cell;

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = w;
  colorCanvas.height = h;
  const cctx = colorCanvas.getContext('2d')!;

  const emissiveCanvas = document.createElement('canvas');
  emissiveCanvas.width = w;
  emissiveCanvas.height = h;
  const ectx = emissiveCanvas.getContext('2d')!;

  // wall base
  cctx.fillStyle = '#3a3f4b';
  cctx.fillRect(0, 0, w, h);
  ectx.fillStyle = '#000000';
  ectx.fillRect(0, 0, w, h);

  const margin = 6;
  const lit = ['#fff6c8', '#ffd27a', '#cfe8ff', '#9fb8d6'];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = x * cell + margin;
      const py = y * cell + margin;
      const ww = cell - margin * 2;
      const wh = cell - margin * 2;

      // glass color (day appearance)
      cctx.fillStyle = '#8fb4d8';
      cctx.fillRect(px, py, ww, wh);

      // emissive: a deterministic lit pattern for the night glow
      const litCell = (x * 7 + y * 13 + x * y) % 3 !== 0;
      if (litCell) {
        ectx.fillStyle = lit[(x + y) % lit.length];
        ectx.fillRect(px, py, ww, wh);
      }
    }
  }

  const color = new THREE.CanvasTexture(colorCanvas);
  const emissive = new THREE.CanvasTexture(emissiveCanvas);
  for (const t of [color, emissive]) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
  }
  return { color, emissive };
}

const windowTex = makeWindowTextures();

// ---------------------------------------------------------------------------
// Ground + streets
// ---------------------------------------------------------------------------
const GROUND = 240;

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GROUND, GROUND),
  new THREE.MeshStandardMaterial({ color: 0x3b6b35, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// City grid layout: 5 columns x 4 rows = 20 building plots.
const COLS = 5;
const ROWS = 4;
const PLOT = 26; // distance between plot centers (building + road)
const ROAD_WIDTH = 10;

const halfW = ((COLS - 1) * PLOT) / 2;
const halfH = ((ROWS - 1) * PLOT) / 2;

const roadMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 1 });
const lineMat = new THREE.MeshStandardMaterial({
  color: 0xffd23f,
  emissive: 0x3a3000,
});

// roads running along Z (vertical streets between columns)
for (let c = 0; c < COLS; c++) {
  const x = -halfW + c * PLOT;
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_WIDTH, GROUND),
    roadMat,
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(x, 0.02, 0);
  road.receiveShadow = true;
  scene.add(road);

  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.4, GROUND), lineMat);
  line.rotation.x = -Math.PI / 2;
  line.position.set(x, 0.04, 0);
  scene.add(line);
}

// roads running along X (horizontal streets between rows)
for (let r = 0; r < ROWS; r++) {
  const z = -halfH + r * PLOT;
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND, ROAD_WIDTH),
    roadMat,
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.02, z);
  road.receiveShadow = true;
  scene.add(road);

  const line = new THREE.Mesh(new THREE.PlaneGeometry(GROUND, 0.4), lineMat);
  line.rotation.x = -Math.PI / 2;
  line.position.set(0, 0.04, z);
  scene.add(line);
}

// ---------------------------------------------------------------------------
// Buildings — 20 boxes of varying heights with window textures
// ---------------------------------------------------------------------------
// Simple deterministic pseudo-random so the layout is stable across reloads.
let seed = 1337;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

const buildingMats: THREE.MeshStandardMaterial[] = [];
const wallColors = [0x6b7280, 0x7d8896, 0x596273, 0x8a8f9c, 0x4f5663];

const buildingGeo = new THREE.BoxGeometry(1, 1, 1);

for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const x = -halfW + c * PLOT;
    const z = -halfH + r * PLOT;

    const width = 10 + rand() * 4;
    const depth = 10 + rand() * 4;
    const height = 12 + rand() * 46; // varying heights

    const mat = new THREE.MeshStandardMaterial({
      color: wallColors[Math.floor(rand() * wallColors.length)],
      roughness: 0.8,
      metalness: 0.1,
      emissive: 0xffffff,
      emissiveIntensity: 0.0, // raised at night
    });

    // per-building texture so window rows scale with height
    mat.map = windowTex.color.clone();
    mat.emissiveMap = windowTex.emissive.clone();
    mat.map.needsUpdate = true;
    mat.emissiveMap.needsUpdate = true;
    const repY = Math.max(2, Math.round(height / 6));
    const repX = Math.max(2, Math.round(width / 5));
    mat.map.repeat.set(repX, repY);
    mat.emissiveMap.repeat.set(repX, repY);

    buildingMats.push(mat);

    const building = new THREE.Mesh(buildingGeo, mat);
    building.scale.set(width, height, depth);
    building.position.set(x, height / 2, z);
    building.castShadow = true;
    building.receiveShadow = true;
    scene.add(building);

    // small flat roof cap for a bit of variety
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.5, 2, depth * 0.5),
      new THREE.MeshStandardMaterial({ color: 0x3a3f4b, roughness: 0.9 }),
    );
    cap.position.set(x, height + 1, z);
    cap.castShadow = true;
    scene.add(cap);
  }
}

// ---------------------------------------------------------------------------
// Street lights — poles with glowing lamp heads + point lights for night
// ---------------------------------------------------------------------------
const lampMat = new THREE.MeshStandardMaterial({
  color: 0xffe9a8,
  emissive: 0xffd27a,
  emissiveIntensity: 0.0, // raised at night
});
const poleMat = new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.7 });

const streetLamps: THREE.PointLight[] = [];

function addStreetLight(x: number, z: number): void {
  const group = new THREE.Group();

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.35, 9, 10),
    poleMat,
  );
  pole.position.y = 4.5;
  pole.castShadow = true;
  group.add(pole);

  const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 0.3), poleMat);
  arm.position.set(0.9, 9, 0);
  group.add(arm);

  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 12), lampMat);
  lamp.position.set(1.8, 8.8, 0);
  group.add(lamp);

  const light = new THREE.PointLight(0xffd27a, 0, 28, 2);
  light.position.set(1.8, 8.6, 0);
  group.add(light);
  streetLamps.push(light);

  group.position.set(x, 0, z);
  scene.add(group);
}

// place lamps along the road verges
for (let c = 0; c < COLS; c++) {
  for (let r = 0; r < ROWS; r++) {
    const x = -halfW + c * PLOT + PLOT / 2 - 1;
    const z = -halfH + r * PLOT + 5;
    if (Math.abs(x) <= halfW + 6 && Math.abs(z) <= halfH + 6) {
      addStreetLight(x, z);
    }
  }
}

// ---------------------------------------------------------------------------
// Sky dome (simple gradient)
// ---------------------------------------------------------------------------
const skyGeo = new THREE.SphereGeometry(900, 32, 16);
const skyUniforms = {
  topColor: { value: new THREE.Color(0x2779d6) },
  bottomColor: { value: new THREE.Color(0xcfe8ff) },
  offset: { value: 33 },
  exponent: { value: 0.6 },
};
const skyMat = new THREE.ShaderMaterial({
  uniforms: skyUniforms,
  side: THREE.BackSide,
  depthWrite: false,
  vertexShader: /* glsl */ `
    varying vec3 vWorldPosition;
    void main() {
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorldPosition = world.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 topColor;
    uniform vec3 bottomColor;
    uniform float offset;
    uniform float exponent;
    varying vec3 vWorldPosition;
    void main() {
      float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
      float t = max(pow(max(h, 0.0), exponent), 0.0);
      gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
    }`,
});
const sky = new THREE.Mesh(skyGeo, skyMat);
scene.add(sky);

// stars (only visible at night)
const starGeo = new THREE.BufferGeometry();
const starCount = 1500;
const starPos = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  const v = new THREE.Vector3();
  v.setFromSphericalCoords(
    700 + rand() * 100,
    Math.acos(THREE.MathUtils.lerp(0.05, 0.9, rand())),
    rand() * Math.PI * 2,
  );
  starPos.set([v.x, v.y, v.z], i * 3);
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const stars = new THREE.Points(
  starGeo,
  new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: true }),
);
stars.visible = false;
scene.add(stars);

// ---------------------------------------------------------------------------
// Day / night state
// ---------------------------------------------------------------------------
const DAY = {
  skyTop: new THREE.Color(0x2779d6),
  skyBottom: new THREE.Color(0xcfe8ff),
  hemi: 1.0,
  ambient: 0.45,
  sun: 2.2,
  sunColor: new THREE.Color(0xfff4e0),
  windowGlow: 0.0,
  lampGlow: 0.0,
  lampPower: 0,
  fog: new THREE.Color(0xcfe8ff),
};

const NIGHT = {
  skyTop: new THREE.Color(0x05070f),
  skyBottom: new THREE.Color(0x141b33),
  hemi: 0.12,
  ambient: 0.08,
  sun: 0.18,
  sunColor: new THREE.Color(0x9fb4e0),
  windowGlow: 1.4,
  lampGlow: 2.0,
  lampPower: 14,
  fog: new THREE.Color(0x0a0e1a),
};

scene.fog = new THREE.Fog(DAY.fog.clone(), 200, 700);

let isNight = false;

function applyMode(night: boolean): void {
  const m = night ? NIGHT : DAY;
  skyUniforms.topColor.value.copy(m.skyTop);
  skyUniforms.bottomColor.value.copy(m.skyBottom);
  hemiLight.intensity = m.hemi;
  ambient.intensity = m.ambient;
  sun.intensity = m.sun;
  sun.color.copy(m.sunColor);
  (scene.fog as THREE.Fog).color.copy(m.fog);

  for (const mat of buildingMats) mat.emissiveIntensity = m.windowGlow;
  lampMat.emissiveIntensity = m.lampGlow;
  for (const l of streetLamps) l.intensity = m.lampPower;

  stars.visible = night;
  renderer.toneMappingExposure = night ? 1.1 : 1.0;
}

applyMode(isNight);

// ---------------------------------------------------------------------------
// UI: day/night toggle button
// ---------------------------------------------------------------------------
const button = document.createElement('button');
button.textContent = '🌙 Switch to Night';
Object.assign(button.style, {
  position: 'fixed',
  top: '16px',
  left: '16px',
  zIndex: '10',
  padding: '10px 16px',
  font: '600 14px/1.2 system-ui, sans-serif',
  color: '#fff',
  background: 'rgba(20,24,40,0.8)',
  border: '1px solid rgba(255,255,255,0.25)',
  borderRadius: '8px',
  cursor: 'pointer',
});
document.body.appendChild(button);

button.addEventListener('click', () => {
  isNight = !isNight;
  applyMode(isNight);
  button.textContent = isNight ? '☀️ Switch to Day' : '🌙 Switch to Night';
});

const label = document.createElement('div');
label.textContent = 'Procedural City Block — drag to orbit';
Object.assign(label.style, {
  position: 'fixed',
  bottom: '12px',
  left: '16px',
  zIndex: '10',
  font: '500 12px/1.2 system-ui, sans-serif',
  color: 'rgba(255,255,255,0.8)',
  textShadow: '0 1px 2px rgba(0,0,0,0.6)',
});
document.body.appendChild(label);

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
