import * as THREE from "three";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root element");
}

const style = document.createElement("style");
style.textContent = `
  html, body, #app {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #8fc8ff;
  }

  .viewport {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .mode-toggle {
    position: absolute;
    top: 18px;
    left: 18px;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 42px;
    padding: 8px 12px;
    color: #172033;
    background: rgba(255, 255, 255, 0.88);
    border: 1px solid rgba(31, 45, 70, 0.22);
    border-radius: 8px;
    box-shadow: 0 10px 30px rgba(18, 29, 45, 0.18);
    backdrop-filter: blur(10px);
    font-size: 14px;
    font-weight: 700;
  }

  .mode-toggle input {
    width: 20px;
    height: 20px;
    accent-color: #1d6fbd;
    cursor: pointer;
  }

  .mode-toggle span {
    line-height: 1;
    white-space: nowrap;
  }

  canvas {
    display: block;
  }
`;
document.head.appendChild(style);

root.innerHTML = `
  <main class="viewport">
    <label class="mode-toggle">
      <input id="night-toggle" type="checkbox" aria-label="Toggle night mode" />
      <span id="mode-label">Day mode</span>
    </label>
  </main>
`;

const viewport = root.querySelector<HTMLElement>(".viewport");
const toggle = root.querySelector<HTMLInputElement>("#night-toggle");
const modeLabel = root.querySelector<HTMLElement>("#mode-label");

if (!viewport || !toggle || !modeLabel) {
  throw new Error("Failed to create UI controls");
}

const viewportElement = viewport;
const toggleElement = toggle;
const modeLabelElement = modeLabel;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc8ff);
scene.fog = new THREE.Fog(0x8fc8ff, 65, 160);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 260);
camera.position.set(48, 42, 72);
camera.lookAt(0, 8, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
viewportElement.appendChild(renderer.domElement);

const ambientLight = new THREE.HemisphereLight(0xbcdfff, 0x47505c, 2.2);
scene.add(ambientLight);

const sun = new THREE.DirectionalLight(0xfff1c5, 3.8);
sun.position.set(44, 74, 26);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 150;
sun.shadow.camera.left = -80;
sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80;
sun.shadow.camera.bottom = -80;
scene.add(sun);

const moon = new THREE.DirectionalLight(0xaec8ff, 0);
moon.position.set(-28, 62, -48);
scene.add(moon);

const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x657044, roughness: 0.9 });
const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x252b31, roughness: 0.85 });
const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xf3d45f });
const curbMaterial = new THREE.MeshStandardMaterial({ color: 0xb8bec1, roughness: 0.75 });

const ground = new THREE.Mesh(new THREE.PlaneGeometry(135, 105), groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

function addBox(
  width: number,
  height: number,
  depth: number,
  position: THREE.Vector3,
  material: THREE.Material,
  receiveShadow = true,
  castShadow = false,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.copy(position);
  mesh.receiveShadow = receiveShadow;
  mesh.castShadow = castShadow;
  scene.add(mesh);
  return mesh;
}

function addRoads() {
  addBox(18, 0.08, 104, new THREE.Vector3(0, 0.04, 0), roadMaterial, true);
  addBox(132, 0.09, 16, new THREE.Vector3(0, 0.05, 0), roadMaterial, true);
  addBox(132, 0.1, 10, new THREE.Vector3(0, 0.06, -42), roadMaterial, true);
  addBox(132, 0.1, 10, new THREE.Vector3(0, 0.06, 42), roadMaterial, true);

  for (let z = -48; z <= 48; z += 12) {
    addBox(1.1, 0.13, 5.8, new THREE.Vector3(0, 0.14, z), lineMaterial);
  }

  for (let x = -58; x <= 58; x += 12) {
    addBox(5.8, 0.14, 0.8, new THREE.Vector3(x, 0.15, 0), lineMaterial);
    addBox(5.8, 0.14, 0.8, new THREE.Vector3(x, 0.15, -42), lineMaterial);
    addBox(5.8, 0.14, 0.8, new THREE.Vector3(x, 0.15, 42), lineMaterial);
  }

  addBox(2, 0.18, 104, new THREE.Vector3(-10, 0.14, 0), curbMaterial);
  addBox(2, 0.18, 104, new THREE.Vector3(10, 0.14, 0), curbMaterial);
  for (const z of [-50, -34, -8, 8, 34, 50]) {
    addBox(132, 0.18, 1.7, new THREE.Vector3(0, 0.16, z), curbMaterial);
  }
}

addRoads();

const buildingPalette = [0x87909b, 0x9a826e, 0x6f8492, 0x8e8f83, 0x746f84, 0x9b9b94];
const windowDay = new THREE.MeshStandardMaterial({
  color: 0xa9d4ee,
  emissive: 0x10253c,
  emissiveIntensity: 0.04,
  roughness: 0.22,
  metalness: 0.15,
});
const windowNight = {
  color: new THREE.Color(0xffd879),
  emissive: new THREE.Color(0xffbf47),
};
const windowMeshes: THREE.Mesh[] = [];

const buildingPositions = [
  [-50, -28], [-34, -28], [-18, -28], [20, -28], [36, -28],
  [-50, -13], [-34, -13], [-18, -13], [20, -13], [36, -13],
  [-50, 18], [-34, 18], [-18, 18], [20, 18], [36, 18],
  [-50, 34], [-34, 34], [-18, 34], [20, 34], [36, 34],
];
const heights = [16, 31, 23, 41, 19, 27, 13, 36, 24, 33, 21, 45, 29, 15, 38, 34, 18, 27, 48, 22];

function addWindowsOnFace(
  group: THREE.Group,
  width: number,
  height: number,
  depth: number,
  direction: "front" | "back" | "left" | "right",
  offset: number,
) {
  const faceWidth = direction === "front" || direction === "back" ? width : depth;
  const columns = Math.max(2, Math.floor(faceWidth / 2.6));
  const rows = Math.max(2, Math.floor(height / 4.2));
  const windowWidth = Math.min(1.15, faceWidth / (columns * 1.75));
  const windowHeight = 1.25;
  const yStart = 2.8;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      if ((row + col + Math.floor(height)) % 5 === 0) continue;

      const xOnFace = -faceWidth / 2 + ((col + 1) * faceWidth) / (columns + 1);
      const y = yStart + row * 3.6;
      if (y > height - 1.8) continue;

      const pane = new THREE.Mesh(new THREE.PlaneGeometry(windowWidth, windowHeight), windowDay.clone());
      pane.castShadow = false;
      pane.receiveShadow = false;

      if (direction === "front" || direction === "back") {
        pane.position.set(xOnFace, y, (direction === "front" ? depth / 2 : -depth / 2) + offset);
        if (direction === "back") pane.rotation.y = Math.PI;
      } else {
        pane.position.set((direction === "right" ? width / 2 : -width / 2) + offset, y, xOnFace);
        pane.rotation.y = direction === "right" ? Math.PI / 2 : -Math.PI / 2;
      }

      group.add(pane);
      windowMeshes.push(pane);
    }
  }
}

function addBuilding(index: number, x: number, z: number, height: number) {
  const width = 8 + (index % 3) * 1.4;
  const depth = 8 + ((index + 1) % 3) * 1.3;
  const material = new THREE.MeshStandardMaterial({
    color: buildingPalette[index % buildingPalette.length],
    roughness: 0.72,
    metalness: 0.05,
  });
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const tower = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  tower.position.y = height / 2;
  tower.castShadow = true;
  tower.receiveShadow = true;
  group.add(tower);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.8, 0.6, depth + 0.8),
    new THREE.MeshStandardMaterial({ color: 0x34383f, roughness: 0.8 }),
  );
  roof.position.y = height + 0.3;
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  addWindowsOnFace(group, width, height, depth, "front", 0.035);
  addWindowsOnFace(group, width, height, depth, "back", -0.035);
  addWindowsOnFace(group, width, height, depth, "left", -0.035);
  addWindowsOnFace(group, width, height, depth, "right", 0.035);

  scene.add(group);
}

buildingPositions.forEach(([x, z], index) => addBuilding(index, x, z, heights[index]));

const streetLightBulbs: THREE.Mesh[] = [];
const streetLightPoints: THREE.PointLight[] = [];
const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x1f2429, roughness: 0.55, metalness: 0.65 });
const bulbDayMaterial = new THREE.MeshStandardMaterial({
  color: 0xf6f2d6,
  emissive: 0xffda79,
  emissiveIntensity: 0.12,
});

function addStreetLight(x: number, z: number, rotation = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 7, 16), poleMaterial);
  pole.position.y = 3.5;
  pole.castShadow = true;
  group.add(pole);

  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.5, 12), poleMaterial);
  arm.position.set(1.05, 6.85, 0);
  arm.rotation.z = Math.PI / 2;
  arm.castShadow = true;
  group.add(arm);

  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.38, 18, 12), bulbDayMaterial.clone());
  bulb.position.set(2.22, 6.85, 0);
  group.add(bulb);
  streetLightBulbs.push(bulb);

  const point = new THREE.PointLight(0xffc765, 0.15, 18, 1.9);
  point.position.copy(bulb.position);
  point.castShadow = false;
  group.add(point);
  streetLightPoints.push(point);

  scene.add(group);
}

for (const z of [-42, -24, -8, 8, 24, 42]) {
  addStreetLight(-12.8, z, 0);
  addStreetLight(12.8, z, Math.PI);
}

for (const x of [-55, -35, -15, 15, 35, 55]) {
  addStreetLight(x, -8.8, Math.PI / 2);
  addStreetLight(x, 8.8, -Math.PI / 2);
}

const skyDomeMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: {
    topColor: { value: new THREE.Color(0x5da4e4) },
    bottomColor: { value: new THREE.Color(0xeaf6ff) },
  },
  vertexShader: `
    varying vec3 vWorldPosition;
    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vWorldPosition;
    uniform vec3 topColor;
    uniform vec3 bottomColor;
    void main() {
      float h = normalize(vWorldPosition).y * 0.5 + 0.5;
      gl_FragColor = vec4(mix(bottomColor, topColor, smoothstep(0.0, 1.0, h)), 1.0);
    }
  `,
});
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), skyDomeMaterial);
scene.add(skyDome);

const sunDisc = new THREE.Mesh(
  new THREE.SphereGeometry(4.2, 32, 16),
  new THREE.MeshBasicMaterial({ color: 0xfff3a1 }),
);
sunDisc.position.set(62, 66, -70);
scene.add(sunDisc);

const moonDisc = new THREE.Mesh(
  new THREE.SphereGeometry(3.6, 32, 16),
  new THREE.MeshBasicMaterial({ color: 0xd8e5ff }),
);
moonDisc.position.set(-58, 58, -74);
moonDisc.visible = false;
scene.add(moonDisc);

function setNightMode(isNight: boolean) {
  modeLabelElement.textContent = isNight ? "Night mode" : "Day mode";

  const skyTop = isNight ? 0x081529 : 0x5da4e4;
  const skyBottom = isNight ? 0x1a2645 : 0xeaf6ff;
  skyDomeMaterial.uniforms.topColor.value.setHex(skyTop);
  skyDomeMaterial.uniforms.bottomColor.value.setHex(skyBottom);
  scene.background = new THREE.Color(isNight ? 0x091326 : 0x8fc8ff);
  scene.fog = new THREE.Fog(isNight ? 0x091326 : 0x8fc8ff, isNight ? 45 : 65, isNight ? 130 : 160);

  ambientLight.color.setHex(isNight ? 0x283a61 : 0xbcdfff);
  ambientLight.groundColor.setHex(isNight ? 0x10141c : 0x47505c);
  ambientLight.intensity = isNight ? 0.55 : 2.2;
  sun.intensity = isNight ? 0 : 3.8;
  moon.intensity = isNight ? 1.45 : 0;
  renderer.toneMappingExposure = isNight ? 0.92 : 1.05;

  sunDisc.visible = !isNight;
  moonDisc.visible = isNight;

  windowMeshes.forEach((mesh, index) => {
    const material = mesh.material as THREE.MeshStandardMaterial;
    if (isNight) {
      const lit = index % 4 !== 0;
      material.color.copy(lit ? windowNight.color : new THREE.Color(0x263246));
      material.emissive.copy(lit ? windowNight.emissive : new THREE.Color(0x020510));
      material.emissiveIntensity = lit ? 1.55 : 0.08;
    } else {
      material.color.setHex(0xa9d4ee);
      material.emissive.setHex(0x10253c);
      material.emissiveIntensity = 0.04;
    }
  });

  streetLightBulbs.forEach((bulb) => {
    const material = bulb.material as THREE.MeshStandardMaterial;
    material.color.setHex(isNight ? 0xfff0b2 : 0xf6f2d6);
    material.emissive.setHex(0xffc45a);
    material.emissiveIntensity = isNight ? 2.4 : 0.12;
  });

  streetLightPoints.forEach((light) => {
    light.intensity = isNight ? 2.8 : 0.15;
  });
}

toggleElement.addEventListener("change", () => setNightMode(toggleElement.checked));
setNightMode(false);

const target = new THREE.Vector3(0, 8, 0);
let yaw = Math.atan2(camera.position.x, camera.position.z);
const radius = Math.hypot(camera.position.x, camera.position.z);

function animate(time: number) {
  yaw += 0.00012;
  camera.position.x = Math.sin(yaw) * radius;
  camera.position.z = Math.cos(yaw) * radius;
  camera.position.y = 42 + Math.sin(time * 0.00035) * 2;
  camera.lookAt(target);
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
