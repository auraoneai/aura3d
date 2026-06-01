import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root not found');
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15171a);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 2.2, 8.4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

const environment = new RoomEnvironment(renderer);
const pmremGenerator = new THREE.PMREMGenerator(renderer);
const environmentMap = pmremGenerator.fromScene(environment, 0.04).texture;
scene.environment = environmentMap;
environment.dispose();

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.7, 0);
controls.minDistance = 4;
controls.maxDistance = 14;
controls.maxPolarAngle = Math.PI * 0.49;

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(13, 7),
  new THREE.MeshStandardMaterial({
    color: 0x7d8288,
    roughness: 0.58,
    metalness: 0.0,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.03;
floor.receiveShadow = true;
scene.add(floor);

const backWall = new THREE.Mesh(
  new THREE.PlaneGeometry(13, 5),
  new THREE.MeshStandardMaterial({
    color: 0x2e3338,
    roughness: 0.72,
  }),
);
backWall.position.set(0, 1.5, -2.9);
backWall.receiveShadow = true;
scene.add(backWall);

const keyLight = new THREE.RectAreaLight(0xffffff, 7.5, 4.5, 3.2);
keyLight.position.set(-2.8, 4.2, 3.2);
keyLight.lookAt(0, 0, 0);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xd9ebff, 2.0);
rimLight.position.set(3.7, 4.8, -2.2);
rimLight.castShadow = true;
rimLight.shadow.mapSize.set(2048, 2048);
rimLight.shadow.camera.near = 0.5;
rimLight.shadow.camera.far = 12;
rimLight.shadow.camera.left = -6;
rimLight.shadow.camera.right = 6;
rimLight.shadow.camera.top = 5;
rimLight.shadow.camera.bottom = -4;
scene.add(rimLight);

const fillLight = new THREE.HemisphereLight(0xbfd7ff, 0x3f3930, 1.0);
scene.add(fillLight);

const sphereGeometry = new THREE.SphereGeometry(0.68, 96, 64);
const emissiveMaterial = new THREE.MeshStandardMaterial({
  color: 0x101114,
  emissive: 0xff7a18,
  emissiveIntensity: 3.0,
  roughness: 0.28,
});

const materials: Array<{ name: string; x: number; material: THREE.Material }> = [
  {
    name: 'Metal',
    x: -4,
    material: new THREE.MeshStandardMaterial({
      color: 0xc7c9cc,
      metalness: 1.0,
      roughness: 0.18,
      envMapIntensity: 1.45,
    }),
  },
  {
    name: 'Glass',
    x: -2,
    material: new THREE.MeshPhysicalMaterial({
      color: 0xb9ecff,
      metalness: 0,
      roughness: 0.02,
      transmission: 0.78,
      transparent: true,
      opacity: 0.42,
      ior: 1.5,
      thickness: 0.75,
      envMapIntensity: 1.9,
    }),
  },
  {
    name: 'Rubber',
    x: 0,
    material: new THREE.MeshStandardMaterial({
      color: 0x111111,
      metalness: 0,
      roughness: 0.92,
      envMapIntensity: 0.18,
    }),
  },
  {
    name: 'Emissive',
    x: 2,
    material: emissiveMaterial,
  },
  {
    name: 'Clearcoat',
    x: 4,
    material: new THREE.MeshPhysicalMaterial({
      color: 0x2f6fe4,
      metalness: 0,
      roughness: 0.36,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.5,
    }),
  },
];

const labelMaterial = new THREE.MeshBasicMaterial({ color: 0xf4f4ef });
const labelBackMaterial = new THREE.MeshBasicMaterial({ color: 0x050607 });

function makeTextSprite(text: string): THREE.Group {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D context not available');
  }

  context.fillStyle = '#f4f4ef';
  context.font = '600 42px system-ui, -apple-system, Segoe UI, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(1.18, 0.3, 1);

  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.34), labelBackMaterial);
  plaque.position.z = -0.01;

  const group = new THREE.Group();
  group.add(plaque, sprite);
  return group;
}

for (const { name, x, material } of materials) {
  const sphere = new THREE.Mesh(sphereGeometry, material);
  sphere.position.set(x, 0, 0);
  sphere.castShadow = true;
  sphere.receiveShadow = true;
  scene.add(sphere);

  const label = makeTextSprite(name);
  label.position.set(x, -0.95, 0.08);
  scene.add(label);
}

const glow = new THREE.PointLight(0xff8b2a, 2.4, 4.5);
glow.position.set(2, 0.25, 0.75);
scene.add(glow);

const reflectionStrips = new THREE.Group();
const stripMaterial = labelMaterial.clone();
stripMaterial.color.set(0xf0f5ff);
for (const [x, y, z, width] of [
  [-4.2, 2.75, -2.86, 1.2],
  [-0.8, 3.1, -2.85, 2.0],
  [3.1, 2.55, -2.84, 1.45],
] as const) {
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.12), stripMaterial);
  strip.position.set(x, y, z);
  reflectionStrips.add(strip);
}
scene.add(reflectionStrips);

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', resize);

renderer.setAnimationLoop((time) => {
  const seconds = time * 0.001;
  glow.intensity = 2.2 + Math.sin(seconds * 1.8) * 0.25;
  controls.update();
  renderer.render(scene, camera);
});
