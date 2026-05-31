import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app element');
}

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.background = '#17191d';
app.style.width = '100vw';
app.style.height = '100vh';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x17191d);
scene.fog = new THREE.Fog(0x17191d, 11, 24);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 4.0, 10.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1.0, 0);
controls.minDistance = 5;
controls.maxDistance = 17;
controls.maxPolarAngle = Math.PI * 0.48;

const floorMaterial = new THREE.MeshStandardMaterial({
  color: 0x8d9298,
  roughness: 0.54,
  metalness: 0.0,
});

const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 12), floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const backdrop = new THREE.Mesh(
  new THREE.PlaneGeometry(18, 9),
  new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.68 }),
);
backdrop.position.set(0, 4.5, -5.15);
backdrop.receiveShadow = true;
scene.add(backdrop);

const addSoftbox = (position: THREE.Vector3Tuple, rotation: THREE.Euler, color: number, intensity: number) => {
  const light = new THREE.RectAreaLight(color, intensity, 4.2, 2.3);
  light.position.fromArray(position);
  light.rotation.copy(rotation);
  scene.add(light);

  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 2.3),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.34 }),
  );
  panel.position.fromArray(position);
  panel.rotation.copy(rotation);
  scene.add(panel);
};

addSoftbox([-4.7, 5.2, 2.4], new THREE.Euler(-0.8, -0.62, -0.12), 0xffffff, 6.4);
addSoftbox([4.7, 3.5, 1.8], new THREE.Euler(-0.65, 0.68, 0.1), 0xbfd8ff, 3.2);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
keyLight.position.set(-4, 6, 4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -8;
keyLight.shadow.camera.right = 8;
keyLight.shadow.camera.top = 8;
keyLight.shadow.camera.bottom = -8;
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 18;
scene.add(keyLight);

scene.add(new THREE.HemisphereLight(0xb8c8ff, 0x303030, 1.25));

const sphereGeometry = new THREE.SphereGeometry(0.92, 96, 64);
const materials: Array<{ name: string; x: number; material: THREE.Material; labelColor: string }> = [
  {
    name: 'Metal',
    x: -4.8,
    labelColor: '#d4dde7',
    material: new THREE.MeshStandardMaterial({
      color: 0xb9c4cf,
      metalness: 1,
      roughness: 0.18,
      envMapIntensity: 1.45,
    }),
  },
  {
    name: 'Glass',
    x: -2.4,
    labelColor: '#d7f6ff',
    material: new THREE.MeshPhysicalMaterial({
      color: 0xcdefff,
      metalness: 0,
      roughness: 0.03,
      transmission: 0.86,
      thickness: 0.7,
      ior: 1.48,
      transparent: true,
      opacity: 0.38,
      envMapIntensity: 1.6,
    }),
  },
  {
    name: 'Rubber',
    x: 0,
    labelColor: '#ccd0d2',
    material: new THREE.MeshStandardMaterial({
      color: 0x111215,
      metalness: 0,
      roughness: 0.92,
      envMapIntensity: 0.25,
    }),
  },
  {
    name: 'Emissive',
    x: 2.4,
    labelColor: '#ffe4a6',
    material: new THREE.MeshStandardMaterial({
      color: 0xff7b25,
      emissive: 0xff5d13,
      emissiveIntensity: 1.8,
      roughness: 0.32,
      metalness: 0,
    }),
  },
  {
    name: 'Clearcoat',
    x: 4.8,
    labelColor: '#ffd4e2',
    material: new THREE.MeshPhysicalMaterial({
      color: 0x8d1238,
      metalness: 0.05,
      roughness: 0.36,
      clearcoat: 1,
      clearcoatRoughness: 0.045,
      envMapIntensity: 1.35,
    }),
  },
];

const fontCanvas = document.createElement('canvas');
fontCanvas.width = 512;
fontCanvas.height = 128;
const fontContext = fontCanvas.getContext('2d');

const createLabel = (text: string, color: string) => {
  if (!fontContext) {
    return new THREE.Mesh();
  }

  fontContext.clearRect(0, 0, fontCanvas.width, fontCanvas.height);
  fontContext.fillStyle = 'rgba(12, 14, 18, 0.72)';
  fontContext.fillRect(0, 0, fontCanvas.width, fontCanvas.height);
  fontContext.font = '600 46px system-ui, -apple-system, Segoe UI, sans-serif';
  fontContext.textAlign = 'center';
  fontContext.textBaseline = 'middle';
  fontContext.fillStyle = color;
  fontContext.fillText(text, fontCanvas.width / 2, fontCanvas.height / 2 + 2);

  const texture = new THREE.CanvasTexture(fontCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 0.42),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
  );
  label.rotation.x = -Math.PI * 0.28;
  label.position.y = 0.04;
  label.position.z = 1.16;
  return label;
};

const spheres: THREE.Mesh[] = [];

for (const sample of materials) {
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(1.08, 1.16, 0.22, 64),
    new THREE.MeshStandardMaterial({ color: 0x555b62, roughness: 0.46, metalness: 0.16 }),
  );
  pedestal.position.set(sample.x, 0.11, 0);
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  scene.add(pedestal);

  const sphere = new THREE.Mesh(sphereGeometry, sample.material);
  sphere.position.set(sample.x, 1.18, 0);
  sphere.castShadow = true;
  sphere.receiveShadow = true;
  scene.add(sphere);
  spheres.push(sphere);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(1.18, 0.018, 10, 96),
    new THREE.MeshBasicMaterial({ color: sample.labelColor }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.set(sample.x, 0.25, 0);
  scene.add(rim);

  const label = createLabel(sample.name, sample.labelColor);
  label.position.x = sample.x;
  scene.add(label);
}

const reflectionStrips = new THREE.Group();
for (let index = 0; index < 7; index += 1) {
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.035, 0.035),
    new THREE.MeshBasicMaterial({ color: index % 2 === 0 ? 0xffffff : 0x9db7d6 }),
  );
  strip.position.set(-5.4 + index * 1.8, 3.25 + Math.sin(index) * 0.18, -5.08);
  reflectionStrips.add(strip);
}
scene.add(reflectionStrips);

const resize = () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
};

window.addEventListener('resize', resize);

renderer.setAnimationLoop((time) => {
  const seconds = time * 0.001;

  for (const [index, sphere] of spheres.entries()) {
    sphere.rotation.y = seconds * (0.26 + index * 0.035);
    sphere.rotation.x = Math.sin(seconds * 0.45 + index) * 0.05;
  }

  controls.update();
  renderer.render(scene, camera);
});
