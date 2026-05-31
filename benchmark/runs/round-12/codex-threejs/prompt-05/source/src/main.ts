import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app element');
}

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.background = '#101217';
app.style.width = '100vw';
app.style.height = '100vh';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101217);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(8, 8, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'fixed';
labelRenderer.domElement.style.inset = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
app.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1.8, 0);
controls.minDistance = 7;
controls.maxDistance = 22;
controls.maxPolarAngle = Math.PI * 0.48;

scene.add(new THREE.HemisphereLight(0xd8e7ff, 0x1b1a22, 2.0));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(6, 9, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x8fd3ff, 1.0);
fillLight.position.set(-7, 5, -4);
scene.add(fillLight);

const gridSize = 6;
const spacing = 1.16;
const maxHeight = 5.8;
const minHeight = 0.45;
const halfSpan = ((gridSize - 1) * spacing) / 2;
const barGeometry = new THREE.BoxGeometry(0.72, 1, 0.72);
const bars: Array<{
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  current: number;
  start: number;
  target: number;
}> = [];

const lowColor = new THREE.Color('#23b3ff');
const midColor = new THREE.Color('#ffe45c');
const highColor = new THREE.Color('#ff4f6a');
const hoverColor = new THREE.Color('#ffffff');

function randomHeight(): number {
  return THREE.MathUtils.randFloat(minHeight, maxHeight);
}

function colorForHeight(height: number): THREE.Color {
  const normalized = THREE.MathUtils.clamp((height - minHeight) / (maxHeight - minHeight), 0, 1);
  if (normalized < 0.5) {
    return lowColor.clone().lerp(midColor, normalized * 2);
  }
  return midColor.clone().lerp(highColor, (normalized - 0.5) * 2);
}

function makeLabel(text: string, position: THREE.Vector3, className = 'axis-label'): CSS2DObject {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
  const label = new CSS2DObject(element);
  label.position.copy(position);
  return label;
}

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(9.5, 9.5),
  new THREE.MeshStandardMaterial({ color: 0x191d24, roughness: 0.85, metalness: 0.05 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const gridHelper = new THREE.GridHelper((gridSize - 1) * spacing + 1.2, gridSize, 0x60718a, 0x2b3440);
gridHelper.position.y = 0.012;
scene.add(gridHelper);

for (let x = 0; x < gridSize; x += 1) {
  for (let z = 0; z < gridSize; z += 1) {
    const start = randomHeight();
    const target = randomHeight();
    const material = new THREE.MeshStandardMaterial({
      color: colorForHeight(start),
      roughness: 0.48,
      metalness: 0.08,
      emissive: 0x000000,
    });
    const mesh = new THREE.Mesh(barGeometry, material);
    mesh.position.set(x * spacing - halfSpan, start / 2, z * spacing - halfSpan);
    mesh.scale.y = start;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.grid = { x: x + 1, z: z + 1 };
    scene.add(mesh);
    bars.push({ mesh, current: start, start, target });
  }
}

const axisMaterial = new THREE.LineBasicMaterial({ color: 0xb7c3d6 });
const axes = new THREE.Group();
const xAxisPoints = [new THREE.Vector3(-halfSpan - 0.7, 0.06, halfSpan + 0.7), new THREE.Vector3(halfSpan + 0.9, 0.06, halfSpan + 0.7)];
const zAxisPoints = [new THREE.Vector3(-halfSpan - 0.7, 0.06, halfSpan + 0.7), new THREE.Vector3(-halfSpan - 0.7, 0.06, -halfSpan - 0.9)];
const yAxisPoints = [new THREE.Vector3(-halfSpan - 0.7, 0.06, halfSpan + 0.7), new THREE.Vector3(-halfSpan - 0.7, maxHeight + 0.55, halfSpan + 0.7)];
axes.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(xAxisPoints), axisMaterial));
axes.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(zAxisPoints), axisMaterial));
axes.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(yAxisPoints), axisMaterial));
scene.add(axes);

scene.add(makeLabel('X Category', new THREE.Vector3(0, 0.45, halfSpan + 1.25)));
scene.add(makeLabel('Z Category', new THREE.Vector3(-halfSpan - 1.25, 0.45, 0)));
scene.add(makeLabel('Height / Value', new THREE.Vector3(-halfSpan - 1.15, maxHeight + 0.75, halfSpan + 0.75)));

for (let index = 0; index < gridSize; index += 1) {
  const value = String(index + 1);
  scene.add(makeLabel(value, new THREE.Vector3(index * spacing - halfSpan, 0.18, halfSpan + 0.82), 'tick-label'));
  scene.add(makeLabel(value, new THREE.Vector3(-halfSpan - 0.82, 0.18, index * spacing - halfSpan), 'tick-label'));
}

for (const height of [2, 4, 6]) {
  scene.add(makeLabel(String(height), new THREE.Vector3(-halfSpan - 0.95, height, halfSpan + 0.55), 'tick-label'));
}

const title = document.createElement('div');
title.className = 'scene-title';
title.textContent = '6x6 Animated Height Grid';
app.appendChild(title);

const note = document.createElement('div');
note.className = 'scene-note';
note.textContent = 'Hover a bar to highlight it';
app.appendChild(note);

const style = document.createElement('style');
style.textContent = `
  .axis-label,
  .tick-label {
    color: #f5f7fb;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    text-shadow: 0 1px 5px #000, 0 0 2px #000;
    white-space: nowrap;
    user-select: none;
  }

  .axis-label {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0;
  }

  .tick-label {
    color: #d7deeb;
    font-size: 12px;
    font-weight: 600;
  }

  .scene-title,
  .scene-note {
    position: fixed;
    left: 18px;
    z-index: 2;
    color: #f5f7fb;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    text-shadow: 0 1px 8px #000;
    pointer-events: none;
    letter-spacing: 0;
  }

  .scene-title {
    top: 16px;
    font-size: 18px;
    font-weight: 800;
  }

  .scene-note {
    top: 44px;
    color: #cad4e6;
    font-size: 13px;
    font-weight: 600;
  }
`;
document.head.appendChild(style);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(10, 10);
let hovered: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> | null = null;

function setHovered(next: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> | null): void {
  if (hovered === next) {
    return;
  }

  if (hovered) {
    hovered.material.emissive.set(0x000000);
    hovered.material.color.copy(colorForHeight(hovered.scale.y));
  }

  hovered = next;

  if (hovered) {
    hovered.material.color.copy(hoverColor);
    hovered.material.emissive.set(0x333333);
  }
}

function refreshTargets(): void {
  for (const bar of bars) {
    bar.start = bar.current;
    bar.target = randomHeight();
  }
}

function updatePointer(event: PointerEvent): void {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

window.addEventListener('pointermove', updatePointer);
window.addEventListener('pointerleave', () => setHovered(null));

let lastTargetRefresh = 0;
const clock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);

  const elapsed = clock.getElapsedTime();
  if (elapsed - lastTargetRefresh > 3.5) {
    refreshTargets();
    lastTargetRefresh = elapsed;
  }

  const cycle = (elapsed - lastTargetRefresh) / 3.5;
  const ease = 0.5 - Math.cos(THREE.MathUtils.clamp(cycle, 0, 1) * Math.PI) * 0.5;

  for (const bar of bars) {
    const height = THREE.MathUtils.lerp(bar.start, bar.target, ease);
    bar.current = height;
    bar.mesh.scale.y = height;
    bar.mesh.position.y = height / 2;
    if (bar.mesh !== hovered) {
      bar.mesh.material.color.copy(colorForHeight(height));
      bar.mesh.material.emissive.set(0x000000);
    }
  }

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(bars.map((bar) => bar.mesh), false);
  setHovered(hits.length > 0 ? (hits[0].object as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>) : null);

  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
