import "./style.css";
import * as THREE from "three";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root");
}

app.innerHTML = `
  <div class="hud">
    <label class="toggle">
      <input id="time-toggle" type="checkbox" />
      <span class="track"><span class="thumb"></span></span>
      <span class="label">Night mode</span>
    </label>
    <div class="readout">Procedural city block • 20 buildings</div>
  </div>
`;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ec5ff);
scene.fog = new THREE.Fog(0x8ec5ff, 70, 150);

const camera = new THREE.PerspectiveCamera(
  52,
  window.innerWidth / window.innerHeight,
  0.1,
  220,
);
camera.position.set(42, 38, 52);
camera.lookAt(0, 7, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const city = new THREE.Group();
scene.add(city);

const daySun = new THREE.DirectionalLight(0xfff2d0, 3.2);
daySun.position.set(-34, 58, 26);
daySun.castShadow = true;
daySun.shadow.mapSize.set(2048, 2048);
daySun.shadow.camera.left = -60;
daySun.shadow.camera.right = 60;
daySun.shadow.camera.top = 60;
daySun.shadow.camera.bottom = -60;
scene.add(daySun);

const ambient = new THREE.HemisphereLight(0xd9ecff, 0x5c6470, 1.8);
scene.add(ambient);

const moon = new THREE.DirectionalLight(0x8fb7ff, 0.9);
moon.position.set(35, 46, -30);
scene.add(moon);

const roadMaterial = new THREE.MeshStandardMaterial({
  color: 0x252a2f,
  roughness: 0.82,
  metalness: 0.02,
});
const sidewalkMaterial = new THREE.MeshStandardMaterial({
  color: 0x868a8f,
  roughness: 0.76,
});
const stripeMaterial = new THREE.MeshStandardMaterial({
  color: 0xf4d85f,
  roughness: 0.48,
  emissive: 0x000000,
});
const curbMaterial = new THREE.MeshStandardMaterial({ color: 0xc2c6c8, roughness: 0.62 });
const windowDayMaterial = new THREE.MeshStandardMaterial({
  color: 0xb9dcff,
  emissive: 0x102744,
  emissiveIntensity: 0.08,
  roughness: 0.18,
});
const windowNightMaterial = new THREE.MeshStandardMaterial({
  color: 0xffdf87,
  emissive: 0xffb32b,
  emissiveIntensity: 1.45,
  roughness: 0.22,
});

const buildingPalette = [0x53606c, 0x68727a, 0x465260, 0x748086, 0x5c6370];
const buildingMaterials = buildingPalette.map(
  (color) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.64,
      metalness: 0.03,
    }),
);

const ground = new THREE.Mesh(
  new THREE.BoxGeometry(86, 0.35, 72),
  new THREE.MeshStandardMaterial({ color: 0x4f7552, roughness: 0.9 }),
);
ground.position.y = -0.2;
ground.receiveShadow = true;
city.add(ground);

function addBox(width: number, height: number, depth: number, x: number, y: number, z: number, material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  city.add(mesh);
  return mesh;
}

addBox(84, 0.08, 7.5, 0, 0.03, 0, roadMaterial);
addBox(8.5, 0.09, 70, 0, 0.04, 0, roadMaterial);

for (const z of [-28, -20, -12, 12, 20, 28]) {
  addBox(2.6, 0.11, 0.18, -2, 0.12, z, stripeMaterial);
  addBox(2.6, 0.11, 0.18, 2, 0.12, z, stripeMaterial);
}
for (const x of [-34, -26, -18, -10, 10, 18, 26, 34]) {
  addBox(0.18, 0.11, 2.7, x, 0.13, -2, stripeMaterial);
  addBox(0.18, 0.11, 2.7, x, 0.13, 2, stripeMaterial);
}

addBox(84, 0.18, 1.4, 0, 0.12, -4.55, curbMaterial);
addBox(84, 0.18, 1.4, 0, 0.12, 4.55, curbMaterial);
addBox(1.4, 0.18, 70, -5.05, 0.12, 0, curbMaterial);
addBox(1.4, 0.18, 70, 5.05, 0.12, 0, curbMaterial);

for (const x of [-30, -20, -10, 10, 20, 30]) {
  addBox(6.2, 0.1, 2.2, x, 0.15, -5.85, sidewalkMaterial);
  addBox(6.2, 0.1, 2.2, x, 0.15, 5.85, sidewalkMaterial);
}
for (const z of [-28, -18, -8, 8, 18, 28]) {
  addBox(2.2, 0.1, 6.2, -6.45, 0.15, z, sidewalkMaterial);
  addBox(2.2, 0.1, 6.2, 6.45, 0.15, z, sidewalkMaterial);
}

const windowGeometry = new THREE.PlaneGeometry(0.72, 0.82);
const windows: THREE.Mesh[] = [];

function addWindow(x: number, y: number, z: number, rotationY: number) {
  const mesh = new THREE.Mesh(windowGeometry, windowDayMaterial);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotationY;
  windows.push(mesh);
  city.add(mesh);
}

const buildingPositions = [
  [-33, -25],
  [-23, -25],
  [-13, -25],
  [13, -25],
  [24, -25],
  [-33, -14],
  [-22, -14],
  [-12, -14],
  [13, -14],
  [25, -14],
  [-33, 14],
  [-23, 14],
  [-13, 14],
  [13, 14],
  [24, 14],
  [-33, 26],
  [-22, 26],
  [-12, 26],
  [13, 26],
  [25, 26],
] as const;

buildingPositions.forEach(([x, z], index) => {
  const width = 5.2 + ((index * 11) % 4) * 0.9;
  const depth = 5.4 + ((index * 7) % 5) * 0.75;
  const height = 6 + ((index * 13) % 11) * 1.65;
  const building = addBox(width, height, depth, x, height / 2, z, buildingMaterials[index % buildingMaterials.length]);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.35, 0.45, depth + 0.35),
    new THREE.MeshStandardMaterial({ color: 0x2f353b, roughness: 0.72 }),
  );
  roof.position.set(x, height + 0.23, z);
  roof.castShadow = true;
  roof.receiveShadow = true;
  city.add(roof);

  const floors = Math.max(2, Math.floor(height / 2.2));
  const columns = Math.max(2, Math.floor(width / 1.55));
  const sideColumns = Math.max(2, Math.floor(depth / 1.75));

  for (let floor = 0; floor < floors; floor += 1) {
    const y = 1.45 + floor * 1.75;
    if (y > height - 0.75) continue;

    for (let col = 0; col < columns; col += 1) {
      const offset = (col - (columns - 1) / 2) * 1.25;
      if ((index + floor + col) % 5 !== 0) {
        addWindow(x + offset, y, z + depth / 2 + 0.015, 0);
      }
      if ((index + floor + col) % 4 !== 0) {
        addWindow(x + offset, y, z - depth / 2 - 0.015, Math.PI);
      }
    }

    for (let col = 0; col < sideColumns; col += 1) {
      const offset = (col - (sideColumns - 1) / 2) * 1.35;
      if ((index + floor + col) % 3 !== 0) {
        addWindow(x + width / 2 + 0.015, y, z + offset, Math.PI / 2);
      }
      if ((index + floor + col) % 4 !== 1) {
        addWindow(x - width / 2 - 0.015, y, z + offset, -Math.PI / 2);
      }
    }
  }

  building.userData.height = height;
});

const streetLights: THREE.PointLight[] = [];
const lampPostMaterial = new THREE.MeshStandardMaterial({ color: 0x1d2328, roughness: 0.45, metalness: 0.55 });
const lampBulbDay = new THREE.MeshStandardMaterial({
  color: 0xffefbd,
  emissive: 0xffd879,
  emissiveIntensity: 0.25,
});
const lampBulbNight = new THREE.MeshStandardMaterial({
  color: 0xfff0bc,
  emissive: 0xffcf6a,
  emissiveIntensity: 2.4,
});
const postGeometry = new THREE.CylinderGeometry(0.12, 0.16, 4.1, 12);
const bulbGeometry = new THREE.SphereGeometry(0.42, 16, 12);

function addStreetLight(x: number, z: number) {
  const post = new THREE.Mesh(postGeometry, lampPostMaterial);
  post.position.set(x, 2.05, z);
  post.castShadow = true;
  city.add(post);

  const bulb = new THREE.Mesh(bulbGeometry, lampBulbDay);
  bulb.position.set(x, 4.32, z);
  city.add(bulb);

  const glow = new THREE.PointLight(0xffca68, 0.25, 15, 1.9);
  glow.position.copy(bulb.position);
  streetLights.push(glow);
  scene.add(glow);
}

for (const x of [-36, -24, -12, 12, 24, 36]) {
  addStreetLight(x, -5.9);
  addStreetLight(x, 5.9);
}
for (const z of [-30, -18, -8, 8, 18, 30]) {
  addStreetLight(-6.5, z);
  addStreetLight(6.5, z);
}

const sunDisc = new THREE.Mesh(
  new THREE.SphereGeometry(3.2, 32, 16),
  new THREE.MeshBasicMaterial({ color: 0xfff4b0 }),
);
sunDisc.position.set(-36, 44, -40);
scene.add(sunDisc);

const moonDisc = new THREE.Mesh(
  new THREE.SphereGeometry(2.4, 32, 16),
  new THREE.MeshBasicMaterial({ color: 0xdce8ff }),
);
moonDisc.position.set(38, 38, -38);
moonDisc.visible = false;
scene.add(moonDisc);

const stars = new THREE.Group();
const starMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
const starGeometry = new THREE.SphereGeometry(0.12, 8, 6);
for (let i = 0; i < 70; i += 1) {
  const star = new THREE.Mesh(starGeometry, starMaterial);
  const angle = i * 2.399963;
  const radius = 42 + (i % 9) * 4;
  star.position.set(Math.cos(angle) * radius, 26 + (i % 7) * 3.4, Math.sin(angle) * radius - 20);
  stars.add(star);
}
stars.visible = false;
scene.add(stars);

function setNightMode(isNight: boolean) {
  scene.background = new THREE.Color(isNight ? 0x07111f : 0x8ec5ff);
  scene.fog = new THREE.Fog(isNight ? 0x07111f : 0x8ec5ff, isNight ? 58 : 70, isNight ? 132 : 150);
  daySun.intensity = isNight ? 0.08 : 3.2;
  ambient.intensity = isNight ? 0.42 : 1.8;
  moon.intensity = isNight ? 1.25 : 0.18;
  sunDisc.visible = !isNight;
  moonDisc.visible = isNight;
  stars.visible = isNight;

  for (const windowMesh of windows) {
    windowMesh.material = isNight ? windowNightMaterial : windowDayMaterial;
  }
  for (const light of streetLights) {
    light.intensity = isNight ? 2.15 : 0.25;
  }
  lampBulbDay.emissiveIntensity = isNight ? 2.4 : 0.25;
  stripeMaterial.emissive.set(isNight ? 0x231900 : 0x000000);
}

document.querySelector<HTMLInputElement>("#time-toggle")?.addEventListener("change", (event) => {
  setNightMode((event.target as HTMLInputElement).checked);
});

const clock = new THREE.Clock();

function animate() {
  const elapsed = clock.getElapsedTime();
  city.rotation.y = Math.sin(elapsed * 0.08) * 0.015;
  stars.rotation.y = elapsed * 0.015;
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

setNightMode(false);
