import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/* ------------------------------------------------------------------ *
 * Procedural City Block
 * - 20 box buildings of varying heights with procedural window facades
 * - Street grid (asphalt + lane markings) and sidewalks
 * - Street lights with lamps + point lights
 * - Day / night toggle that swaps lighting, sky, and emissive glow
 * ------------------------------------------------------------------ */

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = "";

// --- Renderer -------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
app.appendChild(renderer.domElement);

// --- Scene & camera -------------------------------------------------
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x9fc4e8, 90, 320);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(70, 58, 90);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 8, 0);
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 25;
controls.maxDistance = 240;

// --- Deterministic pseudo-random (so the block is stable) ----------
let seed = 1337;
function rand(): number {
  // mulberry32
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randRange = (a: number, b: number) => a + (b - a) * rand();

// --- Procedural window facade textures ------------------------------
// Returns { map, lit } where `map` is the daytime facade and `lit` is
// the night-time emissive map (only some windows glow).
function makeFacadeTextures(wall: string) {
  const W = 128;
  const H = 128;

  const dayCanvas = document.createElement("canvas");
  dayCanvas.width = W;
  dayCanvas.height = H;
  const day = dayCanvas.getContext("2d")!;

  const litCanvas = document.createElement("canvas");
  litCanvas.width = W;
  litCanvas.height = H;
  const lit = litCanvas.getContext("2d")!;

  // Wall base
  day.fillStyle = wall;
  day.fillRect(0, 0, W, H);
  lit.fillStyle = "#000000";
  lit.fillRect(0, 0, W, H);

  // 4 x 4 windows per tile
  const cols = 4;
  const rows = 4;
  const cw = W / cols;
  const ch = H / rows;
  const pad = 5;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const wx = x * cw + pad;
      const wy = y * ch + pad;
      const ww = cw - pad * 2;
      const wh = ch - pad * 2;

      // Daytime glass (cool blue tint, slight variance)
      const g = Math.floor(150 + rand() * 60);
      day.fillStyle = `rgb(${g - 40}, ${g - 10}, ${g + 30})`;
      day.fillRect(wx, wy, ww, wh);
      // window frame
      day.strokeStyle = "rgba(15,20,30,0.6)";
      day.lineWidth = 2;
      day.strokeRect(wx, wy, ww, wh);

      // Night: ~55% of windows are lit (warm), rest dark
      if (rand() < 0.55) {
        const warm = rand() < 0.25 ? "#bcd6ff" : "#ffd98a";
        lit.fillStyle = warm;
        lit.fillRect(wx, wy, ww, wh);
      }
    }
  }

  const map = new THREE.CanvasTexture(dayCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;

  const litMap = new THREE.CanvasTexture(litCanvas);
  litMap.colorSpace = THREE.SRGBColorSpace;
  litMap.wrapS = litMap.wrapT = THREE.RepeatWrapping;

  return { map, litMap };
}

// --- City layout ----------------------------------------------------
const COLS = 5;
const ROWS = 4; // 5 * 4 = 20 buildings
const CELL = 26; // distance between building lot centers
const ROAD_W = 9; // asphalt road width
const FOOT_MIN = 9;
const FOOT_MAX = 15;

const cityWidth = COLS * CELL;
const cityDepth = ROWS * CELL;

const wallPalette = ["#6b7280", "#8a8276", "#5f6b78", "#7a6f63", "#566373", "#776c6c"];

// Materials we need to flip between day/night
const windowMaterials: THREE.MeshStandardMaterial[] = [];
const lampMaterials: THREE.MeshStandardMaterial[] = [];
const streetPointLights: THREE.PointLight[] = [];

const roofMat = new THREE.MeshStandardMaterial({
  color: 0x3a3f47,
  roughness: 0.9,
  metalness: 0.1,
});

const cityGroup = new THREE.Group();
scene.add(cityGroup);

function buildBuilding(cx: number, cz: number) {
  const footW = randRange(FOOT_MIN, FOOT_MAX);
  const footD = randRange(FOOT_MIN, FOOT_MAX);
  const height = randRange(12, 60); // varied heights
  const wall = wallPalette[Math.floor(rand() * wallPalette.length)];

  const { map, litMap } = makeFacadeTextures(wall);
  // Tile windows: ~ one window row every 4 units
  const repX = Math.max(1, Math.round(footW / 5));
  const repY = Math.max(2, Math.round(height / 5));
  map.repeat.set(repX, repY);
  litMap.repeat.set(repX, repY);

  const facadeMat = new THREE.MeshStandardMaterial({
    map,
    emissive: 0xffffff,
    emissiveMap: litMap,
    emissiveIntensity: 0.0,
    roughness: 0.75,
    metalness: 0.15,
  });
  windowMaterials.push(facadeMat);

  // Box material order: +x,-x,+y,-y,+z,-z  (top/bottom = roof)
  const mats = [facadeMat, facadeMat, roofMat, roofMat, facadeMat, facadeMat];

  const geo = new THREE.BoxGeometry(footW, height, footD);
  const mesh = new THREE.Mesh(geo, mats);
  mesh.position.set(cx, height / 2, cz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  cityGroup.add(mesh);

  // small rooftop block for silhouette variety
  if (rand() < 0.6) {
    const rw = footW * randRange(0.3, 0.5);
    const rh = randRange(2, 5);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(rw, rh, rw),
      roofMat
    );
    roof.position.set(cx, height + rh / 2, cz);
    roof.castShadow = true;
    cityGroup.add(roof);
  }
}

// --- Ground, sidewalks, roads ---------------------------------------
const groundMat = new THREE.MeshStandardMaterial({
  color: 0x20242b,
  roughness: 1.0,
  metalness: 0.0,
});
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(cityWidth + CELL * 2, cityDepth + CELL * 2),
  groundMat
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const sidewalkMat = new THREE.MeshStandardMaterial({
  color: 0x9a9a9a,
  roughness: 0.95,
});
const laneMat = new THREE.MeshStandardMaterial({
  color: 0xf4d03f,
  roughness: 0.6,
  emissive: 0x000000,
});

// Road strips: lay asphalt-free dark ground is base; add lane markings
// along the road centers (the gaps between building cells).
function addRoads() {
  const halfW = cityWidth / 2;
  const halfD = cityDepth / 2;

  // Vertical roads run along z at each column gap; horizontal along x at row gaps.
  for (let c = 0; c <= COLS; c++) {
    const x = -halfW + c * CELL;
    // lane dashes
    for (let z = -halfD; z < halfD; z += 8) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 4), laneMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.06, z + 2);
      scene.add(dash);
    }
  }
  for (let r = 0; r <= ROWS; r++) {
    const z = -halfD + r * CELL;
    for (let x = -halfW; x < halfW; x += 8) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.5), laneMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x + 2, 0.06, z);
      scene.add(dash);
    }
  }
}
addRoads();

// --- Street light prefab -------------------------------------------
const poleMat = new THREE.MeshStandardMaterial({
  color: 0x2b2f36,
  roughness: 0.6,
  metalness: 0.7,
});

function buildStreetLight(x: number, z: number) {
  const group = new THREE.Group();
  const poleH = 9;

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.35, poleH, 10),
    poleMat
  );
  pole.position.y = poleH / 2;
  pole.castShadow = true;
  group.add(pole);

  const arm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 2.4, 8),
    poleMat
  );
  arm.rotation.z = Math.PI / 2;
  arm.position.set(1.0, poleH, 0);
  group.add(arm);

  const lampMat = new THREE.MeshStandardMaterial({
    color: 0x4a4a40,
    emissive: 0xffce82,
    emissiveIntensity: 0.0,
    roughness: 0.4,
  });
  lampMaterials.push(lampMat);

  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 12), lampMat);
  lamp.position.set(2.0, poleH - 0.2, 0);
  group.add(lamp);

  const light = new THREE.PointLight(0xffce82, 0.0, 26, 2);
  light.position.set(2.0, poleH - 0.4, 0);
  streetPointLights.push(light);
  group.add(light);

  group.position.set(x, 0, z);
  scene.add(group);
}

// Place street lights at the road intersections around the block.
function placeStreetLights() {
  const halfW = cityWidth / 2;
  const halfD = cityDepth / 2;
  for (let c = 0; c <= COLS; c++) {
    for (let r = 0; r <= ROWS; r++) {
      const x = -halfW + c * CELL + ROAD_W * 0.4;
      const z = -halfD + r * CELL + ROAD_W * 0.4;
      buildStreetLight(x, z);
    }
  }
}
placeStreetLights();

// --- Place the 20 buildings -----------------------------------------
function buildCity() {
  const halfW = cityWidth / 2;
  const halfD = cityDepth / 2;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cx = -halfW + CELL / 2 + c * CELL;
      const cz = -halfD + CELL / 2 + r * CELL;

      // sidewalk pad under the building
      const padW = CELL - ROAD_W;
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(padW, 0.3, padW),
        sidewalkMat
      );
      pad.position.set(cx, 0.15, cz);
      pad.receiveShadow = true;
      scene.add(pad);

      buildBuilding(cx, cz);
    }
  }
}
buildCity();

// --- Lights (day/night) ---------------------------------------------
const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x35302a, 1.0);
scene.add(hemi);

const ambient = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff2d6, 2.4);
sun.position.set(80, 120, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 400;
const sCam = sun.shadow.camera as THREE.OrthographicCamera;
sCam.left = -130;
sCam.right = 130;
sCam.top = 130;
sCam.bottom = -130;
scene.add(sun);
scene.add(sun.target);

// Sun / moon disk in the sky
const sunDiskMat = new THREE.MeshBasicMaterial({ color: 0xfff4cf });
const sunDisk = new THREE.Mesh(new THREE.SphereGeometry(8, 24, 16), sunDiskMat);
sunDisk.position.set(120, 150, -120);
scene.add(sunDisk);

// Stars (shown at night only)
const starGeo = new THREE.BufferGeometry();
const starCount = 1200;
const starPos = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  const rad = 380;
  const theta = rand() * Math.PI * 2;
  const phi = Math.acos(rand() * 0.9 + 0.05); // upper hemisphere bias
  starPos[i * 3] = rad * Math.sin(phi) * Math.cos(theta);
  starPos[i * 3 + 1] = Math.abs(rad * Math.cos(phi)) + 20;
  starPos[i * 3 + 2] = rad * Math.sin(phi) * Math.sin(theta);
}
starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
const stars = new THREE.Points(
  starGeo,
  new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: true })
);
stars.visible = false;
scene.add(stars);

// --- Day / Night state ----------------------------------------------
const SKY_DAY = new THREE.Color(0x9fc4e8);
const SKY_NIGHT = new THREE.Color(0x070b1c);
const FOG_DAY = new THREE.Color(0x9fc4e8);
const FOG_NIGHT = new THREE.Color(0x0a0f24);

let isDay = true;

function applyMode(day: boolean) {
  isDay = day;
  if (day) {
    scene.background = SKY_DAY;
    scene.fog!.color.copy(FOG_DAY);

    sun.intensity = 2.4;
    sun.color.set(0xfff2d6);
    hemi.intensity = 1.0;
    hemi.color.set(0xbfe3ff);
    ambient.intensity = 0.4;

    sunDiskMat.color.set(0xfff4cf);
    stars.visible = false;

    for (const m of windowMaterials) m.emissiveIntensity = 0.0;
    for (const m of lampMaterials) m.emissiveIntensity = 0.0;
    for (const l of streetPointLights) l.intensity = 0.0;
  } else {
    scene.background = SKY_NIGHT;
    scene.fog!.color.copy(FOG_NIGHT);

    sun.intensity = 0.18; // moonlight
    sun.color.set(0x8fa6d6);
    hemi.intensity = 0.18;
    hemi.color.set(0x33405e);
    ambient.intensity = 0.08;

    sunDiskMat.color.set(0xdfe6ff); // moon
    stars.visible = true;

    for (const m of windowMaterials) m.emissiveIntensity = 1.0;
    for (const m of lampMaterials) m.emissiveIntensity = 1.4;
    for (const l of streetPointLights) l.intensity = 24.0;
  }
  if (toggleBtn) {
    toggleBtn.textContent = day ? "🌙 Switch to Night" : "☀️ Switch to Day";
  }
}

// --- UI -------------------------------------------------------------
const ui = document.createElement("div");
ui.className = "ui";
ui.innerHTML = `
  <div class="title">Procedural City Block</div>
  <div class="hint">Drag to orbit • scroll to zoom • 20 buildings</div>
`;
app.appendChild(ui);

const toggleBtn = document.createElement("button");
toggleBtn.className = "toggle";
ui.appendChild(toggleBtn);
toggleBtn.addEventListener("click", () => applyMode(!isDay));

applyMode(true);

// --- Resize & render ------------------------------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
