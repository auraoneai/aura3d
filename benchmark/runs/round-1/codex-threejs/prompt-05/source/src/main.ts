import * as THREE from 'three';

type BarRecord = {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  xIndex: number;
  zIndex: number;
  currentHeight: number;
  targetHeight: number;
  phase: number;
};

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
    background: #0f172a;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  canvas {
    display: block;
  }

  .hud {
    position: fixed;
    left: 18px;
    top: 16px;
    color: #f8fafc;
    pointer-events: none;
    text-shadow: 0 1px 8px rgba(15, 23, 42, 0.65);
  }

  .hud h1 {
    margin: 0 0 6px;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0;
  }

  .hud p {
    margin: 0;
    font-size: 13px;
    color: #cbd5e1;
  }

  .readout {
    position: fixed;
    right: 18px;
    top: 16px;
    min-width: 156px;
    color: #f8fafc;
    background: rgba(15, 23, 42, 0.72);
    border: 1px solid rgba(148, 163, 184, 0.35);
    border-radius: 8px;
    padding: 10px 12px;
    pointer-events: none;
    backdrop-filter: blur(8px);
    font-size: 13px;
    line-height: 1.45;
  }

  .readout strong {
    display: block;
    margin-bottom: 2px;
    font-size: 14px;
  }
`;
document.head.appendChild(style);

const hud = document.createElement('div');
hud.className = 'hud';
hud.innerHTML = '<h1>6x6 Revenue Surface</h1><p>Height and color encode the same animated value.</p>';
app.appendChild(hud);

const readout = document.createElement('div');
readout.className = 'readout';
readout.innerHTML = '<strong>No bar selected</strong><span>Hover to inspect a cell.</span>';
app.appendChild(readout);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f172a);
scene.fog = new THREE.Fog(0x0f172a, 18, 34);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const target = new THREE.Vector3(0, 2.1, 0);
const orbit = {
  radius: 15,
  theta: Math.PI * 0.24,
  phi: Math.PI * 0.32,
  dragging: false,
  lastX: 0,
  lastY: 0,
};

function updateCamera(): void {
  const sinPhi = Math.sin(orbit.phi);
  camera.position.set(
    target.x + orbit.radius * sinPhi * Math.sin(orbit.theta),
    target.y + orbit.radius * Math.cos(orbit.phi),
    target.z + orbit.radius * sinPhi * Math.cos(orbit.theta),
  );
  camera.lookAt(target);
}

updateCamera();

const ambient = new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 1.6);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.7);
keyLight.position.set(6, 12, 8);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -10;
keyLight.shadow.camera.right = 10;
keyLight.shadow.camera.top = 10;
keyLight.shadow.camera.bottom = -10;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.8);
fillLight.position.set(-8, 5, -6);
scene.add(fillLight);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(12.8, 12.8),
  new THREE.MeshStandardMaterial({ color: 0x18213a, roughness: 0.88, metalness: 0.05 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(12, 12, 0x94a3b8, 0x334155);
grid.position.y = 0.01;
scene.add(grid);

const axisGroup = new THREE.Group();
scene.add(axisGroup);

function makeAxisLine(start: THREE.Vector3, end: THREE.Vector3, color: number): void {
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  axisGroup.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color })));
}

makeAxisLine(new THREE.Vector3(-5.7, 0.04, -5.7), new THREE.Vector3(6.25, 0.04, -5.7), 0x38bdf8);
makeAxisLine(new THREE.Vector3(-5.7, 0.04, -5.7), new THREE.Vector3(-5.7, 0.04, 6.25), 0xf97316);
makeAxisLine(new THREE.Vector3(-5.7, 0.04, -5.7), new THREE.Vector3(-5.7, 6.4, -5.7), 0xa3e635);

function makeLabel(text: string, color: string, size = 1): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D context unavailable');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(15, 23, 42, 0.76)';
  context.roundRect(18, 24, 476, 108, 18);
  context.fill();
  context.strokeStyle = 'rgba(226, 232, 240, 0.72)';
  context.lineWidth = 4;
  context.stroke();
  context.font = '700 54px Inter, Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = color;
  context.fillText(text, 256, 80);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(2.75 * size, 0.86 * size, 1);
  return sprite;
}

const xLabel = makeLabel('X Axis', '#7dd3fc');
xLabel.position.set(5.45, 0.68, -5.25);
scene.add(xLabel);

const zLabel = makeLabel('Z Axis', '#fdba74');
zLabel.position.set(-5.25, 0.68, 5.45);
scene.add(zLabel);

const yLabel = makeLabel('Height', '#bef264', 1.05);
yLabel.position.set(-5.3, 5.85, -5.3);
scene.add(yLabel);

const barGeometry = new THREE.BoxGeometry(0.82, 1, 0.82);
const bars: BarRecord[] = [];
const raycastTargets: Array<THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>> = [];
const color = new THREE.Color();
const highlightColor = new THREE.Color(0xffffff);
const maxHeight = 5.8;
let hovered: BarRecord | undefined;

function randomHeight(xIndex: number, zIndex: number): number {
  const base = 0.7 + Math.random() * 4.8;
  const ridge = Math.sin((xIndex + 1) * 0.8) * Math.cos((zIndex + 1) * 0.55) * 0.8;
  return THREE.MathUtils.clamp(base + ridge, 0.45, maxHeight);
}

function applyHeightColor(material: THREE.MeshStandardMaterial, height: number, isHovered: boolean): void {
  const t = THREE.MathUtils.clamp(height / maxHeight, 0, 1);
  color.setHSL(0.62 - t * 0.47, 0.82, 0.48 + t * 0.12);
  material.color.copy(isHovered ? highlightColor : color);
  material.emissive.set(isHovered ? 0xf8fafc : 0x000000);
  material.emissiveIntensity = isHovered ? 0.34 : 0;
}

for (let z = 0; z < 6; z += 1) {
  for (let x = 0; x < 6; x += 1) {
    const material = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.54,
      metalness: 0.12,
    });
    const mesh = new THREE.Mesh(barGeometry, material);
    const currentHeight = randomHeight(x, z);
    mesh.position.set((x - 2.5) * 1.58, currentHeight / 2, (z - 2.5) * 1.58);
    mesh.scale.y = currentHeight;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const record = {
      mesh,
      xIndex: x + 1,
      zIndex: z + 1,
      currentHeight,
      targetHeight: randomHeight(x, z),
      phase: Math.random() * Math.PI * 2,
    };
    mesh.userData.record = record;
    applyHeightColor(material, currentHeight, false);
    bars.push(record);
    raycastTargets.push(mesh);
  }
}

const mouse = new THREE.Vector2(2, 2);
const raycaster = new THREE.Raycaster();

function setHovered(next: BarRecord | undefined): void {
  if (hovered === next) {
    return;
  }

  if (hovered) {
    hovered.mesh.scale.x = 1;
    hovered.mesh.scale.z = 1;
    applyHeightColor(hovered.mesh.material, hovered.currentHeight, false);
  }

  hovered = next;

  if (hovered) {
    hovered.mesh.scale.x = 1.12;
    hovered.mesh.scale.z = 1.12;
    applyHeightColor(hovered.mesh.material, hovered.currentHeight, true);
    readout.innerHTML = `<strong>Cell X${hovered.xIndex} Z${hovered.zIndex}</strong><span>Height ${hovered.currentHeight.toFixed(2)}</span>`;
  } else {
    readout.innerHTML = '<strong>No bar selected</strong><span>Hover to inspect a cell.</span>';
  }
}

function updatePointer(clientX: number, clientY: number): void {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
}

renderer.domElement.addEventListener('pointermove', (event) => {
  updatePointer(event.clientX, event.clientY);

  if (!orbit.dragging) {
    return;
  }

  const dx = event.clientX - orbit.lastX;
  const dy = event.clientY - orbit.lastY;
  orbit.theta -= dx * 0.006;
  orbit.phi = THREE.MathUtils.clamp(orbit.phi + dy * 0.005, 0.24, Math.PI * 0.47);
  orbit.lastX = event.clientX;
  orbit.lastY = event.clientY;
  updateCamera();
});

renderer.domElement.addEventListener('pointerdown', (event) => {
  orbit.dragging = true;
  orbit.lastX = event.clientX;
  orbit.lastY = event.clientY;
  renderer.domElement.setPointerCapture(event.pointerId);
});

renderer.domElement.addEventListener('pointerup', (event) => {
  orbit.dragging = false;
  renderer.domElement.releasePointerCapture(event.pointerId);
});

renderer.domElement.addEventListener('pointerleave', () => {
  orbit.dragging = false;
  mouse.set(2, 2);
  setHovered(undefined);
});

renderer.domElement.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    orbit.radius = THREE.MathUtils.clamp(orbit.radius + event.deltaY * 0.01, 9, 24);
    updateCamera();
  },
  { passive: false },
);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let nextRetarget = 0;

function animate(timeMs: number): void {
  const time = timeMs * 0.001;

  if (time > nextRetarget) {
    bars.forEach((bar) => {
      bar.targetHeight = randomHeight(bar.xIndex - 1, bar.zIndex - 1);
    });
    nextRetarget = time + 2.4;
  }

  bars.forEach((bar) => {
    const wobble = Math.sin(time * 1.4 + bar.phase) * 0.05;
    bar.currentHeight = THREE.MathUtils.lerp(bar.currentHeight, bar.targetHeight + wobble, 0.035);
    bar.mesh.scale.y = Math.max(0.25, bar.currentHeight);
    bar.mesh.position.y = bar.mesh.scale.y / 2;
    applyHeightColor(bar.mesh.material, bar.currentHeight, hovered === bar);
  });

  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(raycastTargets, false)[0];
  setHovered(hit?.object.userData.record as BarRecord | undefined);

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
