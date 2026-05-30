import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

type BarRecord = {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  currentHeight: number;
  targetHeight: number;
  phase: number;
};

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app mount point');
}

const GRID_SIZE = 6;
const CELL_SIZE = 1.15;
const MIN_HEIGHT = 0.45;
const MAX_HEIGHT = 5.8;
const HALF_GRID = ((GRID_SIZE - 1) * CELL_SIZE) / 2;
const bars: BarRecord[] = [];

let hoveredBar: BarRecord | null = null;

const pointer = new THREE.Vector2(10, 10);
const raycaster = new THREE.Raycaster();

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.background = '#111318';
document.body.style.fontFamily =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

app.style.position = 'fixed';
app.style.inset = '0';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x12151c);

const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(7.8, 8.2, 9.8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'fixed';
labelRenderer.domElement.style.inset = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
app.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 2.1, 0);
controls.minDistance = 8;
controls.maxDistance = 22;
controls.maxPolarAngle = Math.PI * 0.47;

const ambientLight = new THREE.HemisphereLight(0xd7e8ff, 0x283040, 2.2);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
keyLight.position.set(5, 9, 4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 30;
keyLight.shadow.camera.left = -8;
keyLight.shadow.camera.right = 8;
keyLight.shadow.camera.top = 8;
keyLight.shadow.camera.bottom = -8;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x74b7ff, 1.4);
fillLight.position.set(-6, 5, -5);
scene.add(fillLight);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(10.5, 10.5),
  new THREE.MeshStandardMaterial({
    color: 0x1a1e27,
    roughness: 0.74,
    metalness: 0.08,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.01;
floor.receiveShadow = true;
scene.add(floor);

const gridHelper = new THREE.GridHelper(8.3, GRID_SIZE, 0x617189, 0x303947);
gridHelper.position.y = 0.006;
scene.add(gridHelper);

const axisMaterial = new THREE.LineBasicMaterial({ color: 0xdbe7ff });
const axisGeometry = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(-HALF_GRID - 0.65, 0.03, HALF_GRID + 0.7),
  new THREE.Vector3(HALF_GRID + 0.85, 0.03, HALF_GRID + 0.7),
  new THREE.Vector3(-HALF_GRID - 0.65, 0.03, HALF_GRID + 0.7),
  new THREE.Vector3(-HALF_GRID - 0.65, 0.03, -HALF_GRID - 0.85),
  new THREE.Vector3(-HALF_GRID - 0.65, 0.03, HALF_GRID + 0.7),
  new THREE.Vector3(-HALF_GRID - 0.65, MAX_HEIGHT + 0.5, HALF_GRID + 0.7),
]);
scene.add(new THREE.LineSegments(axisGeometry, axisMaterial));

function randomHeight(): number {
  return MIN_HEIGHT + Math.random() * (MAX_HEIGHT - MIN_HEIGHT);
}

function colorForHeight(height: number, boosted = false): THREE.Color {
  const normalized = THREE.MathUtils.clamp((height - MIN_HEIGHT) / (MAX_HEIGHT - MIN_HEIGHT), 0, 1);
  const color = new THREE.Color();
  color.setHSL(0.58 - normalized * 0.52, 0.78, boosted ? 0.68 : 0.5);
  return color;
}

function makeLabel(text: string, className = 'axis-label'): CSS2DObject {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
  return new CSS2DObject(element);
}

const style = document.createElement('style');
style.textContent = `
  .axis-label,
  .tick-label,
  .title-label {
    color: #f3f7ff;
    font-weight: 700;
    line-height: 1;
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.9), 0 0 2px #000;
    white-space: nowrap;
    user-select: none;
  }

  .axis-label {
    font-size: 15px;
    letter-spacing: 0;
  }

  .tick-label {
    color: #c8d3e7;
    font-size: 12px;
    font-weight: 650;
  }

  .title-label {
    color: #ffffff;
    font-size: 19px;
    font-weight: 800;
  }
`;
document.head.appendChild(style);

const title = makeLabel('Animated 6 x 6 Data Grid', 'title-label');
title.position.set(0, MAX_HEIGHT + 1.15, 0);
scene.add(title);

const xLabel = makeLabel('X Category');
xLabel.position.set(0, 0.25, HALF_GRID + 1.45);
scene.add(xLabel);

const zLabel = makeLabel('Z Category');
zLabel.position.set(-HALF_GRID - 1.55, 0.25, 0);
scene.add(zLabel);

const yLabel = makeLabel('Value / Height');
yLabel.position.set(-HALF_GRID - 1.05, MAX_HEIGHT + 0.75, HALF_GRID + 0.75);
scene.add(yLabel);

for (let i = 0; i < GRID_SIZE; i += 1) {
  const xTick = makeLabel(String(i + 1), 'tick-label');
  xTick.position.set(i * CELL_SIZE - HALF_GRID, 0.2, HALF_GRID + 0.85);
  scene.add(xTick);

  const zTick = makeLabel(String(i + 1), 'tick-label');
  zTick.position.set(-HALF_GRID - 0.85, 0.2, i * CELL_SIZE - HALF_GRID);
  scene.add(zTick);
}

for (let y = 0; y <= 6; y += 2) {
  const tick = makeLabel(String(y), 'tick-label');
  tick.position.set(-HALF_GRID - 0.85, y, HALF_GRID + 0.85);
  scene.add(tick);
}

const barGeometry = new THREE.BoxGeometry(0.72, 1, 0.72);

for (let z = 0; z < GRID_SIZE; z += 1) {
  for (let x = 0; x < GRID_SIZE; x += 1) {
    const height = randomHeight();
    const material = new THREE.MeshStandardMaterial({
      color: colorForHeight(height),
      roughness: 0.43,
      metalness: 0.16,
      emissive: new THREE.Color(0x000000),
    });
    const mesh = new THREE.Mesh(barGeometry, material);
    mesh.position.set(x * CELL_SIZE - HALF_GRID, height / 2, z * CELL_SIZE - HALF_GRID);
    mesh.scale.y = height;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    bars.push({
      mesh,
      currentHeight: height,
      targetHeight: randomHeight(),
      phase: Math.random() * Math.PI * 2,
    });
  }
}

const hoverRing = new THREE.Mesh(
  new THREE.RingGeometry(0.5, 0.62, 40),
  new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
  }),
);
hoverRing.rotation.x = -Math.PI / 2;
hoverRing.position.y = 0.035;
scene.add(hoverRing);

function applyHover(nextHovered: BarRecord | null): void {
  if (hoveredBar === nextHovered) {
    return;
  }

  if (hoveredBar) {
    hoveredBar.mesh.material.emissive.set(0x000000);
    hoveredBar.mesh.material.color.copy(colorForHeight(hoveredBar.currentHeight));
  }

  hoveredBar = nextHovered;

  if (hoveredBar) {
    hoveredBar.mesh.material.emissive.set(0x264f78);
    hoveredBar.mesh.material.color.copy(colorForHeight(hoveredBar.currentHeight, true));
    hoverRing.position.x = hoveredBar.mesh.position.x;
    hoverRing.position.z = hoveredBar.mesh.position.z;
    hoverRing.material.opacity = 0.9;
  } else {
    hoverRing.material.opacity = 0;
  }
}

function updatePointer(event: PointerEvent): void {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function clearPointer(): void {
  pointer.set(10, 10);
}

window.addEventListener('pointermove', updatePointer);
window.addEventListener('pointerleave', clearPointer);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

function animate(timeMs: number): void {
  const time = timeMs * 0.001;

  for (const bar of bars) {
    if (Math.abs(bar.currentHeight - bar.targetHeight) < 0.035) {
      bar.targetHeight = randomHeight();
    }

    const wobble = Math.sin(time * 0.8 + bar.phase) * 0.12;
    bar.currentHeight = THREE.MathUtils.lerp(bar.currentHeight, bar.targetHeight + wobble, 0.018);
    bar.currentHeight = THREE.MathUtils.clamp(bar.currentHeight, MIN_HEIGHT, MAX_HEIGHT);
    bar.mesh.scale.y = bar.currentHeight;
    bar.mesh.position.y = bar.currentHeight / 2;
    bar.mesh.material.color.copy(colorForHeight(bar.currentHeight, hoveredBar === bar));
  }

  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObjects(
    bars.map((bar) => bar.mesh),
    false,
  );
  const nextHoveredMesh = intersections[0]?.object;
  applyHover(bars.find((bar) => bar.mesh === nextHoveredMesh) ?? null);

  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
