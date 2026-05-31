import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type DataBar = {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  currentHeight: number;
  targetHeight: number;
  phase: number;
};

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app root element');
}

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.background = '#10151d';
app.style.width = '100vw';
app.style.height = '100vh';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10151d);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 120);
camera.position.set(8, 9, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.9, 0);
controls.enableDamping = true;
controls.minDistance = 7;
controls.maxDistance = 24;
controls.maxPolarAngle = Math.PI * 0.48;

const ambientLight = new THREE.HemisphereLight(0xbfd7ff, 0x1b2430, 2.2);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 3.5);
keyLight.position.set(4, 10, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x7fc8ff, 1.6);
fillLight.position.set(-8, 5, -4);
scene.add(fillLight);

const gridSize = 6;
const spacing = 1.15;
const barWidth = 0.72;
const maxHeight = 5.2;
const minHeight = 0.35;
const halfSpan = ((gridSize - 1) * spacing) / 2;
const bars: DataBar[] = [];
const barGeometry = new THREE.BoxGeometry(barWidth, 1, barWidth);
const pointer = new THREE.Vector2(10, 10);
const raycaster = new THREE.Raycaster();
const hoveredTint = new THREE.Color(0xffffff);
let hoveredBar: DataBar | null = null;

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(9.6, 9.6),
  new THREE.MeshStandardMaterial({ color: 0x18202b, roughness: 0.8, metalness: 0.05 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.015;
floor.receiveShadow = true;
scene.add(floor);

const gridHelper = new THREE.GridHelper(8.2, 12, 0x39556d, 0x283747);
gridHelper.position.y = 0.004;
scene.add(gridHelper);

function seededHeight(x: number, z: number): number {
  const wave = Math.sin(x * 1.72 + z * 0.65) * 0.5 + Math.cos(z * 1.35 - x * 0.4) * 0.5;
  const normalized = THREE.MathUtils.clamp(0.5 + wave * 0.34 + Math.random() * 0.28, 0, 1);
  return minHeight + normalized * (maxHeight - minHeight);
}

function colorForHeight(height: number): THREE.Color {
  const t = THREE.MathUtils.clamp((height - minHeight) / (maxHeight - minHeight), 0, 1);
  const color = new THREE.Color();
  color.setHSL(0.58 - t * 0.53, 0.82, 0.48 + t * 0.1);
  return color;
}

for (let x = 0; x < gridSize; x += 1) {
  for (let z = 0; z < gridSize; z += 1) {
    const height = seededHeight(x, z);
    const material = new THREE.MeshStandardMaterial({
      color: colorForHeight(height),
      roughness: 0.48,
      metalness: 0.12,
      emissive: 0x000000,
    });
    const mesh = new THREE.Mesh(barGeometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(x * spacing - halfSpan, height / 2, z * spacing - halfSpan);
    mesh.scale.y = height;
    scene.add(mesh);
    bars.push({ mesh, currentHeight: height, targetHeight: seededHeight(x + 1, z + 1), phase: Math.random() * 8 });
  }
}

function makeLabel(text: string, size = 128): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create label canvas');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = `700 ${size}px Arial, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  context.strokeStyle = 'rgba(8, 12, 18, 0.92)';
  context.lineWidth = 14;
  context.strokeText(text, canvas.width / 2, canvas.height / 2);
  context.fillStyle = '#f5fbff';
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.0, 0.75, 1);
  sprite.renderOrder = 10;
  return sprite;
}

const xLabel = makeLabel('X AXIS');
xLabel.position.set(0, 0.55, halfSpan + 1.6);
scene.add(xLabel);

const zLabel = makeLabel('Z AXIS');
zLabel.position.set(halfSpan + 1.75, 0.55, 0);
scene.add(zLabel);

const yLabel = makeLabel('HEIGHT', 104);
yLabel.position.set(-halfSpan - 1.35, maxHeight + 0.55, -halfSpan - 0.2);
yLabel.scale.set(1.75, 0.62, 1);
scene.add(yLabel);

for (let i = 0; i < gridSize; i += 1) {
  const xTick = makeLabel(String(i + 1), 116);
  xTick.position.set(i * spacing - halfSpan, 0.35, halfSpan + 0.75);
  xTick.scale.set(0.58, 0.24, 1);
  scene.add(xTick);

  const zTick = makeLabel(String(i + 1), 116);
  zTick.position.set(halfSpan + 0.75, 0.35, i * spacing - halfSpan);
  zTick.scale.set(0.58, 0.24, 1);
  scene.add(zTick);
}

const yAxisMaterial = new THREE.LineBasicMaterial({ color: 0xe8f2ff });
const yAxis = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-halfSpan - 0.7, 0, -halfSpan - 0.7),
    new THREE.Vector3(-halfSpan - 0.7, maxHeight + 0.25, -halfSpan - 0.7),
  ]),
  yAxisMaterial,
);
scene.add(yAxis);

const xAxis = new THREE.ArrowHelper(
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-halfSpan - 0.45, 0.05, halfSpan + 0.45),
  gridSize * spacing,
  0xe8f2ff,
  0.28,
  0.15,
);
scene.add(xAxis);

const zAxis = new THREE.ArrowHelper(
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(halfSpan + 0.45, 0.05, -halfSpan - 0.45),
  gridSize * spacing,
  0xe8f2ff,
  0.28,
  0.15,
);
scene.add(zAxis);

const note = document.createElement('div');
note.textContent = 'Hover a bar to highlight it';
note.style.position = 'fixed';
note.style.left = '18px';
note.style.bottom = '16px';
note.style.padding = '8px 10px';
note.style.border = '1px solid rgba(255,255,255,0.18)';
note.style.borderRadius = '6px';
note.style.color = '#f4f7fb';
note.style.background = 'rgba(10, 14, 20, 0.62)';
note.style.font = '13px/1.3 Arial, sans-serif';
note.style.pointerEvents = 'none';
app.appendChild(note);

function updatePointer(event: PointerEvent): void {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

renderer.domElement.addEventListener('pointermove', updatePointer);
renderer.domElement.addEventListener('pointerleave', () => {
  pointer.set(10, 10);
});

function resize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', resize);

let nextTargetTime = 0;
const clock = new THREE.Clock();

function animate(): void {
  const elapsed = clock.getElapsedTime();
  const delta = clock.getDelta();

  if (elapsed > nextTargetTime) {
    nextTargetTime = elapsed + 2.8;
    bars.forEach((bar, index) => {
      const x = index % gridSize;
      const z = Math.floor(index / gridSize);
      const n = Math.sin(elapsed * 0.9 + x * 1.1 + z * 0.75) * 0.5 + 0.5;
      const jitter = Math.random() * 0.35;
      bar.targetHeight = minHeight + THREE.MathUtils.clamp(n * 0.8 + jitter, 0.05, 1) * (maxHeight - minHeight);
    });
  }

  bars.forEach((bar) => {
    const pulse = Math.sin(elapsed * 1.8 + bar.phase) * 0.09;
    const desiredHeight = THREE.MathUtils.clamp(bar.targetHeight + pulse, minHeight, maxHeight);
    bar.currentHeight = THREE.MathUtils.damp(bar.currentHeight, desiredHeight, 3.2, delta);
    bar.mesh.scale.y = bar.currentHeight;
    bar.mesh.position.y = bar.currentHeight / 2;
    bar.mesh.material.color.copy(colorForHeight(bar.currentHeight));
    bar.mesh.material.emissive.setHex(0x000000);
  });

  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObjects(bars.map((bar) => bar.mesh), false);
  hoveredBar = intersections.length > 0 ? bars.find((bar) => bar.mesh === intersections[0].object) ?? null : null;

  if (hoveredBar) {
    hoveredBar.mesh.material.color.lerp(hoveredTint, 0.45);
    hoveredBar.mesh.material.emissive.setHex(0x223344);
  }

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
