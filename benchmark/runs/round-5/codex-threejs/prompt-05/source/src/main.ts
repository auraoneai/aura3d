import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";

type BarMesh = THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> & {
  userData: {
    currentHeight: number;
    targetHeight: number;
    baseColor: THREE.Color;
    gridX: number;
    gridZ: number;
  };
};

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app element");
}

app.innerHTML = `
  <div class="hud">
    <strong>6 x 6 Height Grid</strong>
    <span>Hover a bar to highlight it. Drag to orbit, scroll to zoom.</span>
  </div>
`;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x08111d);
scene.fog = new THREE.Fog(0x08111d, 20, 44);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(8.5, 9.2, 12);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.className = "label-layer";
app.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, labelRenderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.set(0, 2.2, 0);
controls.minDistance = 7;
controls.maxDistance = 28;
controls.maxPolarAngle = Math.PI * 0.48;

const ambientLight = new THREE.HemisphereLight(0xdcecff, 0x17202d, 2.4);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 3.5);
keyLight.position.set(8, 12, 7);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 35;
keyLight.shadow.camera.left = -12;
keyLight.shadow.camera.right = 12;
keyLight.shadow.camera.top = 12;
keyLight.shadow.camera.bottom = -12;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x6fc6ff, 1.2);
fillLight.position.set(-8, 6, -5);
scene.add(fillLight);

const gridSize = 6;
const spacing = 1.42;
const barWidth = 0.86;
const maxHeight = 5.8;
const minHeight = 0.55;
const bars: BarMesh[] = [];
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(4, 4);
const hoveredMaterialBoost = new THREE.Color(0xffffff);
let hoveredBar: BarMesh | null = null;
let nextRetargetTime = 0;

const base = new THREE.Mesh(
  new THREE.BoxGeometry(gridSize * spacing + 1.1, 0.18, gridSize * spacing + 1.1),
  new THREE.MeshStandardMaterial({
    color: 0x13202d,
    roughness: 0.72,
    metalness: 0.12,
  }),
);
base.position.y = -0.09;
base.receiveShadow = true;
scene.add(base);

const grid = new THREE.GridHelper(gridSize * spacing + 1.1, gridSize, 0x92a7bb, 0x294155);
grid.position.y = 0.02;
scene.add(grid);

const barGeometry = new THREE.BoxGeometry(barWidth, 1, barWidth);

for (let x = 0; x < gridSize; x += 1) {
  for (let z = 0; z < gridSize; z += 1) {
    const height = randomHeight();
    const material = new THREE.MeshStandardMaterial({
      color: colorForHeight(height),
      roughness: 0.45,
      metalness: 0.08,
      emissive: 0x000000,
    });
    const bar = new THREE.Mesh(barGeometry, material) as BarMesh;
    bar.castShadow = true;
    bar.receiveShadow = true;
    bar.position.set(gridToWorld(x), height / 2, gridToWorld(z));
    bar.scale.y = height;
    bar.userData.currentHeight = height;
    bar.userData.targetHeight = randomHeight();
    bar.userData.baseColor = material.color.clone();
    bar.userData.gridX = x + 1;
    bar.userData.gridZ = z + 1;
    bars.push(bar);
    scene.add(bar);
  }
}

addAxisLines();
addAxisLabels();

const tooltip = document.createElement("div");
tooltip.className = "tooltip";
tooltip.hidden = true;
app.appendChild(tooltip);

window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerleave", clearHover);
window.addEventListener("resize", onResize);

renderer.setAnimationLoop(animate);

function randomHeight(): number {
  return minHeight + Math.random() * (maxHeight - minHeight);
}

function gridToWorld(index: number): number {
  return (index - (gridSize - 1) / 2) * spacing;
}

function colorForHeight(height: number): THREE.Color {
  const normalized = THREE.MathUtils.clamp((height - minHeight) / (maxHeight - minHeight), 0, 1);
  const color = new THREE.Color();
  color.setHSL(0.58 - normalized * 0.5, 0.82, 0.48 + normalized * 0.12);
  return color;
}

function addAxisLines(): void {
  const axisMaterialX = new THREE.LineBasicMaterial({ color: 0xffd15c });
  const axisMaterialZ = new THREE.LineBasicMaterial({ color: 0x55d7ff });
  const axisMaterialY = new THREE.LineBasicMaterial({ color: 0xb6ff67 });
  const extent = gridToWorld(gridSize - 1) + 0.95;

  scene.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-extent, 0.12, -extent), new THREE.Vector3(extent, 0.12, -extent)]),
      axisMaterialX,
    ),
  );
  scene.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-extent, 0.12, -extent), new THREE.Vector3(-extent, 0.12, extent)]),
      axisMaterialZ,
    ),
  );
  scene.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-extent, 0.12, -extent), new THREE.Vector3(-extent, maxHeight + 0.8, -extent)]),
      axisMaterialY,
    ),
  );
}

function addAxisLabels(): void {
  const extent = gridToWorld(gridSize - 1) + 1.2;
  addLabel("X Axis", new THREE.Vector3(0, 0.38, -extent), "axis x-axis");
  addLabel("Z Axis", new THREE.Vector3(-extent, 0.38, 0), "axis z-axis");
  addLabel("Height", new THREE.Vector3(-extent, maxHeight + 1.0, -extent), "axis y-axis");

  for (let i = 0; i < gridSize; i += 1) {
    addLabel(`X${i + 1}`, new THREE.Vector3(gridToWorld(i), 0.34, -extent), "tick");
    addLabel(`Z${i + 1}`, new THREE.Vector3(-extent, 0.34, gridToWorld(i)), "tick");
  }

  for (let i = 1; i <= 5; i += 1) {
    const y = (i / 5) * maxHeight;
    addLabel(`${Math.round(y * 10) / 10}`, new THREE.Vector3(-extent, y, -extent), "tick height");
  }
}

function addLabel(text: string, position: THREE.Vector3, className: string): void {
  const element = document.createElement("div");
  element.className = `label ${className}`;
  element.textContent = text;
  const label = new CSS2DObject(element);
  label.position.copy(position);
  scene.add(label);
}

function onPointerMove(event: PointerEvent): void {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  tooltip.style.left = `${event.clientX + 14}px`;
  tooltip.style.top = `${event.clientY + 14}px`;
}

function clearHover(): void {
  pointer.set(4, 4);
  setHoveredBar(null);
}

function updateHover(): void {
  raycaster.setFromCamera(pointer, camera);
  const [hit] = raycaster.intersectObjects(bars, false);
  setHoveredBar((hit?.object as BarMesh | undefined) ?? null);
}

function setHoveredBar(nextBar: BarMesh | null): void {
  if (hoveredBar === nextBar) {
    return;
  }

  if (hoveredBar) {
    hoveredBar.material.emissive.setHex(0x000000);
    hoveredBar.material.color.copy(hoveredBar.userData.baseColor);
    hoveredBar.scale.x = 1;
    hoveredBar.scale.z = 1;
  }

  hoveredBar = nextBar;

  if (!hoveredBar) {
    tooltip.hidden = true;
    return;
  }

  hoveredBar.material.color.copy(hoveredBar.userData.baseColor).lerp(hoveredMaterialBoost, 0.35);
  hoveredBar.material.emissive.setHex(0x2a1600);
  hoveredBar.scale.x = 1.1;
  hoveredBar.scale.z = 1.1;
  tooltip.hidden = false;
  tooltip.textContent = `X${hoveredBar.userData.gridX}, Z${hoveredBar.userData.gridZ}: ${hoveredBar.userData.currentHeight.toFixed(1)}`;
}

function retargetBars(): void {
  for (const bar of bars) {
    bar.userData.targetHeight = randomHeight();
  }
}

function animate(time: number): void {
  if (time > nextRetargetTime) {
    retargetBars();
    nextRetargetTime = time + 2600;
  }

  for (const bar of bars) {
    const nextHeight = THREE.MathUtils.lerp(bar.userData.currentHeight, bar.userData.targetHeight, 0.025);
    bar.userData.currentHeight = nextHeight;
    bar.scale.y = nextHeight;
    bar.position.y = nextHeight / 2;
    bar.userData.baseColor.copy(colorForHeight(nextHeight));

    if (bar !== hoveredBar) {
      bar.material.color.copy(bar.userData.baseColor);
      bar.material.emissive.setHex(0x000000);
    }
  }

  updateHover();
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

function onResize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
}
