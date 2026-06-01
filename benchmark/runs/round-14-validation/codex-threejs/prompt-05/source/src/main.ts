import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app container');
}

const style = document.createElement('style');
style.textContent = `
  html,
  body,
  #app {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: #f6f8fb;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .scene-label {
    color: #182033;
    font-size: 13px;
    font-weight: 700;
    line-height: 1;
    padding: 4px 7px;
    border: 1px solid rgba(24, 32, 51, 0.2);
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.9);
    box-shadow: 0 2px 8px rgba(24, 32, 51, 0.12);
    white-space: nowrap;
    user-select: none;
    pointer-events: none;
  }

  .tick-label {
    color: #354055;
    font-size: 11px;
    font-weight: 650;
    padding: 2px 5px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.82);
    white-space: nowrap;
    user-select: none;
    pointer-events: none;
  }

  .hud {
    position: fixed;
    left: 16px;
    top: 16px;
    z-index: 2;
    color: #111827;
    font-size: 13px;
    font-weight: 650;
    padding: 8px 10px;
    border: 1px solid rgba(17, 24, 39, 0.16);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.88);
    box-shadow: 0 8px 24px rgba(17, 24, 39, 0.12);
  }
`;
document.head.append(style);

const hud = document.createElement('div');
hud.className = 'hud';
hud.textContent = '6x6 animated height grid';
app.append(hud);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf6f8fb);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(8.5, 8, 10.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.append(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.position = 'fixed';
labelRenderer.domElement.style.inset = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
app.append(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1.8, 0);
controls.minDistance = 7;
controls.maxDistance = 22;
controls.maxPolarAngle = Math.PI * 0.48;

const ambientLight = new THREE.HemisphereLight(0xffffff, 0xd5dde8, 2.2);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
keyLight.position.set(6, 10, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 30;
keyLight.shadow.camera.left = -10;
keyLight.shadow.camera.right = 10;
keyLight.shadow.camera.top = 10;
keyLight.shadow.camera.bottom = -10;
scene.add(keyLight);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(9, 9),
  new THREE.MeshStandardMaterial({ color: 0xe8edf4, roughness: 0.72, metalness: 0.02 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(8.4, 6, 0x8390a3, 0xc2cad6);
grid.position.y = 0.012;
scene.add(grid);

const axisMaterialX = new THREE.LineBasicMaterial({ color: 0x1d4ed8 });
const axisMaterialZ = new THREE.LineBasicMaterial({ color: 0x047857 });
const axisMaterialY = new THREE.LineBasicMaterial({ color: 0xb45309 });

function makeLine(points: THREE.Vector3[], material: THREE.LineBasicMaterial) {
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
}

scene.add(makeLine([new THREE.Vector3(-4.25, 0.04, -4.25), new THREE.Vector3(4.45, 0.04, -4.25)], axisMaterialX));
scene.add(makeLine([new THREE.Vector3(-4.25, 0.04, -4.25), new THREE.Vector3(-4.25, 0.04, 4.45)], axisMaterialZ));
scene.add(makeLine([new THREE.Vector3(-4.25, 0.04, -4.25), new THREE.Vector3(-4.25, 5.2, -4.25)], axisMaterialY));

type BarDatum = {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  baseHeight: number;
  targetHeight: number;
  previousHeight: number;
  phaseOffset: number;
};

const bars: BarDatum[] = [];
const barGeometry = new THREE.BoxGeometry(0.76, 1, 0.76);
const gridSize = 6;
const spacing = 1.28;
const offset = ((gridSize - 1) * spacing) / 2;
const minHeight = 0.45;
const maxHeight = 4.9;
let hovered: BarDatum | null = null;

function seededHeight(x: number, z: number) {
  const wave = Math.sin(x * 2.17 + z * 1.31) * 0.5 + 0.5;
  const ridge = Math.cos((x - z) * 0.9) * 0.5 + 0.5;
  return minHeight + (maxHeight - minHeight) * (0.2 + 0.8 * ((wave * 0.65) + (ridge * 0.35)));
}

function heightColor(height: number) {
  const t = THREE.MathUtils.clamp((height - minHeight) / (maxHeight - minHeight), 0, 1);
  const color = new THREE.Color();
  color.setHSL(0.61 - t * 0.58, 0.82, 0.44 + t * 0.1);
  return color;
}

for (let x = 0; x < gridSize; x += 1) {
  for (let z = 0; z < gridSize; z += 1) {
    const height = seededHeight(x, z);
    const material = new THREE.MeshStandardMaterial({
      color: heightColor(height),
      roughness: 0.46,
      metalness: 0.08,
      emissive: new THREE.Color(0x000000),
    });
    const mesh = new THREE.Mesh(barGeometry, material);
    mesh.position.set(x * spacing - offset, height / 2, z * spacing - offset);
    mesh.scale.y = height;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    bars.push({
      mesh,
      baseHeight: height,
      targetHeight: seededHeight(z + 2, x + 3),
      previousHeight: height,
      phaseOffset: (x * 11 + z * 7) * 0.19,
    });
  }
}

function makeLabel(text: string, className: string, position: THREE.Vector3) {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
  const label = new CSS2DObject(element);
  label.position.copy(position);
  scene.add(label);
  return label;
}

makeLabel('X category', 'scene-label', new THREE.Vector3(4.9, 0.18, -4.25));
makeLabel('Z category', 'scene-label', new THREE.Vector3(-4.25, 0.18, 4.95));
makeLabel('Height', 'scene-label', new THREE.Vector3(-4.25, 5.55, -4.25));

for (let i = 0; i < gridSize; i += 1) {
  const coordinate = i * spacing - offset;
  makeLabel(`X${i + 1}`, 'tick-label', new THREE.Vector3(coordinate, 0.12, -4.72));
  makeLabel(`Z${i + 1}`, 'tick-label', new THREE.Vector3(-4.72, 0.12, coordinate));
}

for (let i = 1; i <= 5; i += 1) {
  makeLabel(String(i), 'tick-label', new THREE.Vector3(-4.55, i, -4.25));
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(10, 10);

function onPointerMove(event: PointerEvent) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
}

function onPointerLeave() {
  pointer.set(10, 10);
}

renderer.domElement.addEventListener('pointermove', onPointerMove);
renderer.domElement.addEventListener('pointerleave', onPointerLeave);

function updateHover() {
  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObjects(bars.map((bar) => bar.mesh), false);
  const nextHovered = intersections.length > 0
    ? bars.find((bar) => bar.mesh === intersections[0].object) ?? null
    : null;

  if (nextHovered === hovered) {
    return;
  }

  if (hovered) {
    hovered.mesh.material.emissive.setHex(0x000000);
    hovered.mesh.material.opacity = 1;
    hovered.mesh.material.transparent = false;
  }

  hovered = nextHovered;

  if (hovered) {
    hovered.mesh.material.emissive.setHex(0xffffff);
    hovered.mesh.material.emissiveIntensity = 0.25;
    hud.textContent = `Hover: height ${hovered.mesh.scale.y.toFixed(2)}`;
  } else {
    hud.textContent = '6x6 animated height grid';
  }
}

function resize() {
  const width = app.clientWidth;
  const height = app.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  labelRenderer.setSize(width, height);
}

window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();

function animate() {
  const elapsed = clock.getElapsedTime();
  const cycle = 3.2;

  bars.forEach((bar) => {
    const localTime = (elapsed + bar.phaseOffset) % cycle;
    const t = localTime / cycle;
    const eased = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
    const nextTarget = minHeight + (maxHeight - minHeight) * (0.5 + 0.5 * Math.sin(elapsed * 0.9 + bar.phaseOffset * 1.7));
    const height = THREE.MathUtils.lerp(bar.previousHeight, bar.targetHeight, eased);

    if (t > 0.985) {
      bar.previousHeight = bar.targetHeight;
      bar.targetHeight = THREE.MathUtils.lerp(nextTarget, bar.baseHeight, 0.18);
    }

    bar.mesh.scale.y = height;
    bar.mesh.position.y = height / 2;
    bar.mesh.material.color.copy(heightColor(height));
  });

  updateHover();
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
