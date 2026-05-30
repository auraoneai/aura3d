import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/* ------------------------------------------------------------------ *
 * Procedural City Block
 * 20 box buildings of varying heights with lit windows, a street grid,
 * street lights, and a day / night toggle that changes lighting + sky.
 * ------------------------------------------------------------------ */

// ----- Deterministic RNG (mulberry32) so the city is reproducible -----
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = makeRng(1337);
const rand = (min: number, max: number) => min + rng() * (max - min);

// ----- Layout -----------------------------------------------------------
const COLS = 5; // 5 x 4 = 20 buildings
const ROWS = 4;
const CELL = 16; // distance between building centres (footprint + street)
const GRID_W = COLS * CELL;
const GRID_D = ROWS * CELL;

// ----- Renderer / Scene / Camera ---------------------------------------
const app = document.querySelector<HTMLElement>("#app")!;
app.style.margin = "0";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const fog = new THREE.Fog(0x000000, 60, 320);
scene.fog = fog;

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(GRID_W * 0.62, 58, GRID_D * 0.78);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 6, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 20;
controls.maxDistance = 260;
controls.update();

// ----- Lighting --------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
hemi.position.set(0, 80, 0);
scene.add(hemi);

const ambient = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(GRID_W * 0.6, 90, GRID_D * 0.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 320;
const shadowSpan = Math.max(GRID_W, GRID_D) * 0.8;
sun.shadow.camera.left = -shadowSpan;
sun.shadow.camera.right = shadowSpan;
sun.shadow.camera.top = shadowSpan;
sun.shadow.camera.bottom = -shadowSpan;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(sun.target);

// ----- Ground + streets (procedural canvas texture) --------------------
function makeGroundTexture(): THREE.CanvasTexture {
  const PX = 64; // pixels per cell
  const canvas = document.createElement("canvas");
  canvas.width = COLS * PX;
  canvas.height = ROWS * PX;
  const ctx = canvas.getContext("2d")!;

  // Asphalt base (the streets).
  ctx.fillStyle = "#2a2c30";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const pad = PX * 0.16; // street width (gap around each block)
  for (let cx = 0; cx < COLS; cx++) {
    for (let cz = 0; cz < ROWS; cz++) {
      const x = cx * PX;
      const z = cz * PX;
      // Sidewalk slab.
      ctx.fillStyle = "#8c8f95";
      ctx.fillRect(x + pad, z + pad, PX - pad * 2, PX - pad * 2);
      // Concrete lot inside the sidewalk.
      ctx.fillStyle = "#6f7278";
      const lp = pad * 1.7;
      ctx.fillRect(x + lp, z + lp, PX - lp * 2, PX - lp * 2);
    }
  }

  // Dashed lane markings down the centre of every street.
  ctx.strokeStyle = "#f2c14e";
  ctx.lineWidth = PX * 0.03;
  ctx.setLineDash([PX * 0.12, PX * 0.12]);
  for (let cx = 1; cx < COLS; cx++) {
    const x = cx * PX;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let cz = 1; cz < ROWS; cz++) {
    const z = cz * PX;
    ctx.beginPath();
    ctx.moveTo(0, z);
    ctx.lineTo(canvas.width, z);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

const groundMat = new THREE.MeshStandardMaterial({
  map: makeGroundTexture(),
  roughness: 0.95,
  metalness: 0.0,
});
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GRID_W, GRID_D),
  groundMat,
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// A larger dark base plane so the world extends past the block edges.
const baseMat = new THREE.MeshStandardMaterial({ color: 0x202225, roughness: 1 });
const base = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), baseMat);
base.rotation.x = -Math.PI / 2;
base.position.y = -0.05;
base.receiveShadow = true;
scene.add(base);

// ----- Window facade textures (color + emissive) -----------------------
interface FacadeTex {
  color: THREE.CanvasTexture;
  emissive: THREE.CanvasTexture;
}

function makeFacadeTexture(
  cols: number,
  rows: number,
  wallHex: string,
): FacadeTex {
  const CW = 24; // window cell px
  const W = cols * CW;
  const H = rows * CW;

  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = W;
  colorCanvas.height = H;
  const cctx = colorCanvas.getContext("2d")!;

  const emisCanvas = document.createElement("canvas");
  emisCanvas.width = W;
  emisCanvas.height = H;
  const ectx = emisCanvas.getContext("2d")!;

  // Wall.
  cctx.fillStyle = wallHex;
  cctx.fillRect(0, 0, W, H);
  ectx.fillStyle = "#000000";
  ectx.fillRect(0, 0, W, H);

  const margin = CW * 0.18;
  const ww = CW - margin * 2;
  const wh = CW * 0.62 - margin;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * CW + margin;
      const y = r * CW + margin;

      // Daytime glass (cool blue, slightly varied).
      const g = 150 + Math.floor(rng() * 60);
      cctx.fillStyle = `rgb(${g - 40}, ${g - 10}, ${g + 25})`;
      cctx.fillRect(x, y, ww, wh);

      // A window is "lit" at night ~55% of the time.
      const lit = rng() < 0.55;
      ectx.fillStyle = lit ? "#ffd479" : "#1a1a14";
      ectx.fillRect(x, y, ww, wh);
    }
  }

  const color = new THREE.CanvasTexture(colorCanvas);
  color.colorSpace = THREE.SRGBColorSpace;
  color.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const emissive = new THREE.CanvasTexture(emisCanvas);
  emissive.colorSpace = THREE.SRGBColorSpace;
  emissive.anisotropy = renderer.capabilities.getMaxAnisotropy();

  return { color, emissive };
}

// ----- Buildings -------------------------------------------------------
const windowMaterials: THREE.MeshStandardMaterial[] = [];
const wallPalette = ["#54585f", "#5e5246", "#4a5560", "#605863", "#4f5b54"];
const roofPalette = [0x33363b, 0x2d2a26, 0x303a40];

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

for (let cx = 0; cx < COLS; cx++) {
  for (let cz = 0; cz < ROWS; cz++) {
    const footW = rand(7, 9.5);
    const footD = rand(7, 9.5);
    const height = rand(10, 46); // varied heights

    const floors = Math.max(3, Math.round(height / 3.2));
    const wcols = Math.max(2, Math.round(footW / 2.2));

    const wallHex = wallPalette[Math.floor(rng() * wallPalette.length)];
    const facade = makeFacadeTexture(wcols, floors, wallHex);

    const windowMat = new THREE.MeshStandardMaterial({
      map: facade.color,
      emissive: 0xffffff,
      emissiveMap: facade.emissive,
      emissiveIntensity: 0.0, // controlled by day/night
      roughness: 0.6,
      metalness: 0.15,
    });
    windowMaterials.push(windowMat);

    const roofMat = new THREE.MeshStandardMaterial({
      color: roofPalette[Math.floor(rng() * roofPalette.length)],
      roughness: 0.9,
    });

    // Faces: [+x, -x, +y(top), -y(bottom), +z, -z]
    const mats = [windowMat, windowMat, roofMat, roofMat, windowMat, windowMat];
    const building = new THREE.Mesh(boxGeo, mats);
    building.scale.set(footW, height, footD);

    const worldX = (cx - (COLS - 1) / 2) * CELL;
    const worldZ = (cz - (ROWS - 1) / 2) * CELL;
    building.position.set(worldX, height / 2, worldZ);
    building.castShadow = true;
    building.receiveShadow = true;
    scene.add(building);
  }
}

// ----- Street lights ---------------------------------------------------
interface StreetLight {
  lamp: THREE.MeshStandardMaterial;
  light: THREE.PointLight;
}
const streetLights: StreetLight[] = [];

const poleMat = new THREE.MeshStandardMaterial({
  color: 0x1c1d20,
  roughness: 0.5,
  metalness: 0.7,
});
const poleGeo = new THREE.CylinderGeometry(0.16, 0.22, 7, 10);
const armGeo = new THREE.BoxGeometry(2.2, 0.18, 0.18);
const lampGeo = new THREE.SphereGeometry(0.42, 16, 12);

function addStreetLight(x: number, z: number, faceDir: number) {
  const group = new THREE.Group();

  const pole = new THREE.Mesh(poleGeo, poleMat);
  pole.position.y = 3.5;
  pole.castShadow = true;
  group.add(pole);

  const arm = new THREE.Mesh(armGeo, poleMat);
  arm.position.set(faceDir * 0.9, 6.9, 0);
  group.add(arm);

  const lampMat = new THREE.MeshStandardMaterial({
    color: 0x222018,
    emissive: 0xffd27f,
    emissiveIntensity: 0.0,
  });
  const lamp = new THREE.Mesh(lampGeo, lampMat);
  lamp.position.set(faceDir * 1.9, 6.85, 0);
  group.add(lamp);

  const light = new THREE.PointLight(0xffd9a0, 0, 26, 2);
  light.position.set(faceDir * 1.9, 6.6, 0);
  light.castShadow = false;
  group.add(light);

  group.position.set(x, 0, z);
  scene.add(group);
  streetLights.push({ lamp: lampMat, light });
}

// Place street lights along the vertical streets between building columns.
for (let cx = 0; cx <= COLS; cx++) {
  const x = (cx - COLS / 2) * CELL;
  for (let cz = 0; cz < ROWS; cz++) {
    const z = (cz - (ROWS - 1) / 2) * CELL + CELL * 0.32;
    addStreetLight(x, z, cx < COLS / 2 ? 1 : -1);
  }
}

// ----- Day / Night palettes -------------------------------------------
const DAY = {
  sky: new THREE.Color(0x9ec9f0),
  fog: new THREE.Color(0xbcd6ee),
  hemiSky: new THREE.Color(0xbfd9ff),
  hemiGround: new THREE.Color(0x6b6a63),
  sun: new THREE.Color(0xfff4e0),
};
const NIGHT = {
  sky: new THREE.Color(0x070b1a),
  fog: new THREE.Color(0x0a0f22),
  hemiSky: new THREE.Color(0x223052),
  hemiGround: new THREE.Color(0x05060a),
  sun: new THREE.Color(0x2a3a66),
};

let isDay = true;
let t = 1; // 1 = full day, 0 = full night
const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

function lerpColor(a: THREE.Color, b: THREE.Color, k: number): THREE.Color {
  tmpA.copy(a);
  tmpB.copy(b);
  return tmpA.lerp(tmpB, k);
}

const skyColor = new THREE.Color();

function applyDayNight() {
  // t: 0 night -> 1 day
  skyColor.copy(lerpColor(NIGHT.sky, DAY.sky, t));
  scene.background = skyColor;
  fog.color.copy(lerpColor(NIGHT.fog, DAY.fog, t));

  sun.intensity = 0.05 + t * 2.6;
  sun.color.copy(lerpColor(NIGHT.sun, DAY.sun, t));

  hemi.intensity = 0.18 + t * 0.95;
  hemi.color.copy(lerpColor(NIGHT.hemiSky, DAY.hemiSky, t));
  hemi.groundColor.copy(lerpColor(NIGHT.hemiGround, DAY.hemiGround, t));

  ambient.intensity = 0.08 + t * 0.3;

  const night = 1 - t;
  // Windows glow at night, fade out in daylight.
  const winGlow = night * 1.5;
  for (const m of windowMaterials) m.emissiveIntensity = winGlow;

  // Street lights turn on at night.
  for (const s of streetLights) {
    s.light.intensity = night * 14;
    s.lamp.emissiveIntensity = night * 1.6;
  }
}

// ----- UI: Day / Night toggle ------------------------------------------
const btn = document.createElement("button");
btn.textContent = "🌙 Switch to Night";
Object.assign(btn.style, {
  position: "fixed",
  top: "16px",
  left: "16px",
  zIndex: "10",
  padding: "12px 18px",
  font: "600 15px system-ui, sans-serif",
  color: "#fff",
  background: "rgba(20,24,38,0.78)",
  border: "1px solid rgba(255,255,255,0.25)",
  borderRadius: "10px",
  cursor: "pointer",
  backdropFilter: "blur(6px)",
} as CSSStyleDeclaration);
btn.addEventListener("click", () => {
  isDay = !isDay;
  btn.textContent = isDay ? "🌙 Switch to Night" : "☀️ Switch to Day";
});
document.body.appendChild(btn);

const hint = document.createElement("div");
hint.textContent = "Procedural City Block — drag to orbit, scroll to zoom";
Object.assign(hint.style, {
  position: "fixed",
  bottom: "12px",
  left: "16px",
  zIndex: "10",
  font: "500 13px system-ui, sans-serif",
  color: "rgba(255,255,255,0.7)",
  textShadow: "0 1px 3px rgba(0,0,0,0.8)",
} as CSSStyleDeclaration);
document.body.appendChild(hint);

// ----- Resize ----------------------------------------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ----- Animation loop --------------------------------------------------
applyDayNight();
renderer.setAnimationLoop(() => {
  const target = isDay ? 1 : 0;
  t += (target - t) * 0.05; // smooth transition
  if (Math.abs(target - t) < 0.001) t = target;
  applyDayNight();
  controls.update();
  renderer.render(scene, camera);
});
