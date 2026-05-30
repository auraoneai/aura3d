import * as THREE from 'three';

type Mode = 'day' | 'night';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app element');
}

const styles = document.createElement('style');
styles.textContent = `
  * {
    box-sizing: border-box;
  }

  html,
  body,
  #app {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #111827;
  }

  canvas {
    display: block;
  }

  .hud {
    position: fixed;
    top: 18px;
    left: 18px;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.45);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.78);
    box-shadow: 0 12px 38px rgba(15, 23, 42, 0.18);
    backdrop-filter: blur(14px);
  }

  .hud-title {
    min-width: 116px;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0;
  }

  .toggle {
    position: relative;
    display: inline-grid;
    grid-template-columns: 1fr 1fr;
    width: 138px;
    height: 36px;
    padding: 3px;
    border: 0;
    border-radius: 999px;
    background: #1f2937;
    color: #f8fafc;
    cursor: pointer;
  }

  .toggle::before {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: calc(50% - 3px);
    height: 30px;
    border-radius: 999px;
    background: #f8fafc;
    transition: transform 180ms ease;
  }

  .toggle[data-mode="night"]::before {
    transform: translateX(66px);
  }

  .toggle span {
    position: relative;
    z-index: 1;
    display: grid;
    place-items: center;
    font-size: 12px;
    font-weight: 700;
    color: #111827;
    transition: color 180ms ease;
  }

  .toggle[data-mode="night"] span:first-child,
  .toggle[data-mode="day"] span:last-child {
    color: #f8fafc;
  }

  @media (max-width: 560px) {
    .hud {
      top: 12px;
      left: 12px;
      right: 12px;
      justify-content: space-between;
    }

    .hud-title {
      min-width: 0;
      font-size: 12px;
    }
  }
`;
document.head.appendChild(styles);

const hud = document.createElement('div');
hud.className = 'hud';
hud.innerHTML = `
  <div class="hud-title">Procedural City Block</div>
  <button class="toggle" type="button" data-mode="day" aria-label="Switch to night mode">
    <span>Day</span>
    <span>Night</span>
  </button>
`;
app.appendChild(hud);

const toggle = hud.querySelector<HTMLButtonElement>('.toggle');

if (!toggle) {
  throw new Error('Missing day/night toggle');
}

const modeToggle = toggle;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd0ff);
scene.fog = new THREE.Fog(0x9fd0ff, 75, 190);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(60, 54, 78);
camera.lookAt(0, 8, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const sun = new THREE.DirectionalLight(0xfff2d2, 3.2);
sun.position.set(-42, 68, 38);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 160;
sun.shadow.camera.left = -80;
sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80;
sun.shadow.camera.bottom = -80;
scene.add(sun);

const ambient = new THREE.HemisphereLight(0xd8ecff, 0x7b8794, 1.7);
scene.add(ambient);

const nightGlow = new THREE.PointLight(0x89a8ff, 0, 140, 1.8);
nightGlow.position.set(0, 38, 0);
scene.add(nightGlow);

const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x5e6a59, roughness: 0.95 });
const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x20252b, roughness: 0.88 });
const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: 0xb7bdc3, roughness: 0.9 });
const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.65 });
const lampDarkMaterial = new THREE.MeshStandardMaterial({ color: 0x252a31, metalness: 0.35, roughness: 0.45 });
const lampBulbMaterial = new THREE.MeshStandardMaterial({
  color: 0xfff6be,
  emissive: 0xffdd7a,
  emissiveIntensity: 0.15,
});
const windowMaterials: THREE.MeshStandardMaterial[] = [];
const lampLights: THREE.PointLight[] = [];

const ground = new THREE.Mesh(new THREE.BoxGeometry(154, 1, 124), groundMaterial);
ground.position.y = -0.55;
ground.receiveShadow = true;
scene.add(ground);

function box(width: number, height: number, depth: number, material: THREE.Material, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function addRoads() {
  box(154, 0.08, 18, roadMaterial, 0, 0.02, 0);
  box(18, 0.09, 124, roadMaterial, 0, 0.04, 0);

  box(154, 0.12, 3, sidewalkMaterial, 0, 0.12, -12.2);
  box(154, 0.12, 3, sidewalkMaterial, 0, 0.12, 12.2);
  box(3, 0.13, 124, sidewalkMaterial, -12.2, 0.14, 0);
  box(3, 0.13, 124, sidewalkMaterial, 12.2, 0.14, 0);

  for (let i = -6; i <= 6; i += 1) {
    box(4.2, 0.14, 0.34, stripeMaterial, i * 10.5, 0.23, 0);
    box(0.34, 0.15, 4.2, stripeMaterial, 0, 0.25, i * 8);
  }
}

function addBuilding(x: number, z: number, width: number, depth: number, height: number, color: number) {
  const buildingMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: 0.04,
  });
  const building = box(width, height, depth, buildingMaterial, x, height / 2, z);

  const cap = box(width + 0.55, 0.6, depth + 0.55, new THREE.MeshStandardMaterial({ color: 0x29313a, roughness: 0.75 }), x, height + 0.3, z);
  cap.castShadow = true;

  const rows = Math.max(2, Math.floor(height / 4.2));
  const xCols = Math.max(2, Math.floor(width / 3.2));
  const zCols = Math.max(2, Math.floor(depth / 3.2));
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: 0x8fd3ff,
    emissive: 0xffc66f,
    emissiveIntensity: 0.02,
    roughness: 0.3,
    metalness: 0.05,
  });
  windowMaterials.push(windowMaterial);

  for (let row = 0; row < rows; row += 1) {
    const wy = 2.7 + row * ((height - 4.2) / Math.max(rows - 1, 1));

    for (let col = 0; col < xCols; col += 1) {
      const wx = x - width / 2 + (col + 1) * (width / (xCols + 1));
      box(0.95, 1.15, 0.08, windowMaterial, wx, wy, z + depth / 2 + 0.055);
      box(0.95, 1.15, 0.08, windowMaterial, wx, wy, z - depth / 2 - 0.055);
    }

    for (let col = 0; col < zCols; col += 1) {
      const wz = z - depth / 2 + (col + 1) * (depth / (zCols + 1));
      box(0.08, 1.15, 0.95, windowMaterial, x + width / 2 + 0.055, wy, wz);
      box(0.08, 1.15, 0.95, windowMaterial, x - width / 2 - 0.055, wy, wz);
    }
  }

  return building;
}

function addStreetLight(x: number, z: number) {
  const pole = box(0.35, 7.2, 0.35, lampDarkMaterial, x, 3.6, z);
  const arm = box(3.1, 0.22, 0.22, lampDarkMaterial, x + Math.sign(-x || 1) * 1.45, 7.08, z);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 12), lampBulbMaterial);
  bulb.position.set(x + Math.sign(-x || 1) * 2.95, 6.92, z);
  bulb.castShadow = true;
  scene.add(bulb);

  const light = new THREE.PointLight(0xffd48a, 0.15, 25, 1.9);
  light.position.copy(bulb.position);
  light.castShadow = true;
  scene.add(light);
  lampLights.push(light);

  return [pole, arm, bulb];
}

addRoads();

const positions = [
  [-54, -40], [-34, -41], [-54, -22], [-32, -23], [-54, 24],
  [-34, 25], [-54, 43], [-31, 42], [-18, -42], [-18, 43],
  [28, -42], [50, -42], [28, -24], [51, -23], [28, 24],
  [50, 25], [28, 43], [50, 43], [68, -22], [68, 23],
];
const heights = [14, 26, 38, 20, 33, 17, 43, 28, 22, 35, 31, 18, 46, 24, 16, 39, 27, 48, 21, 36];
const palette = [0x8b95a1, 0x6f7784, 0x9a8571, 0x788c92, 0x58677a, 0xa49b8f, 0x65717d];

positions.forEach(([x, z], index) => {
  const width = 9 + (index % 4) * 1.3;
  const depth = 9 + ((index + 2) % 3) * 1.7;
  addBuilding(x, z, width, depth, heights[index], palette[index % palette.length]);
});

[-44, -23, 23, 44].forEach((x) => {
  addStreetLight(x, -12.8);
  addStreetLight(x, 12.8);
});

[-48, -28, 28, 48].forEach((z) => {
  addStreetLight(-12.8, z);
  addStreetLight(12.8, z);
});

const grid = new THREE.GridHelper(154, 22, 0x8f9aa4, 0x7b8794);
grid.position.y = 0.18;
scene.add(grid);

let mode: Mode = 'day';

function setMode(nextMode: Mode) {
  mode = nextMode;
  modeToggle.dataset.mode = mode;
  modeToggle.setAttribute('aria-label', mode === 'day' ? 'Switch to night mode' : 'Switch to day mode');

  if (mode === 'day') {
    scene.background = new THREE.Color(0x9fd0ff);
    scene.fog = new THREE.Fog(0x9fd0ff, 75, 190);
    sun.intensity = 3.2;
    ambient.intensity = 1.7;
    nightGlow.intensity = 0;
    lampBulbMaterial.emissiveIntensity = 0.15;
    lampLights.forEach((light) => {
      light.intensity = 0.15;
    });
    windowMaterials.forEach((material) => {
      material.color.set(0x8fd3ff);
      material.emissive.set(0xffc66f);
      material.emissiveIntensity = 0.02;
    });
    groundMaterial.color.set(0x5e6a59);
    roadMaterial.color.set(0x20252b);
  } else {
    scene.background = new THREE.Color(0x07111f);
    scene.fog = new THREE.Fog(0x07111f, 62, 155);
    sun.intensity = 0.15;
    ambient.intensity = 0.42;
    nightGlow.intensity = 2.1;
    lampBulbMaterial.emissiveIntensity = 2.7;
    lampLights.forEach((light) => {
      light.intensity = 2.5;
    });
    windowMaterials.forEach((material, index) => {
      material.color.set(index % 3 === 0 ? 0xffd28a : 0xbfe3ff);
      material.emissive.set(index % 3 === 0 ? 0xffb347 : 0x8fcfff);
      material.emissiveIntensity = 1.45;
    });
    groundMaterial.color.set(0x29332c);
    roadMaterial.color.set(0x111820);
  }
}

modeToggle.addEventListener('click', () => {
  setMode(mode === 'day' ? 'night' : 'day');
});

const target = new THREE.Vector3(0, 11, 0);
const pointer = new THREE.Vector2();

window.addEventListener('pointermove', (event) => {
  pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
  pointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

setMode('day');

renderer.setAnimationLoop((time) => {
  const orbit = time * 0.00007;
  camera.position.x = 60 * Math.cos(orbit) + pointer.x * 4;
  camera.position.z = 78 * Math.sin(orbit + 0.9) + pointer.y * 3;
  camera.lookAt(target);
  renderer.render(scene, camera);
});
