import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type Mode = 'day' | 'night';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app container');
}

const style = document.createElement('style');
style.textContent = `
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
    background: #10151d;
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
    gap: 12px;
    padding: 10px 12px;
    color: #f7fafc;
    background: rgba(15, 22, 31, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 8px;
    backdrop-filter: blur(12px);
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.22);
    z-index: 2;
  }

  .hud-title {
    display: grid;
    gap: 2px;
    min-width: 140px;
  }

  .hud-title strong {
    font-size: 14px;
    line-height: 1.1;
    font-weight: 750;
  }

  .hud-title span {
    font-size: 12px;
    color: rgba(247, 250, 252, 0.72);
    white-space: nowrap;
  }

  .toggle {
    position: relative;
    display: inline-grid;
    grid-template-columns: 1fr 1fr;
    width: 132px;
    height: 38px;
    padding: 3px;
    border: 0;
    border-radius: 999px;
    color: #f8fafc;
    background: rgba(255, 255, 255, 0.14);
    cursor: pointer;
  }

  .toggle::before {
    content: "";
    position: absolute;
    inset: 3px auto 3px 3px;
    width: calc(50% - 3px);
    border-radius: 999px;
    background: #f6c453;
    transition: transform 180ms ease, background 180ms ease;
  }

  .toggle[data-mode="night"]::before {
    transform: translateX(100%);
    background: #6aa5ff;
  }

  .toggle span {
    position: relative;
    z-index: 1;
    display: grid;
    place-items: center;
    min-width: 0;
    font-size: 12px;
    font-weight: 700;
  }

  @media (max-width: 560px) {
    .hud {
      top: 10px;
      left: 10px;
      right: 10px;
      justify-content: space-between;
    }

    .hud-title {
      min-width: 0;
    }

    .hud-title span {
      white-space: normal;
    }
  }
`;
document.head.appendChild(style);

const hud = document.createElement('div');
hud.className = 'hud';
hud.innerHTML = `
  <div class="hud-title">
    <strong>Procedural City Block</strong>
    <span>20 buildings, lit streets, visible windows</span>
  </div>
  <button class="toggle" type="button" data-mode="day" aria-label="Toggle day and night lighting">
    <span>Day</span>
    <span>Night</span>
  </button>
`;
app.appendChild(hud);

const toggle = hud.querySelector<HTMLButtonElement>('.toggle');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xbfd8f0, 90, 240);

const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 280);
camera.position.set(82, 72, 82);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 8, 0);
controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 32;
controls.maxDistance = 130;
controls.update();

const world = new THREE.Group();
scene.add(world);

const ambient = new THREE.HemisphereLight(0xcfeaff, 0x5b4b3b, 1.5);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff0bd, 3.4);
sun.position.set(-35, 55, 28);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 130;
sun.shadow.camera.left = -58;
sun.shadow.camera.right = 58;
sun.shadow.camera.top = 58;
sun.shadow.camera.bottom = -58;
scene.add(sun);

const moon = new THREE.DirectionalLight(0x9fbcff, 0);
moon.position.set(28, 42, -34);
scene.add(moon);

const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x59654f, roughness: 0.95 });
const asphaltMaterial = new THREE.MeshStandardMaterial({ color: 0x252a2f, roughness: 0.9 });
const curbMaterial = new THREE.MeshStandardMaterial({ color: 0xb7b9b3, roughness: 0.8 });
const stripeMaterial = new THREE.MeshBasicMaterial({ color: 0xf5d35d });
const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: 0xa8aba2, roughness: 0.88 });
const lampPostMaterial = new THREE.MeshStandardMaterial({ color: 0x20262e, metalness: 0.45, roughness: 0.42 });
const lampBulbMaterial = new THREE.MeshStandardMaterial({
  color: 0xfff1b8,
  emissive: 0xffd36d,
  emissiveIntensity: 0.2,
});

function addBox(
  size: THREE.Vector3Tuple,
  position: THREE.Vector3Tuple,
  material: THREE.Material,
  receiveShadow = true,
  castShadow = true,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.receiveShadow = receiveShadow;
  mesh.castShadow = castShadow;
  world.add(mesh);
  return mesh;
}

addBox([92, 0.35, 92], [0, -0.18, 0], groundMaterial, true, false);
addBox([92, 0.08, 14], [0, 0.02, 0], asphaltMaterial, true, false);
addBox([14, 0.09, 92], [0, 0.04, 0], asphaltMaterial, true, false);
addBox([92, 0.12, 1.1], [0, 0.14, -7.55], curbMaterial, true, false);
addBox([92, 0.12, 1.1], [0, 0.14, 7.55], curbMaterial, true, false);
addBox([1.1, 0.12, 92], [-7.55, 0.15, 0], curbMaterial, true, false);
addBox([1.1, 0.12, 92], [7.55, 0.15, 0], curbMaterial, true, false);

for (const x of [-27, -9, 9, 27]) {
  addBox([7, 0.11, 0.32], [x, 0.11, 0], stripeMaterial, false, false);
}
for (const z of [-27, -9, 9, 27]) {
  addBox([0.32, 0.12, 7], [0, 0.12, z], stripeMaterial, false, false);
}

for (const x of [-26, 26]) {
  for (const z of [-26, 26]) {
    addBox([29, 0.16, 29], [x, 0.08, z], sidewalkMaterial, true, false);
  }
}

const buildingColors = [
  0x7d8795, 0x667481, 0x8a7464, 0x596c75, 0x918c80,
  0x6f7988, 0x7b6f71, 0x536571, 0x8b8174, 0x64707a,
];
const windowDay = new THREE.MeshStandardMaterial({
  color: 0x9fd0e9,
  emissive: 0x123142,
  emissiveIntensity: 0.04,
  roughness: 0.25,
  metalness: 0.05,
});
const windowNight = {
  emissive: new THREE.Color(0xffd479),
  color: new THREE.Color(0xfff0b3),
};
const windows: THREE.Mesh[] = [];
const buildingFootprints = [
  [-36, -35, 8, 10, 14], [-24, -36, 7, 8, 24], [-13, -35, 7, 10, 18], [14, -35, 8, 9, 31], [28, -35, 9, 10, 20],
  [-36, -20, 8, 8, 28], [-24, -20, 7, 9, 12], [-13, -20, 7, 8, 35], [15, -20, 9, 8, 16], [29, -20, 8, 9, 27],
  [-35, 18, 9, 8, 22], [-22, 18, 8, 9, 33], [-11, 18, 6, 8, 15], [14, 18, 8, 8, 26], [28, 18, 9, 9, 38],
  [-36, 34, 8, 9, 17], [-23, 34, 8, 8, 30], [-11, 34, 7, 9, 23], [14, 34, 8, 9, 13], [29, 34, 8, 8, 34],
] as const;

function addWindows(x: number, z: number, width: number, depth: number, height: number) {
  const colsX = Math.max(2, Math.floor(width / 2.2));
  const colsZ = Math.max(2, Math.floor(depth / 2.2));
  const floors = Math.max(2, Math.floor(height / 3.15));
  const windowGeometry = new THREE.BoxGeometry(0.72, 0.92, 0.06);

  for (let floor = 0; floor < floors; floor += 1) {
    const y = 2.1 + floor * 2.75;
    for (let col = 0; col < colsX; col += 1) {
      const px = x - width * 0.36 + (col / Math.max(1, colsX - 1)) * width * 0.72;
      for (const side of [-1, 1]) {
        const windowMesh = new THREE.Mesh(windowGeometry, windowDay.clone());
        windowMesh.position.set(px, y, z + side * (depth / 2 + 0.04));
        windowMesh.castShadow = false;
        world.add(windowMesh);
        windows.push(windowMesh);
      }
    }
    for (let col = 0; col < colsZ; col += 1) {
      const pz = z - depth * 0.34 + (col / Math.max(1, colsZ - 1)) * depth * 0.68;
      for (const side of [-1, 1]) {
        const windowMesh = new THREE.Mesh(windowGeometry, windowDay.clone());
        windowMesh.rotation.y = Math.PI / 2;
        windowMesh.position.set(x + side * (width / 2 + 0.04), y, pz);
        windowMesh.castShadow = false;
        world.add(windowMesh);
        windows.push(windowMesh);
      }
    }
  }
}

buildingFootprints.forEach(([x, z, width, depth, height], index) => {
  const material = new THREE.MeshStandardMaterial({
    color: buildingColors[index % buildingColors.length],
    roughness: 0.72,
    metalness: 0.02,
  });
  const building = addBox([width, height, depth], [x, height / 2, z], material, true, true);
  building.name = `Building ${index + 1}`;

  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x343a40, roughness: 0.82 });
  addBox([width * 0.88, 0.36, depth * 0.88], [x, height + 0.2, z], roofMaterial, true, true);
  addWindows(x, z, width, depth, height);
});

const lampLights: THREE.PointLight[] = [];
const lampPositions = [
  [-9.6, -38], [9.6, -38], [-9.6, -24], [9.6, -24], [-9.6, -10], [9.6, -10],
  [-9.6, 10], [9.6, 10], [-9.6, 24], [9.6, 24], [-9.6, 38], [9.6, 38],
  [-38, -9.6], [-24, -9.6], [-10, -9.6], [10, -9.6], [24, -9.6], [38, -9.6],
  [-38, 9.6], [-24, 9.6], [-10, 9.6], [10, 9.6], [24, 9.6], [38, 9.6],
] as const;

lampPositions.forEach(([x, z]) => {
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 4.8, 12), lampPostMaterial);
  post.position.set(x, 2.4, z);
  post.castShadow = true;
  world.add(post);

  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), lampBulbMaterial.clone());
  bulb.position.set(x, 5.0, z);
  world.add(bulb);

  const light = new THREE.PointLight(0xffd88d, 0.25, 14, 2.1);
  light.position.set(x, 5, z);
  light.castShadow = false;
  world.add(light);
  lampLights.push(light);
});

const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(120, 32, 18),
  new THREE.MeshBasicMaterial({ color: 0xbfd8f0, side: THREE.BackSide }),
);
scene.add(skyDome);

let mode: Mode = 'day';

function setMode(nextMode: Mode) {
  mode = nextMode;
  toggle?.setAttribute('data-mode', mode);
  const isNight = mode === 'night';

  scene.background = new THREE.Color(isNight ? 0x07101f : 0xbfd8f0);
  scene.fog = new THREE.Fog(isNight ? 0x08111f : 0xbfd8f0, isNight ? 42 : 90, isNight ? 132 : 240);
  skyDome.material.color.set(isNight ? 0x07101f : 0xbfd8f0);
  ambient.intensity = isNight ? 0.34 : 1.5;
  ambient.color.set(isNight ? 0x334769 : 0xcfeaff);
  ambient.groundColor.set(isNight ? 0x171513 : 0x5b4b3b);
  sun.intensity = isNight ? 0.08 : 3.4;
  moon.intensity = isNight ? 1.45 : 0;
  renderer.toneMappingExposure = isNight ? 0.86 : 1;

  lampLights.forEach((light) => {
    light.intensity = isNight ? 1.95 : 0.25;
  });

  world.traverse((object) => {
    if (object instanceof THREE.Mesh && object.geometry instanceof THREE.SphereGeometry) {
      const material = object.material;
      if (material instanceof THREE.MeshStandardMaterial && material.emissive) {
        material.emissiveIntensity = isNight ? 1.45 : 0.2;
      }
    }
  });

  windows.forEach((windowMesh, index) => {
    const material = windowMesh.material;
    if (!(material instanceof THREE.MeshStandardMaterial)) return;

    if (isNight && index % 5 !== 0) {
      material.color.copy(windowNight.color);
      material.emissive.copy(windowNight.emissive);
      material.emissiveIntensity = index % 3 === 0 ? 0.95 : 0.55;
    } else {
      material.color.set(0x9fd0e9);
      material.emissive.set(0x123142);
      material.emissiveIntensity = 0.04;
    }
  });
}

toggle?.addEventListener('click', () => {
  setMode(mode === 'day' ? 'night' : 'day');
});

setMode('day');

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', resize);

function animate() {
  controls.update();
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
