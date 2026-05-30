import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

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
scene.background = new THREE.Color(0x17191f);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 2.6, 8.4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
app.appendChild(renderer.domElement);

const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.75, 0);
controls.minDistance = 4;
controls.maxDistance = 13;
controls.maxPolarAngle = Math.PI * 0.48;
controls.update();

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(18, 10),
  new THREE.MeshStandardMaterial({
    color: 0x2a2d34,
    roughness: 0.52,
    metalness: 0.05,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.92;
floor.receiveShadow = true;
scene.add(floor);

const backWall = new THREE.Mesh(
  new THREE.PlaneGeometry(18, 6),
  new THREE.MeshStandardMaterial({
    color: 0x20242d,
    roughness: 0.42,
    metalness: 0.02,
  }),
);
backWall.position.set(0, 2.05, -3.6);
backWall.receiveShadow = true;
scene.add(backWall);

const sideWall = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 6),
  new THREE.MeshStandardMaterial({
    color: 0x292d35,
    roughness: 0.45,
    metalness: 0.03,
  }),
);
sideWall.rotation.y = Math.PI / 2;
sideWall.position.set(-6.5, 2.05, 0);
sideWall.receiveShadow = true;
scene.add(sideWall);

const stripeMaterial = new THREE.MeshStandardMaterial({
  color: 0x7e8797,
  roughness: 0.32,
  metalness: 0.0,
});

for (let i = 0; i < 7; i += 1) {
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.045, 2.1, 0.03), stripeMaterial);
  stripe.position.set(-5.3 + i * 1.75, 2.15, -3.56);
  scene.add(stripe);
}

const keyLight = new THREE.RectAreaLight(0xffffff, 7, 4.4, 2.2);
keyLight.position.set(-3.6, 4.2, 2.6);
keyLight.lookAt(0, 0, 0);
scene.add(keyLight);

const fillLight = new THREE.RectAreaLight(0x8fb6ff, 2.4, 3.4, 2.0);
fillLight.position.set(4.5, 2.8, 2.1);
fillLight.lookAt(0, 0.3, 0);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 1.8);
rimLight.position.set(2.5, 5.5, -4.5);
rimLight.castShadow = true;
rimLight.shadow.mapSize.set(2048, 2048);
rimLight.shadow.camera.near = 1;
rimLight.shadow.camera.far = 14;
rimLight.shadow.camera.left = -7;
rimLight.shadow.camera.right = 7;
rimLight.shadow.camera.top = 5;
rimLight.shadow.camera.bottom = -5;
scene.add(rimLight);

const lightPanelMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.72,
});

const keyPanel = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2), lightPanelMaterial);
keyPanel.position.copy(keyLight.position);
keyPanel.lookAt(0, 0, 0);
scene.add(keyPanel);

const fillPanel = new THREE.Mesh(
  new THREE.PlaneGeometry(3.4, 2.0),
  new THREE.MeshBasicMaterial({ color: 0x8fb6ff, transparent: true, opacity: 0.36 }),
);
fillPanel.position.copy(fillLight.position);
fillPanel.lookAt(0, 0.3, 0);
scene.add(fillPanel);

const sphereGeometry = new THREE.SphereGeometry(0.72, 96, 64);
const glassMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xd9f6ff,
  roughness: 0.02,
  metalness: 0,
  transmission: 0.9,
  thickness: 0.55,
  ior: 1.45,
  transparent: true,
  opacity: 0.46,
  envMapIntensity: 1.65,
});

const materials: Array<{ name: string; material: THREE.Material; x: number }> = [
  {
    name: 'METAL',
    x: -4.2,
    material: new THREE.MeshPhysicalMaterial({
      color: 0xb8c2ce,
      metalness: 1,
      roughness: 0.16,
      envMapIntensity: 1.85,
    }),
  },
  {
    name: 'GLASS',
    x: -2.1,
    material: glassMaterial,
  },
  {
    name: 'RUBBER',
    x: 0,
    material: new THREE.MeshStandardMaterial({
      color: 0x111216,
      metalness: 0,
      roughness: 0.92,
      envMapIntensity: 0.25,
    }),
  },
  {
    name: 'EMISSIVE',
    x: 2.1,
    material: new THREE.MeshStandardMaterial({
      color: 0x261117,
      roughness: 0.42,
      emissive: 0xff345d,
      emissiveIntensity: 2.7,
    }),
  },
  {
    name: 'CLEARCOAT',
    x: 4.2,
    material: new THREE.MeshPhysicalMaterial({
      color: 0x1a58a8,
      metalness: 0,
      roughness: 0.34,
      clearcoat: 1,
      clearcoatRoughness: 0.035,
      envMapIntensity: 1.55,
    }),
  },
];

const spheres: THREE.Mesh[] = [];

materials.forEach(({ name, material, x }) => {
  const sphere = new THREE.Mesh(sphereGeometry, material);
  sphere.position.set(x, 0, 0);
  sphere.castShadow = true;
  sphere.receiveShadow = true;
  scene.add(sphere);
  spheres.push(sphere);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.82, 0.9, 0.18, 72),
    new THREE.MeshStandardMaterial({
      color: 0x343843,
      roughness: 0.48,
      metalness: 0.18,
    }),
  );
  base.position.set(x, -0.82, 0);
  base.castShadow = true;
  base.receiveShadow = true;
  scene.add(base);

  const labelCanvas = makeLabelCanvas(name);
  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  labelTexture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 0.28),
    new THREE.MeshBasicMaterial({
      map: labelTexture,
      transparent: true,
      depthWrite: false,
    }),
  );
  label.position.set(x, -1.05, 0.82);
  label.rotation.x = -0.72;
  scene.add(label);
});

const reflectionBarMaterial = new THREE.MeshBasicMaterial({ color: 0xf4f7ff });
for (const x of [-4.2, -2.1, 0, 2.1, 4.2]) {
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.035, 0.035), reflectionBarMaterial);
  bar.position.set(x, 1.1, -2.6);
  scene.add(bar);
}

function makeLabelCanvas(text: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return canvas;
  }

  ctx.fillStyle = 'rgba(18, 20, 25, 0.72)';
  roundRect(ctx, 8, 12, 496, 104, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#f3f6fa';
  ctx.font = '700 38px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 66);

  return canvas;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function resize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', resize);

renderer.setAnimationLoop((time) => {
  const seconds = time * 0.001;

  spheres.forEach((sphere, index) => {
    sphere.rotation.y = seconds * (0.16 + index * 0.025);
  });

  controls.update();
  renderer.render(scene, camera);
});
