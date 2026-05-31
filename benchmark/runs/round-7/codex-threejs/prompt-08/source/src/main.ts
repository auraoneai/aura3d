import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app root');
}

type Theme = 'day' | 'night';

const buildingPalette = [0x87919a, 0x6d7881, 0x9b9186, 0x7f8a86, 0x5f6670];
const buildingPositions = [
  [-18, -14],
  [-10, -14],
  [-2, -14],
  [8, -14],
  [17, -14],
  [-18, -5],
  [-9, -5],
  [1, -5],
  [10, -5],
  [18, -5],
  [-18, 5],
  [-8, 5],
  [2, 5],
  [11, 5],
  [19, 5],
  [-17, 15],
  [-8, 15],
  [2, 15],
  [11, 15],
  [19, 15],
] as const;

const heightPattern = [7, 14, 9, 20, 11, 16, 6, 18, 10, 23, 13, 8, 21, 15, 12, 24, 10, 17, 7, 19];

const state = {
  theme: 'day' as Theme,
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ed2ff);
scene.fog = new THREE.Fog(0x9ed2ff, 45, 130);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 240);
camera.position.set(34, 31, 43);
camera.lookAt(0, 6, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.46;
controls.minDistance = 28;
controls.maxDistance = 92;
controls.target.set(0, 5, 0);

const ambient = new THREE.HemisphereLight(0xd7ecff, 0x5a5a64, 2.6);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 4.8);
sun.position.set(22, 42, 18);
sun.castShadow = true;
sun.shadow.camera.left = -55;
sun.shadow.camera.right = 55;
sun.shadow.camera.top = 55;
sun.shadow.camera.bottom = -55;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

const moon = new THREE.DirectionalLight(0x9cbcff, 0);
moon.position.set(-16, 24, -20);
scene.add(moon);

const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x24282d, roughness: 0.8 });
const asphaltMaterial = new THREE.MeshStandardMaterial({ color: 0x303238, roughness: 0.92 });
const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: 0xb9b5aa, roughness: 0.9 });
const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0xf0d875, roughness: 0.65 });
const windowDayMaterial = new THREE.MeshStandardMaterial({ color: 0x9fc9d9, roughness: 0.28, metalness: 0.12 });
const windowNightMaterial = new THREE.MeshStandardMaterial({
  color: 0xffd46a,
  emissive: 0xffb12b,
  emissiveIntensity: 1.8,
  roughness: 0.2,
});
const lampBulbMaterial = new THREE.MeshStandardMaterial({
  color: 0xfff0bd,
  emissive: 0xffc85a,
  emissiveIntensity: 0.2,
});

const windowMeshes: THREE.Mesh[] = [];
const lampLights: THREE.PointLight[] = [];
const lampBulbs: THREE.Mesh[] = [];

function makeBox(
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
  position: THREE.Vector3Tuple,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function addRoads(): void {
  makeBox(60, 0.18, 8, roadMaterial, [0, 0.01, 0]);
  makeBox(8, 0.2, 48, roadMaterial, [0, 0.02, 0]);
  makeBox(60, 0.12, 3.1, sidewalkMaterial, [0, 0.08, -6.25]);
  makeBox(60, 0.12, 3.1, sidewalkMaterial, [0, 0.08, 6.25]);
  makeBox(3.1, 0.14, 48, sidewalkMaterial, [-6.25, 0.09, 0]);
  makeBox(3.1, 0.14, 48, sidewalkMaterial, [6.25, 0.09, 0]);

  for (let x = -26; x <= 26; x += 8) {
    makeBox(3.2, 0.05, 0.18, stripeMaterial, [x, 0.18, 0]);
  }
  for (let z = -20; z <= 20; z += 8) {
    makeBox(0.18, 0.05, 3.2, stripeMaterial, [0, 0.19, z]);
  }

  const ground = makeBox(
    74,
    0.12,
    62,
    new THREE.MeshStandardMaterial({ color: 0x59614f, roughness: 0.95 }),
    [0, -0.08, 0],
  );
  ground.receiveShadow = true;
}

function addWindows(building: THREE.Mesh, width: number, height: number, depth: number): void {
  const floors = Math.max(2, Math.floor(height / 2.4));
  const columnsFront = Math.max(2, Math.floor(width / 1.55));
  const columnsSide = Math.max(2, Math.floor(depth / 1.55));
  const firstFloorY = 1.65;
  const floorGap = (height - 2.4) / floors;

  for (let floor = 0; floor < floors; floor += 1) {
    const y = firstFloorY + floor * floorGap;
    for (let col = 0; col < columnsFront; col += 1) {
      if ((floor + col) % 5 === 0) continue;
      const x = -width * 0.34 + (col / Math.max(1, columnsFront - 1)) * width * 0.68;
      const frontWindow = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.72, 0.055), windowDayMaterial);
      frontWindow.position.set(building.position.x + x, y, building.position.z + depth / 2 + 0.035);
      scene.add(frontWindow);
      windowMeshes.push(frontWindow);

      const rearWindow = frontWindow.clone();
      rearWindow.position.z = building.position.z - depth / 2 - 0.035;
      scene.add(rearWindow);
      windowMeshes.push(rearWindow);
    }

    for (let col = 0; col < columnsSide; col += 1) {
      if ((floor * 2 + col) % 6 === 0) continue;
      const z = -depth * 0.34 + (col / Math.max(1, columnsSide - 1)) * depth * 0.68;
      const sideWindow = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.68, 0.52), windowDayMaterial);
      sideWindow.position.set(building.position.x + width / 2 + 0.035, y, building.position.z + z);
      scene.add(sideWindow);
      windowMeshes.push(sideWindow);

      const otherSideWindow = sideWindow.clone();
      otherSideWindow.position.x = building.position.x - width / 2 - 0.035;
      scene.add(otherSideWindow);
      windowMeshes.push(otherSideWindow);
    }
  }
}

function addBuildings(): void {
  buildingPositions.forEach(([x, z], index) => {
    const height = heightPattern[index];
    const width = 4.4 + (index % 3) * 0.75;
    const depth = 4.2 + ((index + 1) % 3) * 0.85;
    const material = new THREE.MeshStandardMaterial({
      color: buildingPalette[index % buildingPalette.length],
      roughness: 0.72,
      metalness: 0.04,
    });
    const building = makeBox(width, height, depth, material, [x, height / 2, z]);
    addWindows(building, width, height, depth);

    if (height > 15) {
      makeBox(width * 0.44, 0.55, depth * 0.5, material, [x, height + 0.28, z]);
    }
  });
}

function addStreetLights(): void {
  const lampPositions = [
    [-24, -6.3],
    [-12, -6.3],
    [12, -6.3],
    [24, -6.3],
    [-24, 6.3],
    [-12, 6.3],
    [12, 6.3],
    [24, 6.3],
    [-6.3, -18],
    [-6.3, -9],
    [-6.3, 9],
    [-6.3, 18],
    [6.3, -18],
    [6.3, -9],
    [6.3, 9],
    [6.3, 18],
  ] as const;

  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x34383c, metalness: 0.6, roughness: 0.35 });
  const poleGeometry = new THREE.CylinderGeometry(0.08, 0.11, 4.5, 12);
  const bulbGeometry = new THREE.SphereGeometry(0.32, 16, 10);

  lampPositions.forEach(([x, z]) => {
    const pole = new THREE.Mesh(poleGeometry, poleMaterial);
    pole.position.set(x, 2.25, z);
    pole.castShadow = true;
    scene.add(pole);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.1, 0.1), poleMaterial);
    arm.position.set(x + (x < 0 ? 0.45 : -0.45), 4.45, z);
    arm.castShadow = true;
    scene.add(arm);

    const bulb = new THREE.Mesh(bulbGeometry, lampBulbMaterial);
    bulb.position.set(x + (x < 0 ? 0.94 : -0.94), 4.26, z);
    scene.add(bulb);
    lampBulbs.push(bulb);

    const point = new THREE.PointLight(0xffc966, 0, 12, 1.75);
    point.position.copy(bulb.position);
    scene.add(point);
    lampLights.push(point);
  });
}

function addSkyDetails(): void {
  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(2.3, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0xffef9f }),
  );
  sunDisc.name = 'sunDisc';
  sunDisc.position.set(31, 35, -31);
  scene.add(sunDisc);

  const moonDisc = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0xdde9ff, transparent: true, opacity: 0 }),
  );
  moonDisc.name = 'moonDisc';
  moonDisc.position.set(-31, 30, -28);
  scene.add(moonDisc);

  const starMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
  for (let i = 0; i < 70; i += 1) {
    const star = new THREE.Mesh(new THREE.SphereGeometry(0.06 + (i % 3) * 0.025, 8, 6), starMaterial);
    const angle = i * 2.39996;
    const radius = 38 + (i % 9) * 4;
    star.position.set(Math.cos(angle) * radius, 24 + (i % 13) * 2.6, Math.sin(angle) * radius - 15);
    star.name = 'star';
    scene.add(star);
  }
}

function setTheme(theme: Theme): void {
  state.theme = theme;
  const isNight = theme === 'night';
  scene.background = new THREE.Color(isNight ? 0x071225 : 0x9ed2ff);
  scene.fog = new THREE.Fog(isNight ? 0x071225 : 0x9ed2ff, isNight ? 35 : 45, isNight ? 105 : 130);
  ambient.intensity = isNight ? 0.75 : 2.6;
  ambient.color.setHex(isNight ? 0x586d9b : 0xd7ecff);
  ambient.groundColor.setHex(isNight ? 0x171a24 : 0x5a5a64);
  sun.intensity = isNight ? 0 : 4.8;
  moon.intensity = isNight ? 1.7 : 0;
  renderer.toneMappingExposure = isNight ? 0.95 : 1.05;

  windowMeshes.forEach((mesh, index) => {
    mesh.material = isNight && index % 4 !== 0 ? windowNightMaterial : windowDayMaterial;
  });

  lampLights.forEach((light) => {
    light.intensity = isNight ? 2.9 : 0;
  });

  lampBulbs.forEach((bulb) => {
    bulb.material = lampBulbMaterial;
  });
  lampBulbMaterial.emissiveIntensity = isNight ? 2.4 : 0.2;

  scene.traverse((object) => {
    if (object.name === 'sunDisc' && object instanceof THREE.Mesh) {
      (object.material as THREE.MeshBasicMaterial).opacity = isNight ? 0 : 1;
      (object.material as THREE.MeshBasicMaterial).transparent = true;
    }
    if (object.name === 'moonDisc' && object instanceof THREE.Mesh) {
      (object.material as THREE.MeshBasicMaterial).opacity = isNight ? 1 : 0;
    }
    if (object.name === 'star' && object instanceof THREE.Mesh) {
      (object.material as THREE.MeshBasicMaterial).opacity = isNight ? 0.9 : 0;
    }
  });
}

function addInterface(): void {
  const panel = document.createElement('div');
  panel.className = 'hud';
  panel.innerHTML = `
    <div class="title">Procedural City Block</div>
    <button class="toggle" type="button" aria-pressed="false">
      <span class="toggle__thumb"></span>
      <span class="toggle__text">Day</span>
    </button>
  `;
  document.body.appendChild(panel);

  const button = panel.querySelector<HTMLButtonElement>('.toggle');
  const label = panel.querySelector<HTMLSpanElement>('.toggle__text');

  button?.addEventListener('click', () => {
    const nextTheme: Theme = state.theme === 'day' ? 'night' : 'day';
    setTheme(nextTheme);
    button.setAttribute('aria-pressed', String(nextTheme === 'night'));
    if (label) label.textContent = nextTheme === 'night' ? 'Night' : 'Day';
  });
}

function addStyles(): void {
  const style = document.createElement('style');
  style.textContent = `
    html,
    body,
    #app {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: #0b111d;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    canvas {
      display: block;
    }

    .hud {
      position: fixed;
      top: 18px;
      left: 18px;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 10px 12px;
      color: #f8fbff;
      background: rgba(15, 23, 36, 0.72);
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 8px;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.25);
      backdrop-filter: blur(12px);
      z-index: 2;
    }

    .title {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0;
      white-space: nowrap;
    }

    .toggle {
      position: relative;
      display: inline-grid;
      grid-template-columns: 30px 48px;
      align-items: center;
      width: 92px;
      height: 36px;
      padding: 0 10px 0 4px;
      color: #152033;
      background: #ffd45d;
      border: 0;
      border-radius: 999px;
      cursor: pointer;
      font: inherit;
      font-size: 13px;
      font-weight: 800;
    }

    .toggle__thumb {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: #fff9dc;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28);
      transition: transform 180ms ease;
    }

    .toggle[aria-pressed="true"] {
      color: #f8fbff;
      background: #22365f;
    }

    .toggle[aria-pressed="true"] .toggle__thumb {
      transform: translateX(52px);
      background: #dce8ff;
    }

    .toggle[aria-pressed="true"] .toggle__text {
      transform: translateX(-28px);
    }

    .toggle__text {
      transition: transform 180ms ease;
    }

    @media (max-width: 560px) {
      .hud {
        top: 12px;
        left: 12px;
        right: 12px;
        justify-content: space-between;
      }

      .title {
        font-size: 13px;
      }
    }
  `;
  document.head.appendChild(style);
}

addStyles();
addRoads();
addBuildings();
addStreetLights();
addSkyDetails();
addInterface();
setTheme('day');

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
